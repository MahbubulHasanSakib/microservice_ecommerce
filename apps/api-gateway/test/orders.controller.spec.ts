import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { OrderStatus, Role, SERVICES } from '@ecommerce/shared';
import { OrdersController } from '../src/orders/orders.controller';

describe('Gateway OrdersController', () => {
  let controller: OrdersController;
  let orderClient: {
    send: jest.Mock;
  };

  beforeEach(async () => {
    orderClient = {
      send: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: SERVICES.ORDER_SERVICE,
          useValue: orderClient,
        },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should forward create order request with injected authenticated userId', async () => {
    const user = { userId: 'user-123', email: 'test@example.com', roles: [Role.CUSTOMER] };
    const createDto = {
      items: [{ productId: 'prod-1', quantity: 2 }],
    };

    const mockResponse = {
      id: 'ord-1',
      orderNumber: 'ORD-123',
      userId: 'user-123',
      status: OrderStatus.PENDING,
      totalAmount: 119.98,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    orderClient.send.mockReturnValue(of(mockResponse));

    const result = await controller.createOrder(user, createDto);
    expect(result.id).toBe('ord-1');
    expect(result.userId).toBe('user-123');
    expect(orderClient.send).toHaveBeenCalledWith('order.create', {
      userId: 'user-123',
      userEmail: 'test@example.com',
      items: createDto.items,
      shippingAddress: undefined,
    });
  });

  it('should trip circuit breaker and throw ServiceUnavailableException on repeated downstream failures', async () => {
    const user = { userId: 'user-123', email: 'test@example.com', roles: [Role.CUSTOMER] };
    const createDto = { items: [{ productId: 'prod-1', quantity: 1 }] };

    orderClient.send.mockReturnValue(throwError(() => new Error('Connection refused')));

    // Trigger 5 failures to reach default threshold
    for (let i = 0; i < 5; i++) {
      await expect(controller.createOrder(user, createDto)).rejects.toThrow('Connection refused');
    }

    // 6th call should fast-fail with ServiceUnavailableException because circuit is OPEN
    await expect(controller.createOrder(user, createDto)).rejects.toThrow(ServiceUnavailableException);
  });

  it('should forward get my orders query to Order Service', async () => {
    const user = { userId: 'user-123', email: 'test@example.com', roles: [Role.CUSTOMER] };
    const mockResponse = {
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 0, hasNextPage: false, hasPrevPage: false },
    };

    orderClient.send.mockReturnValue(of(mockResponse));

    const result = await controller.getMyOrders(user, { page: 1, limit: 10 });
    expect(result.data).toEqual([]);
    expect(orderClient.send).toHaveBeenCalled();
  });
});
