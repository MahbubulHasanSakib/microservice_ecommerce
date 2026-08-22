import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  ORDER_EVENTS,
  OrderCreatedEvent,
  PAYMENT_EVENTS,
  PaymentFailedEvent,
  PaymentSucceededEvent,
} from '@ecommerce/shared';
import { NotificationsService } from './notifications.service';

@Controller()
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @EventPattern(ORDER_EVENTS.ORDER_CREATED)
  async handleOrderCreated(
    @Payload() data: OrderCreatedEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(
        `Received event '${ORDER_EVENTS.ORDER_CREATED}' for order ID: ${data?.orderId || 'unknown'}`,
      );

      await this.notificationsService.processOrderCreated(data);

      // Explicit manual acknowledgment (ACK)
      channel.ack(originalMsg);
      this.logger.debug(`Acknowledged message for order ${data?.orderNumber}`);
    } catch (error) {
      this.logger.error(
        `Failed to process event '${ORDER_EVENTS.ORDER_CREATED}': ${(error as Error).message}`,
        (error as Error).stack,
      );

      // Negative acknowledgment (NACK) - without requeue to route to DLQ if configured
      channel.nack(originalMsg, false, false);
    }
  }

  @EventPattern(PAYMENT_EVENTS.PAYMENT_SUCCEEDED)
  async handlePaymentSucceeded(
    @Payload() data: PaymentSucceededEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(
        `Received event '${PAYMENT_EVENTS.PAYMENT_SUCCEEDED}' for order ID: ${data?.orderId || 'unknown'}`,
      );

      await this.notificationsService.processPaymentSucceeded(data);

      channel.ack(originalMsg);
      this.logger.debug(`Acknowledged payment.succeeded message for order ${data?.orderNumber}`);
    } catch (error) {
      this.logger.error(
        `Failed to process event '${PAYMENT_EVENTS.PAYMENT_SUCCEEDED}': ${(error as Error).message}`,
        (error as Error).stack,
      );
      channel.nack(originalMsg, false, false);
    }
  }

  @EventPattern(PAYMENT_EVENTS.PAYMENT_FAILED)
  async handlePaymentFailed(
    @Payload() data: PaymentFailedEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(
        `Received event '${PAYMENT_EVENTS.PAYMENT_FAILED}' for order ID: ${data?.orderId || 'unknown'}`,
      );

      await this.notificationsService.processPaymentFailed(data);

      channel.ack(originalMsg);
      this.logger.debug(`Acknowledged payment.failed message for order ${data?.orderNumber}`);
    } catch (error) {
      this.logger.error(
        `Failed to process event '${PAYMENT_EVENTS.PAYMENT_FAILED}': ${(error as Error).message}`,
        (error as Error).stack,
      );
      channel.nack(originalMsg, false, false);
    }
  }
}
