import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import {
  INVENTORY_PATTERNS,
  InventoryItemResponse,
  RestockDto,
  Role,
  SERVICES,
} from '@ecommerce/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

const RPC_TIMEOUT_MS = 5000;

@Controller('inventory')
export class InventoryController {
  constructor(
    @Inject(SERVICES.INVENTORY_SERVICE)
    private readonly inventoryClient: ClientProxy,
  ) {}

  @Get()
  async list(): Promise<InventoryItemResponse[]> {
    return firstValueFrom(
      this.inventoryClient
        .send<InventoryItemResponse[]>(INVENTORY_PATTERNS.LIST, {})
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  @Get('products/:productId')
  async getByProductId(@Param('productId') productId: string): Promise<InventoryItemResponse> {
    return firstValueFrom(
      this.inventoryClient
        .send<InventoryItemResponse>(INVENTORY_PATTERNS.GET_BY_PRODUCT_ID, { productId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  @Post('restock')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async restock(@Body() dto: RestockDto): Promise<InventoryItemResponse> {
    return firstValueFrom(
      this.inventoryClient
        .send<InventoryItemResponse>(INVENTORY_PATTERNS.RESTOCK, dto)
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }
}
