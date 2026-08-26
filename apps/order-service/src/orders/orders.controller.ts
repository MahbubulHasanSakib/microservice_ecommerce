import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  INVENTORY_EVENTS,
  InventoryReservationFailedEvent,
  ORDER_PATTERNS,
  OrderResponse,
  OrderStatus,
  PaginatedResult,
  PAYMENT_EVENTS,
  PaymentFailedEvent,
  PaymentSucceededEvent,
} from '@ecommerce/shared';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';

@Controller()
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private readonly ordersService: OrdersService) {}

  @MessagePattern(ORDER_PATTERNS.CREATE)
  async create(@Payload() dto: CreateOrderDto): Promise<OrderResponse> {
    return this.ordersService.create(dto);
  }

  @MessagePattern(ORDER_PATTERNS.FIND_BY_ID)
  async findById(
    @Payload() data: { id: string; userId?: string; isAdmin?: boolean },
  ): Promise<OrderResponse> {
    return this.ordersService.findById(data.id, data.userId, data.isAdmin);
  }

  @MessagePattern(ORDER_PATTERNS.FIND_BY_USER)
  async findByUser(
    @Payload() data: { query: QueryOrdersDto },
  ): Promise<PaginatedResult<OrderResponse>> {
    return this.ordersService.findAll(data.query);
  }

  @MessagePattern(ORDER_PATTERNS.CANCEL)
  async cancel(
    @Payload() data: { id: string; userId?: string; isAdmin?: boolean },
  ): Promise<OrderResponse> {
    return this.ordersService.cancel(data.id, data.userId, data.isAdmin);
  }

  @MessagePattern(ORDER_PATTERNS.UPDATE_STATUS)
  async updateStatus(@Payload() data: { id: string; status: OrderStatus }): Promise<OrderResponse> {
    return this.ordersService.updateStatus(data.id, data.status);
  }

  /**
   * Event Consumer: Reacts to PaymentSucceededEvent.
   * Confirms order and acknowledges message.
   */
  @EventPattern(PAYMENT_EVENTS.PAYMENT_SUCCEEDED)
  async handlePaymentSucceeded(
    @Payload() data: PaymentSucceededEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(`Received event '${PAYMENT_EVENTS.PAYMENT_SUCCEEDED}' for order ${data?.orderId}`);
      await this.ordersService.handlePaymentSucceeded(data);
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(
        `Failed to process event '${PAYMENT_EVENTS.PAYMENT_SUCCEEDED}': ${(error as Error).message}`,
        (error as Error).stack,
      );
      channel.nack(originalMsg, false, false);
    }
  }

  /**
   * Event Consumer: Reacts to PaymentFailedEvent.
   * Cancels order, triggers stock compensation, and acknowledges message.
   */
  @EventPattern(PAYMENT_EVENTS.PAYMENT_FAILED)
  async handlePaymentFailed(
    @Payload() data: PaymentFailedEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(`Received event '${PAYMENT_EVENTS.PAYMENT_FAILED}' for order ${data?.orderId}`);
      await this.ordersService.handlePaymentFailed(data);
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(
        `Failed to process event '${PAYMENT_EVENTS.PAYMENT_FAILED}': ${(error as Error).message}`,
        (error as Error).stack,
      );
      channel.nack(originalMsg, false, false);
    }
  }

  /**
   * Event Consumer: Reacts to InventoryReservationFailedEvent.
   * Cancels order due to out of stock and acknowledges message.
   */
  @EventPattern(INVENTORY_EVENTS.INVENTORY_FAILED)
  async handleInventoryFailed(
    @Payload() data: InventoryReservationFailedEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(`Received event '${INVENTORY_EVENTS.INVENTORY_FAILED}' for order ${data?.orderId}`);
      await this.ordersService.handleInventoryReservationFailed(data);
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(
        `Failed to process event '${INVENTORY_EVENTS.INVENTORY_FAILED}': ${(error as Error).message}`,
        (error as Error).stack,
      );
      channel.nack(originalMsg, false, false);
    }
  }
}
