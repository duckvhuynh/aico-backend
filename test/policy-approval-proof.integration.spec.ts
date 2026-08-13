import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { DataSource } from 'typeorm';

import {
  DENY_REASON_CODES,
  RUN_STAGES,
  contractDigest,
  type AllowPolicyDecisionV1,
  type PolicyInputV1,
  type Rfc3339Utc,
} from './aico-006-spike/contracts';
import { DeterministicPolicyDecisionService } from './aico-006-spike/deterministic-policy-decision.service';
import { consumeOutboxMessage } from './aico-006-spike/consumer-probe';
import {
  AICO006_FIXTURE_DIGESTS,
  AICO006_FIXTURE_TIME,
  AICO006_POLICY_VERSION,
  FrozenPolicyClock,
  countProofRows,
  fixtureDigest,
  fixtureUuid,
  seedCompanyGate,
  snapshotCompanyGate,
  type CompanyGateFixture,
  type ProofCounts,
} from './aico-006-spike/fixture';
import { Gate01CommandService, Gate01DeniedError } from './aico-006-spike/gate01-command.service';
import type {
  PolicyDecisionPort,
  PolicyEvaluationClock,
} from './aico-006-spike/policy-decision.port';
import {
  Gate01ProofError,
  PostgresDecisionUnitOfWork,
  type Gate01Failpoint,
} from './aico-006-spike/postgres-decision-unit-of-work';
import {
  createProofSchema,
  dropProofSchema,
  proofRuntimeRole,
  queryProofSchema,
  setProofSearchPath,
} from './aico-006-spike/proof-schema';

jest.setTimeout(180_000);

const enabled = process.env.AICO_REQUIRE_POLICY_PROOF === 'true';
const describeProof = enabled ? describe : describe.skip;
const databaseUrl = process.env.AICO_PROOF_DATABASE_URL ?? '';
const schemaName = process.env.AICO_PROOF_SCHEMA ?? 'aico006_disabled_00000000';
const ALL_CASES = [
  'A6-T-APPROVE-01',
  'A6-T-REVISION-01',
  'A6-T-REPLAY-01',
  'A6-T-REPLAY-REVOKED-01',
  'A6-T-KEY-COLLISION-01',
  'A6-T-CONCURRENT-01',
  'A6-T-EMPLOYEE-01',
  'A6-T-MODEL-01',
  'A6-T-OPERATOR-01',
  'A6-T-DIRECT-DB-01',
  'A6-T-SERVICE-BYPASS-01',
  'A6-T-CROSS-TENANT-01',
  'A6-T-UNKNOWN-01',
  'A6-T-STALE-RUN-01',
  'A6-T-STALE-ARTIFACT-01',
  'A6-T-STALE-ATTEMPT-01',
  'A6-T-STALE-EMPLOYEE-01',
  'A6-T-STALE-POLICY-01',
  'A6-T-STALE-WORKFLOW-01',
  'A6-T-WRONG-GATE-01',
  'A6-T-WRONG-STATE-01',
  'A6-T-WRONG-ACTION-01',
  'A6-T-WRONG-RESOURCE-01',
  'A6-T-EXPIRED-01',
  'A6-T-TERMINAL-01',
  'A6-T-RESTART-01',
  'A6-T-OUTBOX-REDELIVERY-01',
  'A6-T-FORGED-CONTINUATION-01',
  'A6-T-MISSING-BUDGET-01',
  'A6-T-MISSING-ENVIRONMENT-01',
  'A6-T-MISSING-PARAMETER-01',
  'A6-T-AUDIT-REDACTION-01',
  'A6-T-DENIAL-EVENT-01',
] as const;
type CaseId = (typeof ALL_CASES)[number];

describeProof('AICO-006 exact-version GATE-01 PostgreSQL proof', () => {
  let dataSource: DataSource;
  const passed = new Set<CaseId>();

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('AICO_PROOF_DATABASE_URL is required.');
    dataSource = new DataSource({ type: 'postgres', url: databaseUrl });
    await dataSource.initialize();
    await dropProofSchema(dataSource, schemaName);
    await createProofSchema(dataSource, schemaName);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dropProofSchema(dataSource, schemaName);
      await dataSource.destroy();
    }
  });

  const prove = async (id: CaseId, proof: () => Promise<void>): Promise<void> => {
    try {
      await proof();
      passed.add(id);
    } catch (error) {
      throw new Error(`${id} failed`, { cause: error });
    }
  };

  const serviceFor = (
    fixture: CompanyGateFixture,
    failpoint?: (stage: Gate01Failpoint) => void | Promise<void>,
    clock: PolicyEvaluationClock = fixture.clock,
    allowTtlMs = 30_000,
  ): Gate01CommandService =>
    new Gate01CommandService(
      new PostgresDecisionUnitOfWork(dataSource, schemaName, failpoint),
      new DeterministicPolicyDecisionService(clock, {
        supportedPolicyVersions: [AICO006_POLICY_VERSION],
        allowTtlMs,
      }),
      clock,
    );

  const serviceWithMutatedAllow = (
    fixture: CompanyGateFixture,
    mutate: (decision: AllowPolicyDecisionV1) => AllowPolicyDecisionV1,
  ): Gate01CommandService => {
    const evaluator = new DeterministicPolicyDecisionService(fixture.clock, {
      supportedPolicyVersions: [AICO006_POLICY_VERSION],
    });
    const port: PolicyDecisionPort = {
      evaluate(input: unknown) {
        const decision = evaluator.evaluate(input);
        return decision.effect === 'ALLOW' ? mutate(decision) : decision;
      },
    };
    return new Gate01CommandService(
      new PostgresDecisionUnitOfWork(dataSource, schemaName),
      port,
      fixture.clock,
    );
  };

  const expectDenied = async (promise: Promise<unknown>, expected?: string): Promise<Error> => {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const typed = error as Gate01DeniedError | Gate01ProofError;
      const code = typed instanceof Gate01DeniedError ? typed.reasonCode : typed.code;
      if (expected) expect(code).toBe(expected);
      return typed;
    }
    throw new Error('Expected the operation to fail closed.');
  };

  const delta = (after: ProofCounts, before: ProofCounts, key: keyof ProofCounts): number =>
    after[key] - before[key];

  const killHeldPrecommitProcess = async (
    fixture: CompanyGateFixture,
  ): Promise<{ process_id: number; state: string; terminatedInMs: number }> =>
    new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const child = spawn(process.execPath, ['scripts/policy-approval-restart-probe.mjs'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AICO_PROOF_DATABASE_URL: databaseUrl,
          AICO_PROOF_SCHEMA: schemaName,
          AICO_PROOF_COMPANY_ID: fixture.companyId,
          AICO_PROOF_RUN_ID: fixture.runId,
          AICO_PROOF_MODE: 'hold-precommit',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let observation: { process_id: number; state: string } | undefined;
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Precommit process did not reach its durable hold point.'));
      }, 10_000);
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        const line = stdout.split(/\r?\n/).find((candidate) => candidate.trim().startsWith('{'));
        if (line && observation === undefined) {
          observation = JSON.parse(line) as { process_id: number; state: string };
          if (process.platform === 'win32') {
            const killed = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
              encoding: 'utf8',
            });
            if (killed.status !== 0) {
              reject(new Error(`Unable to terminate held proof process: ${killed.stderr}`));
            }
          } else {
            child.kill('SIGKILL');
          }
        }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', () => {
        clearTimeout(timer);
        if (!observation) {
          reject(new Error(`Precommit process exited without hold evidence: ${stderr}`));
          return;
        }
        resolve({ ...observation, terminatedInMs: Date.now() - startedAt });
      });
    });

  const freshInput = async (label: string): Promise<PolicyInputV1> => {
    const fixture = await seedCompanyGate(dataSource, schemaName, label);
    let captured: PolicyInputV1 | undefined;
    const evaluator = new DeterministicPolicyDecisionService(fixture.clock, {
      supportedPolicyVersions: [AICO006_POLICY_VERSION],
    });
    const port: PolicyDecisionPort = {
      evaluate(input: unknown) {
        captured = input as PolicyInputV1;
        return evaluator.evaluate(input);
      },
    };
    const unit = new PostgresDecisionUnitOfWork(dataSource, schemaName, (stage) => {
      if (stage === 'AFTER_POLICY_DECISION') throw new Error('capture-and-rollback');
    });
    await expectDenied(
      new Gate01CommandService(unit, port, fixture.clock).execute(fixture.request()),
    );
    if (!captured) throw new Error('Policy input was not captured.');
    return captured;
  };

  test('executes the complete accepted A6 threat matrix without external effects', async () => {
    await prove('A6-T-APPROVE-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'approve');
      const before = await countProofRows(dataSource, schemaName);
      const receipt = await serviceFor(fixture).execute(fixture.request());
      const after = await countProofRows(dataSource, schemaName);
      const snapshot = await snapshotCompanyGate(dataSource, schemaName, fixture);
      expect(receipt.decision).toBe('APPROVE');
      expect(receipt.replayed).toBe(false);
      expect(snapshot.run).toMatchObject({ state: 'DESIGNING', stage: 'DESIGN' });
      expect(snapshot.gate?.status).toBe('APPROVED');
      expect(snapshot.events.map((event) => [event.sequence, event.type])).toEqual([
        [1, 'policy.decided'],
        [2, 'approval.decided'],
      ]);
      expect(delta(after, before, 'policy_decisions')).toBe(1);
      expect(delta(after, before, 'founder_gate_decisions')).toBe(1);
      expect(delta(after, before, 'approved_artifact_bindings')).toBe(1);
      expect(delta(after, before, 'continuation_intents')).toBe(1);
      expect(delta(after, before, 'domain_events')).toBe(2);
      expect(delta(after, before, 'outbox_messages')).toBe(2);
      expect(delta(after, before, 'adapter_effect_ledger')).toBe(0);
      expect(delta(after, before, 'budget_effect_ledger')).toBe(0);
      expect(delta(after, before, 'designer_execution_ledger')).toBe(0);
    });

    await prove('A6-T-REVISION-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'revision');
      const before = await countProofRows(dataSource, schemaName);
      const receipt = await serviceFor(fixture).execute(
        fixture.request({ decision: 'REQUEST_REVISION', feedback: 'Add evidence.' }),
      );
      const after = await countProofRows(dataSource, schemaName);
      const snapshot = await snapshotCompanyGate(dataSource, schemaName, fixture);
      expect(receipt.decision).toBe('REQUEST_REVISION');
      expect(receipt.approved_artifact_binding_id).toBeNull();
      expect(snapshot.run).toMatchObject({ state: 'QUALIFYING', stage: 'PRODUCT' });
      expect(snapshot.gate?.status).toBe('REVISION_REQUESTED');
      expect(delta(after, before, 'approved_artifact_bindings')).toBe(0);
      expect(delta(after, before, 'artifact_versions')).toBe(0);
      expect(delta(after, before, 'continuation_intents')).toBe(1);
    });

    await prove('A6-T-REPLAY-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'replay');
      const request = fixture.request();
      const first = await serviceFor(fixture).execute(request);
      const storedReceiptBefore = await queryProofSchema<{ response_bytes: string }>(
        dataSource,
        schemaName,
        `SELECT response_body::text AS response_bytes FROM command_receipts
         WHERE company_id=$1 AND idempotency_key=$2`,
        [fixture.companyId, request.idempotencyKey],
      );
      const before = await countProofRows(dataSource, schemaName);
      const [sequential, concurrentA, concurrentB] = await Promise.all([
        serviceFor(fixture).execute(request),
        serviceFor(fixture).execute(request),
        serviceFor(fixture).execute(request),
      ]);
      const after = await countProofRows(dataSource, schemaName);
      for (const replay of [sequential, concurrentA, concurrentB]) {
        expect(replay.replayed).toBe(true);
        expect(replay.decision_record_id).toBe(first.decision_record_id);
        expect(replay.continuation.continuation_intent_id).toBe(
          first.continuation.continuation_intent_id,
        );
        expect(replay.decided_at).toBe(first.decided_at);
      }
      expect(after).toEqual(before);
      const storedReceiptAfter = await queryProofSchema<{ response_bytes: string }>(
        dataSource,
        schemaName,
        `SELECT response_body::text AS response_bytes FROM command_receipts
         WHERE company_id=$1 AND idempotency_key=$2`,
        [fixture.companyId, request.idempotencyKey],
      );
      expect(storedReceiptAfter).toEqual(storedReceiptBefore);
    });

    await prove('A6-T-REPLAY-REVOKED-01', async () => {
      const revocations = [
        {
          label: 'session-expired-by-database-time',
          sql: `UPDATE founder_sessions SET expires_at=clock_timestamp() - interval '1 second', session_version=session_version+1 WHERE id=$1`,
          parameters: (fixture: CompanyGateFixture): string[] => [fixture.sessionId],
          code: 'AUTHENTICATION_REQUIRED',
        },
        {
          label: 'session-revoked',
          sql: `UPDATE founder_sessions SET status='REVOKED', session_version=session_version+1 WHERE id=$1`,
          parameters: (fixture: CompanyGateFixture): string[] => [fixture.sessionId],
          code: 'AUTHENTICATION_REQUIRED',
        },
        {
          label: 'founder-disabled',
          sql: `UPDATE founders SET status='DISABLED', authority_version=authority_version+1 WHERE id=$1`,
          parameters: (fixture: CompanyGateFixture): string[] => [fixture.founderId],
          code: 'AUTHORITY_FORBIDDEN',
        },
        {
          label: 'founder-displaced',
          sql: `UPDATE founders SET auth_subject=auth_subject || ':displaced', authority_version=authority_version+1 WHERE id=$1`,
          parameters: (fixture: CompanyGateFixture): string[] => [fixture.founderId],
          code: 'AUTHORITY_FORBIDDEN',
        },
        {
          label: 'company-inactive',
          sql: `UPDATE companies SET status='INACTIVE', row_version=row_version+1 WHERE id=$1`,
          parameters: (fixture: CompanyGateFixture): string[] => [fixture.companyId],
          code: 'AUTHORITY_FORBIDDEN',
        },
        {
          label: 'company-ownership-transferred',
          sql: `WITH new_owner AS (
                  INSERT INTO founders (id,auth_subject,status,authority_version,created_at)
                  VALUES ($2,$3,'ACTIVE',1,clock_timestamp()) RETURNING id
                )
                UPDATE companies SET current_founder_id=new_owner.id,row_version=row_version+1
                FROM new_owner WHERE companies.id=$1`,
          parameters: (fixture: CompanyGateFixture): string[] => [
            fixture.companyId,
            fixtureUuid(`${fixture.label}:replacement-owner`),
            `fixture:${fixture.label}:replacement-owner`,
          ],
          code: 'AUTHORITY_FORBIDDEN',
        },
      ] as const;
      for (const revocation of revocations) {
        const fixture = await seedCompanyGate(
          dataSource,
          schemaName,
          `revoked-replay-${revocation.label}`,
        );
        const request = fixture.request();
        const original = await serviceFor(fixture).execute(request);
        const evidenceBefore = await queryProofSchema<{
          receipt_bytes: string;
          receipts: number;
          policies: number;
          founder_decisions: number;
          continuations: number;
          events: number;
          outboxes: number;
        }>(
          dataSource,
          schemaName,
          `SELECT
            (SELECT response_body::text FROM command_receipts WHERE company_id=$1 AND idempotency_key=$2) AS receipt_bytes,
            (SELECT count(*)::integer FROM command_receipts WHERE company_id=$1) AS receipts,
            (SELECT count(*)::integer FROM policy_decisions WHERE company_id=$1) AS policies,
            (SELECT count(*)::integer FROM founder_gate_decisions WHERE company_id=$1) AS founder_decisions,
            (SELECT count(*)::integer FROM continuation_intents WHERE company_id=$1) AS continuations,
            (SELECT count(*)::integer FROM domain_events WHERE company_id=$1) AS events,
            (SELECT count(*)::integer FROM outbox_messages WHERE company_id=$1) AS outboxes`,
          [fixture.companyId, request.idempotencyKey],
        );
        await queryProofSchema(
          dataSource,
          schemaName,
          revocation.sql,
          revocation.parameters(fixture),
        );
        const error = await expectDenied(serviceFor(fixture).execute(request), revocation.code);
        expect(JSON.stringify(error)).not.toContain(original.decision_record_id);
        const evidenceAfter = await queryProofSchema<(typeof evidenceBefore)[number]>(
          dataSource,
          schemaName,
          `SELECT
            (SELECT response_body::text FROM command_receipts WHERE company_id=$1 AND idempotency_key=$2) AS receipt_bytes,
            (SELECT count(*)::integer FROM command_receipts WHERE company_id=$1) AS receipts,
            (SELECT count(*)::integer FROM policy_decisions WHERE company_id=$1) AS policies,
            (SELECT count(*)::integer FROM founder_gate_decisions WHERE company_id=$1) AS founder_decisions,
            (SELECT count(*)::integer FROM continuation_intents WHERE company_id=$1) AS continuations,
            (SELECT count(*)::integer FROM domain_events WHERE company_id=$1) AS events,
            (SELECT count(*)::integer FROM outbox_messages WHERE company_id=$1) AS outboxes`,
          [fixture.companyId, request.idempotencyKey],
        );
        expect(evidenceAfter).toEqual(evidenceBefore);
        expect(evidenceAfter[0]).toMatchObject({
          receipts: 1,
          policies: 1,
          founder_decisions: 1,
          continuations: 1,
          events: 2,
          outboxes: 2,
        });
      }
    });

    await prove('A6-T-KEY-COLLISION-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'key-collision');
      const original = fixture.request();
      await serviceFor(fixture).execute(original);
      const before = await countProofRows(dataSource, schemaName);
      const changed = fixture.request({
        decision: 'REQUEST_REVISION',
        idempotencyLabel: 'APPROVE:primary',
        feedback: 'Changed payload',
      });
      await expectDenied(serviceFor(fixture).execute(changed), 'IDEMPOTENCY_CONFLICT');
      expect(await countProofRows(dataSource, schemaName)).toEqual(before);
    });

    await prove('A6-T-CONCURRENT-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'race');
      const settled = await Promise.allSettled([
        serviceFor(fixture).execute(fixture.request({ commandLabel: 'race-approve' })),
        serviceFor(fixture).execute(
          fixture.request({
            decision: 'REQUEST_REVISION',
            commandLabel: 'race-revision',
            feedback: 'Race revision',
          }),
        ),
      ]);
      expect(settled.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
      const rows = await queryProofSchema<{ decisions: number; intents: number }>(
        dataSource,
        schemaName,
        `SELECT (SELECT count(*)::integer FROM founder_gate_decisions WHERE run_id=$1) AS decisions, (SELECT count(*)::integer FROM continuation_intents WHERE run_id=$1) AS intents`,
        [fixture.runId],
      );
      expect(rows[0]).toEqual({ decisions: 1, intents: 1 });
    });

    const baseInput = await freshInput('policy-input-matrix');
    const evaluator = new DeterministicPolicyDecisionService(
      new FrozenPolicyClock(baseInput.evaluation_time),
      { supportedPolicyVersions: [AICO006_POLICY_VERSION] },
    );

    await prove('A6-T-EMPLOYEE-01', async () => {
      for (const role of ['EMP-PM', 'EMP-DES', 'EMP-ENG', 'EMP-QA']) {
        const decision = evaluator.evaluate({
          ...baseInput,
          actor: { ...baseInput.actor, type: 'EMPLOYEE', version: role },
        });
        expect(decision).toMatchObject({ effect: 'DENY', reason_code: 'ROLE_FORBIDDEN' });
      }
    });

    await prove('A6-T-MODEL-01', async () => {
      const decision = evaluator.evaluate({ ...baseInput, model_transcript: 'APPROVE' });
      expect(decision).toMatchObject({ effect: 'DENY', reason_code: 'INVALID_CONTEXT' });
    });

    await prove('A6-T-OPERATOR-01', async () => {
      const decision = evaluator.evaluate({
        ...baseInput,
        actor: { ...baseInput.actor, type: 'OPERATOR' },
      });
      expect(decision).toMatchObject({ effect: 'DENY', reason_code: 'ROLE_FORBIDDEN' });
    });

    await prove('A6-T-DIRECT-DB-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'direct-db');
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await setProofSearchPath(runner, schemaName);
        await runner.query(`SET LOCAL ROLE "${proofRuntimeRole(schemaName)}"`);
        await expect(
          runner.query(`UPDATE runs SET state='DESIGNING' WHERE id=$1`, [fixture.runId]),
        ).rejects.toThrow();
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
      expect((await snapshotCompanyGate(dataSource, schemaName, fixture)).run?.state).toBe(
        'AWAITING_BRIEF_APPROVAL',
      );
    });

    await prove('A6-T-SERVICE-BYPASS-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'service-bypass');
      await expect(
        queryProofSchema(
          dataSource,
          schemaName,
          `INSERT INTO continuation_intents (id,company_id,run_id,decision_record_id,policy_decision_id,kind,logical_key,source_artifact_version_id,status,created_at) VALUES ($1,$2,$3,$4,$5,'START_DESIGN_FROM_BRIEF','forged',$6,'PENDING',$7)`,
          [
            fixtureUuid('forged:intent'),
            fixture.companyId,
            fixture.runId,
            fixtureUuid('missing:decision'),
            fixtureUuid('missing:policy'),
            fixture.currentArtifactVersion.id,
            AICO006_FIXTURE_TIME,
          ],
        ),
      ).rejects.toThrow();
      expect((await countProofRows(dataSource, schemaName)).designer_execution_ledger).toBe(0);
    });

    await prove('A6-T-CROSS-TENANT-01', async () => {
      const victim = await seedCompanyGate(dataSource, schemaName, 'tenant-a');
      const requester = await seedCompanyGate(dataSource, schemaName, 'tenant-b');
      const mixed = victim.request({
        authority: {
          sessionId: requester.sessionId,
          authSubject: requester.authSubject,
          companyId: requester.companyId,
        },
      });
      const error = await expectDenied(serviceFor(requester).execute(mixed), 'AUTHORITY_FORBIDDEN');
      expect(JSON.stringify(error)).not.toContain(victim.companyId);
      expect((await snapshotCompanyGate(dataSource, schemaName, victim)).run?.state).toBe(
        'AWAITING_BRIEF_APPROVAL',
      );
    });

    await prove('A6-T-UNKNOWN-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'unknown');
      const request = fixture.request();
      request.command.run_id = fixtureUuid('unknown:absent-run');
      await expectDenied(serviceFor(fixture).execute(request), 'AUTHORITY_FORBIDDEN');
      expect((await snapshotCompanyGate(dataSource, schemaName, fixture)).events).toHaveLength(0);
    });

    await prove('A6-T-STALE-RUN-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'stale-run');
      const before = await countProofRows(dataSource, schemaName);
      await expectDenied(
        serviceFor(fixture).execute(
          fixture.request({
            ifMatch: fixture.runRowVersion - 1,
            expected: { run_row_version: fixture.runRowVersion - 1 },
          }),
        ),
        'STALE_VERSION',
      );
      const after = await countProofRows(dataSource, schemaName);
      expect(delta(after, before, 'founder_gate_decisions')).toBe(0);
      expect(delta(after, before, 'continuation_intents')).toBe(0);
    });

    await prove('A6-T-STALE-ARTIFACT-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'stale-artifact');
      const prior = fixture.priorArtifactVersions[0];
      if (!prior) throw new Error('Prior artifact fixture missing.');
      const before = await countProofRows(dataSource, schemaName);
      await expectDenied(
        serviceFor(fixture).execute(
          fixture.request({
            expected: {
              artifact_version_id: prior.id,
              artifact_version: prior.version,
              artifact_checksum: prior.checksum,
            },
          }),
        ),
      );
      const after = await countProofRows(dataSource, schemaName);
      expect(delta(after, before, 'founder_gate_decisions')).toBe(0);
      expect((await snapshotCompanyGate(dataSource, schemaName, fixture)).gate?.status).toBe(
        'PENDING',
      );
    });

    await prove('A6-T-STALE-ATTEMPT-01', async () => {
      const decision = evaluator.evaluate({
        ...baseInput,
        task: {
          id: fixtureUuid('stale:task'),
          state: 'RUNNING',
          row_version: 2,
          employee_definition_id: fixtureUuid('stale:employee'),
        },
        attempt: {
          id: fixtureUuid('stale:attempt'),
          number: 1,
          status: 'EXPIRED',
          lease_token_digest: fixtureDigest('stale:lease'),
          lease_expires_at: AICO006_FIXTURE_TIME,
        },
      });
      expect(decision).toMatchObject({ effect: 'DENY', reason_code: 'INVALID_CONTEXT' });
    });

    await prove('A6-T-STALE-EMPLOYEE-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'stale-employee-binding');
      await queryProofSchema(
        dataSource,
        schemaName,
        `UPDATE runs SET employee_definition_version='retired/v0' WHERE id=$1`,
        [fixture.runId],
      );
      const before = await countProofRows(dataSource, schemaName);
      await expectDenied(serviceFor(fixture).execute(fixture.request()), 'STALE_VERSION');
      const after = await countProofRows(dataSource, schemaName);
      expect(delta(after, before, 'founder_gate_decisions')).toBe(0);
      expect(delta(after, before, 'continuation_intents')).toBe(0);
      expect(delta(after, before, 'adapter_effect_ledger')).toBe(0);
    });

    await prove('A6-T-STALE-POLICY-01', async () => {
      const decision = evaluator.evaluate({
        ...baseInput,
        policy: { ...baseInput.policy, semantic_version: 'unsupported/v9' },
      });
      expect(decision).toMatchObject({ effect: 'DENY', reason_code: 'POLICY_VERSION_UNSUPPORTED' });
      const fixture = await seedCompanyGate(dataSource, schemaName, 'stale-policy-binding');
      const before = await countProofRows(dataSource, schemaName);
      await expectDenied(
        serviceWithMutatedAllow(fixture, (allowed) => ({
          ...allowed,
          policy_version: 'substituted-policy/v9',
        })).execute(fixture.request()),
        'INVALID_CONTEXT',
      );
      const after = await countProofRows(dataSource, schemaName);
      expect(delta(after, before, 'founder_gate_decisions')).toBe(0);
      expect(delta(after, before, 'continuation_intents')).toBe(0);
    });

    await prove('A6-T-STALE-WORKFLOW-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'workflow-pin');
      const v2 = fixtureUuid('workflow-pin:target:v2');
      await queryProofSchema(
        dataSource,
        schemaName,
        `INSERT INTO policy_targeting_versions (id,company_id,target_key,policy_version_id,policy_version,policy_digest,workflow_version,employee_definition_version,environment_digest,budget_digest,parameter_digest,status,effective_at,created_at) VALUES ($1,$2,'GATE-01',$3,'gate01-policy/v2',$4,'aico006-workflow/v2','founder/v2',$5,$6,$7,'ACTIVE',$8,$8)`,
        [
          v2,
          fixture.companyId,
          fixtureUuid('workflow-pin:policy:v2'),
          fixtureDigest('workflow-pin:policy:v2'),
          AICO006_FIXTURE_DIGESTS.environment,
          AICO006_FIXTURE_DIGESTS.budget,
          AICO006_FIXTURE_DIGESTS.parameters,
          AICO006_FIXTURE_TIME,
        ],
      );
      await queryProofSchema(
        dataSource,
        schemaName,
        `UPDATE policy_targets SET active_targeting_version_id=$1,row_version=row_version+1 WHERE company_id=$2 AND target_key='GATE-01'`,
        [v2, fixture.companyId],
      );
      const rows = await queryProofSchema<{
        targeting_version_id: string;
        workflow_version: string;
      }>(
        dataSource,
        schemaName,
        `SELECT targeting_version_id,workflow_version FROM runs WHERE id=$1`,
        [fixture.runId],
      );
      expect(rows[0]).toEqual({
        targeting_version_id: fixture.targetingVersionId,
        workflow_version: 'aico006-workflow/v1',
      });
      const receipt = await serviceFor(fixture).execute(fixture.request());
      const originalDecision = await queryProofSchema<{ policy_version: string }>(
        dataSource,
        schemaName,
        `SELECT policy_version FROM policy_decisions WHERE id=$1`,
        [receipt.policy_decision_id],
      );
      expect(originalDecision[0]?.policy_version).toBe(AICO006_POLICY_VERSION);

      const rollback = fixtureUuid('workflow-pin:target:rollback');
      await queryProofSchema(
        dataSource,
        schemaName,
        `INSERT INTO policy_targeting_versions (id,company_id,target_key,policy_version_id,policy_version,policy_digest,workflow_version,employee_definition_version,environment_digest,budget_digest,parameter_digest,status,effective_at,created_at) VALUES ($1,$2,'GATE-01',$3,'gate01-policy/v1-rollback',$4,'aico006-workflow/v1','founder/v1',$5,$6,$7,'ROLLED_BACK',$8,$8)`,
        [
          rollback,
          fixture.companyId,
          fixtureUuid('workflow-pin:policy:rollback'),
          fixtureDigest('workflow-pin:policy:rollback'),
          AICO006_FIXTURE_DIGESTS.environment,
          AICO006_FIXTURE_DIGESTS.budget,
          AICO006_FIXTURE_DIGESTS.parameters,
          '2026-08-13T02:01:00.000Z',
        ],
      );
      await queryProofSchema(
        dataSource,
        schemaName,
        `UPDATE policy_targets SET active_targeting_version_id=$1,row_version=row_version+1 WHERE company_id=$2 AND target_key='GATE-01'`,
        [rollback, fixture.companyId],
      );
      const preserved = await queryProofSchema<{
        policy_version: string;
        targeting_version_id: string;
      }>(
        dataSource,
        schemaName,
        `SELECT d.policy_version,r.targeting_version_id FROM policy_decisions d JOIN runs r ON r.company_id=d.company_id AND r.id=d.run_id WHERE d.id=$1`,
        [receipt.policy_decision_id],
      );
      expect(preserved[0]).toEqual({
        policy_version: AICO006_POLICY_VERSION,
        targeting_version_id: fixture.targetingVersionId,
      });
    });

    await prove('A6-T-WRONG-GATE-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'wrong-gate');
      const request = fixture.request();
      (request.command.expected as { gate: string }).gate = 'GATE-02';
      await expectDenied(serviceFor(fixture).execute(request), 'INVALID_CONTEXT');
      expect((await snapshotCompanyGate(dataSource, schemaName, fixture)).gate?.status).toBe(
        'PENDING',
      );
    });

    await prove('A6-T-WRONG-STATE-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'wrong-state', {
        runState: 'QUALIFYING',
      });
      await expectDenied(serviceFor(fixture).execute(fixture.request()), 'WRONG_STAGE');
      expect(RUN_STAGES).toEqual(['INTAKE', 'PRODUCT', 'DESIGN', 'BUILD', 'QA', 'FINAL']);
      await expect(
        queryProofSchema(dataSource, schemaName, `UPDATE runs SET stage='TERMINAL' WHERE id=$1`, [
          fixture.runId,
        ]),
      ).rejects.toThrow();
    });

    await prove('A6-T-WRONG-ACTION-01', async () => {
      const decision = evaluator.evaluate({
        ...baseInput,
        action: { ...baseInput.action, key: 'approve' },
      });
      expect(decision).toMatchObject({ effect: 'DENY', reason_code: 'INVALID_CONTEXT' });
    });

    await prove('A6-T-WRONG-RESOURCE-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'wrong-resource');
      const before = await countProofRows(dataSource, schemaName);
      await expectDenied(
        serviceFor(fixture).execute(
          fixture.request({ expected: { artifact_checksum: fixtureDigest('wrong:checksum') } }),
        ),
      );
      const after = await countProofRows(dataSource, schemaName);
      expect(delta(after, before, 'founder_gate_decisions')).toBe(0);
    });

    await prove('A6-T-EXPIRED-01', async () => {
      const fixture = await seedCompanyGate(dataSource, schemaName, 'expired');
      class ExpiringClock implements PolicyEvaluationClock {
        private calls = 0;
        now(): Rfc3339Utc {
          this.calls += 1;
          return this.calls < 3 ? AICO006_FIXTURE_TIME : '2026-08-13T02:00:00.002Z';
        }
      }
      const before = await countProofRows(dataSource, schemaName);
      await expectDenied(
        serviceFor(fixture, undefined, new ExpiringClock(), 1).execute(fixture.request()),
        'ALLOW_EXPIRED',
      );
      const after = await countProofRows(dataSource, schemaName);
      expect(delta(after, before, 'policy_decisions')).toBe(1);
      expect(delta(after, before, 'founder_gate_decisions')).toBe(0);
    });

    await prove('A6-T-TERMINAL-01', async () => {
      for (const state of ['CANCELED', 'FAILED', 'COMPLETED'] as const) {
        const fixture = await seedCompanyGate(
          dataSource,
          schemaName,
          `terminal-${state.toLowerCase()}`,
          { runState: state },
        );
        await expectDenied(
          serviceFor(fixture).execute(fixture.request()),
          state === 'CANCELED' ? 'RUN_TERMINAL' : 'RUN_TERMINAL',
        );
        expect((await snapshotCompanyGate(dataSource, schemaName, fixture)).run?.state).toBe(state);
      }
    });

    let restartFixture: CompanyGateFixture;
    await prove('A6-T-RESTART-01', async () => {
      restartFixture = await seedCompanyGate(dataSource, schemaName, 'restart');
      const killed = await killHeldPrecommitProcess(restartFixture);
      expect(killed.process_id).not.toBe(process.pid);
      expect(killed.state).toBe('PRECOMMIT_HELD');
      expect(killed.terminatedInMs).toBeLessThan(10_000);
      expect((await snapshotCompanyGate(dataSource, schemaName, restartFixture)).run).toMatchObject(
        {
          state: 'AWAITING_BRIEF_APPROVAL',
          stage: 'PRODUCT',
          rowVersion: restartFixture.runRowVersion,
        },
      );
      const request = restartFixture.request();
      const first = await serviceFor(restartFixture).execute(request);
      const started = Date.now();
      const child = spawnSync(process.execPath, ['scripts/policy-approval-restart-probe.mjs'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AICO_PROOF_DATABASE_URL: databaseUrl,
          AICO_PROOF_SCHEMA: schemaName,
          AICO_PROOF_COMPANY_ID: restartFixture.companyId,
          AICO_PROOF_RUN_ID: restartFixture.runId,
        },
        encoding: 'utf8',
      });
      expect(child.status).toBe(0);
      const observed = JSON.parse(child.stdout.trim()) as {
        process_id: number;
        decisions: number;
        continuations: number;
        events: number;
      };
      expect(observed.process_id).not.toBe(process.pid);
      expect(observed).toMatchObject({ decisions: 1, continuations: 1, events: 2 });
      expect(Date.now() - started).toBeLessThan(15 * 60 * 1000);
      const replay = await serviceFor(restartFixture).execute(request);
      expect(replay.decision_record_id).toBe(first.decision_record_id);
      expect(replay.replayed).toBe(true);
    });

    await prove('A6-T-OUTBOX-REDELIVERY-01', async () => {
      const messages = await queryProofSchema<{
        id: string;
        event_id: string;
        run_sequence: number;
      }>(
        dataSource,
        schemaName,
        `SELECT o.id,o.event_id,e.run_sequence FROM outbox_messages o
         JOIN domain_events e ON e.company_id=o.company_id AND e.id=o.event_id
         WHERE e.company_id=$1 AND e.run_id=$2 ORDER BY e.run_sequence`,
        [restartFixture.companyId, restartFixture.runId],
      );
      const policy = messages[0];
      const approval = messages[1];
      if (!policy || !approval) throw new Error('Restart outbox messages missing.');
      const consume = (
        outboxMessageId: string,
        crashAfterCommit = false,
      ): SpawnSyncReturns<string> => {
        return spawnSync(
          process.execPath,
          ['-r', 'ts-node/register/transpile-only', 'test/aico-006-spike/consumer-probe.ts'],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              AICO_PROOF_DATABASE_URL: databaseUrl,
              AICO_PROOF_SCHEMA: schemaName,
              AICO_PROOF_OUTBOX_MESSAGE_ID: outboxMessageId,
              AICO_PROOF_CONSUMER_TIME: AICO006_FIXTURE_TIME,
              AICO_PROOF_CRASH_AFTER_COMMIT: String(crashAfterCommit),
            },
            encoding: 'utf8',
          },
        );
      };
      const deferred = consume(approval.id);
      expect(deferred.status).toBe(0);
      expect(JSON.parse(deferred.stdout.trim())).toMatchObject({
        outcome: 'DEFERRED',
        acknowledged: false,
      });
      const policyApplied = consume(policy.id);
      expect(policyApplied.status).toBe(0);
      expect(JSON.parse(policyApplied.stdout.trim())).toMatchObject({
        outcome: 'APPLIED',
        acknowledged: true,
      });
      const crashedProcess = consume(approval.id, true);
      expect(crashedProcess.status).toBe(86);
      expect(crashedProcess.stderr).toContain('CONSUMER_CRASH_AFTER_PROJECTION_COMMIT');
      const afterCrash = await queryProofSchema<{
        inbox: number;
        projection: number;
        acknowledgement: number;
      }>(
        dataSource,
        schemaName,
        `SELECT
          (SELECT count(*)::integer FROM projection_inbox WHERE event_id=$1) AS inbox,
          (SELECT count(*)::integer FROM gate01_projection WHERE company_id=$2 AND run_id=$3) AS projection,
          (SELECT count(*)::integer FROM consumer_outbox_acknowledgements WHERE event_id=$1) AS acknowledgement`,
        [approval.event_id, restartFixture.companyId, restartFixture.runId],
      );
      expect(afterCrash[0]).toEqual({ inbox: 1, projection: 1, acknowledgement: 0 });
      const replacementProcess = consume(approval.id);
      expect(replacementProcess.status).toBe(0);
      expect(JSON.parse(replacementProcess.stdout.trim())).toMatchObject({
        outcome: 'DEDUPED',
        acknowledged: true,
      });
      const finalEffects = await countProofRows(dataSource, schemaName);
      expect(finalEffects.continuation_intents).toBeGreaterThan(0);
      expect(finalEffects.designer_execution_ledger).toBe(0);
      expect(finalEffects.adapter_effect_ledger).toBe(0);
      expect(finalEffects.budget_effect_ledger).toBe(0);
    });

    await prove('A6-T-FORGED-CONTINUATION-01', async () => {
      const forged = {
        id: fixtureUuid('forged:event'),
        event_type: 'approval.decided',
        run_sequence: 2,
        payload_digest: fixtureDigest('forged:event'),
        causation_id: fixtureUuid('forged:causation'),
      };
      const child = spawnSync(
        process.execPath,
        ['-r', 'ts-node/register/transpile-only', 'test/aico-006-spike/consumer-probe.ts'],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            AICO_PROOF_DATABASE_URL: databaseUrl,
            AICO_PROOF_SCHEMA: schemaName,
            AICO_PROOF_OUTBOX_MESSAGE_ID: forged.id,
            AICO_PROOF_DELIVERED_ENVELOPE: JSON.stringify(forged),
            AICO_PROOF_CONSUMER_TIME: AICO006_FIXTURE_TIME,
          },
          encoding: 'utf8',
        },
      );
      expect(child.status).toBe(0);
      expect(JSON.parse(child.stdout.trim())).toMatchObject({
        outcome: 'QUARANTINED',
        reason: 'OUTBOX_NOT_FOUND',
        acknowledged: false,
      });
      const authoritative = await queryProofSchema<{ count: number; quarantine: number }>(
        dataSource,
        schemaName,
        `SELECT
          (SELECT count(*)::integer FROM domain_events WHERE id=$1) AS count,
          (SELECT count(*)::integer FROM consumer_quarantine
            WHERE reason_code='OUTBOX_NOT_FOUND') AS quarantine`,
        [forged.id],
      );
      expect(authoritative[0]).toEqual({ count: 0, quarantine: 1 });
      expect((await countProofRows(dataSource, schemaName)).designer_execution_ledger).toBe(0);
    });

    await prove('A6-T-MISSING-BUDGET-01', async () => {
      const decision = evaluator.evaluate({ ...baseInput, budget: null });
      expect(decision).toMatchObject({ effect: 'DENY', reason_code: 'INVALID_CONTEXT' });
      const fixture = await seedCompanyGate(dataSource, schemaName, 'tampered-budget-binding');
      await expectDenied(
        serviceWithMutatedAllow(fixture, (allowed) => ({
          ...allowed,
          binding: { ...allowed.binding, budget_digest: fixtureDigest('forged-budget') },
        })).execute(fixture.request()),
        'INVALID_CONTEXT',
      );
      expect((await snapshotCompanyGate(dataSource, schemaName, fixture)).gate?.status).toBe(
        'PENDING',
      );
    });

    await prove('A6-T-MISSING-ENVIRONMENT-01', async () => {
      const decision = evaluator.evaluate({
        ...baseInput,
        environment: { ...baseInput.environment, digest: null },
      });
      expect(decision).toMatchObject({ effect: 'DENY', reason_code: 'INVALID_CONTEXT' });
      const fixture = await seedCompanyGate(dataSource, schemaName, 'tampered-environment-binding');
      await expectDenied(
        serviceWithMutatedAllow(fixture, (allowed) => ({
          ...allowed,
          binding: {
            ...allowed.binding,
            environment_digest: fixtureDigest('unsafe-environment'),
          },
        })).execute(fixture.request()),
        'INVALID_CONTEXT',
      );
      expect((await snapshotCompanyGate(dataSource, schemaName, fixture)).gate?.status).toBe(
        'PENDING',
      );
    });

    await prove('A6-T-MISSING-PARAMETER-01', async () => {
      const decision = evaluator.evaluate({
        ...baseInput,
        action: { ...baseInput.action, parameters_digest: '' },
      });
      expect(decision).toMatchObject({ effect: 'DENY', reason_code: 'INVALID_CONTEXT' });
      const fixture = await seedCompanyGate(dataSource, schemaName, 'tampered-parameter-binding');
      await expectDenied(
        serviceWithMutatedAllow(fixture, (allowed) => ({
          ...allowed,
          binding: { ...allowed.binding, parameters_digest: fixtureDigest('changed-command') },
        })).execute(fixture.request()),
        'INVALID_CONTEXT',
      );
      expect((await snapshotCompanyGate(dataSource, schemaName, fixture)).gate?.status).toBe(
        'PENDING',
      );
    });

    await prove('A6-T-AUDIT-REDACTION-01', async () => {
      const canaries = [
        'AICO006_CANARY_SECRET_FEEDBACK',
        'AICO006_CANARY_FOREIGN_REFERENCE',
        'AICO006_CANARY_PROMPT_CONTENT',
      ];
      const fixture = await seedCompanyGate(dataSource, schemaName, 'redaction');
      const protectedFeedback = canaries.join(':');
      await serviceFor(fixture).execute(
        fixture.request({ decision: 'REQUEST_REVISION', feedback: protectedFeedback }),
      );
      const protectedDecision = await queryProofSchema<{
        feedback: string;
        feedback_digest: string;
        feedback_classification: string;
      }>(
        dataSource,
        schemaName,
        `SELECT feedback,feedback_digest,feedback_classification
         FROM founder_gate_decisions WHERE company_id=$1`,
        [fixture.companyId],
      );
      expect(protectedDecision[0]).toEqual({
        feedback: protectedFeedback,
        feedback_digest: contractDigest({
          classification: 'CONFIDENTIAL_FOUNDER_INPUT',
          value: protectedFeedback,
        }),
        feedback_classification: 'CONFIDENTIAL_FOUNDER_INPUT',
      });
      const tables = await queryProofSchema<{ table_name: string }>(
        dataSource,
        schemaName,
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema=current_schema() AND table_type='BASE TABLE'
         ORDER BY table_name`,
      );
      expect(tables.length).toBeGreaterThanOrEqual(22);
      for (const { table_name: table } of tables) {
        expect(table).toMatch(/^[a-z0-9_]+$/);
        for (const canary of canaries) {
          const rows = await queryProofSchema<{ leaked: boolean }>(
            dataSource,
            schemaName,
            `SELECT EXISTS (SELECT 1 FROM "${table}" row_value
              WHERE (CASE WHEN $2 = 'founder_gate_decisions'
                THEN to_jsonb(row_value) - 'feedback'
                ELSE to_jsonb(row_value) END)::text LIKE '%' || $1 || '%') AS leaked`,
            [canary, table],
          );
          expect(rows[0]?.leaked).toBe(false);
        }
      }
      expect(JSON.stringify([...passed])).not.toContain('AICO006_CANARY_');
    });

    await prove('A6-T-DENIAL-EVENT-01', async () => {
      type DenialPreparation = {
        fixture: CompanyGateFixture;
        request: ReturnType<CompanyGateFixture['request']>;
        execute: () => Promise<unknown>;
      };
      const scenarios: Array<{
        label: string;
        reason: string;
        companyScoped: boolean;
        prepare: () => Promise<DenialPreparation>;
      }> = [
        {
          label: 'missing-context',
          reason: 'INVALID_CONTEXT',
          companyScoped: true,
          prepare: async (): Promise<DenialPreparation> => {
            const fixture = await seedCompanyGate(dataSource, schemaName, 'deny-missing-context');
            const request = fixture.request();
            return {
              fixture,
              request,
              execute: () =>
                serviceFor(fixture).executeRedactedDenial({
                  request,
                  actorType: 'SYSTEM',
                  actorVersion: 'proof-system/v1',
                  reasonCode: 'INVALID_CONTEXT',
                  resourceClass: 'GATE_INSTANCE',
                  suppliedReference: 'missing-required-context',
                }),
            };
          },
        },
        {
          label: 'stale-run',
          reason: 'STALE_VERSION',
          companyScoped: false,
          prepare: async (): Promise<DenialPreparation> => {
            const fixture = await seedCompanyGate(dataSource, schemaName, 'deny-stale-run');
            const request = fixture.request({
              ifMatch: fixture.runRowVersion - 1,
              expected: { run_row_version: fixture.runRowVersion - 1 },
            });
            return { fixture, request, execute: () => serviceFor(fixture).execute(request) };
          },
        },
        {
          label: 'stale-artifact',
          reason: 'STALE_VERSION',
          companyScoped: false,
          prepare: async (): Promise<DenialPreparation> => {
            const fixture = await seedCompanyGate(dataSource, schemaName, 'deny-stale-artifact');
            const stale = fixture.priorArtifactVersions[0];
            if (!stale) throw new Error('Stale denial artifact fixture missing.');
            const request = fixture.request({
              expected: {
                artifact_version_id: stale.id,
                artifact_version: stale.version,
                artifact_checksum: stale.checksum,
              },
            });
            return { fixture, request, execute: () => serviceFor(fixture).execute(request) };
          },
        },
        {
          label: 'role-forbidden',
          reason: 'ROLE_FORBIDDEN',
          companyScoped: true,
          prepare: async (): Promise<DenialPreparation> => {
            const fixture = await seedCompanyGate(dataSource, schemaName, 'deny-role');
            const request = fixture.request();
            return {
              fixture,
              request,
              execute: () =>
                serviceFor(fixture).executeRedactedDenial({
                  request,
                  actorType: 'EMPLOYEE',
                  actorVersion: 'emp-pm/v1',
                  reasonCode: 'ROLE_FORBIDDEN',
                  resourceClass: 'GATE_INSTANCE',
                  suppliedReference: fixture.gateInstanceId,
                }),
            };
          },
        },
        {
          label: 'cross-tenant',
          reason: 'TENANT_MISMATCH',
          companyScoped: true,
          prepare: async (): Promise<DenialPreparation> => {
            const fixture = await seedCompanyGate(dataSource, schemaName, 'deny-cross-tenant');
            const request = fixture.request();
            return {
              fixture,
              request,
              execute: () =>
                serviceFor(fixture).executeRedactedDenial({
                  request,
                  actorType: 'EMPLOYEE',
                  actorVersion: 'emp-pm/v1',
                  reasonCode: 'TENANT_MISMATCH',
                  resourceClass: 'GATE_INSTANCE',
                  suppliedReference: 'foreign-or-unknown-gate-reference',
                }),
            };
          },
        },
        {
          label: 'wrong-resource',
          reason: 'STALE_VERSION',
          companyScoped: false,
          prepare: async (): Promise<DenialPreparation> => {
            const fixture = await seedCompanyGate(dataSource, schemaName, 'deny-wrong-resource');
            const request = fixture.request({
              expected: { artifact_id: fixtureUuid('deny:wrong:artifact') },
            });
            return { fixture, request, execute: () => serviceFor(fixture).execute(request) };
          },
        },
        {
          label: 'expired-allow',
          reason: 'ALLOW_EXPIRED',
          companyScoped: false,
          prepare: async (): Promise<DenialPreparation> => {
            const fixture = await seedCompanyGate(dataSource, schemaName, 'deny-expired-allow');
            const request = fixture.request();
            let clockReads = 0;
            const advancingClock: PolicyEvaluationClock = {
              now: () => {
                clockReads += 1;
                return clockReads <= 2
                  ? fixture.clock.now()
                  : new Date(Date.parse(fixture.clock.now()) + 2).toISOString();
              },
            };
            return {
              fixture,
              request,
              execute: () => serviceFor(fixture, undefined, advancingClock, 1).execute(request),
            };
          },
        },
      ];
      for (const scenario of scenarios) {
        const { fixture, request, execute } = await scenario.prepare();
        const before = await countProofRows(dataSource, schemaName);
        const first = (await expectDenied(execute(), scenario.reason)) as Gate01DeniedError;
        const replay = (await expectDenied(execute(), scenario.reason)) as Gate01DeniedError;
        expect(replay.eventId).toBe(first.eventId);
        expect(replay.policyDecisionId).toBe(first.policyDecisionId);
        const after = await countProofRows(dataSource, schemaName);
        expect(delta(after, before, 'policy_decisions')).toBe(1);
        expect(delta(after, before, 'domain_events')).toBe(1);
        expect(delta(after, before, 'outbox_messages')).toBe(1);
        expect(delta(after, before, 'founder_gate_decisions')).toBe(0);
        expect(delta(after, before, 'continuation_intents')).toBe(0);
        expect(delta(after, before, 'adapter_effect_ledger')).toBe(0);
        expect(delta(after, before, 'budget_effect_ledger')).toBe(0);
        const denial = await queryProofSchema<{
          expires_at: string | null;
          maximum_uses: number;
          binding: Record<string, unknown>;
          causation_id: string;
          event_id: string;
        }>(
          dataSource,
          schemaName,
          `SELECT p.expires_at,p.maximum_uses,p.binding,e.causation_id,e.id AS event_id
           FROM policy_decisions p JOIN domain_events e ON e.aggregate_id=p.id
           WHERE p.command_id=$1`,
          [request.command.command_id],
        );
        expect(denial[0]).toMatchObject({
          expires_at: null,
          maximum_uses: 0,
          causation_id: request.command.command_id,
          event_id: first.eventId,
        });
        const serializedBinding = JSON.stringify(denial[0]?.binding);
        expect(serializedBinding).not.toContain('foreign-or-unknown-gate-reference');
        expect(serializedBinding).not.toContain(fixture.currentArtifactVersion.checksum);
        const outbox = await queryProofSchema<{ id: string }>(
          dataSource,
          schemaName,
          `SELECT id FROM outbox_messages WHERE event_id=$1`,
          [first.eventId],
        );
        if (!outbox[0]) throw new Error('Denial outbox evidence missing.');
        const applied = await consumeOutboxMessage(
          dataSource,
          schemaName,
          { outboxMessageId: outbox[0].id },
          { consumerKey: 'denial-proof/v1', observedAt: AICO006_FIXTURE_TIME },
        );
        const redelivered = await consumeOutboxMessage(
          dataSource,
          schemaName,
          { outboxMessageId: outbox[0].id },
          { consumerKey: 'denial-proof/v1', observedAt: AICO006_FIXTURE_TIME },
        );
        expect(applied).toMatchObject({
          outcome: 'APPLIED',
          runSequence: scenario.companyScoped ? null : 1,
          acknowledged: true,
        });
        expect(redelivered).toMatchObject({
          outcome: 'DEDUPED',
          runSequence: scenario.companyScoped ? null : 1,
          acknowledged: true,
        });
        const receipts = await queryProofSchema<{ count: number }>(
          dataSource,
          schemaName,
          `SELECT count(*)::integer AS count FROM projection_inbox
           WHERE consumer_key='denial-proof/v1' AND event_id=$1`,
          [first.eventId],
        );
        expect(receipts[0]?.count).toBe(1);
      }
    });

    const rollbackFailpoints: Gate01Failpoint[] = [
      'AFTER_AUTHORITY_LOCK',
      'AFTER_RECEIPT_LOCK',
      'BEFORE_RECEIPT_WRITE',
      'AFTER_RECEIPT_WRITE',
      'AFTER_POLICY_DECISION',
      'AFTER_FOUNDER_DECISION',
      'AFTER_GATE_TRANSITION',
      'AFTER_APPROVED_BINDING',
      'AFTER_CONTINUATION',
      'AFTER_POLICY_EVENT',
      'AFTER_POLICY_OUTBOX',
      'AFTER_APPROVAL_EVENT',
      'AFTER_APPROVAL_OUTBOX',
    ];
    for (const failpoint of rollbackFailpoints) {
      const fixture = await seedCompanyGate(
        dataSource,
        schemaName,
        `rollback-${failpoint.toLowerCase()}`,
      );
      const before = await countProofRows(dataSource, schemaName);
      await expectDenied(
        serviceFor(fixture, (stage) => {
          if (stage === failpoint) throw new Error(`injected:${stage}`);
        }).execute(fixture.request()),
      );
      expect(await countProofRows(dataSource, schemaName)).toEqual(before);
      expect((await snapshotCompanyGate(dataSource, schemaName, fixture)).gate?.status).toBe(
        'PENDING',
      );
    }

    const commitFixture = await seedCompanyGate(dataSource, schemaName, 'commit-before-response');
    const commitRequest = commitFixture.request();
    await expectDenied(
      serviceFor(commitFixture, (stage) => {
        if (stage === 'AFTER_COMMIT_BEFORE_RETURN') throw new Error('lost-response');
      }).execute(commitRequest),
    );
    const recovered = await serviceFor(commitFixture).execute(commitRequest);
    expect(recovered.replayed).toBe(true);

    expect(DENY_REASON_CODES).toHaveLength(14);
    expect([...passed].sort()).toEqual([...ALL_CASES].sort());
    const effects = await countProofRows(dataSource, schemaName);
    expect(effects.adapter_effect_ledger).toBe(0);
    expect(effects.budget_effect_ledger).toBe(0);
    expect(effects.designer_execution_ledger).toBe(0);
    expect(contractDigest([...passed].sort())).toMatch(/^[0-9a-f]{64}$/);
    const repositorySha = process.env.AICO_PROOF_REPOSITORY_SHA;
    const dirtyDevelopment = process.env.AICO_PROOF_DIRTY_DEVELOPMENT === 'true';
    if (dirtyDevelopment) expect(repositorySha).toBe('UNCOMMITTED');
    else expect(repositorySha).toMatch(/^[0-9a-f]{40}$/);
    console.log(
      JSON.stringify({
        evidence_schema: 'aico-006-proof/v1',
        repository_sha: repositorySha,
        evidence_status: dirtyDevelopment ? 'DEVELOPMENT_ONLY_DIRTY' : 'EXACT_SHA',
        command: 'npm run test:policy-approval-proof',
        process_id: process.pid,
        threat_cases: passed.size,
        threat_case_ids: [...passed].sort(),
        transactional_rollback_boundaries: rollbackFailpoints.length,
        lost_response_recovery: true,
        external_effects: 0,
        budget_effects: 0,
        designer_executions: 0,
        result_digest: contractDigest([...passed].sort()),
      }),
    );
  });
});
