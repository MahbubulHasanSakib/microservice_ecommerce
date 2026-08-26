import { OrderStatus } from '../enums/order-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';

/**
 * Line item structure in domain events.
 */
export interface EventOrderItem {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

/**
 * OrderCreatedEvent Payload
 *
 * Published by Order Service asynchronously when an order is created.
 * Consumed by Payment Service (to trigger payment) and Notification Service (to send order receipt).
 */
export interface OrderCreatedEvent {
  orderId: string;
  orderNumber: string;
  userId: string;
  userEmail?: string;
  totalAmount: number;
  status: OrderStatus;
  shippingAddress?: Record<string, unknown> | null;
  items: EventOrderItem[];
  createdAt: Date | string;
}

/**
 * PaymentRequestedEvent Payload
 *
 * Published to request payment processing asynchronously.
 */
export interface PaymentRequestedEvent {
  orderId: string;
  orderNumber?: string;
  userId: string;
  userEmail?: string;
  amount: number;
  currency: string;
  paymentMethod?: string;
  createdAt: Date | string;
}

/**
 * PaymentSucceededEvent Payload
 *
 * Published by Payment Service when a transaction is successfully authorized/settled.
 * Consumed by:
 * - Order Service: to transition order status from PENDING to CONFIRMED.
 * - Notification Service: to send payment confirmation / receipt.
 */
export interface PaymentSucceededEvent {
  paymentId: string;
  orderId: string;
  orderNumber?: string;
  userId: string;
  userEmail?: string;
  amount: number;
  currency: string;
  transactionId: string;
  status: PaymentStatus.COMPLETED;
  timestamp: Date | string;
}

/**
 * PaymentFailedEvent Payload
 *
 * Published by Payment Service when a transaction is declined or fails.
 * Consumed by:
 * - Order Service: to transition order to CANCELLED and trigger compensating inventory release.
 * - Notification Service: to alert user to update their payment method.
 */
export interface PaymentFailedEvent {
  paymentId: string;
  orderId: string;
  orderNumber?: string;
  userId: string;
  userEmail?: string;
  amount: number;
  currency: string;
  reason: string;
  status: PaymentStatus.FAILED;
  timestamp: Date | string;
}

/**
 * PaymentRefundedEvent Payload
 *
 * Published when a payment is refunded.
 */
export interface PaymentRefundedEvent {
  paymentId: string;
  orderId: string;
  orderNumber?: string;
  userId: string;
  userEmail?: string;
  amount: number;
  currency: string;
  refundTransactionId: string;
  status: PaymentStatus.REFUNDED;
  timestamp: Date | string;
}

/**
 * Notification dispatch payload.
 */
export interface SendNotificationPayload {
  recipient: string;
  channel: 'EMAIL' | 'SMS' | 'IN_APP';
  subject: string;
  template: string;
  context: Record<string, unknown>;
}

/**
 * InventoryReservedEvent Payload
 *
 * Published by Inventory Service when stock is successfully reserved for an order.
 * Consumed by Payment Service (to trigger payment charge).
 */
export interface InventoryReservedEvent {
  orderId: string;
  orderNumber?: string;
  userId: string;
  userEmail?: string;
  amount: number;
  currency?: string;
  items: EventOrderItem[];
  reservedAt: Date | string;
}

/**
 * InventoryReservationFailedEvent Payload
 *
 * Published by Inventory Service when insufficient stock prevents order fulfillment.
 * Consumed by Order Service (to cancel order) and Notification Service (to alert user).
 */
export interface InventoryReservationFailedEvent {
  orderId: string;
  orderNumber?: string;
  userId: string;
  userEmail?: string;
  reason: string;
  failedItems: {
    productId: string;
    requestedQuantity: number;
    availableStock: number;
  }[];
  timestamp: Date | string;
}

/**
 * InventoryReleasedEvent Payload
 *
 * Published by Inventory Service when reserved stock is released (compensating transaction).
 */
export interface InventoryReleasedEvent {
  orderId: string;
  orderNumber?: string;
  reason: string;
  releasedItems: {
    productId: string;
    quantity: number;
  }[];
  releasedAt: Date | string;
}

