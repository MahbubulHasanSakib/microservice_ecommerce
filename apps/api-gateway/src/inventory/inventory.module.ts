import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SERVICES } from '@ecommerce/shared';
import { InventoryController } from './inventory.controller';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: SERVICES.INVENTORY_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('inventoryService.host', 'localhost'),
            port: configService.get<number>('inventoryService.port', 3006),
          },
        }),
      },
    ]),
  ],
  controllers: [InventoryController],
})
export class InventoryModule {}
