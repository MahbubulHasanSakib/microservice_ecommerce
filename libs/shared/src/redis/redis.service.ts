import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import {
  IdempotencyRecord,
  IdempotencyStatus,
  RateLimitResult,
} from '../types/redis.types';

const LUA_RELEASE_LOCK = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const LUA_SLIDING_WINDOW = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local clearBefore = now - (window * 1000)

redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)
local currentRequests = redis.call('ZCARD', key)

if currentRequests < limit then
  redis.call('ZADD', key, now, now .. '-' .. ARGV[4])
  redis.call('PEXPIRE', key, window * 1000)
  return { 1, limit - (currentRequests + 1), math.ceil(now / 1000) + window, currentRequests + 1 }
else
  return { 0, 0, math.ceil(now / 1000) + window, currentRequests }
end
`;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(@Optional() private readonly configService?: ConfigService) {}

  onModuleInit(): void {
    const host = this.configService?.get<string>('redis.host', 'localhost') ?? process.env['REDIS_HOST'] ?? 'localhost';
    const port = this.configService?.get<number>('redis.port', 6379) ?? parseInt(process.env['REDIS_PORT'] ?? '6379', 10);

    this.client = new Redis({
      host,
      port,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    this.client.on('connect', () => {
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`, err.stack);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Disconnected from Redis');
    }
  }

  getClient(): Redis {
    return this.client;
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  // ===========================================================================
  // 1. Sliding Window Rate Limiting
  // ===========================================================================

  async slidingWindowRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const uniqueMember = randomUUID();

    const result = (await this.client.eval(
      LUA_SLIDING_WINDOW,
      1,
      `ratelimit:${key}`,
      now.toString(),
      windowSeconds.toString(),
      limit.toString(),
      uniqueMember,
    )) as [number, number, number, number];

    return {
      allowed: result[0] === 1,
      remaining: Math.max(0, result[1]),
      resetTime: result[2],
      total: result[3],
    };
  }

  // ===========================================================================
  // 2. Distributed Locks
  // ===========================================================================

  async acquireLock(resource: string, ttlMs = 5000): Promise<string | null> {
    const token = randomUUID();
    const lockKey = `lock:${resource}`;

    const acquired = await this.client.set(lockKey, token, 'PX', ttlMs, 'NX');
    if (acquired === 'OK') {
      this.logger.debug(`Acquired distributed lock for '${resource}' (token: ${token}, TTL: ${ttlMs}ms)`);
      return token;
    }

    return null;
  }

  async releaseLock(resource: string, token: string): Promise<boolean> {
    const lockKey = `lock:${resource}`;
    const result = (await this.client.eval(LUA_RELEASE_LOCK, 1, lockKey, token)) as number;

    if (result === 1) {
      this.logger.debug(`Released distributed lock for '${resource}'`);
      return true;
    }

    this.logger.warn(`Failed to release lock for '${resource}' — token mismatch or expired`);
    return false;
  }

  async withLock<T>(
    resource: string,
    ttlMs: number,
    action: () => Promise<T>,
  ): Promise<T> {
    const token = await this.acquireLock(resource, ttlMs);
    if (!token) {
      throw new Error(`Unable to acquire distributed lock for resource '${resource}'`);
    }

    try {
      return await action();
    } finally {
      await this.releaseLock(resource, token);
    }
  }

  // ===========================================================================
  // 3. Cache-Aside Patterns & Invalidation
  // ===========================================================================

  async getCache<T>(key: string): Promise<T | null> {
    const data = await this.client.get(key);
    if (!data) {
      return null;
    }
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as unknown as T;
    }
  }

  async setCache<T>(
    key: string,
    value: T,
    ttlSeconds: number,
    withJitter = true,
  ): Promise<void> {
    let effectiveTtl = ttlSeconds;
    if (withJitter && ttlSeconds > 10) {
      // Add +/- 10% jitter to prevent cache stampede
      const jitter = Math.floor((Math.random() * 0.2 - 0.1) * ttlSeconds);
      effectiveTtl = Math.max(1, ttlSeconds + jitter);
    }

    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    await this.client.set(key, serialized, 'EX', effectiveTtl);
  }

  async delCache(key: string): Promise<void> {
    await this.client.del(key);
  }

  async delCachePattern(pattern: string): Promise<void> {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }

  // ===========================================================================
  // 4. Distributed Idempotency Store
  // ===========================================================================

  async getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
    const data = await this.client.get(`idempotency:${key}`);
    if (!data) {
      return null;
    }
    try {
      return JSON.parse(data) as IdempotencyRecord;
    } catch {
      return null;
    }
  }

  async createPendingIdempotency(key: string, ttlSeconds = 60): Promise<boolean> {
    const record: IdempotencyRecord = {
      status: IdempotencyStatus.PENDING,
      createdAt: Date.now(),
    };

    const res = await this.client.set(
      `idempotency:${key}`,
      JSON.stringify(record),
      'EX',
      ttlSeconds,
      'NX',
    );

    return res === 'OK';
  }

  async resolveIdempotency(
    key: string,
    response: { statusCode: number; headers?: Record<string, string>; body: unknown },
    ttlSeconds = 86400, // 24 hours retention
  ): Promise<void> {
    const record: IdempotencyRecord = {
      status: IdempotencyStatus.RESOLVED,
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body,
      createdAt: Date.now(),
    };

    await this.client.set(`idempotency:${key}`, JSON.stringify(record), 'EX', ttlSeconds);
  }

  async failIdempotency(key: string): Promise<void> {
    await this.client.del(`idempotency:${key}`);
  }

  // ===========================================================================
  // 5. Token Blacklist
  // ===========================================================================

  async blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.client.set(`blacklist:jwt:${jti}`, 'revoked', 'EX', ttlSeconds);
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    if (!jti) return false;
    const result = await this.client.exists(`blacklist:jwt:${jti}`);
    return result === 1;
  }
}
