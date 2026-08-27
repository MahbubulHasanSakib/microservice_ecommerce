import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, of, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { IdempotencyStatus } from '@ecommerce/shared';
import { RedisService } from '../redis/redis.service';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
  };
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly redisService: RedisService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthenticatedRequest>();
    const res = http.getResponse<Response>();

    // Only apply idempotency to mutating HTTP methods
    const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    if (!mutatingMethods.includes(req.method.toUpperCase())) {
      return next.handle();
    }

    const idempotencyKey = (
      req.headers['idempotency-key'] ||
      req.headers['x-idempotency-key']
    ) as string | undefined;

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return next.handle();
    }

    const trimmedKey = idempotencyKey.trim();
    if (!trimmedKey || trimmedKey.length > 128) {
      return next.handle();
    }

    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      'anonymous';

    const identifier = req.user?.id ? `user:${req.user.id}` : `ip:${clientIp}`;
    const storageKey = `${identifier}:${trimmedKey}`;

    try {
      const existing = await this.redisService.getIdempotencyRecord(storageKey);

      if (existing) {
        if (existing.status === IdempotencyStatus.PENDING) {
          this.logger.warn(
            `Concurrent request in progress for Idempotency-Key: ${trimmedKey}`,
          );
          throw new ConflictException(
            'A request with this Idempotency-Key is currently in progress. Please retry shortly.',
          );
        }

        if (existing.status === IdempotencyStatus.RESOLVED) {
          this.logger.log(
            `Replaying cached idempotent response for Idempotency-Key: ${trimmedKey}`,
          );
          res.status(existing.statusCode ?? 200);
          res.setHeader('X-Idempotent-Replay', 'true');
          res.setHeader('X-Cache-Lookup', 'HIT');
          return of(existing.body);
        }
      }

      // Atomically create PENDING idempotency lock with 60-second processing TTL
      const acquired = await this.redisService.createPendingIdempotency(storageKey, 60);
      if (!acquired) {
        throw new ConflictException(
          'Concurrent request with this Idempotency-Key detected.',
        );
      }

      return next.handle().pipe(
        tap(async (responseBody) => {
          try {
            await this.redisService.resolveIdempotency(
              storageKey,
              {
                statusCode: res.statusCode || 200,
                body: responseBody,
              },
              86400, // Retain resolved idempotency response for 24 hours
            );
          } catch (saveErr) {
            this.logger.error(
              `Failed to save resolved idempotency record: ${(saveErr as Error).message}`,
            );
          }
        }),
        catchError((err) => {
          // In case of handler failure, release idempotency key so client can retry safely
          this.redisService.failIdempotency(storageKey).catch((failErr) => {
            this.logger.error(
              `Failed to delete failed idempotency key: ${(failErr as Error).message}`,
            );
          });
          return throwError(() => err);
        }),
      );
    } catch (err) {
      if (err instanceof ConflictException) {
        throw err;
      }
      this.logger.error(
        `Idempotency interceptor error: ${(err as Error).message}. Proceeding without idempotency lock.`,
        (err as Error).stack,
      );
      return next.handle();
    }
  }
}
