export interface NotificationConfig {
  port: number;
  nodeEnv: string;
  rabbitmq: {
    url: string;
    notificationQueue: string;
  };
  mail: {
    from: string;
    host?: string;
    port?: number;
    user?: string;
    pass?: string;
  };
  logLevel: string;
}

export default (): NotificationConfig => ({
  port: parseInt(process.env.PORT || '3007', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
    notificationQueue: process.env.RABBITMQ_NOTIFICATION_QUEUE || 'notification.queue',
  },
  mail: {
    from:
      process.env.EMAIL_FROM ||
      process.env.MAIL_FROM ||
      `E-Commerce Store <${process.env.EMAIL_USER || 'no-reply@ecommerce.com'}>`,
    host: process.env.EMAIL_HOST || process.env.SMTP_HOST,
    port: process.env.EMAIL_PORT
      ? parseInt(process.env.EMAIL_PORT, 10)
      : process.env.SMTP_PORT
        ? parseInt(process.env.SMTP_PORT, 10)
        : undefined,
    user: process.env.EMAIL_USER || process.env.SMTP_USER,
    pass: process.env.EMAIL_PASS || process.env.SMTP_PASS,
  },
  logLevel: process.env.LOG_LEVEL || 'info',
});
