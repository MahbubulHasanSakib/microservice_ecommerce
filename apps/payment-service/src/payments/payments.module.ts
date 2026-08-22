import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'ORDER_RMQ_CLIENT',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get<string>('rabbitmq.url', 'amqp://guest:guest@localhost:5672')],
            queue: configService.get<string>('rabbitmq.orderQueue', 'order.queue'),
            queueOptions: {
              durable: true,
            },
          },
        }),
      },
      {
        name: 'NOTIFICATION_RMQ_CLIENT',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.get<string>('rabbitmq.url', 'amqp://guest:guest@localhost:5672')],
            queue: configService.get<string>('rabbitmq.notificationQueue', 'notification.queue'),
            queueOptions: {
              durable: true,
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
