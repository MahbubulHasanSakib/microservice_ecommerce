import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { SERVICES, USER_PATTERNS, UserResponse } from '@ecommerce/shared';
import { CreateUserDto } from './dto/create-user.dto';
import { FindUserParamDto } from './dto/find-user-param.dto';

/**
 * Standard RPC Timeout in milliseconds for OLTP user operations.
 * Protects API Gateway from hanging indefinitely if downstream service is stuck.
 */
const RPC_TIMEOUT_MS = 5000;

@Controller('users')
export class UsersController {
  constructor(
    @Inject(SERVICES.USER_SERVICE)
    private readonly userClient: ClientProxy,
  ) {}

  /**
   * POST /users
   * Validates request body and forwards via TCP to User Service.
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
   * GET /users/:id
   * Validates UUID param and retrieves user details from User Service.
   */
  @Get(':id')
  async findUser(@Param() params: FindUserParamDto): Promise<UserResponse> {
    return firstValueFrom(
      this.userClient
        .send<UserResponse>(USER_PATTERNS.FIND_BY_ID, { id: params.id })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }
}
