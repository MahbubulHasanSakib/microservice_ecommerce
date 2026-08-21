/**
 * CategoryResponse
 *
 * Public contract for product categories.
 */
export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ProductResponse
 *
 * Public contract for products returned across service boundaries.
 */
export interface ProductResponse {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price: number;
  stock: number;
  sku: string;
  categoryId: string;
  category?: CategoryResponse;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Batch price and stock verification item.
 */
export interface ProductStockCheckResult {
  id: string;
  name: string;
  price: number;
  availableStock: number;
  isAvailable: boolean;
}
