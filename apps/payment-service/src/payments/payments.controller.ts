import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  ORDER_EVENTS,
  OrderCreatedEvent,
  PAYMENT_PATTERNS,
  PaymentResponse,
  ProcessPaymentDto,
} from '@ecommerce/shared';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Event Consumer: Reacts asynchronously to OrderCreatedEvent.
   * Charges payment and publishes PaymentSucceeded / PaymentFailed.
   */
  @EventPattern(ORDER_EVENTS.ORDER_CREATED)
  async handleOrderCreated(
    @Payload() data: OrderCreatedEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(
        `Received event '${ORDER_EVENTS.ORDER_CREATED}' for order #${data?.orderNumber || data?.orderId}`,
      );

      await this.paymentsService.processPayment({
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        userId: data.userId,
        userEmail: data.userEmail,
        amount: data.totalAmount,
      });

      // Explicit manual acknowledgment
      channel.ack(originalMsg);
      this.logger.debug(`Acknowledged order.created event for payment processing #${data?.orderNumber}`);
    } catch (error) {
      this.logger.error(
        `Failed to process payment for order ${data?.orderId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      // NACK without requeue
      channel.nack(originalMsg, false, false);
    }
  }

  /**
   * RPC Message Pattern: Direct synchronous payment command.
   */
  @MessagePattern(PAYMENT_PATTERNS.PROCESS)
  async processPaymentCommand(@Payload() dto: ProcessPaymentDto): Promise<PaymentResponse> {
    return this.paymentsService.processPayment(dto);
  }

  /**
   * RPC Message Pattern: Retrieve payment details by order ID.
   */
  @MessagePattern(PAYMENT_PATTERNS.FIND_BY_ORDER_ID)
  async findByOrderId(@Payload() data: { orderId: string }): Promise<PaymentResponse> {
    return this.paymentsService.findByOrderId(data.orderId);
  }

  /**
   * RPC Message Pattern: Retrieve payment details by ID.
   */
  @MessagePattern(PAYMENT_PATTERNS.FIND_BY_ID)
  async findById(@Payload() data: { id: string }): Promise<PaymentResponse> {
    return this.paymentsService.findById(data.id);
  }

  /**
   * RPC Message Pattern: Refund a completed payment.
   */
  @MessagePattern(PAYMENT_PATTERNS.REFUND)
  async refundPayment(
    @Payload() data: { orderId: string; reason?: string },
  ): Promise<PaymentResponse> {
    return this.paymentsService.refundPayment(data.orderId, data.reason);
  }
}
