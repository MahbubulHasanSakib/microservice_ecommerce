/**
 * PaymentStatus
 *
 * Represents the lifecycle stages of a payment transaction.
 */
export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}
