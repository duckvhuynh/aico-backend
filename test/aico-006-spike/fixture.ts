import type { DataSource } from 'typeorm';
import { v5 as uuidv5 } from 'uuid';

import { canonicalDigest } from '../../src/common/domain/identifiers';
import type { DecisionCommandV1, Rfc3339Utc, RunStage, Sha256Hex } from './contracts';
import type { Gate01CommandRequest } from './gate01-command.service';
import type { PolicyEvaluationClock } from './policy-decision.port';
import { createProofSchema, dropProofSchema, setProofSearchPath } from './proof-schema';

export const AICO006_FIXTURE_NAMESPACE = '6df54d45-6724-5abc-9b99-d3dc13c64006';
export const AICO006_FIXTURE_TIME = '2026-08-13T02:00:00.000Z';
export const AICO006_POLICY_VERSION = 'gate01-policy/v1';
export const AICO006_WORKFLOW_VERSION = 'aico006-workflow/v1';
export const AICO006_EMPLOYEE_DEFINITION_VERSION = 'founder/v1';

export function fixtureUuid(label: string): string {
  return uuidv5(`aico-006:${label}`, AICO006_FIXTURE_NAMESPACE);
}

export function fixtureDigest(label: string): Sha256Hex {
  return canonicalDigest({ fixture: 'aico-006/v1', label });
}

export const AICO006_FIXTURE_DIGESTS = Object.freeze({
  policy: fixtureDigest('policy:v1'),
  environment: fixtureDigest('environment:safe-test'),
  budget: fixtureDigest('budget:not-applicable'),
  parameters: fixtureDigest('gate01:parameters'),
  priorBrief: fixtureDigest('product-brief:v1'),
  currentBrief: fixtureDigest('product-brief:v2'),
});

type RunState =
  | 'DRAFT'
  | 'QUALIFYING'
  | 'AWAITING_FOUNDER_INPUT'
  | 'AWAITING_BRIEF_APPROVAL'
  | 'DESIGNING'
  | 'AWAITING_DESIGN_APPROVAL'
  | 'BUILDING'
  | 'REVIEWING'
  | 'REWORKING'
  | 'AWAITING_FINAL_APPROVAL'
  | 'BLOCKED'
  | 'FAILED'
  | 'CANCELED'
  | 'COMPLETED';

export class FrozenPolicyClock implements PolicyEvaluationClock {
  private instant: Rfc3339Utc;

  constructor(instant: Rfc3339Utc = AICO006_FIXTURE_TIME) {
    this.instant = normalizeInstant(instant);
  }

  now(): Rfc3339Utc {
    return this.instant;
  }

  set(instant: Rfc3339Utc): void {
    this.instant = normalizeInstant(instant);
  }

  advance(milliseconds: number): Rfc3339Utc {
    if (!Number.isSafeInteger(milliseconds)) {
      throw new TypeError('milliseconds must be a safe integer');
    }
    this.instant = new Date(Date.parse(this.instant) + milliseconds).toISOString();
    return this.instant;
  }
}

export interface SeedCompanyGateOptions {
  now?: Rfc3339Utc;
  founderStatus?: 'ACTIVE' | 'DISABLED';
  sessionStatus?: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  sessionExpiresAt?: Rfc3339Utc;
  companyStatus?: 'ACTIVE' | 'INACTIVE';
  targetingStatus?: 'ACTIVE' | 'PAUSED' | 'DENY_ALL' | 'ROLLED_BACK';
  policyVersion?: string;
  runState?: RunState;
  runStage?: RunStage;
  runRowVersion?: number;
  gateRowVersion?: number;
  cancellationRequestedAt?: Rfc3339Utc | null;
  operatorKillVersion?: number;
  artifactVersion?: number;
  priorArtifactVersions?: number;
  workflowVersion?: string;
  employeeDefinitionVersion?: string;
  environmentDigest?: Sha256Hex;
  budgetDigest?: Sha256Hex;
  parameterDigest?: Sha256Hex;
}

export interface Gate01RequestFactoryOptions {
  decision?: 'APPROVE' | 'REQUEST_REVISION';
  feedback?: string | null;
  idempotencyLabel?: string;
  correlationLabel?: string;
  commandLabel?: string;
  ifMatch?: number;
  expected?: Partial<DecisionCommandV1['expected']>;
  authority?: Partial<Gate01CommandRequest['authority']>;
}

export interface ArtifactVersionFixtureRef {
  id: string;
  version: number;
  checksum: Sha256Hex;
  contentDigest: Sha256Hex;
}

export interface CompanyGateFixture {
  label: string;
  clock: FrozenPolicyClock;
  authSubject: string;
  founderId: string;
  sessionId: string;
  companyId: string;
  targetingVersionId: string;
  policyVersionId: string;
  runId: string;
  attemptId: string;
  artifactId: string;
  priorArtifactVersions: readonly ArtifactVersionFixtureRef[];
  currentArtifactVersion: ArtifactVersionFixtureRef;
  gateInstanceId: string;
  runRowVersion: number;
  gateRowVersion: number;
  request(options?: Gate01RequestFactoryOptions): Gate01CommandRequest;
}

export async function seedCompanyGate(
  dataSource: DataSource,
  schemaName: string,
  label: string,
  options: SeedCompanyGateOptions = {},
): Promise<CompanyGateFixture> {
  const now = normalizeInstant(options.now ?? AICO006_FIXTURE_TIME);
  const clock = new FrozenPolicyClock(now);
  const ids = fixtureIds(label);
  const policyVersion = options.policyVersion ?? AICO006_POLICY_VERSION;
  const workflowVersion = options.workflowVersion ?? AICO006_WORKFLOW_VERSION;
  const employeeDefinitionVersion =
    options.employeeDefinitionVersion ?? AICO006_EMPLOYEE_DEFINITION_VERSION;
  const environmentDigest = options.environmentDigest ?? AICO006_FIXTURE_DIGESTS.environment;
  const budgetDigest = options.budgetDigest ?? AICO006_FIXTURE_DIGESTS.budget;
  const parameterDigest = options.parameterDigest ?? AICO006_FIXTURE_DIGESTS.parameters;
  const currentVersion = positiveInt(options.artifactVersion ?? 2, 'artifactVersion');
  const priorVersionCount = nonNegativeInt(
    options.priorArtifactVersions ?? Math.min(1, currentVersion - 1),
    'priorArtifactVersions',
  );
  if (priorVersionCount >= currentVersion) {
    throw new RangeError('priorArtifactVersions must be less than artifactVersion');
  }
  const runRowVersion = positiveInt(options.runRowVersion ?? 7, 'runRowVersion');
  const gateRowVersion = positiveInt(options.gateRowVersion ?? 3, 'gateRowVersion');
  const operatorKillVersion = positiveInt(options.operatorKillVersion ?? 1, 'operatorKillVersion');
  const sessionExpiresAt = normalizeInstant(options.sessionExpiresAt ?? '2099-12-31T23:59:59.000Z');
  const authSubject = `fixture:${label}:founder`;
  const currentArtifactVersion = artifactVersionRef(label, currentVersion);
  const priorArtifactVersions = Array.from({ length: priorVersionCount }, (_, index) =>
    artifactVersionRef(label, index + 1),
  );

  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction('READ COMMITTED');
  try {
    await setProofSearchPath(runner, schemaName);
    await runner.query(
      `INSERT INTO founders (
        id, auth_subject, status, authority_version, created_at
      ) VALUES ($1,$2,$3,1,$4)`,
      [ids.founderId, authSubject, options.founderStatus ?? 'ACTIVE', now],
    );
    await runner.query(
      `INSERT INTO founder_sessions (
        id, founder_id, auth_subject, status, expires_at,
        session_version, created_at
      ) VALUES ($1,$2,$3,$4,$5,1,$6)`,
      [
        ids.sessionId,
        ids.founderId,
        authSubject,
        options.sessionStatus ?? 'ACTIVE',
        sessionExpiresAt,
        now,
      ],
    );
    await runner.query(
      `INSERT INTO companies (
        id, founder_id, current_founder_id, status, row_version, created_at
      ) VALUES ($1,$2,$2,$3,1,$4)`,
      [ids.companyId, ids.founderId, options.companyStatus ?? 'ACTIVE', now],
    );
    await runner.query(
      `INSERT INTO policy_targeting_versions (
        id, company_id, target_key, policy_version_id, policy_version,
        policy_digest, workflow_version, employee_definition_version,
        environment_digest, budget_digest, parameter_digest, status,
        effective_at, created_at
      ) VALUES ($1,$2,'GATE-01',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
      [
        ids.targetingVersionId,
        ids.companyId,
        ids.policyVersionId,
        policyVersion,
        fixtureDigest(`${label}:policy:${policyVersion}`),
        workflowVersion,
        employeeDefinitionVersion,
        environmentDigest,
        budgetDigest,
        parameterDigest,
        options.targetingStatus ?? 'ACTIVE',
        now,
      ],
    );
    await runner.query(
      `INSERT INTO policy_targets (
        company_id, target_key, active_targeting_version_id, row_version
      ) VALUES ($1,'GATE-01',$2,1)`,
      [ids.companyId, ids.targetingVersionId],
    );
    await runner.query(
      `INSERT INTO runs (
        id, company_id, state, stage, row_version, workflow_version,
        targeting_version_id, attempt_id, employee_definition_version,
        environment_digest, budget_digest, parameter_digest,
        operator_kill_version, cancellation_requested_at, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)`,
      [
        ids.runId,
        ids.companyId,
        options.runState ?? 'AWAITING_BRIEF_APPROVAL',
        options.runStage ?? 'PRODUCT',
        runRowVersion,
        workflowVersion,
        ids.targetingVersionId,
        ids.attemptId,
        employeeDefinitionVersion,
        environmentDigest,
        budgetDigest,
        parameterDigest,
        operatorKillVersion,
        options.cancellationRequestedAt ?? null,
        now,
      ],
    );
    await runner.query(
      `INSERT INTO artifacts (
        id, company_id, run_id, artifact_type, created_at
      ) VALUES ($1,$2,$3,'PRODUCT_BRIEF',$4)`,
      [ids.artifactId, ids.companyId, ids.runId, now],
    );
    for (const version of [...priorArtifactVersions, currentArtifactVersion]) {
      await runner.query(
        `INSERT INTO artifact_versions (
          id, company_id, run_id, artifact_id, version, checksum,
          content_digest, artifact_schema, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'product-brief/v1',$8)`,
        [
          version.id,
          ids.companyId,
          ids.runId,
          ids.artifactId,
          version.version,
          version.checksum,
          version.contentDigest,
          now,
        ],
      );
    }
    await runner.query(
      `INSERT INTO gate_instances (
        id, company_id, run_id, gate_key, artifact_id, artifact_version_id,
        artifact_version, artifact_checksum, status, row_version, created_at
      ) VALUES ($1,$2,$3,'GATE-01',$4,$5,$6,$7,'PENDING',$8,$9)`,
      [
        ids.gateInstanceId,
        ids.companyId,
        ids.runId,
        ids.artifactId,
        currentArtifactVersion.id,
        currentArtifactVersion.version,
        currentArtifactVersion.checksum,
        gateRowVersion,
        now,
      ],
    );
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }

  const fixtureBase = {
    label,
    clock,
    authSubject,
    founderId: ids.founderId,
    sessionId: ids.sessionId,
    companyId: ids.companyId,
    targetingVersionId: ids.targetingVersionId,
    policyVersionId: ids.policyVersionId,
    runId: ids.runId,
    attemptId: ids.attemptId,
    artifactId: ids.artifactId,
    priorArtifactVersions,
    currentArtifactVersion,
    gateInstanceId: ids.gateInstanceId,
    runRowVersion,
    gateRowVersion,
  };
  return {
    ...fixtureBase,
    request: (requestOptions = {}) => makeGate01Request(fixtureBase, requestOptions),
  };
}

export async function resetAndSeedCompanyGate(
  dataSource: DataSource,
  schemaName: string,
  label: string,
  options: SeedCompanyGateOptions = {},
): Promise<CompanyGateFixture> {
  await dropProofSchema(dataSource, schemaName);
  await createProofSchema(dataSource, schemaName);
  return seedCompanyGate(dataSource, schemaName, label, options);
}

export async function seedNewCompanyGate(
  dataSource: DataSource,
  schemaName: string,
  parentLabel: string,
  gateLabel: string,
  options: SeedCompanyGateOptions = {},
): Promise<CompanyGateFixture> {
  return seedCompanyGate(dataSource, schemaName, `${parentLabel}:gate:${gateLabel}`, options);
}

const COUNTED_TABLES = [
  'companies',
  'runs',
  'artifact_versions',
  'gate_instances',
  'command_receipts',
  'policy_decisions',
  'founder_gate_decisions',
  'approved_artifact_bindings',
  'continuation_intents',
  'domain_events',
  'outbox_messages',
  'projection_inbox',
  'gate01_projection',
  'adapter_effect_ledger',
  'budget_effect_ledger',
  'designer_execution_ledger',
] as const;

export type ProofCountTable = (typeof COUNTED_TABLES)[number];
export type ProofCounts = Record<ProofCountTable, number>;

export interface Gate01StateSnapshot {
  counts: ProofCounts;
  run: {
    state: string;
    stage: string;
    rowVersion: number;
  } | null;
  gate: {
    status: string;
    rowVersion: number;
    artifactVersionId: string;
  } | null;
  events: ReadonlyArray<{
    id: string;
    type: 'policy.decided' | 'approval.decided';
    sequence: number;
    correlationId: string;
  }>;
}

export async function countProofRows(
  dataSource: DataSource,
  schemaName: string,
): Promise<ProofCounts> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction('READ COMMITTED');
  try {
    await setProofSearchPath(runner, schemaName);
    const entries: Array<readonly [ProofCountTable, number]> = [];
    for (const table of COUNTED_TABLES) {
      const rows = (await runner.query(
        `SELECT count(*)::integer AS count FROM ${table}`,
      )) as Array<{ count: number }>;
      entries.push([table, rows[0]?.count ?? 0]);
    }
    await runner.commitTransaction();
    return Object.fromEntries(entries) as ProofCounts;
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

export async function snapshotCompanyGate(
  dataSource: DataSource,
  schemaName: string,
  fixture: Pick<CompanyGateFixture, 'companyId' | 'runId' | 'gateInstanceId'>,
): Promise<Gate01StateSnapshot> {
  const counts = await countProofRows(dataSource, schemaName);
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction('READ COMMITTED');
  try {
    await setProofSearchPath(runner, schemaName);
    const runs = (await runner.query(
      `SELECT state, stage, row_version
       FROM runs WHERE company_id = $1 AND id = $2`,
      [fixture.companyId, fixture.runId],
    )) as Array<{ state: string; stage: string; row_version: number }>;
    const gates = (await runner.query(
      `SELECT status, row_version, artifact_version_id
       FROM gate_instances WHERE company_id = $1 AND run_id = $2 AND id = $3`,
      [fixture.companyId, fixture.runId, fixture.gateInstanceId],
    )) as Array<{
      status: string;
      row_version: number;
      artifact_version_id: string;
    }>;
    const eventRows = (await runner.query(
      `SELECT id, event_type, run_sequence, correlation_id
       FROM domain_events
       WHERE company_id = $1 AND run_id = $2
       ORDER BY run_sequence`,
      [fixture.companyId, fixture.runId],
    )) as Array<{
      id: string;
      event_type: 'policy.decided' | 'approval.decided';
      run_sequence: string | number;
      correlation_id: string;
    }>;
    await runner.commitTransaction();
    const run = runs[0];
    const gate = gates[0];
    return {
      counts,
      run:
        run === undefined
          ? null
          : {
              state: run.state,
              stage: run.stage,
              rowVersion: run.row_version,
            },
      gate:
        gate === undefined
          ? null
          : {
              status: gate.status,
              rowVersion: gate.row_version,
              artifactVersionId: gate.artifact_version_id,
            },
      events: eventRows.map((event) => ({
        id: event.id,
        type: event.event_type,
        sequence: Number(event.run_sequence),
        correlationId: event.correlation_id,
      })),
    };
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

function makeGate01Request(
  fixture: Omit<CompanyGateFixture, 'request'>,
  options: Gate01RequestFactoryOptions,
): Gate01CommandRequest {
  const decision = options.decision ?? 'APPROVE';
  const commandLabel = options.commandLabel ?? `${decision}:primary`;
  const expected: DecisionCommandV1['expected'] = {
    run_row_version: fixture.runRowVersion,
    run_state: 'AWAITING_BRIEF_APPROVAL',
    run_stage: 'PRODUCT',
    gate: 'GATE-01',
    gate_instance_id: fixture.gateInstanceId,
    gate_instance_row_version: fixture.gateRowVersion,
    artifact_id: fixture.artifactId,
    artifact_version_id: fixture.currentArtifactVersion.id,
    artifact_version: fixture.currentArtifactVersion.version,
    artifact_checksum: fixture.currentArtifactVersion.checksum,
    ...options.expected,
  };
  return {
    authority: {
      sessionId: fixture.sessionId,
      authSubject: fixture.authSubject,
      companyId: fixture.companyId,
      authenticatedAt: new Date(fixture.clock.now()),
      ...options.authority,
    },
    idempotencyKey: fixtureUuid(
      `${fixture.label}:idempotency:${options.idempotencyLabel ?? commandLabel}`,
    ),
    correlationId: fixtureUuid(
      `${fixture.label}:correlation:${options.correlationLabel ?? commandLabel}`,
    ),
    ifMatch: options.ifMatch ?? fixture.runRowVersion,
    command: {
      command_schema: 'founder-decision-command/v1',
      command_id: fixtureUuid(`${fixture.label}:command:${commandLabel}`),
      run_id: fixture.runId,
      expected,
      decision:
        decision === 'APPROVE'
          ? {
              decision_schema: 'approval/v1',
              type: 'APPROVE',
              feedback: options.feedback ?? null,
            }
          : {
              decision_schema: 'revision-decision/v1',
              type: 'REQUEST_REVISION',
              feedback: options.feedback ?? 'Clarify the target customer evidence.',
            },
    },
  };
}

function fixtureIds(label: string): {
  founderId: string;
  sessionId: string;
  companyId: string;
  targetingVersionId: string;
  policyVersionId: string;
  runId: string;
  attemptId: string;
  artifactId: string;
  gateInstanceId: string;
} {
  return {
    founderId: fixtureUuid(`${label}:founder`),
    sessionId: fixtureUuid(`${label}:session`),
    companyId: fixtureUuid(`${label}:company`),
    targetingVersionId: fixtureUuid(`${label}:policy-targeting:v1`),
    policyVersionId: fixtureUuid(`${label}:policy:v1`),
    runId: fixtureUuid(`${label}:run`),
    attemptId: fixtureUuid(`${label}:attempt`),
    artifactId: fixtureUuid(`${label}:product-brief`),
    gateInstanceId: fixtureUuid(`${label}:gate01`),
  };
}

function artifactVersionRef(label: string, version: number): ArtifactVersionFixtureRef {
  return {
    id: fixtureUuid(`${label}:product-brief:v${version}`),
    version,
    checksum: fixtureDigest(`${label}:product-brief:v${version}:checksum`),
    contentDigest: fixtureDigest(`${label}:product-brief:v${version}:content`),
  };
}

function normalizeInstant(value: Rfc3339Utc): Rfc3339Utc {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) {
    throw new TypeError('instant must be RFC 3339 UTC');
  }
  return new Date(epoch).toISOString();
}

function positiveInt(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeInt(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}
