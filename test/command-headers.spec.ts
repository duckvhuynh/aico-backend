import { DomainError } from '../src/common/domain/domain-error';
import { formatEtag, requireEtag, requireIdempotencyKey } from '../src/common/http/command-headers';

describe('command headers', () => {
  it('accepts UUID idempotency keys', () => {
    const key = '019c0000-0000-7000-8000-000000000010';
    expect(requireIdempotencyKey(key)).toBe(key);
  });

  it('rejects malformed idempotency keys with a stable domain code', () => {
    expect.assertions(2);
    try {
      requireIdempotencyKey('not-a-uuid');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('validation_failed');
    }
  });

  it('round-trips strong ETags', () => {
    expect(requireEtag(formatEtag(7))).toBe(7);
  });
});
