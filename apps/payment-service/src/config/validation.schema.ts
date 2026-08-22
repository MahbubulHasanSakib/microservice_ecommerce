import * as Joi from 'joi';

export const validationSchema = Joi.object({
  PORT: Joi.number().default(3005),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  DATABASE_URL: Joi.string().required(),
  RABBITMQ_URL: Joi.string().uri({ scheme: ['amqp', 'amqps'] }).default('amqp://guest:guest@localhost:5672'),
  RABBITMQ_PAYMENT_QUEUE: Joi.string().default('payment.queue'),
  RABBITMQ_ORDER_QUEUE: Joi.string().default('order.queue'),
  RABBITMQ_NOTIFICATION_QUEUE: Joi.string().default('notification.queue'),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('debug'),
});
