import * as Joi from 'joi';

export const validationSchema = Joi.object({
  TCP_PORT: Joi.number().default(3001),
  HTTP_PORT: Joi.number().default(3011),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  // DATABASE_URL is required — no default. The service refuses to start without it.
  DATABASE_URL: Joi.string().required().description('PostgreSQL connection string for user_db'),
});
