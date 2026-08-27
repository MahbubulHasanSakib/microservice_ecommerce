import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RateLimitOptions } from '@ecommerce/shared';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';
import { RedisService } from '../redis/redis.service';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    roles?: string[];
  };
}

@Injectable()
export class RateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(RateLimiterGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthenticatedRequest>();
    const res = http.getResponse<Response>();

    // Skip rate limiting for health checks
    if (req.path === '/health' || req.path === '/health/ready') {
      return true;
    }

    const handler = context.getHandler();
    const targetClass = context.getClass();

    const customOptions =
      this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, handler) ||
      this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, targetClass);

    let limit = customOptions?.limit;
    let windowSec = customOptions?.windowSec;

    const isAuthRoute =
      req.path.includes('/auth/login') ||
      req.path.includes('/auth/register');

    if (!limit || !windowSec) {
      if (isAuthRoute) {
        // Strict limit for login & registration to prevent brute-force attacks
        limit = 10;
        windowSec = 60;
      } else if (req.user?.id) {
        // Higher limit for authenticated users
        limit = 300;
        windowSec = 60;
      } else {
        // Standard public limit
        limit = 100;
        windowSec = 60;
      }
    }

    // Determine client identifier
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown-ip';

    const identifier = req.user?.id ? `user:${req.user.id}` : `ip:${clientIp}`;
    const endpointKey = isAuthRoute ? 'auth' : 'api';
    const rateLimitKey = `${identifier}:${endpointKey}`;

    try {
      const result = await this.redisService.slidingWindowRateLimit(
        rateLimitKey,
        limit,
        windowSec,
      );

      // Set standard RateLimit HTTP response headers
      res.setHeader('X-RateLimit-Limit', limit.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', result.resetTime.toString());

      if (!result.allowed) {
        const nowSec = Math.floor(Date.now() / 1000);
        const retryAfter = Math.max(1, result.resetTime - nowSec);
        res.setHeader('Retry-After', retryAfter.toString());

        this.logger.warn(
          `Rate limit exceeded for [${identifier}] on ${req.method} ${req.path} (Limit: ${limit}/${windowSec}s)`,
        );

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Too many requests. Please try again later.',
            retryAfter,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      // Fail-open on Redis errors to prevent taking down the entire API gateway
      this.logger.error(
        `Rate limiter failed: ${(err as Error).message}. Failing open for request.`,
        (err as Error).stack,
      );
      return true;
    }
  }
}
