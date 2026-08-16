import { assertConfiguration, redactConfigurationText } from '../src/config/validation';

const validLocal: Record<string, string> = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  DATABASE_URL: 'postgresql://aico:aico@localhost:5432/aico',
  DATABASE_SSL: 'false',
  AUTH_MODE: 'development',
  JWT_SECRET: 'replace-with-at-least-32-characters',
  JWT_ISSUER: 'aico-backend',
  JWT_AUDIENCE: 'aico-control-plane',
  OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
  OBJECT_STORAGE_REGION: 'us-east-1',
  OBJECT_STORAGE_BUCKET: 'aico-local',
  OBJECT_STORAGE_ACCESS_KEY: 'aico',
  OBJECT_STORAGE_SECRET_KEY: 'local-minio-secret',
};

describe('configuration validation', () => {
  it('accepts the documented local/test fixture', () => {
    expect(() => assertConfiguration({ ...validLocal })).not.toThrow();
  });

  it('fails missing JWT_SECRET without echoing later secret values', () => {
    const leakedSecret = 'super-secret-value-do-not-leak-12345';
    const withoutJwt: Record<string, string> = {
      ...validLocal,
      OBJECT_STORAGE_SECRET_KEY: leakedSecret,
    };
    delete withoutJwt.JWT_SECRET;
    expect.assertions(3);
    try {
      assertConfiguration({
        ...withoutJwt,
        OBJECT_STORAGE_SECRET_KEY: leakedSecret,
      });
    } catch (error: unknown) {
      const message = (error as Error).message;
      expect(message).toContain('JWT_SECRET');
      expect(message).not.toContain(leakedSecret);
      expect(message).toContain('Config validation error');
    }
  });

  it('redacts a short JWT_SECRET value from the error text', () => {
    const shortSecret = 'too-short-secret-value';
    expect.assertions(2);
    try {
      assertConfiguration({ ...validLocal, JWT_SECRET: shortSecret });
    } catch (error: unknown) {
      const message = (error as Error).message;
      expect(message).toContain('JWT_SECRET');
      expect(message).not.toContain(shortSecret);
    }
  });

  it('redacts a database password if it appears in the diagnostic', () => {
    const password = 'hunter2-database-password';
    const url = `postgresql://aico:${password}@localhost:5432/aico`;
    const message = redactConfigurationText(`invalid ${url}`, { DATABASE_URL: url });
    expect(message).not.toContain(password);
    expect(message).toContain('[REDACTED]');
  });

  it('requires TLS for staging and production database and object storage', () => {
    expect(() =>
      assertConfiguration({
        ...validLocal,
        APP_ENV: 'production',
        AUTH_MODE: 'jwt',
        DATABASE_SSL: 'false',
        OBJECT_STORAGE_ENDPOINT: 'http://objects.example.test',
      }),
    ).toThrow(/DATABASE_SSL must be true/);

    expect(() =>
      assertConfiguration({
        ...validLocal,
        APP_ENV: 'production',
        AUTH_MODE: 'jwt',
        DATABASE_SSL: 'true',
        OBJECT_STORAGE_ENDPOINT: 'http://objects.example.test',
      }),
    ).toThrow(/OBJECT_STORAGE_ENDPOINT must use https/);

    expect(() =>
      assertConfiguration({
        ...validLocal,
        APP_ENV: 'production',
        AUTH_MODE: 'jwt',
        DATABASE_SSL: 'true',
        OBJECT_STORAGE_ENDPOINT: 'https://objects.example.test',
      }),
    ).not.toThrow();
  });
});
