import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { SERVICES } from '@ecommerce/shared';
import { ProductsController } from '../src/products/products.controller';

describe('Gateway ProductsController', () => {
  let controller: ProductsController;
  let productClient: {
    send: jest.Mock;
  };

  beforeEach(async () => {
    productClient = {
      send: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        {
          provide: SERVICES.PRODUCT_SERVICE,
          useValue: productClient,
        },
      ],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should forward list products query to Product Service via TCP', async () => {
    const mockResponse = {
      data: [
        {
          id: 'prod-1',
          name: 'Gaming Mouse',
          slug: 'gaming-mouse',
          price: 59.99,
          stock: 20,
          sku: 'MOU-001',
          categoryId: 'cat-1',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      meta: {
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };

    productClient.send.mockReturnValue(of(mockResponse));

    const result = await controller.listProducts({ page: 1, limit: 10 });
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(productClient.send).toHaveBeenCalled();
  });

  it('should forward get product by id to Product Service', async () => {
    const mockProduct = {
      id: 'prod-1',
      name: 'Gaming Mouse',
      price: 59.99,
    };

    productClient.send.mockReturnValue(of(mockProduct));

    const result = await controller.getProductById('prod-1');
    expect(result.id).toBe('prod-1');
  });
});
