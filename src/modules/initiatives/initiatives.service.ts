import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/domain/domain-error';
import { newId } from '../../common/domain/identifiers';
import { postgresError } from '../../common/domain/postgres-error';
import type { RequestActor } from '../../common/http/request-context';
import { companyScopeFromActor } from '../../common/tenant/company-scope';
import { CommandExecutor, type CommandResult } from '../governance/command-executor.service';
import { DomainEventService } from '../governance/domain-event.service';
import { canonicalStructuredGoal, type CreateGoalDto } from './dto/create-goal.dto';
import type { CreateInitiativeDto } from './dto/create-initiative.dto';
import { GoalScopePolicy } from './goal-scope.policy';

const PM_EMPLOYEE_DEFINITION_ID = '019c0000-0000-7000-8000-000000000001';

interface InitiativeRow {
  id: string;
  company_id: string;
  type: string;
  title: string;
  status: string;
  current_goal_version_id: string | null;
  row_version: number;
  created_at: Date;
}

@Injectable()
export class InitiativesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly commands: CommandExecutor,
    private readonly events: DomainEventService,
    private readonly goalScope: GoalScopePolicy,
    private readonly config: ConfigService,
  ) {}

  async create(
    actor: RequestActor,
    idempotencyKey: string,
    correlationId: string,
    dto: CreateInitiativeDto,
  ): Promise<CommandResult<Record<string, unknown>>> {
    if (!actor.companyId) {
      throw this.companyNotFound();
    }
    const companyId = companyScopeFromActor(actor).companyId;
    try {
      return await this.commands.run({
        actorId: actor.id,
        operation: 'initiatives.create',
        idempotencyKey,
        request: dto,
        execute: async (runner) => {
          await runner.query(
            `SELECT id FROM companies WHERE id = $1 AND founder_id = $2 FOR UPDATE`,
            [companyId, actor.id],
          );
          const existing = (await runner.query(
            `
              SELECT id FROM initiatives
              WHERE company_id = $1 AND type = 'PROTOTYPE' AND status IN ('DRAFT', 'ACTIVE')
            `,
            [companyId],
          )) as Array<{ id: string }>;
          if (existing.length > 0) {
            throw this.activeInitiativeExists();
          }
          const initiativeId = newId();
          await runner.query(
            `
              INSERT INTO initiatives (id, company_id, type, title)
              VALUES ($1, $2, 'PROTOTYPE', $3)
            `,
            [initiativeId, companyId, dto.title.trim()],
          );
          await this.events.append(runner, {
            companyId,
            type: 'initiative_created',
            actorType: 'FOUNDER',
            actorId: actor.id,
            correlationId,
            payload: { initiative_id: initiativeId, type: 'PROTOTYPE', status: 'DRAFT' },
          });
          return {
            status: 201,
            body: this.initiativeResponse({
              id: initiativeId,
              company_id: companyId,
              type: 'PROTOTYPE',
              title: dto.title.trim(),
              status: 'DRAFT',
              current_goal_version_id: null,
              row_version: 1,
              created_at: new Date(),
            }),
          };
        },
      });
    } catch (error: unknown) {
      if (postgresError(error)?.constraint === 'initiatives_one_active_prototype') {
        throw this.activeInitiativeExists();
      }
      throw error;
    }
  }

  async createGoalAndRun(
    actor: RequestActor,
    initiativeId: string,
    expectedVersion: number,
    idempotencyKey: string,
    correlationId: string,
    dto: CreateGoalDto,
  ): Promise<CommandResult<Record<string, unknown>>> {
    if (!actor.companyId) {
      throw this.companyNotFound();
    }
    const companyId = companyScopeFromActor(actor).companyId;
    const workflowVersion = this.config.getOrThrow<string>('worker.workflowVersion');
    this.goalScope.assertSupported(dto);
    return this.commands.run({
      actorId: actor.id,
      operation: 'initiatives.goals.create_and_start',
      idempotencyKey,
      request: { initiativeId, expectedVersion, dto },
      execute: async (runner) => {
        const initiativeRows = (await runner.query(
          `
            SELECT * FROM initiatives
            WHERE company_id = $1 AND id = $2 AND status IN ('DRAFT', 'ACTIVE')
            FOR UPDATE
          `,
          [companyId, initiativeId],
        )) as InitiativeRow[];
        const initiative = initiativeRows[0];
        if (!initiative) {
          throw this.resourceNotFound();
        }
        if (initiative.row_version !== expectedVersion) {
          throw new DomainError({
            status: 412,
            code: 'precondition_failed',
            title: 'The initiative changed',
            detail: 'Refresh the initiative and retry with its current ETag.',
            remediation: ['refresh_resource', 'retry_command'],
          });
        }
        const profileRows = (await runner.query(
          `SELECT current_profile_version_id FROM companies WHERE id = $1 AND founder_id = $2`,
          [companyId, actor.id],
        )) as Array<{ current_profile_version_id: string }>;
        const versionRows = (await runner.query(
          `
            SELECT COALESCE(MAX(version), 0) + 1 AS version
            FROM goal_versions
            WHERE company_id = $1 AND initiative_id = $2
          `,
          [companyId, initiativeId],
        )) as Array<{ version: string }>;
        const goalVersion = Number.parseInt(versionRows[0].version, 10);
        const goalVersionId = newId();
        const contextSnapshotId = newId();
        const runId = newId();
        const taskId = newId();
        const structuredGoal = canonicalStructuredGoal(dto.goal);

        const inserted = (await runner.query(
          `
            INSERT INTO goal_versions
              (id, company_id, initiative_id, version, schema_version, structured_goal,
               attachment_ids, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING created_at
          `,
          [
            goalVersionId,
            companyId,
            initiativeId,
            goalVersion,
            dto.schema_version,
            JSON.stringify(structuredGoal),
            JSON.stringify([...dto.attachment_ids]),
            actor.id,
          ],
        )) as Array<{ created_at: Date }>;
        await runner.query(
          `
            UPDATE initiatives
            SET current_goal_version_id = $3, status = 'ACTIVE', row_version = row_version + 1,
                updated_at = now()
            WHERE company_id = $1 AND id = $2
          `,
          [companyId, initiativeId, goalVersionId],
        );
        await runner.query(
          `
            INSERT INTO context_snapshots
              (id, company_id, company_profile_version_id, goal_version_id)
            VALUES ($1, $2, $3, $4)
          `,
          [contextSnapshotId, companyId, profileRows[0].current_profile_version_id, goalVersionId],
        );
        await runner.query(
          `
            INSERT INTO runs
              (id, company_id, initiative_id, context_snapshot_id, state, stage,
               workflow_version, policy_version)
            VALUES ($1, $2, $3, $4, 'DRAFT', 'INTAKE', $5, 'mvp-v1')
          `,
          [runId, companyId, initiativeId, contextSnapshotId, workflowVersion],
        );
        await runner.query(
          `INSERT INTO run_event_counters (company_id, run_id, next_sequence) VALUES ($1, $2, 1)`,
          [companyId, runId],
        );
        await runner.query(
          `
            INSERT INTO tasks
              (id, company_id, run_id, type, owner_employee_definition_id, state, priority, input_manifest)
            VALUES ($1, $2, $3, 'CREATE_PRODUCT_BRIEF', $4, 'QUEUED', 100, $5)
          `,
          [
            taskId,
            companyId,
            runId,
            PM_EMPLOYEE_DEFINITION_ID,
            JSON.stringify({
              context_snapshot_id: contextSnapshotId,
              company_profile_version_id: profileRows[0].current_profile_version_id,
              goal_version_id: goalVersionId,
              workflow_version: workflowVersion,
              policy_version: 'mvp-v1',
            }),
          ],
        );
        await runner.query(
          `
            INSERT INTO budget_ledgers (company_id, run_id, category, hard_limit)
            VALUES ($1, $2, 'MODEL_TOKENS', 20000), ($1, $2, 'MODEL_COST_MINOR', 500)
          `,
          [companyId, runId],
        );
        await this.events.append(runner, {
          companyId,
          runId,
          type: 'run_created',
          actorType: 'FOUNDER',
          actorId: actor.id,
          correlationId,
          payload: {
            initiative_id: initiativeId,
            goal_version_id: goalVersionId,
            context_snapshot_id: contextSnapshotId,
            initial_task_id: taskId,
            state: 'DRAFT',
            stage: 'INTAKE',
          },
        });
        return {
          status: 201,
          body: {
            goal_version: {
              id: goalVersionId,
              version: goalVersion,
              schema_version: 1,
              created_by: 'FOUNDER',
              created_at: inserted[0].created_at,
            },
            run: {
              id: runId,
              state: 'DRAFT',
              stage: 'INTAKE',
              version: 1,
              context_snapshot_id: contextSnapshotId,
              workflow_version: workflowVersion,
              policy_version: 'mvp-v1',
            },
          },
        };
      },
    });
  }

  private initiativeResponse(row: InitiativeRow): Record<string, unknown> {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      status: row.status,
      current_goal_version: row.current_goal_version_id,
      row_version: row.row_version,
      created_at: row.created_at,
    };
  }

  private activeInitiativeExists(): DomainError {
    return new DomainError({
      status: 409,
      code: 'active_initiative_exists',
      title: 'An active Prototype Initiative already exists',
      detail: 'The MVP permits one non-terminal Prototype Initiative per company.',
      remediation: ['get_active_initiative'],
    });
  }

  private companyNotFound(): DomainError {
    return new DomainError({
      status: 404,
      code: 'resource_not_found',
      title: 'Company not found',
      detail: 'Provision a company before creating an initiative.',
      remediation: ['create_company'],
    });
  }

  private resourceNotFound(): DomainError {
    return new DomainError({
      status: 404,
      code: 'resource_not_found',
      title: 'Resource not found',
      detail: 'The requested resource does not exist.',
    });
  }
}
