import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { RpcExceptionFilter } from './common/filters/rpc-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const tcpPort = configService.get<number>('tcpPort', 3005);
  const httpPort = configService.get<number>('httpPort', 3015);
  const nodeEnv = configService.get<string>('nodeEnv', 'development');
  const rabbitmqUrl = configService.get<string>('rabbitmq.url', 'amqp://guest:guest@localhost:5672');
  const paymentQueue = configService.get<string>('rabbitmq.paymentQueue', 'payment.queue');

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

  // 2. Attach RabbitMQ Microservice Consumer for asynchronous domain events
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: paymentQueue,
      noAck: false, // Enable manual acknowledgment
      queueOptions: {
        durable: true,
      },
    },
  });

  app.enableShutdownHooks();

  await app.startAllMicroservices();
  await app.listen(httpPort);

  app
    .get(Logger)
    .log(
      `Payment Service running — TCP :${tcpPort}, HTTP :${httpPort}, RMQ Queue :${paymentQueue} [${nodeEnv}]`,
      'Bootstrap',
    );
}

bootstrap();
