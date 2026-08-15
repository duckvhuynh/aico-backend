import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  canonicalDigest,
  repairReservationSetsDigest,
  repairSemanticReceiptDigest,
  repairValidationSubjectDigest,
  type A5FixtureId,
  type A5ScenarioId,
  type FailureClassification,
  type ModelProviderConfigurationV1,
  type ModelProviderInvocationRequestV1,
  type ModelProviderInvocationResultV1,
  type ModelProviderRepairRequestV1,
  type ModelProviderTargetDecisionV1,
  type RetryGuidance,
} from './contracts';

const examplesRoot = resolve(process.cwd(), 'docs/contracts/examples');

function readExample<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(examplesRoot, name), 'utf8')) as T;
}

export class FrozenProofClock {
  private current: number;

  constructor(initial = '2026-08-15T04:02:00Z') {
    this.current = Date.parse(initial);
    if (!Number.isFinite(this.current)) throw new Error('AICO005_PROOF_INVALID_CLOCK');
  }

  now(): Date {
    return new Date(this.current);
  }

  nowIso(): string {
    return this.now().toISOString().replace('.000Z', 'Z');
  }

  advanceBy(milliseconds: number): void {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
      throw new Error('AICO005_PROOF_INVALID_CLOCK_ADVANCE');
    }
    this.current += milliseconds;
  }

  advanceTo(timestamp: string): void {
    const target = Date.parse(timestamp);
    if (!Number.isFinite(target) || target < this.current) {
      throw new Error('AICO005_PROOF_INVALID_CLOCK_TARGET');
    }
    this.current = target;
  }
}

export const A5_CANARIES = Object.freeze({
  apiKey: 'sk-aico005-fixture-secret-never-forward',
  credential: 'AICO005_CREDENTIAL_CANARY',
  transcript: 'AICO005_ARBITRARY_TRANSCRIPT_CANARY',
  rawExchange: 'AICO005_RAW_PROMPT_COMPLETION_CANARY',
  hiddenReasoning: 'AICO005_HIDDEN_REASONING_CANARY',
  providerErrorBody: 'AICO005_PROVIDER_ERROR_BODY_CANARY',
  foreignCompany: 'AICO005_FOREIGN_COMPANY_CONTENT_CANARY',
});

export const A5_CANARY_VALUES = Object.freeze(Object.values(A5_CANARIES));

export const PRODUCT_BRIEF_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['fixture_status', 'summary'],
  properties: {
    fixture_status: { const: 'complete' },
    summary: { type: 'string', minLength: 1, maxLength: 100_000 },
  },
});

export interface ProofFixture {
  readonly fixtureId: A5FixtureId;
  readonly clock: FrozenProofClock;
  readonly request: ModelProviderInvocationRequestV1;
  readonly result: ModelProviderInvocationResultV1;
  readonly configuration: ModelProviderConfigurationV1;
  readonly targetDecision: ModelProviderTargetDecisionV1;
  readonly alternateConfiguration: ModelProviderConfigurationV1;
  readonly alternateTargetDecision: ModelProviderTargetDecisionV1;
  readonly repairRequest: ModelProviderRepairRequestV1;
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly unsafeContext: Readonly<Record<string, unknown>>;
}

export function refreshRepairIntegrity(repair: ModelProviderRepairRequestV1): void {
  const mutable = repair as unknown as Record<string, unknown>;
  mutable.diagnostics_digest = canonicalDigest(repair.safe_validation_diagnostics);
  const receipt = repair.semantic_validation_receipt as Record<string, unknown>;
  receipt.validated_repair_request_digest = repairValidationSubjectDigest(repair);
  receipt.reservation_sets_digest = repairReservationSetsDigest(repair);
  receipt.receipt_digest = repairSemanticReceiptDigest(receipt);
}

function bindRepairToFailure(
  repair: ModelProviderRepairRequestV1,
  request: ModelProviderInvocationRequestV1,
  result: ModelProviderInvocationResultV1,
): void {
  const mutable = repair as unknown as Record<string, unknown>;
  const resultDigest = canonicalDigest(result);
  const candidate = result.candidate_output;
  const outputDigest =
    candidate !== null && typeof candidate.content_digest === 'string'
      ? candidate.content_digest
      : canonicalDigest(null);
  const reservationIds = request.budget_reservations.map((reservation) =>
    String(reservation.reservation_id),
  );
  mutable.failed_invocation_id = request.invocation_id;
  mutable.failed_result_digest = resultDigest;
  mutable.failed_output_digest = outputDigest;
  mutable.original_context_manifest = structuredClone(request.context_manifest);
  mutable.original_reservation_ids = reservationIds;

  const invocation = repair.repair_invocation as Record<string, unknown>;
  invocation.provider_configuration_ref = structuredClone(request.versions.provider_configuration);
  invocation.context_manifest = structuredClone(request.context_manifest);
  invocation.repair_linkage = {
    original_invocation_id: request.invocation_id,
    original_result_digest: resultDigest,
    repair_ordinal: repair.repair_ordinal,
    repair_cap: repair.repair_cap,
    separate_invocation_and_reservation: repair.separate_invocation_and_reservation,
  };
  refreshRepairIntegrity(repair);
}

const RESULT_IDS = {
  success: '40000000-0000-4000-8000-000000000010',
  failure: '49000000-0000-4000-8000-000000000010',
  timeout: '49000000-0000-4000-8000-000000000011',
};

function clonedRequest(): ModelProviderInvocationRequestV1 {
  const request = readExample<ModelProviderInvocationRequestV1>(
    'model-provider-invocation-request.valid.json',
  );
  const mutable = request as unknown as Record<string, unknown>;
  const outputDigest = canonicalDigest(PRODUCT_BRIEF_OUTPUT_SCHEMA);
  const outputRef = request.versions.output_schema;
  if (outputRef === null) throw new Error('AICO005_PROOF_OUTPUT_SCHEMA_REF_MISSING');
  mutable.versions = {
    ...request.versions,
    output_schema: { ...outputRef, content_digest: outputDigest },
  };
  mutable.output_schema = {
    ...request.output_schema,
    schema_ref: { ...outputRef, content_digest: outputDigest },
    canonical_schema_digest: outputDigest,
    maximum_serialized_bytes: 65_536,
  };
  return request;
}

function successfulResult(
  request: ModelProviderInvocationRequestV1,
  candidate: unknown,
  redacted = false,
): ModelProviderInvocationResultV1 {
  const result = readExample<ModelProviderInvocationResultV1>(
    'model-provider-invocation-result.success.valid.json',
  );
  const mutable = result as unknown as Record<string, unknown>;
  const canonical = typeof candidate === 'string' ? candidate : JSON.stringify(candidate);
  const schemaRef = request.versions.output_schema;
  if (schemaRef === null) throw new Error('AICO005_PROOF_OUTPUT_SCHEMA_REF_MISSING');
  mutable.request_digest = request.request_digest;
  mutable.company_id = request.company_id;
  mutable.run_id = request.run_id;
  mutable.task_id = request.task_id;
  mutable.attempt_id = request.attempt_id;
  mutable.invocation_id = request.invocation_id;
  mutable.provider_configuration_ref = request.versions.provider_configuration as NonNullable<
    typeof request.versions.provider_configuration
  >;
  mutable.candidate_output = {
    ...(result.candidate_output ?? {}),
    schema_ref: schemaRef,
    canonical_json: canonical,
    content_digest: canonicalDigest(candidate),
    trust: 'UNTRUSTED_CANDIDATE',
    state_authority: 'NONE',
    artifact_authority: 'NONE',
    tool_authority: 'NONE',
  };
  mutable.redaction = {
    ...(result.redaction as Record<string, unknown>),
    input_digest: canonicalDigest(candidate),
    output_digest: canonicalDigest(candidate),
  };
  mutable.validation = {
    ...result.validation,
    validated_schema_ref: schemaRef,
  };
  if (redacted) {
    mutable.safety = {
      ...(result.safety as Record<string, unknown>),
      outcome: 'REDACTED',
      reason_codes: ['FIXTURE_REDACTED'],
    };
    mutable.redaction = {
      ...(result.redaction as Record<string, unknown>),
      outcome: 'REDACTED',
      reason_codes: ['FIXTURE_REDACTED'],
      redacted_field_paths: ['/summary'],
    };
  }
  return result;
}

function failureResult(
  request: ModelProviderInvocationRequestV1,
  classification: FailureClassification,
  options: {
    status?: 'FAILED' | 'CANCELED' | 'UNKNOWN';
    dispatch?: 'NOT_DISPATCHED' | 'DISPATCHED' | 'UNCERTAIN';
    retryGuidance?: RetryGuidance;
    retryable?: boolean;
    retryAfter?: string | null;
    reconcile?: boolean;
    action?: string;
    finish?: string;
    safety?: 'PASS' | 'REDACTED' | 'BLOCKED' | 'UNKNOWN';
    reason?: string;
  } = {},
): ModelProviderInvocationResultV1 {
  const result = readExample<ModelProviderInvocationResultV1>(
    'model-provider-invocation-result.unavailable.valid.json',
  );
  const mutable = result as unknown as Record<string, unknown>;
  const status = options.status ?? 'FAILED';
  const dispatch = options.dispatch ?? 'NOT_DISPATCHED';
  const reconciliationRequired = options.reconcile ?? false;
  mutable.result_id = status === 'UNKNOWN' ? RESULT_IDS.timeout : RESULT_IDS.failure;
  mutable.request_digest = request.request_digest;
  mutable.company_id = request.company_id;
  mutable.run_id = request.run_id;
  mutable.task_id = request.task_id;
  mutable.attempt_id = request.attempt_id;
  mutable.invocation_id = request.invocation_id;
  mutable.status = status;
  mutable.candidate_output = null;
  mutable.provider_configuration_ref = request.versions.provider_configuration as NonNullable<
    typeof request.versions.provider_configuration
  >;
  mutable.validation = {
    ...result.validation,
    validated_schema_ref: request.versions.output_schema,
  };
  mutable.finish_reason =
    options.finish ??
    (status === 'CANCELED' ? 'CANCELED' : status === 'UNKNOWN' ? 'TIMEOUT' : 'ERROR');
  mutable.safety = {
    ...(result.safety as Record<string, unknown>),
    outcome: options.safety ?? 'UNKNOWN',
    reason_codes: [options.reason ?? classification],
  };
  mutable.failure = {
    ...(result.failure ?? {}),
    failure_id: '49000000-0000-4000-8000-000000000020',
    classification,
    reason_code: options.reason ?? classification,
    safe_message: 'The deterministic proof produced a bounded classified outcome.',
    dispatch_phase: dispatch,
    retry_guidance: options.retryGuidance ?? 'NO_RETRY',
    retryable: options.retryable ?? false,
    retry_after: options.retryAfter ?? null,
    reconciliation_required: reconciliationRequired,
    reconciliation_action: options.action ?? 'NONE',
    provider_safe_code: null,
    diagnostic_ref: null,
  };
  return result;
}

function resultForFixture(
  fixtureId: A5FixtureId,
  request: ModelProviderInvocationRequestV1,
  scenarioId?: A5ScenarioId,
): ModelProviderInvocationResultV1 {
  switch (fixtureId) {
    case 'A5-FX-01':
      return successfulResult(request, { fixture_status: 'complete', summary: 'bounded fixture' });
    case 'A5-FX-02': {
      if (scenarioId === 'A5-S-MALFORMED-JSON') {
        return successfulResult(request, '{"fixture_status":"complete"');
      }
      if (scenarioId === 'A5-S-MALFORMED-UNKNOWN') {
        return successfulResult(request, {
          fixture_status: 'complete',
          summary: 'bounded fixture',
          unexpected: true,
        });
      }
      if (scenarioId === 'A5-S-MALFORMED-TYPE') {
        return successfulResult(request, { fixture_status: 'complete', summary: 7 });
      }
      if (scenarioId === 'A5-S-MALFORMED-ENUM') {
        return successfulResult(request, { fixture_status: 'partial', summary: 'bounded fixture' });
      }
      if (scenarioId === 'A5-S-MALFORMED-OVERSIZE') {
        return successfulResult(request, {
          fixture_status: 'complete',
          summary: 'x'.repeat(66_000),
        });
      }
      return successfulResult(request, { fixture_status: 'complete' });
    }
    case 'A5-FX-03':
      return successfulResult(request, {
        fixture_status: 'complete',
        summary: 'semantic-deny',
      });
    case 'A5-FX-04':
      return successfulResult(request, { fixture_status: 'complete' });
    case 'A5-FX-05':
      return failureResult(request, 'RATE_LIMITED', {
        dispatch: 'DISPATCHED',
        retryGuidance: 'PERSISTED_RETRY_SCHEDULE',
        retryable: true,
        retryAfter: '2026-08-15T04:02:02Z',
        reason: 'RATE_LIMITED',
      });
    case 'A5-FX-06':
      return failureResult(request, 'POST_DISPATCH_TIMEOUT_UNKNOWN', {
        status: 'UNKNOWN',
        dispatch: 'DISPATCHED',
        retryGuidance: 'RECONCILE_BEFORE_DECISION',
        reconcile: true,
        action: 'LOOKUP_STATUS',
        finish: 'TIMEOUT',
        reason: 'POST_DISPATCH_TIMEOUT',
      });
    case 'A5-FX-07':
      return successfulResult(request, { fixture_status: 'complete', summary: 'late fixture' });
    case 'A5-FX-08':
      if (scenarioId === 'A5-S-SAFETY-REDACTED') {
        return successfulResult(
          request,
          { fixture_status: 'complete', summary: '[REDACTED]' },
          true,
        );
      }
      if (scenarioId === 'A5-S-SAFETY-UNCERTAIN') {
        return failureResult(request, 'INTEGRITY', {
          status: 'UNKNOWN',
          dispatch: 'UNCERTAIN',
          retryGuidance: 'BLOCKED_OWNER_DECISION',
          reconcile: true,
          action: 'QUARANTINE_AND_OWNER_DECISION',
          finish: 'UNKNOWN',
          safety: 'UNKNOWN',
          reason: 'REDACTION_UNCERTAIN',
        });
      }
      return failureResult(request, 'REFUSAL_SAFETY', {
        dispatch: 'DISPATCHED',
        finish: scenarioId === 'A5-S-SAFETY-REFUSAL' ? 'REFUSAL' : 'SAFETY',
        safety: 'BLOCKED',
        reason: scenarioId === 'A5-S-SAFETY-REFUSAL' ? 'PROVIDER_REFUSAL' : 'SAFETY_BLOCK',
      });
    case 'A5-FX-09':
      return failureResult(request, 'INTEGRITY', {
        status: 'UNKNOWN',
        dispatch: 'UNCERTAIN',
        retryGuidance: 'BLOCKED_OWNER_DECISION',
        reconcile: true,
        action: 'QUARANTINE_AND_OWNER_DECISION',
        finish: 'UNKNOWN',
        reason: 'SANITIZATION_UNCERTAIN',
      });
    case 'A5-FX-10':
      if (scenarioId === 'A5-S-META-FAILURE') {
        return failureResult(request, 'TERMINAL_PROVIDER', {
          dispatch: 'DISPATCHED',
          reason: 'TERMINAL_PROVIDER',
        });
      }
      if (scenarioId === 'A5-S-META-CANCELED') {
        return failureResult(request, 'CANCELED', {
          status: 'CANCELED',
          dispatch: 'DISPATCHED',
          finish: 'CANCELED',
          reconcile: true,
          action: 'CANCEL_OR_LOOKUP',
          reason: 'CANCELED',
        });
      }
      if (scenarioId === 'A5-S-META-UNKNOWN' || scenarioId === 'A5-S-REPLAY-UNKNOWN') {
        return failureResult(request, 'POST_DISPATCH_TIMEOUT_UNKNOWN', {
          status: 'UNKNOWN',
          dispatch: 'DISPATCHED',
          retryGuidance: 'RECONCILE_BEFORE_DECISION',
          reconcile: true,
          action: 'LOOKUP_STATUS',
          finish: 'TIMEOUT',
          reason: 'POST_DISPATCH_TIMEOUT',
        });
      }
      return successfulResult(request, { fixture_status: 'complete', summary: 'bounded fixture' });
    case 'A5-FX-11':
    case 'A5-FX-12':
      return successfulResult(request, { fixture_status: 'complete', summary: 'bounded fixture' });
    case 'A5-FX-13':
    case 'A5-FX-14':
      return failureResult(request, 'CONFIGURATION', {
        dispatch: 'NOT_DISPATCHED',
        reason: 'FIXTURE_OR_BINDING_INVALID',
      });
    case 'A5-FX-15':
      return failureResult(request, 'CONFIGURATION', {
        dispatch: 'NOT_DISPATCHED',
        reason: 'DEPLOYED_PROVIDER_FORBIDDEN',
      });
    default:
      return failureResult(request, 'POST_DISPATCH_TIMEOUT_UNKNOWN', {
        status: 'UNKNOWN',
        dispatch: 'DISPATCHED',
        retryGuidance: 'RECONCILE_BEFORE_DECISION',
        reconcile: true,
        action: 'LOOKUP_STATUS',
        finish: 'TIMEOUT',
        reason: 'POST_DISPATCH_TIMEOUT',
      });
  }
}

function alternateConfiguration(
  configuration: ModelProviderConfigurationV1,
): ModelProviderConfigurationV1 {
  const next = structuredClone(configuration) as Record<string, unknown>;
  const ref = structuredClone(next.configuration_ref) as Record<string, unknown>;
  ref.id = '10000000-0000-4000-8000-000000000020';
  ref.logical_key = 'provider.local-fixture-v2';
  ref.semantic_version = '2.0.0';
  ref.content_digest = `sha256:${'e'.repeat(64)}`;
  next.configuration_ref = ref;
  next.configuration_digest = ref.content_digest;
  next.model_key = 'fixture-model-v2';
  next.model_revision = 'fixture-v2';
  return next;
}

function alternateTarget(
  target: ModelProviderTargetDecisionV1,
  configuration: ModelProviderConfigurationV1,
): ModelProviderTargetDecisionV1 {
  const next = structuredClone(target) as Record<string, unknown>;
  next.decision_id = '50000000-0000-4000-8000-000000000020';
  next.decision_digest = `sha256:${'6'.repeat(64)}`;
  next.selected_configuration_ref = configuration.configuration_ref;
  next.previous_configuration_ref = target.selected_configuration_ref;
  next.resolved_target = {
    provider_key: 'DETERMINISTIC_FIXTURE',
    execution_mode: 'DETERMINISTIC_ONLY',
    model_key: 'fixture-model-v2',
    model_revision: 'fixture-v2',
    target_digest: `sha256:${'7'.repeat(64)}`,
  };
  return next;
}

export function createProofFixture(
  fixtureId: A5FixtureId = 'A5-FX-01',
  scenarioId?: A5ScenarioId,
): ProofFixture {
  const clock = new FrozenProofClock();
  const request = clonedRequest();
  const configuration = readExample<ModelProviderConfigurationV1>(
    'model-provider-configuration.deterministic.valid.json',
  );
  const targetDecision = readExample<ModelProviderTargetDecisionV1>(
    'model-provider-target-decision.valid.json',
  );
  const mutableTarget = targetDecision as unknown as Record<string, unknown>;
  mutableTarget.decision_id = request.target_decision_id;
  mutableTarget.decision_digest = request.target_decision_digest;
  mutableTarget.selected_configuration_ref = request.versions.provider_configuration;
  mutableTarget.resolved_target = {
    ...(targetDecision.resolved_target as Record<string, unknown>),
    target_digest: request.execution_guard.resolved_target_digest,
  };
  const nextConfiguration = alternateConfiguration(configuration);
  const nextTarget = alternateTarget(targetDecision, nextConfiguration);
  const repairRequest = readExample<ModelProviderRepairRequestV1>(
    'model-provider-repair-request.valid.json',
  );
  const result = resultForFixture(fixtureId, request, scenarioId);
  bindRepairToFailure(repairRequest, request, result);

  return {
    fixtureId,
    clock,
    request,
    result,
    configuration,
    targetDecision,
    alternateConfiguration: nextConfiguration,
    alternateTargetDecision: nextTarget,
    repairRequest,
    outputSchema: PRODUCT_BRIEF_OUTPUT_SCHEMA,
    unsafeContext: {
      allowed: { fixture_status: 'complete', summary: 'bounded fixture' },
      prohibited: A5_CANARIES,
    },
  };
}

export function resultWithRequest(
  result: ModelProviderInvocationResultV1,
  request: ModelProviderInvocationRequestV1,
): ModelProviderInvocationResultV1 {
  const next = structuredClone(result);
  const mutable = next as unknown as Record<string, unknown>;
  mutable.request_digest = request.request_digest;
  mutable.company_id = request.company_id;
  mutable.run_id = request.run_id;
  mutable.task_id = request.task_id;
  mutable.attempt_id = request.attempt_id;
  mutable.invocation_id = request.invocation_id;
  mutable.provider_configuration_ref = request.versions.provider_configuration as NonNullable<
    typeof request.versions.provider_configuration
  >;
  return next;
}
