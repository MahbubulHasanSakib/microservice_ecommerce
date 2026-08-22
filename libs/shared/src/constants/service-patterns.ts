/**
 * Message patterns for User Service TCP communication.
 */
export const USER_PATTERNS = {
  CREATE: 'user.create',
  FIND_BY_ID: 'user.find_by_id',
  FIND_BY_EMAIL: 'user.find_by_email',
} as const;

/**
 * Message patterns for Auth Service TCP communication.
 */
export const AUTH_PATTERNS = {
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  REFRESH_TOKENS: 'auth.refresh_tokens',
  LOGOUT: 'auth.logout',
  VALIDATE_TOKEN: 'auth.validate_token',
} as const;

/**
 * Message patterns for Category operations in Product Service.
 */
export const CATEGORY_PATTERNS = {
  CREATE: 'category.create',
  FIND_BY_ID: 'category.find_by_id',
  LIST: 'category.list',
} as const;

/**
 * Message patterns for Product Service TCP communication.
 */
export const PRODUCT_PATTERNS = {
  CREATE: 'product.create',
  UPDATE: 'product.update',
  DELETE: 'product.delete',
  FIND_BY_ID: 'product.find_by_id',
  FIND_BY_IDS: 'product.find_by_ids',
  LIST: 'product.list',
  UPDATE_STOCK: 'product.update_stock',
} as const;

/**
 * Message patterns for Order Service TCP communication.
 */
export const ORDER_PATTERNS = {
  CREATE: 'order.create',
  FIND_BY_ID: 'order.find_by_id',
  FIND_BY_USER: 'order.find_by_user',
  CANCEL: 'order.cancel',
  UPDATE_STATUS: 'order.update_status',
} as const;

/**
 * Message patterns for Payment Service TCP communication.
 */
export const PAYMENT_PATTERNS = {
  PROCESS: 'payment.process',
  FIND_BY_ID: 'payment.find_by_id',
  FIND_BY_ORDER_ID: 'payment.find_by_order_id',
  REFUND: 'payment.refund',
} as const;

/**
 * Domain Event patterns for asynchronous RabbitMQ messaging (Order).
 */
export const ORDER_EVENTS = {
  ORDER_CREATED: 'order.created',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_SHIPPED: 'order.shipped',
  ORDER_DELIVERED: 'order.delivered',
} as const;

/**
 * Domain Event patterns for asynchronous RabbitMQ messaging (Payment).
 */
export const PAYMENT_EVENTS = {
  PAYMENT_REQUESTED: 'payment.requested',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',
} as const;

/**
 * RabbitMQ Queue definitions across the system.
 */
export const RABBITMQ_QUEUES = {
  NOTIFICATION_QUEUE: 'notification.queue',
  ORDER_QUEUE: 'order.queue',
  PAYMENT_QUEUE: 'payment.queue',
  INVENTORY_QUEUE: 'inventory.queue',
} as const;

/**
 * RabbitMQ Exchange definitions across the system.
 */
export const RABBITMQ_EXCHANGES = {
  ORDER_EXCHANGE: 'order.exchange',
  NOTIFICATION_EXCHANGE: 'notification.exchange',
  PAYMENT_EXCHANGE: 'payment.exchange',
  INVENTORY_EXCHANGE: 'inventory.exchange',
} as const;
