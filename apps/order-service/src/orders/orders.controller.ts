import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ORDER_PATTERNS, OrderResponse, OrderStatus, PaginatedResult } from '@ecommerce/shared';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { QueryOrdersDto } from './dto/query-orders.dto';

@Controller()
export class OrdersController {
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
}
