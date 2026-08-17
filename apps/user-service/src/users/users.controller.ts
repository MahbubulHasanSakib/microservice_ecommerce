import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { USER_PATTERNS, UserResponse } from '@ecommerce/shared';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { FindUserDto } from './dto/find-user.dto';
import { RpcExceptionFilter } from '../common/filters/rpc-exception.filter';

/**
 * UsersController — TCP Microservice Controller
 *
 * Listens for TCP RPC messages from API Gateway.
 * Uses RpcExceptionFilter to ensure domain errors (ConflictException, NotFoundException)
 * are serialized with their proper HTTP status codes across the TCP transport.
 */
@Controller()
@UseFilters(new RpcExceptionFilter())
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @MessagePattern(USER_PATTERNS.CREATE)
  async createUser(@Payload() dto: CreateUserDto): Promise<UserResponse> {
    return this.usersService.create(dto);
  }

  @MessagePattern(USER_PATTERNS.FIND_BY_ID)
  async findUser(@Payload() dto: FindUserDto): Promise<UserResponse> {
    return this.usersService.findById(dto.id);
  }
}
