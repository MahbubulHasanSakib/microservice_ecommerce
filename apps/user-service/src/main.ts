import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { RpcExceptionFilter } from './common/filters/rpc-exception.filter';

/**
 * User Service Bootstrap
 *
 * Runs TCP listener (port 3001) for business RPC operations and
 * HTTP listener (port 3011) for health probes.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const tcpPort = configService.get<number>('tcpPort') ?? 3001;
  const httpPort = configService.get<number>('httpPort') ?? 3011;
  const nodeEnv = configService.get<string>('nodeEnv');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Attach global RPC exception filter to serialize domain errors over TCP
  app.useGlobalFilters(new RpcExceptionFilter());

  // Attach TCP microservice listener
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: tcpPort,
    },
  });

  app.enableShutdownHooks();

  await app.startAllMicroservices();
  await app.listen(httpPort);

  app
    .get(Logger)
    .log(`User Service running — TCP :${tcpPort}, HTTP :${httpPort} [${nodeEnv}]`, 'Bootstrap');
}

bootstrap();
