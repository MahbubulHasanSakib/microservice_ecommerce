import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  CheckStockDto,
  INVENTORY_PATTERNS,
  InventoryItemResponse,
  ReleaseStockDto,
  ReserveStockDto,
  RestockDto,
  StockAvailabilityResponse,
} from '@ecommerce/shared';
import { InventoryService } from './inventory.service';

@Controller()
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}


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

