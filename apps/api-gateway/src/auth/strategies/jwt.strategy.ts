import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedUser, JwtPayload } from '@ecommerce/shared';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('jwt.secret') ??
        'super-secret-production-grade-jwt-key-min-32-chars-long',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // 1. Instant Token Revocation Check via Redis Blacklist
    if (payload.jti) {
      const isBlacklisted = await this.redisService.isTokenBlacklisted(payload.jti);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked. Please log in again.');
      }
    }

    // 2. Return clean AuthenticatedUser attached to req.user
    return {
      userId: payload.sub,
      email: payload.email,
      roles: payload.roles,
    };
  }
}
