import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);

    this.client = new Redis({
      host,
      port,
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    });

    this.client.on('error', (err) => {
      this.logger.error({ message: 'Redis connection error', error: err.message });
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis connection closed gracefully');
    }
  }

  getClient(): Redis {
    return this.client;
  }

  /**
   * Blacklists a JWT JTI with TTL in seconds (matching remaining JWT lifespan)
   */
  async blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    await this.client.set(`blacklist:jwt:${jti}`, 'revoked', 'EX', ttlSeconds);
  }

  /**
   * Checks if a JWT JTI is blacklisted
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    const exists = await this.client.exists(`blacklist:jwt:${jti}`);
    return exists === 1;
  }

  /**
   * Health ping
   */
  async ping(): Promise<string> {
    return this.client.ping();
  }
}
