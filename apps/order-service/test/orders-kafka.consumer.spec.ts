import { Test, TestingModule } from '@nestjs/testing';
import {
  INVENTORY_EVENTS,
  InventoryReservationFailedEvent,
  KAFKA_CONSUMER_GROUPS,
  KAFKA_TOPICS,
  KafkaConsumerService,
  KafkaEventEnvelope,
  KafkaMessageMetadata,
  PAYMENT_EVENTS,
  PaymentFailedEvent,
  PaymentStatus,
  PaymentSucceededEvent,
} from '@ecommerce/shared';
import { OrdersKafkaConsumer } from '../src/orders/orders-kafka.consumer';
import { OrdersService } from '../src/orders/orders.service';

describe('OrdersKafkaConsumer', () => {
  let consumer: OrdersKafkaConsumer;
  let mockKafkaConsumerService: jest.Mocked<KafkaConsumerService>;
  let mockOrdersService: jest.Mocked<OrdersService>;
  const registeredHandlers = new Map<string, any>();

  beforeEach(async () => {
    registeredHandlers.clear();

    mockKafkaConsumerService = {
      initConsumer: jest.fn().mockResolvedValue(undefined),
      registerHandler: jest.fn().mockImplementation((pattern: string, handler: any) => {
        registeredHandlers.set(pattern, handler);
      }),
      onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<KafkaConsumerService>;

    mockOrdersService = {
      handlePaymentSucceeded: jest.fn().mockResolvedValue({ id: 'ord-123', status: 'CONFIRMED' }),
      handlePaymentFailed: jest.fn().mockResolvedValue({ id: 'ord-123', status: 'CANCELLED' }),
      handleInventoryReservationFailed: jest.fn().mockResolvedValue({ id: 'ord-123', status: 'CANCELLED' }),
    } as unknown as jest.Mocked<OrdersService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersKafkaConsumer,
        { provide: KafkaConsumerService, useValue: mockKafkaConsumerService },
        { provide: OrdersService, useValue: mockOrdersService },
      ],
    }).compile();

    consumer = module.get<OrdersKafkaConsumer>(OrdersKafkaConsumer);
  });

  it('should initialize and subscribe to payment and inventory topics', async () => {
    await consumer.onModuleInit();

    expect(mockKafkaConsumerService.registerHandler).toHaveBeenCalledWith(
      PAYMENT_EVENTS.PAYMENT_SUCCEEDED,
      expect.any(Function),
    );
    expect(mockKafkaConsumerService.registerHandler).toHaveBeenCalledWith(
      PAYMENT_EVENTS.PAYMENT_FAILED,
      expect.any(Function),
    );
    expect(mockKafkaConsumerService.registerHandler).toHaveBeenCalledWith(
      INVENTORY_EVENTS.INVENTORY_FAILED,
      expect.any(Function),
    );
    expect(mockKafkaConsumerService.initConsumer).toHaveBeenCalledWith(
      KAFKA_CONSUMER_GROUPS.ORDER_GROUP,
      [KAFKA_TOPICS.PAYMENT_EVENTS, KAFKA_TOPICS.INVENTORY_EVENTS],
    );
  });

  it('should dispatch payment.succeeded event to handlePaymentSucceeded to confirm order', async () => {
    await consumer.onModuleInit();

    const paymentSucceededHandler = registeredHandlers.get(PAYMENT_EVENTS.PAYMENT_SUCCEEDED);
    const mockEnvelope: KafkaEventEnvelope<PaymentSucceededEvent> = {
      id: 'evt-pay-succ',
      eventType: PAYMENT_EVENTS.PAYMENT_SUCCEEDED,
      source: 'payment-service',
      specVersion: '1.0',
      key: 'ord-123',
      data: {
        paymentId: 'pay-1',
        orderId: 'ord-123',
        orderNumber: 'ORD-001',
        userId: 'user-1',
        amount: 299,
        currency: 'USD',
        transactionId: 'TXN-SUCCESS-1',
        status: PaymentStatus.COMPLETED,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    const mockMetadata: KafkaMessageMetadata = {
      topic: KAFKA_TOPICS.PAYMENT_EVENTS,
      partition: 0,
      offset: '120',
      key: 'ord-123',
      timestamp: new Date().toISOString(),
    };

    await paymentSucceededHandler(mockEnvelope, mockMetadata);

    expect(mockOrdersService.handlePaymentSucceeded).toHaveBeenCalledWith(mockEnvelope.data);
  });

  it('should dispatch payment.failed event to handlePaymentFailed to cancel order and compensate', async () => {
    await consumer.onModuleInit();

    const paymentFailedHandler = registeredHandlers.get(PAYMENT_EVENTS.PAYMENT_FAILED);
    const mockEnvelope: KafkaEventEnvelope<PaymentFailedEvent> = {
      id: 'evt-pay-fail',
      eventType: PAYMENT_EVENTS.PAYMENT_FAILED,
      source: 'payment-service',
      specVersion: '1.0',
      key: 'ord-123',
      data: {
        paymentId: 'pay-1',
        orderId: 'ord-123',
        orderNumber: 'ORD-001',
        userId: 'user-1',
        amount: 299,
        currency: 'USD',
        reason: 'Fraud suspected',
        status: PaymentStatus.FAILED,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    const mockMetadata: KafkaMessageMetadata = {
      topic: KAFKA_TOPICS.PAYMENT_EVENTS,
      partition: 0,
      offset: '121',
      key: 'ord-123',
      timestamp: new Date().toISOString(),
    };

    await paymentFailedHandler(mockEnvelope, mockMetadata);

    expect(mockOrdersService.handlePaymentFailed).toHaveBeenCalledWith(mockEnvelope.data);
  });

  it('should dispatch inventory.failed event to handleInventoryReservationFailed to cancel order', async () => {
    await consumer.onModuleInit();

    const inventoryFailedHandler = registeredHandlers.get(INVENTORY_EVENTS.INVENTORY_FAILED);
    const mockEnvelope: KafkaEventEnvelope<InventoryReservationFailedEvent> = {
      id: 'evt-inv-fail',
      eventType: INVENTORY_EVENTS.INVENTORY_FAILED,
      source: 'inventory-service',
      specVersion: '1.0',
      key: 'ord-123',
      data: {
        orderId: 'ord-123',
        orderNumber: 'ORD-001',
        userId: 'user-1',
        reason: 'Out of stock',
        failedItems: [],
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    const mockMetadata: KafkaMessageMetadata = {
      topic: KAFKA_TOPICS.INVENTORY_EVENTS,
      partition: 0,
      offset: '122',
      key: 'ord-123',
      timestamp: new Date().toISOString(),
    };

    await inventoryFailedHandler(mockEnvelope, mockMetadata);

    expect(mockOrdersService.handleInventoryReservationFailed).toHaveBeenCalledWith(mockEnvelope.data);
  });
});

