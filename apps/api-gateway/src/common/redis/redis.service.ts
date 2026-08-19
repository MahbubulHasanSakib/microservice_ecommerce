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
      this.logger.log(`API Gateway connected to Redis at ${host}:${port}`);
    });

    this.client.on('error', (err) => {
      this.logger.error({ message: 'Gateway Redis connection error', error: err.message });
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }

  /**
   * Returns true if the token JTI was revoked via logout / password change
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    if (!jti) return false;
    const exists = await this.client.exists(`blacklist:jwt:${jti}`);
    return exists === 1;
  }
}
