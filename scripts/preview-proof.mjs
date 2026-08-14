import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

import { run } from './process-utils.mjs';

const EXPECTED_THREAT_CASES = 39;
const EXPECTED_CONTROL_MUTATIONS = 12;
const EXPECTED_CASE_REGISTRY_DIGEST =
  'sha256:894787c92a4e0fcbdece35b603b9c9db1824ae8167b50d1026cc3df388cd55cf';
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const EXPECTED_INPUT_DIGEST_KEYS = Object.freeze([
  'cacheProfile',
  'fixtureAggregate',
  'headerProfile',
  'redactionProfile',
]);
const SIDE_EFFECT_KEYS = Object.freeze([
  'authorityReads',
  'objectReads',
  'cacheLookups',
  'generatedBytesServed',
  'foreignBytesServed',
  'businessEvents',
  'outboxMessages',
  'providerCalls',
  'toolCalls',
  'sandboxCalls',
  'costEffects',
  'redactionDrops',
]);
const BROWSER_CASE_IDS = Object.freeze([
  'A7-T-ORIGIN-SITE-01',
  'A7-T-HOST-TLS-01',
  'A7-T-CONTROL-REQUEST-01',
  'A7-T-COOKIE-01',
  'A7-T-COOKIE-STORAGE-01',
  'A7-T-STORAGE-01',
  'A7-T-SERVICE-WORKER-01',
  'A7-T-OPENER-NAV-01',
  'A7-T-NAVIGATION-01',
  'A7-T-FRAME-ANCESTOR-01',
  'A7-T-FRAME-CHILD-01',
  'A7-T-SCRIPT-TARGET-01',
  'A7-T-CONNECT-01',
  'A7-T-FORM-01',
  'A7-T-SCRIPT-01',
  'A7-T-REFERRER-01',
  'A7-T-MIME-01',
  'A7-T-DOWNLOAD-01',
  'A7-T-PATH-01',
]);
const ZERO_SIDE_EFFECT_TOTALS = Object.freeze({
  authorityReads: 0,
  objectReads: 0,
  cacheLookups: 0,
  generatedBytesServed: 0,
  foreignBytesServed: 0,
  businessEvents: 0,
  outboxMessages: 0,
  providerCalls: 0,
  toolCalls: 0,
  sandboxCalls: 0,
  costEffects: 0,
  redactionDrops: 0,
});
const EXPECTED_CASE_SIDE_EFFECT_TOTALS = Object.freeze({
  'A7-T-POSITIVE-01': {
    authorityReads: 60,
    objectReads: 4,
    cacheLookups: 10,
    generatedBytesServed: 705,
    foreignBytesServed: 0,
    businessEvents: 2,
    outboxMessages: 2,
    providerCalls: 0,
    toolCalls: 2,
    sandboxCalls: 0,
    costEffects: 0,
    redactionDrops: 0,
  },
  ...Object.fromEntries(BROWSER_CASE_IDS.map((caseId) => [caseId, ZERO_SIDE_EFFECT_TOTALS])),
  'A7-T-BUILD-STATE-01': totals(30, 0, 0, 0, 0, 0, 0),
  'A7-T-INTEGRITY-01': totals(36, 0, 0, 0, 0, 0, 0),
  'A7-T-SERVE-INTEGRITY-01': totals(80, 5, 6, 279, 15, 10, 0),
  'A7-T-ACCESS-BINDING-01': totals(562, 1, 1, 0, 95, 94, 0),
  'A7-T-AUTHORITY-SOURCE-01': totals(135, 0, 0, 0, 23, 24, 0),
  'A7-T-FOREIGN-01': totals(15, 0, 0, 0, 2, 2, 0),
  'A7-T-FOREIGN-PREVIEW-01': totals(18, 0, 0, 0, 3, 3, 0),
  'A7-T-EXPIRY-REVOCATION-01': totals(65, 1, 1, 279, 8, 8, 0),
  'A7-T-REVOCATION-01': totals(67, 2, 2, 558, 8, 9, 0),
  'A7-T-REPLAY-01': totals(83, 0, 0, 0, 13, 13, 0),
  'A7-T-CACHE-01': totals(28, 1, 2, 558, 3, 3, 0),
  'A7-T-CACHE-KEY-01': totals(235, 21, 23, 6139, 25, 24, 0),
  'A7-T-HISTORY-01': totals(344, 16, 16, 4464, 40, 40, 0),
  'A7-T-CLEANUP-01': totals(99, 4, 4, 1117, 17, 17, 0),
  'A7-T-UNKNOWN-OUTCOME-01': totals(74, 1, 1, 279, 11, 16, 0),
  'A7-T-LOG-01': totals(0, 0, 0, 0, 0, 0, 1),
  'A7-T-DISCLOSURE-01': totals(174, 0, 0, 0, 26, 26, 0),
  'A7-T-REDACTION-01': totals(0, 0, 0, 0, 0, 0, 1),
  'A7-T-EVIDENCE-01': totals(0, 0, 0, 0, 0, 0, 1),
});
const EXPECTED_REAL_BROWSER_PROBES = Object.freeze([
  { probeId: 'COOKIE', outcome: 'BLOCKED', detailClass: 'platform-cookie-hidden', count: 1 },
  { probeId: 'CSP', outcome: 'BLOCKED', detailClass: 'inline-script-did-not-run', count: 1 },
  { probeId: 'NAVIGATION', outcome: 'BLOCKED', detailClass: 'popup-blocked', count: 1 },
  { probeId: 'OPENER', outcome: 'BLOCKED', detailClass: 'opener-is-null', count: 1 },
  {
    probeId: 'ORIGIN_HOST',
    outcome: 'ORIGIN_LOCAL',
    detailClass: 'isolated-https-origin',
    count: 1,
  },
  { probeId: 'PATH', outcome: 'BLOCKED', detailClass: 'encoded-path-blocked', count: 1 },
  {
    probeId: 'PRIVATE_CONTROL_REQUEST',
    outcome: 'BLOCKED',
    detailClass: 'cross-origin-request-blocked',
    count: 1,
  },
  {
    probeId: 'PRIVATE_CONTROL_REQUEST',
    outcome: 'BLOCKED',
    detailClass: 'same-origin-request-blocked',
    count: 1,
  },
  { probeId: 'REFERRER', outcome: 'BLOCKED', detailClass: 'referrer-empty', count: 1 },
  {
    probeId: 'SERVICE_WORKER',
    outcome: 'BLOCKED',
    detailClass: 'registration-rejected',
    count: 1,
  },
  {
    probeId: 'STORAGE',
    outcome: 'ORIGIN_LOCAL',
    detailClass: 'cache-storage-available-only-to-this-origin',
    count: 1,
  },
  {
    probeId: 'STORAGE',
    outcome: 'ORIGIN_LOCAL',
    detailClass: 'indexeddb-available-only-to-this-origin',
    count: 1,
  },
  {
    probeId: 'STORAGE',
    outcome: 'ORIGIN_LOCAL',
    detailClass: 'localStorage-available-only-to-this-origin',
    count: 1,
  },
  {
    probeId: 'STORAGE',
    outcome: 'ORIGIN_LOCAL',
    detailClass: 'sessionStorage-available-only-to-this-origin',
    count: 1,
  },
]);
const EVIDENCE_FILES = [
  'docs/delivery/AICO_007_PROOF_EVIDENCE.md',
  'scripts/preview-proof.mjs',
  'scripts/prove-aico-007-control-mutations.mjs',
  'test/aico-007-spike/browser-http-adapter.ts',
  'test/aico-007-spike/contracts.ts',
  'test/aico-007-spike/fail-closed-control-mutations.ts',
  'test/aico-007-spike/fixture.ts',
  'test/aico-007-spike/hostile-static-fixture.ts',
  'test/aico-007-spike/preview-proof-service.ts',
  'test/aico-007-spike/real-browser-harness.ts',
  'test/preview-isolation-proof.control-mutation.spec.ts',
  'test/preview-isolation-proof.integration.spec.ts',
];

const startedAt = Date.now();
const status = run('git', ['status', '--porcelain'], { capture: true });
if (status.stdout.trim().length > 0) {
  throw new Error('AICO-007 exact-SHA proof refuses a dirty worktree.');
}
const revision = run('git', ['rev-parse', 'HEAD'], { capture: true }).stdout.trim();
if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('AICO-007 requires an exact 40-hex SHA.');

runChecked('accepted architecture', 'npm', ['run', 'verify:preview-architecture:accepted']);

const integration = runChecked(
  '39-case integration proof',
  'npm',
  [
    'exec',
    '--',
    'jest',
    '--runInBand',
    '--runTestsByPath',
    'test/preview-isolation-proof.integration.spec.ts',
  ],
  {
    AICO_REQUIRE_PREVIEW_PROOF: 'true',
    AICO_PREVIEW_PROOF_REPOSITORY_SHA: revision,
    AICO_PREVIEW_PROOF_DIRTY_DEVELOPMENT: 'false',
  },
);
const integrationEvidence = parseEvidence(integration, 'aico-007-integration-proof/v1');
const selectedCases = requireClosedStringSet(
  integrationEvidence.selectedCases,
  EXPECTED_THREAT_CASES,
  /^A7-T-[A-Z0-9-]+$/u,
);
const inputDigests = requireDigestRecord(
  integrationEvidence.inputDigests,
  EXPECTED_INPUT_DIGEST_KEYS,
);
const caseEvidence = requireCaseEvidence(integrationEvidence.caseEvidence, selectedCases);
const realBrowserEvidence = requireRealBrowserEvidence(integrationEvidence.realBrowserEvidence);
if (
  integrationEvidence.passedCases !== EXPECTED_THREAT_CASES ||
  integrationEvidence.caseRegistryDigest !== EXPECTED_CASE_REGISTRY_DIGEST ||
  integrationEvidence.browserBoundaryProbes !== 14 ||
  integrationEvidence.repositorySha !== revision ||
  integrationEvidence.dirtyDevelopmentEvidence !== false ||
  integrationEvidence.claimClass !== 'ARCHITECTURE_TEST_ONLY' ||
  integrationEvidence.paidExternalServices !== 0 ||
  integrationEvidence.productionCredentials !== 0
) {
  throw new Error('AICO-007 integration evidence is incomplete or targets the wrong revision.');
}

const mutationEvidence = parseEvidence(
  runChecked(
    '12 source-control mutations',
    'node',
    ['scripts/prove-aico-007-control-mutations.mjs'],
    {
      AICO_PREVIEW_PROOF_REPOSITORY_SHA: revision,
      AICO_PREVIEW_PROOF_DIRTY_DEVELOPMENT: 'false',
    },
  ),
  'aico-007-source-control-mutations/v1',
);
const mutationKills = requireMutationKills(mutationEvidence.kills);
if (
  mutationEvidence.baselineThreatCases !== EXPECTED_THREAT_CASES ||
  mutationEvidence.controlMutations !== EXPECTED_CONTROL_MUTATIONS ||
  mutationEvidence.killedMutations !== EXPECTED_CONTROL_MUTATIONS ||
  mutationEvidence.killedCaseAssertions !== 38 ||
  mutationEvidence.survivingMutations !== 0 ||
  mutationEvidence.skippedMutations !== 0 ||
  mutationEvidence.exceptionInjectionMutations !== 0 ||
  mutationEvidence.isolatedCopy !== true ||
  mutationEvidence.exactIntendedCaseFailures !== true
) {
  throw new Error('AICO-007 source-mutation evidence is incomplete or invalid.');
}

const manifestBody = {
  evidenceSchema: 'aico-007-canonical-proof/v1',
  claimClass: 'ARCHITECTURE_TEST_ONLY',
  repositorySha: revision,
  cleanState: true,
  dirtyDevelopmentEvidence: false,
  resultClass: 'PASSED',
  threatCases: EXPECTED_THREAT_CASES,
  caseIds: selectedCases,
  caseRegistryDigest: EXPECTED_CASE_REGISTRY_DIGEST,
  browserBoundaryProbes: integrationEvidence.browserBoundaryProbes,
  sourceControlMutations: EXPECTED_CONTROL_MUTATIONS,
  killedMutations: mutationEvidence.killedMutations,
  survivingMutations: mutationEvidence.survivingMutations,
  killedCaseAssertions: mutationEvidence.killedCaseAssertions,
  mutationKills,
  inputDigests,
  caseEvidence,
  realBrowserEvidence,
  evidenceFiles: EVIDENCE_FILES.map(fileEvidence),
  runtimeClass: 'REAL_BROWSER_DISPOSABLE_CA_LOOPBACK',
  durationBucket: durationBucket(Date.now() - startedAt),
  paidExternalServices: 0,
  productionCredentials: 0,
};
const manifest = {
  ...manifestBody,
  selfDigest: digest(canonicalJson(manifestBody)),
};
const finalRevision = run('git', ['rev-parse', 'HEAD'], { capture: true }).stdout.trim();
const finalStatus = run('git', ['status', '--porcelain'], { capture: true }).stdout.trim();
if (finalRevision !== revision || finalStatus.length > 0) {
  throw new Error('AICO-007 repository SHA or clean state changed during proof execution.');
}
const serializedManifest = canonicalJson(manifest);
assertEvidenceSafe(serializedManifest);
mkdirSync('.aico-evidence', { recursive: true });
writeFileSync('.aico-evidence/aico-007-preview-proof.json', `${serializedManifest}\n`, {
  encoding: 'utf8',
  flag: 'w',
});
process.stdout.write(`${serializedManifest}\n`);

function runChecked(label, command, args, env = {}) {
  const result = run(command, args, { allowFailure: true, capture: true, env });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}; raw output withheld.`);
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function parseEvidence(output, schema) {
  for (const line of output.split(/\r?\n/).reverse()) {
    if (!line.startsWith('{') || line.length > 2_000_000) continue;
    try {
      const candidate = JSON.parse(line);
      if (candidate.evidenceSchema === schema) return candidate;
    } catch {
      // Non-JSON tool output is intentionally ignored and never re-emitted.
    }
  }
  throw new Error(`Missing bounded ${schema} evidence; raw output withheld.`);
}

function requireCaseEvidence(value, selectedCases) {
  if (!Array.isArray(value) || value.length !== selectedCases.length) {
    throw new Error('AICO-007 per-case evidence does not match the closed case registry.');
  }
  return Object.freeze(
    value.map((entry, index) => {
      requireExactKeys(entry, [
        'caseId',
        'resultClass',
        'reasonClass',
        'ledgerDigest',
        'sideEffectTotals',
        'cleanupResult',
        'fileHashResults',
      ]);
      if (
        entry.caseId !== selectedCases[index] ||
        entry.resultClass !== 'PASSED' ||
        typeof entry.reasonClass !== 'string' ||
        !/^[A-Z][A-Z0-9_]{0,79}$/u.test(entry.reasonClass) ||
        typeof entry.ledgerDigest !== 'string' ||
        !SHA256_PATTERN.test(entry.ledgerDigest)
      ) {
        throw new Error('AICO-007 per-case evidence contains an invalid result binding.');
      }
      const sideEffectTotals = requireCounterRecord(entry.sideEffectTotals, SIDE_EFFECT_KEYS);
      const cleanupResult = requireCleanupResult(entry.cleanupResult);
      const fileHashResults = requireFileHashResults(entry.fileHashResults);
      requireCaseInvariants(entry.caseId, sideEffectTotals, cleanupResult, fileHashResults);
      return Object.freeze({
        caseId: entry.caseId,
        resultClass: entry.resultClass,
        reasonClass: entry.reasonClass,
        ledgerDigest: entry.ledgerDigest,
        sideEffectTotals,
        cleanupResult,
        fileHashResults,
      });
    }),
  );
}

function requireRealBrowserEvidence(value) {
  requireExactKeys(value, [
    'kind',
    'trustMode',
    'counts',
    'probeSummary',
    'originClasses',
    'digests',
    'freshProfileRemoved',
  ]);
  if (
    value.kind !== 'COMPLETED' ||
    value.trustMode !== 'DISPOSABLE_CA_SPKI' ||
    value.freshProfileRemoved !== true ||
    canonicalJson(value.originClasses) !== canonicalJson(['PREVIEW_TEST_SITE', 'CONTROL_TEST_SITE'])
  ) {
    throw new Error('AICO-007 real-browser evidence did not complete its closed boundary.');
  }
  const counts = requireCounterRecord(value.counts, [
    'pageRecords',
    'invalidPageRecords',
    'httpRequests',
    'authorizationCalls',
    'exchangeCalls',
    'privateControlEffects',
    'controlSiteRequests',
  ]);
  if (
    counts.pageRecords !== 14 ||
    counts.invalidPageRecords !== 0 ||
    counts.httpRequests < 1 ||
    counts.authorizationCalls < 1 ||
    counts.exchangeCalls !== 1 ||
    counts.privateControlEffects !== 0 ||
    counts.controlSiteRequests !== 0
  ) {
    throw new Error('AICO-007 real-browser evidence contains an invalid effect count.');
  }
  const digests = requireDigestRecord(value.digests, [
    'browserExecutableDigest',
    'browserRuntimeProfileDigest',
    'probeResultDigest',
    'tlsProfileDigest',
  ]);
  const probeSummary = requireRealBrowserProbeSummary(value.probeSummary);
  const calculatedProbeDigest = digest(
    probeSummary
      .map((record) =>
        [record.probeId, record.outcome, record.detailClass, record.count].join('\u0000'),
      )
      .join('\n'),
  );
  if (digests.probeResultDigest !== calculatedProbeDigest) {
    throw new Error('AICO-007 real-browser probe digest does not bind the safe result set.');
  }
  return Object.freeze({
    kind: value.kind,
    trustMode: value.trustMode,
    counts,
    probeSummary,
    originClasses: Object.freeze([...value.originClasses]),
    digests,
    freshProfileRemoved: value.freshProfileRemoved,
  });
}

function requireRealBrowserProbeSummary(value) {
  if (!Array.isArray(value) || value.length !== EXPECTED_REAL_BROWSER_PROBES.length) {
    throw new Error('AICO-007 real-browser evidence does not contain exactly 14 safe probes.');
  }
  const output = value.map((entry) => {
    requireExactKeys(entry, ['probeId', 'outcome', 'detailClass', 'count']);
    if (
      typeof entry.probeId !== 'string' ||
      !/^[A-Z][A-Z0-9_]{0,79}$/u.test(entry.probeId) ||
      typeof entry.outcome !== 'string' ||
      !/^[A-Z][A-Z0-9_]{0,79}$/u.test(entry.outcome) ||
      typeof entry.detailClass !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9-]{0,79}$/u.test(entry.detailClass) ||
      entry.count !== 1
    ) {
      throw new Error('AICO-007 real-browser evidence contains an invalid probe record.');
    }
    return Object.freeze({
      probeId: entry.probeId,
      outcome: entry.outcome,
      detailClass: entry.detailClass,
      count: entry.count,
    });
  });
  if (canonicalJson(output) !== canonicalJson(EXPECTED_REAL_BROWSER_PROBES)) {
    throw new Error('AICO-007 real-browser evidence contains an unsafe probe outcome.');
  }
  return Object.freeze(output);
}

function requireCaseInvariants(caseId, sideEffects, cleanupResult, fileHashResults) {
  const expectedSideEffects = EXPECTED_CASE_SIDE_EFFECT_TOTALS[caseId];
  if (
    expectedSideEffects === undefined ||
    canonicalJson(sideEffects) !== canonicalJson(expectedSideEffects)
  ) {
    throw new Error(`AICO-007 ${caseId} evidence does not match its exact effect ledger.`);
  }

  if (caseId === 'A7-T-CLEANUP-01') {
    if (
      cleanupResult === null ||
      cleanupResult.resultClass !== 'SUCCEEDED' ||
      cleanupResult.objectsRemaining !== 0 ||
      cleanupResult.cacheEntriesRemaining !== 0 ||
      cleanupResult.retiredHosts !== 1
    ) {
      throw new Error('AICO-007 cleanup evidence is not a successful zero-residue result.');
    }
  } else if (cleanupResult !== null) {
    throw new Error(`AICO-007 ${caseId} evidence contains an unexpected cleanup result.`);
  }

  if (caseId === 'A7-T-POSITIVE-01') {
    if (
      fileHashResults.length !== 4 ||
      canonicalJson(fileHashResults.map((record) => record.pathClass).sort()) !==
        canonicalJson([
          'MANIFEST_ENTRY_1',
          'MANIFEST_ENTRY_2',
          'MANIFEST_ENTRY_3',
          'MANIFEST_ENTRY_4',
        ]) ||
      fileHashResults.some(
        (record) => !record.matched || record.expectedDigest !== record.actualDigest,
      )
    ) {
      throw new Error('AICO-007 positive evidence does not prove matched served-file integrity.');
    }
    return;
  }
  if (caseId === 'A7-T-INTEGRITY-01' || caseId === 'A7-T-SERVE-INTEGRITY-01') {
    const expectedPathClass =
      caseId === 'A7-T-INTEGRITY-01' ? 'MUTATED_SOURCE_ENTRY_1' : 'TRUNCATED_OBJECT_ENTRY_1';
    if (
      fileHashResults.length !== 1 ||
      fileHashResults[0].pathClass !== expectedPathClass ||
      fileHashResults.some(
        (record) => record.matched || record.expectedDigest === record.actualDigest,
      )
    ) {
      throw new Error(`AICO-007 ${caseId} evidence does not prove integrity-tamper detection.`);
    }
    return;
  }
  if (fileHashResults.length !== 0) {
    throw new Error(`AICO-007 ${caseId} evidence contains an unexpected file-hash result.`);
  }
}

function totals(
  authorityReads,
  objectReads,
  cacheLookups,
  generatedBytesServed,
  businessEvents,
  toolCalls,
  redactionDrops,
) {
  return Object.freeze({
    authorityReads,
    objectReads,
    cacheLookups,
    generatedBytesServed,
    foreignBytesServed: 0,
    businessEvents,
    outboxMessages: businessEvents,
    providerCalls: 0,
    toolCalls,
    sandboxCalls: 0,
    costEffects: 0,
    redactionDrops,
  });
}

function requireCounterRecord(value, expectedKeys) {
  requireExactKeys(value, expectedKeys);
  const output = {};
  for (const key of expectedKeys) output[key] = requireBoundedCount(value[key]);
  return Object.freeze(output);
}

function requireCleanupResult(value) {
  if (value === null) return null;
  requireExactKeys(value, [
    'resultClass',
    'objectsRemaining',
    'cacheEntriesRemaining',
    'retiredHosts',
  ]);
  if (typeof value.resultClass !== 'string' || !/^[A-Z][A-Z0-9_]{0,79}$/u.test(value.resultClass)) {
    throw new Error('AICO-007 cleanup evidence has an invalid result class.');
  }
  return Object.freeze({
    resultClass: value.resultClass,
    objectsRemaining: requireBoundedCount(value.objectsRemaining),
    cacheEntriesRemaining: requireBoundedCount(value.cacheEntriesRemaining),
    retiredHosts: requireBoundedCount(value.retiredHosts),
  });
}

function requireFileHashResults(value) {
  if (!Array.isArray(value) || value.length > 128) {
    throw new Error('AICO-007 file-hash evidence is not bounded.');
  }
  return Object.freeze(
    value.map((entry) => {
      requireExactKeys(entry, ['pathClass', 'expectedDigest', 'actualDigest', 'matched']);
      if (
        typeof entry.pathClass !== 'string' ||
        !/^[A-Z][A-Z0-9_]{0,79}$/u.test(entry.pathClass) ||
        typeof entry.expectedDigest !== 'string' ||
        !SHA256_PATTERN.test(entry.expectedDigest) ||
        typeof entry.actualDigest !== 'string' ||
        !SHA256_PATTERN.test(entry.actualDigest) ||
        typeof entry.matched !== 'boolean'
      ) {
        throw new Error('AICO-007 file-hash evidence contains an invalid record.');
      }
      return Object.freeze({
        pathClass: entry.pathClass,
        expectedDigest: entry.expectedDigest,
        actualDigest: entry.actualDigest,
        matched: entry.matched,
      });
    }),
  );
}

function requireExactKeys(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AICO-007 evidence record is not a closed object.');
  }
  const actual = Object.keys(value).sort();
  if (canonicalJson(actual) !== canonicalJson([...expectedKeys].sort())) {
    throw new Error('AICO-007 evidence record has unknown or missing keys.');
  }
}

function requireBoundedCount(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error('AICO-007 evidence count is outside its closed bound.');
  }
  return value;
}

function fileEvidence(path) {
  const body = readFileSync(path);
  return { path, size: statSync(path).size, digest: digest(body) };
}

function requireClosedStringSet(value, expectedLength, pattern) {
  if (
    !Array.isArray(value) ||
    value.length !== expectedLength ||
    new Set(value).size !== expectedLength ||
    value.some((entry) => typeof entry !== 'string' || !pattern.test(entry))
  ) {
    throw new Error('AICO-007 evidence contains an invalid closed identifier set.');
  }
  return Object.freeze([...value]);
}

function requireDigestRecord(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AICO-007 evidence digest record is invalid.');
  }
  const keys = Object.keys(value).sort();
  if (canonicalJson(keys) !== canonicalJson([...expectedKeys].sort())) {
    throw new Error('AICO-007 evidence digest record has unknown or missing keys.');
  }
  const output = {};
  for (const key of expectedKeys) {
    if (typeof value[key] !== 'string' || !SHA256_PATTERN.test(value[key])) {
      throw new Error('AICO-007 evidence contains an invalid SHA-256 digest.');
    }
    output[key] = value[key];
  }
  return Object.freeze(output);
}

function requireMutationKills(value) {
  if (!Array.isArray(value) || value.length !== EXPECTED_CONTROL_MUTATIONS) {
    throw new Error('AICO-007 mutation evidence does not contain exactly 12 kills.');
  }
  const expectedIds = Array.from(
    { length: EXPECTED_CONTROL_MUTATIONS },
    (_, index) => `A7-M-${String(index + 1).padStart(2, '0')}`,
  );
  const output = value.map((entry, index) => {
    if (
      entry === null ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      entry.mutationId !== expectedIds[index] ||
      !Array.isArray(entry.killedCases) ||
      entry.killedCases.length === 0
    ) {
      throw new Error('AICO-007 mutation IDs are incomplete or out of order.');
    }
    return Object.freeze({
      mutationId: entry.mutationId,
      killedCases: requireClosedStringSet(
        entry.killedCases,
        entry.killedCases?.length ?? -1,
        /^A7-T-[A-Z0-9-]+$/u,
      ),
    });
  });
  return Object.freeze(output);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Evidence numbers must be finite.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  throw new TypeError('Evidence contains a non-JSON value.');
}

function assertEvidenceSafe(serialized) {
  for (const prohibited of [
    /AICO007_[A-Z0-9_]*CANARY/i,
    /__Host-aico_preview/i,
    /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/i,
    /https?:\\?\/\\?\//i,
    /[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}/,
  ]) {
    if (prohibited.test(serialized)) {
      throw new Error('AICO-007 bounded evidence safety scan failed.');
    }
  }
}

function durationBucket(milliseconds) {
  if (milliseconds < 30_000) return 'LT_30_SECONDS';
  if (milliseconds < 120_000) return 'LT_2_MINUTES';
  if (milliseconds < 300_000) return 'LT_5_MINUTES';
  return 'GTE_5_MINUTES';
}
