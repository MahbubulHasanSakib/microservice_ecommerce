import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RABBITMQ_EXCHANGES, RABBITMQ_QUEUES, SERVICES } from '@ecommerce/shared';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: SERVICES.ORDER_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get<string>('rabbitmq.url', 'amqp://guest:guest@localhost:5672')],
            queue: configService.get<string>('rabbitmq.orderQueue', 'order.queue'),
            queueOptions: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': RABBITMQ_EXCHANGES.DLX_EXCHANGE,
                'x-dead-letter-routing-key': RABBITMQ_QUEUES.ORDER_DLQ,
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
    ]),
  ],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
