/**
 * @ecommerce/shared
 *
 * Single source of truth for cross-service contracts.
 */

// Constants & Enums
export * from './constants/service-patterns';
export * from './constants/services';
export * from './enums/role.enum';
export * from './enums/order-status.enum';
export * from './enums/payment-status.enum';

// Types & Contracts
export * from './types/user.types';
export * from './types/auth.types';
export * from './types/pagination.types';
export * from './types/product.types';
export * from './types/order.types';
export * from './types/payment.types';
export * from './types/inventory.types';
export * from './types/events.types';

// Resilience Utilities
export * from './resilience/circuit-breaker';
export * from './resilience/retry-backoff';

// Redis Utilities
export * from './types/redis.types';
export * from './redis/redis.service';
export * from './redis/redis.module';

// Observability & Metrics
export * from './observability/tracing';
export * from './observability/trace-context';
export * from './observability/metrics.service';
export * from './observability/metrics.controller';
export * from './observability/metrics.module';
export * from './observability/observability.interceptor';

// Kafka Event Streaming
export * from './kafka/kafka.types';
export * from './kafka/kafka-producer.service';
export * from './kafka/kafka-consumer.service';
export * from './kafka/kafka.module';

