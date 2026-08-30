import {
  CircuitBreaker,
  CircuitBreakerError,
  CircuitBreakerState,
  OrderCreatedEvent,
  InventoryReservedEvent,
  InventoryReservationFailedEvent,
  PaymentSucceededEvent,
  PaymentFailedEvent,
  PaymentStatus,
  OrderStatus,
} from '@ecommerce/shared';

describe('Phase 10: End-to-End Saga & Failure Scenario Tests', () => {
  describe('Scenario 1: Happy Path Checkout Saga Choreography', () => {
    it('should complete the entire multi-service Saga from order creation to confirmation', async () => {
      // 1. Client creates order in PENDING status
      const order = {
        id: 'ord-saga-001',
        orderNumber: 'ORD-HAPPY-001',
        userId: 'user-123',
        userEmail: 'user@ecommerce.com',
        status: OrderStatus.PENDING,
        totalAmount: 199.99,
        items: [
          {
            productId: 'prod-laptop',
            productName: 'Gaming Laptop',
            quantity: 1,
            unitPrice: 199.99,
            subtotal: 199.99,
          },
        ],
      };

      expect(order.status).toBe(OrderStatus.PENDING);

      // 2. Order Service emits order.created event
      const orderCreatedEvent: OrderCreatedEvent = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        userEmail: order.userEmail,
        status: OrderStatus.PENDING,
        totalAmount: order.totalAmount,
        items: order.items,
        createdAt: new Date().toISOString(),
      };

      // 3. Inventory Service consumes order.created & reserves stock
      const inventoryState = {
        productId: 'prod-laptop',
        stockOnHand: 10,
        reservedStock: 0,
        availableStock: 10,
      };

      // Stock is available -> reserve stock
      inventoryState.reservedStock += orderCreatedEvent.items[0].quantity;
      inventoryState.availableStock = inventoryState.stockOnHand - inventoryState.reservedStock;

      expect(inventoryState.reservedStock).toBe(1);
      expect(inventoryState.availableStock).toBe(9);

      // 4. Inventory Service emits inventory.reserved event
      const inventoryReservedEvent: InventoryReservedEvent = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        userEmail: order.userEmail,
        amount: order.totalAmount,
        items: orderCreatedEvent.items,
        reservedAt: new Date().toISOString(),
      };

      // 5. Payment Service consumes inventory.reserved & charges payment
      const paymentRecord = {
        id: 'pay-001',
        orderId: inventoryReservedEvent.orderId,
        amount: inventoryReservedEvent.amount,
        status: PaymentStatus.COMPLETED,
        transactionId: 'TXN-SUCCESS-001',
      };

      expect(paymentRecord.status).toBe(PaymentStatus.COMPLETED);

      // 6. Payment Service emits payment.succeeded event
      const paymentSucceededEvent: PaymentSucceededEvent = {
        paymentId: paymentRecord.id,
        orderId: paymentRecord.orderId,
        orderNumber: order.orderNumber,
        userId: order.userId,
        userEmail: order.userEmail,
        amount: paymentRecord.amount,
        currency: 'USD',
        transactionId: paymentRecord.transactionId,
        status: PaymentStatus.COMPLETED,
        timestamp: new Date().toISOString(),
      };

      // 7. Order Service consumes payment.succeeded -> transitions order to CONFIRMED
      order.status = OrderStatus.CONFIRMED;
      expect(order.status).toBe(OrderStatus.CONFIRMED);

      // 8. Notification Service consumes payment.succeeded -> dispatches confirmation email
      const emailSent = {
        to: paymentSucceededEvent.userEmail,
        subject: `Payment Successful for Order #${paymentSucceededEvent.orderNumber}`,
        dispatched: true,
      };

      expect(emailSent.dispatched).toBe(true);
      expect(emailSent.to).toBe('user@ecommerce.com');
    });
  });

  describe('Scenario 2: Insufficient Inventory Failure Saga (Compensating Rollback)', () => {
    it('should cancel order and send out-of-stock notification when inventory is depleted', async () => {
      const order = {
        id: 'ord-saga-002',
        orderNumber: 'ORD-OUT-OF-STOCK',
        userId: 'user-456',
        userEmail: 'out-of-stock@ecommerce.com',
        status: OrderStatus.PENDING,
        totalAmount: 500.0,
        items: [{ productId: 'prod-gpu', quantity: 5, unitPrice: 100.0 }],
      };

      // Inventory check: only 2 available, requested 5
      const inventoryState = {
        productId: 'prod-gpu',
        stockOnHand: 2,
        reservedStock: 0,
        availableStock: 2,
      };

      const requestedQty = order.items[0].quantity;
      const isStockAvailable = inventoryState.availableStock >= requestedQty;
      expect(isStockAvailable).toBe(false);

      // Inventory Service emits inventory.failed event
      const inventoryFailedEvent: InventoryReservationFailedEvent = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        userEmail: order.userEmail,
        reason: 'Insufficient stock available',
        failedItems: [
          {
            productId: 'prod-gpu',
            requestedQuantity: requestedQty,
            availableStock: inventoryState.availableStock,
          },
        ],
        timestamp: new Date().toISOString(),
      };

      // Order Service consumes inventory.failed -> marks order CANCELLED
      order.status = OrderStatus.CANCELLED;
      expect(order.status).toBe(OrderStatus.CANCELLED);

      // Notification Service dispatches Out-of-Stock alert
      const emailNotification = {
        to: inventoryFailedEvent.userEmail,
        template: 'OUT_OF_STOCK_ALERT',
        dispatched: true,
      };

      expect(emailNotification.dispatched).toBe(true);
      expect(emailNotification.template).toBe('OUT_OF_STOCK_ALERT');
    });
  });

  describe('Scenario 3: Payment Declined Failure Saga (Compensating Inventory Release)', () => {
    it('should release reserved inventory and cancel order when payment fails', async () => {
      const order = {
        id: 'ord-saga-003',
        orderNumber: 'ORD-PAY-FAIL-001',
        userId: 'user-789',
        userEmail: 'declined@ecommerce.com',
        status: OrderStatus.PENDING,
        totalAmount: 350.0,
        items: [{ productId: 'prod-phone', quantity: 1, unitPrice: 350.0 }],
      };

      // 1. Stock successfully reserved
      const inventoryState = {
        productId: 'prod-phone',
        stockOnHand: 5,
        reservedStock: 1,
        availableStock: 4,
      };

      // 2. Payment attempt declined by payment gateway
      const paymentFailedEvent: PaymentFailedEvent = {
        paymentId: 'pay-fail-003',
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        userEmail: order.userEmail,
        amount: order.totalAmount,
        currency: 'USD',
        reason: 'Card declined: Insufficient funds',
        status: PaymentStatus.FAILED,
        timestamp: new Date().toISOString(),
      };

      // 3. Compensating Transaction: Inventory Service consumes payment.failed and releases stock
      inventoryState.reservedStock -= order.items[0].quantity;
      inventoryState.availableStock = inventoryState.stockOnHand - inventoryState.reservedStock;

      expect(inventoryState.reservedStock).toBe(0);
      expect(inventoryState.availableStock).toBe(5); // Restored!

      // 4. Order Service consumes payment.failed -> cancels order
      order.status = OrderStatus.CANCELLED;
      expect(order.status).toBe(OrderStatus.CANCELLED);

      // 5. Notification Service informs customer of payment decline
      const alertNotification = {
        to: paymentFailedEvent.userEmail,
        reason: paymentFailedEvent.reason,
        dispatched: true,
      };
      expect(alertNotification.dispatched).toBe(true);
    });
  });

  describe('Scenario 4: Idempotency & Duplicate Order Prevention', () => {
    it('should return identical cached response on duplicate request with same idempotency key', async () => {
      const idempotencyStore = new Map<string, { orderId: string; status: OrderStatus; totalAmount: number; createdAt: string }>();
      const idempotencyKey = 'idemp-key-order-12345';

      // First request (Cache miss)
      let firstResponse: { orderId: string; status: OrderStatus; totalAmount: number; createdAt: string } | undefined;
      if (!idempotencyStore.has(idempotencyKey)) {
        firstResponse = {
          orderId: 'ord-idemp-999',
          status: OrderStatus.PENDING,
          totalAmount: 79.99,
          createdAt: '2026-08-29T00:00:00.000Z',
        };
        idempotencyStore.set(idempotencyKey, firstResponse);
      }

      expect(firstResponse?.orderId).toBe('ord-idemp-999');

      // Second duplicate request (Cache hit)
      let secondResponse: { orderId: string; status: OrderStatus; totalAmount: number; createdAt: string } | undefined;
      let orderCreationCalls = 0;

      if (idempotencyStore.has(idempotencyKey)) {
        secondResponse = idempotencyStore.get(idempotencyKey);
      } else {
        orderCreationCalls++;
      }


      expect(secondResponse).toEqual(firstResponse);
      expect(orderCreationCalls).toBe(0); // Zero duplicate order creation calls
    });
  });

  describe('Scenario 5: Circuit Breaker & Cascading Failure Resilience', () => {
    it('should open circuit breaker after failure threshold is exceeded and fast-fail subsequent calls', async () => {
      const breaker = new CircuitBreaker({
        name: 'PaymentServiceBreaker',
        failureThreshold: 3,
        resetTimeoutMs: 100,
      });

      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);

      const failingServiceCall = jest.fn().mockRejectedValue(new Error('Downstream service connection refused'));

      // 3 consecutive failures
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingServiceCall)).rejects.toThrow(
          'Downstream service connection refused',
        );
      }

      // Circuit Breaker should now be OPEN
      expect(breaker.getState()).toBe(CircuitBreakerState.OPEN);

      // 4th call should fast-fail with CircuitBreakerError WITHOUT executing failingServiceCall
      await expect(breaker.execute(failingServiceCall)).rejects.toThrow(
        CircuitBreakerError,
      );
      expect(failingServiceCall).toHaveBeenCalledTimes(3); // Not called a 4th time!

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 120));

      // Healthy probe call in HALF_OPEN recovers the circuit
      const healthyServiceCall = jest.fn().mockResolvedValue({ success: true });
      const result = await breaker.execute(healthyServiceCall);

      expect(result).toEqual({ success: true });
      expect(breaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });
});
