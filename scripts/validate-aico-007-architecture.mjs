import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

const generatedCsp =
  "Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-scripts allow-same-origin";
const bootstrapHash = '0K99yYE6jYGRdI008pEtqIua6cTps5n1zRKB0UzSqJA=';
const bootstrapCsp = `Content-Security-Policy: default-src 'none'; script-src 'sha256-${bootstrapHash}'; style-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; connect-src 'self'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-scripts allow-same-origin`;
const bootstrapScript = `(() => {
  const c = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  fetch('/__aico/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: c,
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'manual',
  }).finally(() => location.replace('/'));
})();`;
const permissionsPolicy =
  'Permissions-Policy: accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-create=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), storage-access=(), usb=(), web-share=(), xr-spatial-tracking=()';
const hsts = 'Strict-Transport-Security: max-age=31536000; includeSubDomains';

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
  'schema-browser-header': [
    'schema',
    /"required": \["typ", "alg", "kid"\]/,
    '"required": ["typ", "alg", "kid", "key_version"]',
  ],
  'schema-browser-claims': ['schema', /"opaque_grant_ref",/, '"opaque_public_preview_id",'],
  'generated-csp-exact': [
    'contract',
    /script-src 'self'; style-src 'self'/,
    "script-src *; style-src 'self'",
  ],
  'bootstrap-csp-exact': [
    'contract',
    /style-src 'none'; img-src 'none'; font-src 'none'/,
    "style-src 'self'; img-src 'none'; font-src 'none'",
  ],
  'bootstrap-script-exact': ['contract', /redirect: 'manual'/, "redirect: 'follow'"],
  'permissions-policy-exact': [
    'contract',
    /clipboard-read=\(\), clipboard-write=\(\),/,
    'clipboard-read=(self), clipboard-write=(),',
  ],
  'hsts-exact': [
    'contract',
    /Strict-Transport-Security: max-age=31536000; includeSubDomains/,
    'Strict-Transport-Security: max-age=60',
  ],
  'response-profile-mapping': [
    'contract',
    /denial, unavailable, or error documents/,
    'bootstrap, denial, unavailable, or error documents',
  ],
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

const exactResponseDocuments = ['contract', 'threat'];
for (const documentName of exactResponseDocuments) {
  for (const [label, value] of [
    ['generated CSP', generatedCsp],
    ['bootstrap CSP', bootstrapCsp],
    ['Permissions-Policy', permissionsPolicy],
    ['HSTS', hsts],
  ]) {
    if (!documents[documentName].includes(value)) {
      errors.push(`${paths[documentName]} must contain exact ${label}`);
    }
  }
  const scriptDocument =
    documentName === 'threat'
      ? documents[documentName].replace(/^ {3}/gm, '')
      : documents[documentName];
  if (!scriptDocument.includes(bootstrapScript)) {
    errors.push(`${paths[documentName]} must contain the exact bootstrap script bytes`);
  }
}

const computedBootstrapBytes = Buffer.byteLength(bootstrapScript, 'utf8');
const computedBootstrapHash = createHash('sha256').update(bootstrapScript, 'utf8').digest('base64');
if (computedBootstrapBytes !== 349 || computedBootstrapHash !== bootstrapHash) {
  errors.push('validator bootstrap fixture must remain exactly 349 bytes with the pinned SHA-256');
}

for (const [documentName, phrases] of [
  [
    'contract',
    [
      'Only `/__aico/bootstrap` uses this canonical bootstrap CSP byte-for-byte',
      'Manifest-backed generated HTML/assets and denial, unavailable, or error documents',
      'Exchange and 303 responses create no active document; they still carry the bootstrap CSP',
      'There is no third CSP',
    ],
  ],
  [
    'threat',
    [
      'Only `/__aico/bootstrap` uses this distinct immutable CSP',
      'generated, denial, unavailable, and error documents carry the generated CSP',
      'one of the two exact response-class variants',
    ],
  ],
]) {
  const normalizedDocument = normalize(documents[documentName]);
  for (const phrase of phrases) {
    if (!normalizedDocument.includes(normalize(phrase))) {
      errors.push(`${paths[documentName]} is missing exact response-profile mapping: ${phrase}`);
    }
  }
}

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

  const browserGrant = schema.$defs?.previewAccessGrant;
  const protectedHeader = browserGrant?.properties?.protected_header;
  const claims = browserGrant?.properties?.claims;
  const sorted = (values) => [...(values ?? [])].sort();
  const exactKeys = (actual, expected) =>
    JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
  const protectedHeaderKeys = ['typ', 'alg', 'kid'];
  const claimKeys = [
    'audience',
    'opaque_grant_ref',
    'nonce',
    'issued_at',
    'not_before',
    'expires_at',
    'origin_hostname',
    'environment',
    'binding_sha256',
  ];
  if (
    !exactKeys(protectedHeader?.required, protectedHeaderKeys) ||
    !exactKeys(Object.keys(protectedHeader?.properties ?? {}), protectedHeaderKeys)
  ) {
    errors.push(`${paths.schema} browser protected header keys must be exactly typ, alg, kid`);
  }
  if (
    !exactKeys(claims?.required, claimKeys) ||
    !exactKeys(Object.keys(claims?.properties ?? {}), claimKeys)
  ) {
    errors.push(`${paths.schema} browser claim keys must match the exact minimal allowlist`);
  }
  const serializedBrowserGrant = JSON.stringify(browserGrant ?? {});
  for (const forbiddenBrowserField of [
    'company_id',
    'actor_id',
    'preview_id',
    'opaque_public_preview_id',
    'preview_version',
    'build_id',
    'artifact_version_id',
    'manifest_digest',
    'revocation_epoch',
    'policy_version',
    'profile_version',
    'token_schema_version',
    'key_version',
  ]) {
    if (serializedBrowserGrant.includes(`"${forbiddenBrowserField}"`)) {
      errors.push(
        `${paths.schema} browser grant exposes forbidden field: ${forbiddenBrowserField}`,
      );
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
