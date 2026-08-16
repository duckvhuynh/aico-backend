import { collectReadiness, livenessBody } from '../src/modules/health/health.checks';

describe('health checks', () => {
  it('reports liveness without dependency fields', () => {
    const body = livenessBody('api');
    expect(body).toEqual({ status: 'ok', role: 'api' });
    expect(body).not.toHaveProperty('checks');
  });

  it('marks readiness failed when the database is down and does not ping object storage', async () => {
    const pingObjectStore = jest.fn();
    const result = await collectReadiness({
      pingDatabase: async () => {
        throw new Error('ECONNREFUSED');
      },
      migrationCompatible: async () => true,
      pingObjectStore,
    });
    expect(result.ready).toBe(false);
    expect(result.checks).toEqual({
      database: 'down',
      object_store: 'down',
      migrations: 'unknown',
    });
    expect(pingObjectStore).not.toHaveBeenCalled();
  });

  it('marks readiness failed when migrations are missing', async () => {
    const result = await collectReadiness({
      pingDatabase: async () => undefined,
      migrationCompatible: async () => false,
      pingObjectStore: async () => undefined,
    });
    expect(result.ready).toBe(false);
    expect(result.checks.database).toBe('up');
    expect(result.checks.migrations).toBe('missing');
    expect(result.checks.object_store).toBe('up');
  });

  it('marks readiness failed when the object store is unavailable after a healthy database', async () => {
    const result = await collectReadiness({
      pingDatabase: async () => undefined,
      migrationCompatible: async () => true,
      pingObjectStore: async () => {
        throw new Error('bucket missing');
      },
    });
    expect(result.ready).toBe(false);
    expect(result.checks).toEqual({
      database: 'up',
      object_store: 'down',
      migrations: 'compatible',
    });
  });

  it('marks readiness successful only when database, migrations, and object store pass', async () => {
    const result = await collectReadiness({
      pingDatabase: async () => undefined,
      migrationCompatible: async () => true,
      pingObjectStore: async () => undefined,
    });
    expect(result.ready).toBe(true);
    expect(result.checks).toEqual({
      database: 'up',
      object_store: 'up',
      migrations: 'compatible',
    });
  });
});
