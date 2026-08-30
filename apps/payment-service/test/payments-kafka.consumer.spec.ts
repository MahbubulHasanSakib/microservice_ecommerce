import { Test, TestingModule } from '@nestjs/testing';
import {
  INVENTORY_EVENTS,
  InventoryReservedEvent,
  KAFKA_CONSUMER_GROUPS,
  KAFKA_TOPICS,
  KafkaConsumerService,
  KafkaEventEnvelope,
  KafkaMessageHandler,
  KafkaMessageMetadata,
} from '@ecommerce/shared';
import { PaymentsKafkaConsumer } from '../src/payments/payments-kafka.consumer';
import { PaymentsService } from '../src/payments/payments.service';

describe('PaymentsKafkaConsumer', () => {
  let consumer: PaymentsKafkaConsumer;
  let mockKafkaConsumerService: jest.Mocked<KafkaConsumerService>;
  let mockPaymentsService: jest.Mocked<PaymentsService>;
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


    mockPaymentsService = {
      processPayment: jest.fn().mockResolvedValue({ id: 'pay-1', status: 'COMPLETED' }),
    } as unknown as jest.Mocked<PaymentsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsKafkaConsumer,
        { provide: KafkaConsumerService, useValue: mockKafkaConsumerService },
        { provide: PaymentsService, useValue: mockPaymentsService },
      ],
    }).compile();

    consumer = module.get<PaymentsKafkaConsumer>(PaymentsKafkaConsumer);
  });

  it('should initialize and subscribe to inventory events topic', async () => {
    await consumer.onModuleInit();

    expect(mockKafkaConsumerService.registerHandler).toHaveBeenCalledWith(
      INVENTORY_EVENTS.INVENTORY_RESERVED,
      expect.any(Function),
    );
    expect(mockKafkaConsumerService.initConsumer).toHaveBeenCalledWith(
      KAFKA_CONSUMER_GROUPS.PAYMENT_GROUP,
      [KAFKA_TOPICS.INVENTORY_EVENTS],
    );
  });

  it('should dispatch inventory.reserved event to processPayment', async () => {
    await consumer.onModuleInit();

    const reservedHandler = registeredHandlers.get(INVENTORY_EVENTS.INVENTORY_RESERVED);
    const mockEnvelope: KafkaEventEnvelope<InventoryReservedEvent> = {
      id: 'evt-inv-res',
      eventType: INVENTORY_EVENTS.INVENTORY_RESERVED,
      source: 'inventory-service',
      specVersion: '1.0',
      key: 'ord-123',
      data: {
        orderId: 'ord-123',
        orderNumber: 'ORD-101',
        userId: 'user-1',
        userEmail: 'user@example.com',
        amount: 250,
        currency: 'USD',
        items: [],
        reservedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    const mockMetadata: KafkaMessageMetadata = {
      topic: KAFKA_TOPICS.INVENTORY_EVENTS,
      partition: 0,
      offset: '50',
      key: 'ord-123',
      timestamp: new Date().toISOString(),
    };

    await reservedHandler!(mockEnvelope, mockMetadata);

    expect(mockPaymentsService.processPayment).toHaveBeenCalledWith({
      orderId: 'ord-123',
      orderNumber: 'ORD-101',
      userId: 'user-1',
      userEmail: 'user@example.com',
      amount: 250,
      currency: 'USD',
      paymentMethod: 'CREDIT_CARD',
    });
  });

});
