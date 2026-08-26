import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import {
  PAYMENT_EVENTS,
  PaymentStatus,
  SERVICES,
} from '@ecommerce/shared';
import { PaymentsService } from '../src/payments/payments.service';
import { PaymentsController } from '../src/payments/payments.controller';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Payment Service', () => {
  let service: PaymentsService;
  let controller: PaymentsController;
  let prisma: {
    payment: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let orderRmqClient: { emit: jest.Mock };
  let inventoryRmqClient: { emit: jest.Mock };
  let notificationRmqClient: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      payment: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    orderRmqClient = { emit: jest.fn() };
    inventoryRmqClient = { emit: jest.fn() };
    notificationRmqClient = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICES.ORDER_SERVICE, useValue: orderRmqClient },
        { provide: SERVICES.INVENTORY_SERVICE, useValue: inventoryRmqClient },
        { provide: SERVICES.NOTIFICATION_SERVICE, useValue: notificationRmqClient },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    controller = module.get<PaymentsController>(PaymentsController);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(controller).toBeDefined();
  });

  describe('processPayment', () => {
    it('should process a valid payment, persist COMPLETED record, and emit payment.succeeded', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      const mockCreatedPayment = {
        id: 'pay-1',
        orderId: 'ord-123',
        userId: 'user-1',
        amount: 99.5,
        currency: 'USD',
        status: 'COMPLETED',
        transactionId: 'TXN-ABC-123',
        paymentMethod: 'CREDIT_CARD',
        failureReason: null,
        refundTransactionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.payment.create.mockResolvedValue(mockCreatedPayment);

      const result = await service.processPayment({
        orderId: 'ord-123',
        orderNumber: 'ORD-100',
        userId: 'user-1',
        userEmail: 'customer@example.com',
        amount: 99.5,
      });

      expect(result.id).toBe('pay-1');
      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(orderRmqClient.emit).toHaveBeenCalledWith(
        PAYMENT_EVENTS.PAYMENT_SUCCEEDED,
        expect.objectContaining({
          orderId: 'ord-123',
          status: PaymentStatus.COMPLETED,
          amount: 99.5,
        }),
      );
      expect(notificationRmqClient.emit).toHaveBeenCalledWith(
        PAYMENT_EVENTS.PAYMENT_SUCCEEDED,
        expect.objectContaining({
          orderId: 'ord-123',
          userEmail: 'customer@example.com',
        }),
      );
    });

    it('should return existing payment when already processed (idempotency)', async () => {
      const existingPayment = {
        id: 'pay-1',
        orderId: 'ord-123',
        userId: 'user-1',
        amount: 99.5,
        currency: 'USD',
        status: 'COMPLETED',
        transactionId: 'TXN-ABC-123',
        paymentMethod: 'CREDIT_CARD',
        failureReason: null,
        refundTransactionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.payment.findUnique.mockResolvedValue(existingPayment);

      const result = await service.processPayment({
        orderId: 'ord-123',
        userId: 'user-1',
        amount: 99.5,
      });

      expect(result.id).toBe('pay-1');
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(orderRmqClient.emit).not.toHaveBeenCalled();
    });

    it('should record FAILED status and emit payment.failed when payment declines', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      const mockFailedPayment = {
        id: 'pay-failed-1',
        orderId: 'ord-decline',
        userId: 'user-1',
        amount: 9999,
        currency: 'USD',
        status: 'FAILED',
        transactionId: 'TXN-FAIL-1',
        paymentMethod: 'CREDIT_CARD',
        failureReason: 'Card declined by issuing bank (insufficient funds)',
        refundTransactionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.payment.create.mockResolvedValue(mockFailedPayment);

      const result = await service.processPayment({
        orderId: 'ord-decline',
        userId: 'user-1',
        amount: 9999, // Triggers simulated decline
      });

      expect(result.status).toBe(PaymentStatus.FAILED);
      expect(orderRmqClient.emit).toHaveBeenCalledWith(
        PAYMENT_EVENTS.PAYMENT_FAILED,
        expect.objectContaining({
          orderId: 'ord-decline',
          status: PaymentStatus.FAILED,
        }),
      );
      expect(notificationRmqClient.emit).toHaveBeenCalledWith(
        PAYMENT_EVENTS.PAYMENT_FAILED,
        expect.objectContaining({
          orderId: 'ord-decline',
        }),
      );
    });
  });

  describe('findByOrderId', () => {
    it('should return payment details for a valid orderId', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        orderId: 'ord-123',
        userId: 'user-1',
        amount: 50.0,
        currency: 'USD',
        status: 'COMPLETED',
        transactionId: 'TXN-1',
        paymentMethod: 'CREDIT_CARD',
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.findByOrderId('ord-123');
      expect(result.id).toBe('pay-1');
      expect(result.orderId).toBe('ord-123');
    });

    it('should throw NotFoundException if payment not found', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      await expect(service.findByOrderId('ord-nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('refundPayment', () => {
    it('should refund completed payment and emit payment.refunded', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        orderId: 'ord-123',
        userId: 'user-1',
        amount: 50.0,
        currency: 'USD',
        status: 'COMPLETED',
        transactionId: 'TXN-1',
        paymentMethod: 'CREDIT_CARD',
        failureReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      prisma.payment.update.mockResolvedValue({
        id: 'pay-1',
        orderId: 'ord-123',
        userId: 'user-1',
        amount: 50.0,
        currency: 'USD',
        status: 'REFUNDED',
        transactionId: 'TXN-1',
        paymentMethod: 'CREDIT_CARD',
        refundTransactionId: 'REF-TXN-123',
        failureReason: 'Customer request',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.refundPayment('ord-123', 'Customer request');
      expect(result.status).toBe(PaymentStatus.REFUNDED);
      expect(notificationRmqClient.emit).toHaveBeenCalledWith(
        PAYMENT_EVENTS.PAYMENT_REFUNDED,
        expect.objectContaining({ orderId: 'ord-123' }),
      );
    });

    it('should throw BadRequestException if payment is not COMPLETED', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        orderId: 'ord-123',
        status: 'FAILED',
      });

      await expect(service.refundPayment('ord-123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('PaymentsController Event Handling', () => {
    it('should handle inventory.reserved event, process payment, and manually ACK message', async () => {
      const mockEvent = {
        orderId: 'ord-100',
        orderNumber: 'ORD-100',
        userId: 'user-123',
        userEmail: 'test@example.com',
        amount: 150.0,
        currency: 'USD',
        items: [],
        reservedAt: new Date().toISOString(),
      };

      const mockChannel = {
        ack: jest.fn(),
        nack: jest.fn(),
      };
      const mockMsg = { properties: { messageId: 'msg-1' } };

      const mockContext = {
        getChannelRef: () => mockChannel,
        getMessage: () => mockMsg,
      } as unknown as RmqContext;

      jest.spyOn(service, 'processPayment').mockResolvedValue({
        id: 'pay-1',
        orderId: 'ord-100',
        userId: 'user-123',
        amount: 150.0,
        currency: 'USD',
        status: PaymentStatus.COMPLETED,
        transactionId: 'TXN-1',
        paymentMethod: 'CREDIT_CARD',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await controller.handleInventoryReserved(mockEvent, mockContext);

      expect(service.processPayment).toHaveBeenCalledWith({
        orderId: 'ord-100',
        orderNumber: 'ORD-100',
        userId: 'user-123',
        userEmail: 'test@example.com',
        amount: 150.0,
        currency: 'USD',
      });
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    });

    it('should NACK without requeue when payment process throws unexpected error', async () => {
      const mockEvent = {
        orderId: 'ord-err',
        orderNumber: 'ORD-ERR',
        userId: 'user-123',
        amount: 150.0,
        items: [],
        reservedAt: new Date().toISOString(),
      };

      const mockChannel = {
        ack: jest.fn(),
        nack: jest.fn(),
      };
      const mockMsg = { properties: { messageId: 'msg-err' } };

      const mockContext = {
        getChannelRef: () => mockChannel,
        getMessage: () => mockMsg,
      } as unknown as RmqContext;

      jest.spyOn(service, 'processPayment').mockRejectedValue(new Error('DB connection drop'));

      await controller.handleInventoryReserved(mockEvent, mockContext);

      expect(mockChannel.ack).not.toHaveBeenCalled();
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, false);
    });
  });
});
