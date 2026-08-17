import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap(): Promise<void> {
  // bufferLogs: true — buffer logs until Pino logger is ready, so we don't miss startup logs
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Replace NestJS's default logger with our Pino instance
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3000;
  const nodeEnv = configService.get<string>('nodeEnv');

  /**
   * Global validation pipe.
   * Applies to ALL incoming HTTP requests automatically.
   *
   * whitelist: true — strips properties not declared in the DTO
   * forbidNonWhitelisted: true — throws 400 if unknown properties are sent
   * transform: true — auto-converts plain objects to DTO class instances
   *                   (needed for class-validator decorators to work)
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter — consistent error response shape for all errors
  app.useGlobalFilters(new GlobalExceptionFilter());

  /**
   * Graceful shutdown.
   * When Docker/k8s sends SIGTERM, NestJS will:
   * 1. Stop accepting new requests
   * 2. Wait for in-flight requests to complete
   * 3. Run OnModuleDestroy lifecycle hooks (closes DB connections, etc.)
   * 4. Exit cleanly
   *
   * Without this, the process exits immediately, potentially corrupting
   * in-flight operations or leaving DB connections open.
   */
  app.enableShutdownHooks();

  await app.listen(port);

  // This log appears in structured JSON format via Pino
  app.get(Logger).log(
    `API Gateway running on port ${port} [${nodeEnv}]`,
    'Bootstrap',
  );
}

bootstrap();
