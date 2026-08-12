import { registerAs } from '@nestjs/config';

export type AppEnvironment = 'local' | 'test' | 'staging' | 'production';

export const appConfig = registerAs('app', () => ({
  environment: (process.env.APP_ENV ?? 'local') as AppEnvironment,
  nodeEnvironment: process.env.NODE_ENV ?? 'development',
  port: Number.parseInt(process.env.PORT ?? '3000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
}));

export const authConfig = registerAs('auth', () => ({
  mode: process.env.AUTH_MODE ?? 'development',
  jwtSecret: process.env.JWT_SECRET ?? '',
  issuer: process.env.JWT_ISSUER ?? 'aico-backend',
  audience: process.env.JWT_AUDIENCE ?? 'aico-control-plane',
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL ?? '',
  ssl: process.env.DATABASE_SSL === 'true',
}));

export const workerConfig = registerAs('worker', () => ({
  id: process.env.WORKER_ID ?? 'local-worker-1',
  pollIntervalMs: Number.parseInt(process.env.WORKER_POLL_INTERVAL_MS ?? '500', 10),
  leaseSeconds: Number.parseInt(process.env.WORKER_LEASE_SECONDS ?? '30', 10),
  modelProvider: process.env.MODEL_PROVIDER ?? 'deterministic',
  workflowVersion: process.env.WORKFLOW_VERSION ?? 'prototype-run/v1',
}));

export const objectStorageConfig = registerAs('objectStorage', () => ({
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT ?? '',
  region: process.env.OBJECT_STORAGE_REGION ?? 'us-east-1',
  bucket: process.env.OBJECT_STORAGE_BUCKET ?? '',
  accessKey: process.env.OBJECT_STORAGE_ACCESS_KEY ?? '',
  secretKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? '',
  forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE !== 'false',
}));
