import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import {
  CATEGORY_PATTERNS,
  CategoryResponse,
  PaginatedResult,
  PRODUCT_PATTERNS,
  ProductResponse,
  Role,
  SERVICES,
} from '@ecommerce/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { CreateCategoryDto } from './dto/create-category.dto';

const RPC_TIMEOUT_MS = 5000;

@Controller()
export class ProductsController {
  constructor(
    @Inject(SERVICES.PRODUCT_SERVICE)
    private readonly productClient: ClientProxy,
  ) {}

  /**
   * GET /categories
   * Public: List all product categories.
   */
  @Get('categories')
  async listCategories(): Promise<CategoryResponse[]> {
    return firstValueFrom(
      this.productClient
        .send<CategoryResponse[]>(CATEGORY_PATTERNS.LIST, {})
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * POST /categories
   * Protected (Admin-only): Create a new category.
   */
  @Post('categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createCategory(@Body() dto: CreateCategoryDto): Promise<CategoryResponse> {
    return firstValueFrom(
      this.productClient
        .send<CategoryResponse>(CATEGORY_PATTERNS.CREATE, dto)
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * GET /products
   * Public: List products with pagination, search, category, and price filtering.
   */
  @Get('products')
  async listProducts(@Query() query: QueryProductsDto): Promise<PaginatedResult<ProductResponse>> {
    return firstValueFrom(
      this.productClient
        .send<PaginatedResult<ProductResponse>>(PRODUCT_PATTERNS.LIST, query)
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * GET /products/:id
   * Public: Get product by ID.
   */
  @Get('products/:id')
  async getProductById(@Param('id') id: string): Promise<ProductResponse> {
    return firstValueFrom(
      this.productClient
        .send<ProductResponse>(PRODUCT_PATTERNS.FIND_BY_ID, { id })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * POST /products
   * Protected (Admin-only): Create a product.
   */
  @Post('products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createProduct(@Body() dto: CreateProductDto): Promise<ProductResponse> {
    return firstValueFrom(
      this.productClient
        .send<ProductResponse>(PRODUCT_PATTERNS.CREATE, dto)
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * PATCH /products/:id
   * Protected (Admin-only): Update a product.
   */
  @Patch('products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponse> {
    return firstValueFrom(
      this.productClient
        .send<ProductResponse>(PRODUCT_PATTERNS.UPDATE, { id, dto })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * DELETE /products/:id
   * Protected (Admin-only): Delete a product.
   */
  @Delete('products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async deleteProduct(@Param('id') id: string): Promise<{ success: boolean; message: string }> {
    return firstValueFrom(
      this.productClient
        .send<{ success: boolean; message: string }>(PRODUCT_PATTERNS.DELETE, { id })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }
}
