import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PaginatedResult, PRODUCT_PATTERNS, ProductResponse } from '@ecommerce/shared';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateStockDto } from './dto/update-stock.dto';

@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @MessagePattern(PRODUCT_PATTERNS.CREATE)
  async create(@Payload() dto: CreateProductDto): Promise<ProductResponse> {
    return this.productsService.create(dto);
  }

  @MessagePattern(PRODUCT_PATTERNS.UPDATE)
  async update(@Payload() data: { id: string; dto: UpdateProductDto }): Promise<ProductResponse> {
    return this.productsService.update(data.id, data.dto);
  }

  @MessagePattern(PRODUCT_PATTERNS.DELETE)
  async delete(@Payload() data: { id: string }): Promise<{ success: boolean; message: string }> {
    return this.productsService.delete(data.id);
  }

  @MessagePattern(PRODUCT_PATTERNS.FIND_BY_ID)
  async findById(@Payload() data: { id: string }): Promise<ProductResponse> {
    return this.productsService.findById(data.id);
  }

  @MessagePattern(PRODUCT_PATTERNS.FIND_BY_IDS)
  async findByIds(@Payload() data: { ids: string[] }): Promise<ProductResponse[]> {
    return this.productsService.findByIds(data.ids);
  }

  @MessagePattern(PRODUCT_PATTERNS.LIST)
  async findAll(@Payload() query: QueryProductsDto): Promise<PaginatedResult<ProductResponse>> {
    return this.productsService.findAll(query);
  }

  @MessagePattern(PRODUCT_PATTERNS.UPDATE_STOCK)
  async updateStock(@Payload() dto: UpdateStockDto): Promise<ProductResponse> {
    return this.productsService.updateStock(dto);
  }
}
