/**
 * Service Injection Tokens for NestJS ClientsModule
 */
export const SERVICES = {
  USER_SERVICE: 'USER_SERVICE',
  AUTH_SERVICE: 'AUTH_SERVICE',
} as const;

export type ServiceName = (typeof SERVICES)[keyof typeof SERVICES];
