import * as Joi from 'joi';

const secretKeyPattern = /secret|password|access_key|credential/i;

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
    return helpers.message({
      custom: 'AUTH_MODE=development is restricted to APP_ENV=local|test',
    });
  }
  if (value.APP_ENV === 'staging' || value.APP_ENV === 'production') {
    if (value.DATABASE_SSL !== true) {
      return helpers.message({
        custom: 'DATABASE_SSL must be true when APP_ENV is staging or production',
      });
    }
    const endpoint =
      typeof value.OBJECT_STORAGE_ENDPOINT === 'string' ? value.OBJECT_STORAGE_ENDPOINT : '';
    if (!endpoint.startsWith('https://')) {
      return helpers.message({
        custom: 'OBJECT_STORAGE_ENDPOINT must use https when APP_ENV is staging or production',
      });
    }
  }
  return value;
});

export const redactConfigurationText = (text: string, config: Record<string, unknown>): string => {
  let redacted = text.replace(/:([^:@/?#]+)@/g, ':[REDACTED]@');
  for (const [key, raw] of Object.entries(config)) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    if (!secretKeyPattern.test(key) && key !== 'DATABASE_URL' && key !== 'JWT_SECRET') {
      continue;
    }
    if (redacted.includes(raw)) {
      redacted = redacted.split(raw).join('[REDACTED]');
    }
  }
  return redacted;
};

export const formatConfigurationError = (
  error: Joi.ValidationError,
  config: Record<string, unknown>,
): string => {
  const messages = error.details.map((detail) => detail.message).join('; ');
  return redactConfigurationText(`Config validation error: ${messages}`, config);
};

export const assertConfiguration = (config: Record<string, unknown>): Record<string, unknown> => {
  const result = configurationSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  });
  if (result.error) {
    throw new Error(formatConfigurationError(result.error, config));
  }
  return result.value as Record<string, unknown>;
};
