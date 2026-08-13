import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  A4_THREAT_CASES,
  emptyLedger,
  type A4ThreatCase,
  type SandboxProofReceipt,
} from './aico-004-spike/contracts';
import {
  acceptedImageManifestDigestFromProvenance,
  assertNoAico004Resources,
  DockerSandboxProofAdapter,
  materializeAcceptedSandboxImage,
  startUnknownWorkloadForProof,
} from './aico-004-spike/docker-adapter';
import {
  ACCEPTED_DEPENDENCY_BUNDLE_DIGEST,
  COMPANY_A,
  COMPANY_A_CANARY,
  COMPANY_B_CANARY,
  CREDENTIAL_CANARY,
  createProofRequest,
  HOST_CANARY,
} from './aico-004-spike/fixture';
import { SandboxProofConflict, SandboxProofService } from './aico-004-spike/proof-service';

const describeProof = process.env.AICO_REQUIRE_SANDBOX_PROOF === 'true' ? describe : describe.skip;
const onlyCase = process.env.AICO004_ONLY_CASE as A4ThreatCase | undefined;

function expectDeniedWithoutAdapter(
  receipt: SandboxProofReceipt,
  service: SandboxProofService,
): void {
  expect(receipt.result).toBe('DENIED');
  expect(service.ledger).toEqual({
    ...emptyLedger(),
    policyDenials: 1,
  });
}

async function runCase(
  caseId: A4ThreatCase,
  action: () => Promise<void>,
  completed: Set<A4ThreatCase>,
): Promise<void> {
  if (onlyCase !== undefined && onlyCase !== caseId) return;
  try {
    await action();
    completed.add(caseId);
    process.stdout.write(`${caseId}=PASS\n`);
  } catch (error) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    throw new Error(`${caseId} failed: ${detail}`);
  }
}

describeProof('AICO-004 isolated sandbox proof', () => {
  jest.setTimeout(240_000);

  it('proves every accepted A4 threat case with no skipped registry entry', async () => {
    materializeAcceptedSandboxImage();
    expect(acceptedImageManifestDigestFromProvenance()).toBe(ACCEPTED_DEPENDENCY_BUNDLE_DIGEST);
    const adapter = new DockerSandboxProofAdapter();
    const completed = new Set<A4ThreatCase>();
    let canonicalBuildOutputDigest: string | null = null;

    await runCase(
      'A4-T-BUILD-01',
      async () => {
        const service = new SandboxProofService(adapter);
        const receipt = await service.execute(createProofRequest('A4-T-BUILD-01'));
        expect(receipt).toMatchObject({
          result: 'SUCCEEDED',
          cleanupComplete: true,
          runtimeClass: 'DEVELOPMENT_ONLY_RUNC',
        });
        expect(receipt.outputDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
        canonicalBuildOutputDigest = receipt.outputDigest;
        expect(service.ledger).toEqual({
          ...emptyLedger(),
          sandboxStarts: 1,
          commandStarts: 1,
          budgetReservations: 1,
          promotions: 1,
        });
        expect(adapter.executionEvidence.at(-1)?.commandCount).toBe(5);
      },
      completed,
    );

    await runCase(
      'A4-T-TEMPLATE-01',
      async () => {
        const service = new SandboxProofService(adapter);
        const request = createProofRequest('A4-T-TEMPLATE-01', {
          templateArchiveDigest: `sha256:${'0'.repeat(64)}`,
        });
        expectDeniedWithoutAdapter(await service.execute(request), service);
      },
      completed,
    );

    await runCase(
      'A4-T-DEPENDENCY-01',
      async () => {
        const service = new SandboxProofService(adapter);
        const request = createProofRequest('A4-T-DEPENDENCY-01', {
          lockfileDigest: `sha256:${'1'.repeat(64)}`,
        });
        expectDeniedWithoutAdapter(await service.execute(request), service);
      },
      completed,
    );

    await runCase(
      'A4-T-GATE-01',
      async () => {
        const service = new SandboxProofService(adapter);
        const request = createProofRequest('A4-T-GATE-01', { gateStatus: 'PENDING' });
        expectDeniedWithoutAdapter(await service.execute(request), service);
      },
      completed,
    );

    await runCase(
      'A4-T-TENANT-01',
      async () => {
        const service = new SandboxProofService(adapter);
        const request = createProofRequest('A4-T-TENANT-01', {
          currentCompanyId: COMPANY_A,
        });
        const receipt = await service.execute(request);
        expectDeniedWithoutAdapter(receipt, service);
        expect(receipt).toMatchObject({ reason: 'TENANT_MISMATCH', workloadId: null });
      },
      completed,
    );

    for (const caseId of ['A4-T-HOST-01', 'A4-T-WORKSPACE-01', 'A4-T-FS-LINK-01'] as const) {
      await runCase(
        caseId,
        async () => {
          const service = new SandboxProofService(adapter);
          const receipt = await service.execute(createProofRequest(caseId));
          expect(receipt.result).toBe('FAILED');
          expect(receipt.cleanupComplete).toBe(true);
          expect(service.ledger.promotions).toBe(0);
          if (caseId === 'A4-T-FS-LINK-01') {
            expect(receipt.reason).toBe('OUTPUT_INTEGRITY');
            expect(adapter.executionEvidence.at(-1)?.output?.files).toEqual(
              expect.arrayContaining([expect.objectContaining({ kind: 'SYMLINK' })]),
            );
          } else {
            expect(receipt.reason).toBe('FILESYSTEM_BOUNDARY');
            expect(adapter.executionEvidence.at(-1)?.runtimeControls).toMatchObject({
              hostBindCount: 0,
              deviceCount: 0,
            });
          }
        },
        completed,
      );
    }

    await runCase(
      'A4-T-COMMAND-01',
      async () => {
        const service = new SandboxProofService(adapter);
        const request = createProofRequest('A4-T-COMMAND-01', { commandId: 'sh -c env' });
        const receipt = await service.execute(request);
        expectDeniedWithoutAdapter(receipt, service);
        expect(receipt.reason).toBe('COMMAND_NOT_ALLOWED');
      },
      completed,
    );

    await runCase(
      'A4-T-COMMAND-BINDING-01',
      async () => {
        const service = new SandboxProofService(adapter);
        const request = createProofRequest('A4-T-COMMAND-BINDING-01', {
          commandBindingDigest: `sha256:${'2'.repeat(64)}`,
        });
        const receipt = await service.execute(request);
        expectDeniedWithoutAdapter(receipt, service);
        expect(receipt.reason).toBe('INVALID_CONTEXT');
      },
      completed,
    );

    for (const caseId of ['A4-T-EGRESS-DNS-01', 'A4-T-EGRESS-IP-01'] as const) {
      await runCase(
        caseId,
        async () => {
          const service = new SandboxProofService(adapter);
          const receipt = await service.execute(createProofRequest(caseId));
          expect(receipt).toMatchObject({
            result: 'FAILED',
            reason: 'EGRESS_DENIED',
            cleanupComplete: true,
          });
          expect(service.ledger.networkReceiverHits).toBe(0);
        },
        completed,
      );
    }

    await runCase(
      'A4-T-CREDENTIAL-01',
      async () => {
        const service = new SandboxProofService(adapter);
        const receipt = await service.execute(createProofRequest('A4-T-CREDENTIAL-01'));
        expect(receipt).toMatchObject({ result: 'FAILED', reason: 'CREDENTIAL_BOUNDARY' });
        expect(service.ledger.credentialFindings).toBe(0);
        service.assertEvidenceSafe({ receipt, evidence: adapter.executionEvidence.at(-1) }, [
          HOST_CANARY,
          COMPANY_A_CANARY,
          COMPANY_B_CANARY,
          CREDENTIAL_CANARY,
        ]);
      },
      completed,
    );

    for (const caseId of ['A4-T-CPU-01', 'A4-T-MEMORY-PID-01', 'A4-T-STORAGE-01'] as const) {
      await runCase(
        caseId,
        async () => {
          const service = new SandboxProofService(adapter);
          const base = createProofRequest(caseId);
          const request =
            caseId === 'A4-T-CPU-01'
              ? {
                  ...base,
                  resourceLimits: {
                    ...base.resourceLimits,
                    wallTimeMs: 800,
                    cpuCount: 0.25,
                  },
                }
              : caseId === 'A4-T-MEMORY-PID-01'
                ? {
                    ...base,
                    resourceLimits: {
                      ...base.resourceLimits,
                      wallTimeMs: 5_000,
                      memoryBytes: 128 * 1024 * 1024,
                      pids: 32,
                    },
                  }
                : {
                    ...base,
                    resourceLimits: {
                      ...base.resourceLimits,
                      outputBytes: 1024 * 1024,
                    },
                    outputPolicy: {
                      ...base.outputPolicy,
                      maximumFiles: 64,
                      maximumBytes: 1024 * 1024,
                    },
                  };
          const receipt = await service.execute(request);
          expect(receipt.result).toBe('FAILED');
          expect(['RESOURCE_LIMIT', 'OUTPUT_INTEGRITY', 'TIMEOUT']).toContain(receipt.reason);
          expect(receipt.cleanupComplete).toBe(true);
          expect(service.ledger.promotions).toBe(0);
          expect(adapter.executionEvidence.at(-1)?.runtimeControls).toMatchObject({
            networkMode: 'none',
            readonlyRootfs: true,
            pidsLimit: request.resourceLimits.pids,
            memoryBytes: request.resourceLimits.memoryBytes,
            nanoCpus: request.resourceLimits.cpuCount * 1_000_000_000,
            capDropAll: true,
            noNewPrivileges: true,
            user: '1000:1000',
            hostBindCount: 0,
            deviceCount: 0,
          });
        },
        completed,
      );
    }

    await runCase(
      'A4-T-OUTPUT-01',
      async () => {
        const service = new SandboxProofService(adapter);
        const receipt = await service.execute(createProofRequest('A4-T-OUTPUT-01'));
        expect(receipt).toMatchObject({ result: 'FAILED', reason: 'OUTPUT_LIMIT' });
        expect(adapter.executionEvidence.at(-1)?.stdout.length).toBeLessThanOrEqual(64 * 1024);
      },
      completed,
    );

    await runCase(
      'A4-T-TIMEOUT-01',
      async () => {
        const service = new SandboxProofService(adapter);
        const receipt = await service.execute(
          createProofRequest('A4-T-TIMEOUT-01', {
            resourceLimits: {
              ...createProofRequest('A4-T-TIMEOUT-01').resourceLimits,
              wallTimeMs: 800,
            },
          }),
        );
        expect(receipt).toMatchObject({
          result: 'FAILED',
          reason: 'TIMEOUT',
          cleanupComplete: true,
        });
      },
      completed,
    );

    await runCase(
      'A4-T-CANCEL-01',
      async () => {
        const deniedService = new SandboxProofService(adapter);
        const denied = await deniedService.execute(
          createProofRequest('A4-T-CANCEL-01', {
            cancellationGeneration: 2,
            expectedCancellationGeneration: 1,
          }),
        );
        expectDeniedWithoutAdapter(denied, deniedService);
        expect(denied.reason).toBe('CANCELED');
        const service = new SandboxProofService(adapter);
        const receipt = await service.execute(createProofRequest('A4-T-CANCEL-01'));
        expect(receipt).toMatchObject({
          result: 'CANCELED',
          reason: 'CANCELED',
          cleanupComplete: true,
        });
        expect(service.ledger.promotions).toBe(0);
      },
      completed,
    );

    await runCase(
      'A4-T-REPLAY-01',
      async () => {
        const service = new SandboxProofService(adapter);
        const request = createProofRequest('A4-T-REPLAY-01');
        const first = await service.execute(request);
        expect(first.result).toBe('SUCCEEDED');
        if (canonicalBuildOutputDigest === null) {
          canonicalBuildOutputDigest = first.outputDigest;
        } else {
          expect(first.outputDigest).toBe(canonicalBuildOutputDigest);
        }
        const temporaryDirectory = mkdtempSync(join(tmpdir(), 'aico004-replay-'));
        try {
          const receiptSnapshot = join(temporaryDirectory, 'receipts.json');
          const requestSnapshot = join(temporaryDirectory, 'request.json');
          writeFileSync(receiptSnapshot, JSON.stringify(service.exportReceipts()), 'utf8');
          writeFileSync(requestSnapshot, JSON.stringify(request), 'utf8');
          const replacement = spawnSync(
            process.execPath,
            ['-r', 'ts-node/register', 'test/aico-004-spike/replacement-probe.ts'],
            {
              cwd: process.cwd(),
              encoding: 'utf8',
              env: {
                ...process.env,
                AICO004_REPLACEMENT_MODE: 'REPLAY',
                AICO004_RECEIPT_SNAPSHOT: receiptSnapshot,
                AICO004_REQUEST_SNAPSHOT: requestSnapshot,
              },
            },
          );
          expect(replacement.status).toBe(0);
          const replay = JSON.parse(replacement.stdout.trim()) as {
            processId: number;
            sandboxStarts: number;
            receipt: SandboxProofReceipt;
          };
          expect(replay.processId).not.toBe(process.pid);
          expect(replay.sandboxStarts).toBe(0);
          expect(replay.receipt).toEqual({ ...first, replayed: true });
        } finally {
          rmSync(temporaryDirectory, { recursive: true, force: true });
        }
        await expect(
          service.execute({ ...request, designVersionId: randomUUID() }),
        ).rejects.toBeInstanceOf(SandboxProofConflict);

        const unknownWorkload = startUnknownWorkloadForProof(request.logicalIdempotencyKey);
        const replacement = spawnSync(
          process.execPath,
          ['-r', 'ts-node/register', 'test/aico-004-spike/replacement-probe.ts'],
          {
            cwd: process.cwd(),
            encoding: 'utf8',
            env: {
              ...process.env,
              AICO004_REPLACEMENT_MODE: 'RECONCILE',
              AICO004_WORKLOAD_ID: unknownWorkload,
            },
          },
        );
        expect(replacement.status).toBe(0);
        const unknown = JSON.parse(replacement.stdout.trim()) as {
          processId: number;
          evidence: {
            result: string;
            reason: string;
            existingWorkloads: number;
            startedNewWorkloads: number;
            cleanupComplete: boolean;
          };
        };
        expect(unknown.processId).not.toBe(process.pid);
        expect(unknown.evidence).toMatchObject({
          result: 'UNKNOWN',
          reason: 'UNKNOWN_OUTCOME',
          existingWorkloads: 1,
          startedNewWorkloads: 0,
          cleanupComplete: true,
        });
      },
      completed,
    );

    await runCase(
      'A4-T-OUTPUT-INTEGRITY-01',
      async () => {
        const service = new SandboxProofService(adapter);
        const receipt = await service.execute(createProofRequest('A4-T-OUTPUT-INTEGRITY-01'));
        expect(receipt).toMatchObject({ result: 'FAILED', reason: 'OUTPUT_INTEGRITY' });
        expect(service.ledger.promotions).toBe(0);
      },
      completed,
    );

    await runCase(
      'A4-T-REDACTION-CLEANUP-01',
      async () => {
        const service = new SandboxProofService(adapter);
        const receipt = await service.execute(createProofRequest('A4-T-REDACTION-CLEANUP-01'));
        service.assertEvidenceSafe(
          { receipt, ledger: service.ledger, evidence: adapter.executionEvidence.at(-1) },
          [HOST_CANARY, COMPANY_A_CANARY, COMPANY_B_CANARY, CREDENTIAL_CANARY],
        );
        expect(() =>
          service.assertEvidenceSafe({ syntheticLeakProbe: HOST_CANARY }, [HOST_CANARY]),
        ).toThrow('SECURITY');
        expect(receipt.cleanupComplete).toBe(true);
        assertNoAico004Resources();
      },
      completed,
    );

    expect([...completed]).toEqual(onlyCase === undefined ? A4_THREAT_CASES : [onlyCase]);
    if (onlyCase === undefined) expect(adapter.executionEvidence).toHaveLength(16);
    assertNoAico004Resources();
    process.stdout.write(
      `${JSON.stringify({
        evidenceSchema: 'aico-004-sandbox-proof/v1',
        threatCases: completed.size,
        skipped: 0,
        runtimeClass: 'DEVELOPMENT_ONLY_RUNC',
        externalPaidServices: 0,
      })}\n`,
    );
  });
});
