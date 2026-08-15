import {
  DEFAULT_A5_PROOF_CONTROLS,
  assertProof,
  canonicalDigest,
  emptyProofLedger,
  type ModelProviderInvocationRequestV1,
  type ModelProviderInvocationResultV1,
  type ProofControls,
  type ProofSideEffectLedger,
  type Sha256,
  type VersionReference,
} from './contracts';

export type ProofAttemptState =
  | 'READY'
  | 'DISPATCHING'
  | 'DISPATCHED'
  | 'RETRY_WAIT'
  | 'RECONCILIATION_REQUIRED'
  | 'CANCELED'
  | 'BLOCKED'
  | 'SUCCEEDED'
  | 'FAILED';

export interface ProofInvocationRecord {
  readonly logicalKey: string;
  readonly requestDigest: Sha256;
  readonly attemptId: string;
  readonly invocationId: string;
  readonly configurationRef: VersionReference;
  readonly schemaRef: VersionReference;
  state: ProofAttemptState;
  dispatchPhase: 'NOT_DISPATCHED' | 'DISPATCHED' | 'UNCERTAIN';
  leaseGeneration: number;
  cancellationGeneration: number;
  terminalGeneration: number;
  repairCount: number;
  retryCount: number;
  result: ModelProviderInvocationResultV1 | null;
  nextAttemptAt: string | null;
  reservationIds: string[];
  committedDigest: Sha256 | null;
}

export type ReservationOutcome =
  | { readonly kind: 'CREATED'; readonly record: ProofInvocationRecord }
  | { readonly kind: 'DUPLICATE'; readonly record: ProofInvocationRecord }
  | { readonly kind: 'COLLISION'; readonly record: ProofInvocationRecord }
  | { readonly kind: 'RECONCILIATION_REQUIRED'; readonly record: ProofInvocationRecord };

export interface ProofStoreSnapshot {
  readonly records: readonly Readonly<ProofInvocationRecord>[];
  readonly ledger: Readonly<ProofSideEffectLedger>;
  readonly logs: readonly Readonly<Record<string, unknown>>[];
  readonly evidence: readonly Readonly<Record<string, unknown>>[];
  readonly artifacts: readonly Readonly<Record<string, unknown>>[];
  readonly tasks: readonly Readonly<Record<string, unknown>>[];
  readonly analytics: readonly Readonly<Record<string, unknown>>[];
  readonly debug: readonly Readonly<Record<string, unknown>>[];
  readonly activeConfigurationDigest: Sha256 | null;
  readonly circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  readonly killActive: boolean;
  readonly targetTransitions: readonly Readonly<Record<string, unknown>>[];
}

export class InMemoryProviderRuntimeStore {
  private readonly byLogicalKey = new Map<string, ProofInvocationRecord>();
  private readonly byInvocation = new Map<string, ProofInvocationRecord>();
  private readonly ledgerState = emptyProofLedger();
  private readonly safeLogs: Array<Record<string, unknown>> = [];
  private readonly safeEvidence: Array<Record<string, unknown>> = [];
  private readonly committedArtifacts: Array<Record<string, unknown>> = [];
  private readonly safeTasks: Array<Record<string, unknown>> = [];
  private readonly safeAnalytics: Array<Record<string, unknown>> = [];
  private readonly safeDebug: Array<Record<string, unknown>> = [];
  private readonly targetTransitions: Array<Record<string, unknown>> = [];
  private activeConfigurationDigest: Sha256 | null = null;
  private readonly targetStates = new Map<
    Sha256,
    {
      circuit: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
      killed: boolean;
      halfOpenProbeAvailable: boolean;
    }
  >();

  constructor(private readonly controls: Readonly<ProofControls> = DEFAULT_A5_PROOF_CONTROLS) {}

  reserve(request: ModelProviderInvocationRequestV1): ReservationOutcome {
    const existing = this.byLogicalKey.get(request.logical_idempotency_key);
    if (existing && this.controls.atomicIdempotency) {
      if (existing.requestDigest !== request.request_digest)
        return { kind: 'COLLISION', record: existing };
      if (existing.state === 'RECONCILIATION_REQUIRED') {
        return { kind: 'RECONCILIATION_REQUIRED', record: existing };
      }
      return { kind: 'DUPLICATE', record: existing };
    }

    const configurationRef = request.versions.provider_configuration;
    const schemaRef = request.versions.output_schema;
    assertProof(configurationRef !== null && schemaRef !== null, 'STORE_VERSION_REF');
    const record: ProofInvocationRecord = {
      logicalKey: request.logical_idempotency_key,
      requestDigest: request.request_digest,
      attemptId: request.attempt_id,
      invocationId: request.invocation_id,
      configurationRef,
      schemaRef,
      state: 'READY',
      dispatchPhase: 'NOT_DISPATCHED',
      leaseGeneration: 1,
      cancellationGeneration: 0,
      terminalGeneration: 0,
      repairCount: 0,
      retryCount: 0,
      result: null,
      nextAttemptAt: null,
      reservationIds: request.budget_reservations.map((reservation) =>
        String(reservation.reservation_id),
      ),
      committedDigest: null,
    };
    this.byLogicalKey.set(request.logical_idempotency_key, record);
    this.byInvocation.set(request.invocation_id, record);
    this.ledgerState.reservations += record.reservationIds.length;
    return { kind: 'CREATED', record };
  }

  beginDispatch(invocationId: string): ProofInvocationRecord {
    const record = this.require(invocationId);
    assertProof(record.state === 'READY', 'DISPATCH_STATE');
    record.state = 'DISPATCHING';
    record.dispatchPhase = 'DISPATCHED';
    this.ledgerState.providerCalls += 1;
    return record;
  }

  recordResult(invocationId: string, result: ModelProviderInvocationResultV1): void {
    const record = this.require(invocationId);
    record.result = result;
    if (record.state === 'CANCELED') {
      record.dispatchPhase = 'UNCERTAIN';
      return;
    }
    if (result.status === 'UNKNOWN') {
      record.state = 'RECONCILIATION_REQUIRED';
      record.dispatchPhase = result.failure?.dispatch_phase ?? 'UNCERTAIN';
    } else if (result.status === 'FAILED') {
      record.state = 'FAILED';
    } else if (result.status === 'CANCELED') {
      record.state = 'CANCELED';
    } else {
      record.state = 'DISPATCHED';
    }
  }

  cancel(invocationId: string): void {
    const record = this.require(invocationId);
    record.cancellationGeneration += 1;
    record.state = 'CANCELED';
  }

  loseLease(invocationId: string): void {
    const record = this.require(invocationId);
    record.leaseGeneration += 1;
  }

  markTerminal(invocationId: string): void {
    const record = this.require(invocationId);
    record.terminalGeneration += 1;
  }

  markValidationFailed(invocationId: string): void {
    const record = this.require(invocationId);
    record.state = 'FAILED';
  }

  scheduleRetry(
    invocationId: string,
    nextAttemptAt: string,
    deadlineAt: string,
    remainingRetryBudget: number,
    maximumRetries = 1,
  ): boolean {
    const record = this.require(invocationId);
    if (this.controls.retryHintBounds) {
      const next = Date.parse(nextAttemptAt);
      const deadline = Date.parse(deadlineAt);
      if (!Number.isFinite(next) || !Number.isFinite(deadline) || next > deadline) return false;
    }
    if (remainingRetryBudget <= 0 || record.retryCount >= maximumRetries) return false;
    record.retryCount += 1;
    record.nextAttemptAt = nextAttemptAt;
    if (this.controls.persistedRetryNoSleep) {
      record.state = 'RETRY_WAIT';
      this.ledgerState.retrySchedules += 1;
    } else {
      record.state = 'READY';
      this.ledgerState.workerSleeps += 1;
    }
    return true;
  }

  beginRepair(
    originalInvocationId: string,
    repairInvocationId: string,
    reservationId: string,
  ): void {
    const record = this.require(originalInvocationId);
    if (this.controls.repairCap) assertProof(record.repairCount < 1, 'STORE_REPAIR_CAP');
    if (this.controls.distinctRepairInvocation) {
      assertProof(repairInvocationId !== originalInvocationId, 'STORE_REPAIR_IDENTITY');
    }
    if (this.controls.disjointRepairReservations) {
      assertProof(!record.reservationIds.includes(reservationId), 'STORE_REPAIR_RESERVATION');
    }
    record.repairCount += 1;
    this.ledgerState.repairInvocations += 1;
  }

  markReconciled(invocationId: string, result: ModelProviderInvocationResultV1 | null): void {
    const record = this.require(invocationId);
    assertProof(record.state === 'RECONCILIATION_REQUIRED', 'RECONCILIATION_STATE');
    this.ledgerState.reconciliations += 1;
    if (result === null) {
      record.state = 'BLOCKED';
      return;
    }
    record.result = result;
    if (result.status === 'SUCCEEDED') {
      record.state = 'DISPATCHED';
    } else if (result.status === 'UNKNOWN') {
      record.state = 'RECONCILIATION_REQUIRED';
      record.dispatchPhase = result.failure?.dispatch_phase ?? 'UNCERTAIN';
    } else {
      record.state = 'BLOCKED';
    }
  }

  markReconciliationRequired(invocationId: string): void {
    const record = this.require(invocationId);
    record.state = 'RECONCILIATION_REQUIRED';
    record.dispatchPhase = 'UNCERTAIN';
  }

  commitCandidate(
    invocationId: string,
    expectedLeaseGeneration: number,
    expectedCancellationGeneration: number,
    expectedTerminalGeneration: number,
    candidate: Readonly<Record<string, unknown>>,
  ): boolean {
    const record = this.require(invocationId);
    if (
      this.controls.lateResultCommitFence &&
      (record.leaseGeneration !== expectedLeaseGeneration ||
        record.cancellationGeneration !== expectedCancellationGeneration ||
        record.terminalGeneration !== expectedTerminalGeneration ||
        record.state !== 'DISPATCHED')
    ) {
      return false;
    }
    const digest = canonicalDigest(candidate);
    record.state = 'SUCCEEDED';
    record.committedDigest = digest;
    this.ledgerState.candidateCommits += 1;
    this.ledgerState.artifactEffects += 1;
    this.ledgerState.taskEffects += 1;
    this.ledgerState.stateEffects += 1;
    this.committedArtifacts.push({ invocationId, contentDigest: digest });
    this.safeTasks.push({ invocationId, outcome: 'CANDIDATE_COMMITTED', contentDigest: digest });
    return true;
  }

  setActiveConfiguration(digest: Sha256, reasonCode = 'TARGET_APPLIED'): void {
    this.activeConfigurationDigest = digest;
    this.targetState(digest);
    this.targetTransitions.push({
      sequence: this.targetTransitions.length + 1,
      kind: 'TARGET',
      configurationDigest: digest,
      reasonCode,
    });
  }

  setCircuit(
    configurationDigest: Sha256,
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN',
    reasonCode = 'CIRCUIT_DECISION_APPLIED',
  ): void {
    const target = this.targetState(configurationDigest);
    target.circuit = state;
    target.halfOpenProbeAvailable = state === 'HALF_OPEN';
    this.targetTransitions.push({
      sequence: this.targetTransitions.length + 1,
      kind: 'CIRCUIT',
      configurationDigest,
      state,
      reasonCode,
    });
  }

  setKilled(
    configurationDigest: Sha256,
    killed: boolean,
    reasonCode = 'KILL_DECISION_APPLIED',
  ): void {
    this.targetState(configurationDigest).killed = killed;
    this.targetTransitions.push({
      sequence: this.targetTransitions.length + 1,
      kind: 'KILL',
      configurationDigest,
      killed,
      reasonCode,
    });
  }

  canStartNewAttempt(configurationDigest: Sha256, halfOpenProbe = false): boolean {
    if (!this.controls.eligibleNewHistoricalLineage) return true;
    const target = this.targetState(configurationDigest);
    if (target.killed || target.circuit === 'OPEN') return false;
    if (target.circuit === 'HALF_OPEN') {
      if (halfOpenProbe && target.halfOpenProbeAvailable) {
        target.halfOpenProbeAvailable = false;
        return true;
      }
      if (this.controls.halfOpenNoFallback) return false;
    }
    return (
      this.activeConfigurationDigest === null ||
      this.activeConfigurationDigest === configurationDigest
    );
  }

  appendSafeLog(value: Readonly<Record<string, unknown>>): void {
    this.safeLogs.push({ ...value });
  }

  appendSafeEvidence(value: Readonly<Record<string, unknown>>): void {
    this.safeEvidence.push({ ...value });
  }

  appendSafeArtifact(value: Readonly<Record<string, unknown>>): void {
    this.committedArtifacts.push({ ...value });
  }

  appendSafeTask(value: Readonly<Record<string, unknown>>): void {
    this.safeTasks.push({ ...value });
  }

  appendSafeAnalytics(value: Readonly<Record<string, unknown>>): void {
    this.safeAnalytics.push({ ...value });
  }

  appendSafeDebug(value: Readonly<Record<string, unknown>>): void {
    this.safeDebug.push({ ...value });
  }

  recordSdkRetry(): void {
    this.ledgerState.sdkRetries += 1;
  }

  recordCostEffect(): void {
    this.ledgerState.costEffects += 1;
  }

  recordToolEffect(): void {
    this.ledgerState.toolEffects += 1;
  }

  snapshot(): ProofStoreSnapshot {
    return {
      records: [...this.byInvocation.values()].map((record) => ({
        ...record,
        reservationIds: [...record.reservationIds],
      })),
      ledger: { ...this.ledgerState },
      logs: this.safeLogs.map((entry) => ({ ...entry })),
      evidence: this.safeEvidence.map((entry) => ({ ...entry })),
      artifacts: this.committedArtifacts.map((entry) => ({ ...entry })),
      tasks: this.safeTasks.map((entry) => ({ ...entry })),
      analytics: this.safeAnalytics.map((entry) => ({ ...entry })),
      debug: this.safeDebug.map((entry) => ({ ...entry })),
      activeConfigurationDigest: this.activeConfigurationDigest,
      circuitState:
        this.activeConfigurationDigest === null
          ? 'CLOSED'
          : this.targetState(this.activeConfigurationDigest).circuit,
      killActive:
        this.activeConfigurationDigest === null
          ? false
          : this.targetState(this.activeConfigurationDigest).killed,
      targetTransitions: this.targetTransitions.map((entry) => ({ ...entry })),
    };
  }

  ledgerDigest(): Sha256 {
    return canonicalDigest(this.snapshot().ledger);
  }

  private require(invocationId: string): ProofInvocationRecord {
    const record = this.byInvocation.get(invocationId);
    assertProof(record !== undefined, 'INVOCATION_NOT_FOUND');
    return record;
  }

  private targetState(configurationDigest: Sha256): {
    circuit: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    killed: boolean;
    halfOpenProbeAvailable: boolean;
  } {
    let target = this.targetStates.get(configurationDigest);
    if (target === undefined) {
      target = { circuit: 'CLOSED', killed: false, halfOpenProbeAvailable: false };
      this.targetStates.set(configurationDigest, target);
    }
    return target;
  }
}
