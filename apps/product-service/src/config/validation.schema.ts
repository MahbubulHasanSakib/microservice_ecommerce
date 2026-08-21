import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  TCP_PORT: Joi.number().port().default(3003),
  HTTP_PORT: Joi.number().port().default(3013),
  DATABASE_URL: Joi.string().required(),
});
