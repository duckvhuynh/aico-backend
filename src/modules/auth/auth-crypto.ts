import { createHash, randomBytes } from 'node:crypto';

export const INVITE_TOKEN_BYTES = 32;
export const DEFAULT_INVITE_TTL_SECONDS = 86_400;
export const DEFAULT_SESSION_TTL_SECONDS = 900;

export function newInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function founderAuthSubject(email: string): string {
  return `founder:${email.trim().toLowerCase()}`;
}

export function signedResourceAccessAllowed(session: {
  status: string;
  expiresAt: Date;
  now?: Date;
}): boolean {
  const now = session.now ?? new Date();
  return session.status === 'ACTIVE' && session.expiresAt.getTime() > now.getTime();
}
