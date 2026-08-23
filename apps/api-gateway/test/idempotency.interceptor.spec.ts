import { CallHandler, ConflictException, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { IdempotencyInterceptor } from '../src/common/interceptors/idempotency.interceptor';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    interceptor = new IdempotencyInterceptor();
  });

  const createMockContext = (idempotencyKey?: string, userId: string = 'user-1'): ExecutionContext => {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['x-idempotency-key'] = idempotencyKey;
    }

    const responseHeaders: Record<string, string> = {};

    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          user: { userId },
        }),
        getResponse: () => ({
          setHeader: (k: string, v: string) => {
            responseHeaders[k] = v;
          },
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should pass through without caching if no x-idempotency-key header', (done) => {
    const context = createMockContext();
    const handler: CallHandler = {
      handle: () => of({ data: 'response-1' }),
    };

    interceptor.intercept(context, handler).subscribe({
      next: (val) => {
        expect(val).toEqual({ data: 'response-1' });
        done();
      },
    });
  });

  it('should cache and return previous response on duplicate request with same idempotency key', (done) => {
    const context = createMockContext('key-123', 'user-1');
    let callCount = 0;
    const handler: CallHandler = {
      handle: () => {
        callCount++;
        return of({ id: 'order-123', total: 200 });
      },
    };

    // First request
    interceptor.intercept(context, handler).subscribe({
      next: (val1) => {
        expect(val1).toEqual({ id: 'order-123', total: 200 });
        expect(callCount).toBe(1);

        // Second request with SAME key
        interceptor.intercept(context, handler).subscribe({
          next: (val2) => {
            expect(val2).toEqual({ id: 'order-123', total: 200 });
            expect(callCount).toBe(1); // Downstream handler was NOT called again
            done();
          },
        });
      },
    });
  });

  it('should throw ConflictException if duplicate request arrives while previous is still in-progress', () => {
    const context = createMockContext('key-in-flight', 'user-1');
    const slowHandler: CallHandler = {
      handle: () => of({ done: true }),
    };

    // Start first request
    interceptor.intercept(context, slowHandler);

    // Concurrently try a duplicate request with the same key
    expect(() => {
      interceptor.intercept(context, slowHandler);
    }).toThrow(ConflictException);
  });

  it('should release key and allow retry if first attempt failed with error', (done) => {
    const context = createMockContext('key-fail', 'user-1');
    let callCount = 0;

    const failingHandler: CallHandler = {
      handle: () => {
        callCount++;
        return throwError(() => new Error('DB connection error'));
      },
    };

    const succeedingHandler: CallHandler = {
      handle: () => {
        callCount++;
        return of({ id: 'order-success' });
      },
    };

    // First attempt fails
    interceptor.intercept(context, failingHandler).subscribe({
      error: (err) => {
        expect(err.message).toBe('DB connection error');
        expect(callCount).toBe(1);

        // Second attempt with SAME key should be allowed because previous failed
        interceptor.intercept(context, succeedingHandler).subscribe({
          next: (val) => {
            expect(val).toEqual({ id: 'order-success' });
            expect(callCount).toBe(2);
            done();
          },
        });
      },
    });
  });
});
