import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { run } from './process-utils.mjs';

const EXPECTED_ACCEPTANCE_IDS = 13;
const EXPECTED_FIXTURE_IDS = 15;
const EXPECTED_SCENARIOS = 64;
const EXPECTED_MUTATIONS = 30;
const EXPECTED_ACCEPTANCE_REGISTRY = Object.freeze([
  'A5-T-SUCCESS-01',
  'A5-T-MALFORMED-01',
  'A5-T-REPAIR-01',
  'A5-T-TIMEOUT-01',
  'A5-T-RATE-01',
  'A5-T-CANCEL-01',
  'A5-T-SAFETY-01',
  'A5-T-SECRET-01',
  'A5-T-META-01',
  'A5-T-VERSION-01',
  'A5-T-REPLAY-01',
  'A5-T-MUTATION-01',
  'A5-T-VERIFY-01',
]);
const EXPECTED_FIXTURE_REGISTRY = Object.freeze(
  Array.from(
    { length: EXPECTED_FIXTURE_IDS },
    (_, index) => `A5-FX-${String(index + 1).padStart(2, '0')}`,
  ),
);
const EXPECTED_MUTATION_REGISTRY = Object.freeze(
  Array.from(
    { length: EXPECTED_MUTATIONS },
    (_, index) => `A5-M-${String(index + 1).padStart(2, '0')}`,
  ),
);
const MAX_MANIFEST_BYTES = 65_536;
const INTEGRATION_SCHEMA = 'aico-005-provider-runtime-integration/v1';
const MUTATION_SCHEMA = 'aico-005-provider-runtime-source-control-mutations/v1';
const MANIFEST_SCHEMA = 'aico-005-provider-proof/v1';
const EXPECTED_SCENARIO_REGISTRY_DIGEST =
  'sha256:cbab42b98a425787a95f72c19dd3a7d71c669e36003c16af6a1c8748fa61bbdc';
const EXPECTED_MUTATION_REGISTRY_DIGEST =
  'sha256:e0e09e80baa11c393f06c9f9c415f9cc3a1386ca93403860160ada511babe7a2';
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const LEDGER_KEYS = Object.freeze([
  'artifactEffects',
  'candidateCommits',
  'costEffects',
  'externalProviderCalls',
  'providerCalls',
  'reconciliations',
  'repairInvocations',
  'reservations',
  'retrySchedules',
  'sdkRetries',
  'stateEffects',
  'taskEffects',
  'toolEffects',
  'workerSleeps',
]);
const EVIDENCE_FILES = Object.freeze([
  '.github/workflows/aico-005-provider-runtime-proof.yml',
  'docs/delivery/AICO_005_PROVIDER_PROOF_EVIDENCE.md',
  'scripts/aico-005-provider-runtime-proof.mjs',
  'scripts/prove-aico-005-provider-runtime-control-mutations.mjs',
  'test/aico-005-spike/contracts.ts',
  'test/aico-005-spike/fail-closed-control-mutations.ts',
  'test/aico-005-spike/fixture.ts',
  'test/aico-005-spike/in-memory-runtime.store.ts',
  'test/aico-005-spike/provider-runtime-proof.service.ts',
  'test/aico-005-spike/runtime-schema-validator.ts',
  'test/aico-005-spike/scripted-model-provider.adapter.ts',
  'test/provider-runtime-proof.control-mutation.spec.ts',
  'test/provider-runtime-proof.integration.spec.ts',
]);
const INPUT_FILES = Object.freeze([
  'docs/architecture/011-model-provider-employee-runtime-selection.md',
  'docs/contracts/MODEL_PROVIDER_RUNTIME.md',
  'docs/contracts/schemas/model-provider-runtime.v1.schema.json',
  'docs/delivery/AICO_005_AEO_AUDIT.md',
  'docs/delivery/AICO_005_PRODUCT_TRACE.json',
  'docs/delivery/AICO_005_PROVIDER_EVIDENCE.md',
]);

const startedAt = Date.now();
const initialStatus = git(['status', '--porcelain']);
if (initialStatus.length > 0) {
  throw new Error('AICO-005 provider-runtime exact-SHA proof refuses a dirty worktree.');
}
const revision = git(['rev-parse', 'HEAD']);
if (!/^[0-9a-f]{40}$/u.test(revision)) {
  throw new Error('AICO-005 provider-runtime proof requires an exact 40-hex SHA.');
}
const expectedRevision = process.env.AICO_PROVIDER_RUNTIME_PROOF_EXPECTED_SHA?.trim();
if (
  expectedRevision !== undefined &&
  (!/^[0-9a-f]{40}$/u.test(expectedRevision) || expectedRevision !== revision)
) {
  throw new Error('AICO-005 provider-runtime checkout does not match the expected proof SHA.');
}

run('npm', ['run', 'verify:ci']);
assertRepositoryUnchanged(revision, 'canonical verification');

const require = createRequire(import.meta.url);
require('ts-node/register/transpile-only');
const contracts = require('../test/aico-005-spike/contracts.ts');
const {
  A5_SOURCE_CONTROL_MUTATIONS,
} = require('../test/aico-005-spike/fail-closed-control-mutations.ts');
const {
  A5_ACCEPTANCE_IDS,
  A5_FIXTURE_IDS,
  A5_SCENARIO_IDS,
  A5_SCENARIO_REGISTRY,
  A5_SCENARIO_REGISTRY_DIGEST,
  canonicalDigest,
  canonicalJson,
} = contracts;

requireClosedRegistry(
  'acceptance',
  A5_ACCEPTANCE_IDS,
  EXPECTED_ACCEPTANCE_IDS,
  /^A5-T-[A-Z0-9-]+$/u,
);
requireClosedRegistry('fixture', A5_FIXTURE_IDS, EXPECTED_FIXTURE_IDS, /^A5-FX-[0-9]{2}$/u);
requireClosedRegistry('scenario', A5_SCENARIO_IDS, EXPECTED_SCENARIOS, /^A5-S-[A-Z0-9-]+$/u);
if (
  canonicalJson(A5_ACCEPTANCE_IDS) !== canonicalJson(EXPECTED_ACCEPTANCE_REGISTRY) ||
  canonicalJson(A5_FIXTURE_IDS) !== canonicalJson(EXPECTED_FIXTURE_REGISTRY)
) {
  throw new Error('AICO-005 acceptance or fixture registry differs from its accepted closed IDs.');
}
if (
  !Array.isArray(A5_SCENARIO_REGISTRY) ||
  A5_SCENARIO_REGISTRY.length !== EXPECTED_SCENARIOS ||
  A5_SCENARIO_REGISTRY_DIGEST !== EXPECTED_SCENARIO_REGISTRY_DIGEST
) {
  throw new Error('AICO-005 scenario registry is incomplete or lacks a canonical digest.');
}
requireClosedRegistry(
  'mutation',
  A5_SOURCE_CONTROL_MUTATIONS.map(({ id }) => id),
  EXPECTED_MUTATIONS,
  /^A5-M-[0-9]{2}$/u,
);
if (
  canonicalJson(A5_SOURCE_CONTROL_MUTATIONS.map(({ id }) => id)) !==
  canonicalJson(EXPECTED_MUTATION_REGISTRY)
) {
  throw new Error('AICO-005 source-mutation registry differs from its exact sequential IDs.');
}
const mappedAcceptanceIds = [
  ...new Set(A5_SCENARIO_REGISTRY.map(({ acceptanceId }) => acceptanceId)),
];
const mappedFixtureIds = [...new Set(A5_SCENARIO_REGISTRY.map(({ fixtureId }) => fixtureId))];
const mutationRegistryDigest = canonicalDigest(
  A5_SOURCE_CONTROL_MUTATIONS.map(({ id, control, intendedScenarios, target }) => ({
    id,
    control,
    intendedScenarios,
    target,
  })),
);
if (
  canonicalJson(mappedAcceptanceIds) !== canonicalJson(A5_ACCEPTANCE_IDS) ||
  mappedFixtureIds.some((id) => !A5_FIXTURE_IDS.includes(id)) ||
  A5_FIXTURE_IDS.some((id) => !mappedFixtureIds.includes(id))
) {
  throw new Error('AICO-005 scenario registry does not cover every acceptance and fixture ID.');
}
if (mutationRegistryDigest !== EXPECTED_MUTATION_REGISTRY_DIGEST) {
  throw new Error('AICO-005 source-mutation registry digest differs from its closed value.');
}

const integrationOutput = runChecked(
  '64-scenario provider-runtime integration proof',
  'npm',
  [
    'exec',
    '--',
    'jest',
    '--runInBand',
    '--runTestsByPath',
    'test/provider-runtime-proof.integration.spec.ts',
  ],
  {
    AICO_REQUIRE_PROVIDER_RUNTIME_PROOF: 'true',
    AICO_PROVIDER_RUNTIME_PROOF_REPOSITORY_SHA: revision,
    AICO_PROVIDER_RUNTIME_PROOF_DIRTY_DEVELOPMENT: 'false',
  },
);
const integrationEvidence = parseEvidence(integrationOutput, INTEGRATION_SCHEMA);
const scenarioEvidence = requireIntegrationEvidence(integrationEvidence, {
  acceptanceIds: A5_ACCEPTANCE_IDS,
  fixtureIds: A5_FIXTURE_IDS,
  scenarioIds: A5_SCENARIO_IDS,
  scenarioRegistry: A5_SCENARIO_REGISTRY,
  scenarioRegistryDigest: A5_SCENARIO_REGISTRY_DIGEST,
  repositorySha: revision,
  canonicalDigest,
});

const mutationOutput = runChecked(
  '30 source-control mutations',
  'node',
  ['scripts/prove-aico-005-provider-runtime-control-mutations.mjs'],
  {
    AICO_PROVIDER_RUNTIME_PROOF_REPOSITORY_SHA: revision,
    AICO_PROVIDER_RUNTIME_PROOF_DIRTY_DEVELOPMENT: 'false',
  },
);
const mutationEvidence = parseEvidence(mutationOutput, MUTATION_SCHEMA);
const mutationKills = requireMutationEvidence(mutationEvidence, A5_SOURCE_CONTROL_MUTATIONS);

assertRepositoryUnchanged(revision, 'integration and mutation proof');

const inputDigests = Object.fromEntries(INPUT_FILES.map((path) => [path, fileDigest(path)]));
const evidenceFiles = EVIDENCE_FILES.map((path) => ({ path, digest: fileDigest(path) }));
const effectTotals = sumLedgers(scenarioEvidence.map(({ effectTotals: totals }) => totals));
if (
  effectTotals.externalProviderCalls !== 0 ||
  effectTotals.sdkRetries !== 0 ||
  effectTotals.workerSleeps !== 0
) {
  throw new Error('AICO-005 proof recorded a prohibited external/retry/sleep effect.');
}

const semanticProof = {
  claimClass: 'ARCHITECTURE_TEST_ONLY',
  issue: 'duckvhuynh/aico-backend#26',
  parentIssue: 'duckvhuynh/aicompanyos#5',
  decisionIssue: 'duckvhuynh/aico-backend#25',
  repository: process.env.GITHUB_REPOSITORY || 'duckvhuynh/aico-backend',
  repositorySha: revision,
  cleanState: true,
  registries: {
    acceptanceIds: [...A5_ACCEPTANCE_IDS],
    acceptanceDigest: canonicalDigest(A5_ACCEPTANCE_IDS),
    fixtureIds: [...A5_FIXTURE_IDS],
    fixtureDigest: canonicalDigest(A5_FIXTURE_IDS),
    scenarioIds: [...A5_SCENARIO_IDS],
    scenarioRegistryDigest: A5_SCENARIO_REGISTRY_DIGEST,
    mutationIds: A5_SOURCE_CONTROL_MUTATIONS.map(({ id }) => id),
    mutationRegistryDigest,
  },
  counts: {
    acceptanceIds: EXPECTED_ACCEPTANCE_IDS,
    fixtures: EXPECTED_FIXTURE_IDS,
    scenarios: EXPECTED_SCENARIOS,
    passedScenarios: scenarioEvidence.length,
    sourceMutations: EXPECTED_MUTATIONS,
    killedMutations: mutationKills.length,
    survivingMutations: 0,
    skippedScenarios: 0,
    skippedMutations: 0,
    externalProviderCalls: integrationEvidence.externalProviderCalls,
    productionCredentials: integrationEvidence.productionCredentials,
    paidExternalServices: integrationEvidence.paidExternalServices,
    sdkRetries: effectTotals.sdkRetries,
    workerSleeps: effectTotals.workerSleeps,
  },
  inputDigests,
  scenarioEvidence,
  effectTotals,
  mutationKills,
  evidenceFiles,
  cleanup: {
    mutationWorkspaceRemoved: mutationEvidence.cleanupCompleted === true,
    repositorySourcesRestored: mutationEvidence.restoredSources === true,
    repositoryUnchanged: true,
  },
};
const proofBodyDigest = canonicalDigest(semanticProof);
const manifestBody = {
  evidenceSchema: MANIFEST_SCHEMA,
  semanticProof,
  proofBodyDigest,
  execution: {
    environmentClass: process.env.GITHUB_ACTIONS === 'true' ? 'GITHUB_ACTIONS' : 'LOCAL',
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    durationBucket: durationBucket(Date.now() - startedAt),
    hostedRunId: process.env.GITHUB_RUN_ID || null,
    hostedRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    hostedWorkflow: process.env.GITHUB_WORKFLOW || null,
  },
  artifact: {
    name: `aico-005-provider-proof-${revision}`,
    path: '.aico-evidence/aico-005-provider-proof.json',
    retentionDays: 90,
  },
};
const manifest = {
  ...manifestBody,
  selfDigest: canonicalDigest(manifestBody),
};

const serializedManifest = `${canonicalJson(manifest)}\n`;
assertEvidenceSafe(serializedManifest);
if (Buffer.byteLength(serializedManifest, 'utf8') > MAX_MANIFEST_BYTES) {
  throw new Error('AICO-005 provider-runtime evidence exceeded the 65,536-byte bound.');
}

assertRepositoryUnchanged(revision, 'manifest construction');
mkdirSync('.aico-evidence', { recursive: true });
writeFileSync('.aico-evidence/aico-005-provider-proof.json', serializedManifest, 'utf8');
const roundTripped = JSON.parse(
  readFileSync('.aico-evidence/aico-005-provider-proof.json', 'utf8'),
);
const recordedSelfDigest = roundTripped.selfDigest;
delete roundTripped.selfDigest;
if (canonicalDigest(roundTripped) !== recordedSelfDigest) {
  throw new Error('AICO-005 provider-runtime manifest self-digest failed canonical round trip.');
}
if (canonicalDigest(roundTripped.semanticProof) !== roundTripped.proofBodyDigest) {
  throw new Error('AICO-005 provider-runtime proof-body digest failed canonical round trip.');
}
if (statSync('.aico-evidence/aico-005-provider-proof.json').size > MAX_MANIFEST_BYTES) {
  throw new Error('AICO-005 provider-runtime retained manifest exceeded its byte bound.');
}
assertRepositoryUnchanged(revision, 'artifact write');
process.stdout.write(serializedManifest);

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function assertRepositoryUnchanged(expectedSha, stage) {
  if (git(['rev-parse', 'HEAD']) !== expectedSha || git(['status', '--porcelain']).length > 0) {
    throw new Error(`AICO-005 repository changed during ${stage}.`);
  }
}

function runChecked(label, command, args, env = {}) {
  const result = run(command, args, { allowFailure: true, capture: true, env });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}; raw output withheld.`);
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function parseEvidence(output, schema) {
  const lines = output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{') && line.endsWith('}'));
  for (const line of lines.reverse()) {
    try {
      const parsed = JSON.parse(line);
      if (parsed?.evidenceSchema === schema) return parsed;
    } catch {
      // Continue without exposing untrusted proof output.
    }
  }
  throw new Error(`AICO-005 proof did not emit required evidence schema ${schema}.`);
}

function requireClosedRegistry(name, values, expectedLength, pattern) {
  if (
    !Array.isArray(values) ||
    values.length !== expectedLength ||
    new Set(values).size !== expectedLength ||
    !values.every((value) => typeof value === 'string' && pattern.test(value))
  ) {
    throw new Error(
      `AICO-005 ${name} registry is not the exact closed ${expectedLength}-item set.`,
    );
  }
}

function requireIntegrationEvidence(value, expected) {
  requireExactKeys(value, [
    'acceptanceIds',
    'claimClass',
    'dirtyDevelopmentEvidence',
    'evidenceSchema',
    'externalProviderCalls',
    'fixtureIds',
    'paidExternalServices',
    'passedScenarios',
    'productionCredentials',
    'repositorySha',
    'runtimeClass',
    'scenarioEvidence',
    'scenarioRegistryDigest',
    'selectedScenarios',
  ]);
  if (
    value.evidenceSchema !== INTEGRATION_SCHEMA ||
    value.claimClass !== 'ARCHITECTURE_TEST_ONLY' ||
    value.repositorySha !== expected.repositorySha ||
    value.dirtyDevelopmentEvidence !== false ||
    value.runtimeClass !== 'DETERMINISTIC_IN_MEMORY_PROVIDER_PROOF' ||
    value.passedScenarios !== EXPECTED_SCENARIOS ||
    value.scenarioRegistryDigest !== expected.scenarioRegistryDigest ||
    value.paidExternalServices !== 0 ||
    value.productionCredentials !== 0 ||
    value.externalProviderCalls !== 0 ||
    canonicalJson(value.acceptanceIds) !== canonicalJson(expected.acceptanceIds) ||
    canonicalJson(value.fixtureIds) !== canonicalJson(expected.fixtureIds) ||
    canonicalJson(value.selectedScenarios) !== canonicalJson(expected.scenarioIds)
  ) {
    throw new Error('AICO-005 integration evidence is incomplete or targets the wrong revision.');
  }
  if (
    !Array.isArray(value.scenarioEvidence) ||
    value.scenarioEvidence.length !== EXPECTED_SCENARIOS
  ) {
    throw new Error('AICO-005 integration evidence does not contain all scenario evidence.');
  }

  return value.scenarioEvidence.map((entry, index) => {
    const expectedScenario = expected.scenarioRegistry[index];
    requireExactKeys(entry, [
      'acceptanceId',
      'effectTotals',
      'evidenceDigest',
      'ledgerDigest',
      'reasonClass',
      'resultClass',
      'scenarioId',
    ]);
    requireLedger(entry.effectTotals);
    if (
      entry.scenarioId !== expectedScenario.id ||
      entry.acceptanceId !== expectedScenario.acceptanceId ||
      entry.resultClass !== 'PASSED' ||
      entry.reasonClass !== expectedScenario.expectedReasonClass ||
      !SHA256_PATTERN.test(entry.ledgerDigest) ||
      !SHA256_PATTERN.test(entry.evidenceDigest) ||
      expected.canonicalDigest(entry.effectTotals) !== entry.ledgerDigest
    ) {
      throw new Error(`AICO-005 scenario evidence is invalid at closed index ${index}.`);
    }
    if (
      expected.canonicalDigest({
        scenarioId: entry.scenarioId,
        reasonClass: entry.reasonClass,
        effectTotals: entry.effectTotals,
      }) !== entry.evidenceDigest
    ) {
      throw new Error(`AICO-005 scenario evidence digest is invalid at closed index ${index}.`);
    }
    return entry;
  });
}

function requireMutationEvidence(value, registry) {
  requireExactKeys(value, [
    'baselinePassed',
    'baselineScenarios',
    'cleanupCompleted',
    'compilationFailureKills',
    'controlMutations',
    'evidenceSchema',
    'exactIntendedScenarioFailures',
    'exceptionInjectionMutations',
    'invalidKills',
    'isolatedCopy',
    'killedMutations',
    'killedScenarioAssertions',
    'kills',
    'restoredSources',
    'skippedMutations',
    'survivingMutations',
  ]);
  if (
    value.evidenceSchema !== MUTATION_SCHEMA ||
    value.baselineScenarios !== EXPECTED_SCENARIOS ||
    value.baselinePassed !== true ||
    value.controlMutations !== EXPECTED_MUTATIONS ||
    value.killedMutations !== EXPECTED_MUTATIONS ||
    value.killedScenarioAssertions !== EXPECTED_MUTATIONS ||
    value.survivingMutations !== 0 ||
    value.skippedMutations !== 0 ||
    value.invalidKills !== 0 ||
    value.exceptionInjectionMutations !== 0 ||
    value.compilationFailureKills !== 0 ||
    value.isolatedCopy !== true ||
    value.exactIntendedScenarioFailures !== true ||
    value.restoredSources !== true ||
    value.cleanupCompleted !== true ||
    !Array.isArray(value.kills) ||
    value.kills.length !== EXPECTED_MUTATIONS
  ) {
    throw new Error('AICO-005 source-mutation evidence is incomplete or invalid.');
  }
  return value.kills.map((kill, index) => {
    requireExactKeys(kill, [
      'control',
      'killedScenarios',
      'mutationId',
      'mutationPatchDigest',
      'restoredDigest',
      'resultClass',
      'sourceAfterDigest',
      'sourceBeforeDigest',
      'target',
    ]);
    const expected = registry[index];
    if (
      kill.mutationId !== expected.id ||
      kill.control !== expected.control ||
      kill.target !== expected.target ||
      canonicalJson(kill.killedScenarios) !== canonicalJson(expected.intendedScenarios) ||
      kill.resultClass !== 'KILLED' ||
      !SHA256_PATTERN.test(kill.sourceBeforeDigest) ||
      !SHA256_PATTERN.test(kill.mutationPatchDigest) ||
      !SHA256_PATTERN.test(kill.sourceAfterDigest) ||
      kill.restoredDigest !== kill.sourceBeforeDigest ||
      kill.sourceAfterDigest === kill.sourceBeforeDigest
    ) {
      throw new Error(`AICO-005 source-mutation evidence is invalid at closed index ${index}.`);
    }
    return kill;
  });
}

function requireLedger(value) {
  requireExactKeys(value, LEDGER_KEYS);
  for (const key of LEDGER_KEYS) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 1_000_000) {
      throw new Error(`AICO-005 side-effect ledger field ${key} is unbounded or invalid.`);
    }
  }
}

function requireExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AICO-005 evidence object is missing or malformed.');
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('AICO-005 evidence object contains missing or unknown fields.');
  }
}

function sumLedgers(ledgers) {
  const totals = Object.fromEntries(LEDGER_KEYS.map((key) => [key, 0]));
  for (const ledger of ledgers) {
    for (const key of LEDGER_KEYS) totals[key] += ledger[key];
  }
  requireLedger(totals);
  return totals;
}

function fileDigest(path) {
  return digest(readFileSync(path));
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function assertEvidenceSafe(serialized) {
  const prohibitedPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
    /\bsk-[A-Za-z0-9_-]{20,}\b/u,
    /\bAKIA[0-9A-Z]{16}\b/u,
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/iu,
  ];
  if (prohibitedPatterns.some((pattern) => pattern.test(serialized))) {
    throw new Error('AICO-005 retained evidence contains prohibited secret material.');
  }
  assertBoundedStrings(JSON.parse(serialized));
}

function assertBoundedStrings(value, path = '#') {
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > 512) {
      throw new Error(`AICO-005 retained evidence contains an oversized string at ${path}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 128) {
      throw new Error(`AICO-005 retained evidence contains an oversized array at ${path}.`);
    }
    value.forEach((entry, index) => assertBoundedStrings(entry, `${path}/${index}`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (Buffer.byteLength(key, 'utf8') > 128) {
        throw new Error(`AICO-005 retained evidence contains an oversized key at ${path}.`);
      }
      assertBoundedStrings(entry, `${path}/${key}`);
    }
  }
}

function durationBucket(milliseconds) {
  if (milliseconds < 60_000) return 'UNDER_1_MINUTE';
  if (milliseconds < 300_000) return 'ONE_TO_FIVE_MINUTES';
  if (milliseconds < 900_000) return 'FIVE_TO_FIFTEEN_MINUTES';
  if (milliseconds < 1_800_000) return 'FIFTEEN_TO_THIRTY_MINUTES';
  return 'THIRTY_MINUTES_OR_MORE';
}
