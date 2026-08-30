import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  KAFKA_TOPICS,
  KafkaProducerService,
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
    @Optional()
    private readonly kafkaProducer?: KafkaProducerService,
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

      if (this.kafkaProducer) {
        this.kafkaProducer
          .emitEvent(
            KAFKA_TOPICS.PAYMENT_EVENTS,
            PAYMENT_EVENTS.PAYMENT_FAILED,
            dto.orderId,
            failedEvent,
            'payment-service',
          )
          .catch((err) => {
            this.logger.warn(`Kafka payment.failed streaming failed: ${(err as Error).message}`);
          });
      }

      this.logger.log(`Emitted '${PAYMENT_EVENTS.PAYMENT_FAILED}' to Kafka for order ${dto.orderId}`);

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

    // Broadcast PaymentSucceededEvent to Kafka topic
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

    if (this.kafkaProducer) {
      this.kafkaProducer
        .emitEvent(
          KAFKA_TOPICS.PAYMENT_EVENTS,
          PAYMENT_EVENTS.PAYMENT_SUCCEEDED,
          dto.orderId,
          succeededEvent,
          'payment-service',
        )
        .catch((err) => {
          this.logger.warn(`Kafka payment.succeeded streaming failed: ${(err as Error).message}`);
        });
    }

    this.logger.log(`Emitted '${PAYMENT_EVENTS.PAYMENT_SUCCEEDED}' to Kafka for order ${dto.orderId}`);

    return this.mapToResponse(completedPayment);
  }

  async findByOrderId(orderId: string): Promise<PaymentResponse> {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment for order '${orderId}' not found`);
    }

    return this.mapToResponse(payment);
  }

  async findById(id: string): Promise<PaymentResponse> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID '${id}' not found`);
    }

    return this.mapToResponse(payment);
  }

  async refundPayment(orderId: string, reason?: string): Promise<PaymentResponse> {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment for order '${orderId}' not found`);
    }

    this.logger.log(`Processing refund for order '${orderId}'. Reason: ${reason ?? 'N/A'}`);

    if (payment.status !== 'COMPLETED') {
      throw new BadRequestException(
        `Cannot refund payment in status '${payment.status}'. Only COMPLETED payments can be refunded.`,
      );
    }

    const refunded = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'REFUNDED',
      },
    });

    const refundTransactionId = `REF-${Date.now()}`;
    const refundEvent: PaymentRefundedEvent = {
      paymentId: refunded.id,
      orderId: refunded.orderId,
      userId: refunded.userId,
      amount: Number(refunded.amount),
      currency: refunded.currency,
      refundTransactionId,
      status: PaymentStatus.REFUNDED,
      timestamp: new Date().toISOString(),
    };

    if (this.kafkaProducer) {
      this.kafkaProducer
        .emitEvent(
          KAFKA_TOPICS.PAYMENT_EVENTS,
          PAYMENT_EVENTS.PAYMENT_REFUNDED,
          orderId,
          refundEvent,
          'payment-service',
        )
        .catch((err) => {
          this.logger.warn(`Kafka payment.refunded streaming failed: ${(err as Error).message}`);
        });
    }

    this.logger.log(`Emitted '${PAYMENT_EVENTS.PAYMENT_REFUNDED}' to Kafka for order ${orderId}`);

    return this.mapToResponse(refunded);
  }

}
