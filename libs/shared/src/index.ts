/**
 * @ecommerce/shared
 *
 * The single source of truth for cross-service contracts.
 * Everything exported here is part of the public API between services.
 * Internal service details (Prisma models, internal helpers) are NEVER exported here.
 */

// Constants — message patterns and event names
export * from './constants/service-patterns';
export * from './constants/services';

// Types — request/response shapes and event payloads
export * from './types/user.types';
