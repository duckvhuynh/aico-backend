import { createHash } from 'node:crypto';
import { validate as validateUuid, v7 as uuidv7 } from 'uuid';

export function newId(): string {
  return uuidv7();
}

export function isUuid(value: string): boolean {
  return validateUuid(value);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJson(entry)]),
    );
  }
  return value;
}

export function canonicalDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(sortJson(value)))
    .digest('hex');
}
