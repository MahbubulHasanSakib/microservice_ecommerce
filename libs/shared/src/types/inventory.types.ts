export enum ReservationStatus {
  RESERVED = 'RESERVED',
  RELEASED = 'RELEASED',
  FULFILLED = 'FULFILLED',
}

export interface InventoryItemResponse {
  id: string;
  productId: string;
  stockOnHand: number;
  reservedStock: number;
  availableStock: number;
  lowStockThreshold: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface StockReservationItem {
  productId: string;
  quantity: number;
}

export interface ReserveStockDto {
  orderId: string;
  orderNumber?: string;
  userId?: string;
  userEmail?: string;
  items: StockReservationItem[];
}

export interface ReleaseStockDto {
  orderId: string;
  orderNumber?: string;
  reason?: string;
  items?: StockReservationItem[];
}

export interface RestockDto {
  productId: string;
  quantity: number;
  lowStockThreshold?: number;
}

export interface CheckStockDto {
  productIds: string[];
}

export interface StockAvailabilityResponse {
  productId: string;
  availableStock: number;
  isAvailable: boolean;
}
