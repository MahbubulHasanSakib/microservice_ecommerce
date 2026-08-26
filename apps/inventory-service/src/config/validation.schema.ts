import * as Joi from 'joi';

export const validationSchema = Joi.object({
  TCP_PORT: Joi.number().port().default(3006),
  HTTP_PORT: Joi.number().port().default(3016),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  DATABASE_URL: Joi.string().required(),
  RABBITMQ_URL: Joi.string()
    .uri({ scheme: ['amqp', 'amqps'] })
    .default('amqp://guest:guest@localhost:5672'),
  RABBITMQ_INVENTORY_QUEUE: Joi.string().default('inventory.queue'),
  RABBITMQ_ORDER_QUEUE: Joi.string().default('order.queue'),
  RABBITMQ_PAYMENT_QUEUE: Joi.string().default('payment.queue'),
  RABBITMQ_NOTIFICATION_QUEUE: Joi.string().default('notification.queue'),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('debug'),
});
