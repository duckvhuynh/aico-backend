import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/domain/domain-error';
import type { RequestActor } from '../../common/http/request-context';
import { companyScopeFromActor } from '../../common/tenant/company-scope';
import type { EventQueryDto } from './dto/event-query.dto';
import type { TaskQueryDto } from './dto/task-query.dto';

interface RunRow {
  id: string;
  initiative_id: string;
  context_snapshot_id: string;
  state: string;
  stage: string;
  row_version: number;
  workflow_version: string;
  policy_version: string;
  blocking_reason_code: string | null;
  failure_reason_code: string | null;
  company_profile_version_id: string;
  goal_version_id: string;
  answer_version_ids: string[];
  frozen_profile_id: string;
  frozen_profile_version: number;
  frozen_purpose: string;
  frozen_target_customer: string;
  frozen_constraints: string[];
  frozen_normalized_limits: Record<string, unknown>;
  frozen_profile_created_at: Date;
  frozen_goal_id: string;
  frozen_goal_version: number;
  frozen_goal_schema_version: number;
  frozen_structured_goal: Record<string, unknown>;
  frozen_goal_created_at: Date;
  created_at: Date;
  updated_at: Date;
}

interface FrozenAttachmentRow {
  id: string;
  media_type: string;
  size_bytes: number;
  checksum_sha256: string;
  filename: string;
}

interface TaskCountRow {
  state: string;
  count: number;
}

interface EventRow {
  event_id: string;
  schema_version: number;
  type: string;
  run_sequence: string;
  actor_type: string;
  actor_id: string;
  actor_version: string | null;
  occurred_at: Date;
  correlation_id: string;
  causation_id: string | null;
  audience: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class RunsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async get(actor: RequestActor, runId: string): Promise<Record<string, unknown>> {
    const companyId = companyScopeFromActor(actor).companyId;
    const rows = await this.dataSource.query<RunRow[]>(
      `
        SELECT r.id, r.initiative_id, r.context_snapshot_id, r.state, r.stage, r.row_version,
               r.workflow_version, r.policy_version, r.blocking_reason_code, r.failure_reason_code,
               r.created_at, r.updated_at,
               cs.company_profile_version_id, cs.goal_version_id, cs.answer_version_ids,
               p.id AS frozen_profile_id, p.version AS frozen_profile_version, p.purpose AS frozen_purpose,
               p.target_customer AS frozen_target_customer, p.constraints AS frozen_constraints,
               p.normalized_limits AS frozen_normalized_limits, p.created_at AS frozen_profile_created_at,
               gv.id AS frozen_goal_id, gv.version AS frozen_goal_version,
               gv.schema_version AS frozen_goal_schema_version, gv.structured_goal AS frozen_structured_goal,
               gv.created_at AS frozen_goal_created_at
        FROM runs r
        JOIN context_snapshots cs ON cs.id = r.context_snapshot_id AND cs.company_id = r.company_id
        JOIN company_profile_versions p
          ON p.id = cs.company_profile_version_id AND p.company_id = r.company_id
        JOIN goal_versions gv
          ON gv.id = cs.goal_version_id AND gv.company_id = r.company_id
        WHERE r.company_id = $1 AND r.id = $2
      `,
      [companyId, runId],
    );
    const run = rows[0];
    if (!run) {
      throw this.notFound();
    }
    const counts = await this.dataSource.query<TaskCountRow[]>(
      `SELECT state, count(*)::integer AS count FROM tasks WHERE company_id = $1 AND run_id = $2 GROUP BY state`,
      [companyId, runId],
    );
    const attachments = await this.dataSource.query<FrozenAttachmentRow[]>(
      `
        SELECT o.id, o.detected_media_type AS media_type, o.size_bytes, o.checksum_sha256,
               o.original_filename AS filename
        FROM goal_version_attachments gva
        JOIN object_records o
          ON o.company_id = gva.company_id AND o.id = gva.object_id
        WHERE gva.company_id = $1 AND gva.goal_version_id = $2
        ORDER BY gva.ordinal, o.id
      `,
      [companyId, run.goal_version_id],
    );
    return {
      id: run.id,
      initiative_id: run.initiative_id,
      state: run.state,
      stage: run.stage,
      version: run.row_version,
      workflow_version: run.workflow_version,
      policy_version: run.policy_version,
      context: {
        company_profile_version_id: run.company_profile_version_id,
        goal_version_id: run.goal_version_id,
        answer_version_ids: run.answer_version_ids,
        company_profile: {
          id: run.frozen_profile_id,
          version: Number(run.frozen_profile_version),
          purpose: run.frozen_purpose,
          target_customer: run.frozen_target_customer,
          constraints: run.frozen_constraints,
          normalized_limits: run.frozen_normalized_limits,
          created_at: run.frozen_profile_created_at,
        },
        goal: {
          id: run.frozen_goal_id,
          version: Number(run.frozen_goal_version),
          schema_version: Number(run.frozen_goal_schema_version),
          structured_goal: run.frozen_structured_goal,
          created_by: 'FOUNDER',
          created_at: run.frozen_goal_created_at,
        },
        attachments: attachments.map((item) => ({
          id: item.id,
          media_type: item.media_type,
          size_bytes: Number(item.size_bytes),
          checksum_sha256: item.checksum_sha256,
          filename: item.filename,
        })),
      },
      summary: {
        task_counts: Object.fromEntries(counts.map((entry) => [entry.state, entry.count])),
        pending_decisions: run.state.startsWith('AWAITING_') ? 1 : 0,
        blocking_reason: run.blocking_reason_code ?? run.failure_reason_code,
      },
      created_at: run.created_at,
      updated_at: run.updated_at,
    };
  }

  async tasks(
    actor: RequestActor,
    runId: string,
    query: TaskQueryDto,
  ): Promise<Array<Record<string, unknown>>> {
    const companyId = companyScopeFromActor(actor).companyId;
    await this.assertRun(companyId, runId);
    const parameters: unknown[] = [companyId, runId];
    const filters: string[] = [];
    if (query.state) {
      parameters.push(query.state);
      filters.push(`t.state = $${parameters.length}`);
    }
    if (query.type) {
      parameters.push(query.type);
      filters.push(`t.type = $${parameters.length}`);
    }
    parameters.push(query.limit);
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `
        SELECT t.id, t.type, t.state, t.priority, t.attempt_count, t.row_version,
               t.blocker_code, t.created_at, t.updated_at, t.completed_at,
               e.employee_key, e.version AS employee_version
        FROM tasks t
        LEFT JOIN employee_definitions e ON e.id = t.owner_employee_definition_id
        WHERE t.company_id = $1 AND t.run_id = $2
          ${filters.length > 0 ? `AND ${filters.join(' AND ')}` : ''}
        ORDER BY t.created_at, t.id
        LIMIT $${parameters.length}
      `,
      parameters,
    );
    return rows;
  }

  async events(
    actor: RequestActor,
    runId: string,
    query: EventQueryDto,
  ): Promise<{ events: Array<Record<string, unknown>>; hasMore: boolean }> {
    const companyId = companyScopeFromActor(actor).companyId;
    await this.assertRun(companyId, runId);
    const parameters: unknown[] = [companyId, runId, query.after_sequence];
    let typeFilter = '';
    if (query.type) {
      parameters.push(query.type);
      typeFilter = `AND type = $${parameters.length}`;
    }
    parameters.push(query.limit + 1);
    const rows = await this.dataSource.query<EventRow[]>(
      `
        SELECT id AS event_id, schema_version, type, run_sequence, actor_type, actor_id,
               actor_version, occurred_at, correlation_id, causation_id, audience, payload
        FROM events
        WHERE company_id = $1 AND run_id = $2 AND run_sequence > $3 ${typeFilter}
        ORDER BY run_sequence
        LIMIT $${parameters.length}
      `,
      parameters,
    );
    const hasMore = rows.length > query.limit;
    const projected = rows.slice(0, query.limit).map((row) => ({
      event_id: row.event_id,
      schema_version: row.schema_version,
      type: row.type,
      run_sequence: Number(row.run_sequence),
      actor: { type: row.actor_type, id: row.actor_id, version: row.actor_version },
      occurred_at: row.occurred_at,
      correlation_id: row.correlation_id,
      causation_id: row.causation_id,
      audience: row.audience,
      payload: row.payload,
    }));
    return { events: projected, hasMore };
  }

  async denyDelete(actor: RequestActor, runId: string): Promise<void> {
    const companyId = companyScopeFromActor(actor).companyId;
    await this.assertRun(companyId, runId);
    throw new DomainError({
      status: 403,
      code: 'action_denied',
      title: 'The action is not allowed',
      detail: 'Run deletion is not available in this release.',
    });
  }

  private async assertRun(companyId: string, runId: string): Promise<void> {
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM runs WHERE company_id = $1 AND id = $2`,
      [companyId, runId],
    );
    if (!rows[0]) {
      throw this.notFound();
    }
  }

  private notFound(): DomainError {
    return new DomainError({
      status: 404,
      code: 'resource_not_found',
      title: 'Resource not found',
      detail: 'The requested resource does not exist.',
    });
  }
}
