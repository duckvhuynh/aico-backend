import { randomUUID } from 'node:crypto';
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
  A4_SOURCE_CONTROL_MUTATIONS,
} = require('../test/aico-004-spike/fail-closed-control-mutations.ts');

const repositoryRoot = resolve(import.meta.dirname, '..');
const sourceNodeModules = join(repositoryRoot, 'node_modules');
if (!existsSync(sourceNodeModules)) throw new Error('node_modules is required.');

const temporaryParent = realpathSync(tmpdir());
const temporaryRoot = mkdtempSync(join(temporaryParent, 'aico004-source-mutations-'));
const checkedRoot = resolve(temporaryRoot);
if (
  dirname(checkedRoot) !== temporaryParent ||
  !basename(checkedRoot).startsWith('aico004-source-mutations-')
) {
  throw new Error(`Unsafe mutation root: ${checkedRoot}`);
}

function shouldCopy(source) {
  const relativePath = relative(repositoryRoot, source);
  if (relativePath === '') return true;
  const segments = relativePath.split(sep);
  return !segments.some((segment) =>
    ['.git', 'node_modules', 'dist', 'coverage'].includes(segment),
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
      'test/sandbox-proof.integration.spec.ts',
    ],
    {
      allowFailure: true,
      capture: true,
      cwd,
      env: {
        AICO_REQUIRE_SANDBOX_PROOF: 'true',
        ...(onlyCase === undefined ? {} : { AICO004_ONLY_CASE: onlyCase }),
        AICO004_MUTATION_RUN: randomUUID(),
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
    process.stderr.write(baselineOutput);
    throw new Error('Unmutated AICO-004 Docker proof is red; mutation evidence is invalid.');
  }

  const killed = [];
  const invalid = [];
  for (const mutation of A4_SOURCE_CONTROL_MUTATIONS) {
    const target = join(temporaryRoot, mutation.target);
    const original = applyExactlyOnce(target, mutation.search, mutation.replacement);
    try {
      const result = runProof(temporaryRoot, mutation.intendedCase);
      const output = combinedOutput(result);
      const oneFailedTest = /Tests:\s+1 failed,\s+1 total/.test(output);
      const intendedCaseFailed = output.includes(`${mutation.intendedCase} failed`);
      if (result.status === 0 || !oneFailedTest || !intendedCaseFailed) {
        invalid.push({
          mutationId: mutation.id,
          intendedCase: mutation.intendedCase,
          exitCode: result.status,
          oneFailedTest,
          intendedCaseFailed,
        });
        process.stderr.write(output);
      } else {
        killed.push({ mutationId: mutation.id, intendedCase: mutation.intendedCase });
        process.stdout.write(
          `${JSON.stringify({ mutationId: mutation.id, intendedCase: mutation.intendedCase, result: 'KILLED' })}\n`,
        );
      }
    } finally {
      writeFileSync(target, original, 'utf8');
    }
  }

  if (invalid.length > 0 || killed.length !== A4_SOURCE_CONTROL_MUTATIONS.length) {
    throw new Error(
      `AICO-004 mutants survived or failed outside their intended case: ${JSON.stringify(invalid)}`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      evidenceSchema: 'aico-004-source-control-mutations/v1',
      baselineThreatCases: 22,
      controlMutations: A4_SOURCE_CONTROL_MUTATIONS.length,
      killedMutations: killed.length,
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
    !basename(cleanupRoot).startsWith('aico004-source-mutations-')
  ) {
    throw new Error(`Refusing unsafe mutation cleanup: ${cleanupRoot}`);
  }
  rmSync(cleanupRoot, { recursive: true, force: true });
}
