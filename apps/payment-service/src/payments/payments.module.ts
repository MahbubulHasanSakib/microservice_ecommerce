import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RABBITMQ_EXCHANGES, RABBITMQ_QUEUES, SERVICES } from '@ecommerce/shared';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

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
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
