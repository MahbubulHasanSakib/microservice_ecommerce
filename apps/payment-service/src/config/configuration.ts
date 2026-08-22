export default () => ({
  port: parseInt(process.env.PORT ?? '3005', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  database: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/payment_db?schema=public',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
    paymentQueue: process.env.RABBITMQ_PAYMENT_QUEUE ?? 'payment.queue',
    orderQueue: process.env.RABBITMQ_ORDER_QUEUE ?? 'order.queue',
    notificationQueue: process.env.RABBITMQ_NOTIFICATION_QUEUE ?? 'notification.queue',
  },
  logLevel: process.env.LOG_LEVEL ?? 'debug',
});
