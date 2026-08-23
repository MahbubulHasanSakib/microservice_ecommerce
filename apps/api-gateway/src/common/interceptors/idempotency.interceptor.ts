import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

interface CachedEntry {
  response: unknown;
  inProgress: boolean;
  timestamp: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour TTL

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly cache = new Map<string, CachedEntry>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const idempotencyKey = request.headers['x-idempotency-key'] as string | undefined;

    if (!idempotencyKey) {
      return next.handle();
    }

    const userId = request.user?.userId ?? 'anonymous';
    const compositeKey = `${userId}:${idempotencyKey}`;
    const now = Date.now();

    // Clean expired entries
    const existing = this.cache.get(compositeKey);
    if (existing && now - existing.timestamp > TTL_MS) {
      this.cache.delete(compositeKey);
    }

    const current = this.cache.get(compositeKey);

    if (current) {
      if (current.inProgress) {
        throw new ConflictException(
          `A request with Idempotency-Key '${idempotencyKey}' is currently in-progress.`,
        );
      }
      // Return cached idempotent response
      const response = context.switchToHttp().getResponse();
      response.setHeader('X-Idempotent-Replay', 'true');
      return of(current.response);
    }

    // Mark in-flight
    this.cache.set(compositeKey, {
      response: null,
      inProgress: true,
      timestamp: now,
    });

    return next.handle().pipe(
      tap((data) => {
        this.cache.set(compositeKey, {
          response: data,
          inProgress: false,
          timestamp: Date.now(),
        });
      }),
      catchError((error) => {
        // If the operation threw an error, release lock so user can safely retry
        this.cache.delete(compositeKey);
        throw error;
      }),
    );
  }

  clear(): void {
    this.cache.clear();
  }
}
