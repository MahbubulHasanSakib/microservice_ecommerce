export interface OrderServiceConfig {
  nodeEnv: string;
  tcpPort: number;
  httpPort: number;
  productService: {
    host: string;
    port: number;
  };
  database: {
    url: string;
  };
  rabbitmq: {
    url: string;
    orderQueue: string;
    inventoryQueue: string;
    paymentQueue: string;
    notificationQueue: string;
  };
}

export const configuration = (): OrderServiceConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  tcpPort: parseInt(process.env.TCP_PORT ?? '3004', 10),
  httpPort: parseInt(process.env.HTTP_PORT ?? '3014', 10),
  productService: {
    host: process.env.PRODUCT_SERVICE_HOST ?? 'localhost',
    port: parseInt(process.env.PRODUCT_SERVICE_PORT ?? '3003', 10),
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
    orderQueue: process.env.RABBITMQ_ORDER_QUEUE ?? 'order.queue',
    inventoryQueue: process.env.RABBITMQ_INVENTORY_QUEUE ?? 'inventory.queue',
    paymentQueue: process.env.RABBITMQ_PAYMENT_QUEUE ?? 'payment.queue',
    notificationQueue: process.env.RABBITMQ_NOTIFICATION_QUEUE ?? 'notification.queue',
  },
});
