import * as Joi from 'joi';

export const validationSchema = Joi.object({
  PORT: Joi.number().port().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  JWT_SECRET: Joi.string()
    .min(32)
    .default('super-secret-production-grade-jwt-key-min-32-chars-long'),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  USER_SERVICE_HOST: Joi.string().default('localhost'),
  USER_SERVICE_PORT: Joi.number().port().default(3001),
  AUTH_SERVICE_HOST: Joi.string().default('localhost'),
  AUTH_SERVICE_PORT: Joi.number().port().default(3002),
  PRODUCT_SERVICE_HOST: Joi.string().default('localhost'),
  PRODUCT_SERVICE_PORT: Joi.number().port().default(3003),
  ORDER_SERVICE_HOST: Joi.string().default('localhost'),
  ORDER_SERVICE_PORT: Joi.number().port().default(3004),
});
