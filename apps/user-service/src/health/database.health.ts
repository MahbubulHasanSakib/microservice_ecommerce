import { Injectable, Logger } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

/**
 * DatabaseHealthIndicator
 *
 * Custom health indicator that checks the PostgreSQL connection.
 * Used by the readiness endpoint to verify the service can actually
 * serve requests (i.e., the DB is accessible).
 *
 * WHY CUSTOM INSTEAD OF TERMINUS BUILT-IN:
 * We have full control over what the check does and how it reports.
 * The check is simple: can we execute a trivial query?
 * If not, the service isn't ready to serve traffic.
 */
@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(DatabaseHealthIndicator.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Cheapest possible query — just checks if the connection is alive
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true);
    } catch (error) {
      this.logger.error({ error }, 'Database health check failed');
      throw new HealthCheckError(
        'Database check failed',
        this.getStatus(key, false, { message: 'Cannot reach PostgreSQL' }),
      );
    }
  }
}
