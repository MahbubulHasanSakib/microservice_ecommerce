import { CallHandler, ConflictException, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from '../src/common/interceptors/idempotency.interceptor';
import { RedisService } from '../src/common/redis/redis.service';
import { IdempotencyStatus } from '@ecommerce/shared';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  let redisService: {
    getIdempotencyRecord: jest.Mock;
    createPendingIdempotency: jest.Mock;
    resolveIdempotency: jest.Mock;
    failIdempotency: jest.Mock;
  };

  beforeEach(() => {
    redisService = {
      getIdempotencyRecord: jest.fn().mockResolvedValue(null),
      createPendingIdempotency: jest.fn().mockResolvedValue(true),
      resolveIdempotency: jest.fn().mockResolvedValue(undefined),
      failIdempotency: jest.fn().mockResolvedValue(undefined),
    };

    interceptor = new IdempotencyInterceptor(redisService as unknown as RedisService);
  });

  const createMockContext = (
    idempotencyKey?: string,
    userId: string = 'user-1',
    method: string = 'POST',
  ): ExecutionContext => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    const responseHeaders: Record<string, string> = {};
    let statusCode = 200;

    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          path: '/api/v1/orders',
          headers,
          user: { id: userId },
        }),
        getResponse: () => ({
          statusCode,
          status: (code: number) => {
            statusCode = code;
            return this;
          },
          setHeader: (k: string, v: string) => {
            responseHeaders[k] = v;
          },
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should pass through without checking Redis if no idempotency-key header', async () => {
    const context = createMockContext();
    const handler: CallHandler = {
      handle: () => of({ data: 'response-1' }),
    };

    const observable = await interceptor.intercept(context, handler);
    observable.subscribe((val) => {
      expect(val).toEqual({ data: 'response-1' });
      expect(redisService.getIdempotencyRecord).not.toHaveBeenCalled();
    });
  });

  it('should pass through for GET requests even if header is present', async () => {
    const context = createMockContext('key-123', 'user-1', 'GET');
    const handler: CallHandler = {
      handle: () => of({ data: 'get-response' }),
    };

    const observable = await interceptor.intercept(context, handler);
    observable.subscribe((val) => {
      expect(val).toEqual({ data: 'get-response' });
      expect(redisService.createPendingIdempotency).not.toHaveBeenCalled();
    });
  });

  it('should create pending idempotency record on first request and resolve on completion', async () => {
    const context = createMockContext('key-123', 'user-1');
    const handler: CallHandler = {
      handle: () => of({ id: 'order-123', total: 200 }),
    };

    const observable = await interceptor.intercept(context, handler);
    observable.subscribe((val) => {
      expect(val).toEqual({ id: 'order-123', total: 200 });
      expect(redisService.createPendingIdempotency).toHaveBeenCalledWith('user:user-1:key-123', 60);
      expect(redisService.resolveIdempotency).toHaveBeenCalledWith(
        'user:user-1:key-123',
        expect.objectContaining({ body: { id: 'order-123', total: 200 } }),
        86400,
      );
    });
  });

  it('should replay cached response when record is already RESOLVED', async () => {
    const context = createMockContext('key-123', 'user-1');
    redisService.getIdempotencyRecord.mockResolvedValue({
      status: IdempotencyStatus.RESOLVED,
      statusCode: 201,
      body: { id: 'cached-order-123' },
      createdAt: Date.now(),
    });

    const handler: CallHandler = {
      handle: jest.fn(),
    };

    const observable = await interceptor.intercept(context, handler);
    observable.subscribe((val) => {
      expect(val).toEqual({ id: 'cached-order-123' });
      expect(handler.handle).not.toHaveBeenCalled();
    });
  });

  it('should throw ConflictException if duplicate request arrives while previous is PENDING', async () => {
    const context = createMockContext('key-in-flight', 'user-1');
    redisService.getIdempotencyRecord.mockResolvedValue({
      status: IdempotencyStatus.PENDING,
      createdAt: Date.now(),
    });

    const handler: CallHandler = {
      handle: () => of({ done: true }),
    };

    await expect(interceptor.intercept(context, handler)).rejects.toThrow(ConflictException);
  });

  it('should call failIdempotency if request handler throws an error', async () => {
    const context = createMockContext('key-fail', 'user-1');
    const handler: CallHandler = {
      handle: () => throwError(() => new Error('Service down')),
    };

    const observable = await interceptor.intercept(context, handler);
    observable.subscribe({
      error: (err) => {
        expect(err.message).toBe('Service down');
        expect(redisService.failIdempotency).toHaveBeenCalledWith('user:user-1:key-fail');
      },
    });
  });
});
