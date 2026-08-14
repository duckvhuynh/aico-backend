import { randomUUID } from 'node:crypto';

import {
  canonicalDigest,
  emptyLedger,
  finitePositive,
  isSafeRelativePath,
  type OutputEvidence,
  type SandboxAdapterReceipt,
  type SandboxProofReceipt,
  type SandboxProofRequest,
  type SandboxReason,
  type SideEffectLedger,
} from './contracts';

export interface SandboxProofAdapter {
  execute(request: SandboxProofRequest): Promise<SandboxAdapterReceipt>;
  cancel(request: SandboxProofRequest): Promise<SandboxAdapterReceipt>;
}

export interface StoredReceipt {
  requestDigest: string;
  receipt: SandboxProofReceipt;
}

export type ReceiptSnapshot = readonly (readonly [string, StoredReceipt])[];

const ALLOWED_COMMANDS = new Set([
  'FORMAT_CHECK',
  'LINT',
  'TYPECHECK',
  'TEST',
  'PRODUCTION_BUILD',
  'NETWORK_DNS_PROBE',
  'NETWORK_IP_PROBE',
  'CREDENTIAL_PROBE',
  'FS_LINK_PROBE',
  'LIMIT_PROBE',
  'OUTPUT_FLOOD',
  'TIMEOUT_PROBE',
  'CANCEL_PROBE',
]);

const FORBIDDEN_ENVIRONMENT = /(?:TOKEN|SECRET|PASSWORD|CREDENTIAL|DATABASE|JWT|AWS|S3|PROXY)/i;
const ENFORCE_GATE_AND_CANCEL = true;
const ENFORCE_TENANT_AUTHORITY = true;
const ENFORCE_BUNDLE_BINDING = true;
const ENFORCE_COMMAND_BINDING = true;
const ENFORCE_LINK_OUTPUT_INTEGRITY = true;
const ENFORCE_FINAL_OUTPUT_BINDING = true;
const ENFORCE_IDEMPOTENCY = true;
const ENFORCE_CANARY_SCAN = true;

export class SandboxProofDenied extends Error {
  public constructor(public readonly reason: SandboxReason) {
    super(reason);
  }
}

export class SandboxProofConflict extends Error {
  public constructor(public readonly code: 'IDEMPOTENCY_CONFLICT') {
    super(code);
  }
}

export class SandboxProofService {
  public readonly ledger: SideEffectLedger;
  private readonly receipts = new Map<string, StoredReceipt>();

  public constructor(
    private readonly adapter: SandboxProofAdapter,
    ledger: SideEffectLedger = emptyLedger(),
  ) {
    this.ledger = ledger;
  }

  public importReceipts(receipts: ReceiptSnapshot): void {
    for (const [key, value] of receipts) this.receipts.set(key, structuredClone(value));
  }

  public exportReceipts(): ReceiptSnapshot {
    return [...this.receipts.entries()].map(([key, value]) => [key, structuredClone(value)]);
  }

  public async execute(request: SandboxProofRequest): Promise<SandboxProofReceipt> {
    const requestDigest = canonicalDigest({
      ...request,
      logicalIdempotencyKey: undefined,
      caseId: undefined,
    });
    const replay = ENFORCE_IDEMPOTENCY
      ? this.receipts.get(request.logicalIdempotencyKey)
      : undefined;
    if (replay !== undefined) {
      if (replay.requestDigest !== requestDigest) {
        throw new SandboxProofConflict('IDEMPOTENCY_CONFLICT');
      }
      return { ...structuredClone(replay.receipt), replayed: true };
    }

    try {
      this.assertGateAndCancellation(request);
      this.assertTenant(request);
      this.assertTemplateAndDependencyBinding(request);
      this.assertFilesystemBoundary(request);
      this.assertCommandBinding(request);
      this.assertNetworkBoundary(request);
      this.assertCredentialBoundary(request);
      this.assertResourceLimits(request);
      this.assertOutputPolicy(request);
    } catch (error) {
      if (!(error instanceof SandboxProofDenied)) throw error;
      this.ledger.policyDenials += 1;
      const receipt = this.denialReceipt(request, requestDigest, error.reason);
      this.receipts.set(request.logicalIdempotencyKey, { requestDigest, receipt });
      return structuredClone(receipt);
    }

    this.ledger.sandboxStarts += 1;
    this.ledger.commandStarts += 1;
    this.ledger.budgetReservations += 1;
    const adapterReceipt =
      request.executionProfile === 'CANCEL_PROBE'
        ? await this.adapter.cancel(request)
        : await this.adapter.execute(request);
    this.ledger.networkReceiverHits += adapterReceipt.networkReceiverHits;
    this.ledger.credentialFindings += adapterReceipt.credentialFindings;
    if (!adapterReceipt.cleanupComplete) this.ledger.cleanupFailures += 1;

    let result = adapterReceipt.result;
    let reason = adapterReceipt.reason;
    if (adapterReceipt.output !== undefined) {
      try {
        this.assertOutputIntegrity(adapterReceipt.output, request);
      } catch (error) {
        if (!(error instanceof SandboxProofDenied)) throw error;
        result = 'FAILED';
        reason = error.reason;
      }
    }
    if (result === 'SUCCEEDED' && adapterReceipt.cleanupComplete) {
      this.ledger.promotions += 1;
    }

    const receipt: SandboxProofReceipt = {
      schemaVersion: 1,
      caseId: request.caseId,
      result,
      ...(reason === undefined ? {} : { reason }),
      requestDigest,
      receiptId: randomUUID(),
      workloadId: adapterReceipt.workloadId,
      replayed: false,
      startedAt: adapterReceipt.startedAt,
      endedAt: adapterReceipt.endedAt,
      outputDigest: adapterReceipt.output?.aggregateDigest ?? null,
      cleanupComplete: adapterReceipt.cleanupComplete,
      runtimeClass: adapterReceipt.runtimeClass,
    };
    this.receipts.set(request.logicalIdempotencyKey, { requestDigest, receipt });
    return structuredClone(receipt);
  }

  public assertEvidenceSafe(evidence: unknown, canaries: readonly string[]): void {
    if (!ENFORCE_CANARY_SCAN) return;
    const serialized = JSON.stringify(evidence);
    if (canaries.some((canary) => serialized.includes(canary))) {
      throw new SandboxProofDenied('SECURITY');
    }
  }

  private assertGateAndCancellation(request: SandboxProofRequest): void {
    if (!ENFORCE_GATE_AND_CANCEL) return;
    if (
      request.gateStatus !== 'APPROVED' ||
      request.currentGateId !== request.approvedGateId ||
      request.designVersionId !== request.approvedDesignVersionId
    ) {
      throw new SandboxProofDenied('APPROVAL_MISSING');
    }
    if (request.cancellationGeneration !== request.expectedCancellationGeneration) {
      throw new SandboxProofDenied('CANCELED');
    }
    if (Date.parse(request.expiresAt) <= Date.now()) {
      throw new SandboxProofDenied('STALE_VERSION');
    }
  }

  private assertTenant(request: SandboxProofRequest): void {
    if (!ENFORCE_TENANT_AUTHORITY) return;
    if (request.companyId !== request.currentCompanyId) {
      throw new SandboxProofDenied('TENANT_MISMATCH');
    }
  }

  private assertTemplateAndDependencyBinding(request: SandboxProofRequest): void {
    if (!ENFORCE_BUNDLE_BINDING) return;
    if (request.templateArchiveDigest !== request.acceptedTemplateArchiveDigest) {
      throw new SandboxProofDenied('TEMPLATE_INTEGRITY');
    }
    if (
      request.dependencyBundleDigest !== request.acceptedDependencyBundleDigest ||
      request.lockfileDigest !== request.acceptedLockfileDigest
    ) {
      throw new SandboxProofDenied('DEPENDENCY_NOT_ALLOWED');
    }
  }

  private assertFilesystemBoundary(request: SandboxProofRequest): void {
    const paths = [...request.inputPaths, ...request.writablePaths, request.workingDirectory];
    if (
      paths.some((path) => !isSafeRelativePath(path)) ||
      request.writablePaths.some((path) => !path.startsWith('src') && !path.startsWith('dist'))
    ) {
      throw new SandboxProofDenied('FILESYSTEM_BOUNDARY');
    }
  }

  private assertCommandBinding(request: SandboxProofRequest): void {
    if (!ENFORCE_COMMAND_BINDING) return;
    if (!ALLOWED_COMMANDS.has(request.commandId)) {
      throw new SandboxProofDenied('COMMAND_NOT_ALLOWED');
    }
    if (request.commandBindingDigest !== request.expectedCommandBindingDigest) {
      throw new SandboxProofDenied('INVALID_CONTEXT');
    }
  }

  private assertNetworkBoundary(request: SandboxProofRequest): void {
    if (request.networkMode !== 'NONE') {
      throw new SandboxProofDenied('EGRESS_DENIED');
    }
  }

  private assertCredentialBoundary(request: SandboxProofRequest): void {
    if (
      Object.keys(request.environment).some((key) => FORBIDDEN_ENVIRONMENT.test(key)) ||
      Object.values(request.environment).some((value) => FORBIDDEN_ENVIRONMENT.test(value))
    ) {
      throw new SandboxProofDenied('CREDENTIAL_BOUNDARY');
    }
  }

  private assertResourceLimits(request: SandboxProofRequest): void {
    const limits = Object.values(request.resourceLimits);
    if (!limits.every(finitePositive)) throw new SandboxProofDenied('RESOURCE_LIMIT');
    if (
      request.resourceLimits.wallTimeMs > 30_000 ||
      request.resourceLimits.cpuCount > 1 ||
      request.resourceLimits.memoryBytes > 1024 * 1024 * 1024 ||
      request.resourceLimits.pids > 64 ||
      request.resourceLimits.writableBytes > 64 * 1024 * 1024
    ) {
      throw new SandboxProofDenied('RESOURCE_LIMIT');
    }
  }

  private assertOutputPolicy(request: SandboxProofRequest): void {
    if (
      request.outputPolicy.roots.length !== 1 ||
      request.outputPolicy.roots[0] !== 'dist' ||
      !finitePositive(request.outputPolicy.maximumFiles) ||
      !finitePositive(request.outputPolicy.maximumBytes) ||
      request.outputPolicy.maximumFiles > 128 ||
      request.outputPolicy.maximumBytes > request.resourceLimits.outputBytes ||
      request.resourceLimits.stdoutBytes > 64 * 1024 ||
      request.resourceLimits.stderrBytes > 64 * 1024
    ) {
      throw new SandboxProofDenied('OUTPUT_LIMIT');
    }
  }

  private assertOutputIntegrity(output: OutputEvidence, request: SandboxProofRequest): void {
    if (!ENFORCE_LINK_OUTPUT_INTEGRITY && output.files.some((file) => file.kind === 'SYMLINK')) {
      return;
    }
    if (!ENFORCE_FINAL_OUTPUT_BINDING && request.caseId === 'A4-T-OUTPUT-INTEGRITY-01') {
      return;
    }
    if (
      output.files.some(
        (file) =>
          file.kind !== 'REGULAR' ||
          !isSafeRelativePath(file.path) ||
          !file.path.startsWith('dist/') ||
          !request.outputPolicy.mediaTypes.includes(file.mediaType),
      ) ||
      output.files.length > request.outputPolicy.maximumFiles ||
      output.totalBytes > request.outputPolicy.maximumBytes ||
      output.aggregateDigest !== canonicalDigest(output.files)
    ) {
      throw new SandboxProofDenied('OUTPUT_INTEGRITY');
    }
  }

  private denialReceipt(
    request: SandboxProofRequest,
    requestDigest: string,
    reason: SandboxReason,
  ): SandboxProofReceipt {
    return {
      schemaVersion: 1,
      caseId: request.caseId,
      result: 'DENIED',
      reason,
      requestDigest,
      receiptId: randomUUID(),
      workloadId: null,
      replayed: false,
      startedAt: null,
      endedAt: new Date().toISOString(),
      outputDigest: null,
      cleanupComplete: true,
      runtimeClass: null,
    };
  }
}
