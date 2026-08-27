import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProductsService } from '../src/products/products.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '@ecommerce/shared';
import { Prisma } from '../prisma/client';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: {
    product: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    category: {
      findUnique: jest.Mock;
    };
  };
  let redis: {
    getCache: jest.Mock;
    setCache: jest.Mock;
    delCache: jest.Mock;
    delCachePattern: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      category: {
        findUnique: jest.fn(),
      },
    };

    redis = {
      getCache: jest.fn().mockResolvedValue(null),
      setCache: jest.fn().mockResolvedValue(undefined),
      delCache: jest.fn().mockResolvedValue(undefined),
      delCachePattern: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: RedisService,
          useValue: redis,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should successfully create a product and invalidate cache', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      prisma.category.findUnique.mockResolvedValue({ id: 'cat-1', name: 'Electronics' });
      prisma.product.create.mockResolvedValue({
        id: 'prod-1',
        name: 'Keyboard',
        slug: 'keyboard',
        description: 'Mechanical keyboard',
        price: new Prisma.Decimal(99.99),
        stock: 50,
        sku: 'KEY-001',
        categoryId: 'cat-1',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: {
          id: 'cat-1',
          name: 'Electronics',
          slug: 'electronics',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const result = await service.create({
        name: 'Keyboard',
        slug: 'keyboard',
        description: 'Mechanical keyboard',
        price: 99.99,
        stock: 50,
        sku: 'KEY-001',
        categoryId: 'cat-1',
      });

      expect(result.id).toEqual('prod-1');
      expect(result.price).toEqual(99.99);
      expect(result.stock).toEqual(50);
      expect(redis.delCachePattern).toHaveBeenCalledWith('products:list:*');
    });

    it('should throw ConflictException if slug already exists', async () => {
      prisma.product.findUnique.mockResolvedValueOnce({ id: 'prod-existing' });

      await expect(
        service.create({
          name: 'Keyboard',
          slug: 'keyboard',
          price: 99.99,
          stock: 50,
          sku: 'KEY-001',
          categoryId: 'cat-1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findById', () => {
    it('should return cached product if cache hit exists', async () => {
      const cachedProduct = {
        id: 'prod-1',
        name: 'Cached Keyboard',
        slug: 'cached-keyboard',
        price: 99.99,
        stock: 50,
        sku: 'KEY-001',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      redis.getCache.mockResolvedValue(cachedProduct);

      const result = await service.findById('prod-1');

      expect(result).toEqual(cachedProduct);
      expect(prisma.product.findUnique).not.toHaveBeenCalled();
    });

    it('should query database and populate cache on cache miss', async () => {
      redis.getCache.mockResolvedValue(null);
      prisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        name: 'Keyboard',
        slug: 'keyboard',
        description: 'Mechanical keyboard',
        price: new Prisma.Decimal(99.99),
        stock: 50,
        sku: 'KEY-001',
        categoryId: 'cat-1',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: null,
      });

      const result = await service.findById('prod-1');

      expect(result.id).toEqual('prod-1');
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        include: { category: true },
      });
      expect(redis.setCache).toHaveBeenCalledWith('product:prod-1', expect.any(Object), 600);
    });

    it('should throw NotFoundException if product does not exist', async () => {
      redis.getCache.mockResolvedValue(null);
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.findById('non-existing-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return cached products list if cache hit exists', async () => {
      const cachedList = {
        data: [{ id: 'prod-1', name: 'Keyboard' }],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      };
      redis.getCache.mockResolvedValue(cachedList);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result).toEqual(cachedList);
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });

    it('should return paginated list and cache result on cache miss', async () => {
      redis.getCache.mockResolvedValue(null);
      prisma.product.count.mockResolvedValue(1);
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'prod-1',
          name: 'Keyboard',
          slug: 'keyboard',
          description: 'Mechanical keyboard',
          price: new Prisma.Decimal(99.99),
          stock: 50,
          sku: 'KEY-001',
          categoryId: 'cat-1',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          category: null,
        },
      ]);

      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toEqual(1);
      expect(result.meta.totalPages).toEqual(1);
      expect(redis.setCache).toHaveBeenCalled();
    });
  });

  describe('updateStock', () => {
    it('should throw BadRequestException if atomic decrement matches 0 rows due to insufficient stock', async () => {
      prisma.product.updateMany.mockResolvedValue({ count: 0 });
      prisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        name: 'Keyboard',
        stock: 2,
      });

      await expect(service.updateStock({ productId: 'prod-1', quantityDelta: -5 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should atomically decrement stock and invalidate cache when stock is available', async () => {
      prisma.product.updateMany.mockResolvedValue({ count: 1 });
      prisma.product.findUnique.mockResolvedValue({
        id: 'prod-1',
        name: 'Keyboard',
        slug: 'keyboard',
        description: null,
        price: new Prisma.Decimal(99.99),
        stock: 45,
        sku: 'KEY-001',
        categoryId: 'cat-1',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        category: null,
      });

      const result = await service.updateStock({ productId: 'prod-1', quantityDelta: -5 });
      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'prod-1',
          stock: { gte: 5 },
        },
        data: {
          stock: { decrement: 5 },
        },
      });
      expect(result.stock).toEqual(45);
      expect(redis.delCache).toHaveBeenCalledWith('product:prod-1');
      expect(redis.delCachePattern).toHaveBeenCalledWith('products:list:*');
    });
  });
});
