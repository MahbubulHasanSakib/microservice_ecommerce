/**
 * Message pattern constants for NestJS microservice TCP transport.
 *
 * WHY THIS FILE EXISTS:
 * The API Gateway uses ClientProxy.send(pattern, data) and each microservice
 * listens with @MessagePattern(pattern). If the pattern strings don't match
 * exactly, the call silently times out — one of the hardest bugs to debug.
 *
 * Using shared constants guarantees compile-time safety: a typo causes a
 * TypeScript error, not a silent production timeout.
 */

export const USER_PATTERNS = {
  CREATE: 'user.create',
  FIND_BY_ID: 'user.find_by_id',
  FIND_BY_EMAIL: 'user.find_by_email',
} as const;
