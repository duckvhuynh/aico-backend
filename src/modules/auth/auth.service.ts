import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/domain/domain-error';
import { newId } from '../../common/domain/identifiers';
import type { RequestActor } from '../../common/http/request-context';
import {
  DEFAULT_INVITE_TTL_SECONDS,
  DEFAULT_SESSION_TTL_SECONDS,
  founderAuthSubject,
  hashInviteToken,
  newInviteToken,
  signedResourceAccessAllowed,
} from './auth-crypto';
import type { AccessTokenPayload } from './auth.types';
import type { IssueInviteDto } from './dto/issue-invite.dto';
import type { RedeemInviteDto } from './dto/redeem-invite.dto';

function isJwtExpired(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: string }).name === 'TokenExpiredError'
  );
}

interface FounderRow {
  id: string;
  auth_subject: string;
  status: 'ACTIVE' | 'DISABLED';
  company_id: string | null;
}

interface InviteRow {
  id: string;
  email: string;
  display_name: string;
  status: 'PENDING' | 'REDEEMED' | 'REVOKED' | 'EXPIRED';
  expires_at: Date;
  session_ttl_seconds: number | null;
}

interface SessionRow {
  id: string;
  founder_id: string;
  status: 'ACTIVE' | 'REVOKED';
  expires_at: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issueInvite(dto: IssueInviteDto): Promise<{
    invite_id: string;
    invite_token: string;
    expires_at: string;
    session_ttl_seconds: number;
  }> {
    this.assertDevelopmentAdapter();
    const inviteTtl = dto.invite_ttl_seconds ?? DEFAULT_INVITE_TTL_SECONDS;
    const sessionTtl = dto.session_ttl_seconds ?? DEFAULT_SESSION_TTL_SECONDS;
    const token = newInviteToken();
    const inviteId = newId();
    const expiresAt = new Date(Date.now() + inviteTtl * 1000);
    await this.dataSource.query(
      `
        INSERT INTO founder_invites
          (id, email, display_name, token_hash, status, expires_at, session_ttl_seconds)
        VALUES ($1, $2, $3, $4, 'PENDING', $5, $6)
      `,
      [inviteId, dto.email, dto.display_name, hashInviteToken(token), expiresAt, sessionTtl],
    );
    return {
      invite_id: inviteId,
      invite_token: token,
      expires_at: expiresAt.toISOString(),
      session_ttl_seconds: sessionTtl,
    };
  }

  async redeemInvite(dto: RedeemInviteDto): Promise<{
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    founder_id: string;
    session_id: string;
  }> {
    const tokenHash = hashInviteToken(dto.invite_token);
    return this.dataSource.transaction(async (runner) => {
      const invites: InviteRow[] = await runner.query(
        `
          SELECT id, email, display_name, status, expires_at, session_ttl_seconds
          FROM founder_invites
          WHERE token_hash = $1
          FOR UPDATE
        `,
        [tokenHash],
      );
      const invite = invites[0];
      if (
        !invite ||
        invite.status !== 'PENDING' ||
        new Date(invite.expires_at).getTime() <= Date.now()
      ) {
        if (invite?.status === 'PENDING' && new Date(invite.expires_at).getTime() <= Date.now()) {
          await runner.query(
            `UPDATE founder_invites SET status = 'EXPIRED', updated_at = now() WHERE id = $1 AND status = 'PENDING'`,
            [invite.id],
          );
        }
        throw this.invalidInvite();
      }

      const authSubject = founderAuthSubject(invite.email);
      await runner.query(
        `
          INSERT INTO founders (id, auth_subject, display_name)
          VALUES ($1, $2, $3)
          ON CONFLICT (auth_subject)
          DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
        `,
        [newId(), authSubject, invite.display_name],
      );
      const founders: FounderRow[] = await runner.query(
        `
          SELECT f.id, f.auth_subject, f.status, c.id AS company_id
          FROM founders f
          LEFT JOIN companies c ON c.founder_id = f.id AND c.status <> 'DELETED'
          WHERE f.auth_subject = $1
        `,
        [authSubject],
      );
      const founder = founders[0];
      if (!founder || founder.status !== 'ACTIVE') {
        throw this.sessionInactive('session_revoked');
      }

      const sessionTtl = Number(invite.session_ttl_seconds) || DEFAULT_SESSION_TTL_SECONDS;
      const session = await this.insertSession(runner, founder.id, sessionTtl);
      await runner.query(
        `
          UPDATE founder_invites
          SET status = 'REDEEMED', redeemed_founder_id = $2, updated_at = now()
          WHERE id = $1 AND status = 'PENDING'
        `,
        [invite.id, founder.id],
      );
      return this.issueAccessToken(founder, session, sessionTtl);
    });
  }

  async signOut(actor: RequestActor): Promise<void> {
    await this.dataSource.query(
      `
        UPDATE founder_sessions
        SET status = 'REVOKED', revoked_at = now()
        WHERE id = $1 AND founder_id = $2 AND status = 'ACTIVE'
      `,
      [actor.sessionId, actor.id],
    );
  }

  assertSignedResourceAccess(session: { status: string; expiresAt: Date }): void {
    if (!signedResourceAccessAllowed(session)) {
      throw this.sessionInactive(
        session.status === 'REVOKED' ? 'session_revoked' : 'session_expired',
      );
    }
  }

  async verifyAccessToken(token: string): Promise<RequestActor> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch (error: unknown) {
      if (isJwtExpired(error)) {
        throw this.sessionInactive('session_expired');
      }
      throw this.authenticationRequired();
    }
    if (payload.type !== 'founder' || !payload.sid || payload.jti !== payload.sid) {
      throw this.authenticationRequired();
    }

    const sessions: SessionRow[] = await this.dataSource.query(
      `
        SELECT id, founder_id, status, expires_at
        FROM founder_sessions
        WHERE id = $1 AND founder_id = $2
      `,
      [payload.sid, payload.sub],
    );
    const session = sessions[0];
    if (!session) {
      throw this.authenticationRequired();
    }
    if (session.status === 'REVOKED') {
      throw this.sessionInactive('session_revoked');
    }
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      throw this.sessionInactive('session_expired');
    }

    const rows = await this.dataSource.query<FounderRow[]>(
      `
        SELECT f.id, f.auth_subject, f.status, c.id AS company_id
        FROM founders f
        LEFT JOIN companies c ON c.founder_id = f.id AND c.status <> 'DELETED'
        WHERE f.id = $1 AND f.auth_subject = $2
      `,
      [payload.sub, payload.auth_subject],
    );
    const founder = rows[0];
    if (!founder || founder.status !== 'ACTIVE') {
      throw this.sessionInactive('session_revoked');
    }
    this.assertSignedResourceAccess({
      status: session.status,
      expiresAt: new Date(session.expires_at),
    });
    return {
      id: founder.id,
      authSubject: founder.auth_subject,
      companyId: founder.company_id,
      sessionId: session.id,
    };
  }

  unavailableRegistration(): never {
    throw new DomainError({
      status: 404,
      code: 'resource_not_found',
      title: 'Resource not found',
      detail: 'The requested resource does not exist.',
    });
  }

  private async insertSession(
    runner: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
    founderId: string,
    sessionTtl: number,
  ): Promise<SessionRow> {
    const sessionId = newId();
    const expiresAt = new Date(Date.now() + sessionTtl * 1000);
    await runner.query(
      `
        INSERT INTO founder_sessions (id, founder_id, status, expires_at)
        VALUES ($1, $2, 'ACTIVE', $3)
      `,
      [sessionId, founderId, expiresAt],
    );
    return { id: sessionId, founder_id: founderId, status: 'ACTIVE', expires_at: expiresAt };
  }

  private async issueAccessToken(
    founder: FounderRow,
    session: SessionRow,
    sessionTtl: number,
  ): Promise<{
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    founder_id: string;
    session_id: string;
  }> {
    const payload: AccessTokenPayload = {
      sub: founder.id,
      auth_subject: founder.auth_subject,
      type: 'founder',
      sid: session.id,
      jti: session.id,
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: sessionTtl,
    });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: sessionTtl,
      founder_id: founder.id,
      session_id: session.id,
    };
  }

  private assertDevelopmentAdapter(): void {
    const environment = this.config.getOrThrow<string>('app.environment');
    const mode = this.config.getOrThrow<string>('auth.mode');
    if (mode !== 'development' || !['local', 'test'].includes(environment)) {
      this.unavailableRegistration();
    }
  }

  private invalidInvite(): DomainError {
    return new DomainError({
      status: 401,
      code: 'authentication_required',
      title: 'Authentication is required',
      detail: 'Provide a valid, unexpired invite token.',
      remediation: ['authenticate'],
    });
  }

  private authenticationRequired(): DomainError {
    return new DomainError({
      status: 401,
      code: 'authentication_required',
      title: 'Authentication is required',
      detail: 'Provide a valid, unexpired bearer token.',
      remediation: ['authenticate'],
    });
  }

  private sessionInactive(code: 'session_expired' | 'session_revoked'): DomainError {
    return new DomainError({
      status: 401,
      code,
      title: 'The session is no longer active',
      detail: 'Authenticate again with an active invited account.',
      remediation: ['authenticate'],
    });
  }
}
