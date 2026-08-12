interface PostgresDriverError {
  code?: string;
  constraint?: string;
}

export function postgresError(error: unknown): PostgresDriverError | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const candidate = error as { driverError?: PostgresDriverError } & PostgresDriverError;
  return candidate.driverError ?? candidate;
}
