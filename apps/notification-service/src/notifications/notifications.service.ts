import { Injectable, Logger } from '@nestjs/common';
import {
  OrderCreatedEvent,
  PaymentFailedEvent,
  PaymentSucceededEvent,
} from '@ecommerce/shared';
import { EmailService, EmailDispatchResult } from './email.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly emailService: EmailService) {}

  async processOrderCreated(event: OrderCreatedEvent): Promise<EmailDispatchResult> {
    this.logger.log(
      `Processing OrderCreatedEvent for orderNumber: ${event.orderNumber} (User: ${event.userId})`,
    );

    const emailOptions = this.emailService.formatOrderConfirmationEmail(event);
    const result = await this.emailService.sendEmail(emailOptions);

    this.logger.log(
      `Order confirmation notification successfully dispatched for order ${event.orderNumber}. Message ID: ${result.messageId}`,
    );

    return result;
  }

  async processPaymentSucceeded(event: PaymentSucceededEvent): Promise<EmailDispatchResult> {
    this.logger.log(
      `Processing PaymentSucceededEvent for order: ${event.orderNumber || event.orderId} (User: ${event.userId})`,
    );

    const emailOptions = this.emailService.formatPaymentSuccessEmail(event);
    const result = await this.emailService.sendEmail(emailOptions);

    this.logger.log(
      `Payment receipt notification dispatched for order ${event.orderNumber || event.orderId}. Message ID: ${result.messageId}`,
    );

    return result;
  }

  async processPaymentFailed(event: PaymentFailedEvent): Promise<EmailDispatchResult> {
    this.logger.log(
      `Processing PaymentFailedEvent for order: ${event.orderNumber || event.orderId} (User: ${event.userId})`,
    );

    const emailOptions = this.emailService.formatPaymentFailureEmail(event);
    const result = await this.emailService.sendEmail(emailOptions);

    this.logger.log(
      `Payment failure alert notification dispatched for order ${event.orderNumber || event.orderId}. Message ID: ${result.messageId}`,
    );

    return result;
  }

  async processInventoryFailed(event: {
    orderId: string;
    orderNumber?: string;
    userId: string;
    userEmail?: string;
    reason: string;
  }): Promise<EmailDispatchResult> {
    this.logger.log(
      `Processing InventoryFailedEvent for order: ${event.orderNumber || event.orderId} (User: ${event.userId})`,
    );

    const recipient = event.userEmail || `user-${event.userId}@ecommerce.local`;
    const result = await this.emailService.sendEmail({
      to: recipient,
      subject: `Order #${event.orderNumber || event.orderId} - Item Out of Stock`,
      html: `<h2>Order Notification</h2><p>Your order #${event.orderNumber || event.orderId} could not be completed because an item is currently out of stock (${event.reason}).</p>`,
      text: `Your order #${event.orderNumber || event.orderId} could not be completed because an item is currently out of stock (${event.reason}).`,
    });

    this.logger.log(
      `Inventory failure alert notification dispatched for order ${event.orderNumber || event.orderId}. Message ID: ${result.messageId}`,
    );

    return result;
  }
}
