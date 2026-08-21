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
});
