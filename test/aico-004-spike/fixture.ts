import { randomUUID } from 'node:crypto';

import { canonicalDigest, type A4ThreatCase, type SandboxProofRequest } from './contracts';

export const ACCEPTED_TEMPLATE_ARCHIVE_DIGEST =
  'sha256:be46961ef94b58ab5b0d383f7d27fafb639f2682ca22c559b22256d26e3f2166';
export const ACCEPTED_DEPENDENCY_BUNDLE_DIGEST =
  'sha256:352c7508e8f0f8fd27c4556012a54be061c3df880846e874fc4238d7e7259f0c';
export const ACCEPTED_LOCKFILE_DIGEST =
  'sha256:22e0e8531a72cc2848ef14b2d73ecae6a5046f9ace5791c566d74fa24186eb99';
export const ACCEPTED_DESIGN_MANIFEST_DIGEST =
  'sha256:7bb45f0355e41164e6a3dd8abfa7e18196834609fcc3f6b8761140b3085c0198';

export const COMPANY_A = '00000000-0000-4000-8000-00000000000a';
export const COMPANY_B = '00000000-0000-4000-8000-00000000000b';
export const HOST_CANARY = 'AICO004_HOST_CANARY_8fd54c';
export const COMPANY_A_CANARY = 'AICO004_COMPANY_A_CANARY_b1b255';
export const COMPANY_B_CANARY = 'AICO004_COMPANY_B_CANARY_734d2b';
export const CREDENTIAL_CANARY = 'AICO004_CREDENTIAL_CANARY_e1aa29';

const profileByCase: Record<A4ThreatCase, SandboxProofRequest['executionProfile']> = {
  'A4-T-BUILD-01': 'BUILD',
  'A4-T-TEMPLATE-01': 'BUILD',
  'A4-T-DEPENDENCY-01': 'BUILD',
  'A4-T-GATE-01': 'BUILD',
  'A4-T-TENANT-01': 'BUILD',
  'A4-T-HOST-01': 'FS_LINK_PROBE',
  'A4-T-WORKSPACE-01': 'FS_LINK_PROBE',
  'A4-T-FS-LINK-01': 'FS_LINK_PROBE',
  'A4-T-COMMAND-01': 'BUILD',
  'A4-T-COMMAND-BINDING-01': 'BUILD',
  'A4-T-EGRESS-DNS-01': 'NETWORK_DNS_PROBE',
  'A4-T-EGRESS-IP-01': 'NETWORK_IP_PROBE',
  'A4-T-CREDENTIAL-01': 'CREDENTIAL_PROBE',
  'A4-T-CPU-01': 'LIMIT_PROBE',
  'A4-T-MEMORY-PID-01': 'LIMIT_PROBE',
  'A4-T-STORAGE-01': 'LIMIT_PROBE',
  'A4-T-OUTPUT-01': 'OUTPUT_FLOOD',
  'A4-T-TIMEOUT-01': 'TIMEOUT_PROBE',
  'A4-T-CANCEL-01': 'CANCEL_PROBE',
  'A4-T-REPLAY-01': 'BUILD',
  'A4-T-OUTPUT-INTEGRITY-01': 'FS_LINK_PROBE',
  'A4-T-REDACTION-CLEANUP-01': 'CREDENTIAL_PROBE',
};

export function createProofRequest(
  caseId: A4ThreatCase,
  overrides: Partial<SandboxProofRequest> = {},
): SandboxProofRequest {
  const commandId = profileByCase[caseId] === 'BUILD' ? 'PRODUCTION_BUILD' : profileByCase[caseId];
  const binding = canonicalDigest({
    commandId,
    argv: [],
    cwd: 'template',
    environment: { AICO_PROOF_MODE: 'true' },
  });
  return {
    schemaVersion: 1,
    caseId,
    companyId: COMPANY_B,
    runId: '00000000-0000-4000-8000-000000000101',
    taskId: '00000000-0000-4000-8000-000000000102',
    attemptId: randomUUID(),
    workspaceId: randomUUID(),
    currentCompanyId: COMPANY_B,
    approvedGateId: '00000000-0000-4000-8000-000000000103',
    currentGateId: '00000000-0000-4000-8000-000000000103',
    gateStatus: 'APPROVED',
    designVersionId: '00000000-0000-4000-8000-000000000104',
    approvedDesignVersionId: '00000000-0000-4000-8000-000000000104',
    templateArchiveDigest: ACCEPTED_TEMPLATE_ARCHIVE_DIGEST,
    acceptedTemplateArchiveDigest: ACCEPTED_TEMPLATE_ARCHIVE_DIGEST,
    dependencyBundleDigest: ACCEPTED_DEPENDENCY_BUNDLE_DIGEST,
    acceptedDependencyBundleDigest: ACCEPTED_DEPENDENCY_BUNDLE_DIGEST,
    lockfileDigest: ACCEPTED_LOCKFILE_DIGEST,
    acceptedLockfileDigest: ACCEPTED_LOCKFILE_DIGEST,
    commandId,
    commandBindingDigest: binding,
    expectedCommandBindingDigest: binding,
    workingDirectory: 'template',
    writablePaths: ['src', 'dist'],
    inputPaths: ['src', 'package.json', 'package-lock.json'],
    environment: { AICO_PROOF_MODE: 'true' },
    networkMode: 'NONE',
    resourceLimits: {
      wallTimeMs: 25_000,
      cpuCount: 1,
      memoryBytes: 1024 * 1024 * 1024,
      pids: 64,
      writableBytes: 64 * 1024 * 1024,
      fileCount: 128,
      stdoutBytes: 64 * 1024,
      stderrBytes: 64 * 1024,
      outputBytes: 16 * 1024 * 1024,
    },
    outputPolicy: {
      roots: ['dist'],
      mediaTypes: ['text/html', 'text/css', 'application/javascript'],
      maximumFiles: 64,
      maximumBytes: 16 * 1024 * 1024,
    },
    cancellationGeneration: 1,
    expectedCancellationGeneration: 1,
    expiresAt: '2099-01-01T00:00:00.000Z',
    logicalIdempotencyKey: randomUUID(),
    manifestDigest: ACCEPTED_DESIGN_MANIFEST_DIGEST,
    executionProfile: profileByCase[caseId],
    ...overrides,
  };
}
