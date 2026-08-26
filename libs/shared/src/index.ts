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
