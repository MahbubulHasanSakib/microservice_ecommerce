import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IncomingMessage, ServerResponse } from 'http';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware';

/**
 * LoggerModule
 *
 * Configures Pino as the NestJS logger via nestjs-pino.
 *
 * WHY PINO OVER WINSTON OR console.log:
 * - Pino outputs newline-delimited JSON — machine-readable by log aggregators
 *   like Datadog, CloudWatch, and Loki out of the box.
 * - It's the fastest Node.js logger (benchmarked), important for high-throughput services.
 * - pino-pretty gives beautiful dev output without changing the production format.
 *
 * WHY NOT console.log:
 * console.log outputs unstructured text. You cannot easily search, filter,
 * or alert on unstructured logs at scale. Every log line here is a JSON object
 * with consistent fields that log aggregators can index.
 *
 * WHAT GETS LOGGED:
 * - Every HTTP request and response (method, url, status, duration)
 * - The correlation ID on every log line
 * - Application-level logs from services that inject Logger
 *
 * WHAT IS NEVER LOGGED:
 * - Request bodies (could contain passwords)
 * - Authorization headers (contain tokens)
 * - Any field named password, token, secret, or key
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get<string>('nodeEnv') === 'production';

        return {
          pinoHttp: {
            level: isProduction ? 'info' : 'debug',
            // In development: pretty-printed colored output
            // In production: raw JSON for log aggregators
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                  },
                },
            // Attach the correlation ID to every log line automatically
            customProps: (req: IncomingMessage) => ({
              correlationId: req.headers[CORRELATION_ID_HEADER],
            }),
            // Redact sensitive fields — these are NEVER written to logs
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.token',
                'req.body.secret',
              ],
              remove: true,
            },
            // Serialize only what we need — not the entire request/response object
            serializers: {
              req: (req: IncomingMessage) => ({
                method: req.method,
                url: req.url,
                // Intentionally NOT logging req.body or auth headers
              }),
              res: (res: ServerResponse) => ({
                statusCode: res.statusCode,
              }),
            },
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
