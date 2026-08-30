import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SERVICES } from '@ecommerce/shared';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OutboxProcessor } from './outbox.processor';
import { OrdersKafkaConsumer } from './orders-kafka.consumer';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: SERVICES.PRODUCT_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: configService.get<string>('productService.host', 'localhost'),
            port: configService.get<number>('productService.port', 3003),
          },
        }),
      },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OutboxProcessor, OrdersKafkaConsumer],
  exports: [OrdersService, OutboxProcessor, OrdersKafkaConsumer],
})
export class OrdersModule {}

