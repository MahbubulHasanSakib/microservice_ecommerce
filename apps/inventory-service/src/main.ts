import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { RABBITMQ_EXCHANGES, RABBITMQ_QUEUES } from '@ecommerce/shared';
import { AppModule } from './app.module';
import { RpcExceptionFilter } from './common/filters/rpc-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const tcpPort = configService.get<number>('tcpPort', 3006);
  const httpPort = configService.get<number>('httpPort', 3016);
  const nodeEnv = configService.get<string>('nodeEnv', 'development');
  const rabbitmqUrl = configService.get<string>('rabbitmq.url', 'amqp://guest:guest@localhost:5672');
  const inventoryQueue = configService.get<string>(
    'rabbitmq.inventoryQueue',
    RABBITMQ_QUEUES.INVENTORY_QUEUE,
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new RpcExceptionFilter());

  // 1. Attach TCP Microservice Listener for synchronous RPC commands
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: tcpPort,
    },
  });

  // 2. Attach RabbitMQ Microservice Consumer with Dead-Letter Queue (DLQ) support
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: inventoryQueue,
      noAck: false, // Enable manual acknowledgment
      queueOptions: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': RABBITMQ_EXCHANGES.DLX_EXCHANGE,
          'x-dead-letter-routing-key': RABBITMQ_QUEUES.INVENTORY_DLQ,
        },
      },
    },
  });

  app.enableShutdownHooks();

  await app.startAllMicroservices();
  await app.listen(httpPort);

  app
    .get(Logger)
    .log(
      `Inventory Service running — TCP :${tcpPort}, HTTP :${httpPort}, RMQ Queue :${inventoryQueue} (DLQ: ${RABBITMQ_QUEUES.INVENTORY_DLQ}) [${nodeEnv}]`,
    );
}

bootstrap();
