import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

import { run } from './process-utils.mjs';

const EXPECTED_SCENARIOS = 64;
const EXPECTED_MUTATIONS = 30;
const MUTATION_TARGET = 'test/aico-005-spike/contracts.ts';
const DEVELOPMENT_SOURCE_FILES = Object.freeze([
  'test/aico-005-spike/contracts.ts',
  'test/aico-005-spike/fixture.ts',
  'test/aico-005-spike/in-memory-runtime.store.ts',
  'test/aico-005-spike/provider-runtime-proof.service.ts',
  'test/aico-005-spike/runtime-schema-validator.ts',
  'test/aico-005-spike/scripted-model-provider.adapter.ts',
  'test/aico-005-spike/fail-closed-control-mutations.ts',
  'test/provider-runtime-proof.integration.spec.ts',
]);
const INTEGRATION_SCHEMA = 'aico-005-provider-runtime-integration/v1';
const MUTATION_SCHEMA = 'aico-005-provider-runtime-source-control-mutations/v1';

const require = createRequire(import.meta.url);
require('ts-node/register/transpile-only');
const {
  A5_SCENARIO_IDS,
  DEFAULT_A5_PROOF_CONTROLS,
} = require('../test/aico-005-spike/contracts.ts');
const {
  A5_SOURCE_CONTROL_MUTATIONS,
} = require('../test/aico-005-spike/fail-closed-control-mutations.ts');

const repositoryRoot = resolve(import.meta.dirname, '..');
const sourceNodeModules = join(repositoryRoot, 'node_modules');
if (!existsSync(sourceNodeModules)) throw new Error('node_modules is required.');

if (
  A5_SOURCE_CONTROL_MUTATIONS.length !== EXPECTED_MUTATIONS ||
  new Set(A5_SOURCE_CONTROL_MUTATIONS.map(({ id }) => id)).size !== EXPECTED_MUTATIONS ||
  new Set(A5_SOURCE_CONTROL_MUTATIONS.map(({ control }) => control)).size !== EXPECTED_MUTATIONS ||
  JSON.stringify(A5_SOURCE_CONTROL_MUTATIONS.map(({ control }) => control)) !==
    JSON.stringify(Object.keys(DEFAULT_A5_PROOF_CONTROLS))
) {
  throw new Error('AICO-005 source-control mutation registry is not the exact 30-item set.');
}

const expectedMutationIds = Array.from(
  { length: EXPECTED_MUTATIONS },
  (_, index) => `A5-M-${String(index + 1).padStart(2, '0')}`,
);
if (
  JSON.stringify(A5_SOURCE_CONTROL_MUTATIONS.map(({ id }) => id)) !==
  JSON.stringify(expectedMutationIds)
) {
  throw new Error('AICO-005 source-control mutation IDs are missing, reordered, or unexpected.');
}
for (const mutation of A5_SOURCE_CONTROL_MUTATIONS) {
  const expectedSearch = `  ${String(mutation.control)}: true,`;
  const expectedReplacement = `  ${String(mutation.control)}: false, // MUTANT ${mutation.id}: accepted control removed.`;
  if (
    mutation.target !== MUTATION_TARGET ||
    mutation.search !== expectedSearch ||
    mutation.replacement !== expectedReplacement ||
    mutation.intendedScenarios.length !== 1 ||
    !A5_SCENARIO_IDS.includes(mutation.intendedScenarios[0]) ||
    /FAILPOINT|EXCEPTION|THROW|COMPILE/iu.test(`${mutation.search}\n${mutation.replacement}`)
  ) {
    throw new Error(
      `AICO-005 mutation ${mutation.id} is not an exact non-exception control disable.`,
    );
  }
}

const temporaryParent = realpathSync(tmpdir());
const temporaryRoot = mkdtempSync(join(temporaryParent, 'aico005-provider-mutations-'));
const checkedRoot = resolve(temporaryRoot);
if (
  dirname(checkedRoot) !== temporaryParent ||
  !basename(checkedRoot).startsWith('aico005-provider-mutations-')
) {
  throw new Error(`Unsafe mutation root: ${checkedRoot}`);
}

const targetPaths = [...new Set(A5_SOURCE_CONTROL_MUTATIONS.map(({ target }) => target))].sort();
const repositorySourceDigests = Object.fromEntries(
  targetPaths.map((path) => [
    path,
    digest(readFileSync(requireContainedPath(repositoryRoot, path))),
  ]),
);

let resultEvidence;
let caughtError;

try {
  copyProofWorkspace();
  symlinkSync(sourceNodeModules, join(temporaryRoot, 'node_modules'), 'junction');

  const baseline = runProof(temporaryRoot);
  const baselineOutput = combinedOutput(baseline);
  if (baseline.status !== 0 || !/Tests:\s+1 passed,\s+1 total/u.test(baselineOutput)) {
    throw new Error(
      `Unmutated AICO-005 provider-runtime integration proof is red; raw output withheld and mutation evidence is invalid. Classification: ${JSON.stringify(classifyProofFailure(baseline, baselineOutput))}`,
    );
  }
  const baselineEvidence = parseEvidence(baselineOutput, INTEGRATION_SCHEMA);
  const baselineScenarioCount = Array.isArray(baselineEvidence.scenarioIds)
    ? baselineEvidence.scenarioIds.length
    : Array.isArray(baselineEvidence.scenarioEvidence)
      ? baselineEvidence.scenarioEvidence.length
      : baselineEvidence.passedScenarios;
  if (baselineScenarioCount !== EXPECTED_SCENARIOS) {
    throw new Error(
      'Unmutated AICO-005 provider-runtime integration proof is red; raw output withheld and mutation evidence is invalid.',
    );
  }

  const killed = [];
  const invalid = [];
  for (const mutation of A5_SOURCE_CONTROL_MUTATIONS) {
    const target = requireContainedPath(temporaryRoot, mutation.target);
    const original = applyExactlyOnce(target, mutation.search, mutation.replacement);
    const sourceBeforeDigest = digest(Buffer.from(original.replaceAll('\r\n', '\n'), 'utf8'));
    const sourceAfterDigest = digest(readFileSync(target));
    const mutationPatchDigest = digest(
      Buffer.from(
        canonicalJson({
          control: mutation.control,
          id: mutation.id,
          replacement: mutation.replacement,
          search: mutation.search,
          target: mutation.target,
        }),
        'utf8',
      ),
    );
    if (sourceBeforeDigest === sourceAfterDigest) {
      throw new Error(`AICO-005 mutation ${mutation.id} did not change its source digest.`);
    }

    try {
      const killedScenarios = [];
      for (const intendedScenario of mutation.intendedScenarios) {
        const result = runProof(temporaryRoot, intendedScenario);
        const output = combinedOutput(result);
        const oneFailingTest = /Tests:\s+1 failed,\s+1 total/u.test(output);
        const intendedScenarioFailed = output.includes(`${intendedScenario} failed`);
        const compilationOnlyFailure =
          /Test Suites:\s+1 failed,\s+1 total/u.test(output) &&
          !/Tests:\s+1 failed,\s+1 total/u.test(output);
        if (
          result.status === 0 ||
          !oneFailingTest ||
          !intendedScenarioFailed ||
          compilationOnlyFailure
        ) {
          invalid.push({
            mutationId: mutation.id,
            intendedScenario,
            exitCode: result.status ?? 1,
            oneFailingTest,
            intendedScenarioFailed,
            compilationOnlyFailure,
          });
        } else {
          killedScenarios.push(intendedScenario);
        }
      }

      if (killedScenarios.length === mutation.intendedScenarios.length) {
        killed.push({
          mutationId: mutation.id,
          control: mutation.control,
          target: mutation.target,
          sourceBeforeDigest,
          mutationPatchDigest,
          sourceAfterDigest,
          restoredDigest: sourceBeforeDigest,
          killedScenarios,
          resultClass: 'KILLED',
        });
      }
    } finally {
      writeFileSync(target, original, 'utf8');
      const restoredDigest = digest(
        Buffer.from(readFileSync(target, 'utf8').replaceAll('\r\n', '\n'), 'utf8'),
      );
      if (restoredDigest !== sourceBeforeDigest) {
        throw new Error(`AICO-005 mutation ${mutation.id} failed source restoration.`);
      }
    }
  }

  if (invalid.length > 0 || killed.length !== EXPECTED_MUTATIONS) {
    throw new Error(
      `AICO-005 provider-runtime mutants survived or failed outside intended scenarios: ${JSON.stringify(invalid)}`,
    );
  }

  resultEvidence = {
    evidenceSchema: MUTATION_SCHEMA,
    baselineScenarios: EXPECTED_SCENARIOS,
    baselinePassed: true,
    controlMutations: EXPECTED_MUTATIONS,
    killedMutations: killed.length,
    killedScenarioAssertions: killed.reduce(
      (count, result) => count + result.killedScenarios.length,
      0,
    ),
    survivingMutations: 0,
    skippedMutations: 0,
    invalidKills: 0,
    exceptionInjectionMutations: 0,
    compilationFailureKills: 0,
    isolatedCopy: true,
    exactIntendedScenarioFailures: true,
    restoredSources: true,
    cleanupCompleted: true,
    kills: killed,
  };
} catch (error) {
  caughtError = error;
} finally {
  const cleanupRoot = resolve(temporaryRoot);
  if (
    dirname(cleanupRoot) !== temporaryParent ||
    !basename(cleanupRoot).startsWith('aico005-provider-mutations-')
  ) {
    throw new Error(`Refusing unsafe mutation cleanup: ${cleanupRoot}`);
  }
  rmSync(cleanupRoot, { recursive: true, force: true });
}

if (existsSync(temporaryRoot)) {
  throw new Error('AICO-005 provider-runtime mutation workspace cleanup did not complete.');
}
for (const path of targetPaths) {
  if (
    digest(readFileSync(requireContainedPath(repositoryRoot, path))) !==
    repositorySourceDigests[path]
  ) {
    throw new Error(`AICO-005 mutation runner changed repository source: ${path}`);
  }
}
if (caughtError !== undefined) throw caughtError;
if (!resultEvidence) throw new Error('AICO-005 mutation runner produced no evidence.');

process.stdout.write(`${canonicalJson(resultEvidence)}\n`);

function copyProofWorkspace() {
  const listed = run('git', ['ls-files', '--cached', '-z'], {
    allowFailure: true,
    capture: true,
    cwd: repositoryRoot,
  });
  if (listed.status !== 0) {
    throw new Error('AICO-005 mutation runner could not enumerate its tracked source snapshot.');
  }
  const paths = [
    ...new Set([
      ...String(listed.stdout ?? '')
        .split('\0')
        .filter((path) => path.length > 0),
      ...DEVELOPMENT_SOURCE_FILES.filter((path) =>
        existsSync(requireContainedPath(repositoryRoot, path)),
      ),
    ]),
  ].sort();
  if (paths.length === 0) throw new Error('AICO-005 mutation source snapshot is empty.');
  for (const path of paths) {
    const source = requireContainedPath(repositoryRoot, path);
    const destination = requireContainedPath(temporaryRoot, path);
    if (!existsSync(source)) {
      throw new Error(`AICO-005 mutation source snapshot contains a missing path: ${path}`);
    }
    if (lstatSync(source).isSymbolicLink()) {
      throw new Error(`AICO-005 mutation source snapshot refuses symbolic links: ${path}`);
    }
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true });
  }
}

function requireContainedPath(root, path) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(resolvedRoot, path);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`AICO-005 mutation path escapes its validated root: ${path}`);
  }
  return resolvedPath;
}

function runProof(cwd, onlyScenario) {
  return run(
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
      allowFailure: true,
      capture: true,
      cwd,
      env: {
        AICO_REQUIRE_PROVIDER_RUNTIME_PROOF: 'true',
        AICO_PROVIDER_RUNTIME_PROOF_REPOSITORY_SHA: 'UNCOMMITTED',
        AICO_PROVIDER_RUNTIME_PROOF_DIRTY_DEVELOPMENT: 'true',
        ...(onlyScenario === undefined ? {} : { AICO005_ONLY_SCENARIO: onlyScenario }),
      },
    },
  );
}

function combinedOutput(result) {
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function classifyProofFailure(result, output) {
  const runtimeClasses = [
    'ReferenceError',
    'TypeError',
    'SyntaxError',
    'RangeError',
    'ENOENT',
    'EACCES',
    'ERR_REQUIRE_ESM',
    'ERR_MODULE_NOT_FOUND',
  ].filter((value) => output.includes(value));
  const proofCodes = [...new Set(output.match(/AICO005_PROOF_[A-Z0-9_]+/gu) ?? [])].sort();
  return {
    exitCode: result.status ?? 1,
    testSuiteFailed: /Test Suites:\s+1 failed/u.test(output),
    testFailed: /Tests:\s+1 failed/u.test(output),
    noTestsFound: /No tests found/iu.test(output),
    moduleResolutionFailure: /Cannot find module|MODULE_NOT_FOUND/iu.test(output),
    typeScriptDiagnostic: /error TS[0-9]+/u.test(output),
    runtimeClasses,
    proofCodes,
    evidenceLinePresent: output
      .split(/\r?\n/u)
      .some((line) => line.includes(`\"evidenceSchema\":\"${INTEGRATION_SCHEMA}\"`)),
  };
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
      // Continue without exposing untrusted test output.
    }
  }
  throw new Error(`AICO-005 proof did not emit required evidence schema ${schema}.`);
}

function applyExactlyOnce(path, search, replacement) {
  const original = readFileSync(path, 'utf8');
  const normalized = original.replaceAll('\r\n', '\n');
  const matches = normalized.split(search).length - 1;
  if (matches !== 1) {
    throw new Error(`Mutation must match exactly once; matched ${matches}: ${path}`);
  }
  writeFileSync(path, normalized.replace(search, replacement), 'utf8');
  return original;
}

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}
