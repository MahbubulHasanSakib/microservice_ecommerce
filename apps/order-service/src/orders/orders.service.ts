import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import {
  InventoryReservationFailedEvent,
  KAFKA_TOPICS,
  KafkaProducerService,
  ORDER_EVENTS,
  OrderCreatedEvent,
  OrderStatus,
  OrderResponse,
  PaginatedResult,
  PaymentFailedEvent,
  PaymentSucceededEvent,
  PRODUCT_PATTERNS,
  ProductResponse,
  SERVICES,
} from '@ecommerce/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { Prisma } from '../../prisma/client';

const RPC_TIMEOUT_MS = 5000;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICES.PRODUCT_SERVICE)
    private readonly productClient: ClientProxy,
    @Optional()
    private readonly kafkaProducer?: KafkaProducerService,
  ) {}



  private mapToResponse(
    order: Prisma.OrderGetPayload<{ include: { items: true } }>,
  ): OrderResponse {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: order.status as OrderStatus,
      totalAmount: Number(order.totalAmount),
      shippingAddress: order.shippingAddress as Record<string, unknown> | null,
      items: (order.items || []).map((item) => ({
        id: item.id,
        orderId: item.orderId,
        productId: item.productId,
        productName: item.productName,
        unitPrice: Number(item.unitPrice),
        quantity: item.quantity,
        subtotal: Number(item.subtotal),
      })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private generateOrderNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ORD-${timestamp}-${random}`;
  }

  async create(dto: CreateOrderDto): Promise<OrderResponse> {
    const productIds = dto.items.map((i) => i.productId);

    // 1. Fetch live product data synchronously from Product Service via TCP RPC
    let products: ProductResponse[];
    try {
      products = await firstValueFrom(
        this.productClient
          .send<ProductResponse[]>(PRODUCT_PATTERNS.FIND_BY_IDS, { ids: productIds })
          .pipe(timeout(RPC_TIMEOUT_MS)),
      );
    } catch (error) {
      throw new BadRequestException(
        `Failed to verify products with Product Service: ${(error as Error).message}`,
      );
    }

    const productMap = new Map<string, ProductResponse>(products.map((p) => [p.id, p]));

    // 2. Validate product availability and prepare line item price snapshots
    let totalAmount = 0;
    const preparedItems: {
      productId: string;
      productName: string;
      unitPrice: Prisma.Decimal;
      quantity: number;
      subtotal: Prisma.Decimal;
    }[] = [];

    for (const item of dto.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new NotFoundException(`Product with ID '${item.productId}' not found`);
      }

      if (!product.isActive) {
        throw new BadRequestException(
          `Product '${product.name}' is currently unavailable for purchase`,
        );
      }

      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for '${product.name}'. Available: ${product.stock}, Requested: ${item.quantity}`,
        );
      }

      const unitPrice = product.price;
      const subtotal = unitPrice * item.quantity;
      totalAmount += subtotal;

      preparedItems.push({
        productId: product.id,
        productName: product.name,
        unitPrice: new Prisma.Decimal(unitPrice),
        quantity: item.quantity,
        subtotal: new Prisma.Decimal(subtotal),
      });
    }

    const orderNumber = this.generateOrderNumber();

    // 3. Synchronously adjust stock in Product Service with rollback on failure
    const decrementedItems: { productId: string; quantity: number }[] = [];
    for (const item of dto.items) {
      try {
        await firstValueFrom(
          this.productClient
            .send(PRODUCT_PATTERNS.UPDATE_STOCK, {
              productId: item.productId,
              quantityDelta: -item.quantity,
            })
            .pipe(timeout(RPC_TIMEOUT_MS)),
        );
        decrementedItems.push({ productId: item.productId, quantity: item.quantity });
      } catch (err) {
        // Rollback all previously decremented items
        for (const dec of decrementedItems) {
          try {
            await firstValueFrom(
              this.productClient
                .send(PRODUCT_PATTERNS.UPDATE_STOCK, {
                  productId: dec.productId,
                  quantityDelta: dec.quantity,
                })
                .pipe(timeout(RPC_TIMEOUT_MS)),
            );
          } catch (rollbackErr) {
            this.logger.error(
              `Failed to restore stock for product ${dec.productId} during order creation rollback`,
              (rollbackErr as Error).stack,
            );
          }
        }
        throw new BadRequestException(
          `Failed to reserve stock for product '${item.productId}': ${(err as Error).message}`,
        );
      }
    }

    // 4. Execute atomic ACID transaction for order, line items, and transactional outbox event
    let createdOrder;
    let eventPayload: OrderCreatedEvent;
    try {
      createdOrder = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderNumber,
            userId: dto.userId,
            status: 'PENDING',
            totalAmount: new Prisma.Decimal(totalAmount),
            shippingAddress: dto.shippingAddress
              ? (dto.shippingAddress as Prisma.InputJsonValue)
              : undefined,
            items: {
              create: preparedItems.map((item) => ({
                productId: item.productId,
                productName: item.productName,
                unitPrice: item.unitPrice,
                quantity: item.quantity,
                subtotal: item.subtotal,
              })),
            },
          },
          include: {
            items: true,
          },
        });

        eventPayload = {
          orderId: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          userEmail: dto.userEmail,
          totalAmount: Number(order.totalAmount),
          status: order.status as OrderStatus,
          shippingAddress: order.shippingAddress as Record<string, unknown> | null,
          items: order.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            unitPrice: Number(item.unitPrice),
            quantity: item.quantity,
            subtotal: Number(item.subtotal),
          })),
          createdAt: order.createdAt,
        };

        // Transactional Outbox: Write event within same DB transaction
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'Order',
            aggregateId: order.id,
            eventType: ORDER_EVENTS.ORDER_CREATED,
            payload: eventPayload as unknown as Prisma.InputJsonValue,
            status: 'PENDING',
          },
        });

        return order;
      });
    } catch (dbError) {
      // Rollback all decremented stock if local DB transaction fails
      for (const dec of decrementedItems) {
        try {
          await firstValueFrom(
            this.productClient
              .send(PRODUCT_PATTERNS.UPDATE_STOCK, {
                productId: dec.productId,
                quantityDelta: dec.quantity,
              })
              .pipe(timeout(RPC_TIMEOUT_MS)),
          );
        } catch (rollbackErr) {
          this.logger.error(
            `Failed to restore stock for product ${dec.productId} during DB transaction failure`,
            (rollbackErr as Error).stack,
          );
        }
      }
      throw dbError;
    }

    // 5. Fast-path asynchronous publishing to Kafka (OutboxProcessor acts as reliable fallback)
    try {
      // Mark outbox event as PUBLISHED on successful fast-path emission
      await this.prisma.outboxEvent.updateMany({
        where: { aggregateId: createdOrder.id, eventType: ORDER_EVENTS.ORDER_CREATED },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });

      // Stream OrderCreated event to Kafka topic with orderId as partition key
      if (this.kafkaProducer) {
        this.kafkaProducer
          .emitEvent(
            KAFKA_TOPICS.ORDER_EVENTS,
            ORDER_EVENTS.ORDER_CREATED,
            createdOrder.id,
            eventPayload!,
            'order-service',
          )
          .catch((err) => {
            this.logger.warn(
              `Kafka event streaming failed for order #${createdOrder.orderNumber}: ${(err as Error).message}`,
            );
          });
      }

      this.logger.log(
        `Dispatched '${ORDER_EVENTS.ORDER_CREATED}' event to Kafka for order #${createdOrder.orderNumber}`,
      );
    } catch (eventErr) {
      this.logger.warn(
        `Fast-path emission failed for order #${createdOrder.orderNumber}. OutboxProcessor will deliver in background: ${(eventErr as Error).message}`,
      );
    }

    return this.mapToResponse(createdOrder);
  }



  async findById(id: string, userId?: string, isAdmin = false): Promise<OrderResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID '${id}' not found`);
    }

    if (userId && !isAdmin && order.userId !== userId) {
      throw new ForbiddenException('You do not have permission to view this order');
    }

    return this.mapToResponse(order);
  }

  async findAll(query: QueryOrdersDto): Promise<PaginatedResult<OrderResponse>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      ...(query.userId && { userId: query.userId }),
      ...(query.status && { status: query.status }),
    };

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: { items: true },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: orders.map((o) => this.mapToResponse(o)),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async cancel(id: string, userId?: string, isAdmin = false): Promise<OrderResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID '${id}' not found`);
    }

    if (userId && !isAdmin && order.userId !== userId) {
      throw new ForbiddenException('You do not have permission to cancel this order');
    }

    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot cancel order in '${order.status}' status. Only PENDING orders can be cancelled.`,
      );
    }

    // Atomic conditional status transition to prevent concurrent cancellation race conditions
    const updateResult = await this.prisma.order.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    if (updateResult.count === 0) {
      throw new BadRequestException(
        'Order could not be cancelled because its status has changed concurrently.',
      );
    }

    // Restore product stock after successful atomic cancellation
    for (const item of order.items) {
      try {
        await firstValueFrom(
          this.productClient
            .send(PRODUCT_PATTERNS.UPDATE_STOCK, {
              productId: item.productId,
              quantityDelta: item.quantity,
            })
            .pipe(timeout(RPC_TIMEOUT_MS)),
        );
      } catch (err) {
        this.logger.error(
          `Failed to restore stock for product ${item.productId} when cancelling order ${id}`,
          (err as Error).stack,
        );
      }
    }

    const updated = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    return this.mapToResponse(updated!);
  }

  async updateStatus(id: string, status: OrderStatus): Promise<OrderResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID '${id}' not found`);
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: { status },
      include: { items: true },
    });

    return this.mapToResponse(updated);
  }

  /**
   * Event-Driven Choreography Handler: Reacts to PaymentSucceededEvent.
   * Updates order status from PENDING to CONFIRMED.
   */
  async handlePaymentSucceeded(event: PaymentSucceededEvent): Promise<OrderResponse | null> {
    this.logger.log(`Handling '${event.status}' event for order ID: ${event.orderId}`);

    const order = await this.prisma.order.findUnique({
      where: { id: event.orderId },
      include: { items: true },
    });

    if (!order) {
      this.logger.warn(`Order ${event.orderId} not found when processing payment.succeeded`);
      return null;
    }

    if (order.status === 'PENDING') {
      const updated = await this.prisma.order.update({
        where: { id: event.orderId },
        data: { status: 'CONFIRMED' },
        include: { items: true },
      });

      if (this.kafkaProducer) {
        this.kafkaProducer
          .emitEvent(
            KAFKA_TOPICS.ORDER_EVENTS,
            ORDER_EVENTS.ORDER_CONFIRMED,
            updated.id,
            this.mapToResponse(updated),
            'order-service',
          )
          .catch((err) => {
            this.logger.warn(`Kafka order.confirmed emission failed: ${(err as Error).message}`);
          });
      }

      this.logger.log(`Order #${order.orderNumber} successfully CONFIRMED after payment.`);
      return this.mapToResponse(updated);
    }

    return this.mapToResponse(order);
  }

  /**
   * Event-Driven Choreography Handler: Reacts to PaymentFailedEvent.
   * Updates order status to CANCELLED and performs compensating stock restoration.
   */
  async handlePaymentFailed(event: PaymentFailedEvent): Promise<OrderResponse | null> {
    this.logger.log(`Handling payment failure for order ID: ${event.orderId}, Reason: ${event.reason}`);

    const order = await this.prisma.order.findUnique({
      where: { id: event.orderId },
      include: { items: true },
    });

    if (!order) {
      this.logger.warn(`Order ${event.orderId} not found when processing payment.failed`);
      return null;
    }

    if (order.status === 'PENDING') {
      // 1. Mark order as CANCELLED
      const updated = await this.prisma.order.update({
        where: { id: event.orderId },
        data: { status: 'CANCELLED' },
        include: { items: true },
      });

      if (this.kafkaProducer) {
        this.kafkaProducer
          .emitEvent(
            KAFKA_TOPICS.ORDER_EVENTS,
            ORDER_EVENTS.ORDER_CANCELLED,
            updated.id,
            this.mapToResponse(updated),
            'order-service',
          )
          .catch((err) => {
            this.logger.warn(`Kafka order.cancelled emission failed: ${(err as Error).message}`);
          });
      }

      // 2. Compensating transaction: Restore product stock
      for (const item of order.items) {
        try {
          await firstValueFrom(
            this.productClient
              .send(PRODUCT_PATTERNS.UPDATE_STOCK, {
                productId: item.productId,
                quantityDelta: item.quantity,
              })
              .pipe(timeout(RPC_TIMEOUT_MS)),
          );
        } catch (err) {
          this.logger.error(
            `Failed to restore stock for product ${item.productId} during payment failure compensation for order ${order.id}`,
            (err as Error).stack,
          );
        }
      }

      this.logger.log(
        `Order #${order.orderNumber} CANCELLED and stock compensated following payment failure.`,
      );
      return this.mapToResponse(updated);
    }

    return this.mapToResponse(order);
  }

  /**
   * Event-Driven Choreography Handler: Reacts to InventoryReservationFailedEvent.
   * Updates order status from PENDING to CANCELLED.
   */
  async handleInventoryReservationFailed(
    event: InventoryReservationFailedEvent,
  ): Promise<OrderResponse | null> {
    this.logger.warn(
      `Handling inventory reservation failure for order ID: ${event.orderId}, Reason: ${event.reason}`,
    );

    const order = await this.prisma.order.findUnique({
      where: { id: event.orderId },
      include: { items: true },
    });

    if (!order) {
      this.logger.warn(`Order ${event.orderId} not found when processing inventory.failed`);
      return null;
    }

    if (order.status === 'PENDING') {
      const updated = await this.prisma.order.update({
        where: { id: event.orderId },
        data: { status: 'CANCELLED' },
        include: { items: true },
      });

      if (this.kafkaProducer) {
        this.kafkaProducer
          .emitEvent(
            KAFKA_TOPICS.ORDER_EVENTS,
            ORDER_EVENTS.ORDER_CANCELLED,
            updated.id,
            this.mapToResponse(updated),
            'order-service',
          )
          .catch((err) => {
            this.logger.warn(`Kafka order.cancelled emission failed: ${(err as Error).message}`);
          });
      }

      this.logger.log(`Order #${order.orderNumber} CANCELLED due to out-of-stock inventory.`);
      return this.mapToResponse(updated);
    }


    return this.mapToResponse(order);
  }
}
