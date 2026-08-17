import * as Joi from 'joi';

/**
 * Joi schema that validates environment variables on startup.
 *
 * WHY JOI VALIDATION:
 * If DATABASE_URL or a service host is missing, the app starts up fine and
 * then fails 5 minutes later when it tries to make its first connection.
 * That's a terrible debugging experience.
 *
 * With this schema, the process crashes immediately on startup with a message
 * like: "ValidationError: USER_SERVICE_PORT must be a number".
 * That's the fail-fast principle applied to configuration.
 */
export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  USER_SERVICE_HOST: Joi.string().default('localhost'),
  USER_SERVICE_PORT: Joi.number().default(3001),
});
