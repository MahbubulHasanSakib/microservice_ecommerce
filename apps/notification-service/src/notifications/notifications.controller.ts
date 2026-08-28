import { Controller, Logger, Optional } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  INVENTORY_EVENTS,
  InventoryReservationFailedEvent,
  ORDER_EVENTS,
  OrderCreatedEvent,
  PAYMENT_EVENTS,
  PaymentFailedEvent,
  PaymentSucceededEvent,
  runWithTraceContext,
  MetricsService,
} from '@ecommerce/shared';
import { NotificationsService } from './notifications.service';

@Controller()
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  @EventPattern(ORDER_EVENTS.ORDER_CREATED)
  async handleOrderCreated(
    @Payload() data: OrderCreatedEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    await runWithTraceContext(
      data,
      'consumer.order.created -> sendConfirmationEmail',
      async () => {
        try {
          this.logger.log(
            `Received event '${ORDER_EVENTS.ORDER_CREATED}' for order ID: ${data?.orderId || 'unknown'}`,
          );

          await this.notificationsService.processOrderCreated(data);

          this.metricsService?.rabbitmqEventsTotal.inc({
            event_name: ORDER_EVENTS.ORDER_CREATED,
            action: 'consumed',
            status: 'success',
          });

          // Explicit manual acknowledgment (ACK)
          channel.ack(originalMsg);
          this.logger.debug(`Acknowledged message for order ${data?.orderNumber}`);
        } catch (error) {
          this.metricsService?.rabbitmqEventsTotal.inc({
            event_name: ORDER_EVENTS.ORDER_CREATED,
            action: 'consumed',
            status: 'failure',
          });
          this.logger.error(
            `Failed to process event '${ORDER_EVENTS.ORDER_CREATED}': ${(error as Error).message}`,
            (error as Error).stack,
          );

          // Negative acknowledgment (NACK) - without requeue to route to DLQ if configured
          channel.nack(originalMsg, false, false);
        }
      },
    );
  }

  @EventPattern(PAYMENT_EVENTS.PAYMENT_SUCCEEDED)
  async handlePaymentSucceeded(
    @Payload() data: PaymentSucceededEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    await runWithTraceContext(
      data,
      'consumer.payment.succeeded -> sendReceiptEmail',
      async () => {
        try {
          this.logger.log(
            `Received event '${PAYMENT_EVENTS.PAYMENT_SUCCEEDED}' for order ID: ${data?.orderId || 'unknown'}`,
          );

          await this.notificationsService.processPaymentSucceeded(data);

          this.metricsService?.rabbitmqEventsTotal.inc({
            event_name: PAYMENT_EVENTS.PAYMENT_SUCCEEDED,
            action: 'consumed',
            status: 'success',
          });

          channel.ack(originalMsg);
          this.logger.debug(`Acknowledged payment.succeeded message for order ${data?.orderNumber}`);
        } catch (error) {
          this.metricsService?.rabbitmqEventsTotal.inc({
            event_name: PAYMENT_EVENTS.PAYMENT_SUCCEEDED,
            action: 'consumed',
            status: 'failure',
          });
          this.logger.error(
            `Failed to process event '${PAYMENT_EVENTS.PAYMENT_SUCCEEDED}': ${(error as Error).message}`,
            (error as Error).stack,
          );
          channel.nack(originalMsg, false, false);
        }
      },
    );
  }

  @EventPattern(PAYMENT_EVENTS.PAYMENT_FAILED)
  async handlePaymentFailed(
    @Payload() data: PaymentFailedEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    await runWithTraceContext(
      data,
      'consumer.payment.failed -> sendPaymentFailedEmail',
      async () => {
        try {
          this.logger.log(
            `Received event '${PAYMENT_EVENTS.PAYMENT_FAILED}' for order ID: ${data?.orderId || 'unknown'}`,
          );

          await this.notificationsService.processPaymentFailed(data);

          this.metricsService?.rabbitmqEventsTotal.inc({
            event_name: PAYMENT_EVENTS.PAYMENT_FAILED,
            action: 'consumed',
            status: 'success',
          });

          channel.ack(originalMsg);
          this.logger.debug(`Acknowledged payment.failed message for order ${data?.orderNumber}`);
        } catch (error) {
          this.metricsService?.rabbitmqEventsTotal.inc({
            event_name: PAYMENT_EVENTS.PAYMENT_FAILED,
            action: 'consumed',
            status: 'failure',
          });
          this.logger.error(
            `Failed to process event '${PAYMENT_EVENTS.PAYMENT_FAILED}': ${(error as Error).message}`,
            (error as Error).stack,
          );
          channel.nack(originalMsg, false, false);
        }
      },
    );
  }

  @EventPattern(INVENTORY_EVENTS.INVENTORY_FAILED)
  async handleInventoryFailed(
    @Payload() data: InventoryReservationFailedEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    await runWithTraceContext(
      data,
      'consumer.inventory.failed -> sendOutOfStockEmail',
      async () => {
        try {
          this.logger.log(
            `Received event '${INVENTORY_EVENTS.INVENTORY_FAILED}' for order ID: ${data?.orderId || 'unknown'}`,
          );

          await this.notificationsService.processInventoryFailed(data);

          this.metricsService?.rabbitmqEventsTotal.inc({
            event_name: INVENTORY_EVENTS.INVENTORY_FAILED,
            action: 'consumed',
            status: 'success',
          });

          channel.ack(originalMsg);
          this.logger.debug(`Acknowledged inventory.failed message for order ${data?.orderNumber}`);
        } catch (error) {
          this.metricsService?.rabbitmqEventsTotal.inc({
            event_name: INVENTORY_EVENTS.INVENTORY_FAILED,
            action: 'consumed',
            status: 'failure',
          });
          this.logger.error(
            `Failed to process event '${INVENTORY_EVENTS.INVENTORY_FAILED}': ${(error as Error).message}`,
            (error as Error).stack,
          );
          channel.nack(originalMsg, false, false);
        }
      },
    );
  }
}
