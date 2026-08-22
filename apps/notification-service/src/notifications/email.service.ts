import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { OrderCreatedEvent } from '@ecommerce/shared';

export interface SendEmailOptions {
  from?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
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

  constructor(private readonly configService?: ConfigService) {
    const host = this.configService?.get<string>('mail.host');
    const port = this.configService?.get<number>('mail.port');
    const user = this.configService?.get<string>('mail.user');
    const pass = this.configService?.get<string>('mail.pass');

    if (host && port && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });
      this.logger.log(`SMTP Transporter initialized for host: ${host}:${port} (secure: ${port === 465})`);
    }
  }

  async sendEmail(options: SendEmailOptions): Promise<EmailDispatchResult> {
    const fromAddress =
      options.from ||
      this.configService?.get<string>('mail.from') ||
      'E-Commerce Store <no-reply@ecommerce.com>';

    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: fromAddress,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
        });

        this.logger.log(
          `[SMTP EMAIL SENT] MessageID: ${info.messageId} | From: "${fromAddress}" | To: "${options.to}" | Subject: "${options.subject}"`,
        );

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
          `Failed to deliver email via SMTP: ${(error as Error).message}`,
          (error as Error).stack,
        );
        throw error;
      }
    }

    // Fallback: Simulated email delivery with structured logging
    const simulatedMessageId = `sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.logger.log(
      `[SIMULATED EMAIL SENT] MessageID: ${simulatedMessageId} | From: "${fromAddress}" | To: "${options.to}" | Subject: "${options.subject}"`,
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

We will notify you as soon as your items are shipped.

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
}
