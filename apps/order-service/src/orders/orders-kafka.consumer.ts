import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  INVENTORY_EVENTS,
  InventoryReservationFailedEvent,
  KAFKA_CONSUMER_GROUPS,
  KAFKA_TOPICS,
  KafkaConsumerService,
  PAYMENT_EVENTS,
  PaymentFailedEvent,
  PaymentSucceededEvent,
} from '@ecommerce/shared';
import { OrdersService } from './orders.service';

@Injectable()
export class OrdersKafkaConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrdersKafkaConsumer.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly ordersService: OrdersService,
  ) {}

  async onModuleInit(): Promise<void> {
    // 1. Saga Final Step (Success): Payment Succeeded -> Confirm Order
    this.kafkaConsumer.registerHandler<PaymentSucceededEvent>(
      PAYMENT_EVENTS.PAYMENT_SUCCEEDED,
      async (event, metadata) => {
        this.logger.log(
          `[KAFKA SAGA] Received '${event.eventType}' for order ${event.key} (offset: ${metadata.offset}, partition: ${metadata.partition})`,
        );
        await this.ordersService.handlePaymentSucceeded(event.data);
      },
    );

    // 2. Saga Final Step (Failure): Payment Failed -> Cancel Order & Compensate Stock
    this.kafkaConsumer.registerHandler<PaymentFailedEvent>(
      PAYMENT_EVENTS.PAYMENT_FAILED,
      async (event, metadata) => {
        this.logger.warn(
          `[KAFKA SAGA] Received '${event.eventType}' for order ${event.key} (offset: ${metadata.offset}, partition: ${metadata.partition})`,
        );
        await this.ordersService.handlePaymentFailed(event.data);
      },
    );

    // 3. Saga Failure Step: Inventory Reservation Failed -> Cancel Order
    this.kafkaConsumer.registerHandler<InventoryReservationFailedEvent>(
      INVENTORY_EVENTS.INVENTORY_FAILED,
      async (event, metadata) => {
        this.logger.warn(
          `[KAFKA SAGA] Received '${event.eventType}' for order ${event.key} (offset: ${metadata.offset}, partition: ${metadata.partition})`,
        );
        await this.ordersService.handleInventoryReservationFailed(event.data);
      },
    );

    // Initialize the Order Consumer Group
    try {
      await this.kafkaConsumer.initConsumer(
        KAFKA_CONSUMER_GROUPS.ORDER_GROUP,
        [KAFKA_TOPICS.PAYMENT_EVENTS, KAFKA_TOPICS.INVENTORY_EVENTS],
      );
      this.logger.log('Orders Kafka Consumer initialized for Saga choreography.');
    } catch (err) {
      this.logger.warn(
        `Orders Kafka Consumer startup postponed (Kafka broker initializing): ${(err as Error).message}`,
      );
    }
  }
}
