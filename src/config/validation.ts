import * as Joi from 'joi';

export const configurationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  APP_ENV: Joi.string().valid('local', 'test', 'staging', 'production').default('local'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  DATABASE_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
  AUTH_MODE: Joi.string().valid('development', 'jwt').default('development'),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ISSUER: Joi.string().required(),
  JWT_AUDIENCE: Joi.string().required(),
  WORKER_ID: Joi.string().min(1).default('local-worker-1'),
  WORKER_POLL_INTERVAL_MS: Joi.number().integer().min(50).max(60_000).default(500),
  WORKER_LEASE_SECONDS: Joi.number().integer().min(5).max(900).default(30),
  MODEL_PROVIDER: Joi.string().valid('deterministic').default('deterministic'),
  WORKFLOW_VERSION: Joi.string()
    .pattern(/^prototype-run\/v[1-9][0-9]*$/)
    .default('prototype-run/v1'),
  OBJECT_STORAGE_ENDPOINT: Joi.string().uri().required(),
  OBJECT_STORAGE_REGION: Joi.string().required(),
  OBJECT_STORAGE_BUCKET: Joi.string().min(3).required(),
  OBJECT_STORAGE_ACCESS_KEY: Joi.string().required(),
  OBJECT_STORAGE_SECRET_KEY: Joi.string().min(8).required(),
  OBJECT_STORAGE_FORCE_PATH_STYLE: Joi.boolean().truthy('true').falsy('false').default(true),
}).custom((value: Record<string, unknown>, helpers: Joi.CustomHelpers) => {
  if (value.AUTH_MODE === 'development' && value.APP_ENV !== 'local' && value.APP_ENV !== 'test') {
    return helpers.error('any.invalid', {
      message: 'AUTH_MODE=development is restricted to APP_ENV=local|test',
    });
  }
  return value;
});
