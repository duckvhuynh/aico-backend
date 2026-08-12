import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/domain/domain-error';
import { newId } from '../../common/domain/identifiers';
import type { RequestActor } from '../../common/http/request-context';
import type { CreateDevTokenDto } from './dto/create-dev-token.dto';
import type { AccessTokenPayload } from './auth.types';

interface FounderRow {
  id: string;
  auth_subject: string;
  status: 'ACTIVE' | 'DISABLED';
  company_id: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async createDevelopmentToken(dto: CreateDevTokenDto): Promise<{
    access_token: string;
    token_type: 'Bearer';
    expires_in: number;
    founder_id: string;
  }> {
    const environment = this.config.getOrThrow<string>('app.environment');
    const mode = this.config.getOrThrow<string>('auth.mode');
    if (mode !== 'development' || !['local', 'test'].includes(environment)) {
      throw new DomainError({
        status: 404,
        code: 'resource_not_found',
        title: 'Resource not found',
        detail: 'The requested resource does not exist.',
      });
    }

    const subject = `dev:${dto.email}`;
    await this.dataSource.query(
      `
        INSERT INTO founders (id, auth_subject, display_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (auth_subject)
        DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()
      `,
      [newId(), subject, dto.display_name],
    );
    const rows = await this.dataSource.query<FounderRow[]>(
      `
        SELECT f.id, f.auth_subject, f.status, c.id AS company_id
        FROM founders f
        LEFT JOIN companies c ON c.founder_id = f.id AND c.status <> 'DELETED'
        WHERE f.auth_subject = $1
      `,
      [subject],
    );
    const founder = rows[0];
    const payload: AccessTokenPayload = {
      sub: founder.id,
      auth_subject: founder.auth_subject,
      type: 'founder',
    };
    const accessToken = await this.jwtService.signAsync(payload, { expiresIn: '15m' });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      founder_id: founder.id,
    };
  }

  async verifyAccessToken(token: string): Promise<RequestActor> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new DomainError({
        status: 401,
        code: 'authentication_required',
        title: 'Authentication is required',
        detail: 'Provide a valid, unexpired bearer token.',
        remediation: ['authenticate'],
      });
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
      throw new DomainError({
        status: 401,
        code: 'session_revoked',
        title: 'The session is no longer active',
        detail: 'Authenticate again with an active account.',
        remediation: ['authenticate'],
      });
    }
    return {
      id: founder.id,
      authSubject: founder.auth_subject,
      companyId: founder.company_id,
    };
  }
}
