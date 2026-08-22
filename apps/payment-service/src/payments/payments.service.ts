import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  PAYMENT_EVENTS,
  PaymentFailedEvent,
  PaymentRefundedEvent,
  PaymentResponse,
  PaymentStatus,
  PaymentSucceededEvent,
  ProcessPaymentDto,
} from '@ecommerce/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('ORDER_RMQ_CLIENT')
    private readonly orderRmqClient: ClientProxy,
    @Inject('NOTIFICATION_RMQ_CLIENT')
    private readonly notificationRmqClient: ClientProxy,
  ) {}

  private mapToResponse(
    payment: Prisma.PaymentGetPayload<Record<string, never>>,
  ): PaymentResponse {
    return {
      id: payment.id,
      orderId: payment.orderId,
      userId: payment.userId,
      amount: Number(payment.amount),
      currency: payment.currency,
      status: payment.status as PaymentStatus,
      transactionId: payment.transactionId,
      paymentMethod: payment.paymentMethod,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  private generateTransactionId(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TXN-${timestamp}-${random}`;
  }

  /**
   * Process a payment transaction.
   * Ensures idempotency: If payment for orderId already exists, returns it without charging twice.
   */
  async processPayment(dto: ProcessPaymentDto): Promise<PaymentResponse> {
    this.logger.log(
      `Processing payment for order #${dto.orderNumber || dto.orderId}, amount: $${dto.amount}`,
    );

    // 1. Idempotency Check
    const existingPayment = await this.prisma.payment.findUnique({
      where: { orderId: dto.orderId },
    });

    if (existingPayment) {
      this.logger.warn(
        `Payment for order ${dto.orderId} already processed with status: ${existingPayment.status}`,
      );
      return this.mapToResponse(existingPayment);
    }

    // 2. Gateway Processing Simulation
    // In real systems, call Stripe/PayPal API here.
    // Deterministic simulation: If amount is 9999 or exceeds max allowed limit, simulate decline.
    const isDeclined = dto.amount === 9999 || dto.amount <= 0;
    const transactionId = this.generateTransactionId();

    if (isDeclined) {
      const failureReason = dto.amount <= 0 ? 'Invalid payment amount' : 'Card declined by issuing bank (insufficient funds)';

      const failedPayment = await this.prisma.payment.create({
        data: {
          orderId: dto.orderId,
          userId: dto.userId,
          amount: new Prisma.Decimal(dto.amount),
          currency: dto.currency ?? 'USD',
          status: 'FAILED',
          transactionId,
          paymentMethod: dto.paymentMethod ?? 'CREDIT_CARD',
          failureReason,
        },
      });

      // Broadcast PaymentFailedEvent to Order Service (for stock compensation) and Notification Service
      const failedEvent: PaymentFailedEvent = {
        paymentId: failedPayment.id,
        orderId: failedPayment.orderId,
        orderNumber: dto.orderNumber,
        userId: failedPayment.userId,
        userEmail: dto.userEmail,
        amount: Number(failedPayment.amount),
        currency: failedPayment.currency,
        reason: failureReason,
        status: PaymentStatus.FAILED,
        timestamp: failedPayment.createdAt,
      };

      try {
        this.orderRmqClient.emit(PAYMENT_EVENTS.PAYMENT_FAILED, failedEvent);
        this.notificationRmqClient.emit(PAYMENT_EVENTS.PAYMENT_FAILED, failedEvent);
        this.logger.log(`Emitted '${PAYMENT_EVENTS.PAYMENT_FAILED}' for order ${dto.orderId}`);
      } catch (err) {
        this.logger.error(`Failed to emit payment.failed event: ${(err as Error).message}`);
      }

      return this.mapToResponse(failedPayment);
    }

    // 3. Successful Payment
    const completedPayment = await this.prisma.payment.create({
      data: {
        orderId: dto.orderId,
        userId: dto.userId,
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency ?? 'USD',
        status: 'COMPLETED',
        transactionId,
        paymentMethod: dto.paymentMethod ?? 'CREDIT_CARD',
      },
    });

    // Broadcast PaymentSucceededEvent to Order Service and Notification Service
    const succeededEvent: PaymentSucceededEvent = {
      paymentId: completedPayment.id,
      orderId: completedPayment.orderId,
      orderNumber: dto.orderNumber,
      userId: completedPayment.userId,
      userEmail: dto.userEmail,
      amount: Number(completedPayment.amount),
      currency: completedPayment.currency,
      transactionId: completedPayment.transactionId,
      status: PaymentStatus.COMPLETED,
      timestamp: completedPayment.createdAt,
    };

    try {
      this.orderRmqClient.emit(PAYMENT_EVENTS.PAYMENT_SUCCEEDED, succeededEvent);
      this.notificationRmqClient.emit(PAYMENT_EVENTS.PAYMENT_SUCCEEDED, succeededEvent);
      this.logger.log(`Emitted '${PAYMENT_EVENTS.PAYMENT_SUCCEEDED}' for order ${dto.orderId}`);
    } catch (err) {
      this.logger.error(`Failed to emit payment.succeeded event: ${(err as Error).message}`);
    }

    return this.mapToResponse(completedPayment);
  }

  async findByOrderId(orderId: string): Promise<PaymentResponse> {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment record for order ID '${orderId}' not found`);
    }

    return this.mapToResponse(payment);
  }

  async findById(id: string): Promise<PaymentResponse> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      throw new NotFoundException(`Payment record with ID '${id}' not found`);
    }

    return this.mapToResponse(payment);
  }

  async refundPayment(orderId: string, reason?: string): Promise<PaymentResponse> {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment record for order ID '${orderId}' not found`);
    }

    if (payment.status !== 'COMPLETED') {
      throw new BadRequestException(`Cannot refund payment in '${payment.status}' status`);
    }

    const refundTransactionId = `REF-${this.generateTransactionId()}`;
    const refunded = await this.prisma.payment.update({
      where: { orderId },
      data: {
        status: 'REFUNDED',
        refundTransactionId,
        failureReason: reason,
      },
    });

    const refundEvent: PaymentRefundedEvent = {
      paymentId: refunded.id,
      orderId: refunded.orderId,
      userId: refunded.userId,
      amount: Number(refunded.amount),
      currency: refunded.currency,
      refundTransactionId,
      status: PaymentStatus.REFUNDED,
      timestamp: refunded.updatedAt,
    };

    try {
      this.notificationRmqClient.emit(PAYMENT_EVENTS.PAYMENT_REFUNDED, refundEvent);
      this.logger.log(`Emitted '${PAYMENT_EVENTS.PAYMENT_REFUNDED}' for order ${orderId}`);
    } catch (err) {
      this.logger.error(`Failed to emit payment.refunded event: ${(err as Error).message}`);
    }

    return this.mapToResponse(refunded);
  }
}
