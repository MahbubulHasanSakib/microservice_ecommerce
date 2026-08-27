/**
 * Rate Limiter Result returned by sliding window limiter.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number; // Unix timestamp in seconds
  total: number;
}

/**
 * State of an Idempotency Record in Redis.
 */
export enum IdempotencyStatus {
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
}

/**
 * Stored Idempotency Record payload.
 */
export interface IdempotencyRecord {
  status: IdempotencyStatus;
  statusCode?: number;
  headers?: Record<string, string>;
  body?: unknown;
  createdAt: number; // Timestamp
}

/**
 * Options for Rate Limiting decorator & guard.
 */
export interface RateLimitOptions {
  limit: number;
  windowSec: number;
  keyPrefix?: string;
}
