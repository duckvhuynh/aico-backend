import {
  approvalReferencesDigest,
  contractDigest,
  isRfc3339Utc,
  policyInputDigest,
  validatePolicyInputV1,
  type AllowPolicyDecisionV1,
  type DenyBindingV1,
  type DenyPolicyDecisionV1,
  type DenyReasonCode,
  type PolicyDecisionBaseV1,
  type PolicyDecisionV1,
  type PolicyInputV1,
  type Rfc3339Utc,
  type Sha256Hex,
  type Uuid,
} from './contracts';
import type { PolicyDecisionPort, PolicyEvaluationClock } from './policy-decision.port';

export interface DeterministicPolicyDecisionOptions {
  supportedPolicyVersions: readonly string[];
  allowTtlMs?: number;
}

const DEFAULT_ALLOW_TTL_MS = 30_000;
const TERMINAL_RUN_STATES = new Set(['BLOCKED', 'FAILED', 'CANCELED', 'COMPLETED']);

function deterministicUuid(seed: unknown): Uuid {
  const digest = contractDigest(seed);
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `8${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-');
}

function policyBase(
  input: PolicyInputV1 | null,
  inputDigest: Sha256Hex,
  issuedAt: Rfc3339Utc,
): PolicyDecisionBaseV1 {
  const decisionId = deterministicUuid({
    kind: 'policy-decision/v1',
    input_digest: inputDigest,
    issued_at: issuedAt,
  });
  const fallbackPolicyId = deterministicUuid({
    kind: 'unsupported-policy-version',
    input_digest: inputDigest,
  });
  const fallbackTargetingId = deterministicUuid({
    kind: 'unsupported-policy-targeting',
    input_digest: inputDigest,
  });

  return {
    meta: {
      schema_version: 1,
      message_id: decisionId,
      correlation_id:
        input?.meta.correlation_id ??
        deterministicUuid({ kind: 'redacted-correlation', inputDigest }),
      causation_id: input?.meta.message_id ?? null,
      occurred_at: issuedAt,
    },
    policy_decision_schema: 'policy-decision/v1',
    policy_decision_id: decisionId,
    policy_request_id:
      input?.policy_request_id ??
      deterministicUuid({ kind: 'redacted-policy-request', inputDigest }),
    policy_input_digest: inputDigest,
    policy_version_id: input?.policy.version_id ?? fallbackPolicyId,
    policy_version: input?.policy.semantic_version ?? 'unsupported',
    policy_digest: input?.policy.digest ?? contractDigest({ kind: 'redacted-policy' }),
    policy_targeting_version_id: input?.policy.targeting_version_id ?? fallbackTargetingId,
  };
}

function redactedBinding(input: PolicyInputV1 | null): DenyBindingV1 {
  if (input === null) {
    return {
      actor_type: null,
      actor_version: null,
      company_id: null,
      action_class: 'UNKNOWN',
      resource_class: 'UNKNOWN',
      supplied_reference_digest: null,
    };
  }

  const tenantMatches = input.resource.company_id === input.company.id;
  const runMatches = tenantMatches && input.resource.run_id === input.run.id;
  return {
    actor_type: input.actor.type,
    actor_version: input.actor.version,
    company_id: input.company.id,
    action_class: input.action.key,
    resource_class: input.resource.type,
    supplied_reference_digest: contractDigest({
      action_class: input.action.key,
      resource_class: input.resource.type,
      tenant_matches: tenantMatches,
      run_matches: runMatches,
    }),
    ...(runMatches ? { run_id: input.run.id } : {}),
    ...(runMatches && input.task !== null ? { task_id: input.task.id } : {}),
    ...(runMatches && input.attempt !== null ? { attempt_id: input.attempt.id } : {}),
  };
}

export class DeterministicPolicyDecisionService implements PolicyDecisionPort {
  private readonly allowTtlMs: number;
  private readonly supportedPolicyVersions: ReadonlySet<string>;

  constructor(
    private readonly clock: PolicyEvaluationClock,
    options: DeterministicPolicyDecisionOptions,
  ) {
    const allowTtlMs = options.allowTtlMs ?? DEFAULT_ALLOW_TTL_MS;
    if (!Number.isSafeInteger(allowTtlMs) || allowTtlMs <= 0) {
      throw new TypeError('allowTtlMs must be a positive safe integer');
    }
    this.allowTtlMs = allowTtlMs;
    this.supportedPolicyVersions = new Set(options.supportedPolicyVersions);
  }

  evaluate(candidate: unknown): PolicyDecisionV1 {
    const issuedAt = this.clock.now();
    if (!isRfc3339Utc(issuedAt)) {
      throw new TypeError('PolicyEvaluationClock must return RFC 3339 UTC');
    }

    const validation = validatePolicyInputV1(candidate);
    if (!validation.ok) {
      const safeInputDigest = contractDigest({
        policy_input_schema: 'invalid-or-unsupported',
      });
      return this.deny(null, safeInputDigest, issuedAt, 'INVALID_CONTEXT');
    }

    const input = validation.value;
    const inputDigest = policyInputDigest(input);
    const normalizedEvaluationTime = new Date(input.evaluation_time).toISOString();
    const normalizedIssuedAt = new Date(issuedAt).toISOString();
    if (normalizedEvaluationTime !== normalizedIssuedAt) {
      return this.deny(input, inputDigest, issuedAt, 'INVALID_CONTEXT');
    }

    const reason = this.denialReason(input);
    if (reason !== null) {
      return this.deny(input, inputDigest, issuedAt, reason);
    }
    return this.allow(input, inputDigest, issuedAt);
  }

  private denialReason(input: PolicyInputV1): DenyReasonCode | null {
    if (
      input.policy.targeting_state !== 'ACTIVE' ||
      !this.supportedPolicyVersions.has(input.policy.semantic_version)
    ) {
      return 'POLICY_VERSION_UNSUPPORTED';
    }

    if (
      input.actor.version === null ||
      input.actor.authentication_context_id === null ||
      input.actor.authenticated_at === null ||
      input.actor.authentication_strength === null ||
      input.actor.revocation_version === null
    ) {
      return 'AUTHENTICATION_REQUIRED';
    }

    if (
      input.actor.type !== 'FOUNDER' ||
      input.company.status !== 'ACTIVE' ||
      input.actor.id !== input.company.founder_id
    ) {
      return 'ROLE_FORBIDDEN';
    }

    if (input.resource.company_id !== input.company.id) {
      return 'TENANT_MISMATCH';
    }
    if (input.run.cancellation_requested_at !== null) {
      return 'RUN_CANCELED';
    }
    if (TERMINAL_RUN_STATES.has(input.run.state)) {
      return 'RUN_TERMINAL';
    }

    if (
      input.action.key !== 'gate.gate-01.approve/v1' &&
      input.action.key !== 'gate.gate-01.request-revision/v1'
    ) {
      return 'POLICY_VERSION_UNSUPPORTED';
    }
    if (
      input.run.state !== 'AWAITING_BRIEF_APPROVAL' ||
      input.run.stage !== 'PRODUCT' ||
      input.gate?.id !== 'GATE-01' ||
      input.gate.gate_instance_status !== 'PENDING'
    ) {
      return 'WRONG_STAGE';
    }
    if (
      input.resource.run_id !== input.run.id ||
      input.resource.type !== 'GATE_INSTANCE' ||
      input.resource.id !== input.gate.gate_instance_id
    ) {
      return 'RESOURCE_OUT_OF_SCOPE';
    }
    if (String(input.resource.version) !== String(input.gate.gate_instance_row_version)) {
      return 'STALE_VERSION';
    }
    if (input.task !== null || input.attempt !== null) {
      return 'INVALID_CONTEXT';
    }
    if (
      input.budget.applicability !== 'NOT_APPLICABLE' ||
      input.budget.policy_version !== input.policy.semantic_version
    ) {
      return 'BUDGET_UNAVAILABLE';
    }
    if (
      input.environment.provider !== null ||
      input.environment.tool_key !== null ||
      input.environment.tool_version !== null ||
      input.environment.network_mode !== null
    ) {
      return 'ENVIRONMENT_UNSAFE';
    }
    return null;
  }

  private allow(
    input: PolicyInputV1,
    inputDigest: Sha256Hex,
    issuedAt: Rfc3339Utc,
  ): AllowPolicyDecisionV1 {
    return {
      ...policyBase(input, inputDigest, issuedAt),
      effect: 'ALLOW',
      reason_code: 'ACTION_ALLOWED',
      binding: {
        actor_type: input.actor.type,
        actor_id: input.actor.id,
        actor_version: input.actor.version as string,
        company_id: input.company.id,
        run_id: input.run.id,
        task_id: input.task?.id ?? null,
        attempt_id: input.attempt?.id ?? null,
        action: input.action.key,
        parameters_digest: input.action.parameters_digest,
        resource_type: input.resource.type,
        resource_id: input.resource.id,
        resource_version: input.resource.version,
        resource_digest: input.resource.digest,
        run_state: input.run.state,
        run_stage: input.run.stage,
        run_row_version: input.run.row_version,
        task_state: input.task?.state ?? null,
        gate: input.gate?.id ?? null,
        gate_instance_id: input.gate?.gate_instance_id ?? null,
        gate_instance_row_version: input.gate?.gate_instance_row_version ?? null,
        artifact_version_id: input.gate?.artifact_version_id ?? null,
        approval_references_digest: approvalReferencesDigest(input.approval_references),
        budget_digest: input.budget.snapshot_digest,
        environment_digest: input.environment.digest,
        workflow_version: input.run.workflow_version,
        policy_targeting_version_id: input.policy.targeting_version_id,
        maximum_uses: 1,
      },
      issued_at: issuedAt,
      expires_at: new Date(Date.parse(issuedAt) + this.allowTtlMs).toISOString(),
    };
  }

  private deny(
    input: PolicyInputV1 | null,
    inputDigest: Sha256Hex,
    issuedAt: Rfc3339Utc,
    reasonCode: DenyReasonCode,
  ): DenyPolicyDecisionV1 {
    return {
      ...policyBase(input, inputDigest, issuedAt),
      effect: 'DENY',
      reason_code: reasonCode,
      binding: redactedBinding(input),
      issued_at: issuedAt,
      expires_at: null,
      maximum_uses: 0,
    };
  }
}
