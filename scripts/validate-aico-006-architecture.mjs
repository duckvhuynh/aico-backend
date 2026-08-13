import { readFileSync } from 'node:fs';

const paths = {
  adr: 'docs/architecture/008-policy-exact-version-approval.md',
  contract: 'docs/contracts/POLICY_APPROVAL.md',
  threat: 'docs/delivery/AICO_006_THREAT_TEST_PLAN.md',
  aeo: 'docs/delivery/AICO_006_AEO_AUDIT.md',
  evidence: 'docs/delivery/AICO_006_EVIDENCE.md',
};
const documents = Object.fromEntries(
  Object.entries(paths).map(([name, path]) => [name, readFileSync(path, 'utf8')]),
);
const requireAccepted = process.argv.includes('--require-accepted');
const probeIndex = process.argv.indexOf('--probe-failure');
const probe = probeIndex >= 0 ? process.argv[probeIndex + 1] : undefined;
const errors = [];

const normalize = (value) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

if (probe === 'adr-status') {
  documents.adr = documents.adr.replace(/^\*\*Status:\*\*.+$/gm, '**Status:** REMOVED');
} else if (probe === 'policy-input') {
  documents.contract = documents.contract.replace(/actor\/employee version/gi, 'actor');
} else if (probe === 'parameter-bound') {
  documents.adr = documents.adr.replace(/parameter-bound/gi, 'unbounded');
  documents.contract = documents.contract.replace(/parameter-bound/gi, 'unbounded');
} else if (probe === 'atomic-transaction') {
  documents.adr = documents.adr.replace(/atomic/gi, 'non-transactional');
  documents.contract = documents.contract.replace(/atomic/gi, 'non-transactional');
} else if (probe === 'threat-ids') {
  documents.threat = documents.threat.replace(/A6-T-/g, 'REMOVED-T-');
} else if (probe === 'denial-audit') {
  documents.threat = documents.threat.replace(/SRS-FR-087/g, 'REMOVED-FR-087');
  documents.contract = documents.contract.replace(/SRS-FR-087/g, 'REMOVED-FR-087');
} else if (probe === 'evidence-id') {
  documents.evidence = documents.evidence.replace(/A6-VERIFY-01/g, 'REMOVED-VERIFY-01');
} else if (probe === 'aeo-gate') {
  documents.aeo = documents.aeo.replace(/A6-AEO-12/g, 'REMOVED-AEO-12');
} else if (probe === 'model-authority') {
  documents.threat = documents.threat.replace(
    /model\s+response,\s+a\s+transcript,\s+green\s+CI\s+on\s+another\s+SHA,\s+or\s+an\s+unreviewed\s+demo\s+is\s+not\s+acceptance\s+or\s+authority/gi,
    'model output may authorize the action',
  );
} else if (probe === 'downstream-ownership') {
  documents.evidence = documents.evidence.replace(/AICO-031/g, 'REMOVED-031');
} else if (probe === 'event-vocabulary') {
  documents.contract = documents.contract.replace(/approval\.decided/g, 'gate_approved');
} else if (probe === 'deny-binding') {
  documents.contract = documents.contract.replace(/DenyBindingV1/g, 'AllowBindingV1');
} else if (probe === 'replay-authority') {
  documents.contract = documents.contract.replace(
    /replay-after-revocation/gi,
    'replay-without-auth',
  );
} else if (probe !== undefined) {
  throw new Error(`Unknown AICO-006 validation failure probe: ${probe}`);
}

function requireText(documentName, values) {
  const normalizedDocument = normalize(documents[documentName]);
  for (const value of values) {
    if (!normalizedDocument.includes(normalize(value))) {
      errors.push(`${paths[documentName]} is missing required content: ${value}`);
    }
  }
}

requireText('adr', [
  'AICO-006',
  'TD-007',
  'PRD-FR-016',
  'PRD-FR-060',
  'SRS-FR-021',
  'SRS-FR-088',
  'AT-004',
  'AT-005',
  'deny-by-default',
  'PolicyDecisionPort',
  'parameter-bound',
  'action time',
  'exact artifact version',
  'APPROVE',
  'REQUEST_REVISION',
  'PostgreSQL',
  'atomic',
  'idempotency',
  'event',
  'outbox',
  'continuation',
  'SRS-FR-087',
  'migration',
  'rollback',
  'AICO-031',
  'AICO-041',
  'AICO-042',
  'approval.decided',
  'policy.decided',
  'tagged',
  'redacted DENY',
  'replay-after-revocation',
]);

requireText('contract', [
  'Proposed',
  'accepted ADR-008',
  'actor/employee version',
  'company',
  'run',
  'task',
  'attempt',
  'stage',
  'state',
  'gate',
  'action',
  'artifact version',
  'budget',
  'environment',
  'parameter-bound',
  'policy version',
  'expires',
  'Idempotency-Key',
  'If-Match',
  'correlation',
  'APPROVE',
  'REQUEST_REVISION',
  'atomic',
  'append-only',
  'event',
  'outbox',
  'non-disclosing',
  'SRS-FR-087',
  'PolicyDecision',
  'zero unauthorized',
  'uuid',
  'timestamptz',
  'composite tenant',
  'PolicyDecisionPort',
  'approval.decided',
  'policy.decided',
  'AllowBindingV1',
  'DenyBindingV1',
  'maximum_uses: 0',
  'replay-after-revocation',
]);

requireText('threat', [
  'proposed adversarial and evidence contract',
  'release-blocking',
  'two-company',
  'paid-service-free',
  'exact clean repository SHA',
  'typed Artifact Version references',
  'model response, a transcript, green CI on another SHA, or an unreviewed demo is not acceptance or authority',
  'never executes EMP-DES',
  'A6-T-APPROVE-01',
  'A6-T-REVISION-01',
  'A6-T-REPLAY-01',
  'A6-T-CONCURRENT-01',
  'A6-T-CROSS-TENANT-01',
  'A6-T-STALE-ARTIFACT-01',
  'A6-T-RESTART-01',
  'A6-T-OUTBOX-REDELIVERY-01',
  'A6-T-DENIAL-EVENT-01',
  'SRS-FR-087',
  'AICO-031',
  'AICO-041',
  'AICO-042',
  'non-waivable',
  'approval.decided',
  'policy.decided',
  'replay-after-revocation',
]);

for (const [name, document] of Object.entries({
  adr: documents.adr,
  contract: documents.contract,
  threat: documents.threat,
})) {
  for (const forbidden of [
    'gate_approved',
    'gate_revision_requested',
    'policy_denied',
    'policy_decision_recorded',
    'PolicyEvaluatorPort',
  ]) {
    if (document.includes(forbidden)) {
      errors.push(`${paths[name]} contains forbidden conflicting term: ${forbidden}`);
    }
  }
}

const runStageDefinition = documents.contract
  .split('\n')
  .find((line) => line.includes('type RunStage') || line.includes('| `RunStage`'));
if (!runStageDefinition || runStageDefinition.includes('TERMINAL')) {
  errors.push(`${paths.contract} RunStage must use exactly INTAKE/PRODUCT/DESIGN/BUILD/QA/FINAL`);
}

const threatIds = new Set(documents.threat.match(/\bA6-T-[A-Z0-9-]+\b/g) ?? []);
if (threatIds.size < 30) {
  errors.push(`${paths.threat} must define at least 30 unique stable A6-T-* threat cases`);
}

const denialRow = documents.threat
  .split('\n')
  .find((line) => line.includes('`A6-T-DENIAL-EVENT-01`'));
if (
  !denialRow ||
  !denialRow.includes('SRS-FR-087') ||
  !denialRow.includes('PolicyDecision') ||
  !normalize(denialRow).includes('denial event outbox') ||
  !normalize(denialRow).includes('business success')
) {
  errors.push(
    `${paths.threat} A6-T-DENIAL-EVENT-01 must preserve one SRS-FR-087 PolicyDecision/denial event-outbox while forbidding business-success effects`,
  );
}

for (let number = 1; number <= 12; number += 1) {
  const id = `A6-AEO-${String(number).padStart(2, '0')}`;
  if (!documents.aeo.includes(id)) errors.push(`${paths.aeo} is missing AEO gate: ${id}`);
}

requireText('aeo', [
  'architecture-ready',
  'not implementation',
  'low-cardinality',
  'causal',
  'redaction',
  'exact SHA',
  'STATE_RECONSTRUCTION',
  'OFFLINE_REPRODUCTION',
  'CONTROLLED_REEVALUATION',
  'SIDE_EFFECT_RECONCILIATION',
  'AICO-031',
  'AICO-041',
  'AICO-042',
]);

for (const evidenceId of [
  'A6-ADR-01',
  'A6-INPUT-01',
  'A6-ALLOW-01',
  'A6-TX-01',
  'A6-REPLAY-01',
  'A6-DENY-01',
  'A6-AUDIT-01',
  'A6-RESTART-01',
  'A6-VERSION-01',
  'A6-AEO-01-12',
  'A6-TRACE-01',
  'A6-VERIFY-01',
]) {
  if (!documents.evidence.includes(evidenceId)) {
    errors.push(`${paths.evidence} is missing evidence ID: ${evidenceId}`);
  }
}

requireText('evidence', [
  'MVP-CAP-004',
  'MVP-CAP-011',
  'PRD-FR-016–020',
  'PRD-FR-059–060',
  'SRS TD-007',
  'SRS-FR-021–026',
  'SRS-FR-085–088',
  'AT-004–005',
  'hard-coded ALLOW',
  'No production founder decision command',
  'AICO-031',
  'AICO-041',
  'AICO-042',
  'proof child #13',
]);

const accepted = /^\*\*Status:\*\* Accepted for AICO-006\b/m.test(documents.adr);
const proposed = /^\*\*Status:\*\* Proposed for AICO-006 owner acceptance\b/m.test(documents.adr);
const architectureEvidence = documents.adr.match(/^\*\*Decision evidence:\*\* (.+)$/m)?.[1]?.trim();
const productEvidence = documents.adr
  .match(/^\*\*Product\/Security evidence:\*\* (.+)$/m)?.[1]
  ?.trim();
const permanentEvidence =
  /^https:\/\/github\.com\/duckvhuynh\/aico-backend\/pull\/\d+#issuecomment-\d+$/;

if (!accepted && !proposed) {
  errors.push('ADR-008 status must be Proposed for AICO-006 owner acceptance or Accepted');
}
if (accepted) {
  if (!architectureEvidence || !permanentEvidence.test(architectureEvidence)) {
    errors.push('Accepted ADR-008 requires permanent Architecture decision evidence');
  }
  if (!productEvidence || !permanentEvidence.test(productEvidence)) {
    errors.push('Accepted ADR-008 requires separate permanent Product/Security evidence');
  }
} else if (architectureEvidence !== 'Pending' || productEvidence !== 'Pending') {
  errors.push('Proposed ADR-008 must keep both decision evidence fields Pending');
}
if (requireAccepted && !accepted) {
  errors.push('AICO-006 Architecture and Product/Security owner acceptance is still pending');
}

if (errors.length > 0) {
  console.error('AICO-006 architecture validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `AICO-006 architecture package complete; status=${accepted ? 'Accepted' : 'Proposed'}; threat_cases=${threatIds.size}.`,
);
if (!requireAccepted) console.log('Use --require-accepted before merging backend issue #12.');
