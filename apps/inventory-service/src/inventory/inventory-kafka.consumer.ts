import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  KAFKA_CONSUMER_GROUPS,
  KAFKA_TOPICS,
  KafkaConsumerService,
  ORDER_EVENTS,
  OrderCreatedEvent,
  PAYMENT_EVENTS,
  PaymentFailedEvent,
} from '@ecommerce/shared';
import { InventoryService } from './inventory.service';

@Injectable()
export class InventoryKafkaConsumer implements OnModuleInit {
  private readonly logger = new Logger(InventoryKafkaConsumer.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly inventoryService: InventoryService,
  ) {}

  async onModuleInit(): Promise<void> {
    // 1. Saga Step 2: React to OrderCreatedEvent from Kafka stream
    this.kafkaConsumer.registerHandler<OrderCreatedEvent>(
      ORDER_EVENTS.ORDER_CREATED,
      async (event, metadata) => {
        this.logger.log(
          `[KAFKA SAGA] Received '${event.eventType}' for order ${event.key} (offset: ${metadata.offset}, partition: ${metadata.partition})`,
        );
        await this.inventoryService.handleOrderCreated(event.data);
      },
    );

    // 2. Saga Compensating Action: React to PaymentFailedEvent from Kafka stream
    this.kafkaConsumer.registerHandler<PaymentFailedEvent>(
      PAYMENT_EVENTS.PAYMENT_FAILED,
      async (event, metadata) => {
        this.logger.warn(
          `[KAFKA SAGA COMPENSATION] Received '${event.eventType}' for order ${event.key} (offset: ${metadata.offset}, partition: ${metadata.partition})`,
        );
        await this.inventoryService.handlePaymentFailed(event.data);
      },
    );

    // Initialize the Inventory Consumer Group
    try {
      await this.kafkaConsumer.initConsumer(
        KAFKA_CONSUMER_GROUPS.INVENTORY_GROUP,
        [KAFKA_TOPICS.ORDER_EVENTS, KAFKA_TOPICS.PAYMENT_EVENTS],
      );
      this.logger.log('Inventory Kafka Consumer initialized for Saga choreography.');
    } catch (err) {
      this.logger.warn(
        `Inventory Kafka Consumer startup postponed (Kafka broker initializing): ${(err as Error).message}`,
      );
    }
  }
}
