import { Injectable, Logger } from '@nestjs/common';
import { OrderCreatedEvent } from '@ecommerce/shared';
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
}
