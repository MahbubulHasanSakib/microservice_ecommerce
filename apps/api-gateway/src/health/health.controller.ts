import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  MicroserviceHealthIndicator,
} from '@nestjs/terminus';
import { Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';

/**
 * Health endpoints for API Gateway
 *
 * /health       (Liveness Probe)  - Checks if Gateway process is alive & heap memory is healthy.
 * /health/ready (Readiness Probe) - Checks if Gateway can communicate with downstream User Service.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly microservice: MicroserviceHealthIndicator,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  liveness() {
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    const userServiceHost = this.configService.get<string>('userService.host', 'localhost');
    const userServicePort = this.configService.get<number>('userService.port', 3001);

    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      // Readiness probe verifies TCP connection to User Service
      () =>
        this.microservice.pingCheck('user_service_tcp', {
          transport: Transport.TCP,
          options: {
            host: userServiceHost,
            port: userServicePort,
          },
          timeout: 2000,
        }),
    ]);
  }
}
