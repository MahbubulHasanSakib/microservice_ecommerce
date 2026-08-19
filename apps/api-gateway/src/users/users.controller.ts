import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import {
  AuthenticatedUser,
  Role,
  SERVICES,
  USER_PATTERNS,
  UserResponse,
} from '@ecommerce/shared';
import { CreateUserDto } from './dto/create-user.dto';
import { FindUserParamDto } from './dto/find-user-param.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

const RPC_TIMEOUT_MS = 5000;

@Controller('users')
export class UsersController {
  constructor(
    @Inject(SERVICES.USER_SERVICE)
    private readonly userClient: ClientProxy,
  ) {}

  /**
   * POST /users
   * Direct user profile creation (internal / admin provisioning).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createUser(@Body() dto: CreateUserDto): Promise<UserResponse> {
    return firstValueFrom(
      this.userClient
        .send<UserResponse>(USER_PATTERNS.CREATE, dto)
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * GET /users/me
   * Protected: Returns the currently authenticated user's profile.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@CurrentUser() user: AuthenticatedUser): Promise<UserResponse> {
    return firstValueFrom(
      this.userClient
        .send<UserResponse>(USER_PATTERNS.FIND_BY_ID, { id: user.userId })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }

  /**
   * GET /users/:id
   * Protected (Admin-only RBAC): Retrieves any user by ID.
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async findUser(@Param() params: FindUserParamDto): Promise<UserResponse> {
    return firstValueFrom(
      this.userClient
        .send<UserResponse>(USER_PATTERNS.FIND_BY_ID, { id: params.id })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }
}
