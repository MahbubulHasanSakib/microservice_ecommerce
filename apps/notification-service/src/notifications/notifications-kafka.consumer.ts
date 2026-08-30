import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  INVENTORY_EVENTS,
  KAFKA_CONSUMER_GROUPS,
  KAFKA_TOPICS,
  KafkaConsumerService,
  ORDER_EVENTS,
  OrderCreatedEvent,
  PAYMENT_EVENTS,
  PaymentFailedEvent,
  PaymentSucceededEvent,
} from '@ecommerce/shared';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsKafkaConsumer implements OnModuleInit {
  private readonly logger = new Logger(NotificationsKafkaConsumer.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Register Kafka event streaming handlers
    this.kafkaConsumer.registerHandler<OrderCreatedEvent>(
      ORDER_EVENTS.ORDER_CREATED,
      async (event, metadata) => {
        this.logger.log(
          `[KAFKA STREAM] Received '${event.eventType}' for order ${event.key} (offset: ${metadata.offset}, partition: ${metadata.partition})`,
        );
        await this.notificationsService.processOrderCreated(event.data);
      },
    );

    this.kafkaConsumer.registerHandler<PaymentSucceededEvent>(
      PAYMENT_EVENTS.PAYMENT_SUCCEEDED,
      async (event, metadata) => {
        this.logger.log(
          `[KAFKA STREAM] Received '${event.eventType}' for order ${event.key} (offset: ${metadata.offset}, partition: ${metadata.partition})`,
        );
        await this.notificationsService.processPaymentSucceeded(event.data);
      },
    );

    this.kafkaConsumer.registerHandler<PaymentFailedEvent>(
      PAYMENT_EVENTS.PAYMENT_FAILED,
      async (event, metadata) => {
        this.logger.log(
          `[KAFKA STREAM] Received '${event.eventType}' for order ${event.key} (offset: ${metadata.offset}, partition: ${metadata.partition})`,
        );
        await this.notificationsService.processPaymentFailed(event.data);
      },
    );

    this.kafkaConsumer.registerHandler<any>(
      INVENTORY_EVENTS.INVENTORY_FAILED,
      async (event, metadata) => {
        this.logger.log(
          `[KAFKA STREAM] Received '${event.eventType}' for order ${event.key} (offset: ${metadata.offset}, partition: ${metadata.partition})`,
        );
        await this.notificationsService.processInventoryFailed(event.data);
      },
    );

    // Initialize the consumer group with multi-topic subscription
    try {
      await this.kafkaConsumer.initConsumer(
        KAFKA_CONSUMER_GROUPS.NOTIFICATION_GROUP,
        [
          KAFKA_TOPICS.ORDER_EVENTS,
          KAFKA_TOPICS.PAYMENT_EVENTS,
          KAFKA_TOPICS.INVENTORY_EVENTS,
        ],
      );
      this.logger.log('Notifications Kafka Consumer initialized and listening for event streams.');
    } catch (err) {
      this.logger.warn(
        `Notifications Kafka Consumer startup postponed (Kafka broker may be starting up): ${(err as Error).message}`,
      );
    }
  }
}
