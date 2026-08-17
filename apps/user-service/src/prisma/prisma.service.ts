import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService
 *
 * Wraps PrismaClient as a NestJS injectable service.
 *
 * WHY EXTEND PRISMALIENT INSTEAD OF WRAPPING IT:
 * Extending gives us all Prisma's methods directly on the service instance
 * (this.prisma.user.findMany() instead of this.prisma.client.user.findMany()).
 * Less boilerplate, and the DI container manages the single instance.
 *
 * LIFECYCLE:
 * OnModuleInit: connects to the database when the module initializes.
 * OnModuleDestroy: disconnects cleanly when the app shuts down (SIGTERM).
 *
 * This ensures graceful shutdown closes the DB connection pool correctly,
 * preventing "connection already closed" errors in logs.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
