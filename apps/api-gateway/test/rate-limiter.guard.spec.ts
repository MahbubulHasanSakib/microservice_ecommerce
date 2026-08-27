import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimiterGuard } from '../src/common/guards/rate-limiter.guard';
import { RedisService } from '../src/common/redis/redis.service';

describe('RateLimiterGuard', () => {
  let guard: RateLimiterGuard;
  let reflector: {
    get: jest.Mock;
  };
  let redisService: {
    slidingWindowRateLimit: jest.Mock;
  };

  beforeEach(() => {
    reflector = {
      get: jest.fn().mockReturnValue(null),
    };

    redisService = {
      slidingWindowRateLimit: jest.fn().mockResolvedValue({
        allowed: true,
        remaining: 9,
        resetTime: Math.floor(Date.now() / 1000) + 60,
        total: 1,
      }),
    };

    guard = new RateLimiterGuard(
      reflector as unknown as Reflector,
      redisService as unknown as RedisService,
    );
  });

  const createMockContext = (
    path: string = '/api/v1/products',
    userId?: string,
    ip: string = '127.0.0.1',
  ): ExecutionContext => {
    const responseHeaders: Record<string, string> = {};

    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          path,
          headers: {},
          ip,
          socket: { remoteAddress: ip },
          user: userId ? { id: userId } : undefined,
        }),
        getResponse: () => ({
          setHeader: (k: string, v: string) => {
            responseHeaders[k] = v;
          },
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow requests for health checks without hitting Redis', async () => {
    const context = createMockContext('/health');
    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(redisService.slidingWindowRateLimit).not.toHaveBeenCalled();
  });

  it('should enforce 10 req/min for auth routes by default', async () => {
    const context = createMockContext('/api/v1/auth/login');
    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(redisService.slidingWindowRateLimit).toHaveBeenCalledWith(
      'ip:127.0.0.1:auth',
      10,
      60,
    );
  });

  it('should enforce higher limit (300 req/min) for authenticated users', async () => {
    const context = createMockContext('/api/v1/orders', 'usr-999');
    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(redisService.slidingWindowRateLimit).toHaveBeenCalledWith(
      'user:usr-999:api',
      300,
      60,
    );
  });

  it('should throw 429 Too Many Requests when rate limit is exceeded', async () => {
    const context = createMockContext('/api/v1/auth/login');
    redisService.slidingWindowRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetTime: Math.floor(Date.now() / 1000) + 45,
      total: 11,
    });

    try {
      await guard.canActivate(context);
      fail('Expected guard to throw HttpException');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    }
  });
});
