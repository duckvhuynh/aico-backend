import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { PinoLogger } from 'nestjs-pino';
import { DataSource, type QueryRunner } from 'typeorm';
import { canonicalDigest, newId } from '../../common/domain/identifiers';
import { DomainEventService } from '../governance/domain-event.service';
import { MODEL_PROVIDER, type ModelProviderPort } from './model-provider.port';

interface ClaimedTask {
  id: string;
  company_id: string;
  run_id: string;
  type: string;
  attempt_count: number;
  input_manifest: Record<string, unknown>;
  lease_token: string;
}

interface ContextRow {
  goal: Record<string, unknown>;
  purpose: string;
  target_customer: string;
}

@Injectable()
export class OrchestrationWorkerService {
  private readonly workerId: string;
  private readonly leaseSeconds: number;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(MODEL_PROVIDER) private readonly modelProvider: ModelProviderPort,
    private readonly events: DomainEventService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.workerId = this.config.getOrThrow<string>('worker.id');
    this.leaseSeconds = this.config.getOrThrow<number>('worker.leaseSeconds');
    this.logger.setContext(OrchestrationWorkerService.name);
  }

  async processOnce(): Promise<boolean> {
    const claim = await this.claimTask();
    if (!claim) {
      return false;
    }
    const attemptId = newId();
    const attemptNumber = claim.attempt_count + 1;
    try {
      const context = await this.loadContext(claim.company_id, claim.run_id);
      await this.authorizeAndStartAttempt(claim, attemptId, attemptNumber);
      const result = await this.modelProvider.invoke({
        task_type: claim.type,
        attempt_id: attemptId,
        context: {
          goal: context.goal,
          company: { purpose: context.purpose, target_customer: context.target_customer },
        },
      });
      await this.completeTask(claim, attemptId, attemptNumber, result);
      return true;
    } catch (error: unknown) {
      await this.failTask(claim, attemptId, error);
      return true;
    }
  }

  private async authorizeAndStartAttempt(
    claim: ClaimedTask,
    attemptId: string,
    attemptNumber: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const policyDecisionId = newId();
      await manager.query(
        `
          INSERT INTO policy_decisions
            (id, company_id, run_id, task_id, attempt_id, actor_type, actor_id, action,
             resource_digest, context_digest, policy_version, result, reason_code, expires_at)
          VALUES ($1, $2, $3, $4, $5, 'EMPLOYEE', 'EMP-PM/v1', 'model.invoke',
                  $6, $7, 'mvp-v1', 'ALLOW', 'deterministic_provider_allowed',
                  now() + interval '30 seconds')
        `,
        [
          policyDecisionId,
          claim.company_id,
          claim.run_id,
          claim.id,
          attemptId,
          canonicalDigest({ provider: 'deterministic', task_type: claim.type }),
          canonicalDigest(claim.input_manifest),
        ],
      );
      await manager.query(
        `
          INSERT INTO task_attempts
            (id, company_id, run_id, task_id, attempt_number, idempotency_key, input_manifest,
             runtime_manifest, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'RUNNING')
        `,
        [
          attemptId,
          claim.company_id,
          claim.run_id,
          claim.id,
          attemptNumber,
          newId(),
          JSON.stringify(claim.input_manifest),
          JSON.stringify({
            workflow_version: 'prototype-run/v1',
            policy_version: 'mvp-v1',
            policy_decision_id: policyDecisionId,
            employee_key: 'EMP-PM',
            employee_version: 1,
            instruction_version: 'pm-v1',
            output_schema_version: 'product-brief-v1',
            rubric_version: 'pm-v1',
            provider: 'deterministic',
          }),
        ],
      );
    });
  }

  private async claimTask(): Promise<ClaimedTask | null> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<Array<Omit<ClaimedTask, 'lease_token'>>>(
        `
          SELECT t.id, t.company_id, t.run_id, t.type, t.attempt_count, t.input_manifest
          FROM tasks t
          JOIN runs r ON r.id = t.run_id AND r.company_id = t.company_id
          WHERE (
              (t.state IN ('QUEUED', 'READY', 'RETRY_WAIT') AND t.available_at <= now())
              OR (t.state = 'RUNNING' AND t.lease_expires_at < now())
            )
            AND r.state NOT IN ('CANCELED', 'FAILED', 'COMPLETED')
            AND r.cancellation_requested_at IS NULL
          ORDER BY t.priority DESC, t.created_at, t.id
          FOR UPDATE OF t SKIP LOCKED
          LIMIT 1
        `,
      );
      const candidate = rows[0];
      if (candidate) {
        const leaseToken = newId();
        await manager.query(
          `
            UPDATE tasks
            SET state = 'RUNNING', lease_owner = $2, lease_token = $3,
                lease_expires_at = now() + ($4 * interval '1 second'),
                attempt_count = attempt_count + 1, row_version = row_version + 1, updated_at = now()
            WHERE id = $1
          `,
          [candidate.id, this.workerId, leaseToken, this.leaseSeconds],
        );
        await manager.query(
          `
            UPDATE task_attempts
            SET status = 'ABANDONED', result_class = 'LEASE_EXPIRED', completed_at = now()
            WHERE task_id = $1 AND status = 'RUNNING'
          `,
          [candidate.id],
        );
        await manager.query(
          `
            UPDATE runs SET state = 'QUALIFYING', stage = 'PRODUCT', row_version = row_version + 1,
                            updated_at = now()
            WHERE id = $1 AND state = 'DRAFT'
          `,
          [candidate.run_id],
        );
        return { ...candidate, lease_token: leaseToken };
      }
      return null;
    });
  }

  private async loadContext(companyId: string, runId: string): Promise<ContextRow> {
    const rows = await this.dataSource.query<ContextRow[]>(
      `
        SELECT gv.structured_goal AS goal, cp.purpose, cp.target_customer
        FROM runs r
        JOIN context_snapshots cs ON cs.id = r.context_snapshot_id AND cs.company_id = r.company_id
        JOIN goal_versions gv ON gv.id = cs.goal_version_id AND gv.company_id = cs.company_id
        JOIN company_profile_versions cp
          ON cp.id = cs.company_profile_version_id AND cp.company_id = cs.company_id
        WHERE r.company_id = $1 AND r.id = $2
      `,
      [companyId, runId],
    );
    if (!rows[0]) {
      throw new Error('Frozen run context is missing');
    }
    return rows[0];
  }

  private async completeTask(
    claim: ClaimedTask,
    attemptId: string,
    attemptNumber: number,
    result: Awaited<ReturnType<ModelProviderPort['invoke']>>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const runner = manager.queryRunner as QueryRunner;
      const lock = (await runner.query(
        `
          SELECT t.id, t.state, t.lease_token, r.state AS run_state
          FROM tasks t JOIN runs r ON r.id = t.run_id
          WHERE t.company_id = $1 AND t.id = $2
          FOR UPDATE OF t, r
        `,
        [claim.company_id, claim.id],
      )) as Array<{ id: string; state: string; lease_token: string; run_state: string }>;
      const current = lock[0];
      if (
        !current ||
        current.state !== 'RUNNING' ||
        current.lease_token !== claim.lease_token ||
        ['CANCELED', 'FAILED', 'COMPLETED'].includes(current.run_state)
      ) {
        await runner.query(
          `UPDATE task_attempts SET status = 'ABANDONED', result_class = 'STALE_COMPLETION', completed_at = now() WHERE id = $1`,
          [attemptId],
        );
        return;
      }
      const artifactId = newId();
      const artifactVersionId = newId();
      const serialized = JSON.stringify(result.content);
      await runner.query(
        `
          INSERT INTO artifacts (id, company_id, run_id, type, logical_key)
          VALUES ($1, $2, $3, 'product_brief', 'product-brief')
        `,
        [artifactId, claim.company_id, claim.run_id],
      );
      await runner.query(
        `
          INSERT INTO artifact_versions
            (id, company_id, run_id, artifact_id, version, schema_version, content, checksum,
             size_bytes, creator_type, creator_version, lineage, lifecycle_state)
          VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, 'EMPLOYEE', $9, $10, 'PENDING_APPROVAL')
        `,
        [
          artifactVersionId,
          claim.company_id,
          claim.run_id,
          artifactId,
          result.output_schema_version,
          JSON.stringify(result.content),
          canonicalDigest(result.content),
          Buffer.byteLength(serialized),
          'EMP-PM/v1',
          JSON.stringify({ context: claim.input_manifest, attempt_id: attemptId }),
        ],
      );
      await runner.query(
        `UPDATE artifacts SET current_version_id = $2, updated_at = now() WHERE id = $1`,
        [artifactId, artifactVersionId],
      );
      await runner.query(
        `
          UPDATE task_attempts
          SET status = 'SUCCEEDED', result_class = 'SUCCESS', output_refs = $2, usage = $3,
              completed_at = now()
          WHERE id = $1
        `,
        [attemptId, JSON.stringify([artifactVersionId]), JSON.stringify(result.usage)],
      );
      await runner.query(
        `
          UPDATE tasks
          SET state = 'SUCCEEDED', lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
              completed_at = now(), updated_at = now(), row_version = row_version + 1
          WHERE id = $1
        `,
        [claim.id],
      );
      await runner.query(
        `
          UPDATE runs
          SET state = 'AWAITING_BRIEF_APPROVAL', stage = 'PRODUCT', row_version = row_version + 1,
              updated_at = now()
          WHERE id = $1 AND company_id = $2
        `,
        [claim.run_id, claim.company_id],
      );
      await this.events.append(runner, {
        companyId: claim.company_id,
        runId: claim.run_id,
        type: 'product_brief_published',
        actorType: 'EMPLOYEE',
        actorId: 'EMP-PM',
        actorVersion: '1',
        correlationId: claim.run_id,
        causationId: attemptId,
        payload: {
          task_id: claim.id,
          attempt_id: attemptId,
          attempt_number: attemptNumber,
          artifact_id: artifactId,
          artifact_version_id: artifactVersionId,
          artifact_version: 1,
          run_state: 'AWAITING_BRIEF_APPROVAL',
        },
      });
    });
  }

  private async failTask(claim: ClaimedTask, attemptId: string, error: unknown): Promise<void> {
    this.logger.error(
      { err: error, runId: claim.run_id, taskId: claim.id, attemptId },
      'Task execution failed',
    );
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
          UPDATE task_attempts
          SET status = 'FAILED', result_class = 'TERMINAL_SYSTEM', completed_at = now()
          WHERE id = $1
        `,
        [attemptId],
      );
      await manager.query(
        `
          UPDATE tasks
          SET state = 'FAILED', blocker_code = 'worker_execution_failed', lease_owner = NULL,
              lease_token = NULL, lease_expires_at = NULL, updated_at = now()
          WHERE id = $1 AND lease_token = $2
        `,
        [claim.id, claim.lease_token],
      );
      await manager.query(
        `
          UPDATE runs SET state = 'FAILED', stage = 'TERMINAL', failure_reason_code = 'worker_execution_failed',
                          updated_at = now(), row_version = row_version + 1
          WHERE id = $1 AND company_id = $2
        `,
        [claim.run_id, claim.company_id],
      );
    });
  }
}
