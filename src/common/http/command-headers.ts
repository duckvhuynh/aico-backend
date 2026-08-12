import { DomainError } from '../domain/domain-error';
import { isUuid } from '../domain/identifiers';

export function requireIdempotencyKey(value: string | undefined): string {
  if (!value || !isUuid(value)) {
    throw new DomainError({
      status: 400,
      code: 'validation_failed',
      title: 'A valid idempotency key is required',
      detail: 'Provide Idempotency-Key as a UUID.',
      errors: [{ field: 'Idempotency-Key', rule: 'uuid' }],
      remediation: ['provide_idempotency_key'],
    });
  }
  return value;
}

export function requireEtag(value: string | undefined): number {
  const match = value?.match(/^(?:W\/)?"(\d+)"$/);
  if (!match) {
    throw new DomainError({
      status: 412,
      code: 'precondition_required',
      title: 'A current resource version is required',
      detail: 'Refresh the resource and provide its ETag in If-Match.',
      remediation: ['refresh_resource', 'retry_command'],
    });
  }
  return Number.parseInt(match[1], 10);
}

export function formatEtag(version: number): string {
  return `"${version}"`;
}
