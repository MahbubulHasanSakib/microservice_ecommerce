import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import {
  AUTH_PATTERNS,
  AuthenticatedUser,
  AuthTokensResponse,
  JwtPayload,
  SERVICES,
} from '@ecommerce/shared';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

const RPC_TIMEOUT_MS = 5000;

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(SERVICES.AUTH_SERVICE)
    private readonly authClient: ClientProxy,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * POST /auth/register
   * Creates a user profile & authentication credentials, returning tokens.
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto): Promise<AuthTokensResponse> {
    return firstValueFrom(
      this.authClient
        .send<AuthTokensResponse>(AUTH_PATTERNS.REGISTER, dto)
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * POST /auth/login
   * Authenticates credentials and returns JWT Access & Refresh token pair.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthTokensResponse> {
    return firstValueFrom(
      this.authClient
        .send<AuthTokensResponse>(AUTH_PATTERNS.LOGIN, dto)
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * POST /auth/refresh
   * Rotates refresh tokens and issues a fresh Access Token.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(@Body() dto: RefreshTokenDto): Promise<AuthTokensResponse> {
    return firstValueFrom(
      this.authClient
        .send<AuthTokensResponse>(AUTH_PATTERNS.REFRESH_TOKENS, dto)
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * POST /auth/logout
   * Invalidates access token in Redis and revokes refresh token.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: any,
    @Body() body?: { refreshToken?: string },
  ): Promise<{ success: boolean }> {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '');
    const decoded = this.jwtService.decode(token) as JwtPayload;

    return firstValueFrom(
      this.authClient
        .send<{ success: boolean }>(AUTH_PATTERNS.LOGOUT, {
          userId: user.userId,
          jti: decoded?.jti,
          refreshToken: body?.refreshToken,
        })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }
}
