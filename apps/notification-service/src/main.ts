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
    'notification.queue',
  );

  // Connect RabbitMQ Microservice Consumer
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: notificationQueue,
      noAck: false, // Enable explicit manual ACK / NACK
      queueOptions: {
        durable: true,
      },
    },
  });

  app.enableShutdownHooks();

  await app.startAllMicroservices();
  logger.log(`Notification RMQ Consumer listening on queue: ${notificationQueue}`);

  await app.listen(port);
  logger.log(`Notification Service HTTP (Health/Metrics) running on port: ${port}`);
}

bootstrap();
