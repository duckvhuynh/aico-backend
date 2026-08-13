import { canonicalDigest, isUuid } from '../../src/common/domain/identifiers';

declare const uuidBrand: unique symbol;

// The optional brand keeps literal fixtures ergonomic while preserving the
// canonical contract's intentional `Uuid | string` distinction for linting.
export type Uuid = string & { readonly [uuidBrand]?: never };
export type Rfc3339Utc = string;
export type Sha256Hex = string;
export type PositiveInt = number;

export const RUN_STAGES = ['INTAKE', 'PRODUCT', 'DESIGN', 'BUILD', 'QA', 'FINAL'] as const;
export type RunStage = (typeof RUN_STAGES)[number];

export const POLICY_ACTION_KEYS = [
  'gate.gate-01.approve/v1',
  'gate.gate-01.request-revision/v1',
  'task.design.dispatch/v1',
  'tool.invoke/v1',
] as const;
export type PolicyActionKey = (typeof POLICY_ACTION_KEYS)[number];

export const ACTOR_TYPES = ['FOUNDER', 'EMPLOYEE', 'OPERATOR', 'SYSTEM'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const RESOURCE_TYPES = [
  'GATE_INSTANCE',
  'ARTIFACT_VERSION',
  'TOOL_REQUEST',
  'CONTINUATION_INTENT',
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const GATES = ['GATE-01', 'GATE-02', 'GATE-03'] as const;
export type Gate = (typeof GATES)[number];

export const DENY_REASON_CODES = [
  'ROLE_FORBIDDEN',
  'WRONG_STAGE',
  'APPROVAL_MISSING',
  'STALE_VERSION',
  'RESOURCE_OUT_OF_SCOPE',
  'BUDGET_UNAVAILABLE',
  'ENVIRONMENT_UNSAFE',
  'TENANT_MISMATCH',
  'INVALID_CONTEXT',
  'AUTHENTICATION_REQUIRED',
  'POLICY_VERSION_UNSUPPORTED',
  'ALLOW_EXPIRED',
  'RUN_CANCELED',
  'RUN_TERMINAL',
] as const;
export type DenyReasonCode = (typeof DENY_REASON_CODES)[number];
export type AllowReasonCode = 'ACTION_ALLOWED';

export interface EnvelopeMetaV1 {
  schema_version: 1;
  message_id: Uuid;
  correlation_id: Uuid;
  causation_id: Uuid | null;
  occurred_at: Rfc3339Utc;
}

export interface PolicyInputV1 {
  meta: EnvelopeMetaV1;
  policy_input_schema: 'policy-input/v1';
  policy_request_id: Uuid;
  evaluation_time: Rfc3339Utc;
  policy: {
    version_id: Uuid;
    semantic_version: string;
    digest: Sha256Hex;
    targeting_version_id: Uuid;
    targeting_state: 'ACTIVE' | 'PAUSED' | 'DENY_ALL' | 'ROLLED_BACK';
  };
  actor: {
    type: ActorType;
    id: Uuid | string;
    version: string | null;
    authentication_context_id: Uuid | null;
    authenticated_at: Rfc3339Utc | null;
    authentication_strength: string | null;
    revocation_version: PositiveInt | null;
  };
  company: {
    id: Uuid;
    status: 'ACTIVE' | 'DELETING' | 'DELETED';
    founder_id: Uuid;
  };
  run: {
    id: Uuid;
    state: string;
    stage: RunStage;
    row_version: PositiveInt;
    workflow_version: string;
    policy_version: string;
    cancellation_requested_at: Rfc3339Utc | null;
    operator_kill_version: PositiveInt;
  };
  task: {
    id: Uuid;
    state: string;
    row_version: PositiveInt;
    employee_definition_id: Uuid | null;
  } | null;
  attempt: {
    id: Uuid;
    number: PositiveInt;
    status: string;
    lease_token_digest: Sha256Hex | null;
    lease_expires_at: Rfc3339Utc | null;
  } | null;
  action: {
    key: PolicyActionKey;
    parameters_digest: Sha256Hex;
  };
  resource: {
    type: ResourceType;
    id: Uuid | string;
    version: PositiveInt | string;
    company_id: Uuid;
    run_id: Uuid;
    digest: Sha256Hex;
  };
  gate: {
    id: Gate;
    gate_instance_id: Uuid;
    gate_instance_status: 'PENDING' | 'APPROVED' | 'REVISION_REQUESTED' | 'CANCELED';
    gate_instance_row_version: PositiveInt;
    artifact_id: Uuid;
    artifact_version_id: Uuid;
    artifact_version: PositiveInt;
    artifact_checksum: Sha256Hex;
  } | null;
  approval_references: Array<{
    approval_id: Uuid;
    gate: Gate;
    artifact_version_id: Uuid;
    decision: 'APPROVE' | 'REQUEST_REVISION';
  }>;
  budget:
    | {
        applicability: 'NOT_APPLICABLE';
        policy_version: string;
        snapshot_digest: Sha256Hex;
      }
    | {
        applicability: 'REQUIRED';
        policy_version: string;
        ledger_row_version: PositiveInt;
        category: string;
        hard_limit: number;
        reserved: number;
        consumed: number;
        requested: number;
        snapshot_digest: Sha256Hex;
      };
  environment: {
    application_version: string;
    deployment_environment: 'LOCAL' | 'TEST' | 'STAGING' | 'PRODUCTION';
    provider: string | null;
    tool_key: string | null;
    tool_version: string | null;
    network_mode: string | null;
    digest: Sha256Hex;
  };
}

export interface PolicyDecisionBaseV1 {
  meta: EnvelopeMetaV1;
  policy_decision_schema: 'policy-decision/v1';
  policy_decision_id: Uuid;
  policy_request_id: Uuid;
  policy_input_digest: Sha256Hex;
  policy_version_id: Uuid;
  policy_version: string;
  policy_digest: Sha256Hex;
  policy_targeting_version_id: Uuid;
}

export interface AllowBindingV1 {
  actor_type: ActorType;
  actor_id: Uuid | string;
  actor_version: string;
  company_id: Uuid;
  run_id: Uuid;
  task_id: Uuid | null;
  attempt_id: Uuid | null;
  action: PolicyActionKey;
  parameters_digest: Sha256Hex;
  resource_type: ResourceType;
  resource_id: Uuid | string;
  resource_version: PositiveInt | string;
  resource_digest: Sha256Hex;
  run_state: string;
  run_stage: RunStage;
  run_row_version: PositiveInt;
  task_state: string | null;
  gate: Gate | null;
  gate_instance_id: Uuid | null;
  gate_instance_row_version: PositiveInt | null;
  artifact_version_id: Uuid | null;
  approval_references_digest: Sha256Hex;
  budget_digest: Sha256Hex;
  environment_digest: Sha256Hex;
  workflow_version: string;
  policy_targeting_version_id: Uuid;
  maximum_uses: PositiveInt;
}

export interface DenyBindingV1 {
  actor_type: ActorType | null;
  actor_version: string | null;
  company_id: Uuid | null;
  action_class: string;
  resource_class: string;
  supplied_reference_digest: Sha256Hex | null;
  run_id?: Uuid;
  task_id?: Uuid;
  attempt_id?: Uuid;
}

export interface AllowPolicyDecisionV1 extends PolicyDecisionBaseV1 {
  effect: 'ALLOW';
  reason_code: AllowReasonCode;
  binding: AllowBindingV1;
  issued_at: Rfc3339Utc;
  expires_at: Rfc3339Utc;
}

export interface DenyPolicyDecisionV1 extends PolicyDecisionBaseV1 {
  effect: 'DENY';
  reason_code: DenyReasonCode;
  binding: DenyBindingV1;
  issued_at: Rfc3339Utc;
  expires_at: null;
  maximum_uses: 0;
}

export type PolicyDecisionV1 = AllowPolicyDecisionV1 | DenyPolicyDecisionV1;

export interface ApprovalV1 {
  decision_schema: 'approval/v1';
  type: 'APPROVE';
  feedback: string | null;
}

export interface RevisionDecisionV1 {
  decision_schema: 'revision-decision/v1';
  type: 'REQUEST_REVISION';
  feedback: string;
}

export interface DecisionCommandV1 {
  command_schema: 'founder-decision-command/v1';
  command_id: Uuid;
  run_id: Uuid;
  expected: {
    run_row_version: PositiveInt;
    run_state: 'AWAITING_BRIEF_APPROVAL';
    run_stage: 'PRODUCT';
    gate: 'GATE-01';
    gate_instance_id: Uuid;
    gate_instance_row_version: PositiveInt;
    artifact_id: Uuid;
    artifact_version_id: Uuid;
    artifact_version: PositiveInt;
    artifact_checksum: Sha256Hex;
  };
  decision: ApprovalV1 | RevisionDecisionV1;
}

export interface DecisionReceiptV1 {
  receipt_schema: 'founder-decision-receipt/v1';
  command_id: Uuid;
  decision_record_id: Uuid;
  policy_decision_id: Uuid;
  event_id: Uuid;
  company_id: Uuid;
  run_id: Uuid;
  gate: 'GATE-01';
  gate_instance_id: Uuid;
  resulting_gate_instance_status: 'APPROVED' | 'REVISION_REQUESTED';
  artifact_version_id: Uuid;
  artifact_version: PositiveInt;
  artifact_checksum: Sha256Hex;
  decision: 'APPROVE' | 'REQUEST_REVISION';
  prior_run_state: 'AWAITING_BRIEF_APPROVAL';
  resulting_run_state: 'DESIGNING' | 'QUALIFYING';
  resulting_run_stage: 'DESIGN' | 'PRODUCT';
  resulting_run_row_version: PositiveInt;
  approved_artifact_binding_id: Uuid | null;
  continuation: {
    kind: 'START_DESIGN_FROM_BRIEF' | 'REVISE_PRODUCT_BRIEF';
    continuation_intent_id: Uuid;
  };
  decided_at: Rfc3339Utc;
  correlation_id: Uuid;
  replayed: boolean;
}

export type PolicyInputValidation =
  | { ok: true; value: PolicyInputV1 }
  | { ok: false; reason_code: 'INVALID_CONTEXT' };

type UnknownRecord = Record<string, unknown>;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const RFC3339_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(
  value: UnknownRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
}

function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number]);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isPositiveInt(value: unknown): value is PositiveInt {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

export function isSha256Hex(value: unknown): value is Sha256Hex {
  return typeof value === 'string' && SHA256_PATTERN.test(value);
}

export function isRfc3339Utc(value: unknown): value is Rfc3339Utc {
  if (typeof value !== 'string' || !RFC3339_UTC_PATTERN.test(value)) {
    return false;
  }
  const epoch = Date.parse(value);
  return Number.isFinite(epoch);
}

function isNullableRfc3339Utc(value: unknown): value is Rfc3339Utc | null {
  return value === null || isRfc3339Utc(value);
}

function isUuidValue(value: unknown): value is Uuid {
  return typeof value === 'string' && isUuid(value);
}

function isNullableUuid(value: unknown): value is Uuid | null {
  return value === null || isUuidValue(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validMeta(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schema_version',
      'message_id',
      'correlation_id',
      'causation_id',
      'occurred_at',
    ])
  ) {
    return false;
  }
  return (
    value.schema_version === 1 &&
    isUuidValue(value.message_id) &&
    isUuidValue(value.correlation_id) &&
    isNullableUuid(value.causation_id) &&
    isRfc3339Utc(value.occurred_at)
  );
}

function validPolicy(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'version_id',
      'semantic_version',
      'digest',
      'targeting_version_id',
      'targeting_state',
    ])
  ) {
    return false;
  }
  return (
    isUuidValue(value.version_id) &&
    isNonEmptyString(value.semantic_version) &&
    isSha256Hex(value.digest) &&
    isUuidValue(value.targeting_version_id) &&
    isOneOf(value.targeting_state, ['ACTIVE', 'PAUSED', 'DENY_ALL', 'ROLLED_BACK'] as const)
  );
}

function validActor(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'type',
      'id',
      'version',
      'authentication_context_id',
      'authenticated_at',
      'authentication_strength',
      'revocation_version',
    ])
  ) {
    return false;
  }
  return (
    isOneOf(value.type, ACTOR_TYPES) &&
    isNonEmptyString(value.id) &&
    isNullableNonEmptyString(value.version) &&
    isNullableUuid(value.authentication_context_id) &&
    isNullableRfc3339Utc(value.authenticated_at) &&
    isNullableNonEmptyString(value.authentication_strength) &&
    (value.revocation_version === null || isPositiveInt(value.revocation_version))
  );
}

function validCompany(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'status', 'founder_id'])) {
    return false;
  }
  return (
    isUuidValue(value.id) &&
    isOneOf(value.status, ['ACTIVE', 'DELETING', 'DELETED'] as const) &&
    isUuidValue(value.founder_id)
  );
}

function validRun(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'id',
      'state',
      'stage',
      'row_version',
      'workflow_version',
      'policy_version',
      'cancellation_requested_at',
      'operator_kill_version',
    ])
  ) {
    return false;
  }
  return (
    isUuidValue(value.id) &&
    isNonEmptyString(value.state) &&
    isOneOf(value.stage, RUN_STAGES) &&
    isPositiveInt(value.row_version) &&
    isNonEmptyString(value.workflow_version) &&
    isNonEmptyString(value.policy_version) &&
    isNullableRfc3339Utc(value.cancellation_requested_at) &&
    isPositiveInt(value.operator_kill_version)
  );
}

function validTask(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['id', 'state', 'row_version', 'employee_definition_id'])
  ) {
    return false;
  }
  return (
    isUuidValue(value.id) &&
    isNonEmptyString(value.state) &&
    isPositiveInt(value.row_version) &&
    isNullableUuid(value.employee_definition_id)
  );
}

function validAttempt(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['id', 'number', 'status', 'lease_token_digest', 'lease_expires_at'])
  ) {
    return false;
  }
  return (
    isUuidValue(value.id) &&
    isPositiveInt(value.number) &&
    isNonEmptyString(value.status) &&
    (value.lease_token_digest === null || isSha256Hex(value.lease_token_digest)) &&
    isNullableRfc3339Utc(value.lease_expires_at)
  );
}

function validAction(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, ['key', 'parameters_digest'])) {
    return false;
  }
  return isOneOf(value.key, POLICY_ACTION_KEYS) && isSha256Hex(value.parameters_digest);
}

function validResource(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['type', 'id', 'version', 'company_id', 'run_id', 'digest'])
  ) {
    return false;
  }
  return (
    isOneOf(value.type, RESOURCE_TYPES) &&
    isNonEmptyString(value.id) &&
    (isPositiveInt(value.version) || isNonEmptyString(value.version)) &&
    isUuidValue(value.company_id) &&
    isUuidValue(value.run_id) &&
    isSha256Hex(value.digest)
  );
}

function validGate(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'id',
      'gate_instance_id',
      'gate_instance_status',
      'gate_instance_row_version',
      'artifact_id',
      'artifact_version_id',
      'artifact_version',
      'artifact_checksum',
    ])
  ) {
    return false;
  }
  return (
    isOneOf(value.id, GATES) &&
    isUuidValue(value.gate_instance_id) &&
    isOneOf(value.gate_instance_status, [
      'PENDING',
      'APPROVED',
      'REVISION_REQUESTED',
      'CANCELED',
    ] as const) &&
    isPositiveInt(value.gate_instance_row_version) &&
    isUuidValue(value.artifact_id) &&
    isUuidValue(value.artifact_version_id) &&
    isPositiveInt(value.artifact_version) &&
    isSha256Hex(value.artifact_checksum)
  );
}

function validApprovalReferences(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        hasExactKeys(entry, ['approval_id', 'gate', 'artifact_version_id', 'decision']) &&
        isUuidValue(entry.approval_id) &&
        isOneOf(entry.gate, GATES) &&
        isUuidValue(entry.artifact_version_id) &&
        isOneOf(entry.decision, ['APPROVE', 'REQUEST_REVISION'] as const),
    )
  );
}

function validBudget(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (value.applicability === 'NOT_APPLICABLE') {
    return (
      hasExactKeys(value, ['applicability', 'policy_version', 'snapshot_digest']) &&
      isNonEmptyString(value.policy_version) &&
      isSha256Hex(value.snapshot_digest)
    );
  }
  if (value.applicability !== 'REQUIRED') {
    return false;
  }
  return (
    hasExactKeys(value, [
      'applicability',
      'policy_version',
      'ledger_row_version',
      'category',
      'hard_limit',
      'reserved',
      'consumed',
      'requested',
      'snapshot_digest',
    ]) &&
    isNonEmptyString(value.policy_version) &&
    isPositiveInt(value.ledger_row_version) &&
    isNonEmptyString(value.category) &&
    isFiniteNumber(value.hard_limit) &&
    isFiniteNumber(value.reserved) &&
    isFiniteNumber(value.consumed) &&
    isFiniteNumber(value.requested) &&
    value.hard_limit >= 0 &&
    value.reserved >= 0 &&
    value.consumed >= 0 &&
    value.requested >= 0 &&
    isSha256Hex(value.snapshot_digest)
  );
}

function validEnvironment(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'application_version',
      'deployment_environment',
      'provider',
      'tool_key',
      'tool_version',
      'network_mode',
      'digest',
    ])
  ) {
    return false;
  }
  return (
    isNonEmptyString(value.application_version) &&
    isOneOf(value.deployment_environment, ['LOCAL', 'TEST', 'STAGING', 'PRODUCTION'] as const) &&
    isNullableNonEmptyString(value.provider) &&
    isNullableNonEmptyString(value.tool_key) &&
    isNullableNonEmptyString(value.tool_version) &&
    isNullableNonEmptyString(value.network_mode) &&
    isSha256Hex(value.digest)
  );
}

export function validatePolicyInputV1(input: unknown): PolicyInputValidation {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      'meta',
      'policy_input_schema',
      'policy_request_id',
      'evaluation_time',
      'policy',
      'actor',
      'company',
      'run',
      'task',
      'attempt',
      'action',
      'resource',
      'gate',
      'approval_references',
      'budget',
      'environment',
    ]) ||
    input.policy_input_schema !== 'policy-input/v1' ||
    !validMeta(input.meta) ||
    !isUuidValue(input.policy_request_id) ||
    !isRfc3339Utc(input.evaluation_time) ||
    !validPolicy(input.policy) ||
    !validActor(input.actor) ||
    !validCompany(input.company) ||
    !validRun(input.run) ||
    !validTask(input.task) ||
    !validAttempt(input.attempt) ||
    !validAction(input.action) ||
    !validResource(input.resource) ||
    !validGate(input.gate) ||
    !validApprovalReferences(input.approval_references) ||
    !validBudget(input.budget) ||
    !validEnvironment(input.environment)
  ) {
    return { ok: false, reason_code: 'INVALID_CONTEXT' };
  }

  return { ok: true, value: input as unknown as PolicyInputV1 };
}

function normalizeCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeCanonicalJson);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeCanonicalJson(entry)]),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('Canonical JSON rejects non-finite numbers');
  }
  if (isRfc3339Utc(value)) {
    return new Date(value).toISOString();
  }
  return value;
}

export function contractDigest(value: unknown): Sha256Hex {
  return canonicalDigest(normalizeCanonicalJson(value));
}

export function policyInputDigest(input: PolicyInputV1): Sha256Hex {
  return contractDigest(input);
}

export function approvalReferencesDigest(
  references: PolicyInputV1['approval_references'],
): Sha256Hex {
  return contractDigest(references);
}

export function normalizedDecisionCommand(command: DecisionCommandV1): DecisionCommandV1 {
  return {
    ...command,
    decision:
      command.decision.type === 'APPROVE'
        ? {
            ...command.decision,
            feedback: command.decision.feedback === null ? null : command.decision.feedback.trim(),
          }
        : { ...command.decision, feedback: command.decision.feedback.trim() },
  };
}

export function decisionBusinessDigest(
  command: DecisionCommandV1,
  parsedIfMatch: PositiveInt,
): Sha256Hex {
  return contractDigest({
    command: normalizedDecisionCommand(command),
    if_match: parsedIfMatch,
  });
}

export function isAllowUsableAt(
  decision: PolicyDecisionV1,
  instant: Rfc3339Utc,
): decision is AllowPolicyDecisionV1 {
  if (decision.effect !== 'ALLOW' || !isRfc3339Utc(instant)) {
    return false;
  }
  return Date.parse(instant) < Date.parse(decision.expires_at);
}
