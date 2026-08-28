import { Controller, Logger, Optional } from '@nestjs/common';
import { Ctx, EventPattern, MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  INVENTORY_EVENTS,
  InventoryReservedEvent,
  ORDER_EVENTS,
  OrderCreatedEvent,
  PAYMENT_PATTERNS,
  PaymentResponse,
  ProcessPaymentDto,
  runWithTraceContext,
  MetricsService,
} from '@ecommerce/shared';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  /**
   * Event Consumer: Reacts asynchronously to InventoryReservedEvent (Saga Step 3).
   * Charges payment only after stock has been verified and reserved.
   */
  @EventPattern(INVENTORY_EVENTS.INVENTORY_RESERVED)
  async handleInventoryReserved(
    @Payload() data: InventoryReservedEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    await runWithTraceContext(
      data,
      'consumer.inventory.reserved -> processPayment',
      async () => {
        try {
          this.logger.log(
            `Saga Step 3: Received '${INVENTORY_EVENTS.INVENTORY_RESERVED}' for order #${data?.orderNumber || data?.orderId}`,
          );

          await this.paymentsService.processPayment({
            orderId: data.orderId,
            orderNumber: data.orderNumber,
            userId: data.userId,
            userEmail: data.userEmail,
            amount: data.amount,
            currency: data.currency,
          });

          this.metricsService?.rabbitmqEventsTotal.inc({
            event_name: INVENTORY_EVENTS.INVENTORY_RESERVED,
            action: 'consumed',
            status: 'success',
          });

          channel.ack(originalMsg);
          this.logger.debug(
            `Acknowledged inventory.reserved event in payment service for #${data?.orderNumber}`,
          );
        } catch (error) {
          this.metricsService?.rabbitmqEventsTotal.inc({
            event_name: INVENTORY_EVENTS.INVENTORY_RESERVED,
            action: 'consumed',
            status: 'failure',
          });
          this.logger.error(
            `Failed to process payment for order ${data?.orderId}: ${(error as Error).message}`,
            (error as Error).stack,
          );
          channel.nack(originalMsg, false, false);
        }
      },
    );
  }

  /**
   * Event Consumer: Legacy / Direct fallback for OrderCreatedEvent.
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

      // In Saga Phase 7, stock reservation triggers payment. If received directly, we acknowledge it safely.
      channel.ack(originalMsg);
      this.logger.debug(`Acknowledged direct order.created event in payment service #${data?.orderNumber}`);
    } catch (error) {
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
