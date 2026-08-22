import { OrderStatus } from '../enums/order-status.enum';

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
 * Consumed by Notification Service (and later Payment/Inventory services in Saga).
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
 * Notification dispatch payload.
 */
export interface SendNotificationPayload {
  recipient: string;
  channel: 'EMAIL' | 'SMS' | 'IN_APP';
  subject: string;
  template: string;
  context: Record<string, unknown>;
}
