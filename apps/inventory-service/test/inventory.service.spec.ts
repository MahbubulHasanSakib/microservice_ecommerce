import { Test, TestingModule } from '@nestjs/testing';
import { SERVICES } from '@ecommerce/shared';
import { InventoryService } from '../src/inventory/inventory.service';
import { InventoryController } from '../src/inventory/inventory.controller';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Inventory Service', () => {
  let service: InventoryService;
  let controller: InventoryController;
  let prisma: {
    inventoryItem: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    stockReservation: {
      findMany: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let orderRmqClient: { emit: jest.Mock };
  let paymentRmqClient: { emit: jest.Mock };
  let notificationRmqClient: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      inventoryItem: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      stockReservation: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    orderRmqClient = { emit: jest.fn() };
    paymentRmqClient = { emit: jest.fn() };
    notificationRmqClient = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: SERVICES.ORDER_SERVICE, useValue: orderRmqClient },
        { provide: SERVICES.PAYMENT_SERVICE, useValue: paymentRmqClient },
        { provide: SERVICES.NOTIFICATION_SERVICE, useValue: notificationRmqClient },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    controller = module.get<InventoryController>(InventoryController);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(controller).toBeDefined();
  });

  describe('restock', () => {
    it('should upsert stock and return inventory response', async () => {
      const mockItem = {
        id: 'inv-1',
        productId: 'prod-100',
        stockOnHand: 50,
        reservedStock: 0,
        lowStockThreshold: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.inventoryItem.upsert.mockResolvedValue(mockItem);

      const result = await service.restock({
        productId: 'prod-100',
        quantity: 50,
      });

      expect(result.productId).toBe('prod-100');
      expect(result.stockOnHand).toBe(50);
      expect(result.availableStock).toBe(50);
      expect(prisma.inventoryItem.upsert).toHaveBeenCalled();
    });
  });

  describe('checkStock', () => {
    it('should calculate available stock correctly', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          productId: 'prod-1',
          stockOnHand: 10,
          reservedStock: 3,
        },
      ]);

      const result = await service.checkStock({ productIds: ['prod-1', 'prod-2'] });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ productId: 'prod-1', availableStock: 7, isAvailable: true });
      expect(result[1]).toEqual({ productId: 'prod-2', availableStock: 0, isAvailable: false });
    });
  });
});
