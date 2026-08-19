import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  TCP_PORT: Joi.number().port().default(3002),
  HTTP_PORT: Joi.number().port().default(3012),
  DATABASE_URL: Joi.string().required(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRATION: Joi.string().default('900s'),
  JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),
  USER_SERVICE_HOST: Joi.string().default('localhost'),
  USER_SERVICE_PORT: Joi.number().port().default(3001),
});
