import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ClientProxy } from '@nestjs/microservices';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { firstValueFrom, timeout } from 'rxjs';
import type { StringValue } from 'ms';
import {
  AuthTokensResponse,
  JwtPayload,
  Role,
  SERVICES,
  USER_PATTERNS,
  UserResponse,
} from '@ecommerce/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';

const BCRYPT_ROUNDS = 12;
const USER_SERVICE_TIMEOUT_MS = 5000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(SERVICES.USER_SERVICE)
    private readonly userClient: ClientProxy,
  ) {}

  /**
   * Register a new user
   */
  async register(dto: RegisterDto): Promise<AuthTokensResponse> {
    this.logger.log({ email: dto.email }, 'Processing registration');

    // 1. Verify credential doesn't already exist in auth_db
    const existing = await this.prisma.credential.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException(`An account with email '${dto.email}' already exists`);
    }

    // 2. Hash password BEFORE cross-service RPC call
    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // 3. Create profile in User Service via TCP RPC
    let user: UserResponse;
    try {
      user = await firstValueFrom(
        this.userClient
          .send<UserResponse>(USER_PATTERNS.CREATE, {
            email: dto.email,
            password: dto.password, // User Service validates & stores in user_db
            firstName: dto.firstName,
            lastName: dto.lastName,
            phoneNumber: dto.phoneNumber,
          })
          .pipe(timeout(USER_SERVICE_TIMEOUT_MS)),
      );
    } catch (err: unknown) {
      this.logger.error({
        message: 'Failed to create user in user-service',
        error: (err as Error)?.message,
      });
      throw err;
    }

    // 4. Save credential record in auth_db
    const roles: string[] = dto.roles && dto.roles.length > 0 ? dto.roles : [Role.CUSTOMER];
    await this.prisma.credential.create({
      data: {
        userId: user.id,
        email: dto.email,
        password: hashedPassword,
        roles,
      },
    });

    // 5. Generate and return tokens
    return this.generateTokens(user, roles as Role[]);
  }

  /**
   * Login with email and password
   */
  async login(dto: LoginDto): Promise<AuthTokensResponse> {
    this.logger.log({ email: dto.email }, 'Processing login attempt');

    const credential = await this.prisma.credential.findUnique({
      where: { email: dto.email },
    });

    if (!credential || !credential.isActive) {
      await this.logAudit(null, dto.email, 'LOGIN_FAILED');
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(dto.password, credential.password);
    if (!isMatch) {
      await this.logAudit(credential.userId, dto.email, 'LOGIN_FAILED');
      throw new UnauthorizedException('Invalid email or password');
    }

    // Fetch user profile from User Service
    let user: UserResponse;
    try {
      user = await firstValueFrom(
        this.userClient
          .send<UserResponse>(USER_PATTERNS.FIND_BY_ID, { id: credential.userId })
          .pipe(timeout(USER_SERVICE_TIMEOUT_MS)),
      );
    } catch {
      // Fallback user structure if user-service is temporarily delayed
      user = {
        id: credential.userId,
        email: credential.email,
        firstName: '',
        lastName: '',
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
      };
    }

    await this.logAudit(credential.userId, dto.email, 'LOGIN_SUCCESS');
    return this.generateTokens(user, credential.roles as Role[]);
  }

  /**
   * Refresh token rotation with reuse detection
   */
  async refreshTokens(dto: RefreshTokenDto): Promise<AuthTokensResponse> {
    const tokenHash = this.hashToken(dto.refreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { credential: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // TOKEN REUSE / THEFT DETECTION
    if (storedToken.isRevoked) {
      this.logger.warn(
        { userId: storedToken.userId, familyId: storedToken.familyId },
        'SECURITY ALERT: Revoked refresh token reuse detected! Invalidating family.',
      );
      // Invalidate all tokens in the family (hacker or compromised device)
      await this.prisma.refreshToken.updateMany({
        where: { familyId: storedToken.familyId },
        data: { isRevoked: true },
      });
      await this.logAudit(storedToken.userId, storedToken.credential.email, 'REFRESH_TOKEN_REUSED');
      throw new UnauthorizedException('Security breach: refresh token reuse detected');
    }

    if (new Date() > storedToken.expiresAt) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Mark current token as revoked (rotated)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    // Fetch profile
    let user: UserResponse;
    try {
      user = await firstValueFrom(
        this.userClient
          .send<UserResponse>(USER_PATTERNS.FIND_BY_ID, { id: storedToken.userId })
          .pipe(timeout(USER_SERVICE_TIMEOUT_MS)),
      );
    } catch {
      user = {
        id: storedToken.userId,
        email: storedToken.credential.email,
        firstName: '',
        lastName: '',
        createdAt: storedToken.credential.createdAt,
        updatedAt: storedToken.credential.updatedAt,
      };
    }

    // Generate new token pair linked to the SAME familyId
    return this.generateTokens(user, storedToken.credential.roles as Role[], storedToken.familyId);
  }

  /**
   * Logout and invalidate session
   */
  async logout(dto: LogoutDto): Promise<{ success: boolean }> {
    this.logger.log({ userId: dto.userId, jti: dto.jti }, 'Processing logout');

    // 1. Blacklist the access token JTI in Redis for remaining 15m lifespan (900s)
    await this.redis.blacklistToken(dto.jti, 900);

    // 2. Revoke refresh token if provided
    if (dto.refreshToken) {
      const tokenHash = this.hashToken(dto.refreshToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash },
        data: { isRevoked: true },
      });
    }

    await this.logAudit(dto.userId, null, 'LOGOUT');
    return { success: true };
  }

  /**
   * Helper to generate Access Token (JWT) + Refresh Token (hashed in DB)
   */
  private async generateTokens(
    user: UserResponse,
    roles: Role[],
    existingFamilyId?: string,
  ): Promise<AuthTokensResponse> {
    const jti = crypto.randomUUID();
    const familyId = existingFamilyId ?? crypto.randomUUID();

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles,
      jti,
    };

    const expiresIn = this.configService.get<string>('jwt.accessExpiration', '900s') as StringValue;
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn,
    });

    const plainRefreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(plainRefreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        familyId,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: plainRefreshToken,
      expiresIn: 900,
      user,
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async logAudit(
    userId: string | null,
    email: string | null,
    action: string,
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: { userId, email, action },
      });
    } catch (e) {
      this.logger.error({ message: 'Failed to write audit log', error: e });
    }
  }
}
