import { readFileSync } from 'node:fs';

const paths = {
  adr: 'docs/architecture/007-tenant-object-retention-selection.md',
  contract: 'docs/contracts/TENANT_DATA_BOUNDARIES.md',
  threat: 'docs/delivery/AICO_003_THREAT_TEST_PLAN.md',
  aeo: 'docs/delivery/AICO_003_AEO_AUDIT.md',
  evidence: 'docs/delivery/AICO_003_EVIDENCE.md',
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
} else if (probe === 'boundary') {
  documents.contract = documents.contract.replace(/relational rows/gi, 'removed boundary');
} else if (probe === 'threat-ids') {
  documents.threat = documents.threat.replace(/A3-T-/g, 'REMOVED-T-');
} else if (probe === 'evidence-id') {
  documents.evidence = documents.evidence.replace(/A3-VERIFY-01/g, 'REMOVED-VERIFY-01');
} else if (probe === 'aeo-gate') {
  documents.aeo = documents.aeo.replace(/A3-AEO-12/g, 'REMOVED-AEO-12');
} else if (probe === 'ownership') {
  documents.evidence = documents.evidence.replace(
    /AICO-082 owns tenant\/redaction and signed-access tests/g,
    'AICO-080 owns tenant tests',
  );
} else if (probe === 'tool-denial-audit') {
  documents.threat = documents.threat.replace(
    /SRS-FR-087 PolicyDecision and denial event\/outbox/g,
    'no event',
  );
} else if (probe !== undefined) {
  throw new Error(`Unknown AICO-003 validation failure probe: ${probe}`);
}

function requireText(documentName, values) {
  const document = documents[documentName];
  const normalizedDocument = normalize(document);
  for (const value of values) {
    if (!normalizedDocument.includes(normalize(value))) {
      errors.push(`${paths[documentName]} is missing required content: ${value}`);
    }
  }
}

requireText('adr', [
  'ADR-001',
  'ADR-003',
  'ADR-004',
  'DEC-013',
  'PRD-OQ-004',
  'PostgreSQL',
  'S3-compatible',
  'server-generated',
  'signed access',
  'encryption',
  'checksum',
  'retention',
  'expiry',
  'revocation',
  'deletion',
  'backup',
  'security hold',
  'migration',
  'rollback',
]);

for (const boundary of [
  'relational rows',
  'object bodies',
  'attachments',
  'model context',
  'sandbox',
  'preview',
  'export',
  'logs',
  'backup',
  'deletion',
  'security hold',
]) {
  if (!documents.contract.toLowerCase().includes(boundary)) {
    errors.push(`${paths.contract} is missing boundary: ${boundary}`);
  }
}

requireText('contract', [
  'Proposed AICO-003 contract',
  'becomes normative only with accepted ADR-007 decision evidence',
  'company_id',
  'authenticated',
  'composite',
  'foreign key',
  'RLS',
  'defense in depth',
  'server-generated',
  'opaque',
  'signed',
  'checksum',
  'non-disclosing',
  'resource_not_found',
  'zero unauthorized business',
  'SRS-FR-087',
  'PolicyDecision',
  'authorized audit mutation',
  'restore',
  'hold',
]);

requireText('threat', [
  'proposed adversarial evidence contract',
  'becomes binding only when ADR-007 has accepted human decision evidence',
  'release-blocking',
  'A3-T-ROW-01',
  'A3-T-OBJ-01',
  'model context',
  'sandbox',
  'preview',
  'export',
  'logs',
  'backup',
  'restore',
  'deletion',
  'security hold',
  'signed',
  'expiry',
  'revocation',
  'replay',
  'zero side effect',
  'evidence owner',
  'non-waivable',
  'no paid',
  'SRS-FR-087',
  'PolicyDecision',
]);

for (let number = 1; number <= 12; number += 1) {
  const id = `A3-AEO-${String(number).padStart(2, '0')}`;
  if (!documents.aeo.includes(id)) {
    errors.push(`${paths.aeo} is missing AEO gate: ${id}`);
  }
}

requireText('aeo', [
  'not implementation-, recovery-, deletion-, or alpha-ready',
  'low-cardinality metrics',
  'STATE_RECONSTRUCTION',
  'OFFLINE_REPRODUCTION',
  'CONTROLLED_REEVALUATION',
  'SIDE_EFFECT_RECONCILIATION',
  'signed-access containment',
  'backup/restore evidence',
  'retention, deletion, and hold truth',
  'no semantic waiver',
  'DEC-013 remains open',
]);

const threatIds = new Set(documents.threat.match(/\bA3-T-[A-Z0-9-]+\b/g) ?? []);
if (threatIds.size < 12) {
  errors.push(`${paths.threat} must define at least 12 unique stable A3-T-* threat cases`);
}

for (const caseId of ['A3-T-WRK-01', 'A3-T-STALE-01']) {
  const row = documents.threat.split('\n').find((line) => line.includes(`\`${caseId}\``));
  if (
    !row ||
    !normalize(row).includes('business success') ||
    !row.includes('SRS-FR-087') ||
    !row.includes('PolicyDecision') ||
    !normalize(row).includes('denial event outbox')
  ) {
    errors.push(
      `${paths.threat} case ${caseId} must preserve SRS-FR-087 PolicyDecision/denial event while forbidding business-success effects`,
    );
  }
}

for (const evidenceId of [
  'A3-ADR-01',
  'A3-BOUNDARY-01',
  'A3-OBJECT-01',
  'A3-DENY-01',
  'A3-RETENTION-01',
  'A3-THREAT-01',
  'A3-TRACE-01',
  'A3-VERIFY-01',
]) {
  if (!documents.evidence.includes(evidenceId)) {
    errors.push(`${paths.evidence} is missing evidence ID: ${evidenceId}`);
  }
}

requireText('evidence', [
  'SRS TD-002',
  'SRS TD-006',
  'SRS TD-009',
  'SRS-FR-092',
  'SRS-NFR-008-010',
  'SRS-NFR-013-016',
  'final per-type durations',
  'no production object-storage module',
  'RLS is not enabled',
  'AICO-007',
  'AICO-010',
  'AICO-078',
  'AICO-082 owns tenant/redaction and signed-access tests',
  'AICO-083 owns sandbox/preview isolation',
  'AICO-080 owns performance',
  'AICO-090 owns founder-facing limitations',
  'AICO-083',
]);

const accepted = /^\*\*Status:\*\* Accepted for AICO-003\b/m.test(documents.adr);
const proposed = /^\*\*Status:\*\* Proposed for AICO-003 owner acceptance\b/m.test(documents.adr);
const evidence = documents.adr.match(/^\*\*Decision evidence:\*\* (.+)$/m)?.[1]?.trim();

if (!accepted && !proposed) {
  errors.push('ADR-007 status must be Proposed for AICO-003 owner acceptance or Accepted');
}
if (accepted) {
  if (
    !evidence ||
    !/^https:\/\/github\.com\/duckvhuynh\/aico-backend\/(?:issues\/10|pull\/\d+)(?:[#/?].*)?$/.test(
      evidence,
    )
  ) {
    errors.push('Accepted ADR-007 requires permanent backend issue #10 or pull-request evidence');
  }
} else if (evidence !== 'Pending') {
  errors.push('Proposed ADR-007 must keep Decision evidence as Pending');
}
if (requireAccepted && !accepted) {
  errors.push('AICO-003 Architecture and Product/Security owner acceptance is still pending');
}

if (errors.length > 0) {
  console.error('AICO-003 architecture validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `AICO-003 architecture package complete; status=${accepted ? 'Accepted' : 'Proposed'}; threat_cases=${threatIds.size}.`,
);
if (!requireAccepted) {
  console.log('Use --require-accepted before merging backend issue #10.');
}
