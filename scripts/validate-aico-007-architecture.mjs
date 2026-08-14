import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const paths = {
  adr: 'docs/architecture/010-preview-isolation-selection.md',
  contract: 'docs/contracts/PREVIEW_ISOLATION.md',
  schema: 'docs/contracts/schemas/preview-isolation.v1.schema.json',
  threat: 'docs/delivery/AICO_007_THREAT_TEST_PLAN.md',
  aeo: 'docs/delivery/AICO_007_AEO_AUDIT.md',
  evidence: 'docs/delivery/AICO_007_EVIDENCE.md',
};

const examplePaths = {
  validGrant: 'docs/contracts/examples/preview-access-grant.valid.json',
  invalidGrant: 'docs/contracts/examples/preview-access-grant.invalid.json',
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

const replacements = {
  'adr-status': ['adr', /^\*\*Status:\*\*.+$/gm, '**Status:** REMOVED'],
  'origin-isolation': ['adr', /control-plane-isolated origin/gi, 'shared control-plane origin'],
  'control-api-deny': ['contract', /private control APIs/gi, 'private application routes'],
  'signed-access': ['contract', /signed access/gi, 'ambient access'],
  'successful-build': ['contract', /successful immutable/gi, 'mutable or incomplete'],
  'cache-partition': ['contract', /cache partition/gi, 'shared cache'],
  'cleanup-unknown': ['contract', /ambiguous external outcomes/gi, 'assumed external successes'],
  'threat-registry': ['threat', /A7-T-/g, 'REMOVED-T-'],
  'aeo-cardinality': ['aeo', /low-cardinality/gi, 'unbounded-cardinality'],
  'schema-closed': ['schema', /"additionalProperties": false/, '"additionalProperties": true'],
  'schema-access-kind': ['schema', /previewAccessGrant/g, 'removedAccessGrant'],
  'trace-owner': ['evidence', /AICO-057/g, 'REMOVED-OWNER'],
};

const expectedThreatIds = new Set([
  'A7-T-ACCESS-BINDING-01',
  'A7-T-AUTHORITY-SOURCE-01',
  'A7-T-BUILD-STATE-01',
  'A7-T-CACHE-01',
  'A7-T-CACHE-KEY-01',
  'A7-T-CLEANUP-01',
  'A7-T-CONNECT-01',
  'A7-T-CONTROL-REQUEST-01',
  'A7-T-COOKIE-01',
  'A7-T-COOKIE-STORAGE-01',
  'A7-T-DISCLOSURE-01',
  'A7-T-DOWNLOAD-01',
  'A7-T-EVIDENCE-01',
  'A7-T-EXPIRY-REVOCATION-01',
  'A7-T-FOREIGN-01',
  'A7-T-FOREIGN-PREVIEW-01',
  'A7-T-FORM-01',
  'A7-T-FRAME-ANCESTOR-01',
  'A7-T-FRAME-CHILD-01',
  'A7-T-HISTORY-01',
  'A7-T-HOST-TLS-01',
  'A7-T-INTEGRITY-01',
  'A7-T-LOG-01',
  'A7-T-MIME-01',
  'A7-T-NAVIGATION-01',
  'A7-T-OPENER-NAV-01',
  'A7-T-ORIGIN-SITE-01',
  'A7-T-PATH-01',
  'A7-T-POSITIVE-01',
  'A7-T-REDACTION-01',
  'A7-T-REFERRER-01',
  'A7-T-REPLAY-01',
  'A7-T-REVOCATION-01',
  'A7-T-SCRIPT-01',
  'A7-T-SCRIPT-TARGET-01',
  'A7-T-SERVE-INTEGRITY-01',
  'A7-T-SERVICE-WORKER-01',
  'A7-T-STORAGE-01',
  'A7-T-UNKNOWN-OUTCOME-01',
]);

const expectedMutationIds = new Set(
  Array.from({ length: 12 }, (_, index) => `A7-M-${String(index + 1).padStart(2, '0')}`),
);

if (probe !== undefined) {
  const mutation = replacements[probe];
  if (!mutation) throw new Error(`Unknown AICO-007 validation failure probe: ${probe}`);
  const [documentName, pattern, replacement] = mutation;
  const mutated = documents[documentName].replace(pattern, replacement);
  if (mutated === documents[documentName]) {
    throw new Error(`AICO-007 validation failure probe ${probe} did not mutate its target.`);
  }
  documents[documentName] = mutated;
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
  'AICO-007',
  'TD-008',
  'PRD-FR-040',
  'PRD-FR-041',
  'SRS-FR-059',
  'SRS-FR-060',
  'AT-014',
  'control-plane-isolated origin',
  'registrable domain',
  'signed access',
  'successful build',
  'Content-Security-Policy',
  'private control APIs',
  'service worker',
  'cache',
  'revocation',
  'unknown outcome',
  'rollback',
  'AICO-057',
  'AICO-058',
  'AICO-083',
  'AICO-085',
]);

requireText('contract', [
  'control-plane-isolated origin',
  'private control APIs',
  'signed access',
  'successful immutable',
  'exact build',
  'manifest digest',
  'sha256:',
  'tenant',
  'audience',
  'expiry',
  'revocation',
  'Content-Security-Policy',
  'service worker',
  'cache partition',
  'cleanup',
  'ambiguous external outcomes',
  'non-disclosing',
  'zero unauthorized effect',
  'bounded',
  'redacted',
  'no silent fallback',
]);

requireText('threat', [
  'proposed adversarial and evidence contract',
  'two-company',
  'paid-service-free',
  'exact clean repository SHA',
  'control-plane',
  'cookie',
  'storage',
  'service worker',
  'opener',
  'navigation',
  'Content-Security-Policy',
  'foreign tenant',
  'expired',
  'revoked',
  'cache',
  'cleanup',
  'zero unauthorized effect',
  'AICO-057',
  'AICO-058',
  'AICO-083',
  'AICO-085',
]);

requireText('aeo', [
  'pre-A7-READY-0',
  'PostgreSQL',
  'immutable object',
  'causal',
  'low-cardinality',
  'redaction',
  'exact SHA',
  'STATE_RECONSTRUCTION',
  'OFFLINE_REPRODUCTION',
  'CONTROLLED_REEVALUATION',
  'SIDE_EFFECT_RECONCILIATION',
  'backend SHA/image',
  'control API contract digest',
  'adversarial result digest',
  'AICO-057',
  'AICO-083',
]);

requireText('evidence', [
  'A7-ADR-01',
  'A7-ORIGIN-01',
  'A7-ACCESS-01',
  'A7-INTEGRITY-01',
  'A7-CACHE-01',
  'A7-CLEANUP-01',
  'A7-THREAT-01',
  'A7-TRACE-01',
  'A7-AEO-01-12',
  'A7-VERIFY-01',
  'A7-ACCEPT-01',
  'proof child #21',
  'immutable candidate lineage',
  'control API contract digest',
  'AICO-057',
  'AICO-058',
  'AICO-083',
  'AICO-085',
]);

const threatIds = new Set(documents.threat.match(/\bA7-T-[A-Z0-9-]+\b/g) ?? []);
for (const id of expectedThreatIds) {
  if (!threatIds.has(id)) errors.push(`${paths.threat} is missing stable threat case: ${id}`);
}
for (const id of threatIds) {
  if (!expectedThreatIds.has(id))
    errors.push(`${paths.threat} has unregistered threat case: ${id}`);
}
const adrThreatIds = new Set(documents.adr.match(/\bA7-T-[A-Z0-9-]+\b/g) ?? []);
for (const id of adrThreatIds) {
  if (!threatIds.has(id)) errors.push(`${paths.adr} references undefined threat case: ${id}`);
}
const mutationIds = new Set(documents.threat.match(/\bA7-M-\d{2}\b/g) ?? []);
for (const id of expectedMutationIds) {
  if (!mutationIds.has(id)) errors.push(`${paths.threat} is missing mutation: ${id}`);
}
for (const id of mutationIds) {
  if (!expectedMutationIds.has(id)) errors.push(`${paths.threat} has unregistered mutation: ${id}`);
}
for (let number = 1; number <= 12; number += 1) {
  const id = `A7-AEO-${String(number).padStart(2, '0')}`;
  if (!documents.aeo.includes(id)) errors.push(`${paths.aeo} is missing AEO gate: ${id}`);
}

let schema;
try {
  schema = JSON.parse(documents.schema);
} catch (error) {
  errors.push(`${paths.schema} is not valid JSON: ${error.message}`);
}

function assertClosedObjects(value, location = '#') {
  if (!value || typeof value !== 'object') return;
  if (value.type === 'object' && value.additionalProperties !== false) {
    errors.push(`${paths.schema} object schema ${location} must set additionalProperties=false`);
  }
  for (const [key, child] of Object.entries(value)) {
    assertClosedObjects(child, `${location}/${key}`);
  }
}

if (schema) {
  assertClosedObjects(schema);
  const serialized = JSON.stringify(schema);
  for (const required of [
    'previewPublicationRequest',
    'previewPublicationReceipt',
    'previewAccessGrant',
    'previewAccessRequest',
    'previewAccessReceipt',
    'previewRevocationRequest',
    'previewRevocationReceipt',
    'previewCleanupRequest',
    'previewCleanupReceipt',
    'previewGrantIssueRequest',
    'previewGrantIssueReceipt',
    'previewAccessExchangeAttempt',
    'previewAccessExchangeReceipt',
    'previewRevocationInspectRequest',
    'previewRevocationInspectReceipt',
    'previewReconciliationRequest',
    'previewReconciliationReceipt',
    'previewEvent',
    'EdDSA',
    'binding_sha256',
    'company_id',
    'preview_id',
    'build_id',
    'artifact_version_id',
    'manifest_digest',
    'policy_version',
    'revocation_epoch',
    'header_profile_version',
    'cache_profile_version',
    'build_version',
    'build_result_receipt_id',
    'build_result_receipt_version',
    'build_result_receipt_digest',
    'POSTGRESQL_PRIMARY',
    'preview.grant.issue/v1',
    'preview.content.read/v1',
    'preview.reconcile/v1',
    'invocation_intent_id',
    'logical_invocation_key',
    'invocationConsumption',
    'redaction_profile_id',
    'redaction_profile_version',
    'redaction_profile_digest',
    'trace_id',
    'span_id',
    'operation_attempt_id',
    'causation_id',
    'UNKNOWN',
  ]) {
    if (!serialized.includes(required)) {
      errors.push(`${paths.schema} is missing required schema term: ${required}`);
    }
  }
  for (const forbidden of [
    'controlCookie',
    'controlCredential',
    'privateApiProxy',
    'rawToken',
    'originOverride',
    'headerOverride',
    'cacheOverride',
  ]) {
    if (serialized.includes(`\"${forbidden}\"`)) {
      errors.push(`${paths.schema} contains forbidden caller-controlled field: ${forbidden}`);
    }
  }

  try {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validateSchema = ajv.compile(schema);
    const validGrant = JSON.parse(readFileSync(examplePaths.validGrant, 'utf8'));
    const invalidGrant = JSON.parse(readFileSync(examplePaths.invalidGrant, 'utf8'));
    if (!validateSchema(validGrant)) {
      errors.push(
        `${examplePaths.validGrant} must validate: ${ajv.errorsText(validateSchema.errors)}`,
      );
    }
    if (validateSchema(invalidGrant)) {
      errors.push(`${examplePaths.invalidGrant} must fail the closed browser-grant schema`);
    }
  } catch (error) {
    errors.push(`${paths.schema} must compile under JSON Schema 2020-12: ${error.message}`);
  }
}

const accepted = /^\*\*Status:\*\* Accepted for AICO-007\b/m.test(documents.adr);
const proposed = /^\*\*Status:\*\* Proposed for AICO-007 owner acceptance\b/m.test(documents.adr);
const architectureEvidence = documents.adr
  .match(/^\*\*Architecture\/Security evidence:\*\* (.+)$/m)?.[1]
  ?.trim();
const productEvidence = documents.adr
  .match(/^\*\*Product\/Platform evidence:\*\* (.+)$/m)?.[1]
  ?.trim();
const semanticSha = documents.adr.match(/semantic SHA\s+`([a-f0-9]{40})`/i)?.[1];
const permanentEvidence =
  /^https:\/\/github\.com\/duckvhuynh\/aico-backend\/pull\/\d+#issuecomment-\d+$/;

if (!accepted && !proposed) {
  errors.push(
    `${paths.adr} status must be Proposed for AICO-007 owner acceptance or Accepted for AICO-007`,
  );
}
if (requireAccepted && !accepted) {
  errors.push(`${paths.adr} must be Accepted for AICO-007`);
}
if (accepted) {
  if (!semanticSha) errors.push(`${paths.adr} accepted decision must bind a 40-hex semantic SHA`);
  if (!permanentEvidence.test(architectureEvidence ?? '')) {
    errors.push(
      `${paths.adr} accepted Architecture/Security evidence must be a permanent PR comment`,
    );
  }
  if (!permanentEvidence.test(productEvidence ?? '')) {
    errors.push(`${paths.adr} accepted Product/Platform evidence must be a permanent PR comment`);
  }
  if (architectureEvidence === productEvidence) {
    errors.push(`${paths.adr} accepted owner decisions must use two distinct PR comments`);
  }
  if (semanticSha) {
    try {
      execFileSync('git', ['cat-file', '-e', `${semanticSha}^{commit}`], { stdio: 'ignore' });
      execFileSync('git', ['merge-base', '--is-ancestor', semanticSha, 'HEAD'], {
        stdio: 'ignore',
      });
    } catch {
      errors.push(
        `${paths.adr} semantic SHA must identify an ancestor commit available in repository history`,
      );
    }
  }
} else if (architectureEvidence !== 'Pending' || productEvidence !== 'Pending') {
  errors.push(`${paths.adr} Proposed owner evidence must remain Pending`);
}

if (errors.length > 0) {
  throw new Error(`AICO-007 architecture validation failed:\n- ${errors.join('\n- ')}`);
}

console.log(
  `AICO-007 architecture validation passed (${accepted ? 'Accepted' : 'Proposed'} mode; ${threatIds.size} threat cases).`,
);
