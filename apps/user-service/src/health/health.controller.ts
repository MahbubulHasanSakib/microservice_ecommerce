import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health';

/**
 * Health controller for User Service — serves on the HTTP port (3011).
 *
 * This HTTP server exists ONLY for health probes.
 * Docker and Kubernetes cannot probe the TCP microservice port (3001).
 *
 * /health       — liveness  — is the process alive?
 * /health/ready — readiness — is the service ready? (process alive + DB connected)
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  liveness() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 256 * 1024 * 1024),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 256 * 1024 * 1024),
      // Readiness requires the database to be reachable
      // If DB is down, stop sending traffic here — don't restart the container
      () => this.database.isHealthy('database'),
    ]);
  }
}
