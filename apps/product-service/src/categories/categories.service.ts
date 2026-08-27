import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoryResponse, RedisService } from '@ecommerce/shared';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async create(dto: CreateCategoryDto): Promise<CategoryResponse> {
    const existing = await this.prisma.category.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException(`Category with slug '${dto.slug}' already exists`);
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
      },
    });

    // Invalidate categories cache and product list cache
    await Promise.all([
      this.redis.delCache('categories:all'),
      this.redis.delCachePattern('products:list:*'),
    ]).catch((err) => {
      this.logger.warn(`Failed to evict category cache: ${err.message}`);
    });

    return category;
  }

  async findById(id: string): Promise<CategoryResponse> {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID '${id}' not found`);
    }

    return category;
  }

  async findAll(): Promise<CategoryResponse[]> {
    const cacheKey = 'categories:all';
    const cached = await this.redis.getCache<CategoryResponse[]>(cacheKey);
    if (cached) {
      this.logger.debug('Cache HIT for categories:all');
      return cached;
    }

    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });

    // Cache categories for 30 minutes with jitter
    await this.redis.setCache(cacheKey, categories, 1800).catch((err) => {
      this.logger.warn(`Failed to cache categories: ${err.message}`);
    });

    return categories;
  }
}
