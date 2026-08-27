import { SetMetadata, CustomDecorator } from '@nestjs/common';
import { RateLimitOptions } from '@ecommerce/shared';

export const RATE_LIMIT_KEY = 'RATE_LIMIT_METADATA';

/**
 * Decorator to configure custom rate limit options on route handlers or controllers.
 *
 * @example
 * ```ts
 * @RateLimit({ limit: 5, windowSec: 60 })
 * @Post('login')
 * login(...) {}
 * ```
 */
export const RateLimit = (options: RateLimitOptions): CustomDecorator<string> =>
  SetMetadata(RATE_LIMIT_KEY, options);
