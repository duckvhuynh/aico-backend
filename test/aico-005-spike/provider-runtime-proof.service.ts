import {
  A5_ACCEPTANCE_IDS,
  A5_FIXTURE_IDS,
  A5_SCENARIO_REGISTRY,
  A5_SCENARIO_REGISTRY_DIGEST,
  DEFAULT_A5_PROOF_CONTROLS,
  assertProof,
  canonicalDigest,
  canonicalJson,
  type A5AcceptanceCase,
  type A5ProviderRuntimeIntegrationEvidence,
  type A5ScenarioDefinition,
  type A5ScenarioEvidence,
  type A5ScenarioId,
  type ModelProviderConfigurationV1,
  type ModelProviderInvocationRequestV1,
  type ModelProviderInvocationResultV1,
  type ModelProviderRepairRequestV1,
  type ModelProviderTargetDecisionV1,
  type ProofControls,
  type ProofSideEffectLedger,
  type Sha256,
} from './contracts';
import {
  A5_CANARY_VALUES,
  createProofFixture,
  refreshRepairIntegrity,
  type ProofFixture,
} from './fixture';
import { InMemoryProviderRuntimeStore, type ProofStoreSnapshot } from './in-memory-runtime.store';
import { DeferredBarrier, ScriptedModelProviderAdapter } from './scripted-model-provider.adapter';
import {
  ProviderRuntimeSchemaValidator,
  type CandidateValidationResult,
} from './runtime-schema-validator';

export interface ProofExecutionReceipt {
  readonly status: 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN';
  readonly reasonClass: string;
  readonly invocationId: string;
  readonly committed: boolean;
  readonly duplicate: boolean;
  readonly repairEligible: boolean;
  readonly retryScheduled: boolean;
  readonly reconciliationRequired: boolean;
  readonly candidateValidation: CandidateValidationResult | null;
}

export interface ProofExecutionOptions {
  readonly remainingRetryBudget?: number;
  readonly maximumRetries?: number;
  readonly preCanceled?: boolean;
  readonly sanitizationCertain?: boolean;
  readonly environment?: 'LOCAL' | 'TEST' | 'CI' | 'STAGING' | 'PRODUCTION';
  readonly halfOpenProbe?: boolean;
}

const failureReceipt = (
  request: ModelProviderInvocationRequestV1,
  reasonClass: string,
  partial: Partial<ProofExecutionReceipt> = {},
): ProofExecutionReceipt => ({
  status: 'FAILED',
  reasonClass,
  invocationId: request.invocation_id,
  committed: false,
  duplicate: false,
  repairEligible: false,
  retryScheduled: false,
  reconciliationRequired: false,
  candidateValidation: null,
  ...partial,
});

export class ProviderRuntimeProofService {
  readonly store: InMemoryProviderRuntimeStore;
  readonly validator: ProviderRuntimeSchemaValidator;
  private readonly abortControllers = new Map<string, AbortController>();
  private activeConfiguration: ModelProviderConfigurationV1;
  private activeTargetDecision: ModelProviderTargetDecisionV1;

  constructor(
    readonly fixture: ProofFixture,
    readonly adapter: ScriptedModelProviderAdapter,
    readonly controls: Readonly<ProofControls> = DEFAULT_A5_PROOF_CONTROLS,
    store?: InMemoryProviderRuntimeStore,
  ) {
    this.store = store ?? new InMemoryProviderRuntimeStore(controls);
    this.validator = new ProviderRuntimeSchemaValidator(fixture.outputSchema, controls);
    this.activeConfiguration = fixture.configuration;
    this.activeTargetDecision = fixture.targetDecision;
    const configurationDigest = String(fixture.configuration.configuration_digest) as Sha256;
    this.store.setActiveConfiguration(configurationDigest, 'INITIAL_TARGET');
  }

  async execute(
    suppliedRequest: ModelProviderInvocationRequestV1 = this.fixture.request,
    options: ProofExecutionOptions = {},
  ): Promise<ProofExecutionReceipt> {
    const boundarySource = this.seededBoundarySource();
    const request = this.composeSanitizedRequest(suppliedRequest, boundarySource.allowed);
    const configuration = this.activeConfiguration;
    const targetDecision = this.activeTargetDecision;
    if (options.environment !== undefined) {
      const guard = request.execution_guard as Record<string, unknown>;
      (request as unknown as Record<string, unknown>).execution_guard = {
        ...guard,
        environment: options.environment,
      };
    }

    const environment = String(request.execution_guard.environment);
    if (
      this.controls.deterministicProductionRejection &&
      ['STAGING', 'PRODUCTION'].includes(environment)
    ) {
      return failureReceipt(request, 'DETERMINISTIC_DEPLOYED_ENVIRONMENT_REJECTED');
    }
    if (
      this.controls.externalActivationRejection &&
      (request.execution_guard.provider_key !== 'DETERMINISTIC_FIXTURE' ||
        configuration.provider_key !== 'DETERMINISTIC_FIXTURE')
    ) {
      return failureReceipt(request, 'EXTERNAL_PROVIDER_DISABLED');
    }
    if (options.preCanceled === true) {
      return {
        ...failureReceipt(request, 'PRE_DISPATCH_CANCELED'),
        status: 'CANCELED',
      };
    }
    if (
      this.controls.preDispatchDeadline &&
      Date.parse(request.deadline_at) <= this.fixture.clock.now().getTime()
    ) {
      return failureReceipt(request, 'PRE_DISPATCH_TIMEOUT');
    }
    if (options.sanitizationCertain === false && this.controls.terminalSafetyAndRedaction) {
      return failureReceipt(request, 'SANITIZATION_UNCERTAIN');
    }

    try {
      this.validator.assertRequestBindings(request, configuration, targetDecision);
    } catch {
      return failureReceipt(request, 'REQUEST_BINDING_REJECTED');
    }

    if (this.controls.evidenceSinkRedaction) {
      assertProof(!this.containsCanary(request), 'REQUEST_CANARY');
    } else {
      (request as unknown as Record<string, unknown>).unsafe_boundary_context =
        boundarySource.prohibited;
    }

    const configurationDigest = String(configuration.configuration_digest) as Sha256;
    if (!this.store.canStartNewAttempt(configurationDigest, options.halfOpenProbe === true)) {
      return failureReceipt(request, 'TARGET_OR_CIRCUIT_BLOCKED');
    }

    const reservation = this.store.reserve(request);
    if (reservation.kind === 'COLLISION') return failureReceipt(request, 'IDEMPOTENCY_COLLISION');
    if (reservation.kind === 'DUPLICATE') {
      const duplicateStatus =
        reservation.record.committedDigest !== null
          ? 'SUCCEEDED'
          : reservation.record.state === 'RECONCILIATION_REQUIRED'
            ? 'UNKNOWN'
            : reservation.record.state === 'CANCELED'
              ? 'CANCELED'
              : 'FAILED';
      return {
        status: duplicateStatus,
        reasonClass: 'DUPLICATE_REPLAY',
        invocationId: reservation.record.invocationId,
        committed: reservation.record.committedDigest !== null,
        duplicate: true,
        repairEligible: false,
        retryScheduled: reservation.record.state === 'RETRY_WAIT',
        reconciliationRequired: false,
        candidateValidation: null,
      };
    }
    if (reservation.kind === 'RECONCILIATION_REQUIRED') {
      if (!this.controls.unknownReconciliation) {
        const replay = structuredClone(request) as unknown as Record<string, unknown>;
        replay.logical_idempotency_key = `${request.logical_idempotency_key}.blind-replay`;
        replay.invocation_id = '30000000-0000-4000-8000-000000000099';
        replay.request_digest = `sha256:${'9'.repeat(64)}`;
        return this.execute(replay as unknown as ModelProviderInvocationRequestV1, options);
      }
      return {
        status: 'UNKNOWN',
        reasonClass: 'RECONCILIATION_REQUIRED',
        invocationId: reservation.record.invocationId,
        committed: false,
        duplicate: true,
        repairEligible: false,
        retryScheduled: false,
        reconciliationRequired: true,
        candidateValidation: null,
      };
    }

    const record = reservation.record;
    const leaseGeneration = record.leaseGeneration;
    const cancellationGeneration = record.cancellationGeneration;
    const terminalGeneration = record.terminalGeneration;
    this.store.beginDispatch(request.invocation_id);
    const controller = new AbortController();
    this.abortControllers.set(request.invocation_id, controller);

    let result: ModelProviderInvocationResultV1;
    try {
      result = await this.adapter.invoke(request, controller.signal);
    } catch {
      this.store.markReconciliationRequired(request.invocation_id);
      return {
        ...failureReceipt(request, 'INTEGRITY'),
        status: 'UNKNOWN',
        reconciliationRequired: true,
      };
    } finally {
      this.abortControllers.delete(request.invocation_id);
    }

    try {
      this.validator.assertResultBindings(request, result, configuration);
    } catch {
      this.store.markReconciliationRequired(request.invocation_id);
      return {
        ...failureReceipt(request, 'INTEGRITY'),
        status: 'UNKNOWN',
        reconciliationRequired: true,
      };
    }
    let prohibitedResult = false;
    try {
      this.assertResultSafeForRetention(result);
    } catch {
      prohibitedResult = true;
    }
    if (prohibitedResult) {
      this.store.markValidationFailed(request.invocation_id);
      this.emitEvidence(request, result, 'PROHIBITED_RESULT_DROPPED');
      return failureReceipt(request, 'PROHIBITED_RESULT_DROPPED');
    }
    if (!this.controls.evidenceSinkRedaction) {
      (result as unknown as Record<string, unknown>).unsafe_boundary_context =
        boundarySource.prohibited;
    }

    if (result.status !== 'SUCCEEDED') this.store.recordResult(request.invocation_id, result);

    if (result.status === 'UNKNOWN') {
      if (!this.controls.postDispatchUnknown) {
        return failureReceipt(request, 'UNKNOWN_DOWNGRADED_TO_FAILED');
      }
      this.emitEvidence(request, result, 'UNKNOWN');
      return {
        ...failureReceipt(request, 'POST_DISPATCH_UNKNOWN'),
        status: 'UNKNOWN',
        reconciliationRequired: true,
      };
    }

    if (result.status === 'CANCELED') {
      this.emitEvidence(request, result, 'CANCELED');
      return {
        ...failureReceipt(request, 'CANCELED'),
        status: 'CANCELED',
        reconciliationRequired: result.failure?.reconciliation_required ?? false,
      };
    }

    if (result.status === 'FAILED') {
      let retryScheduled = false;
      let repairEligible = false;
      if (result.failure?.classification === 'RATE_LIMITED') {
        if (!this.controls.sdkRetriesDisabled) this.store.recordSdkRetry();
        if (result.failure.retry_after !== null) {
          retryScheduled = this.store.scheduleRetry(
            request.invocation_id,
            result.failure.retry_after,
            request.deadline_at,
            options.remainingRetryBudget ?? 1,
            options.maximumRetries ?? 1,
          );
        }
      }
      if (result.failure?.classification === 'VALIDATION') repairEligible = true;
      if (
        result.failure?.classification === 'REFUSAL_SAFETY' &&
        !this.controls.terminalSafetyAndRedaction
      ) {
        this.store.beginRepair(
          request.invocation_id,
          '80000000-0000-4000-8000-000000000012',
          '80000000-0000-4000-8000-000000000011',
        );
        repairEligible = true;
      }
      this.emitEvidence(request, result, result.failure?.classification ?? 'FAILED');
      return {
        ...failureReceipt(request, result.failure?.classification ?? 'FAILED'),
        retryScheduled,
        repairEligible,
      };
    }

    if (!this.controls.zeroAuthorityBeforeCommit) this.store.recordToolEffect();
    const candidateValidation = this.validator.validateCandidate(result);
    if (!candidateValidation.valid || candidateValidation.parsed === null) {
      this.store.markValidationFailed(request.invocation_id);
      this.emitEvidence(request, result, 'VALIDATION');
      return {
        ...failureReceipt(request, 'VALIDATION'),
        repairEligible: true,
        candidateValidation,
      };
    }

    this.store.recordResult(request.invocation_id, result);
    const committed = this.store.commitCandidate(
      request.invocation_id,
      leaseGeneration,
      cancellationGeneration,
      terminalGeneration,
      candidateValidation.parsed,
    );
    if (!committed) this.store.markReconciliationRequired(request.invocation_id);
    this.emitEvidence(request, result, committed ? 'SUCCESS' : 'LATE_RESULT_FENCED');
    return {
      status: committed ? 'SUCCEEDED' : 'CANCELED',
      reasonClass: committed ? 'SUCCESS' : 'LATE_RESULT_FENCED',
      invocationId: request.invocation_id,
      committed,
      duplicate: false,
      repairEligible: false,
      retryScheduled: false,
      reconciliationRequired: !committed,
      candidateValidation,
    };
  }

  cancel(invocationId: string): void {
    this.store.cancel(invocationId);
    if (this.controls.abortSignalPropagation) this.abortControllers.get(invocationId)?.abort();
  }

  loseLease(invocationId: string): void {
    this.store.loseLease(invocationId);
  }

  markTerminal(invocationId: string): void {
    this.store.markTerminal(invocationId);
  }

  async reconcile(request: ModelProviderInvocationRequestV1): Promise<ProofExecutionReceipt> {
    const before = this.store
      .snapshot()
      .records.find((record) => record.invocationId === request.invocation_id);
    assertProof(before !== undefined, 'RECONCILIATION_INVOCATION');
    const controller = new AbortController();
    const result = await this.adapter.lookup(
      {
        invocation_id: request.invocation_id,
        logical_idempotency_key: request.logical_idempotency_key,
        request_digest: request.request_digest,
      },
      controller.signal,
    );
    if (result === null) {
      this.store.markReconciled(request.invocation_id, null);
      return {
        ...failureReceipt(request, 'RECONCILIATION_BLOCKED'),
        status: 'UNKNOWN',
        reconciliationRequired: true,
      };
    }
    if (
      before.cancellationGeneration > 0 ||
      before.terminalGeneration > 0 ||
      before.leaseGeneration !== 1
    ) {
      this.store.markReconciled(request.invocation_id, null);
      return {
        ...failureReceipt(request, 'RECONCILIATION_BLOCKED'),
        status: 'UNKNOWN',
        reconciliationRequired: true,
      };
    }

    let candidateValidation: CandidateValidationResult | null = null;
    try {
      this.validator.assertRequestBindings(
        request,
        this.activeConfiguration,
        this.activeTargetDecision,
      );
      this.validator.assertResultBindings(request, result, this.activeConfiguration);
      this.assertResultSafeForRetention(result);
      if (result.status === 'SUCCEEDED') {
        candidateValidation = this.validator.validateCandidate(result);
        assertProof(
          candidateValidation.valid && candidateValidation.parsed !== null,
          'RECONCILE_CANDIDATE',
        );
      }
    } catch {
      this.store.markReconciled(request.invocation_id, null);
      return {
        ...failureReceipt(request, 'RECONCILIATION_BLOCKED'),
        status: 'UNKNOWN',
        reconciliationRequired: true,
      };
    }

    this.store.markReconciled(request.invocation_id, result);
    if (result.status === 'UNKNOWN') {
      return {
        ...failureReceipt(request, 'RECONCILIATION_PENDING'),
        status: 'UNKNOWN',
        reconciliationRequired: true,
      };
    }
    if (
      result.status === 'SUCCEEDED' &&
      candidateValidation !== null &&
      candidateValidation.parsed !== null
    ) {
      const committed = this.store.commitCandidate(
        request.invocation_id,
        before.leaseGeneration,
        before.cancellationGeneration,
        before.terminalGeneration,
        candidateValidation.parsed,
      );
      if (!committed) this.store.markReconciliationRequired(request.invocation_id);
      return {
        status: committed ? 'SUCCEEDED' : 'UNKNOWN',
        reasonClass: committed ? 'RECONCILED' : 'RECONCILIATION_BLOCKED',
        invocationId: request.invocation_id,
        committed,
        duplicate: false,
        repairEligible: false,
        retryScheduled: false,
        reconciliationRequired: !committed,
        candidateValidation,
      };
    }
    return {
      ...failureReceipt(request, 'RECONCILED'),
      status: result.status,
      reconciliationRequired: false,
    };
  }

  assertRepair(repair: ModelProviderRepairRequestV1, failedRequest = this.fixture.request): void {
    this.validator.assertRepairBindings(repair, failedRequest, this.fixture.result);
  }

  beginRepair(failedInvocationId: string, repairInvocationId: string, reservationId: string): void {
    this.store.beginRepair(failedInvocationId, repairInvocationId, reservationId);
  }

  applyConfiguration(digest: Sha256): void {
    this.store.setActiveConfiguration(digest, 'CONFIGURATION_DIGEST_APPLIED');
  }

  applyTarget(
    configuration: ModelProviderConfigurationV1,
    targetDecision: ModelProviderTargetDecisionV1,
    reasonCode: 'ROLLOUT' | 'ROLLBACK',
  ): void {
    this.activeConfiguration = configuration;
    this.activeTargetDecision = targetDecision;
    this.store.setActiveConfiguration(
      String(configuration.configuration_digest) as Sha256,
      reasonCode,
    );
  }

  setCircuit(
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN',
    reasonCode = 'FIXTURE_CIRCUIT_DECISION',
  ): void {
    this.store.setCircuit(this.activeConfigurationDigest(), state, reasonCode);
  }

  setKilled(value: boolean, reasonCode = 'FIXTURE_KILL_DECISION'): void {
    this.store.setKilled(this.activeConfigurationDigest(), value, reasonCode);
  }

  snapshot(): ProofStoreSnapshot {
    return this.store.snapshot();
  }

  reconcileReservation(reservedMicros: bigint, reportedMicros: bigint): bigint {
    assertProof(reservedMicros >= 0n && reportedMicros >= 0n, 'RESERVATION_AMOUNT');
    if (this.controls.reservationVarianceReconciliation) {
      assertProof(reportedMicros <= reservedMicros, 'RESERVATION_OVERRUN');
      this.store.recordCostEffect();
      return reservedMicros - reportedMicros;
    }
    this.store.recordCostEffect();
    this.store.recordCostEffect();
    return 0n;
  }

  private emitEvidence(
    request: ModelProviderInvocationRequestV1,
    result: ModelProviderInvocationResultV1,
    reasonClass: string,
  ): void {
    const safe = {
      status: result.status,
      reasonClass,
      invocationClass: 'OPAQUE_UUID',
      provider: result.requested_provider,
      model: result.requested_model,
      configurationDigest: canonicalDigest(result.provider_configuration_ref),
    };
    const unsafe = this.seededBoundarySource().prohibited;
    this.store.appendSafeLog(this.controls.evidenceSinkRedaction ? safe : { ...safe, unsafe });
    this.store.appendSafeEvidence(
      this.controls.evidenceSinkRedaction
        ? { ...safe, requestClass: 'SYNTHETIC_FIXTURE' }
        : { ...safe, unsafe },
    );
    this.store.appendSafeAnalytics(
      this.controls.evidenceSinkRedaction ? { ...safe, eventClass: 'MODEL_OUTCOME' } : { unsafe },
    );
    this.store.appendSafeDebug(
      this.controls.evidenceSinkRedaction ? { invocationClass: 'OPAQUE_UUID' } : { unsafe },
    );
    if (!this.controls.evidenceSinkRedaction) {
      this.store.appendSafeArtifact({ unsafe });
      this.store.appendSafeTask({ unsafe });
    }
    if (this.controls.evidenceSinkRedaction) {
      assertProof(!this.containsCanary({ request, safe }), 'EVIDENCE_CANARY');
    }
  }

  private seededBoundarySource(): {
    readonly allowed: Readonly<Record<string, unknown>>;
    readonly prohibited: Readonly<Record<string, unknown>>;
  } {
    const source = this.fixture.unsafeContext;
    const allowed = source.allowed;
    const prohibited = source.prohibited;
    assertProof(
      allowed !== null && typeof allowed === 'object' && !Array.isArray(allowed),
      'BOUNDARY_ALLOWED_SOURCE',
    );
    assertProof(
      prohibited !== null && typeof prohibited === 'object' && !Array.isArray(prohibited),
      'BOUNDARY_PROHIBITED_SOURCE',
    );
    const serializedProhibited = canonicalJson(prohibited);
    for (const canary of A5_CANARY_VALUES) {
      assertProof(serializedProhibited.includes(canary), 'BOUNDARY_CANARY_NOT_SEEDED');
    }
    assertProof(!this.containsCanary(allowed), 'BOUNDARY_ALLOWED_CANARY');
    return {
      allowed: structuredClone(allowed as Readonly<Record<string, unknown>>),
      prohibited: structuredClone(prohibited as Readonly<Record<string, unknown>>),
    };
  }

  private composeSanitizedRequest(
    suppliedRequest: ModelProviderInvocationRequestV1,
    allowed: Readonly<Record<string, unknown>>,
  ): ModelProviderInvocationRequestV1 {
    const request = structuredClone(suppliedRequest);
    assertProof(canonicalJson(allowed).length <= 16_384, 'BOUNDARY_ALLOWED_OVERSIZE');
    (request as unknown as Record<string, unknown>).privacy = {
      ...request.privacy,
      credentials_present: false,
      hidden_reasoning_present: false,
      raw_transcript_present: false,
      foreign_tenant_content_present: false,
      prohibited_content_scan: 'PASS',
    };
    return request;
  }

  private activeConfigurationDigest(): Sha256 {
    return String(this.activeConfiguration.configuration_digest) as Sha256;
  }

  private containsCanary(value: unknown): boolean {
    const serialized = canonicalJson(value);
    return A5_CANARY_VALUES.some((canary) => serialized.includes(canary));
  }

  private assertResultSafeForRetention(result: ModelProviderInvocationResultV1): void {
    if (this.controls.evidenceSinkRedaction) {
      assertProof(!this.containsCanary(result), 'PROHIBITED_RESULT');
    }
  }
}

export interface RunAico005ProofOptions {
  readonly onlyCase?: A5AcceptanceCase;
  readonly onlyScenario?: A5ScenarioId;
  readonly controls?: Readonly<ProofControls>;
  readonly repositorySha?: string;
  readonly dirtyDevelopmentEvidence?: boolean;
}

function totalEffects(
  left: ProofSideEffectLedger,
  right: Readonly<ProofSideEffectLedger>,
): ProofSideEffectLedger {
  const output = { ...left };
  for (const key of Object.keys(output) as Array<keyof ProofSideEffectLedger>) {
    output[key] += right[key];
  }
  return output;
}

const ZERO_LEDGER: ProofSideEffectLedger = {
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
};

export async function runAico005ProviderRuntimeProof(
  options: RunAico005ProofOptions = {},
): Promise<A5ProviderRuntimeIntegrationEvidence> {
  const controls = options.controls ?? DEFAULT_A5_PROOF_CONTROLS;
  const selected = A5_SCENARIO_REGISTRY.filter((definition) => {
    if (options.onlyScenario !== undefined) return definition.id === options.onlyScenario;
    if (options.onlyCase !== undefined) return definition.acceptanceId === options.onlyCase;
    return true;
  });
  assertProof(selected.length > 0, 'EMPTY_SCENARIO_SELECTION');

  const evidence: A5ScenarioEvidence[] = [];
  let aggregate = { ...ZERO_LEDGER };
  for (const definition of selected) {
    const entry = await runScenario(definition, controls);
    evidence.push(entry);
    aggregate = totalEffects(aggregate, entry.effectTotals);
  }
  assertProof(aggregate.externalProviderCalls === 0, 'EXTERNAL_PROVIDER_EFFECT');

  const acceptanceIds = [
    ...new Set(selected.map(({ acceptanceId }) => acceptanceId)),
  ] as A5AcceptanceCase[];
  return {
    evidenceSchema: 'aico-005-provider-runtime-integration/v1',
    claimClass: 'ARCHITECTURE_TEST_ONLY',
    repositorySha: options.repositorySha ?? 'UNCOMMITTED',
    dirtyDevelopmentEvidence: options.dirtyDevelopmentEvidence ?? true,
    acceptanceIds,
    selectedScenarios: selected.map(({ id }) => id),
    scenarioRegistryDigest: A5_SCENARIO_REGISTRY_DIGEST,
    passedScenarios: selected.length,
    fixtureIds: A5_FIXTURE_IDS,
    scenarioEvidence: evidence,
    paidExternalServices: 0,
    productionCredentials: 0,
    externalProviderCalls: 0,
    runtimeClass: 'DETERMINISTIC_IN_MEMORY_PROVIDER_PROOF',
  };
}

async function runScenario(
  definition: A5ScenarioDefinition,
  controls: Readonly<ProofControls>,
): Promise<A5ScenarioEvidence> {
  const fixture = createProofFixture(definition.fixtureId, definition.id);
  const barrier =
    definition.acceptanceId === 'A5-T-CANCEL-01' ||
    definition.id === 'A5-S-VERSION-EXACT' ||
    definition.id === 'A5-S-REPLAY-DUPLICATE'
      ? new DeferredBarrier()
      : undefined;
  let forgedReconciliationResult: ModelProviderInvocationResultV1 | null = null;
  if (definition.id === 'A5-S-TIMEOUT-RECONCILE') {
    const forged = structuredClone(
      createProofFixture('A5-FX-01', 'A5-S-SUCCESS-STRICT').result,
    ) as unknown as Record<string, unknown>;
    forged.invocation_id = '30000000-0000-4000-8000-000000000097';
    forged.request_digest = `sha256:${'7'.repeat(64)}`;
    forgedReconciliationResult = forged as unknown as ModelProviderInvocationResultV1;
  } else if (definition.id === 'A5-S-CANCEL-RECONCILE') {
    forgedReconciliationResult = structuredClone(fixture.result);
  }
  const adapter = new ScriptedModelProviderAdapter({
    result: fixture.result,
    barrier,
    reconciliationResult: forgedReconciliationResult,
  });
  const service = new ProviderRuntimeProofService(fixture, adapter, controls);
  const auxiliarySnapshots: ProofStoreSnapshot[] = [];

  try {
    await exerciseScenario(definition, fixture, service, adapter, barrier, auxiliarySnapshots);
  } catch (error) {
    const code =
      error instanceof Error && /^AICO005_PROOF_[A-Z0-9_]+$/u.test(error.message)
        ? error.message
        : 'AICO005_PROOF_UNCLASSIFIED';
    throw new Error(`${definition.id} failed: ${code}`);
  }
  const snapshot = service.snapshot();
  assertProof(snapshot.ledger.externalProviderCalls === 0, 'SCENARIO_EXTERNAL_PROVIDER');
  assertProof(adapter.networkCalls === 0, 'SCENARIO_NETWORK');
  assertProof(adapter.productionCredentials === 0, 'SCENARIO_CREDENTIAL');
  const retained = canonicalJson({
    requests: adapter.receivedRequests,
    results: snapshot.records.map((record) => record.result),
    logs: snapshot.logs,
    evidence: snapshot.evidence,
    artifacts: snapshot.artifacts,
    tasks: snapshot.tasks,
    analytics: snapshot.analytics,
    debug: snapshot.debug,
  });
  assertProof(
    !A5_CANARY_VALUES.some((canary) => retained.includes(canary)),
    'SCENARIO_RETAINED_CANARY',
  );

  const effectTotals = auxiliarySnapshots.reduce(
    (totals, auxiliary) => totalEffects(totals, auxiliary.ledger),
    { ...snapshot.ledger },
  );
  assertProof(
    auxiliarySnapshots.every((auxiliary) => auxiliary.ledger.externalProviderCalls === 0),
    'AUXILIARY_EXTERNAL_PROVIDER',
  );
  return {
    scenarioId: definition.id,
    acceptanceId: definition.acceptanceId,
    resultClass: 'PASSED',
    reasonClass: definition.expectedReasonClass,
    ledgerDigest: canonicalDigest(effectTotals),
    effectTotals,
    evidenceDigest: canonicalDigest({
      scenarioId: definition.id,
      reasonClass: definition.expectedReasonClass,
      effectTotals,
    }),
  };
}

async function exerciseScenario(
  definition: A5ScenarioDefinition,
  fixture: ProofFixture,
  service: ProviderRuntimeProofService,
  adapter: ScriptedModelProviderAdapter,
  barrier: DeferredBarrier | undefined,
  auxiliarySnapshots: ProofStoreSnapshot[],
): Promise<void> {
  const id = definition.id;

  if (definition.acceptanceId === 'A5-T-CANCEL-01') {
    await exerciseCancellation(id, fixture, service, adapter, barrier);
    return;
  }
  if (definition.acceptanceId === 'A5-T-REPAIR-01') {
    await exerciseRepair(id, fixture, service);
    return;
  }
  if (definition.acceptanceId === 'A5-T-VERSION-01') {
    await exerciseVersion(id, fixture, service, adapter, barrier);
    return;
  }
  if (definition.acceptanceId === 'A5-T-REPLAY-01') {
    await exerciseReplay(id, fixture, service, barrier);
    return;
  }
  if (definition.acceptanceId === 'A5-T-MUTATION-01') {
    assertProof(Object.keys(DEFAULT_A5_PROOF_CONTROLS).length === 30, 'CONTROL_COUNT');
    assertProof(A5_SCENARIO_REGISTRY.length === 64, 'SCENARIO_COUNT');
    assertProof(A5_ACCEPTANCE_IDS.length === 13, 'ACCEPTANCE_COUNT');
    return;
  }
  if (definition.acceptanceId === 'A5-T-VERIFY-01') {
    assertProof(A5_FIXTURE_IDS.length === 15, 'FIXTURE_COUNT');
    assertProof(A5_SCENARIO_REGISTRY_DIGEST.startsWith('sha256:'), 'REGISTRY_DIGEST');
    return;
  }

  if (id === 'A5-S-TIMEOUT-PRE-DISPATCH') {
    fixture.clock.advanceTo(fixture.request.deadline_at);
    const receipt = await service.execute();
    assertProof(receipt.reasonClass === 'PRE_DISPATCH_TIMEOUT', 'PRE_TIMEOUT_CLASS');
    assertProof(adapter.receivedRequests.length === 0, 'PRE_TIMEOUT_PROVIDER_EFFECT');
    return;
  }
  if (id === 'A5-S-SECRET-UNCERTAIN') {
    const receipt = await service.execute(fixture.request, { sanitizationCertain: false });
    assertProof(receipt.reasonClass === 'SANITIZATION_UNCERTAIN', 'SANITIZATION_CLASS');
    assertProof(adapter.receivedRequests.length === 0, 'SANITIZATION_PROVIDER_EFFECT');
    return;
  }
  if (id === 'A5-S-SECRET-PAYLOAD') {
    adapter.setResult(createCanarySuccessResult());
    const receipt = await service.execute();
    const snapshot = service.snapshot();
    assertProof(
      receipt.status === 'FAILED' &&
        receipt.reasonClass === 'PROHIBITED_RESULT_DROPPED' &&
        !receipt.committed,
      'PROHIBITED_RESULT_ACCEPTED',
    );
    assertProof(snapshot.records[0]?.result === null, 'PROHIBITED_RESULT_RETAINED');
    assertProof(snapshot.ledger.candidateCommits === 0, 'PROHIBITED_RESULT_COMMITTED');
    assertProof(snapshot.ledger.artifactEffects === 0, 'PROHIBITED_RESULT_ARTIFACT');
    assertProof(snapshot.ledger.taskEffects === 0, 'PROHIBITED_RESULT_TASK');
    return;
  }
  if (id === 'A5-S-MALFORMED-WIRE') {
    const invalid = structuredClone(fixture.result) as unknown as Record<string, unknown>;
    invalid.provider_error_body = 'forbidden';
    adapter.setResult(invalid as unknown as ModelProviderInvocationResultV1);
    const malformed = await service.execute();
    assertProof(
      malformed.status === 'UNKNOWN' && malformed.reasonClass === 'INTEGRITY',
      'MALFORMED_RESULT_NOT_UNKNOWN',
    );
    assertProof(malformed.reconciliationRequired, 'MALFORMED_RESULT_NOT_RECONCILED');
    assertProof(
      service.snapshot().records[0]?.dispatchPhase === 'UNCERTAIN',
      'MALFORMED_RESULT_CERTAINTY',
    );

    const throwingAdapter = new ScriptedModelProviderAdapter({
      result: fixture.result,
      throwOnInvoke: true,
    });
    const throwingService = new ProviderRuntimeProofService(
      createProofFixture(definition.fixtureId, definition.id),
      throwingAdapter,
      service.controls,
    );
    const thrown = await throwingService.execute();
    assertProof(
      thrown.status === 'UNKNOWN' && thrown.reasonClass === 'INTEGRITY',
      'ADAPTER_THROW_NOT_UNKNOWN',
    );
    assertProof(thrown.reconciliationRequired, 'ADAPTER_THROW_NOT_RECONCILED');
    assertProof(
      throwingService.snapshot().records[0]?.dispatchPhase === 'UNCERTAIN',
      'ADAPTER_THROW_CERTAINTY',
    );
    auxiliarySnapshots.push(throwingService.snapshot());
    return;
  }
  if (id === 'A5-S-RATE-DEADLINE') {
    const receipt = await service.execute(fixture.request, { remainingRetryBudget: 1 });
    assertProof(receipt.retryScheduled, 'RATE_BASE_SCHEDULE');
    const rejected = service.store.scheduleRetry(
      fixture.request.invocation_id,
      '2026-08-15T04:02:06Z',
      fixture.request.deadline_at,
      1,
      2,
    );
    assertProof(!rejected, 'RATE_AFTER_DEADLINE');
    return;
  }
  if (id === 'A5-S-RATE-BUDGET') {
    const receipt = await service.execute(fixture.request, { remainingRetryBudget: 0 });
    assertProof(!receipt.retryScheduled, 'RATE_WITHOUT_BUDGET');
    return;
  }
  if (id === 'A5-S-RATE-EXHAUSTED') {
    const receipt = await service.execute(fixture.request, { maximumRetries: 0 });
    assertProof(!receipt.retryScheduled, 'RATE_RETRY_CAP');
    return;
  }
  if (id === 'A5-S-SAFETY-REDACTED') {
    const validRedacted = await service.execute();
    assertProof(
      validRedacted.status === 'SUCCEEDED' &&
        validRedacted.committed &&
        validRedacted.candidateValidation?.valid === true,
      'REDACTED_SUCCESS_NOT_REVALIDATED',
    );
    const corrupted = structuredClone(fixture.result) as unknown as Record<string, unknown>;
    const redaction = corrupted.redaction as Record<string, unknown>;
    redaction.output_digest = `sha256:${'0'.repeat(64)}`;
    let rejected = false;
    try {
      service.validator.assertResultBindings(
        fixture.request,
        corrupted as unknown as ModelProviderInvocationResultV1,
        fixture.configuration,
      );
    } catch {
      rejected = true;
    }
    assertProof(rejected, 'REDACTED_BINDING_ACCEPTED');
    return;
  }
  if (id === 'A5-S-META-ACCOUNTING') {
    const invalid = structuredClone(fixture.result) as unknown as Record<string, unknown>;
    const usage = invalid.usage as Record<string, Record<string, unknown>>;
    usage.total_tokens.quantity = '999';
    let rejected = false;
    try {
      service.validator.assertResultBindings(
        fixture.request,
        invalid as unknown as ModelProviderInvocationResultV1,
        fixture.configuration,
      );
    } catch {
      rejected = true;
    }
    assertProof(rejected, 'ACCOUNTING_VARIANCE_ACCEPTED');
    return;
  }
  if (id === 'A5-S-META-RESERVATION') {
    const variance = service.reconcileReservation(100n, 75n);
    assertProof(variance === 25n, 'RESERVATION_VARIANCE');
    assertProof(service.snapshot().ledger.costEffects === 1, 'RESERVATION_DOUBLE_CHARGE');
    return;
  }
  if (id === 'A5-S-META-BOUNDED') {
    let rejected = false;
    try {
      service.validator.assertMetricLabels({ providerCohort: 'a'.repeat(64) });
    } catch {
      rejected = true;
    }
    assertProof(rejected, 'UNBOUNDED_METADATA_ACCEPTED');
    return;
  }

  if (id === 'A5-S-SUCCESS-LINEAGE') {
    const mismatched = structuredClone(fixture.request) as unknown as Record<string, unknown>;
    const mismatchedTargetId = '30000000-0000-4000-8000-000000000039';
    mismatched.target_decision_id = mismatchedTargetId;
    mismatched.execution_guard = {
      ...(fixture.request.execution_guard as Record<string, unknown>),
      target_decision_id: mismatchedTargetId,
    };
    const mismatchedReceipt = await service.execute(
      mismatched as unknown as ModelProviderInvocationRequestV1,
    );
    assertProof(
      mismatchedReceipt.reasonClass === 'REQUEST_BINDING_REJECTED',
      'MISMATCHED_LINEAGE_ACCEPTED',
    );
    assertProof(service.snapshot().ledger.providerCalls === 0, 'MISMATCHED_LINEAGE_DISPATCHED');

    const metadataFixture = createProofFixture(definition.fixtureId, definition.id);
    const metadataResult = structuredClone(metadataFixture.result) as unknown as Record<
      string,
      unknown
    >;
    metadataResult.meta = {
      ...(metadataFixture.result.meta as Record<string, unknown>),
      correlation_id: '30000000-0000-4000-8000-000000000096',
      trace_id: '96969696969696969696969696969696',
    };
    const metadataAdapter = new ScriptedModelProviderAdapter({
      result: metadataResult as unknown as ModelProviderInvocationResultV1,
    });
    const metadataService = new ProviderRuntimeProofService(
      metadataFixture,
      metadataAdapter,
      service.controls,
    );
    const metadataReceipt = await metadataService.execute();
    assertProof(
      metadataReceipt.status === 'UNKNOWN' && !metadataReceipt.committed,
      'MISMATCHED_METADATA_COMMITTED',
    );
    auxiliarySnapshots.push(metadataService.snapshot());

    const modelFixture = createProofFixture(definition.fixtureId, definition.id);
    const modelResult = structuredClone(modelFixture.result) as unknown as Record<string, unknown>;
    modelResult.requested_model = 'fixture-other';
    modelResult.resolved = {
      ...(modelFixture.result.resolved as Record<string, unknown>),
      model_key: 'fixture-other',
      model_revision: 'fixture-other-v1',
    };
    const modelAdapter = new ScriptedModelProviderAdapter({
      result: modelResult as unknown as ModelProviderInvocationResultV1,
    });
    const modelService = new ProviderRuntimeProofService(
      modelFixture,
      modelAdapter,
      service.controls,
    );
    const modelReceipt = await modelService.execute();
    assertProof(
      modelReceipt.status === 'UNKNOWN' && !modelReceipt.committed,
      'MISMATCHED_MODEL_COMMITTED',
    );
    auxiliarySnapshots.push(modelService.snapshot());
    return;
  }

  if (id === 'A5-S-SUCCESS-COMMIT-GATE') {
    const forged = structuredClone(fixture.request) as unknown as Record<string, unknown>;
    const forgedSchema = {
      ...(fixture.request.versions.output_schema as unknown as Record<string, unknown>),
      content_digest: `sha256:${'f'.repeat(64)}`,
    };
    forged.versions = {
      ...fixture.request.versions,
      output_schema: forgedSchema,
    };
    forged.output_schema = {
      ...fixture.request.output_schema,
      schema_ref: forgedSchema,
      canonical_schema_digest: forgedSchema.content_digest,
    };
    const forgedReceipt = await service.execute(
      forged as unknown as ModelProviderInvocationRequestV1,
    );
    assertProof(
      forgedReceipt.reasonClass === 'REQUEST_BINDING_REJECTED' && !forgedReceipt.committed,
      'FORGED_SCHEMA_ACCEPTED',
    );
    assertProof(service.snapshot().ledger.providerCalls === 0, 'FORGED_SCHEMA_DISPATCHED');

    const tampered = structuredClone(fixture.result) as unknown as Record<string, unknown>;
    const candidate = tampered.candidate_output as Record<string, unknown>;
    candidate.canonical_json = JSON.stringify({
      fixture_status: 'complete',
      summary: 'tampered but schema valid',
    });
    adapter.setResult(tampered as unknown as ModelProviderInvocationResultV1);
    const tamperedReceipt = await service.execute();
    assertProof(
      tamperedReceipt.status === 'FAILED' &&
        tamperedReceipt.reasonClass === 'VALIDATION' &&
        !tamperedReceipt.committed,
      'STALE_CANDIDATE_DIGEST_COMMITTED',
    );
    assertProof(service.snapshot().ledger.candidateCommits === 0, 'TAMPERED_CANDIDATE_EFFECT');
    return;
  }

  const receipt = await service.execute();
  if (definition.acceptanceId === 'A5-T-SUCCESS-01') {
    assertProof(receipt.status === 'SUCCEEDED' && receipt.committed, 'SUCCESS_RECEIPT');
    if (id === 'A5-S-SUCCESS-ZERO-AUTHORITY') {
      assertProof(service.snapshot().ledger.toolEffects === 0, 'PRECOMMIT_TOOL_AUTHORITY');
    }
    return;
  }
  if (definition.acceptanceId === 'A5-T-MALFORMED-01') {
    assertProof(receipt.status === 'FAILED' && !receipt.committed, 'MALFORMED_COMMITTED');
    assertProof(service.snapshot().ledger.artifactEffects === 0, 'MALFORMED_ARTIFACT');
    if (id === 'A5-S-MALFORMED-MISSING') {
      const duplicate = await service.execute();
      assertProof(
        duplicate.status === 'FAILED' && duplicate.duplicate && !duplicate.committed,
        'MALFORMED_DUPLICATE_STATUS',
      );
      assertProof(service.snapshot().ledger.providerCalls === 1, 'MALFORMED_DUPLICATE_DISPATCH');
    }
    return;
  }
  if (definition.acceptanceId === 'A5-T-TIMEOUT-01') {
    assertProof(receipt.status === 'UNKNOWN', 'TIMEOUT_NOT_UNKNOWN');
    assertProof(receipt.reconciliationRequired, 'TIMEOUT_RECONCILIATION');
    if (id === 'A5-S-TIMEOUT-NO-REPLAY') {
      const duplicate = await service.execute();
      assertProof(duplicate.status === 'UNKNOWN' && duplicate.duplicate, 'TIMEOUT_REPLAYED');
      assertProof(adapter.receivedRequests.length === 1, 'TIMEOUT_SECOND_DISPATCH');
    }
    if (id === 'A5-S-TIMEOUT-RECONCILE') {
      const reconciled = await service.reconcile(fixture.request);
      assertProof(reconciled.reasonClass === 'RECONCILIATION_BLOCKED', 'TIMEOUT_RECONCILE');
      assertProof(adapter.lookupRequests.length === 1, 'TIMEOUT_LOOKUP_COUNT');

      const pending = await exerciseReconciliationOutcome(fixture.result, service.controls);
      assertProof(
        pending.receipt.status === 'UNKNOWN' &&
          pending.receipt.reasonClass === 'RECONCILIATION_PENDING' &&
          pending.receipt.reconciliationRequired &&
          pending.snapshot.records[0]?.state === 'RECONCILIATION_REQUIRED',
        'RECONCILIATION_PENDING_COLLAPSED',
      );
      auxiliarySnapshots.push(pending.snapshot);

      const succeeded = await exerciseReconciliationOutcome(
        createProofFixture('A5-FX-01', 'A5-S-SUCCESS-STRICT').result,
        service.controls,
      );
      assertProof(
        succeeded.receipt.status === 'SUCCEEDED' &&
          succeeded.receipt.reasonClass === 'RECONCILED' &&
          succeeded.receipt.committed &&
          !succeeded.receipt.reconciliationRequired,
        'RECONCILIATION_SUCCESS_NOT_COMMITTED',
      );
      assertProof(
        succeeded.snapshot.ledger.candidateCommits === 1,
        'RECONCILIATION_SUCCESS_LEDGER',
      );
      auxiliarySnapshots.push(succeeded.snapshot);

      const failed = await exerciseReconciliationOutcome(
        createProofFixture('A5-FX-10', 'A5-S-META-FAILURE').result,
        service.controls,
      );
      assertProof(
        failed.receipt.status === 'FAILED' &&
          failed.receipt.reasonClass === 'RECONCILED' &&
          !failed.receipt.committed &&
          !failed.receipt.reconciliationRequired,
        'RECONCILIATION_FAILURE_NOT_TERMINAL',
      );
      assertProof(failed.snapshot.ledger.candidateCommits === 0, 'RECONCILIATION_FAILURE_COMMIT');
      auxiliarySnapshots.push(failed.snapshot);

      const prohibited = await exerciseReconciliationOutcome(
        createCanarySuccessResult(),
        service.controls,
      );
      const prohibitedRetained = canonicalJson(
        prohibited.snapshot.records.map((record) => record.result),
      );
      assertProof(
        prohibited.receipt.status === 'UNKNOWN' &&
          prohibited.receipt.reasonClass === 'RECONCILIATION_BLOCKED' &&
          prohibited.receipt.reconciliationRequired &&
          prohibited.snapshot.ledger.candidateCommits === 0,
        'RECONCILIATION_PROHIBITED_RESULT_ACCEPTED',
      );
      assertProof(
        !A5_CANARY_VALUES.some((canary) => prohibitedRetained.includes(canary)),
        'RECONCILIATION_PROHIBITED_RESULT_RETAINED',
      );
      auxiliarySnapshots.push(prohibited.snapshot);
    }
    return;
  }
  if (definition.acceptanceId === 'A5-T-RATE-01') {
    if (id === 'A5-S-RATE-SDK-ZERO') {
      assertProof(service.snapshot().ledger.sdkRetries === 0, 'SDK_RETRY_OCCURRED');
    } else if (id === 'A5-S-RATE-PERSISTED') {
      const snapshot = service.snapshot();
      assertProof(receipt.retryScheduled, 'RATE_NOT_SCHEDULED');
      assertProof(snapshot.records[0]?.state === 'RETRY_WAIT', 'RATE_NOT_PERSISTED');
      assertProof(snapshot.ledger.retrySchedules === 1, 'RATE_SCHEDULE_NOT_RECORDED');
      assertProof(snapshot.ledger.workerSleeps === 0, 'RATE_WORKER_SLEPT');
    } else if (id === 'A5-S-RATE-NO-SLEEP') {
      assertProof(service.snapshot().ledger.workerSleeps === 0, 'WORKER_SLEEP_OCCURRED');
    } else {
      assertProof(receipt.retryScheduled, 'RATE_NOT_SCHEDULED');
    }
    return;
  }
  if (definition.acceptanceId === 'A5-T-SAFETY-01') {
    assertProof(!receipt.committed, 'SAFETY_COMMITTED');
    assertProof(!receipt.repairEligible, 'SAFETY_REPAIR');
    assertProof(service.snapshot().ledger.retrySchedules === 0, 'SAFETY_RETRY');
    if (id === 'A5-S-SAFETY-BLOCK') {
      const droppedFixture = createProofFixture('A5-FX-08', id);
      const droppedResult = structuredClone(
        createProofFixture('A5-FX-01', 'A5-S-SUCCESS-STRICT').result,
      ) as unknown as Record<string, unknown>;
      droppedResult.redaction = {
        ...(droppedResult.redaction as Record<string, unknown>),
        outcome: 'DROPPED',
        reason_codes: ['PROHIBITED_CONTENT_DROPPED'],
        redacted_field_paths: ['/summary'],
        output_digest: null,
      };
      const droppedAdapter = new ScriptedModelProviderAdapter({
        result: droppedResult as unknown as ModelProviderInvocationResultV1,
      });
      const droppedService = new ProviderRuntimeProofService(
        droppedFixture,
        droppedAdapter,
        service.controls,
      );
      const dropped = await droppedService.execute();
      const droppedSnapshot = droppedService.snapshot();
      assertProof(dropped.status !== 'SUCCEEDED' && !dropped.committed, 'DROPPED_OUTPUT_SUCCEEDED');
      assertProof(!dropped.repairEligible && !dropped.retryScheduled, 'DROPPED_OUTPUT_RETRIED');
      assertProof(droppedSnapshot.ledger.candidateCommits === 0, 'DROPPED_OUTPUT_COMMIT');
      assertProof(droppedSnapshot.ledger.artifactEffects === 0, 'DROPPED_OUTPUT_ARTIFACT');
      assertProof(droppedSnapshot.ledger.taskEffects === 0, 'DROPPED_OUTPUT_TASK');
      assertProof(droppedSnapshot.ledger.stateEffects === 0, 'DROPPED_OUTPUT_STATE');
      auxiliarySnapshots.push(droppedSnapshot);
    }
    return;
  }
  if (definition.acceptanceId === 'A5-T-SECRET-01') {
    const snapshot = service.snapshot();
    const retained = canonicalJson({
      requests: adapter.receivedRequests,
      results: snapshot.records.map((record) => record.result),
      logs: snapshot.logs,
      evidence: snapshot.evidence,
      artifacts: snapshot.artifacts,
      tasks: snapshot.tasks,
      analytics: snapshot.analytics,
      debug: snapshot.debug,
    });
    assertProof(!A5_CANARY_VALUES.some((canary) => retained.includes(canary)), 'SECRET_RETAINED');
    return;
  }
  if (definition.acceptanceId === 'A5-T-META-01') {
    assertProof(receipt.status === fixture.result.status, 'META_STATUS');
    return;
  }
}

async function exerciseReconciliationOutcome(
  reconciliationResult: ModelProviderInvocationResultV1,
  controls: Readonly<ProofControls>,
): Promise<{
  readonly receipt: ProofExecutionReceipt;
  readonly snapshot: ProofStoreSnapshot;
}> {
  const fixture = createProofFixture('A5-FX-06', 'A5-S-TIMEOUT-RECONCILE');
  const adapter = new ScriptedModelProviderAdapter({
    result: fixture.result,
    reconciliationResult,
  });
  const service = new ProviderRuntimeProofService(fixture, adapter, controls);
  const initial = await service.execute();
  assertProof(
    initial.status === 'UNKNOWN' && initial.reconciliationRequired,
    'RECONCILIATION_SETUP',
  );
  const receipt = await service.reconcile(fixture.request);
  assertProof(adapter.lookupRequests.length === 1, 'RECONCILIATION_OUTCOME_LOOKUP');
  return { receipt, snapshot: service.snapshot() };
}

function createCanarySuccessResult(): ModelProviderInvocationResultV1 {
  const unsafe = structuredClone(
    createProofFixture('A5-FX-01', 'A5-S-SUCCESS-STRICT').result,
  ) as unknown as Record<string, unknown>;
  const unsafeCandidate = {
    fixture_status: 'complete',
    summary: A5_CANARY_VALUES.join('|'),
  };
  const unsafeDigest = canonicalDigest(unsafeCandidate);
  const candidate = unsafe.candidate_output as Record<string, unknown>;
  candidate.canonical_json = canonicalJson(unsafeCandidate);
  candidate.content_digest = unsafeDigest;
  const redaction = unsafe.redaction as Record<string, unknown>;
  redaction.input_digest = unsafeDigest;
  redaction.output_digest = unsafeDigest;
  return unsafe as unknown as ModelProviderInvocationResultV1;
}

async function exerciseRepair(
  id: A5ScenarioId,
  fixture: ProofFixture,
  service: ProviderRuntimeProofService,
): Promise<void> {
  if (id === 'A5-S-REPAIR-NON-VALIDATION') {
    const receipt = await service.execute();
    assertProof(!receipt.repairEligible, 'NON_VALIDATION_REPAIR');
    return;
  }
  const failed = await service.execute();
  assertProof(failed.repairEligible, 'VALIDATION_REPAIR_ELIGIBILITY');
  const repair = structuredClone(fixture.repairRequest);
  if (id === 'A5-S-REPAIR-NEW-INVOCATION') {
    const invocation = repair.repair_invocation as unknown as Record<string, unknown>;
    invocation.invocation_id = fixture.request.invocation_id;
    refreshRepairIntegrity(repair);
    let rejected = false;
    try {
      service.assertRepair(repair);
    } catch {
      rejected = true;
    }
    assertProof(rejected, 'REPAIR_INVOCATION_REUSE_ACCEPTED');
    return;
  }
  if (id === 'A5-S-REPAIR-DISJOINT-RESERVATION') {
    (repair as unknown as Record<string, unknown>).repair_reservation_ids = [
      repair.original_reservation_ids[0],
    ];
    refreshRepairIntegrity(repair);
    let rejected = false;
    try {
      service.assertRepair(repair);
    } catch {
      rejected = true;
    }
    assertProof(rejected, 'REPAIR_RESERVATION_REUSE_ACCEPTED');
    return;
  }
  if (id === 'A5-S-REPAIR-SAFE-DIAGNOSTICS') {
    (repair as unknown as Record<string, unknown>).safe_validation_diagnostics = [
      {
        code: 'RAW_PROMPT',
        instance_path: '',
        schema_path: '/required',
        keyword: 'required',
        expected_class: 'REQUIRED',
      },
    ];
    refreshRepairIntegrity(repair);
    let rejected = false;
    try {
      service.assertRepair(repair);
    } catch {
      rejected = true;
    }
    assertProof(rejected, 'UNSAFE_REPAIR_DIAGNOSTIC_ACCEPTED');
    return;
  }
  if (id === 'A5-S-REPAIR-EXHAUSTED') {
    service.assertRepair(repair);
    service.beginRepair(
      fixture.request.invocation_id,
      String((repair.repair_invocation as Record<string, unknown>).invocation_id),
      repair.repair_reservation_ids[0],
    );
    const repairReceipt = await service.execute(createRepairInvocationRequest(fixture, repair));
    assertProof(
      repairReceipt.status === 'FAILED' &&
        repairReceipt.reasonClass === 'VALIDATION' &&
        !repairReceipt.committed,
      'REPAIR_EXHAUSTION_NOT_TERMINAL',
    );
    const repairSnapshot = service.snapshot();
    assertProof(repairSnapshot.records.length === 2, 'REPAIR_INVOCATION_NOT_PERSISTED');
    assertProof(repairSnapshot.ledger.providerCalls === 2, 'REPAIR_PROVIDER_CALL_COUNT');
    assertProof(repairSnapshot.ledger.reservations === 2, 'REPAIR_RESERVATION_COUNT');
    let rejected = false;
    try {
      service.beginRepair(
        fixture.request.invocation_id,
        '80000000-0000-4000-8000-000000000013',
        '80000000-0000-4000-8000-000000000014',
      );
    } catch {
      rejected = true;
    }
    assertProof(rejected, 'SECOND_REPAIR_ACCEPTED');
    return;
  }
  service.assertRepair(repair);
  if (id === 'A5-S-REPAIR-ELIGIBLE') {
    service.beginRepair(
      fixture.request.invocation_id,
      String((repair.repair_invocation as Record<string, unknown>).invocation_id),
      repair.repair_reservation_ids[0],
    );
    const repairReceipt = await service.execute(createRepairInvocationRequest(fixture, repair));
    assertProof(
      repairReceipt.status === 'FAILED' &&
        repairReceipt.reasonClass === 'VALIDATION' &&
        !repairReceipt.committed,
      'REPAIR_RESULT_NOT_VALIDATED',
    );
    const snapshot = service.snapshot();
    assertProof(snapshot.records.length === 2, 'REPAIR_IDENTITY_NOT_SEPARATE');
    assertProof(snapshot.ledger.providerCalls === 2, 'REPAIR_NOT_DISPATCHED_ONCE');
    assertProof(snapshot.ledger.reservations === 2, 'REPAIR_NOT_SEPARATELY_RESERVED');
  }
}

function createRepairInvocationRequest(
  fixture: ProofFixture,
  repair: ModelProviderRepairRequestV1,
): ModelProviderInvocationRequestV1 {
  const request = structuredClone(fixture.request) as unknown as Record<string, unknown>;
  const invocation = repair.repair_invocation as Record<string, unknown>;
  const reservation = {
    ...fixture.request.budget_reservations[0],
    reservation_id: repair.repair_reservation_ids[0],
    category: 'SCHEMA_REPAIRS',
  };
  request.invocation_id = invocation.invocation_id;
  request.logical_idempotency_key = invocation.logical_idempotency_key;
  request.request_digest = invocation.request_digest;
  request.context_manifest = structuredClone(invocation.context_manifest);
  request.repair_linkage = structuredClone(invocation.repair_linkage);
  request.budget_reservations = [reservation];
  request.budget_reservations_digest = canonicalDigest([reservation]);
  return request as unknown as ModelProviderInvocationRequestV1;
}

async function exerciseCancellation(
  id: A5ScenarioId,
  fixture: ProofFixture,
  service: ProviderRuntimeProofService,
  adapter: ScriptedModelProviderAdapter,
  barrier: DeferredBarrier | undefined,
): Promise<void> {
  assertProof(barrier !== undefined, 'CANCEL_BARRIER');
  if (id === 'A5-S-CANCEL-PRE-DISPATCH') {
    const receipt = await service.execute(fixture.request, { preCanceled: true });
    assertProof(receipt.status === 'CANCELED', 'PRE_CANCEL_STATUS');
    assertProof(adapter.receivedRequests.length === 0, 'PRE_CANCEL_DISPATCH');
    barrier.release();
    return;
  }
  const execution = service.execute();
  await barrier.reached;
  if (
    id === 'A5-S-CANCEL-SIGNAL' ||
    id === 'A5-S-CANCEL-LATE-SUCCESS' ||
    id === 'A5-S-CANCEL-RECONCILE'
  ) {
    service.cancel(fixture.request.invocation_id);
  } else if (id === 'A5-S-CANCEL-LEASE-LOSS') {
    service.loseLease(fixture.request.invocation_id);
  } else {
    service.markTerminal(fixture.request.invocation_id);
  }
  barrier.release();
  const receipt = await execution;
  if (id === 'A5-S-CANCEL-SIGNAL') assertProof(adapter.abortObserved, 'ABORT_NOT_OBSERVED');
  assertProof(!receipt.committed, 'LATE_CANCEL_COMMITTED');
  assertProof(service.snapshot().ledger.artifactEffects === 0, 'LATE_CANCEL_ARTIFACT');
  if (id === 'A5-S-CANCEL-RECONCILE') {
    const reconciled = await service.reconcile(fixture.request);
    assertProof(
      reconciled.status === 'UNKNOWN' &&
        reconciled.reasonClass === 'RECONCILIATION_BLOCKED' &&
        reconciled.reconciliationRequired,
      'CANCEL_RECONCILIATION_RESULT',
    );
    assertProof(adapter.lookupRequests.length === 1, 'CANCEL_RECONCILIATION_LOOKUP');
    const reconciledSnapshot = service.snapshot();
    assertProof(reconciledSnapshot.ledger.reconciliations === 1, 'CANCEL_RECONCILIATION_LEDGER');
    assertProof(reconciledSnapshot.ledger.candidateCommits === 0, 'CANCEL_RECONCILIATION_COMMIT');
    assertProof(reconciledSnapshot.ledger.artifactEffects === 0, 'CANCEL_RECONCILIATION_ARTIFACT');
    assertProof(reconciledSnapshot.ledger.taskEffects === 0, 'CANCEL_RECONCILIATION_TASK');
    assertProof(reconciledSnapshot.ledger.stateEffects === 0, 'CANCEL_RECONCILIATION_STATE');
  }
}

async function exerciseVersion(
  id: A5ScenarioId,
  fixture: ProofFixture,
  service: ProviderRuntimeProofService,
  adapter: ScriptedModelProviderAdapter,
  barrier: DeferredBarrier | undefined,
): Promise<void> {
  if (id === 'A5-S-VERSION-PRODUCTION') {
    const receipt = await service.execute(fixture.request, { environment: 'PRODUCTION' });
    assertProof(
      receipt.reasonClass === 'DETERMINISTIC_DEPLOYED_ENVIRONMENT_REJECTED',
      'PRODUCTION_FIXTURE',
    );
    assertProof(service.snapshot().ledger.providerCalls === 0, 'PRODUCTION_PROVIDER_CALL');
    return;
  }
  if (id === 'A5-S-VERSION-EXTERNAL') {
    const request = structuredClone(fixture.request) as unknown as Record<string, unknown>;
    request.execution_guard = {
      ...(fixture.request.execution_guard as Record<string, unknown>),
      provider_key: 'OPENAI_RESPONSES_DIRECT',
    };
    const receipt = await service.execute(request as unknown as ModelProviderInvocationRequestV1);
    assertProof(receipt.reasonClass === 'EXTERNAL_PROVIDER_DISABLED', 'EXTERNAL_ACTIVATED');
    return;
  }
  if (id === 'A5-S-VERSION-DRIFT') {
    const result = structuredClone(fixture.result) as unknown as Record<string, unknown>;
    result.resolved = {
      ...(fixture.result.resolved as Record<string, unknown>),
      model_key: 'fixture-model-drifted',
    };
    let rejected = false;
    try {
      service.validator.assertResultBindings(
        fixture.request,
        result as unknown as ModelProviderInvocationResultV1,
        fixture.configuration,
      );
    } catch {
      rejected = true;
    }
    assertProof(rejected, 'DRIFT_ACCEPTED');
    return;
  }
  if (id === 'A5-S-VERSION-CIRCUIT') {
    const primaryDigest = String(fixture.configuration.configuration_digest) as Sha256;
    service.setKilled(true, 'FIXTURE_TARGET_KILLED');
    const killed = await service.execute();
    assertProof(killed.reasonClass === 'TARGET_OR_CIRCUIT_BLOCKED', 'KILL_DID_NOT_BLOCK');
    service.applyTarget(fixture.alternateConfiguration, fixture.alternateTargetDecision, 'ROLLOUT');
    adapter.setResult(resultForConfiguration(fixture, fixture.alternateConfiguration));
    const killScopedAlternate = await service.execute(
      requestForTarget(
        fixture,
        fixture.alternateConfiguration,
        fixture.alternateTargetDecision,
        97,
      ),
    );
    assertProof(killScopedAlternate.committed, 'KILL_GLOBALLY_POISONED_ALTERNATE');
    const rollbackTarget = createRollbackTarget(fixture);
    service.applyTarget(fixture.configuration, rollbackTarget, 'ROLLBACK');
    adapter.setResult(resultForConfiguration(fixture, fixture.configuration));
    service.setKilled(false, 'FIXTURE_TARGET_RECOVERY_AUTHORIZED');
    service.setCircuit('OPEN', 'FIXTURE_FAILURE_THRESHOLD');
    const opened = await service.execute(
      requestForTarget(fixture, fixture.configuration, rollbackTarget, 99),
    );
    assertProof(opened.reasonClass === 'TARGET_OR_CIRCUIT_BLOCKED', 'OPEN_DID_NOT_BLOCK');
    service.applyTarget(fixture.alternateConfiguration, fixture.alternateTargetDecision, 'ROLLOUT');
    adapter.setResult(resultForConfiguration(fixture, fixture.alternateConfiguration));
    const circuitScopedAlternate = await service.execute(
      requestForTarget(
        fixture,
        fixture.alternateConfiguration,
        fixture.alternateTargetDecision,
        98,
      ),
    );
    assertProof(circuitScopedAlternate.committed, 'CIRCUIT_GLOBALLY_POISONED_ALTERNATE');
    service.applyTarget(fixture.configuration, rollbackTarget, 'ROLLBACK');
    adapter.setResult(resultForConfiguration(fixture, fixture.configuration));
    service.setCircuit('HALF_OPEN', 'FIXTURE_RECOVERY_PROBE_REQUIRED');
    const halfOpen = await service.execute(
      requestForTarget(fixture, fixture.configuration, rollbackTarget, 100),
    );
    assertProof(halfOpen.reasonClass === 'TARGET_OR_CIRCUIT_BLOCKED', 'HALF_OPEN_FALLBACK');
    assertProof(adapter.receivedRequests.length === 2, 'CIRCUIT_AUTO_FALLBACK');
    const probe = await service.execute(
      requestForTarget(fixture, fixture.configuration, rollbackTarget, 95),
      { halfOpenProbe: true },
    );
    assertProof(probe.committed, 'RECOVERY_PROBE_FAILED');
    const secondProbe = await service.execute(
      requestForTarget(fixture, fixture.configuration, rollbackTarget, 96),
      { halfOpenProbe: true },
    );
    assertProof(
      secondProbe.reasonClass === 'TARGET_OR_CIRCUIT_BLOCKED',
      'SECOND_HALF_OPEN_PROBE_ACCEPTED',
    );
    service.setCircuit('CLOSED', 'FIXTURE_RECOVERY_ACCEPTED');
    const snapshot = service.snapshot();
    assertProof(snapshot.ledger.providerCalls === 3, 'RECOVERY_PROBE_CALL_COUNT');
    assertProof(snapshot.ledger.reservations === 3, 'RECOVERY_PROBE_RESERVATION');
    assertProof(
      snapshot.targetTransitions.some(
        (transition) =>
          transition.kind === 'KILL' &&
          transition.configurationDigest === primaryDigest &&
          transition.killed === true &&
          transition.reasonCode === 'FIXTURE_TARGET_KILLED',
      ),
      'KILL_DECISION_NOT_PERSISTED',
    );
    return;
  }
  if (id === 'A5-S-VERSION-HISTORY') {
    const first = await service.execute();
    assertProof(first.committed, 'HISTORY_INITIAL');
    service.applyConfiguration(
      String(fixture.alternateConfiguration.configuration_digest) as Sha256,
    );
    const record = service.snapshot().records[0];
    assertProof(
      canonicalJson(record.configurationRef) ===
        canonicalJson(fixture.request.versions.provider_configuration),
      'HISTORY_REWRITTEN',
    );
    const historicalAttempt = requestForTarget(
      fixture,
      fixture.configuration,
      fixture.targetDecision,
      92,
    );
    const blocked = await service.execute(historicalAttempt);
    assertProof(blocked.reasonClass === 'TARGET_OR_CIRCUIT_BLOCKED', 'HISTORICAL_NEW_STARTED');
    assertProof(service.snapshot().ledger.providerCalls === 1, 'HISTORICAL_NEW_DISPATCHED');

    service.applyTarget(fixture.alternateConfiguration, fixture.alternateTargetDecision, 'ROLLOUT');
    adapter.setResult(resultForConfiguration(fixture, fixture.alternateConfiguration));
    const rollout = await service.execute(
      requestForTarget(
        fixture,
        fixture.alternateConfiguration,
        fixture.alternateTargetDecision,
        93,
      ),
    );
    assertProof(rollout.committed, 'ROLLOUT_NEW_TARGET_FAILED');

    const rollbackTarget = createRollbackTarget(fixture);
    service.applyTarget(fixture.configuration, rollbackTarget, 'ROLLBACK');
    adapter.setResult(resultForConfiguration(fixture, fixture.configuration));
    const rollback = await service.execute(
      requestForTarget(fixture, fixture.configuration, rollbackTarget, 94),
    );
    assertProof(rollback.committed, 'ROLLBACK_NEW_TARGET_FAILED');
    const after = service.snapshot();
    assertProof(after.ledger.providerCalls === 3, 'TARGET_LIFECYCLE_CALL_COUNT');
    assertProof(after.records.length === 3, 'TARGET_LIFECYCLE_RECORD_COUNT');
    assertProof(
      canonicalJson(after.records.map((entry) => entry.configurationRef)) ===
        canonicalJson([
          fixture.configuration.configuration_ref,
          fixture.alternateConfiguration.configuration_ref,
          fixture.configuration.configuration_ref,
        ]),
      'TARGET_LIFECYCLE_LINEAGE',
    );
    assertProof(
      after.targetTransitions.some((transition) => transition.reasonCode === 'ROLLOUT') &&
        after.targetTransitions.some((transition) => transition.reasonCode === 'ROLLBACK'),
      'TARGET_DECISIONS_NOT_PERSISTED',
    );
    return;
  }
  assertProof(barrier !== undefined, 'VERSION_ROLLOUT_BARRIER');
  const inFlightExecution = service.execute();
  await barrier.reached;
  service.applyTarget(fixture.alternateConfiguration, fixture.alternateTargetDecision, 'ROLLOUT');
  barrier.release();
  const inFlight = await inFlightExecution;
  assertProof(inFlight.committed, 'IN_FLIGHT_TARGET_REWRITTEN');
  assertProof(
    canonicalJson(service.snapshot().records[0]?.configurationRef) ===
      canonicalJson(fixture.configuration.configuration_ref),
    'IN_FLIGHT_LINEAGE_CHANGED',
  );
  adapter.setResult(resultForConfiguration(fixture, fixture.alternateConfiguration));
  const next = await service.execute(
    requestForTarget(fixture, fixture.alternateConfiguration, fixture.alternateTargetDecision, 91),
  );
  assertProof(next.committed, 'VERSION_NEW_TARGET_FAILED');
  const exactSnapshot = service.snapshot();
  assertProof(exactSnapshot.ledger.providerCalls === 2, 'VERSION_TARGET_CALL_COUNT');
  assertProof(exactSnapshot.ledger.reservations === 2, 'VERSION_TARGET_RESERVATIONS');
}

async function exerciseReplay(
  id: A5ScenarioId,
  fixture: ProofFixture,
  service: ProviderRuntimeProofService,
  barrier: DeferredBarrier | undefined,
): Promise<void> {
  if (id === 'A5-S-REPLAY-DUPLICATE') {
    assertProof(barrier !== undefined, 'REPLAY_BARRIER');
    const firstExecution = service.execute();
    await barrier.reached;
    const concurrentExecution = service.execute();
    barrier.release();
    const [first, concurrent] = await Promise.all([firstExecution, concurrentExecution]);
    assertProof(concurrent.duplicate && !concurrent.committed, 'CONCURRENT_REPLAY_NOT_DEDUPED');
    const converged = await service.execute();
    assertProof(
      first.committed && converged.duplicate && converged.committed,
      'REPLAY_CONVERGENCE',
    );
    const snapshot = service.snapshot();
    assertProof(snapshot.ledger.providerCalls === 1, 'CONCURRENT_SECOND_DISPATCH');
    assertProof(snapshot.ledger.reservations === 1, 'CONCURRENT_SECOND_RESERVATION');
    assertProof(snapshot.ledger.candidateCommits === 1, 'CONCURRENT_SECOND_COMMIT');
    return;
  }

  const first = await service.execute();
  if (id === 'A5-S-REPLAY-COLLISION') {
    const collision = structuredClone(fixture.request) as unknown as Record<string, unknown>;
    collision.request_digest = `sha256:${'9'.repeat(64)}`;
    const receipt = await service.execute(collision as unknown as ModelProviderInvocationRequestV1);
    assertProof(receipt.reasonClass === 'IDEMPOTENCY_COLLISION', 'REPLAY_COLLISION_ACCEPTED');
    assertProof(service.snapshot().ledger.providerCalls === 1, 'REPLAY_COLLISION_DISPATCH');
    return;
  }
  const second = await service.execute();
  assertProof(first.status === 'UNKNOWN' && second.status === 'UNKNOWN', 'UNKNOWN_REPLAY_STATUS');
  assertProof(second.reconciliationRequired, 'UNKNOWN_REPLAY_RECONCILIATION');
  assertProof(service.snapshot().ledger.providerCalls === 1, 'DUPLICATE_SECOND_DISPATCH');
}

function requestForTarget(
  fixture: ProofFixture,
  configuration: ModelProviderConfigurationV1,
  target: ModelProviderTargetDecisionV1,
  sequence: number,
): ModelProviderInvocationRequestV1 {
  const request = structuredClone(fixture.request) as unknown as Record<string, unknown>;
  const suffix = String(sequence).padStart(12, '0');
  const configurationRef = structuredClone(configuration.configuration_ref);
  const resolved = target.resolved_target as Record<string, unknown>;
  const reservation = {
    ...fixture.request.budget_reservations[0],
    reservation_id: `70000000-0000-4000-8000-${suffix}`,
  };
  request.attempt_id = `30000000-0000-4000-8000-${suffix}`;
  request.invocation_id = `31000000-0000-4000-8000-${suffix}`;
  request.logical_idempotency_key = `model.invoke.fixture.target.${sequence}`;
  request.request_digest = canonicalDigest({ sequence, target: target.decision_digest });
  request.versions = {
    ...fixture.request.versions,
    provider_configuration: configurationRef,
  };
  request.target_decision_id = target.decision_id;
  request.target_decision_digest = target.decision_digest;
  request.execution_guard = {
    ...fixture.request.execution_guard,
    provider_key: configuration.provider_key,
    adapter_kind: configuration.adapter_kind,
    execution_mode: configuration.execution_mode,
    configuration_ref: configurationRef,
    target_decision_id: target.decision_id,
    target_decision_digest: target.decision_digest,
    target_decision_status: target.decision_status,
    target_decision_kind: target.decision_kind,
    resolved_target_digest: resolved.target_digest,
  };
  request.budget_reservations = [reservation];
  request.budget_reservations_digest = canonicalDigest([reservation]);
  return request as unknown as ModelProviderInvocationRequestV1;
}

function resultForConfiguration(
  fixture: ProofFixture,
  configuration: ModelProviderConfigurationV1,
): ModelProviderInvocationResultV1 {
  const result = structuredClone(fixture.result) as unknown as Record<string, unknown>;
  result.requested_provider = configuration.provider_key;
  result.requested_model = configuration.model_key;
  result.provider_configuration_ref = structuredClone(configuration.configuration_ref);
  result.resolved = {
    ...(fixture.result.resolved as Record<string, unknown>),
    provider_key: configuration.provider_key,
    model_key: configuration.model_key,
    model_revision: configuration.model_revision,
  };
  return result as unknown as ModelProviderInvocationResultV1;
}

function createRollbackTarget(fixture: ProofFixture): ModelProviderTargetDecisionV1 {
  const target = structuredClone(fixture.targetDecision) as Record<string, unknown>;
  target.decision_id = '50000000-0000-4000-8000-000000000094';
  target.decision_digest = `sha256:${'9'.repeat(64)}`;
  target.decision_kind = 'ROLLBACK';
  target.selected_configuration_ref = structuredClone(fixture.configuration.configuration_ref);
  target.previous_configuration_ref = structuredClone(
    fixture.alternateConfiguration.configuration_ref,
  );
  target.reason_code = 'FIXTURE_ROLLBACK_ACCEPTED_CONFIGURATION';
  target.effective_at = '2026-08-15T04:03:02Z';
  return target;
}
