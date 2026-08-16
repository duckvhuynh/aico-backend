import {
  founderAuthSubject,
  hashInviteToken,
  signedResourceAccessAllowed,
} from '../src/modules/auth/auth-crypto';

describe('AICO-012 invite/session helpers', () => {
  it('hashes invite tokens without storing the plaintext', () => {
    const digest = hashInviteToken('invite-token-plaintext-value');
    expect(digest).toHaveLength(64);
    expect(digest).not.toContain('invite-token-plaintext-value');
    expect(hashInviteToken('invite-token-plaintext-value')).toBe(digest);
  });

  it('derives a stable founder subject from email', () => {
    expect(founderAuthSubject('  Founder@Example.TEST ')).toBe('founder:founder@example.test');
  });

  it('denies signed-resource access for revoked or expired sessions', () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    expect(
      signedResourceAccessAllowed({
        status: 'ACTIVE',
        expiresAt: new Date('2026-08-16T12:01:00.000Z'),
        now,
      }),
    ).toBe(true);
    expect(
      signedResourceAccessAllowed({
        status: 'REVOKED',
        expiresAt: new Date('2026-08-16T12:01:00.000Z'),
        now,
      }),
    ).toBe(false);
    expect(
      signedResourceAccessAllowed({
        status: 'ACTIVE',
        expiresAt: new Date('2026-08-16T11:59:00.000Z'),
        now,
      }),
    ).toBe(false);
  });
});
