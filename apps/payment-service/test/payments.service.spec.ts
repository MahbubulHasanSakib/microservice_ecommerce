import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  KafkaProducerService,
  PAYMENT_EVENTS,
  PaymentStatus,
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
  let kafkaProducer: { emitEvent: jest.Mock; emitBatch: jest.Mock };

  beforeEach(async () => {
    prisma = {
      payment: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    kafkaProducer = {
      emitEvent: jest.fn().mockResolvedValue([]),
      emitBatch: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: KafkaProducerService, useValue: kafkaProducer },
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
      expect(kafkaProducer.emitEvent).toHaveBeenCalledWith(
        expect.any(String),
        PAYMENT_EVENTS.PAYMENT_SUCCEEDED,
        'ord-123',
        expect.objectContaining({
          orderId: 'ord-123',
          status: PaymentStatus.COMPLETED,
          amount: 99.5,
        }),
        'payment-service',
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
      expect(kafkaProducer.emitEvent).not.toHaveBeenCalled();
    });

    it('should gracefully handle P2002 race condition on concurrent duplicate payment requests', async () => {
      const existingPayment = {
        id: 'pay-concurrent',
        orderId: 'ord-race-1',
        userId: 'user-1',
        amount: 99.5,
        currency: 'USD',
        status: 'COMPLETED',
        transactionId: 'TXN-RACE',
        paymentMethod: 'CREDIT_CARD',
        failureReason: null,
        refundTransactionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Initial check misses (null), but concurrent worker inserts first causing P2002 on create
      prisma.payment.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingPayment);

      const prismaUniqueError = new Error('Unique constraint failed on the fields: (orderId)');
      (prismaUniqueError as unknown as { code: string }).code = 'P2002';
      prisma.payment.create.mockRejectedValueOnce(prismaUniqueError);

      const result = await service.processPayment({
        orderId: 'ord-race-1',
        userId: 'user-1',
        amount: 99.5,
      });

      expect(result.id).toBe('pay-concurrent');
      expect(result.status).toBe(PaymentStatus.COMPLETED);
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
      expect(kafkaProducer.emitEvent).toHaveBeenCalledWith(
        expect.any(String),
        PAYMENT_EVENTS.PAYMENT_FAILED,
        'ord-decline',
        expect.objectContaining({
          orderId: 'ord-decline',
          status: PaymentStatus.FAILED,
        }),
        'payment-service',
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
      expect(kafkaProducer.emitEvent).toHaveBeenCalledWith(
        expect.any(String),
        PAYMENT_EVENTS.PAYMENT_REFUNDED,
        'ord-123',
        expect.objectContaining({ orderId: 'ord-123' }),
        'payment-service',
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
});

