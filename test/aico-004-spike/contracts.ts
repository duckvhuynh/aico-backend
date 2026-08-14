import { createHash } from 'node:crypto';

export const A4_THREAT_CASES = [
  'A4-T-BUILD-01',
  'A4-T-TEMPLATE-01',
  'A4-T-DEPENDENCY-01',
  'A4-T-GATE-01',
  'A4-T-TENANT-01',
  'A4-T-HOST-01',
  'A4-T-WORKSPACE-01',
  'A4-T-FS-LINK-01',
  'A4-T-COMMAND-01',
  'A4-T-COMMAND-BINDING-01',
  'A4-T-EGRESS-DNS-01',
  'A4-T-EGRESS-IP-01',
  'A4-T-CREDENTIAL-01',
  'A4-T-CPU-01',
  'A4-T-MEMORY-PID-01',
  'A4-T-STORAGE-01',
  'A4-T-OUTPUT-01',
  'A4-T-TIMEOUT-01',
  'A4-T-CANCEL-01',
  'A4-T-REPLAY-01',
  'A4-T-OUTPUT-INTEGRITY-01',
  'A4-T-REDACTION-CLEANUP-01',
] as const;

export type A4ThreatCase = (typeof A4_THREAT_CASES)[number];

export const SANDBOX_RESULTS = ['SUCCEEDED', 'DENIED', 'FAILED', 'CANCELED', 'UNKNOWN'] as const;

export type SandboxResult = (typeof SANDBOX_RESULTS)[number];

export const SANDBOX_REASONS = [
  'APPROVAL_MISSING',
  'STALE_VERSION',
  'TENANT_MISMATCH',
  'INVALID_CONTEXT',
  'ROLE_FORBIDDEN',
  'RESOURCE_OUT_OF_SCOPE',
  'ENVIRONMENT_UNSAFE',
  'BUDGET_UNAVAILABLE',
  'TEMPLATE_INTEGRITY',
  'DEPENDENCY_NOT_ALLOWED',
  'FILESYSTEM_BOUNDARY',
  'COMMAND_NOT_ALLOWED',
  'EGRESS_DENIED',
  'CREDENTIAL_BOUNDARY',
  'RESOURCE_LIMIT',
  'OUTPUT_LIMIT',
  'TIMEOUT',
  'CANCELED',
  'OUTPUT_INTEGRITY',
  'SECURITY',
  'INTEGRITY',
  'UNKNOWN_OUTCOME',
] as const;

export type SandboxReason = (typeof SANDBOX_REASONS)[number];

export interface ResourceLimits {
  wallTimeMs: number;
  cpuCount: number;
  memoryBytes: number;
  pids: number;
  writableBytes: number;
  fileCount: number;
  stdoutBytes: number;
  stderrBytes: number;
  outputBytes: number;
}

export interface OutputPolicy {
  roots: readonly string[];
  mediaTypes: readonly string[];
  maximumFiles: number;
  maximumBytes: number;
}

export interface SandboxProofRequest {
  schemaVersion: 1;
  caseId: A4ThreatCase;
  companyId: string;
  runId: string;
  taskId: string;
  attemptId: string;
  workspaceId: string;
  currentCompanyId: string;
  approvedGateId: string;
  currentGateId: string;
  gateStatus: 'APPROVED' | 'PENDING' | 'REVISION_REQUESTED';
  designVersionId: string;
  approvedDesignVersionId: string;
  templateArchiveDigest: string;
  acceptedTemplateArchiveDigest: string;
  dependencyBundleDigest: string;
  acceptedDependencyBundleDigest: string;
  lockfileDigest: string;
  acceptedLockfileDigest: string;
  commandId: string;
  commandBindingDigest: string;
  expectedCommandBindingDigest: string;
  workingDirectory: string;
  writablePaths: readonly string[];
  inputPaths: readonly string[];
  environment: Readonly<Record<string, string>>;
  networkMode: 'NONE' | 'DEFAULT';
  resourceLimits: ResourceLimits;
  outputPolicy: OutputPolicy;
  cancellationGeneration: number;
  expectedCancellationGeneration: number;
  expiresAt: string;
  logicalIdempotencyKey: string;
  manifestDigest: string;
  executionProfile:
    | 'BUILD'
    | 'NETWORK_DNS_PROBE'
    | 'NETWORK_IP_PROBE'
    | 'CREDENTIAL_PROBE'
    | 'FS_LINK_PROBE'
    | 'LIMIT_PROBE'
    | 'OUTPUT_FLOOD'
    | 'TIMEOUT_PROBE'
    | 'CANCEL_PROBE';
}

export interface OutputFileEvidence {
  path: string;
  bytes: number;
  sha256: string;
  mediaType: string;
  kind: 'REGULAR' | 'SYMLINK' | 'DIRECTORY' | 'SPECIAL';
}

export interface OutputEvidence {
  files: readonly OutputFileEvidence[];
  aggregateDigest: string;
  totalBytes: number;
}

export interface SandboxAdapterReceipt {
  result: Exclude<SandboxResult, 'DENIED'>;
  reason?: SandboxReason;
  workloadId: string;
  startedAt: string;
  endedAt: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  output?: OutputEvidence;
  cleanupComplete: boolean;
  runtimeClass: 'DEVELOPMENT_ONLY_RUNC';
  commandCount: number;
  networkReceiverHits: number;
  credentialFindings: number;
  runtimeControls: {
    networkMode: string;
    readonlyRootfs: boolean;
    pidsLimit: number;
    memoryBytes: number;
    nanoCpus: number;
    capDropAll: boolean;
    noNewPrivileges: boolean;
    user: string;
    hostBindCount: number;
    deviceCount: number;
  };
}

export interface SandboxProofReceipt {
  schemaVersion: 1;
  caseId: A4ThreatCase;
  result: SandboxResult;
  reason?: SandboxReason;
  requestDigest: string;
  receiptId: string;
  workloadId: string | null;
  replayed: boolean;
  startedAt: string | null;
  endedAt: string;
  outputDigest: string | null;
  cleanupComplete: boolean;
  runtimeClass: 'DEVELOPMENT_ONLY_RUNC' | null;
}

export interface SideEffectLedger {
  sandboxStarts: number;
  commandStarts: number;
  networkReceiverHits: number;
  credentialFindings: number;
  promotions: number;
  businessEvents: number;
  continuations: number;
  budgetReservations: number;
  costEffects: number;
  policyDenials: number;
  cleanupFailures: number;
}

export const emptyLedger = (): SideEffectLedger => ({
  sandboxStarts: 0,
  commandStarts: 0,
  networkReceiverHits: 0,
  credentialFindings: 0,
  promotions: 0,
  businessEvents: 0,
  continuations: 0,
  budgetReservations: 0,
  costEffects: 0,
  policyDenials: 0,
  cleanupFailures: 0,
});

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalDigest(value: unknown): string {
  return `sha256:${sha256(canonicalJson(value))}`;
}

export function isSafeRelativePath(value: string): boolean {
  if (value.length === 0 || value.length > 240 || value.includes('\\')) return false;
  if (value.startsWith('/') || value.startsWith('.') || value.includes('//')) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
