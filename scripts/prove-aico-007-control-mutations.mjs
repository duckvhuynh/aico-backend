import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

import { run } from './process-utils.mjs';

const require = createRequire(import.meta.url);
require('ts-node/register/transpile-only');
const {
  A7_SOURCE_CONTROL_MUTATIONS,
} = require('../test/aico-007-spike/fail-closed-control-mutations.ts');

const repositoryRoot = resolve(import.meta.dirname, '..');
const sourceNodeModules = join(repositoryRoot, 'node_modules');
if (!existsSync(sourceNodeModules)) throw new Error('node_modules is required.');

const temporaryParent = realpathSync(tmpdir());
const temporaryRoot = mkdtempSync(join(temporaryParent, 'aico007-source-mutations-'));
const checkedRoot = resolve(temporaryRoot);
if (
  dirname(checkedRoot) !== temporaryParent ||
  !basename(checkedRoot).startsWith('aico007-source-mutations-')
) {
  throw new Error(`Unsafe mutation root: ${checkedRoot}`);
}

function shouldCopy(source) {
  const relativePath = relative(repositoryRoot, source);
  if (relativePath === '') return true;
  return !relativePath
    .split(sep)
    .some((segment) =>
      ['.git', 'node_modules', 'dist', 'coverage', '.aico-evidence'].includes(segment),
    );
}

function combinedOutput(result) {
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function runProof(cwd, onlyCase) {
  return run(
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
      allowFailure: true,
      capture: true,
      cwd,
      env: {
        AICO_REQUIRE_PREVIEW_PROOF: 'true',
        AICO_PREVIEW_PROOF_REPOSITORY_SHA: 'UNCOMMITTED',
        AICO_PREVIEW_PROOF_DIRTY_DEVELOPMENT: 'true',
        ...(onlyCase === undefined ? {} : { AICO007_ONLY_CASE: onlyCase }),
      },
    },
  );
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

try {
  cpSync(repositoryRoot, temporaryRoot, { recursive: true, filter: shouldCopy });
  symlinkSync(sourceNodeModules, join(temporaryRoot, 'node_modules'), 'junction');

  const baseline = runProof(temporaryRoot);
  const baselineOutput = combinedOutput(baseline);
  if (baseline.status !== 0 || !/Tests:\s+1 passed,\s+1 total/.test(baselineOutput)) {
    const blocker = baselineOutput.match(/Real browser proof blocked: ([A-Z_]+)/u)?.[1];
    throw new Error(
      `Unmutated AICO-007 integration proof is red${blocker === undefined ? '' : ` (${blocker})`}; raw output withheld and mutation evidence is invalid.`,
    );
  }

  const killed = [];
  const invalid = [];
  for (const mutation of A7_SOURCE_CONTROL_MUTATIONS) {
    const target = join(temporaryRoot, mutation.target);
    const original = applyExactlyOnce(target, mutation.search, mutation.replacement);
    try {
      const killedCases = [];
      for (const intendedCase of mutation.intendedCases) {
        const result = runProof(temporaryRoot, intendedCase);
        const output = combinedOutput(result);
        const oneFailingTest = /Tests:\s+1 failed,\s+1 total/.test(output);
        const intendedCaseFailed = output.includes(`${intendedCase} failed`);
        if (result.status === 0 || !oneFailingTest || !intendedCaseFailed) {
          invalid.push({
            mutationId: mutation.id,
            intendedCase,
            exitCode: result.status,
            oneFailingTest,
            intendedCaseFailed,
          });
        } else {
          killedCases.push(intendedCase);
        }
      }
      if (killedCases.length === mutation.intendedCases.length) {
        killed.push({ mutationId: mutation.id, killedCases });
        process.stdout.write(
          `${JSON.stringify({ mutationId: mutation.id, killedCases, result: 'KILLED' })}\n`,
        );
      }
    } finally {
      writeFileSync(target, original, 'utf8');
    }
  }

  if (invalid.length > 0 || killed.length !== A7_SOURCE_CONTROL_MUTATIONS.length) {
    throw new Error(
      `AICO-007 mutants survived or failed outside intended cases: ${JSON.stringify(invalid)}`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      evidenceSchema: 'aico-007-source-control-mutations/v1',
      baselineThreatCases: 39,
      controlMutations: A7_SOURCE_CONTROL_MUTATIONS.length,
      killedMutations: killed.length,
      killedCaseAssertions: killed.reduce((count, result) => count + result.killedCases.length, 0),
      survivingMutations: 0,
      skippedMutations: 0,
      exceptionInjectionMutations: 0,
      isolatedCopy: true,
      exactIntendedCaseFailures: true,
      kills: killed,
    })}\n`,
  );
} finally {
  const cleanupRoot = resolve(temporaryRoot);
  if (
    dirname(cleanupRoot) !== temporaryParent ||
    !basename(cleanupRoot).startsWith('aico007-source-mutations-')
  ) {
    throw new Error(`Refusing unsafe mutation cleanup: ${cleanupRoot}`);
  }
  rmSync(cleanupRoot, { recursive: true, force: true });
}
