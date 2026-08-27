import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService as SharedRedisService } from '@ecommerce/shared';

@Injectable()
export class RedisService extends SharedRedisService {
  constructor(configService: ConfigService) {
    super(configService);
  }
}
