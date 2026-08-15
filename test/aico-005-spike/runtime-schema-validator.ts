import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import {
  DEFAULT_A5_PROOF_CONTROLS,
  assertProof,
  canonicalDigest,
  canonicalJson,
  repairReservationSetsDigest,
  repairSemanticReceiptDigest,
  repairValidationSubjectDigest,
  type ModelProviderConfigurationV1,
  type ModelProviderInvocationRequestV1,
  type ModelProviderInvocationResultV1,
  type ModelProviderRepairRequestV1,
  type ModelProviderTargetDecisionV1,
  type ProofControls,
  type VersionReference,
} from './contracts';

export interface SafeValidationDiagnostic {
  readonly code: string;
  readonly instance_path: string;
  readonly schema_path: string;
  readonly keyword: string;
  readonly expected_class:
    | 'TYPE'
    | 'REQUIRED'
    | 'ENUM'
    | 'FORMAT'
    | 'BOUND'
    | 'SEMANTIC'
    | 'UNKNOWN_FIELD';
}

export interface CandidateValidationResult {
  readonly valid: boolean;
  readonly parsed: Readonly<Record<string, unknown>> | null;
  readonly diagnostics: readonly SafeValidationDiagnostic[];
  readonly diagnosticsDigest: string;
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function diagnosticClass(error: ErrorObject): SafeValidationDiagnostic['expected_class'] {
  switch (error.keyword) {
    case 'type':
      return 'TYPE';
    case 'required':
      return 'REQUIRED';
    case 'enum':
    case 'const':
      return 'ENUM';
    case 'format':
    case 'pattern':
      return 'FORMAT';
    case 'additionalProperties':
      return 'UNKNOWN_FIELD';
    default:
      return 'BOUND';
  }
}

function safeDiagnostics(
  errors: readonly ErrorObject[] | null | undefined,
): SafeValidationDiagnostic[] {
  return (errors ?? []).slice(0, 32).map((error) => ({
    code: `SCHEMA_${error.keyword.toUpperCase()}`,
    instance_path: error.instancePath.slice(0, 240),
    schema_path: error.schemaPath.slice(0, 240),
    keyword: error.keyword.slice(0, 80),
    expected_class: diagnosticClass(error),
  }));
}

function ref(value: unknown): VersionReference {
  assertProof(value !== null && typeof value === 'object' && !Array.isArray(value), 'REFERENCE');
  return value as VersionReference;
}

export class ProviderRuntimeSchemaValidator {
  private readonly wire: ValidateFunction;
  private readonly output: ValidateFunction;
  private readonly outputSchemaDigest: string;

  constructor(
    outputSchema: Readonly<Record<string, unknown>>,
    private readonly controls: Readonly<ProofControls> = DEFAULT_A5_PROOF_CONTROLS,
  ) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const wireSchema = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'docs/contracts/schemas/model-provider-runtime.v1.schema.json'),
        'utf8',
      ),
    ) as object;
    this.wire = ajv.compile(wireSchema);
    this.output = ajv.compile(outputSchema);
    this.outputSchemaDigest = canonicalDigest(outputSchema);
  }

  validateEnvelope(value: unknown): readonly SafeValidationDiagnostic[] {
    if (!this.controls.dtoAllowlist) return [];
    return this.wire(value) ? [] : safeDiagnostics(this.wire.errors);
  }

  assertRequestBindings(
    request: ModelProviderInvocationRequestV1,
    configuration: ModelProviderConfigurationV1,
    target: ModelProviderTargetDecisionV1,
  ): void {
    assertProof(this.validateEnvelope(request).length === 0, 'REQUEST_WIRE_SCHEMA');
    assertProof(this.validateEnvelope(configuration).length === 0, 'CONFIGURATION_WIRE_SCHEMA');
    assertProof(this.validateEnvelope(target).length === 0, 'TARGET_WIRE_SCHEMA');
    if (!this.controls.exactRequestTargetBinding) return;

    const configurationRef = ref(configuration.configuration_ref);
    const requestConfiguration = ref(request.versions.provider_configuration);
    const requestSchema = ref(request.versions.output_schema);
    const declaredSchema = ref(request.output_schema.schema_ref);
    const guard = request.execution_guard as Record<string, unknown>;
    const resolvedTarget = target.resolved_target as Record<string, unknown>;
    assertProof(
      configuration.configuration_digest === configurationRef.content_digest,
      'CONFIGURATION_DIGEST_BINDING',
    );
    assertProof(sameValue(requestConfiguration, configurationRef), 'REQUEST_CONFIGURATION_BINDING');
    assertProof(sameValue(requestSchema, declaredSchema), 'REQUEST_SCHEMA_REF_BINDING');
    assertProof(requestSchema.content_digest === this.outputSchemaDigest, 'REQUEST_SCHEMA_DIGEST');
    assertProof(
      request.output_schema.canonical_schema_digest === this.outputSchemaDigest,
      'REQUEST_CANONICAL_SCHEMA_DIGEST',
    );
    assertProof(
      sameValue(guard.configuration_ref, requestConfiguration),
      'EXECUTION_GUARD_CONFIGURATION_BINDING',
    );
    assertProof(request.target_decision_id === target.decision_id, 'TARGET_ID_BINDING');
    assertProof(request.target_decision_digest === target.decision_digest, 'TARGET_DIGEST_BINDING');
    assertProof(guard.target_decision_id === request.target_decision_id, 'GUARD_TARGET_ID_BINDING');
    assertProof(
      guard.target_decision_digest === request.target_decision_digest,
      'GUARD_TARGET_DIGEST_BINDING',
    );
    assertProof(
      sameValue(target.selected_configuration_ref, configurationRef),
      'TARGET_CONFIGURATION_BINDING',
    );
    assertProof(guard.provider_key === configuration.provider_key, 'GUARD_PROVIDER_BINDING');
    assertProof(guard.adapter_kind === configuration.adapter_kind, 'GUARD_ADAPTER_BINDING');
    assertProof(guard.execution_mode === configuration.execution_mode, 'GUARD_MODE_BINDING');
    assertProof(
      guard.resolved_target_digest === resolvedTarget.target_digest,
      'GUARD_RESOLVED_TARGET_BINDING',
    );
    for (const field of [
      'provider_key',
      'execution_mode',
      'model_key',
      'model_revision',
    ] as const) {
      assertProof(resolvedTarget[field] === configuration[field], `TARGET_${field.toUpperCase()}`);
    }
  }

  assertResultBindings(
    request: ModelProviderInvocationRequestV1,
    result: ModelProviderInvocationResultV1,
    configuration: ModelProviderConfigurationV1,
  ): void {
    const wireErrors = this.validateEnvelope(result);
    assertProof(wireErrors.length === 0, 'RESULT_WIRE_SCHEMA');

    if (this.controls.exactRequestTargetBinding) {
      assertProof(result.request_digest === request.request_digest, 'RESULT_REQUEST_DIGEST');
      assertProof(result.invocation_id === request.invocation_id, 'RESULT_INVOCATION_ID');
      for (const identity of ['company_id', 'run_id', 'task_id', 'attempt_id'] as const) {
        assertProof(result[identity] === request[identity], `RESULT_${identity.toUpperCase()}`);
      }
      assertProof(
        sameValue(result.provider_configuration_ref, request.versions.provider_configuration),
        'RESULT_CONFIGURATION_BINDING',
      );
      const requestMeta = request.meta as Record<string, unknown>;
      const resultMeta = result.meta as Record<string, unknown>;
      const resultCost = result.cost as Record<string, unknown>;
      const resultSafety = result.safety as Record<string, unknown>;
      const resultRedaction = result.redaction as Record<string, unknown>;
      assertProof(resultMeta.correlation_id === requestMeta.correlation_id, 'RESULT_CORRELATION');
      assertProof(resultMeta.trace_id === requestMeta.trace_id, 'RESULT_TRACE');
      assertProof(result.requested_provider === configuration.provider_key, 'RESULT_PROVIDER');
      assertProof(result.requested_model === configuration.model_key, 'RESULT_MODEL');
      assertProof(
        sameValue(resultCost.pricing_catalog_ref, configuration.pricing_catalog_ref),
        'RESULT_PRICING_CATALOG',
      );
      assertProof(
        sameValue(resultSafety.policy_ref, configuration.safety_policy_ref),
        'RESULT_SAFETY_POLICY',
      );
      assertProof(
        sameValue(resultRedaction.policy_ref, configuration.redaction_policy_ref),
        'RESULT_REDACTION_POLICY',
      );
      if (result.candidate_output !== null) {
        assertProof(
          sameValue(result.candidate_output.schema_ref, request.versions.output_schema),
          'RESULT_CANDIDATE_SCHEMA',
        );
      }
      assertProof(
        sameValue(result.validation.validated_schema_ref, request.versions.output_schema),
        'RESULT_VALIDATION_SCHEMA',
      );
    }

    if (this.controls.resolvedTargetDrift && result.status === 'SUCCEEDED') {
      const resolved = result.resolved as Record<string, unknown>;
      assertProof(resolved.provider_key === configuration.provider_key, 'RESOLVED_PROVIDER');
      assertProof(resolved.model_key === configuration.model_key, 'RESOLVED_MODEL_BINDING');
      assertProof(
        resolved.model_revision === configuration.model_revision,
        'RESOLVED_REVISION_BINDING',
      );
      assertProof(resolved.model_resolution !== 'UNACCEPTED_DRIFT', 'RESOLVED_MODEL_DRIFT');
      assertProof(resolved.model_resolution_accepted === true, 'RESOLUTION_ACCEPTANCE');
    }

    if (this.controls.terminalSafetyAndRedaction && result.status === 'SUCCEEDED') {
      const safety = result.safety as Record<string, unknown>;
      const redaction = result.redaction as Record<string, unknown>;
      assertProof(['PASS', 'REDACTED'].includes(String(safety.outcome)), 'SUCCESS_SAFETY');
      assertProof(['PASS', 'REDACTED'].includes(String(redaction.outcome)), 'SUCCESS_REDACTION');
    }

    if (this.controls.redactedSuccessValidation && result.status === 'SUCCEEDED') {
      const redaction = result.redaction as Record<string, unknown>;
      if (redaction.outcome === 'REDACTED') {
        assertProof(result.validation.status === 'PASSED', 'REDACTED_VALIDATION');
        assertProof(result.candidate_output !== null, 'REDACTED_CANDIDATE');
        assertProof(
          redaction.output_digest === result.candidate_output.content_digest,
          'REDACTED_OUTPUT_BINDING',
        );
      }
    }

    if (this.controls.usageCostProvenance) this.assertAccounting(result);
    if (this.controls.metricLabelAllowlist) this.assertBoundedMetadata(result);
  }

  validateCandidate(result: ModelProviderInvocationResultV1): CandidateValidationResult {
    if (result.candidate_output === null) {
      return {
        valid: false,
        parsed: null,
        diagnostics: [],
        diagnosticsDigest: canonicalDigest([]),
      };
    }

    const raw = result.candidate_output.canonical_json;
    if (typeof raw !== 'string') {
      const diagnostics: SafeValidationDiagnostic[] = [
        {
          code: 'CANONICAL_JSON_TYPE',
          instance_path: '/candidate_output/canonical_json',
          schema_path: '/type',
          keyword: 'type',
          expected_class: 'TYPE',
        },
      ];
      return {
        valid: false,
        parsed: null,
        diagnostics,
        diagnosticsDigest: canonicalDigest(diagnostics),
      };
    }

    if (this.controls.outputSizeValidation && Buffer.byteLength(raw) > 65_536) {
      const diagnostics: SafeValidationDiagnostic[] = [
        {
          code: 'OUTPUT_SIZE_BOUND',
          instance_path: '/candidate_output/canonical_json',
          schema_path: '/maximum_serialized_bytes',
          keyword: 'maxLength',
          expected_class: 'BOUND',
        },
      ];
      return {
        valid: false,
        parsed: null,
        diagnostics,
        diagnosticsDigest: canonicalDigest(diagnostics),
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const diagnostics: SafeValidationDiagnostic[] = [
        {
          code: 'INVALID_JSON',
          instance_path: '/candidate_output/canonical_json',
          schema_path: '/json',
          keyword: 'format',
          expected_class: 'FORMAT',
        },
      ];
      return {
        valid: false,
        parsed: null,
        diagnostics,
        diagnosticsDigest: canonicalDigest(diagnostics),
      };
    }

    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      (!this.controls.strictSchemaValidation ? false : !this.output(parsed))
    ) {
      const diagnostics = safeDiagnostics(this.output.errors);
      return {
        valid: false,
        parsed: null,
        diagnostics,
        diagnosticsDigest: canonicalDigest(diagnostics),
      };
    }

    const candidate = parsed as Record<string, unknown>;
    if (this.controls.redactedSuccessValidation) {
      const candidateDigest = canonicalDigest(candidate);
      const redaction = result.redaction as Record<string, unknown>;
      if (
        result.candidate_output.content_digest !== candidateDigest ||
        redaction.output_digest !== candidateDigest
      ) {
        const diagnostics: SafeValidationDiagnostic[] = [
          {
            code: 'CANDIDATE_CONTENT_DIGEST_MISMATCH',
            instance_path: '/candidate_output/content_digest',
            schema_path: '/integrity/content_digest',
            keyword: 'integrity',
            expected_class: 'SEMANTIC',
          },
        ];
        return {
          valid: false,
          parsed: null,
          diagnostics,
          diagnosticsDigest: canonicalDigest(diagnostics),
        };
      }
    }
    if (this.controls.semanticValidation && candidate.summary === 'semantic-deny') {
      const diagnostics: SafeValidationDiagnostic[] = [
        {
          code: 'SEMANTIC_SUMMARY_REJECTED',
          instance_path: '/summary',
          schema_path: '/semantic/summary',
          keyword: 'semantic',
          expected_class: 'SEMANTIC',
        },
      ];
      return {
        valid: false,
        parsed: null,
        diagnostics,
        diagnosticsDigest: canonicalDigest(diagnostics),
      };
    }

    return {
      valid: true,
      parsed: candidate,
      diagnostics: [],
      diagnosticsDigest: canonicalDigest([]),
    };
  }

  assertMetricLabels(labels: Readonly<Record<string, unknown>>): void {
    if (!this.controls.metricLabelAllowlist) return;
    const safe = canonicalJson(labels);
    assertProof(safe.length <= 1_024, 'METADATA_BOUND');
    assertProof(!/[0-9a-f]{32,}/iu.test(safe), 'METRIC_HIGH_CARDINALITY');
  }

  assertRepairBindings(
    repair: ModelProviderRepairRequestV1,
    failedRequest: ModelProviderInvocationRequestV1,
    failedResult: ModelProviderInvocationResultV1,
  ): void {
    const wireErrors = this.validateEnvelope(repair);
    assertProof(wireErrors.length === 0, 'REPAIR_WIRE_SCHEMA');
    const repairInvocation = repair.repair_invocation as Record<string, unknown>;
    const repairLinkage = repairInvocation.repair_linkage as Record<string, unknown>;
    const receipt = repair.semantic_validation_receipt as Record<string, unknown>;
    const invariants = receipt.invariants as Record<string, unknown>;
    const expectedReservations = failedRequest.budget_reservations.map((reservation) =>
      String(reservation.reservation_id),
    );
    const failedResultDigest = canonicalDigest(failedResult);
    const failedOutputDigest =
      failedResult.candidate_output !== null &&
      typeof failedResult.candidate_output.content_digest === 'string'
        ? failedResult.candidate_output.content_digest
        : canonicalDigest(null);

    assertProof(
      repair.failed_invocation_id === failedRequest.invocation_id,
      'REPAIR_FAILED_REQUEST',
    );
    assertProof(
      failedResult.invocation_id === failedRequest.invocation_id,
      'REPAIR_FAILED_RESULT_ID',
    );
    assertProof(repair.failed_result_digest === failedResultDigest, 'REPAIR_FAILED_RESULT_DIGEST');
    assertProof(repair.failed_output_digest === failedOutputDigest, 'REPAIR_FAILED_OUTPUT_DIGEST');
    assertProof(
      sameValue(repair.original_context_manifest, failedRequest.context_manifest),
      'REPAIR_ORIGINAL_CONTEXT',
    );
    assertProof(
      sameValue(repairInvocation.context_manifest, failedRequest.context_manifest),
      'REPAIR_CONTEXT_CHANGED',
    );
    assertProof(
      sameValue(
        repairInvocation.provider_configuration_ref,
        failedRequest.versions.provider_configuration,
      ),
      'REPAIR_CONFIGURATION_CHANGED',
    );
    assertProof(
      sameValue(repair.original_reservation_ids, expectedReservations),
      'REPAIR_ORIGINAL_RESERVATIONS',
    );
    assertProof(
      repair.diagnostics_digest === canonicalDigest(repair.safe_validation_diagnostics),
      'REPAIR_DIAGNOSTICS_DIGEST',
    );
    assertProof(
      receipt.validated_repair_request_digest === repairValidationSubjectDigest(repair),
      'REPAIR_SUBJECT_DIGEST',
    );
    assertProof(
      receipt.reservation_sets_digest === repairReservationSetsDigest(repair),
      'REPAIR_RESERVATION_SETS_DIGEST',
    );
    assertProof(
      receipt.receipt_digest === repairSemanticReceiptDigest(receipt),
      'REPAIR_RECEIPT_DIGEST',
    );
    assertProof(
      repairLinkage.original_invocation_id === repair.failed_invocation_id &&
        repairLinkage.original_result_digest === repair.failed_result_digest &&
        repairLinkage.repair_ordinal === repair.repair_ordinal &&
        repairLinkage.repair_cap === repair.repair_cap &&
        repairLinkage.separate_invocation_and_reservation ===
          repair.separate_invocation_and_reservation,
      'REPAIR_LINKAGE',
    );
    assertProof(
      Object.values(invariants).every((value) => value === true),
      'REPAIR_RECEIPT_INVARIANT',
    );
    if (this.controls.distinctRepairInvocation) {
      assertProof(
        repairInvocation.invocation_id !== failedRequest.invocation_id,
        'REPAIR_INVOCATION_REUSED',
      );
      assertProof(invariants.new_invocation_identity === true, 'REPAIR_INVOCATION_RECEIPT');
      assertProof(invariants.failed_invocation_link_matches === true, 'REPAIR_FAILED_LINK_RECEIPT');
      assertProof(invariants.failed_result_digest_matches === true, 'REPAIR_RESULT_RECEIPT');
    }
    if (this.controls.disjointRepairReservations) {
      const originals = new Set(repair.original_reservation_ids);
      assertProof(
        repair.repair_reservation_ids.every((reservation) => !originals.has(reservation)),
        'REPAIR_RESERVATION_REUSED',
      );
      assertProof(
        invariants.original_and_repair_reservations_disjoint === true,
        'REPAIR_RESERVATION_RECEIPT',
      );
    }
    if (this.controls.repairCap) {
      assertProof(repair.repair_ordinal === 1 && repair.repair_cap === 1, 'REPAIR_CAP');
      assertProof(invariants.repair_cap_not_exceeded === true, 'REPAIR_CAP_RECEIPT');
    }
    assertProof(invariants.context_manifest_matches === true, 'REPAIR_CONTEXT_RECEIPT');
    if (this.controls.safeRepairDiagnostics) {
      const serialized = canonicalJson(repair.safe_validation_diagnostics);
      assertProof(serialized.length <= 16_384, 'REPAIR_DIAGNOSTICS_BOUND');
      assertProof(
        !/value|prompt|completion|reasoning|credential|body/iu.test(serialized),
        'REPAIR_DIAGNOSTICS_SAFE',
      );
    }
  }

  private assertAccounting(result: ModelProviderInvocationResultV1): void {
    const usage = result.usage as Record<string, Record<string, unknown>>;
    const cost = result.cost as Record<string, unknown>;
    for (const name of [
      'input_tokens',
      'output_tokens',
      'cached_input_tokens',
      'reasoning_tokens',
      'total_tokens',
    ]) {
      const measurement = usage[name];
      assertProof(measurement !== undefined, 'TOKEN_DIMENSION');
      const provenance = measurement.provenance;
      assertProof(
        ['REPORTED', 'ESTIMATED', 'UNAVAILABLE'].includes(String(provenance)),
        'TOKEN_PROVENANCE',
      );
      if (provenance === 'UNAVAILABLE') {
        assertProof(
          measurement.quantity === null && measurement.source === 'UNAVAILABLE',
          'TOKEN_UNAVAILABLE',
        );
      } else {
        assertProof(
          typeof measurement.quantity === 'string' &&
            /^(?:0|[1-9][0-9]*)$/u.test(measurement.quantity),
          'TOKEN_QUANTITY',
        );
      }
    }
    assertProof(
      ['REPORTED', 'ESTIMATED', 'UNAVAILABLE'].includes(String(cost.provenance)),
      'COST_PROVENANCE',
    );
    if (cost.provenance === 'UNAVAILABLE') {
      assertProof(cost.amount_micros === null && cost.currency === null, 'COST_UNAVAILABLE');
    } else {
      assertProof(
        typeof cost.amount_micros === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(cost.amount_micros),
        'COST_MICROS',
      );
      assertProof(
        typeof cost.currency === 'string' && /^[A-Z]{3}$/u.test(cost.currency),
        'CURRENCY',
      );
    }
    if (result.status === 'SUCCEEDED') {
      const total = BigInt(String(usage.total_tokens.quantity));
      const expected =
        BigInt(String(usage.input_tokens.quantity)) + BigInt(String(usage.output_tokens.quantity));
      assertProof(total === expected, 'TOKEN_TOTAL');
    }
  }

  private assertBoundedMetadata(result: ModelProviderInvocationResultV1): void {
    this.assertMetricLabels({
      status: result.status,
      provider: result.requested_provider,
      model: result.requested_model,
      finish: result.finish_reason,
      safety: (result.safety as Record<string, unknown>).outcome,
      redaction: (result.redaction as Record<string, unknown>).outcome,
      classification: result.failure?.classification ?? 'NONE',
    });
  }
}
