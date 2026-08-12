import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/domain/domain-error';
import { newId } from '../../common/domain/identifiers';
import type { RequestActor } from '../../common/http/request-context';
import { CommandExecutor, type CommandResult } from '../governance/command-executor.service';
import { DomainEventService } from '../governance/domain-event.service';
import type { CompanyProfileDto } from './dto/company-profile.dto';
import type { CreateCompanyDto } from './dto/create-company.dto';

interface CompanyProfileRow {
  id: string;
  name: string;
  status: string;
  row_version: number;
  created_at: Date;
  profile_id: string;
  profile_version: number;
  purpose: string;
  target_customer: string;
  constraints: string[];
  normalized_limits: Record<string, unknown>;
  sensitive_data_warning_acknowledged: boolean;
  profile_created_at: Date;
}

@Injectable()
export class CompaniesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly commandExecutor: CommandExecutor,
    private readonly events: DomainEventService,
  ) {}

  async create(
    actor: RequestActor,
    idempotencyKey: string,
    correlationId: string,
    dto: CreateCompanyDto,
  ): Promise<CommandResult<Record<string, unknown>>> {
    return this.commandExecutor.run({
      actorId: actor.id,
      operation: 'companies.create',
      idempotencyKey,
      request: dto,
      execute: async (runner) => {
        const existing = (await runner.query(`SELECT id FROM companies WHERE founder_id = $1`, [
          actor.id,
        ])) as Array<{ id: string }>;
        if (existing.length > 0) {
          throw new DomainError({
            status: 409,
            code: 'company_already_exists',
            title: 'The founder already has a company',
            detail: 'The MVP supports one company per founder account.',
            remediation: ['get_current_company'],
          });
        }

        const companyId = newId();
        const profileId = newId();
        await runner.query(`INSERT INTO companies (id, founder_id, name) VALUES ($1, $2, $3)`, [
          companyId,
          actor.id,
          dto.name.trim(),
        ]);
        await runner.query(
          `
            INSERT INTO company_profile_versions
              (id, company_id, version, purpose, target_customer, constraints, normalized_limits,
               sensitive_data_warning_acknowledged, created_by)
            VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8)
          `,
          [
            profileId,
            companyId,
            dto.profile.purpose.trim(),
            dto.profile.target_customer.trim(),
            JSON.stringify(dto.profile.constraints),
            JSON.stringify(dto.profile.normalized_limits),
            dto.profile.sensitive_data_warning_acknowledged,
            actor.id,
          ],
        );
        await runner.query(
          `UPDATE companies SET current_profile_version_id = $2, updated_at = now() WHERE id = $1`,
          [companyId, profileId],
        );
        await this.events.append(runner, {
          companyId,
          type: 'company_created',
          actorType: 'FOUNDER',
          actorId: actor.id,
          correlationId,
          payload: { company_id: companyId, profile_version_id: profileId, profile_version: 1 },
        });
        const company = await this.getByIdWithRunner(runner, companyId);
        return { status: 201, body: this.toResponse(company) };
      },
    });
  }

  async getCurrent(actor: RequestActor): Promise<Record<string, unknown>> {
    const rows = await this.dataSource.query<CompanyProfileRow[]>(
      this.companyQuery("WHERE c.founder_id = $1 AND c.status <> 'DELETED'"),
      [actor.id],
    );
    if (!rows[0]) {
      throw this.notFound();
    }
    return this.toResponse(rows[0]);
  }

  async updateProfile(
    actor: RequestActor,
    idempotencyKey: string,
    expectedVersion: number,
    correlationId: string,
    dto: CompanyProfileDto,
  ): Promise<CommandResult<Record<string, unknown>>> {
    return this.commandExecutor.run({
      actorId: actor.id,
      operation: 'companies.profile.replace',
      idempotencyKey,
      request: { expectedVersion, dto },
      execute: async (runner) => {
        const rows = (await runner.query(
          `
            SELECT c.id, p.version
            FROM companies c
            JOIN company_profile_versions p ON p.id = c.current_profile_version_id
            WHERE c.founder_id = $1 AND c.status <> 'DELETED'
            FOR UPDATE OF c
          `,
          [actor.id],
        )) as Array<{ id: string; version: number }>;
        const current = rows[0];
        if (!current) {
          throw this.notFound();
        }
        if (current.version !== expectedVersion) {
          throw new DomainError({
            status: 412,
            code: 'precondition_failed',
            title: 'The company profile changed',
            detail: 'Refresh the company profile and retry with its current ETag.',
            remediation: ['refresh_resource', 'retry_command'],
          });
        }
        const profileId = newId();
        const nextVersion = current.version + 1;
        await runner.query(
          `
            INSERT INTO company_profile_versions
              (id, company_id, version, purpose, target_customer, constraints, normalized_limits,
               sensitive_data_warning_acknowledged, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            profileId,
            current.id,
            nextVersion,
            dto.purpose.trim(),
            dto.target_customer.trim(),
            JSON.stringify(dto.constraints),
            JSON.stringify(dto.normalized_limits),
            dto.sensitive_data_warning_acknowledged,
            actor.id,
          ],
        );
        await runner.query(
          `
            UPDATE companies
            SET current_profile_version_id = $2, row_version = row_version + 1, updated_at = now()
            WHERE id = $1
          `,
          [current.id, profileId],
        );
        await this.events.append(runner, {
          companyId: current.id,
          type: 'company_profile_version_created',
          actorType: 'FOUNDER',
          actorId: actor.id,
          correlationId,
          payload: { profile_version_id: profileId, profile_version: nextVersion },
        });
        const company = await this.getByIdWithRunner(runner, current.id);
        return { status: 200, body: this.toResponse(company) };
      },
    });
  }

  private async getByIdWithRunner(
    runner: import('typeorm').QueryRunner,
    companyId: string,
  ): Promise<CompanyProfileRow> {
    const rows = (await runner.query(this.companyQuery('WHERE c.id = $1'), [
      companyId,
    ])) as CompanyProfileRow[];
    return rows[0];
  }

  private companyQuery(where: string): string {
    return `
      SELECT c.id, c.name, c.status, c.row_version, c.created_at,
             p.id AS profile_id, p.version AS profile_version, p.purpose, p.target_customer,
             p.constraints, p.normalized_limits, p.sensitive_data_warning_acknowledged,
             p.created_at AS profile_created_at
      FROM companies c
      JOIN company_profile_versions p ON p.id = c.current_profile_version_id
      ${where}
    `;
  }

  private toResponse(row: CompanyProfileRow): Record<string, unknown> {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      row_version: row.row_version,
      current_profile: {
        id: row.profile_id,
        version: row.profile_version,
        purpose: row.purpose,
        target_customer: row.target_customer,
        constraints: row.constraints,
        normalized_limits: row.normalized_limits,
        sensitive_data_warning_acknowledged: row.sensitive_data_warning_acknowledged,
        created_at: row.profile_created_at,
      },
      created_at: row.created_at,
    };
  }

  private notFound(): DomainError {
    return new DomainError({
      status: 404,
      code: 'resource_not_found',
      title: 'Company not found',
      detail: 'No company is provisioned for this founder.',
      remediation: ['create_company'],
    });
  }
}
