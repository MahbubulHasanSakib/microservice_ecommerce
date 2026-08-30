import { Test, TestingModule } from '@nestjs/testing';
import {
  KAFKA_CONSUMER_GROUPS,
  KAFKA_TOPICS,
  KafkaConsumerService,
  KafkaEventEnvelope,
  KafkaMessageMetadata,
  ORDER_EVENTS,
  OrderStatus,
  PAYMENT_EVENTS,
  PaymentStatus,
} from '@ecommerce/shared';
import { InventoryKafkaConsumer } from '../src/inventory/inventory-kafka.consumer';
import { InventoryService } from '../src/inventory/inventory.service';

describe('InventoryKafkaConsumer', () => {
  let consumer: InventoryKafkaConsumer;
  let mockKafkaConsumerService: jest.Mocked<KafkaConsumerService>;
  let mockInventoryService: jest.Mocked<InventoryService>;
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

    mockInventoryService = {
      handleOrderCreated: jest.fn().mockResolvedValue(undefined),
      handlePaymentFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<InventoryService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryKafkaConsumer,
        { provide: KafkaConsumerService, useValue: mockKafkaConsumerService },
        { provide: InventoryService, useValue: mockInventoryService },
      ],
    }).compile();

    consumer = module.get<InventoryKafkaConsumer>(InventoryKafkaConsumer);
  });

  it('should initialize and subscribe to order and payment topics', async () => {
    await consumer.onModuleInit();

    expect(mockKafkaConsumerService.registerHandler).toHaveBeenCalledWith(
      ORDER_EVENTS.ORDER_CREATED,
      expect.any(Function),
    );
    expect(mockKafkaConsumerService.registerHandler).toHaveBeenCalledWith(
      PAYMENT_EVENTS.PAYMENT_FAILED,
      expect.any(Function),
    );
    expect(mockKafkaConsumerService.initConsumer).toHaveBeenCalledWith(
      KAFKA_CONSUMER_GROUPS.INVENTORY_GROUP,
      [KAFKA_TOPICS.ORDER_EVENTS, KAFKA_TOPICS.PAYMENT_EVENTS],
    );
  });

  it('should dispatch order.created Kafka stream event to handleOrderCreated', async () => {
    await consumer.onModuleInit();

    const orderHandler = registeredHandlers.get(ORDER_EVENTS.ORDER_CREATED);
    const mockEnvelope: KafkaEventEnvelope = {
      id: 'evt-ord-1',
      eventType: ORDER_EVENTS.ORDER_CREATED,
      source: 'order-service',
      specVersion: '1.0',
      key: 'ord-123',
      data: {
        orderId: 'ord-123',
        orderNumber: 'ORD-001',
        userId: 'user-1',
        totalAmount: 150,
        status: OrderStatus.PENDING,
        items: [{ productId: 'prod-1', productName: 'P1', unitPrice: 150, quantity: 1, subtotal: 150 }],
        createdAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    const mockMetadata: KafkaMessageMetadata = {
      topic: KAFKA_TOPICS.ORDER_EVENTS,
      partition: 0,
      offset: '10',
      key: 'ord-123',
      timestamp: new Date().toISOString(),
    };

    await orderHandler(mockEnvelope, mockMetadata);

    expect(mockInventoryService.handleOrderCreated).toHaveBeenCalledWith(mockEnvelope.data);
  });

  it('should dispatch payment.failed Kafka stream event to handlePaymentFailed (compensating action)', async () => {
    await consumer.onModuleInit();

    const paymentFailedHandler = registeredHandlers.get(PAYMENT_EVENTS.PAYMENT_FAILED);
    const mockEnvelope: KafkaEventEnvelope = {
      id: 'evt-pay-fail',
      eventType: PAYMENT_EVENTS.PAYMENT_FAILED,
      source: 'payment-service',
      specVersion: '1.0',
      key: 'ord-123',
      data: {
        paymentId: 'pay-1',
        orderId: 'ord-123',
        amount: 150,
        currency: 'USD',
        reason: 'Insufficient funds',
        status: PaymentStatus.FAILED,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    const mockMetadata: KafkaMessageMetadata = {
      topic: KAFKA_TOPICS.PAYMENT_EVENTS,
      partition: 1,
      offset: '25',
      key: 'ord-123',
      timestamp: new Date().toISOString(),
    };

    await paymentFailedHandler(mockEnvelope, mockMetadata);

    expect(mockInventoryService.handlePaymentFailed).toHaveBeenCalledWith(mockEnvelope.data);
  });
});
