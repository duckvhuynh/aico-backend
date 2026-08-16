export type HealthRole = 'api';

export type ReadinessChecks = {
  database: 'up' | 'down';
  object_store: 'up' | 'down';
  migrations: 'compatible' | 'missing' | 'unknown';
};

export type ReadinessPorts = {
  pingDatabase(): Promise<void>;
  migrationCompatible(): Promise<boolean>;
  pingObjectStore(): Promise<void>;
};

export const livenessBody = (role: HealthRole): { status: 'ok'; role: HealthRole } => ({
  status: 'ok',
  role,
});

export const collectReadiness = async (
  ports: ReadinessPorts,
): Promise<{ ready: boolean; checks: ReadinessChecks }> => {
  const checks: ReadinessChecks = {
    database: 'down',
    object_store: 'down',
    migrations: 'unknown',
  };
  try {
    await ports.pingDatabase();
    checks.database = 'up';
    checks.migrations = (await ports.migrationCompatible()) ? 'compatible' : 'missing';
    await ports.pingObjectStore();
    checks.object_store = 'up';
  } catch {
    return { ready: false, checks };
  }
  return { ready: checks.migrations === 'compatible' && checks.object_store === 'up', checks };
};
