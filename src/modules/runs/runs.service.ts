import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/domain/domain-error';
import type { RequestActor } from '../../common/http/request-context';
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
  created_at: Date;
  updated_at: Date;
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
    const companyId = this.requireCompany(actor);
    const rows = await this.dataSource.query<RunRow[]>(
      `
        SELECT r.*, cs.company_profile_version_id, cs.goal_version_id, cs.answer_version_ids
        FROM runs r
        JOIN context_snapshots cs ON cs.id = r.context_snapshot_id AND cs.company_id = r.company_id
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
    const companyId = this.requireCompany(actor);
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
    const companyId = this.requireCompany(actor);
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

  private async assertRun(companyId: string, runId: string): Promise<void> {
    const rows = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM runs WHERE company_id = $1 AND id = $2`,
      [companyId, runId],
    );
    if (!rows[0]) {
      throw this.notFound();
    }
  }

  private requireCompany(actor: RequestActor): string {
    if (!actor.companyId) {
      throw this.notFound();
    }
    return actor.companyId;
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
