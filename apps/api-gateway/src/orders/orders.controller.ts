import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import {
  AuthenticatedUser,
  CircuitBreaker,
  CircuitBreakerError,
  ORDER_PATTERNS,
  OrderResponse,
  OrderStatus,
  PaginatedResult,
  Role,
  SERVICES,
} from '@ecommerce/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';

const RPC_TIMEOUT_MS = 5000;

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  private readonly circuitBreaker = new CircuitBreaker({
    name: 'OrderServiceCircuitBreaker',
    failureThreshold: 5,
    resetTimeoutMs: 10000,
  });

  constructor(
    @Inject(SERVICES.ORDER_SERVICE)
    private readonly orderClient: ClientProxy,
  ) {}

  /**
   * POST /orders
   * Authenticated: Place a new order with idempotency protection and circuit breaker.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponse> {
    try {
      return await this.circuitBreaker.execute(async () => {
        return await firstValueFrom(
          this.orderClient
            .send<OrderResponse>(ORDER_PATTERNS.CREATE, {
              userId: user.userId,
              userEmail: user.email,
              items: dto.items,
              shippingAddress: dto.shippingAddress,
            })
            .pipe(timeout(RPC_TIMEOUT_MS)),
        );
      });
    } catch (err) {
      if (err instanceof CircuitBreakerError) {
        throw new ServiceUnavailableException(
          'Order Service is currently unavailable. Circuit is open; please retry shortly.',
        );
      }
      throw err;
    }
  }

  /**
   * GET /orders/me
   * Authenticated: List current authenticated user's orders with pagination.
   */
  @Get('me')
  async getMyOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryOrdersDto,
  ): Promise<PaginatedResult<OrderResponse>> {
    return firstValueFrom(
      this.orderClient
        .send<PaginatedResult<OrderResponse>>(ORDER_PATTERNS.FIND_BY_USER, {
          query: { ...query, userId: user.userId },
        })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * GET /orders/:id
   * Authenticated: Retrieve order details. Users can only view their own orders; admins can view any.
   */
  @Get(':id')
  async getOrderById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<OrderResponse> {
    const isAdmin = user.roles.includes(Role.ADMIN);
    return firstValueFrom(
      this.orderClient
        .send<OrderResponse>(ORDER_PATTERNS.FIND_BY_ID, {
          id,
          userId: user.userId,
          isAdmin,
        })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * POST /orders/:id/cancel
   * Authenticated: Cancel an order if it is still PENDING.
   */
  @Post(':id/cancel')
  async cancelOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<OrderResponse> {
    const isAdmin = user.roles.includes(Role.ADMIN);
    return firstValueFrom(
      this.orderClient
        .send<OrderResponse>(ORDER_PATTERNS.CANCEL, {
          id,
          userId: user.userId,
          isAdmin,
        })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * PATCH /orders/:id/status
   * Protected (Admin-only): Update order fulfillment status.
   */
  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async updateOrderStatus(
    @Param('id') id: string,
    @Body('status') status: OrderStatus,
  ): Promise<OrderResponse> {
    return firstValueFrom(
      this.orderClient
        .send<OrderResponse>(ORDER_PATTERNS.UPDATE_STATUS, { id, status })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }
}
