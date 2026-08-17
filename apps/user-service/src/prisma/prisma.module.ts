import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule is @Global() so PrismaService is available everywhere
 * without needing to import PrismaModule in every feature module.
 *
 * This is appropriate because Prisma is infrastructure, not a feature.
 * You wouldn't import "DatabaseModule" in every module in a monolith either.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
