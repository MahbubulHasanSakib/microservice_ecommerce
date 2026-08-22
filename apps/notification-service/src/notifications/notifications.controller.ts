import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { ORDER_EVENTS, OrderCreatedEvent } from '@ecommerce/shared';
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
}
