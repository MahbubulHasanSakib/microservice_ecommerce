import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, MessagePattern, Payload, RmqContext } from '@nestjs/microservices';
import {
  CheckStockDto,
  INVENTORY_PATTERNS,
  InventoryItemResponse,
  ORDER_EVENTS,
  OrderCreatedEvent,
  PAYMENT_EVENTS,
  PaymentFailedEvent,
  ReleaseStockDto,
  ReserveStockDto,
  RestockDto,
  StockAvailabilityResponse,
} from '@ecommerce/shared';
import { InventoryService } from './inventory.service';

@Controller()
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * Event Consumer: Reacts to OrderCreatedEvent to reserve stock.
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

      await this.inventoryService.handleOrderCreated(data);

      channel.ack(originalMsg);
      this.logger.debug(`Acknowledged order.created event in inventory service for #${data?.orderNumber}`);
    } catch (error) {
      this.logger.error(
        `Error handling order.created in inventory service: ${(error as Error).message}`,
        (error as Error).stack,
      );
      // NACK without requeue to move to DLQ
      channel.nack(originalMsg, false, false);
    }
  }

  /**
   * Event Consumer: Compensating transaction on payment failure.
   */
  @EventPattern(PAYMENT_EVENTS.PAYMENT_FAILED)
  async handlePaymentFailed(
    @Payload() data: PaymentFailedEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(
        `Received event '${PAYMENT_EVENTS.PAYMENT_FAILED}' for order #${data?.orderNumber || data?.orderId}`,
      );

      await this.inventoryService.handlePaymentFailed(data);

      channel.ack(originalMsg);
      this.logger.debug(`Acknowledged payment.failed event in inventory service for #${data?.orderNumber}`);
    } catch (error) {
      this.logger.error(
        `Error handling payment.failed in inventory service: ${(error as Error).message}`,
        (error as Error).stack,
      );
      channel.nack(originalMsg, false, false);
    }
  }

  /**
   * Event Consumer: Compensating transaction on order cancellation.
   */
  @EventPattern(ORDER_EVENTS.ORDER_CANCELLED)
  async handleOrderCancelled(
    @Payload() data: { orderId: string; orderNumber?: string; reason?: string },
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      this.logger.log(
        `Received event '${ORDER_EVENTS.ORDER_CANCELLED}' for order #${data?.orderNumber || data?.orderId}`,
      );

      await this.inventoryService.releaseStock({
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        reason: data.reason ?? 'Order cancelled',
      });

      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(
        `Error handling order.cancelled in inventory service: ${(error as Error).message}`,
        (error as Error).stack,
      );
      channel.nack(originalMsg, false, false);
    }
  }

  /**
   * RPC Message Pattern: Restock an item.
   */
  @MessagePattern(INVENTORY_PATTERNS.RESTOCK)
  async restock(@Payload() dto: RestockDto): Promise<InventoryItemResponse> {
    return this.inventoryService.restock(dto);
  }

  /**
   * RPC Message Pattern: Get inventory by product ID.
   */
  @MessagePattern(INVENTORY_PATTERNS.GET_BY_PRODUCT_ID)
  async getByProductId(@Payload() data: { productId: string }): Promise<InventoryItemResponse> {
    return this.inventoryService.getByProductId(data.productId);
  }

  /**
   * RPC Message Pattern: Check stock for multiple product IDs.
   */
  @MessagePattern(INVENTORY_PATTERNS.CHECK_STOCK)
  async checkStock(@Payload() dto: CheckStockDto): Promise<StockAvailabilityResponse[]> {
    return this.inventoryService.checkStock(dto);
  }

  /**
   * RPC Message Pattern: List all inventory items.
   */
  @MessagePattern(INVENTORY_PATTERNS.LIST)
  async list(): Promise<InventoryItemResponse[]> {
    return this.inventoryService.list();
  }

  /**
   * RPC Message Pattern: Synchronously reserve stock.
   */
  @MessagePattern(INVENTORY_PATTERNS.RESERVE)
  async reserve(@Payload() dto: ReserveStockDto): Promise<{ success: boolean; reason?: string }> {
    return this.inventoryService.reserveStock(dto);
  }

  /**
   * RPC Message Pattern: Synchronously release stock.
   */
  @MessagePattern(INVENTORY_PATTERNS.RELEASE)
  async release(@Payload() dto: ReleaseStockDto): Promise<{ success: boolean; releasedCount: number }> {
    return this.inventoryService.releaseStock(dto);
  }
}
