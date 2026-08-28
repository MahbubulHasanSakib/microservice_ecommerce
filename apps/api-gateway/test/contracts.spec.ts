import {
  OrderCreatedEvent,
  InventoryReservedEvent,
  InventoryReservationFailedEvent,
  InventoryReleasedEvent,
  PaymentSucceededEvent,
  PaymentFailedEvent,
  PaymentRefundedEvent,
  PaymentStatus,
  OrderStatus,
  injectTraceContext,
  extractTraceContext,
} from '@ecommerce/shared';

describe('Phase 10: Consumer Contract & Event Schema Tests', () => {
  describe('Order Domain Events Contracts', () => {
    it('should validate OrderCreatedEvent schema and structure', () => {
      const event: OrderCreatedEvent = {
        orderId: 'c1b48b68-8a8b-4ef9-bd5e-3982f1d93510',
        orderNumber: 'ORD-12345678-ABCD',
        userId: 'u9876543-210a-bcde-f012-3456789abcde',
        userEmail: 'customer@ecommerce.com',
        status: OrderStatus.PENDING,
        totalAmount: 240.0,
        items: [
          {
            productId: 'p1111111-2222-3333-4444-555555555555',
            productName: 'Mechanical Keyboard',
            unitPrice: 120.0,
            quantity: 2,
            subtotal: 240.0,
          },
        ],
        createdAt: new Date().toISOString(),
      };

      expect(event.orderId).toBeDefined();
      expect(event.status).toBe(OrderStatus.PENDING);
      expect(event.orderNumber).toMatch(/^ORD-[A-Za-z0-9]+-[A-Za-z0-9]+$/);
      expect(event.items.length).toBeGreaterThan(0);
      expect(event.items[0].subtotal).toBe(event.items[0].unitPrice * event.items[0].quantity);

      const injected = injectTraceContext(event);
      expect(injected.orderId).toBe(event.orderId);
      expect(injected.items).toEqual(event.items);
    });
  });

  describe('Inventory Domain Events Contracts', () => {
    it('should validate InventoryReservedEvent schema', () => {
      const event: InventoryReservedEvent = {
        orderId: 'c1b48b68-8a8b-4ef9-bd5e-3982f1d93510',
        orderNumber: 'ORD-12345678-ABCD',
        userId: 'u9876543-210a-bcde-f012-3456789abcde',
        userEmail: 'customer@ecommerce.com',
        amount: 240.0,
        items: [
          {
            productId: 'p1111111-2222-3333-4444-555555555555',
            productName: 'Mechanical Keyboard',
            unitPrice: 120.0,
            quantity: 2,
            subtotal: 240.0,
          },
        ],
        reservedAt: new Date().toISOString(),
      };

      expect(event.orderId).toBeDefined();
      expect(event.items.length).toBe(1);
      expect(event.items[0].quantity).toBe(2);
      expect(event.reservedAt).toBeDefined();
    });

    it('should validate InventoryReservationFailedEvent schema', () => {
      const failedEvent: InventoryReservationFailedEvent = {
        orderId: 'c1b48b68-8a8b-4ef9-bd5e-3982f1d93510',
        orderNumber: 'ORD-12345678-ABCD',
        userId: 'u9876543-210a-bcde-f012-3456789abcde',
        userEmail: 'customer@ecommerce.com',
        reason: 'Insufficient stock available',
        failedItems: [
          {
            productId: 'p1111111-2222-3333-4444-555555555555',
            requestedQuantity: 5,
            availableStock: 2,
          },
        ],
        timestamp: new Date().toISOString(),
      };

      expect(failedEvent.reason).toBe('Insufficient stock available');
      expect(failedEvent.failedItems[0].requestedQuantity).toBeGreaterThan(
        failedEvent.failedItems[0].availableStock,
      );
    });

    it('should validate InventoryReleasedEvent schema', () => {
      const releaseEvent: InventoryReleasedEvent = {
        orderId: 'c1b48b68-8a8b-4ef9-bd5e-3982f1d93510',
        orderNumber: 'ORD-12345678-ABCD',
        reason: 'Payment declined by bank',
        releasedItems: [
          {
            productId: 'p1111111-2222-3333-4444-555555555555',
            quantity: 2,
          },
        ],
        releasedAt: new Date().toISOString(),
      };

      expect(releaseEvent.reason).toBe('Payment declined by bank');
      expect(releaseEvent.releasedItems[0].quantity).toBe(2);
    });
  });

  describe('Payment Domain Events Contracts', () => {
    it('should validate PaymentSucceededEvent schema', () => {
      const succeededEvent: PaymentSucceededEvent = {
        paymentId: 'pay-99887766-5544-3322',
        orderId: 'c1b48b68-8a8b-4ef9-bd5e-3982f1d93510',
        orderNumber: 'ORD-12345678-ABCD',
        userId: 'u9876543-210a-bcde-f012-3456789abcde',
        userEmail: 'customer@ecommerce.com',
        amount: 249.99,
        currency: 'USD',
        transactionId: 'TXN-998877665544',
        status: PaymentStatus.COMPLETED,
        timestamp: new Date().toISOString(),
      };

      expect(succeededEvent.status).toBe(PaymentStatus.COMPLETED);
      expect(succeededEvent.transactionId).toMatch(/^TXN-/);
    });

    it('should validate PaymentFailedEvent schema', () => {
      const failedPaymentEvent: PaymentFailedEvent = {
        paymentId: 'pay-00000000-1111-2222',
        orderId: 'c1b48b68-8a8b-4ef9-bd5e-3982f1d93510',
        orderNumber: 'ORD-12345678-ABCD',
        userId: 'u9876543-210a-bcde-f012-3456789abcde',
        userEmail: 'customer@ecommerce.com',
        amount: 249.99,
        currency: 'USD',
        reason: 'Insufficient funds on credit card',
        status: PaymentStatus.FAILED,
        timestamp: new Date().toISOString(),
      };

      expect(failedPaymentEvent.status).toBe(PaymentStatus.FAILED);
      expect(failedPaymentEvent.reason).toBeDefined();
    });

    it('should validate PaymentRefundedEvent schema', () => {
      const refundEvent: PaymentRefundedEvent = {
        paymentId: 'pay-99887766-5544-3322',
        orderId: 'c1b48b68-8a8b-4ef9-bd5e-3982f1d93510',
        userId: 'u9876543-210a-bcde-f012-3456789abcde',
        amount: 249.99,
        currency: 'USD',
        refundTransactionId: 'REF-1724890000',
        status: PaymentStatus.REFUNDED,
        timestamp: new Date().toISOString(),
      };

      expect(refundEvent.status).toBe(PaymentStatus.REFUNDED);
      expect(refundEvent.refundTransactionId).toMatch(/^REF-/);
    });
  });

  describe('Event Context Propagation Invariant', () => {
    it('should correctly attach traceparent without mutating core payload attributes', () => {
      const rawPayload = {
        orderId: 'order-xyz',
        amount: 100,
        status: OrderStatus.PENDING,
      };

      const injected = injectTraceContext(rawPayload);
      expect(injected.orderId).toBe(rawPayload.orderId);
      expect(injected.amount).toBe(rawPayload.amount);
      expect(injected.status).toBe(rawPayload.status);

      const extracted = extractTraceContext(injected);
      expect(extracted).toBeDefined();
    });
  });
});
