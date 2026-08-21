import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserResponse } from '@ecommerce/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

const BCRYPT_ROUNDS = 12;
const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<UserResponse> {
    this.logger.debug({ email: dto.email }, 'Creating user');

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phoneNumber: dto.phoneNumber, // Persist phoneNumber
        },
      });

      this.logger.log({ userId: user.id }, 'User created successfully');
      return this.toUserResponse(user);
    } catch (error: unknown) {
      if (this.isPrismaUniqueConstraintError(error)) {
        throw new ConflictException(`A user with email '${dto.email}' already exists`);
      }
      throw error;
    }
  }

  async findById(id: string): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with ID '${id}' not found`);
    }

    return this.toUserResponse(user);
  }

  private toUserResponse(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phoneNumber?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserResponse {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private isPrismaUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === PRISMA_UNIQUE_CONSTRAINT_CODE
    );
  }
}
