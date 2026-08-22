import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { of } from 'rxjs';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentStatus, SERVICES } from '@ecommerce/shared';
import { Prisma } from '../prisma/client';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: {
    order: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let productClient: {
    send: jest.Mock;
  };
  let rmqClient: {
    emit: jest.Mock;
  };
  let paymentRmqClient: {
    emit: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      order: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prisma)),
    };

    productClient = {
      send: jest.fn(),
    };

    rmqClient = {
      emit: jest.fn(),
    };

    paymentRmqClient = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: SERVICES.PRODUCT_SERVICE,
          useValue: productClient,
        },
        {
          provide: SERVICES.RABBITMQ_SERVICE,
          useValue: rmqClient,
        },
        {
          provide: 'PAYMENT_RMQ_CLIENT',
          useValue: paymentRmqClient,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create order and line item snapshot atomically', async () => {
      productClient.send.mockImplementation((pattern) => {
        if (pattern === 'product.find_by_ids') {
          return of([
            {
              id: 'prod-1',
              name: 'Mechanical Keyboard',
              price: 120.0,
              stock: 10,
              isActive: true,
            },
          ]);
        }
        if (pattern === 'product.update_stock') {
          return of({ success: true });
        }
        return of(null);
      });

      const mockCreatedOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-12345',
        userId: 'user-1',
        status: 'PENDING',
        totalAmount: new Prisma.Decimal(240.0),
        shippingAddress: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            id: 'item-1',
            orderId: 'ord-1',
            productId: 'prod-1',
            productName: 'Mechanical Keyboard',
            unitPrice: new Prisma.Decimal(120.0),
            quantity: 2,
            subtotal: new Prisma.Decimal(240.0),
          },
        ],
      };

      prisma.order.create.mockResolvedValue(mockCreatedOrder);

      const result = await service.create({
        userId: 'user-1',
        items: [{ productId: 'prod-1', quantity: 2 }],
      });

      expect(result.id).toEqual('ord-1');
      expect(result.totalAmount).toEqual(240.0);
      expect(result.items[0].productName).toEqual('Mechanical Keyboard');
      expect(result.items[0].unitPrice).toEqual(120.0);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(rmqClient.emit).toHaveBeenCalledWith(
        'order.created',
        expect.objectContaining({
          orderId: 'ord-1',
          orderNumber: 'ORD-12345',
          userId: 'user-1',
          totalAmount: 240,
        }),
      );
      expect(paymentRmqClient.emit).toHaveBeenCalledWith(
        'order.created',
        expect.objectContaining({
          orderId: 'ord-1',
        }),
      );
    });

    it('should throw BadRequestException if stock is insufficient', async () => {
      productClient.send.mockReturnValue(
        of([
          {
            id: 'prod-1',
            name: 'Mechanical Keyboard',
            price: 120.0,
            stock: 1, // Only 1 in stock
            isActive: true,
          },
        ]),
      );

      await expect(
        service.create({
          userId: 'user-1',
          items: [{ productId: 'prod-1', quantity: 5 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException if order does not exist', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.findById('non-existing-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if userId does not match and not admin', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        orderNumber: 'ORD-123',
        userId: 'owner-user-id',
        status: 'PENDING',
        totalAmount: new Prisma.Decimal(100),
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.findById('ord-1', 'other-user-id', false)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('cancel', () => {
    it('should cancel order and restore product stock', async () => {
      const mockOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-123',
        userId: 'user-1',
        status: 'PENDING',
        totalAmount: new Prisma.Decimal(100),
        items: [
          {
            id: 'item-1',
            orderId: 'ord-1',
            productId: 'prod-1',
            productName: 'Item 1',
            unitPrice: new Prisma.Decimal(100),
            quantity: 1,
            subtotal: new Prisma.Decimal(100),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.order.findUnique
        .mockResolvedValueOnce(mockOrder)
        .mockResolvedValueOnce({ ...mockOrder, status: 'CANCELLED' });
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      productClient.send.mockReturnValue(of({ success: true }));

      const result = await service.cancel('ord-1', 'user-1', false);

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'ord-1', status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      expect(productClient.send).toHaveBeenCalled();
      expect(result.status).toEqual('CANCELLED');
    });

    it('should throw BadRequestException if order is not in PENDING status', async () => {
      prisma.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        userId: 'user-1',
        status: 'SHIPPED',
        items: [],
      });

      await expect(service.cancel('ord-1', 'user-1', false)).rejects.toThrow(BadRequestException);
    });
  });

  describe('Event Choreography Handlers', () => {
    it('should transition order from PENDING to CONFIRMED on payment.succeeded', async () => {
      const mockOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-100',
        userId: 'user-1',
        status: 'PENDING',
        totalAmount: new Prisma.Decimal(100),
        items: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.order.update.mockResolvedValue({ ...mockOrder, status: 'CONFIRMED' });

      const result = await service.handlePaymentSucceeded({
        paymentId: 'pay-1',
        orderId: 'ord-1',
        orderNumber: 'ORD-100',
        userId: 'user-1',
        amount: 100,
        currency: 'USD',
        transactionId: 'TXN-123',
        status: PaymentStatus.COMPLETED,
        timestamp: new Date(),
      });

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'ord-1' },
        data: { status: 'CONFIRMED' },
        include: { items: true },
      });
      expect(result?.status).toBe('CONFIRMED');
    });

    it('should mark order CANCELLED and restore stock on payment.failed', async () => {
      const mockOrder = {
        id: 'ord-1',
        orderNumber: 'ORD-100',
        userId: 'user-1',
        status: 'PENDING',
        totalAmount: new Prisma.Decimal(100),
        items: [
          {
            id: 'item-1',
            orderId: 'ord-1',
            productId: 'prod-1',
            productName: 'Item 1',
            unitPrice: new Prisma.Decimal(100),
            quantity: 2,
            subtotal: new Prisma.Decimal(200),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.order.update.mockResolvedValue({ ...mockOrder, status: 'CANCELLED' });
      productClient.send.mockReturnValue(of({ success: true }));

      const result = await service.handlePaymentFailed({
        paymentId: 'pay-fail',
        orderId: 'ord-1',
        userId: 'user-1',
        amount: 100,
        currency: 'USD',
        reason: 'Card declined',
        status: PaymentStatus.FAILED,
        timestamp: new Date(),
      });

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'ord-1' },
        data: { status: 'CANCELLED' },
        include: { items: true },
      });
      expect(productClient.send).toHaveBeenCalledWith('product.update_stock', {
        productId: 'prod-1',
        quantityDelta: 2,
      });
      expect(result?.status).toBe('CANCELLED');
    });
  });
});
