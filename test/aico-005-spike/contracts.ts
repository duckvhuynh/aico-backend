import { createHash } from 'node:crypto';

export const A5_ACCEPTANCE_IDS = [
  'A5-T-SUCCESS-01',
  'A5-T-MALFORMED-01',
  'A5-T-REPAIR-01',
  'A5-T-TIMEOUT-01',
  'A5-T-RATE-01',
  'A5-T-CANCEL-01',
  'A5-T-SAFETY-01',
  'A5-T-SECRET-01',
  'A5-T-META-01',
  'A5-T-VERSION-01',
  'A5-T-REPLAY-01',
  'A5-T-MUTATION-01',
  'A5-T-VERIFY-01',
] as const;

export type A5AcceptanceCase = (typeof A5_ACCEPTANCE_IDS)[number];

export const A5_FIXTURE_IDS = [
  'A5-FX-01',
  'A5-FX-02',
  'A5-FX-03',
  'A5-FX-04',
  'A5-FX-05',
  'A5-FX-06',
  'A5-FX-07',
  'A5-FX-08',
  'A5-FX-09',
  'A5-FX-10',
  'A5-FX-11',
  'A5-FX-12',
  'A5-FX-13',
  'A5-FX-14',
  'A5-FX-15',
] as const;

export type A5FixtureId = (typeof A5_FIXTURE_IDS)[number];

export interface A5ScenarioDefinition {
  readonly id: `A5-S-${string}`;
  readonly acceptanceId: A5AcceptanceCase;
  readonly fixtureId: A5FixtureId;
  readonly expectedReasonClass: string;
}

const scenario = (
  id: A5ScenarioDefinition['id'],
  acceptanceId: A5AcceptanceCase,
  fixtureId: A5FixtureId,
  expectedReasonClass: string,
): A5ScenarioDefinition => ({ id, acceptanceId, fixtureId, expectedReasonClass });

export const A5_SCENARIO_REGISTRY = [
  scenario('A5-S-SUCCESS-STRICT', 'A5-T-SUCCESS-01', 'A5-FX-01', 'STRICT_SUCCESS'),
  scenario('A5-S-SUCCESS-LINEAGE', 'A5-T-SUCCESS-01', 'A5-FX-01', 'EXACT_LINEAGE'),
  scenario(
    'A5-S-SUCCESS-ZERO-AUTHORITY',
    'A5-T-SUCCESS-01',
    'A5-FX-01',
    'ZERO_PRECOMMIT_AUTHORITY',
  ),
  scenario('A5-S-SUCCESS-COMMIT-GATE', 'A5-T-SUCCESS-01', 'A5-FX-01', 'FENCED_COMMIT'),

  scenario('A5-S-MALFORMED-JSON', 'A5-T-MALFORMED-01', 'A5-FX-02', 'INVALID_JSON'),
  scenario('A5-S-MALFORMED-MISSING', 'A5-T-MALFORMED-01', 'A5-FX-02', 'REQUIRED_FIELD'),
  scenario('A5-S-MALFORMED-UNKNOWN', 'A5-T-MALFORMED-01', 'A5-FX-02', 'UNKNOWN_FIELD'),
  scenario('A5-S-MALFORMED-TYPE', 'A5-T-MALFORMED-01', 'A5-FX-02', 'WRONG_TYPE'),
  scenario('A5-S-MALFORMED-ENUM', 'A5-T-MALFORMED-01', 'A5-FX-02', 'WRONG_ENUM'),
  scenario('A5-S-MALFORMED-OVERSIZE', 'A5-T-MALFORMED-01', 'A5-FX-02', 'OUTPUT_TOO_LARGE'),
  scenario('A5-S-MALFORMED-SEMANTIC', 'A5-T-MALFORMED-01', 'A5-FX-03', 'SEMANTIC_INVALID'),
  scenario('A5-S-MALFORMED-WIRE', 'A5-T-MALFORMED-01', 'A5-FX-13', 'WIRE_SCHEMA_INVALID'),

  scenario('A5-S-REPAIR-ELIGIBLE', 'A5-T-REPAIR-01', 'A5-FX-04', 'REPAIR_ELIGIBLE'),
  scenario('A5-S-REPAIR-SAFE-DIAGNOSTICS', 'A5-T-REPAIR-01', 'A5-FX-04', 'SAFE_DIAGNOSTICS'),
  scenario('A5-S-REPAIR-NEW-INVOCATION', 'A5-T-REPAIR-01', 'A5-FX-04', 'NEW_INVOCATION'),
  scenario(
    'A5-S-REPAIR-DISJOINT-RESERVATION',
    'A5-T-REPAIR-01',
    'A5-FX-04',
    'DISJOINT_RESERVATION',
  ),
  scenario('A5-S-REPAIR-NON-VALIDATION', 'A5-T-REPAIR-01', 'A5-FX-08', 'NON_VALIDATION_TERMINAL'),
  scenario('A5-S-REPAIR-EXHAUSTED', 'A5-T-REPAIR-01', 'A5-FX-04', 'REPAIR_CAP'),

  scenario('A5-S-TIMEOUT-PRE-DISPATCH', 'A5-T-TIMEOUT-01', 'A5-FX-06', 'PRE_DISPATCH_TIMEOUT'),
  scenario('A5-S-TIMEOUT-POST-DISPATCH', 'A5-T-TIMEOUT-01', 'A5-FX-06', 'POST_DISPATCH_UNKNOWN'),
  scenario('A5-S-TIMEOUT-NO-REPLAY', 'A5-T-TIMEOUT-01', 'A5-FX-06', 'UNKNOWN_NOT_REPLAYED'),
  scenario('A5-S-TIMEOUT-RECONCILE', 'A5-T-TIMEOUT-01', 'A5-FX-06', 'EXPLICIT_RECONCILIATION'),

  scenario('A5-S-RATE-BOUNDED', 'A5-T-RATE-01', 'A5-FX-05', 'BOUNDED_RETRY_HINT'),
  scenario('A5-S-RATE-PERSISTED', 'A5-T-RATE-01', 'A5-FX-05', 'PERSISTED_RETRY'),
  scenario('A5-S-RATE-DEADLINE', 'A5-T-RATE-01', 'A5-FX-05', 'DEADLINE_BOUND'),
  scenario('A5-S-RATE-BUDGET', 'A5-T-RATE-01', 'A5-FX-05', 'RETRY_BUDGET'),
  scenario('A5-S-RATE-EXHAUSTED', 'A5-T-RATE-01', 'A5-FX-05', 'RETRY_EXHAUSTED'),
  scenario('A5-S-RATE-SDK-ZERO', 'A5-T-RATE-01', 'A5-FX-05', 'SDK_RETRIES_ZERO'),
  scenario('A5-S-RATE-NO-SLEEP', 'A5-T-RATE-01', 'A5-FX-05', 'NO_WORKER_SLEEP'),

  scenario('A5-S-CANCEL-PRE-DISPATCH', 'A5-T-CANCEL-01', 'A5-FX-07', 'PRE_CANCELED'),
  scenario('A5-S-CANCEL-SIGNAL', 'A5-T-CANCEL-01', 'A5-FX-07', 'ABORT_PROPAGATED'),
  scenario('A5-S-CANCEL-LATE-SUCCESS', 'A5-T-CANCEL-01', 'A5-FX-07', 'LATE_SUCCESS_FENCED'),
  scenario('A5-S-CANCEL-LEASE-LOSS', 'A5-T-CANCEL-01', 'A5-FX-07', 'LEASE_LOSS_FENCED'),
  scenario('A5-S-CANCEL-TERMINAL', 'A5-T-CANCEL-01', 'A5-FX-07', 'TERMINAL_FENCED'),
  scenario('A5-S-CANCEL-RECONCILE', 'A5-T-CANCEL-01', 'A5-FX-07', 'CANCEL_RECONCILE'),

  scenario('A5-S-SAFETY-REFUSAL', 'A5-T-SAFETY-01', 'A5-FX-08', 'REFUSAL_TERMINAL'),
  scenario('A5-S-SAFETY-BLOCK', 'A5-T-SAFETY-01', 'A5-FX-08', 'SAFETY_TERMINAL'),
  scenario('A5-S-SAFETY-TERMINAL', 'A5-T-SAFETY-01', 'A5-FX-08', 'NO_REPAIR_OR_RETRY'),
  scenario('A5-S-SAFETY-UNCERTAIN', 'A5-T-SAFETY-01', 'A5-FX-08', 'REDACTION_UNKNOWN'),
  scenario('A5-S-SAFETY-REDACTED', 'A5-T-SAFETY-01', 'A5-FX-08', 'REDACTED_VALIDATED'),

  scenario('A5-S-SECRET-PAYLOAD', 'A5-T-SECRET-01', 'A5-FX-09', 'PAYLOAD_CLEAN'),
  scenario('A5-S-SECRET-LOGS', 'A5-T-SECRET-01', 'A5-FX-09', 'LOGS_CLEAN'),
  scenario('A5-S-SECRET-EVIDENCE', 'A5-T-SECRET-01', 'A5-FX-09', 'EVIDENCE_CLEAN'),
  scenario('A5-S-SECRET-ARTIFACT', 'A5-T-SECRET-01', 'A5-FX-09', 'ARTIFACT_CLEAN'),
  scenario('A5-S-SECRET-UNCERTAIN', 'A5-T-SECRET-01', 'A5-FX-09', 'SANITIZATION_DENIED'),

  scenario('A5-S-META-SUCCESS', 'A5-T-META-01', 'A5-FX-10', 'SUCCESS_METADATA'),
  scenario('A5-S-META-FAILURE', 'A5-T-META-01', 'A5-FX-10', 'FAILURE_METADATA'),
  scenario('A5-S-META-CANCELED', 'A5-T-META-01', 'A5-FX-10', 'CANCELED_METADATA'),
  scenario('A5-S-META-UNKNOWN', 'A5-T-META-01', 'A5-FX-10', 'UNKNOWN_METADATA'),
  scenario('A5-S-META-ACCOUNTING', 'A5-T-META-01', 'A5-FX-10', 'ACCOUNTING_VALIDATED'),
  scenario('A5-S-META-RESERVATION', 'A5-T-META-01', 'A5-FX-10', 'RESERVATION_RECONCILED'),
  scenario('A5-S-META-BOUNDED', 'A5-T-META-01', 'A5-FX-10', 'BOUNDED_LABELS'),

  scenario('A5-S-VERSION-EXACT', 'A5-T-VERSION-01', 'A5-FX-11', 'EXACT_TARGET'),
  scenario('A5-S-VERSION-DRIFT', 'A5-T-VERSION-01', 'A5-FX-11', 'DRIFT_REJECTED'),
  scenario('A5-S-VERSION-HISTORY', 'A5-T-VERSION-01', 'A5-FX-12', 'HISTORY_PINNED'),
  scenario('A5-S-VERSION-CIRCUIT', 'A5-T-VERSION-01', 'A5-FX-12', 'CIRCUIT_NO_FALLBACK'),
  scenario('A5-S-VERSION-PRODUCTION', 'A5-T-VERSION-01', 'A5-FX-15', 'PRODUCTION_REJECTED'),
  scenario('A5-S-VERSION-EXTERNAL', 'A5-T-VERSION-01', 'A5-FX-15', 'EXTERNAL_REJECTED'),

  scenario('A5-S-REPLAY-DUPLICATE', 'A5-T-REPLAY-01', 'A5-FX-10', 'ONE_LOGICAL_EFFECT'),
  scenario('A5-S-REPLAY-COLLISION', 'A5-T-REPLAY-01', 'A5-FX-10', 'DIGEST_COLLISION_DENIED'),
  scenario('A5-S-REPLAY-UNKNOWN', 'A5-T-REPLAY-01', 'A5-FX-10', 'RECONCILE_NOT_REPLAY'),

  scenario('A5-S-MUTATION-REGISTRY', 'A5-T-MUTATION-01', 'A5-FX-14', 'CONTROL_REGISTRY_CLOSED'),
  scenario('A5-S-MUTATION-REAL-CONTROLS', 'A5-T-MUTATION-01', 'A5-FX-01', 'REAL_CONTROLS'),
  scenario('A5-S-VERIFY-BOUNDARY', 'A5-T-VERIFY-01', 'A5-FX-01', 'ARCHITECTURE_TEST_ONLY'),
] as const satisfies readonly A5ScenarioDefinition[];

export type A5ScenarioId = (typeof A5_SCENARIO_REGISTRY)[number]['id'];
export const A5_SCENARIO_IDS = A5_SCENARIO_REGISTRY.map(({ id }) => id) as readonly A5ScenarioId[];

export interface ProofControls {
  readonly dtoAllowlist: boolean;
  readonly exactRequestTargetBinding: boolean;
  readonly strictSchemaValidation: boolean;
  readonly semanticValidation: boolean;
  readonly outputSizeValidation: boolean;
  readonly zeroAuthorityBeforeCommit: boolean;
  readonly distinctRepairInvocation: boolean;
  readonly disjointRepairReservations: boolean;
  readonly safeRepairDiagnostics: boolean;
  readonly repairCap: boolean;
  readonly preDispatchDeadline: boolean;
  readonly postDispatchUnknown: boolean;
  readonly abortSignalPropagation: boolean;
  readonly lateResultCommitFence: boolean;
  readonly sdkRetriesDisabled: boolean;
  readonly persistedRetryNoSleep: boolean;
  readonly retryHintBounds: boolean;
  readonly atomicIdempotency: boolean;
  readonly unknownReconciliation: boolean;
  readonly terminalSafetyAndRedaction: boolean;
  readonly redactedSuccessValidation: boolean;
  readonly evidenceSinkRedaction: boolean;
  readonly usageCostProvenance: boolean;
  readonly reservationVarianceReconciliation: boolean;
  readonly metricLabelAllowlist: boolean;
  readonly resolvedTargetDrift: boolean;
  readonly eligibleNewHistoricalLineage: boolean;
  readonly halfOpenNoFallback: boolean;
  readonly deterministicProductionRejection: boolean;
  readonly externalActivationRejection: boolean;
}

export const DEFAULT_A5_PROOF_CONTROLS: Readonly<ProofControls> = Object.freeze({
  dtoAllowlist: true,
  exactRequestTargetBinding: true,
  strictSchemaValidation: true,
  semanticValidation: true,
  outputSizeValidation: true,
  zeroAuthorityBeforeCommit: true,
  distinctRepairInvocation: true,
  disjointRepairReservations: true,
  safeRepairDiagnostics: true,
  repairCap: true,
  preDispatchDeadline: true,
  postDispatchUnknown: true,
  abortSignalPropagation: true,
  lateResultCommitFence: true,
  sdkRetriesDisabled: true,
  persistedRetryNoSleep: true,
  retryHintBounds: true,
  atomicIdempotency: true,
  unknownReconciliation: true,
  terminalSafetyAndRedaction: true,
  redactedSuccessValidation: true,
  evidenceSinkRedaction: true,
  usageCostProvenance: true,
  reservationVarianceReconciliation: true,
  metricLabelAllowlist: true,
  resolvedTargetDrift: true,
  eligibleNewHistoricalLineage: true,
  halfOpenNoFallback: true,
  deterministicProductionRejection: true,
  externalActivationRejection: true,
});

export type A5SourceControlMutationTarget = keyof ProofControls;

export type Sha256 = `sha256:${string}`;
export type ProviderResultStatus = 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN';
export type DispatchPhase = 'NOT_DISPATCHED' | 'DISPATCHED' | 'UNCERTAIN';
export type RetryGuidance =
  | 'NO_RETRY'
  | 'PERSISTED_RETRY_SCHEDULE'
  | 'REPAIR_INVOCATION'
  | 'RECONCILE_BEFORE_DECISION'
  | 'BLOCKED_OWNER_DECISION';
export type FailureClassification =
  | 'PRE_DISPATCH_TRANSIENT'
  | 'RATE_LIMITED'
  | 'VALIDATION'
  | 'REFUSAL_SAFETY'
  | 'CANCELED'
  | 'POST_DISPATCH_TIMEOUT_UNKNOWN'
  | 'POLICY_DENIED'
  | 'BUDGET_EXHAUSTED'
  | 'TERMINAL_PROVIDER'
  | 'INTEGRITY'
  | 'CONFIGURATION'
  | 'TARGET_KILLED'
  | 'CIRCUIT_OPEN';

export interface VersionReference {
  readonly id: string;
  readonly kind: string;
  readonly logical_key: string;
  readonly semantic_version: string;
  readonly content_digest: Sha256;
}

export interface ModelProviderInvocationRequestV1 extends Record<string, unknown> {
  readonly contract: 'aico.model-provider-invocation-request';
  readonly schema_version: '1.0';
  readonly company_id: string;
  readonly run_id: string;
  readonly task_id: string;
  readonly attempt_id: string;
  readonly invocation_id: string;
  readonly logical_idempotency_key: string;
  readonly request_digest: Sha256;
  readonly context_manifest: Readonly<{ id: string; version: string; digest: Sha256 }>;
  readonly versions: Readonly<Record<string, VersionReference | null>>;
  readonly target_decision_id: string;
  readonly target_decision_digest: Sha256;
  readonly execution_guard: Readonly<Record<string, unknown>>;
  readonly output_schema: Readonly<Record<string, unknown>>;
  readonly limits: Readonly<Record<string, unknown>>;
  readonly deadline_at: string;
  readonly budget_reservations: readonly Readonly<Record<string, unknown>>[];
  readonly budget_reservations_digest: Sha256;
  readonly privacy: Readonly<Record<string, unknown>>;
}

export interface RuntimeFailureV1 {
  readonly classification: FailureClassification;
  readonly reason_code: string;
  readonly dispatch_phase: DispatchPhase;
  readonly retry_guidance: RetryGuidance;
  readonly retryable: boolean;
  readonly retry_after: string | null;
  readonly reconciliation_required: boolean;
  readonly reconciliation_action: string;
}

export interface ModelProviderInvocationResultV1 extends Record<string, unknown> {
  readonly contract: 'aico.model-provider-invocation-result';
  readonly schema_version: '1.0';
  readonly request_digest: Sha256;
  readonly invocation_id: string;
  readonly status: ProviderResultStatus;
  readonly candidate_output: Readonly<Record<string, unknown>> | null;
  readonly provider_configuration_ref: VersionReference;
  readonly validation: Readonly<Record<string, unknown>>;
  readonly failure: RuntimeFailureV1 | null;
  readonly state_authority: 'NONE';
  readonly artifact_authority: 'NONE';
  readonly tool_authority: 'NONE';
}

export interface ModelProviderRepairRequestV1 extends Record<string, unknown> {
  readonly contract: 'aico.model-provider-repair-request';
  readonly schema_version: '1.0';
  readonly failed_invocation_id: string;
  readonly repair_ordinal: 1;
  readonly repair_cap: 1;
  readonly original_reservation_ids: readonly string[];
  readonly repair_reservation_ids: readonly string[];
  readonly repair_invocation: Readonly<Record<string, unknown>>;
}

export type ModelProviderConfigurationV1 = Readonly<Record<string, unknown>>;
export type ModelProviderTargetDecisionV1 = Readonly<Record<string, unknown>>;
export type ModelProviderCircuitDecisionV1 = Readonly<Record<string, unknown>>;
export type ModelProviderEvidenceV1 = Readonly<Record<string, unknown>>;

export interface ModelProviderPortV1 {
  invoke(
    request: ModelProviderInvocationRequestV1,
    signal: AbortSignal,
  ): Promise<ModelProviderInvocationResultV1>;
}

export interface ProviderReconciliationPortV1 {
  lookup(
    request: Readonly<{
      invocation_id: string;
      logical_idempotency_key: string;
      request_digest: Sha256;
    }>,
    signal: AbortSignal,
  ): Promise<ModelProviderInvocationResultV1 | null>;
}

export interface ProofSideEffectLedger {
  providerCalls: number;
  sdkRetries: number;
  workerSleeps: number;
  reservations: number;
  retrySchedules: number;
  repairInvocations: number;
  reconciliations: number;
  candidateCommits: number;
  artifactEffects: number;
  taskEffects: number;
  toolEffects: number;
  stateEffects: number;
  externalProviderCalls: number;
  costEffects: number;
}

export const emptyProofLedger = (): ProofSideEffectLedger => ({
  providerCalls: 0,
  sdkRetries: 0,
  workerSleeps: 0,
  reservations: 0,
  retrySchedules: 0,
  repairInvocations: 0,
  reconciliations: 0,
  candidateCommits: 0,
  artifactEffects: 0,
  taskEffects: 0,
  toolEffects: 0,
  stateEffects: 0,
  externalProviderCalls: 0,
  costEffects: 0,
});

export interface A5ScenarioEvidence {
  readonly scenarioId: A5ScenarioId;
  readonly acceptanceId: A5AcceptanceCase;
  readonly resultClass: 'PASSED';
  readonly reasonClass: string;
  readonly ledgerDigest: Sha256;
  readonly effectTotals: Readonly<ProofSideEffectLedger>;
  readonly evidenceDigest: Sha256;
}

export interface A5ProviderRuntimeIntegrationEvidence {
  readonly evidenceSchema: 'aico-005-provider-runtime-integration/v1';
  readonly claimClass: 'ARCHITECTURE_TEST_ONLY';
  readonly repositorySha: string;
  readonly dirtyDevelopmentEvidence: boolean;
  readonly acceptanceIds: readonly A5AcceptanceCase[];
  readonly selectedScenarios: readonly A5ScenarioId[];
  readonly scenarioRegistryDigest: Sha256;
  readonly passedScenarios: number;
  readonly fixtureIds: readonly A5FixtureId[];
  readonly scenarioEvidence: readonly A5ScenarioEvidence[];
  readonly paidExternalServices: 0;
  readonly productionCredentials: 0;
  readonly externalProviderCalls: 0;
  readonly runtimeClass: 'DETERMINISTIC_IN_MEMORY_PROVIDER_PROOF';
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON requires finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  throw new TypeError('Canonical JSON contains a non-JSON value.');
}

export function canonicalDigest(value: unknown): Sha256 {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function repairReservationSetsDigest(repair: ModelProviderRepairRequestV1): Sha256 {
  return canonicalDigest({
    original_reservation_ids: repair.original_reservation_ids,
    repair_reservation_ids: repair.repair_reservation_ids,
  });
}

export function repairValidationSubjectDigest(repair: ModelProviderRepairRequestV1): Sha256 {
  const subject = structuredClone(repair) as Record<string, unknown>;
  delete subject.semantic_validation_receipt;
  return canonicalDigest(subject);
}

export function repairSemanticReceiptDigest(receipt: Readonly<Record<string, unknown>>): Sha256 {
  const subject = structuredClone(receipt) as Record<string, unknown>;
  delete subject.receipt_digest;
  return canonicalDigest(subject);
}

export const A5_SCENARIO_REGISTRY_DIGEST = canonicalDigest(
  A5_SCENARIO_REGISTRY.map(({ id, acceptanceId, fixtureId, expectedReasonClass }) => ({
    id,
    acceptanceId,
    fixtureId,
    expectedReasonClass,
  })),
);

export function assertProof(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`AICO005_PROOF_${code}`);
}
