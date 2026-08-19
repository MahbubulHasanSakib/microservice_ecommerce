import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AUTH_PATTERNS, AuthTokensResponse } from '@ecommerce/shared';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { RpcExceptionFilter } from '../common/filters/rpc-exception.filter';

@Controller()
@UseFilters(new RpcExceptionFilter())
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern(AUTH_PATTERNS.REGISTER)
  async register(@Payload() dto: RegisterDto): Promise<AuthTokensResponse> {
    return this.authService.register(dto);
  }

  @MessagePattern(AUTH_PATTERNS.LOGIN)
  async login(@Payload() dto: LoginDto): Promise<AuthTokensResponse> {
    return this.authService.login(dto);
  }

  @MessagePattern(AUTH_PATTERNS.REFRESH_TOKENS)
  async refreshTokens(@Payload() dto: RefreshTokenDto): Promise<AuthTokensResponse> {
    return this.authService.refreshTokens(dto);
  }

  @MessagePattern(AUTH_PATTERNS.LOGOUT)
  async logout(@Payload() dto: LogoutDto): Promise<{ success: boolean }> {
    return this.authService.logout(dto);
  }
}
