import { initTracing, RABBITMQ_EXCHANGES, RABBITMQ_QUEUES } from '@ecommerce/shared';
initTracing('notification-service');

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(Logger);
  app.useLogger(logger);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 3007);
  const rabbitmqUrl = configService.get<string>('rabbitmq.url', 'amqp://guest:guest@localhost:5672');
  const notificationQueue = configService.get<string>(
    'rabbitmq.notificationQueue',
    RABBITMQ_QUEUES.NOTIFICATION_QUEUE,
  );

  // Connect RabbitMQ Microservice Consumer with Dead-Letter Queue (DLQ) support
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: notificationQueue,
      noAck: false, // Enable explicit manual ACK / NACK
      queueOptions: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': RABBITMQ_EXCHANGES.DLX_EXCHANGE,
          'x-dead-letter-routing-key': RABBITMQ_QUEUES.NOTIFICATION_DLQ,
        },
      },
    },
  });

  app.enableShutdownHooks();

  await app.startAllMicroservices();
  logger.log(`Notification RMQ Consumer listening on queue: ${notificationQueue} (DLQ: ${RABBITMQ_QUEUES.NOTIFICATION_DLQ})`);

  await app.listen(port);
  logger.log(`Notification Service HTTP (Health/Metrics) running on port: ${port}`);
}

bootstrap();
