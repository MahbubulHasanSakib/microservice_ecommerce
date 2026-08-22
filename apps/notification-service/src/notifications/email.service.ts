import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  OrderCreatedEvent,
  PaymentFailedEvent,
  PaymentSucceededEvent,
} from '@ecommerce/shared';

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailDispatchResult {
  messageId: string;
  from: string;
  recipient: string;
  subject: string;
  delivered: boolean;
  timestamp: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly isConfigured: boolean = false;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('email.host');
    const port = this.configService.get<number>('email.port');
    const user = this.configService.get<string>('email.user');
    const pass = this.configService.get<string>('email.pass');

    if (host && port && user && pass && pass !== 'your_email_password') {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: {
            user,
            pass,
          },
        });
        this.isConfigured = true;
        this.logger.log(`SMTP Email Transport initialized for host: ${host}:${port}`);
      } catch (err) {
        this.logger.warn(`Failed to initialize SMTP transporter: ${(err as Error).message}`);
      }
    } else {
      this.logger.log(
        'Real SMTP credentials not provided or in placeholder state. Operating in Simulation / Development mode.',
      );
    }
  }

  async sendEmail(options: SendEmailOptions): Promise<EmailDispatchResult> {
    const fromAddress =
      this.configService.get<string>('email.user') || 'no-reply@cctal.tech';

    if (this.isConfigured && this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: `"Microservice E-Commerce" <${fromAddress}>`,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
        });

        this.logger.log(`Email successfully delivered to ${options.to}. MessageId: ${info.messageId}`);
        return {
          messageId: info.messageId,
          from: fromAddress,
          recipient: options.to,
          subject: options.subject,
          delivered: true,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        this.logger.error(
          `SMTP Delivery failed to ${options.to}: ${(error as Error).message}`,
          (error as Error).stack,
        );
        throw error;
      }
    }

    // Simulation / Dev Mode
    const simulatedMessageId = `sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.logger.log(
      `[SIMULATED DISPATCH] Email to: ${options.to} | Subject: "${options.subject}" | MessageId: ${simulatedMessageId}`,
    );

    return {
      messageId: simulatedMessageId,
      from: fromAddress,
      recipient: options.to,
      subject: options.subject,
      delivered: true,
      timestamp: new Date().toISOString(),
    };
  }

  formatOrderConfirmationEmail(event: OrderCreatedEvent): SendEmailOptions {
    const recipient = event.userEmail || `user_${event.userId}@example.com`;
    const subject = `Order Confirmation — #${event.orderNumber}`;

    const itemsSummary = event.items
      .map(
        (item) =>
          `• ${item.productName} (x${item.quantity}) - $${Number(item.unitPrice).toFixed(2)} [Subtotal: $${Number(item.subtotal).toFixed(2)}]`,
      )
      .join('\n');

    const text = `
Dear Customer,

Thank you for your order!

Order Number: ${event.orderNumber}
Total Amount: $${Number(event.totalAmount).toFixed(2)}
Status: ${event.status}
Date: ${new Date(event.createdAt).toUTCString()}

Items Ordered:
${itemsSummary}

We will notify you as soon as your payment is processed and items are shipped.

Best regards,
Microservice E-Commerce Team
    `.trim();

    const itemsHtml = event.items
      .map(
        (item) =>
          `<tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.productName}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(item.unitPrice).toFixed(2)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">$${Number(item.subtotal).toFixed(2)}</td>
          </tr>`,
      )
      .join('');

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #2c3e50;">Order Confirmation</h2>
        <p>Thank you for your order, <strong>#${event.orderNumber}</strong>!</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="padding: 8px; text-align: left;">Product</th>
              <th style="padding: 8px; text-align: center;">Qty</th>
              <th style="padding: 8px; text-align: right;">Price</th>
              <th style="padding: 8px; text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding: 8px; text-align: right; font-weight: bold;">Total:</td>
              <td style="padding: 8px; text-align: right; font-weight: bold; color: #27ae60;">$${Number(event.totalAmount).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    return {
      to: recipient,
      subject,
      text,
      html,
    };
  }

  formatPaymentSuccessEmail(event: PaymentSucceededEvent): SendEmailOptions {
    const recipient = event.userEmail || `user_${event.userId}@example.com`;
    const subject = `Payment Successful — Order #${event.orderNumber || event.orderId}`;

    const text = `
Dear Customer,

We have successfully processed your payment of $${Number(event.amount).toFixed(2)} ${event.currency}.

Transaction ID: ${event.transactionId}
Order: #${event.orderNumber || event.orderId}
Payment Status: ${event.status}

Your order is now CONFIRMED and is being prepared for fulfillment.

Thank you for shopping with us!
Microservice E-Commerce Team
    `.trim();

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #27ae60;">Payment Received & Order Confirmed</h2>
        <p>Your payment for order <strong>#${event.orderNumber || event.orderId}</strong> was successful.</p>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0;">
          <p style="margin: 5px 0;"><strong>Amount Paid:</strong> $${Number(event.amount).toFixed(2)} ${event.currency}</p>
          <p style="margin: 5px 0;"><strong>Transaction ID:</strong> ${event.transactionId}</p>
        </div>
      </div>
    `;

    return {
      to: recipient,
      subject,
      text,
      html,
    };
  }

  formatPaymentFailureEmail(event: PaymentFailedEvent): SendEmailOptions {
    const recipient = event.userEmail || `user_${event.userId}@example.com`;
    const subject = `Payment Action Required — Order #${event.orderNumber || event.orderId}`;

    const text = `
Dear Customer,

We were unable to process your payment of $${Number(event.amount).toFixed(2)} ${event.currency} for order #${event.orderNumber || event.orderId}.

Reason: ${event.reason}

Please log in and update your payment method to complete your purchase.

Best regards,
Microservice E-Commerce Team
    `.trim();

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #e74c3c;">Payment Failed</h2>
        <p>We could not process your payment for order <strong>#${event.orderNumber || event.orderId}</strong>.</p>
        <p><strong>Reason:</strong> ${event.reason}</p>
        <p>Please update your payment method to ensure your order can be fulfilled.</p>
      </div>
    `;

    return {
      to: recipient,
      subject,
      text,
      html,
    };
  }
}
