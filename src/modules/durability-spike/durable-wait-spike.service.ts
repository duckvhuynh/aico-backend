import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type QueryRunner } from 'typeorm';
import { DomainError } from '../../common/domain/domain-error';
import { canonicalDigest, newId } from '../../common/domain/identifiers';
import { CommandExecutor, type CommandResult } from '../governance/command-executor.service';
import { DomainEventService } from '../governance/domain-event.service';

interface OpenWaitInput {
  actorId: string;
  companyId: string;
  runId: string;
  taskId: string;
  correlationId: string;
  expectedRunVersion: number;
  injectRollback?: boolean;
}

interface AnswerWaitInput {
  actorId: string;
  companyId: string;
  runId: string;
  waitId: string;
  requestId: string;
  requestVersion: number;
  workflowVersion: string;
  expectedRunVersion: number;
  schemaId: 'durable-wait-response';
  schemaVersion: '1.0';
  content: { decision: 'CONTINUE'; note: string };
  idempotencyKey: string;
  correlationId: string;
}

interface RunLockRow {
  id: string;
  state: string;
  stage: string;
  row_version: number;
  workflow_version: string;
  context_snapshot_id: string;
  cancellation_requested_at: Date | null;
}

interface TaskLockRow {
  id: string;
  state: string;
  row_version: number;
  input_manifest: Record<string, unknown>;
  lease_token: string | null;
  lease_owner: string | null;
  lease_expires_at: Date | null;
}

interface WaitLockRow {
  id: string;
  run_id: string;
  task_id: string;
  workflow_version: string;
  request_id: string;
  request_version: number;
  expected_run_state: string;
  expected_run_row_version: number;
  resume_run_state: string;
  context_snapshot_id: string;
  response_schema_id: string;
  response_schema_version: string;
  status: string;
}

@Injectable()
export class DurableWaitSpikeService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly commands: CommandExecutor,
    private readonly events: DomainEventService,
  ) {}

  async open(input: OpenWaitInput): Promise<Record<string, unknown>> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const runner = this.runner(manager.queryRunner);
      await this.assertFounder(runner, input.companyId, input.actorId);
      const run = await this.lockRun(runner, input.companyId, input.runId);
      const task = await this.lockTask(runner, input.companyId, input.runId, input.taskId);
      if (run.row_version !== input.expectedRunVersion || run.state !== 'DRAFT') {
        throw this.conflict('wait_open_precondition_failed');
      }
      if (!['QUEUED', 'READY'].includes(task.state) || task.lease_token !== null) {
        throw this.conflict('task_not_waitable');
      }

      const waitId = newId();
      const requestId = newId();
      const waitingRunVersion = run.row_version + 1;
      await runner.query(
        `
          UPDATE tasks
          SET state = 'AWAITING_INPUT', lease_owner = NULL, lease_token = NULL,
              lease_expires_at = NULL, row_version = row_version + 1, updated_at = now()
          WHERE company_id = $1 AND run_id = $2 AND id = $3
        `,
        [input.companyId, input.runId, input.taskId],
      );
      await runner.query(
        `
          UPDATE runs
          SET state = 'AWAITING_FOUNDER_INPUT', row_version = row_version + 1, updated_at = now()
          WHERE company_id = $1 AND id = $2
        `,
        [input.companyId, input.runId],
      );
      await runner.query(
        `
          INSERT INTO human_waits
            (id, company_id, run_id, task_id, workflow_version, wait_kind, wait_version,
             request_id, request_version, expected_run_state, expected_run_row_version,
             resume_run_state, context_snapshot_id, response_schema_id, response_schema_version,
             reason_codes, expires_at)
          VALUES ($1, $2, $3, $4, $5, 'CLARIFICATION', 1, $6, 1,
                  'AWAITING_FOUNDER_INPUT', $7, $8, $9, 'durable-wait-response', '1.0',
                  '["AICO_002_DURABILITY_PROBE"]'::jsonb, now() + interval '1 day')
        `,
        [
          waitId,
          input.companyId,
          input.runId,
          input.taskId,
          run.workflow_version,
          requestId,
          waitingRunVersion,
          run.state,
          run.context_snapshot_id,
        ],
      );
      const eventId = await this.events.append(runner, {
        companyId: input.companyId,
        runId: input.runId,
        type: 'founder_input_requested',
        actorType: 'SYSTEM',
        actorId: 'durable-wait-spike/v1',
        correlationId: input.correlationId,
        payload: {
          wait_id: waitId,
          request_id: requestId,
          request_version: 1,
          wait_version: 1,
          workflow_version: run.workflow_version,
          expected_run_state: 'AWAITING_FOUNDER_INPUT',
          expected_run_version: waitingRunVersion,
          context_snapshot_id: run.context_snapshot_id,
        },
      });
      if (input.injectRollback) {
        throw new Error('A2-TX-01 injected rollback before commit');
      }
      return {
        wait_id: waitId,
        request_id: requestId,
        request_version: 1,
        wait_version: 1,
        event_id: eventId,
        run_version: waitingRunVersion,
        workflow_version: run.workflow_version,
        context_snapshot_id: run.context_snapshot_id,
        state: 'AWAITING_FOUNDER_INPUT',
      };
    });
  }

  async answer(input: AnswerWaitInput): Promise<CommandResult<Record<string, unknown>>> {
    this.assertAnswerShape(input);
    return this.commands.run({
      actorId: input.actorId,
      operation: 'durability-spike.wait.answer',
      idempotencyKey: input.idempotencyKey,
      request: {
        companyId: input.companyId,
        runId: input.runId,
        waitId: input.waitId,
        requestId: input.requestId,
        requestVersion: input.requestVersion,
        workflowVersion: input.workflowVersion,
        expectedRunVersion: input.expectedRunVersion,
        schemaId: input.schemaId,
        schemaVersion: input.schemaVersion,
        content: input.content,
      },
      execute: async (runner) => {
        await this.assertFounder(runner, input.companyId, input.actorId);
        const wait = await this.lockWait(runner, input.companyId, input.runId, input.waitId);
        const run = await this.lockRun(runner, input.companyId, input.runId);
        const task = await this.lockTask(runner, input.companyId, input.runId, wait.task_id);
        if (
          wait.status !== 'OPEN' ||
          wait.request_id !== input.requestId ||
          wait.request_version !== input.requestVersion ||
          wait.workflow_version !== input.workflowVersion ||
          wait.response_schema_id !== input.schemaId ||
          wait.response_schema_version !== input.schemaVersion ||
          run.workflow_version !== wait.workflow_version ||
          run.state !== wait.expected_run_state ||
          run.row_version !== input.expectedRunVersion ||
          run.row_version !== wait.expected_run_row_version ||
          run.cancellation_requested_at !== null ||
          task.state !== 'AWAITING_INPUT' ||
          task.lease_token !== null
        ) {
          throw this.conflict('wait_state_conflict');
        }

        const answerVersionId = newId();
        const resumedContextSnapshotId = newId();
        const committedAt = new Date().toISOString();
        const sourceContext = (await runner.query(
          `
            SELECT company_profile_version_id, goal_version_id, answer_version_ids
            FROM context_snapshots
            WHERE company_id = $1 AND id = $2
          `,
          [input.companyId, wait.context_snapshot_id],
        )) as Array<{
          company_profile_version_id: string;
          goal_version_id: string;
          answer_version_ids: string[];
        }>;
        if (!sourceContext[0]) {
          throw this.conflict('wait_context_missing');
        }
        await runner.query(
          `
            INSERT INTO clarification_answer_versions
              (id, company_id, run_id, wait_id, version, request_id, request_version,
               source_context_snapshot_id, response_schema_id, response_schema_version,
               content, content_digest, created_by, created_at)
            VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `,
          [
            answerVersionId,
            input.companyId,
            input.runId,
            input.waitId,
            input.requestId,
            input.requestVersion,
            wait.context_snapshot_id,
            input.schemaId,
            input.schemaVersion,
            JSON.stringify(input.content),
            canonicalDigest(input.content),
            input.actorId,
            committedAt,
          ],
        );
        const answerIds = [...sourceContext[0].answer_version_ids, answerVersionId];
        await runner.query(
          `
            INSERT INTO context_snapshots
              (id, company_id, company_profile_version_id, goal_version_id,
               answer_version_ids, created_at)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [
            resumedContextSnapshotId,
            input.companyId,
            sourceContext[0].company_profile_version_id,
            sourceContext[0].goal_version_id,
            JSON.stringify(answerIds),
            committedAt,
          ],
        );
        await runner.query(
          `
            INSERT INTO context_snapshot_answers
              (company_id, context_snapshot_id, answer_version_id, ordinal)
            VALUES ($1, $2, $3, $4)
          `,
          [input.companyId, resumedContextSnapshotId, answerVersionId, answerIds.length - 1],
        );
        await runner.query(
          `
            UPDATE tasks
            SET state = 'READY', available_at = now(), lease_owner = NULL, lease_token = NULL,
                lease_expires_at = NULL, row_version = row_version + 1, updated_at = now(),
                input_manifest = input_manifest || $4::jsonb
            WHERE company_id = $1 AND run_id = $2 AND id = $3
          `,
          [
            input.companyId,
            input.runId,
            wait.task_id,
            JSON.stringify({
              context_snapshot_id: resumedContextSnapshotId,
              answer_version_ids: answerIds,
              wait_id: wait.id,
              wait_version: 1,
              workflow_version: wait.workflow_version,
            }),
          ],
        );
        await runner.query(
          `
            UPDATE runs
            SET state = $3, context_snapshot_id = $4, row_version = row_version + 1,
                updated_at = now()
            WHERE company_id = $1 AND id = $2
          `,
          [input.companyId, input.runId, wait.resume_run_state, resumedContextSnapshotId],
        );
        const eventId = await this.events.append(runner, {
          companyId: input.companyId,
          runId: input.runId,
          type: 'founder_input_resolved',
          actorType: 'FOUNDER',
          actorId: input.actorId,
          correlationId: input.correlationId,
          causationId: input.waitId,
          payload: {
            wait_id: input.waitId,
            wait_version: 1,
            request_id: input.requestId,
            request_version: input.requestVersion,
            answer_version_id: answerVersionId,
            continuation_task_id: wait.task_id,
            source_context_snapshot_id: wait.context_snapshot_id,
            resumed_context_snapshot_id: resumedContextSnapshotId,
            workflow_version: wait.workflow_version,
            resumed_state: wait.resume_run_state,
          },
        });
        await runner.query(
          `
            UPDATE human_waits
            SET status = 'RESOLVED', resolved_at = $4, resolved_by_command_id = $5,
                resolved_by_event_id = $6, continuation_task_id = $7
            WHERE company_id = $1 AND run_id = $2 AND id = $3 AND status = 'OPEN'
          `,
          [
            input.companyId,
            input.runId,
            input.waitId,
            committedAt,
            input.idempotencyKey,
            eventId,
            wait.task_id,
          ],
        );
        return {
          status: 202,
          body: {
            wait_id: input.waitId,
            wait_version: 1,
            answer_version_id: answerVersionId,
            continuation_task_id: wait.task_id,
            event_id: eventId,
            context_snapshot_id: resumedContextSnapshotId,
            run_version: run.row_version + 1,
            workflow_version: wait.workflow_version,
            committed_at: committedAt,
          },
        };
      },
    });
  }

  async inspect(companyId: string, runId: string): Promise<Record<string, unknown>> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `
        SELECT r.id AS run_id, r.state AS run_state, r.stage, r.row_version,
               r.workflow_version, r.context_snapshot_id,
               w.id AS wait_id, w.request_id, w.request_version, w.wait_version,
               w.wait_kind, w.workflow_version AS wait_workflow_version,
               w.status AS wait_status, w.expected_run_state, w.expected_run_row_version,
               w.resume_run_state, w.context_snapshot_id AS wait_context_snapshot_id,
               w.response_schema_id, w.response_schema_version, w.reason_codes, w.expires_at,
               w.created_at AS wait_created_at, w.resolved_at,
               t.id AS task_id, t.state AS task_state, t.lease_owner, t.lease_token,
               t.lease_expires_at, t.attempt_count
        FROM runs r
        LEFT JOIN human_waits w ON w.company_id = r.company_id AND w.run_id = r.id
        LEFT JOIN tasks t ON t.company_id = r.company_id AND t.run_id = r.id
          AND (w.task_id IS NULL OR t.id = w.task_id)
        WHERE r.company_id = $1 AND r.id = $2
        ORDER BY w.created_at DESC NULLS LAST
        LIMIT 1
      `,
      [companyId, runId],
    );
    if (!rows[0]) {
      throw this.conflict('run_missing');
    }
    const counts = await this.dataSource.query<Array<Record<string, unknown>>>(
      `
        SELECT
          (SELECT count(*)::integer FROM human_waits WHERE company_id = $1 AND run_id = $2) AS waits,
          (SELECT count(*)::integer FROM clarification_answer_versions WHERE company_id = $1 AND run_id = $2) AS answers,
          (SELECT count(*)::integer FROM events WHERE company_id = $1 AND run_id = $2) AS events,
          (SELECT count(*)::integer FROM outbox_messages o JOIN events e ON e.id = o.event_id
             WHERE e.company_id = $1 AND e.run_id = $2) AS outbox,
          (SELECT count(*)::integer FROM task_attempts WHERE company_id = $1 AND run_id = $2) AS attempts,
          (SELECT count(*)::integer FROM artifacts WHERE company_id = $1 AND run_id = $2) AS artifacts,
          (SELECT count(*)::integer FROM model_invocation_effects WHERE company_id = $1 AND run_id = $2) AS model_effects,
          (SELECT COALESCE(sum(invocation_count), 0)::integer FROM model_invocation_effects
             WHERE company_id = $1 AND run_id = $2) AS provider_invocations,
          (SELECT COALESCE(sum(reserved), 0)::integer FROM budget_ledgers
             WHERE company_id = $1 AND run_id = $2) AS budget_reserved,
          (SELECT COALESCE(sum(consumed), 0)::integer FROM budget_ledgers
             WHERE company_id = $1 AND run_id = $2) AS budget_consumed
      `,
      [companyId, runId],
    );
    return { ...rows[0], counts: counts[0] };
  }

  async eventEffect(eventId: string): Promise<Record<string, unknown>> {
    const rows = await this.dataSource.query<Array<Record<string, unknown>>>(
      `
        SELECT o.attempts, o.published_at, o.lease_owner, o.lease_token, o.lease_expires_at,
               (SELECT count(*)::integer FROM inbox_receipts i
                 WHERE i.consumer_name = 'local-event-projection/v1' AND i.event_id = o.event_id) AS receipts,
               (SELECT count(*)::integer FROM local_event_projections p
                 WHERE p.consumer_name = 'local-event-projection/v1' AND p.event_id = o.event_id) AS effects
        FROM outbox_messages o
        WHERE o.event_id = $1
      `,
      [eventId],
    );
    if (!rows[0]) {
      throw this.conflict('event_outbox_missing');
    }
    return rows[0];
  }

  async appendConcurrentEvents(
    companyId: string,
    runId: string,
    actorId: string,
    correlationId: string,
    count: number,
  ): Promise<Record<string, unknown>> {
    const eventIds = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        this.dataSource.transaction(async (manager) =>
          this.events.append(this.runner(manager.queryRunner), {
            companyId,
            runId,
            type: 'durability_sequence_probe',
            actorType: 'SYSTEM',
            actorId,
            correlationId,
            payload: { probe_index: index },
          }),
        ),
      ),
    );
    const sequences = await this.dataSource.query<Array<{ run_sequence: string }>>(
      `SELECT run_sequence FROM events WHERE id = ANY($1::uuid[]) ORDER BY run_sequence`,
      [eventIds],
    );
    return { event_ids: eventIds, sequences: sequences.map((row) => Number(row.run_sequence)) };
  }

  async cancelFixture(
    companyId: string,
    runId: string,
    actorId: string,
    correlationId: string,
  ): Promise<Record<string, unknown>> {
    return this.dataSource.transaction(async (manager) => {
      const runner = this.runner(manager.queryRunner);
      const run = await this.lockRun(runner, companyId, runId);
      if (['FAILED', 'CANCELED', 'COMPLETED'].includes(run.state)) {
        throw this.conflict('run_terminal');
      }
      await runner.query(
        `
          UPDATE human_waits
          SET status = 'CANCELED', resolved_at = now()
          WHERE company_id = $1 AND run_id = $2 AND status = 'OPEN'
        `,
        [companyId, runId],
      );
      await runner.query(
        `
          UPDATE tasks
          SET state = 'CANCELED', lease_owner = NULL, lease_token = NULL,
              lease_expires_at = NULL, completed_at = now(), row_version = row_version + 1,
              updated_at = now()
          WHERE company_id = $1 AND run_id = $2 AND state NOT IN ('SUCCEEDED', 'FAILED', 'CANCELED')
        `,
        [companyId, runId],
      );
      await runner.query(
        `
          UPDATE runs
          SET state = 'CANCELED', stage = 'TERMINAL', cancellation_requested_at = now(),
              row_version = row_version + 1, updated_at = now()
          WHERE company_id = $1 AND id = $2
        `,
        [companyId, runId],
      );
      const eventId = await this.events.append(runner, {
        companyId,
        runId,
        type: 'durability_cancel_probe',
        actorType: 'FOUNDER',
        actorId,
        correlationId,
        payload: { prior_state: run.state, state: 'CANCELED' },
      });
      return { run_id: runId, event_id: eventId, state: 'CANCELED' };
    });
  }

  private assertAnswerShape(input: AnswerWaitInput): void {
    if (
      input.schemaId !== 'durable-wait-response' ||
      input.schemaVersion !== '1.0' ||
      input.content?.decision !== 'CONTINUE' ||
      typeof input.content.note !== 'string' ||
      input.content.note.length < 1 ||
      input.content.note.length > 200
    ) {
      throw new DomainError({
        status: 400,
        code: 'validation_failed',
        detail: 'The durability response does not match durable-wait-response/1.0.',
      });
    }
  }

  private async assertFounder(
    runner: QueryRunner,
    companyId: string,
    actorId: string,
  ): Promise<void> {
    const rows = (await runner.query(`SELECT id FROM companies WHERE id = $1 AND founder_id = $2`, [
      companyId,
      actorId,
    ])) as Array<{ id: string }>;
    if (!rows[0]) {
      throw new DomainError({
        status: 404,
        code: 'resource_not_found',
        detail: 'The requested resource does not exist.',
      });
    }
  }

  private async lockRun(
    runner: QueryRunner,
    companyId: string,
    runId: string,
  ): Promise<RunLockRow> {
    const rows = (await runner.query(
      `SELECT * FROM runs WHERE company_id = $1 AND id = $2 FOR UPDATE`,
      [companyId, runId],
    )) as RunLockRow[];
    if (!rows[0]) {
      throw this.conflict('run_missing');
    }
    return rows[0];
  }

  private async lockTask(
    runner: QueryRunner,
    companyId: string,
    runId: string,
    taskId: string,
  ): Promise<TaskLockRow> {
    const rows = (await runner.query(
      `SELECT * FROM tasks WHERE company_id = $1 AND run_id = $2 AND id = $3 FOR UPDATE`,
      [companyId, runId, taskId],
    )) as TaskLockRow[];
    if (!rows[0]) {
      throw this.conflict('task_missing');
    }
    return rows[0];
  }

  private async lockWait(
    runner: QueryRunner,
    companyId: string,
    runId: string,
    waitId: string,
  ): Promise<WaitLockRow> {
    const rows = (await runner.query(
      `
        SELECT * FROM human_waits
        WHERE company_id = $1 AND run_id = $2 AND id = $3
        FOR UPDATE
      `,
      [companyId, runId, waitId],
    )) as WaitLockRow[];
    if (!rows[0]) {
      throw this.conflict('wait_missing');
    }
    return rows[0];
  }

  private runner(runner: QueryRunner | undefined): QueryRunner {
    if (!runner) {
      throw new Error('Transactional query runner is unavailable');
    }
    return runner;
  }

  private conflict(code: string): DomainError {
    return new DomainError({
      status: 409,
      code,
      detail: 'The persisted durability-spike state does not permit this transition.',
      remediation: ['refresh_resource'],
    });
  }
}
