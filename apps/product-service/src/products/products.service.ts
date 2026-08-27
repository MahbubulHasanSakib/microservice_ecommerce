import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { PaginatedResult, ProductResponse, RedisService } from '@ecommerce/shared';
import { Prisma } from '../../prisma/client';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private mapToResponse(
    product: Prisma.ProductGetPayload<{ include: { category: true } }>,
  ): ProductResponse {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: Number(product.price),
      stock: product.stock,
      sku: product.sku,
      categoryId: product.categoryId,
      category: product.category
        ? {
            id: product.category.id,
            name: product.category.name,
            slug: product.category.slug,
            description: product.category.description,
            createdAt: product.category.createdAt,
            updatedAt: product.category.updatedAt,
          }
        : undefined,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  async create(dto: CreateProductDto): Promise<ProductResponse> {
    const existingSlug = await this.prisma.product.findUnique({
      where: { slug: dto.slug },
    });
    if (existingSlug) {
      throw new ConflictException(`Product with slug '${dto.slug}' already exists`);
    }

    const existingSku = await this.prisma.product.findUnique({
      where: { sku: dto.sku },
    });
    if (existingSku) {
      throw new ConflictException(`Product with SKU '${dto.sku}' already exists`);
    }

    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException(`Category with ID '${dto.categoryId}' not found`);
    }

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        price: new Prisma.Decimal(dto.price),
        stock: dto.stock,
        sku: dto.sku,
        categoryId: dto.categoryId,
        isActive: dto.isActive ?? true,
      },
      include: { category: true },
    });

    const response = this.mapToResponse(product);
    // Invalidate product listings cache
    await this.redis.delCachePattern('products:list:*').catch((err) => {
      this.logger.warn(`Failed to evict products:list cache: ${err.message}`);
    });

    return response;
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID '${id}' not found`);
    }

    if (dto.slug && dto.slug !== product.slug) {
      const existingSlug = await this.prisma.product.findUnique({
        where: { slug: dto.slug },
      });
      if (existingSlug) {
        throw new ConflictException(`Product with slug '${dto.slug}' already exists`);
      }
    }

    if (dto.sku && dto.sku !== product.sku) {
      const existingSku = await this.prisma.product.findUnique({
        where: { sku: dto.sku },
      });
      if (existingSku) {
        throw new ConflictException(`Product with SKU '${dto.sku}' already exists`);
      }
    }

    if (dto.categoryId && dto.categoryId !== product.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException(`Category with ID '${dto.categoryId}' not found`);
      }
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.price !== undefined && { price: new Prisma.Decimal(dto.price) }),
        ...(dto.stock !== undefined && { stock: dto.stock }),
        ...(dto.sku !== undefined && { sku: dto.sku }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { category: true },
    });

    const response = this.mapToResponse(updated);

    // Evict cached individual product and listings
    await Promise.all([
      this.redis.delCache(`product:${id}`),
      this.redis.delCachePattern('products:list:*'),
    ]).catch((err) => {
      this.logger.warn(`Failed to evict cache on product update: ${err.message}`);
    });

    return response;
  }

  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundException(`Product with ID '${id}' not found`);
    }

    await this.prisma.product.delete({
      where: { id },
    });

    // Invalidate product cache
    await Promise.all([
      this.redis.delCache(`product:${id}`),
      this.redis.delCachePattern('products:list:*'),
    ]).catch((err) => {
      this.logger.warn(`Failed to evict cache on product delete: ${err.message}`);
    });

    return { success: true, message: `Product ${id} deleted successfully` };
  }

  async findById(id: string): Promise<ProductResponse> {
    const cacheKey = `product:${id}`;
    const cached = await this.redis.getCache<ProductResponse>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache HIT for product ${id}`);
      return cached;
    }

    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${id}' not found`);
    }

    const response = this.mapToResponse(product);
    // Cache for 10 minutes with jitter
    await this.redis.setCache(cacheKey, response, 600).catch((err) => {
      this.logger.warn(`Failed to populate product cache: ${err.message}`);
    });

    return response;
  }

  async findByIds(ids: string[]): Promise<ProductResponse[]> {
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: ids },
      },
      include: { category: true },
    });

    return products.map((p) => this.mapToResponse(p));
  }

  async findAll(query: QueryProductsDto): Promise<PaginatedResult<ProductResponse>> {
    const cacheKey = `products:list:${JSON.stringify(query)}`;
    const cached = await this.redis.getCache<PaginatedResult<ProductResponse>>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache HIT for query products list`);
      return cached;
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { sku: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
      ...((query.minPrice !== undefined || query.maxPrice !== undefined) && {
        price: {
          ...(query.minPrice !== undefined && { gte: new Prisma.Decimal(query.minPrice) }),
          ...(query.maxPrice !== undefined && { lte: new Prisma.Decimal(query.maxPrice) }),
        },
      }),
    };

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: { category: true },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    const result: PaginatedResult<ProductResponse> = {
      data: products.map((p) => this.mapToResponse(p)),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };

    // Cache list query for 2 minutes
    await this.redis.setCache(cacheKey, result, 120).catch((err) => {
      this.logger.warn(`Failed to populate products:list cache: ${err.message}`);
    });

    return result;
  }

  async updateStock(dto: UpdateStockDto): Promise<ProductResponse> {
    if (dto.quantityDelta === 0) {
      const product = await this.prisma.product.findUnique({
        where: { id: dto.productId },
        include: { category: true },
      });
      if (!product) {
        throw new NotFoundException(`Product with ID '${dto.productId}' not found`);
      }
      return this.mapToResponse(product);
    }

    if (dto.quantityDelta < 0) {
      const decrementAmount = Math.abs(dto.quantityDelta);

      // Atomic conditional decrement in PostgreSQL
      const updateResult = await this.prisma.product.updateMany({
        where: {
          id: dto.productId,
          stock: { gte: decrementAmount },
        },
        data: {
          stock: { decrement: decrementAmount },
        },
      });

      if (updateResult.count === 0) {
        const existing = await this.prisma.product.findUnique({
          where: { id: dto.productId },
        });

        if (!existing) {
          throw new NotFoundException(`Product with ID '${dto.productId}' not found`);
        }

        throw new BadRequestException(
          `Insufficient stock for product '${existing.name}'. Current stock: ${existing.stock}, Requested decrement: ${decrementAmount}`,
        );
      }
    } else {
      // Atomic increment for stock addition/restoration
      try {
        await this.prisma.product.update({
          where: { id: dto.productId },
          data: {
            stock: { increment: dto.quantityDelta },
          },
        });
      } catch (error) {
        throw new NotFoundException(`Product with ID '${dto.productId}' not found`);
      }
    }

    const updatedProduct = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { category: true },
    });

    const response = this.mapToResponse(updatedProduct!);

    // Evict cached product and listings
    await Promise.all([
      this.redis.delCache(`product:${dto.productId}`),
      this.redis.delCachePattern('products:list:*'),
    ]).catch((err) => {
      this.logger.warn(`Failed to evict cache on stock update: ${err.message}`);
    });

    return response;
  }
}
