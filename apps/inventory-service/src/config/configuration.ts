export interface InventoryServiceConfig {
  tcpPort: number;
  httpPort: number;
  nodeEnv: string;
  database: {
    url: string;
  };
  rabbitmq: {
    url: string;
    inventoryQueue: string;
    orderQueue: string;
    paymentQueue: string;
    notificationQueue: string;
  };
  logLevel: string;
}

export const configuration = (): InventoryServiceConfig => ({
  tcpPort: parseInt(process.env.TCP_PORT ?? '3006', 10),
  httpPort: parseInt(process.env.HTTP_PORT ?? '3016', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  database: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/inventory_db?schema=public',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
    inventoryQueue: process.env.RABBITMQ_INVENTORY_QUEUE ?? 'inventory.queue',
    orderQueue: process.env.RABBITMQ_ORDER_QUEUE ?? 'order.queue',
    paymentQueue: process.env.RABBITMQ_PAYMENT_QUEUE ?? 'payment.queue',
    notificationQueue: process.env.RABBITMQ_NOTIFICATION_QUEUE ?? 'notification.queue',
  },
  logLevel: process.env.LOG_LEVEL ?? 'debug',
});
