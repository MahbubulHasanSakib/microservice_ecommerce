import { OrderStatus } from '../enums/order-status.enum';

/**
 * OrderItemResponse
 *
 * Line item snapshot contract. Note: `productName` and `unitPrice`
 * are frozen at the exact time of order creation.
 */
export interface OrderItemResponse {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}

/**
 * OrderResponse
 *
 * Public contract for order records returned across service boundaries.
 */
export interface OrderResponse {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  totalAmount: number;
  items: OrderItemResponse[];
  shippingAddress?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}
