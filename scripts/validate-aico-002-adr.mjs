import { readFileSync } from 'node:fs';

const path = 'docs/architecture/006-durable-workflow-selection.md';
const adr = readFileSync(path, 'utf8');
const requireAccepted = process.argv.includes('--require-accepted');
const errors = [];

const requiredOptions = [
  'A — PostgreSQL state + lease scheduler + ordered events/outbox',
  'B — External durable workflow engine',
  'C — PostgreSQL state + broker/job queue',
  'D — In-process scheduler',
];
const requiredDrivers = [
  'Human waits',
  'Immutable workflow versions',
  'Task dependencies',
  'Atomic state + event + intent',
  'Command idempotency',
  'Consumer replay/deduplication',
  'Lease/fencing',
  'Cancellation',
  'Ordered founder history',
  'Recovery ≤15 minutes',
  'Local deterministic proof',
  'Small-team operations',
  'Future replacement seam',
];
const requiredEvidence = [
  'A2-ADR-01',
  'A2-TX-01/02',
  'A2-SEQ-01',
  'A2-CLAIM-01',
  'A2-LEASE-01',
  'A2-WAIT-01',
  'A2-RESUME-01/02',
  'A2-EVENT-01',
  'A2-RECOVERY-01',
  'A2-CANCEL-01',
  'A2-VERSION-01',
  'A2-MIGRATE-01',
  'A2-VERIFY-01',
];
const requiredSections = [
  '## 1. Context and decision boundary',
  '## 2. Decision drivers',
  '## 3. Options considered',
  '## 4. Proposed decision',
  '## 5. Binding semantics',
  '## 6. Failure and unknown-outcome rules',
  '## 7. Migration, compatibility, and rollback',
  '## 8. Evolution triggers',
  '## 9. Current implementation truth',
  '## 10. Required AICO-002 evidence',
  '## 11. Owner decision',
];

for (const value of [
  ...requiredOptions,
  ...requiredDrivers,
  ...requiredEvidence,
  ...requiredSections,
]) {
  if (!adr.includes(value)) errors.push(`Missing required ADR content: ${value}`);
}

if (!adr.includes('Select **Option A: PostgreSQL-authoritative workflow state')) {
  errors.push('The proposed selection is not explicit');
}
if (!/state transition, ordered event, and outbox message atomically/i.test(adr)) {
  errors.push('The atomic state/event/outbox boundary is not explicit');
}
if (!/stale or unknown outcome[\s\S]*cannot mutate/i.test(adr)) {
  errors.push('Stale/unknown outcome fencing is not explicit');
}
if (!/existing runs retain their recorded workflow version/i.test(adr)) {
  errors.push('Pinned-version rollback behavior is not explicit');
}
if (!/no worker lease/i.test(adr)) {
  errors.push('Lease-free human wait behavior is not explicit');
}

const accepted = /^\*\*Status:\*\* Accepted\b/m.test(adr);
const proposed = /^\*\*Status:\*\* Proposed\b/m.test(adr);
const evidence = adr.match(/^\*\*Decision evidence:\*\* (.+)$/m)?.[1]?.trim();

if (!accepted && !proposed) errors.push('ADR status must be Proposed or Accepted');
if (accepted) {
  if (
    !evidence ||
    !/^https:\/\/github\.com\/duckvhuynh\/aico-backend\/(?:issues\/6|pull\/\d+)(?:[#/?].*)?$/.test(
      evidence,
    )
  ) {
    errors.push('Accepted ADR requires permanent backend issue #6 or pull request evidence');
  }
} else if (evidence !== 'Pending') {
  errors.push('Proposed ADR must keep Decision evidence as Pending');
}
if (requireAccepted && !accepted) {
  errors.push('Architecture owner acceptance is still pending');
}

if (errors.length) {
  console.error('AICO-002 ADR validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`AICO-002 ADR structure complete; status=${accepted ? 'Accepted' : 'Proposed'}.`);
if (!requireAccepted) {
  console.log('Use --require-accepted before closing backend issue #6.');
}
