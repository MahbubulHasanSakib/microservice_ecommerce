import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: Registry;

  // HTTP Metrics (API Gateway / HTTP endpoints)
  public readonly httpRequestsTotal: Counter<string>;
  public readonly httpRequestDuration: Histogram<string>;

  // TCP RPC Metrics
  public readonly rpcRequestsTotal: Counter<string>;
  public readonly rpcRequestDuration: Histogram<string>;

  // RabbitMQ Async Messaging Metrics
  public readonly rabbitmqEventsTotal: Counter<string>;
  public readonly rabbitmqEventDuration: Histogram<string>;

  // Resilience & Circuit Breaker Metrics
  public readonly circuitBreakerState: Gauge<string>;

  constructor() {
    this.registry = new Registry();

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests processed',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.rpcRequestsTotal = new Counter({
      name: 'rpc_requests_total',
      help: 'Total number of TCP RPC commands executed',
      labelNames: ['service', 'pattern', 'status'],
      registers: [this.registry],
    });

    this.rpcRequestDuration = new Histogram({
      name: 'rpc_request_duration_seconds',
      help: 'Duration of TCP RPC commands in seconds',
      labelNames: ['service', 'pattern'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });

    this.rabbitmqEventsTotal = new Counter({
      name: 'rabbitmq_events_total',
      help: 'Total number of RabbitMQ domain events published or consumed',
      labelNames: ['event_name', 'action', 'status'],
      registers: [this.registry],
    });

    this.rabbitmqEventDuration = new Histogram({
      name: 'rabbitmq_event_duration_seconds',
      help: 'Duration of RabbitMQ domain event processing in seconds',
      labelNames: ['event_name'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.circuitBreakerState = new Gauge({
      name: 'circuit_breaker_state',
      help: 'Current state of circuit breakers (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
      labelNames: ['breaker_name'],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    // Collect standard process, heap memory, and event loop metrics
    collectDefaultMetrics({ register: this.registry });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
