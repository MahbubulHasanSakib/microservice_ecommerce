import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  INVENTORY_EVENTS,
  InventoryReservedEvent,
  KAFKA_CONSUMER_GROUPS,
  KAFKA_TOPICS,
  KafkaConsumerService,
} from '@ecommerce/shared';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentsKafkaConsumer implements OnModuleInit {
  private readonly logger = new Logger(PaymentsKafkaConsumer.name);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Saga Step 3: React to InventoryReservedEvent from Kafka stream to trigger payment processing
    this.kafkaConsumer.registerHandler<InventoryReservedEvent>(
      INVENTORY_EVENTS.INVENTORY_RESERVED,
      async (event, metadata) => {
        this.logger.log(
          `[KAFKA SAGA] Received '${event.eventType}' for order ${event.key} (offset: ${metadata.offset}, partition: ${metadata.partition})`,
        );

        await this.paymentsService.processPayment({
          orderId: event.data.orderId,
          orderNumber: event.data.orderNumber,
          userId: event.data.userId,
          userEmail: event.data.userEmail,
          amount: event.data.amount,
          currency: event.data.currency ?? 'USD',
          paymentMethod: 'CREDIT_CARD',
        });
      },
    );

    // Initialize the Payment Consumer Group
    try {
      await this.kafkaConsumer.initConsumer(
        KAFKA_CONSUMER_GROUPS.PAYMENT_GROUP,
        [KAFKA_TOPICS.INVENTORY_EVENTS],
      );
      this.logger.log('Payments Kafka Consumer initialized for Saga choreography.');
    } catch (err) {
      this.logger.warn(
        `Payments Kafka Consumer startup postponed (Kafka broker initializing): ${(err as Error).message}`,
      );
    }
  }
}
