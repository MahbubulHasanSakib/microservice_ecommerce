import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  TCP_PORT: Joi.number().port().default(3004),
  HTTP_PORT: Joi.number().port().default(3014),
  PRODUCT_SERVICE_HOST: Joi.string().default('localhost'),
  PRODUCT_SERVICE_PORT: Joi.number().port().default(3003),
  DATABASE_URL: Joi.string().required(),
  RABBITMQ_URL: Joi.string().uri({ scheme: ['amqp', 'amqps'] }).default('amqp://guest:guest@localhost:5672'),
  RABBITMQ_ORDER_QUEUE: Joi.string().default('order.queue'),
  RABBITMQ_INVENTORY_QUEUE: Joi.string().default('inventory.queue'),
  RABBITMQ_PAYMENT_QUEUE: Joi.string().default('payment.queue'),
  RABBITMQ_NOTIFICATION_QUEUE: Joi.string().default('notification.queue'),
});
