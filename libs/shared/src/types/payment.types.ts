import { PaymentStatus } from '../enums/payment-status.enum';

/**
 * Payment Response contract returned by Payment Service
 */
export interface PaymentResponse {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  transactionId: string;
  paymentMethod: string;
  failureReason?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/**
 * Payload to initiate or process a payment command
 */
export interface ProcessPaymentDto {
  orderId: string;
  orderNumber?: string;
  userId: string;
  userEmail?: string;
  amount: number;
  currency?: string;
  paymentMethod?: string;
}
