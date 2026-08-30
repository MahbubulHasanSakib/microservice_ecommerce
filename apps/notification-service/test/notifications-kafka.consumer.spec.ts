import { Test, TestingModule } from '@nestjs/testing';
import {
  INVENTORY_EVENTS,
  KAFKA_CONSUMER_GROUPS,
  KAFKA_TOPICS,
  KafkaConsumerService,
  KafkaEventEnvelope,
  KafkaMessageHandler,
  KafkaMessageMetadata,
  ORDER_EVENTS,
  OrderStatus,
  PAYMENT_EVENTS,
  PaymentStatus,
} from '@ecommerce/shared';
import { NotificationsKafkaConsumer } from '../src/notifications/notifications-kafka.consumer';
import { NotificationsService } from '../src/notifications/notifications.service';

describe('NotificationsKafkaConsumer', () => {
  let kafkaConsumer: NotificationsKafkaConsumer;
  let mockKafkaConsumerService: jest.Mocked<KafkaConsumerService>;
  let mockNotificationsService: jest.Mocked<NotificationsService>;
  const registeredHandlers = new Map<string, KafkaMessageHandler>();

  beforeEach(async () => {
    registeredHandlers.clear();

    mockKafkaConsumerService = {
      initConsumer: jest.fn().mockResolvedValue(undefined),
      registerHandler: jest.fn().mockImplementation((pattern: string, handler: KafkaMessageHandler) => {
        registeredHandlers.set(pattern, handler);
      }),
      onModuleDestroy: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<KafkaConsumerService>;


    mockNotificationsService = {
      processOrderCreated: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
      processPaymentSucceeded: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-2' }),
      processPaymentFailed: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-3' }),
      processInventoryFailed: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-4' }),
    } as unknown as jest.Mocked<NotificationsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsKafkaConsumer,
        { provide: KafkaConsumerService, useValue: mockKafkaConsumerService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    kafkaConsumer = module.get<NotificationsKafkaConsumer>(NotificationsKafkaConsumer);
  });

  it('should initialize and subscribe to Kafka event topics with consumer group', async () => {
    await kafkaConsumer.onModuleInit();

    expect(mockKafkaConsumerService.registerHandler).toHaveBeenCalledWith(
      ORDER_EVENTS.ORDER_CREATED,
      expect.any(Function),
    );
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
      KAFKA_CONSUMER_GROUPS.NOTIFICATION_GROUP,
      [
        KAFKA_TOPICS.ORDER_EVENTS,
        KAFKA_TOPICS.PAYMENT_EVENTS,
        KAFKA_TOPICS.INVENTORY_EVENTS,
      ],
    );
  });

  it('should dispatch incoming Kafka order.created stream event to notificationsService', async () => {
    await kafkaConsumer.onModuleInit();

    const orderHandler = registeredHandlers.get(ORDER_EVENTS.ORDER_CREATED);
    expect(orderHandler).toBeDefined();

    const mockEnvelope: KafkaEventEnvelope = {
      id: 'evt-1',
      eventType: ORDER_EVENTS.ORDER_CREATED,
      source: 'order-service',
      specVersion: '1.0',
      key: 'ord-123',
      data: {
        orderId: 'ord-123',
        orderNumber: 'ORD-999',
        userId: 'user-1',
        totalAmount: 99.99,
        status: OrderStatus.PENDING,
        items: [],
        createdAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    const mockMetadata: KafkaMessageMetadata = {
      topic: KAFKA_TOPICS.ORDER_EVENTS,
      partition: 0,
      offset: '42',
      key: 'ord-123',
      timestamp: new Date().toISOString(),
    };

    await orderHandler!(mockEnvelope, mockMetadata);

    expect(mockNotificationsService.processOrderCreated).toHaveBeenCalledWith(mockEnvelope.data);
  });

  it('should dispatch incoming Kafka payment.succeeded stream event to notificationsService', async () => {
    await kafkaConsumer.onModuleInit();

    const paymentHandler = registeredHandlers.get(PAYMENT_EVENTS.PAYMENT_SUCCEEDED);
    expect(paymentHandler).toBeDefined();

    const mockEnvelope: KafkaEventEnvelope = {
      id: 'evt-2',
      eventType: PAYMENT_EVENTS.PAYMENT_SUCCEEDED,
      source: 'payment-service',
      specVersion: '1.0',
      key: 'ord-123',
      data: {
        paymentId: 'pay-1',
        orderId: 'ord-123',
        amount: 99.99,
        currency: 'USD',
        transactionId: 'TXN-1',
        status: PaymentStatus.COMPLETED,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    const mockMetadata: KafkaMessageMetadata = {
      topic: KAFKA_TOPICS.PAYMENT_EVENTS,
      partition: 1,
      offset: '108',
      key: 'ord-123',
      timestamp: new Date().toISOString(),
    };

    await paymentHandler!(mockEnvelope, mockMetadata);

    expect(mockNotificationsService.processPaymentSucceeded).toHaveBeenCalledWith(mockEnvelope.data);
  });
});

