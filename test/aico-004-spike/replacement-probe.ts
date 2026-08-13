import { readFileSync } from 'node:fs';

import type { SandboxAdapterReceipt, SandboxProofRequest } from './contracts';
import { reconcileUnknownWorkloadForProof } from './docker-adapter';
import { SandboxProofService, type ReceiptSnapshot } from './proof-service';

async function main(): Promise<void> {
  const mode = process.env.AICO004_REPLACEMENT_MODE;
  if (mode === 'RECONCILE') {
    const workload = process.env.AICO004_WORKLOAD_ID;
    if (workload === undefined) throw new Error('AICO004_WORKLOAD_ID is required.');
    process.stdout.write(
      `${JSON.stringify({ processId: process.pid, evidence: reconcileUnknownWorkloadForProof(workload) })}\n`,
    );
    return;
  }
  if (mode !== 'REPLAY') throw new Error('AICO004_REPLACEMENT_MODE is invalid.');
  const snapshotPath = process.env.AICO004_RECEIPT_SNAPSHOT;
  const requestPath = process.env.AICO004_REQUEST_SNAPSHOT;
  if (snapshotPath === undefined || requestPath === undefined) {
    throw new Error('Replay snapshot paths are required.');
  }
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as ReceiptSnapshot;
  const request = JSON.parse(readFileSync(requestPath, 'utf8')) as SandboxProofRequest;
  const service = new SandboxProofService({
    execute(): Promise<SandboxAdapterReceipt> {
      throw new Error('Replacement replay attempted a second sandbox start.');
    },
    cancel(): Promise<SandboxAdapterReceipt> {
      throw new Error('Replacement replay attempted a second sandbox cancel.');
    },
  });
  service.importReceipts(snapshot);
  const receipt = await service.execute(request);
  process.stdout.write(
    `${JSON.stringify({ processId: process.pid, sandboxStarts: service.ledger.sandboxStarts, receipt })}\n`,
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
