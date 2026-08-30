import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  CheckStockDto,

  INVENTORY_EVENTS,
  InventoryItemResponse,
  InventoryReleasedEvent,
  InventoryReservationFailedEvent,
  InventoryReservedEvent,
  KAFKA_TOPICS,
  KafkaProducerService,
  OrderCreatedEvent,
  PaymentFailedEvent,
  ReleaseStockDto,
  ReserveStockDto,
  RestockDto,
  StockAvailabilityResponse,
  RedisService,
} from '@ecommerce/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../../prisma/client';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Optional()
    private readonly kafkaProducer?: KafkaProducerService,
  ) {}



  private mapToResponse(item: Prisma.InventoryItemGetPayload<Record<string, never>>): InventoryItemResponse {
    return {
      id: item.id,
      productId: item.productId,
      stockOnHand: item.stockOnHand,
      reservedStock: item.reservedStock,
      availableStock: Math.max(0, item.stockOnHand - item.reservedStock),
      lowStockThreshold: item.lowStockThreshold,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  /**
   * Add stock to an existing item or initialize a new inventory item record.
   */
  async restock(dto: RestockDto): Promise<InventoryItemResponse> {
    this.logger.log(`Restocking product ${dto.productId} with quantity ${dto.quantity}`);

    const item = await this.prisma.inventoryItem.upsert({
      where: { productId: dto.productId },
      create: {
        productId: dto.productId,
        stockOnHand: dto.quantity,
        reservedStock: 0,
        lowStockThreshold: dto.lowStockThreshold ?? 5,
      },
      update: {
        stockOnHand: { increment: dto.quantity },
        ...(dto.lowStockThreshold !== undefined ? { lowStockThreshold: dto.lowStockThreshold } : {}),
      },
    });

    return this.mapToResponse(item);
  }

  /**
   * Get single inventory item by product ID.
   */
  async getByProductId(productId: string): Promise<InventoryItemResponse> {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { productId },
    });

    if (!item) {
      throw new NotFoundException(`Inventory record for product ${productId} not found`);
    }

    return this.mapToResponse(item);
  }

  /**
   * Check stock availability for multiple products.
   */
  async checkStock(dto: CheckStockDto): Promise<StockAvailabilityResponse[]> {
    const items = await this.prisma.inventoryItem.findMany({
      where: { productId: { in: dto.productIds } },
    });

    const itemMap = new Map(items.map((i) => [i.productId, i]));

    return dto.productIds.map((id) => {
      const item = itemMap.get(id);
      const available = item ? Math.max(0, item.stockOnHand - item.reservedStock) : 0;
      return {
        productId: id,
        availableStock: available,
        isAvailable: available > 0,
      };
    });
  }

  /**
   * List all inventory records.
   */
  async list(): Promise<InventoryItemResponse[]> {
    const items = await this.prisma.inventoryItem.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item) => this.mapToResponse(item));
  }

  /**
   * Reserve stock atomically for an order.
   * Handles idempotency: If reservation already exists for the order, returns it.
   */
  async reserveStock(dto: ReserveStockDto): Promise<{ success: boolean; reason?: string }> {
    this.logger.log(
      `Reserving stock for order #${dto.orderNumber || dto.orderId} (${dto.items.length} items)`,
    );

    // 1. Idempotency check
    const existingReservations = await this.prisma.stockReservation.findMany({
      where: { orderId: dto.orderId },
    });

    if (existingReservations.length > 0) {
      const allReserved = existingReservations.every((r) => r.status === 'RESERVED');
      if (allReserved) {
        this.logger.warn(`Stock already reserved for order ${dto.orderId}`);
        return { success: true };
      }
    }

    // 2. Perform atomic reservation inside a distributed lock with Prisma transaction
    const sortedProductIds = [...new Set(dto.items.map((i) => i.productId))].sort();
    const lockKey = `inventory:products:${sortedProductIds.join(':')}`;

    try {
      return await this.redis.withLock(lockKey, 5000, async () => {
        await this.prisma.$transaction(async (tx) => {
          const productIds = dto.items.map((i) => i.productId);
          const inventoryItems = await tx.inventoryItem.findMany({
            where: { productId: { in: productIds } },
          });

          const inventoryMap = new Map(inventoryItems.map((item) => [item.productId, item]));
          const failedItems: { productId: string; requestedQuantity: number; availableStock: number }[] = [];

          // Verify stock sufficiency for every item
          for (const reqItem of dto.items) {
            const invItem = inventoryMap.get(reqItem.productId);
            const availableStock = invItem ? invItem.stockOnHand - invItem.reservedStock : 0;

            if (!invItem || availableStock < reqItem.quantity) {
              failedItems.push({
                productId: reqItem.productId,
                requestedQuantity: reqItem.quantity,
                availableStock,
              });
            }
          }

          if (failedItems.length > 0) {
            throw new BadRequestException(
              `Insufficient stock for products: ${failedItems.map((f) => f.productId).join(', ')}`,
            );
          }

          // Apply reservations
          for (const reqItem of dto.items) {
            await tx.inventoryItem.update({
              where: { productId: reqItem.productId },
              data: {
                reservedStock: { increment: reqItem.quantity },
              },
            });

            await tx.stockReservation.upsert({
              where: {
                orderId_productId: {
                  orderId: dto.orderId,
                  productId: reqItem.productId,
                },
              },
              create: {
                orderId: dto.orderId,
                productId: reqItem.productId,
                quantity: reqItem.quantity,
                status: 'RESERVED',
              },
              update: {
                quantity: reqItem.quantity,
                status: 'RESERVED',
              },
            });
          }
        });

        this.logger.log(`Stock successfully reserved for order ${dto.orderId}`);
        return { success: true };
      });
    } catch (error) {
      const reason = (error as Error).message;
      this.logger.error(`Failed to reserve stock for order ${dto.orderId}: ${reason}`);
      return { success: false, reason };
    }
  }

  /**
   * Compensating transaction: Release reserved stock when payment fails or order is cancelled.
   */
  async releaseStock(dto: ReleaseStockDto): Promise<{ success: boolean; releasedCount: number }> {
    this.logger.log(
      `Compensating transaction: Releasing reserved stock for order #${dto.orderNumber || dto.orderId}`,
    );

    const reservations = await this.prisma.stockReservation.findMany({
      where: {
        orderId: dto.orderId,
        status: 'RESERVED',
      },
    });

    if (reservations.length === 0) {
      this.logger.warn(`No active RESERVED stock found to release for order ${dto.orderId}`);
      return { success: true, releasedCount: 0 };
    }

    await this.prisma.$transaction(async (tx) => {
      for (const res of reservations) {
        // Decrease reserved stock safely
        await tx.inventoryItem.update({
          where: { productId: res.productId },
          data: {
            reservedStock: { decrement: res.quantity },
          },
        });

        await tx.stockReservation.update({
          where: { id: res.id },
          data: { status: 'RELEASED' },
        });
      }
    });

    const releasedEvent: InventoryReleasedEvent = {
      orderId: dto.orderId,
      orderNumber: dto.orderNumber,
      reason: dto.reason ?? 'Compensating transaction triggered by payment failure or order cancellation',
      releasedItems: reservations.map((r) => ({
        productId: r.productId,
        quantity: r.quantity,
      })),
      releasedAt: new Date().toISOString(),
    };

    if (this.kafkaProducer) {
      this.kafkaProducer
        .emitEvent(
          KAFKA_TOPICS.INVENTORY_EVENTS,
          INVENTORY_EVENTS.INVENTORY_RELEASED,
          dto.orderId,
          releasedEvent,
          'inventory-service',
        )
        .catch((err) => {
          this.logger.warn(`Kafka inventory.released streaming failed: ${(err as Error).message}`);
        });
    }

    this.logger.log(
      `Released ${reservations.length} reservations for order ${dto.orderId}`,
    );

    return { success: true, releasedCount: reservations.length };
  }

  /**
   * SAGA CHOREOGRAPHY: Handle order.created event from Kafka stream
   */
  async handleOrderCreated(event: OrderCreatedEvent): Promise<void> {
    this.logger.log(
      `Saga Step 2: Processing order.created event for order #${event.orderNumber} (ID: ${event.orderId})`,
    );

    const reserveResult = await this.reserveStock({
      orderId: event.orderId,
      orderNumber: event.orderNumber,
      userId: event.userId,
      userEmail: event.userEmail,
      items: event.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });

    if (reserveResult.success) {
      // Broadcast InventoryReservedEvent to Kafka topic for Payment and Order services
      const reservedEvent: InventoryReservedEvent = {
        orderId: event.orderId,
        orderNumber: event.orderNumber,
        userId: event.userId,
        userEmail: event.userEmail,
        amount: event.totalAmount,
        items: event.items,
        reservedAt: new Date().toISOString(),
      };

      if (this.kafkaProducer) {
        this.kafkaProducer
          .emitEvent(
            KAFKA_TOPICS.INVENTORY_EVENTS,
            INVENTORY_EVENTS.INVENTORY_RESERVED,
            event.orderId,
            reservedEvent,
            'inventory-service',
          )
          .catch((err) => {
            this.logger.warn(`Kafka inventory.reserved streaming failed: ${(err as Error).message}`);
          });
      }

      this.logger.log(`Emitted inventory.reserved event to Kafka for order #${event.orderNumber}`);
    } else {
      // Stock unavailable — emit inventory.failed event to Kafka to cancel order and notify customer
      const failedEvent: InventoryReservationFailedEvent = {
        orderId: event.orderId,
        orderNumber: event.orderNumber,
        userId: event.userId,
        userEmail: event.userEmail,
        reason: reserveResult.reason ?? 'Out of stock',
        failedItems: event.items.map((i) => ({
          productId: i.productId,
          requestedQuantity: i.quantity,
          availableStock: 0,
        })),
        timestamp: new Date().toISOString(),
      };

      if (this.kafkaProducer) {
        this.kafkaProducer
          .emitEvent(
            KAFKA_TOPICS.INVENTORY_EVENTS,
            INVENTORY_EVENTS.INVENTORY_FAILED,
            event.orderId,
            failedEvent,
            'inventory-service',
          )
          .catch((err) => {
            this.logger.warn(`Kafka inventory.failed streaming failed: ${(err as Error).message}`);
          });
      }

      this.logger.warn(`Emitted inventory.failed event to Kafka for order #${event.orderNumber}`);
    }
  }



  /**
   * SAGA COMPENSATING ACTION: Handle payment.failed event from RabbitMQ
   */
  async handlePaymentFailed(event: PaymentFailedEvent): Promise<void> {
    this.logger.warn(
      `Saga Compensating Action: Payment failed for order #${event.orderNumber || event.orderId} — releasing stock`,
    );

    await this.releaseStock({
      orderId: event.orderId,
      orderNumber: event.orderNumber,
      reason: `Payment declined: ${event.reason}`,
    });
  }
}
