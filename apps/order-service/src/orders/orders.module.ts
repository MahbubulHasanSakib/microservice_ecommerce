import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RABBITMQ_EXCHANGES, RABBITMQ_QUEUES, SERVICES } from '@ecommerce/shared';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OutboxProcessor } from './outbox.processor';

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
      {
        name: SERVICES.NOTIFICATION_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get<string>('rabbitmq.url', 'amqp://guest:guest@localhost:5672')],
            queue: configService.get<string>('rabbitmq.notificationQueue', 'notification.queue'),
            queueOptions: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': RABBITMQ_EXCHANGES.DLX_EXCHANGE,
                'x-dead-letter-routing-key': RABBITMQ_QUEUES.NOTIFICATION_DLQ,
              },
            },
          },
        }),
      },
      {
        name: SERVICES.INVENTORY_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get<string>('rabbitmq.url', 'amqp://guest:guest@localhost:5672')],
            queue: configService.get<string>('rabbitmq.inventoryQueue', 'inventory.queue'),
            queueOptions: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': RABBITMQ_EXCHANGES.DLX_EXCHANGE,
                'x-dead-letter-routing-key': RABBITMQ_QUEUES.INVENTORY_DLQ,
              },
            },
          },
        }),
      },
      {
        name: SERVICES.PAYMENT_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get<string>('rabbitmq.url', 'amqp://guest:guest@localhost:5672')],
            queue: configService.get<string>('rabbitmq.paymentQueue', 'payment.queue'),
            queueOptions: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': RABBITMQ_EXCHANGES.DLX_EXCHANGE,
                'x-dead-letter-routing-key': RABBITMQ_QUEUES.PAYMENT_DLQ,
              },
            },
          },
        }),
      },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OutboxProcessor],
  exports: [OrdersService, OutboxProcessor],
})
export class OrdersModule {}
