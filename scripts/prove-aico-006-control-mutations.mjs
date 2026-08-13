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
  SOURCE_CONTROL_MUTATIONS,
} = require('../test/aico-006-spike/fail-closed-control-mutations.ts');

const databaseUrl = process.env.AICO_PROOF_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('AICO_PROOF_DATABASE_URL is required for source-level mutations.');
}
const parsedDatabaseUrl = new URL(databaseUrl);
if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
  throw new Error('AICO_PROOF_DATABASE_URL must use postgres:// or postgresql://.');
}

const repositoryRoot = resolve(import.meta.dirname, '..');
const sourceNodeModules = join(repositoryRoot, 'node_modules');
if (!existsSync(sourceNodeModules)) {
  throw new Error('node_modules is required; mutation copies link the existing install.');
}

const tempParent = realpathSync(tmpdir());
const tempRoot = mkdtempSync(join(tempParent, 'aico006-source-mutations-'));
const normalizedTempRoot = resolve(tempRoot);
if (
  dirname(normalizedTempRoot) !== tempParent ||
  !basename(normalizedTempRoot).startsWith('aico006-source-mutations-')
) {
  throw new Error(`Unsafe mutation temp path: ${normalizedTempRoot}`);
}

function shouldCopy(source) {
  const relativePath = relative(repositoryRoot, source);
  if (relativePath === '') return true;
  const firstSegment = relativePath.split(sep)[0];
  return !['.git', 'node_modules', 'dist', 'coverage'].includes(firstSegment);
}

function combinedOutput(result) {
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function schemaName(label) {
  const compact = label
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '')
    .slice(0, 12);
  return `aico006_mut_${process.pid}_${compact}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

function runRealProof(cwd, label) {
  return run(
    'npm',
    [
      'exec',
      '--',
      'jest',
      '--runInBand',
      '--runTestsByPath',
      'test/policy-approval-proof.integration.spec.ts',
    ],
    {
      allowFailure: true,
      capture: true,
      cwd,
      env: {
        AICO_PROOF_DATABASE_URL: databaseUrl,
        AICO_PROOF_SCHEMA: schemaName(label),
        AICO_REQUIRE_POLICY_PROOF: 'true',
        AICO_PROOF_REPOSITORY_SHA: 'UNCOMMITTED',
        AICO_PROOF_DIRTY_DEVELOPMENT: 'true',
      },
    },
  );
}

function applyExactlyOnce(filePath, search, replacement) {
  const original = readFileSync(filePath, 'utf8');
  const normalized = original.replaceAll('\r\n', '\n');
  const matches = normalized.split(search).length - 1;
  if (matches !== 1) {
    throw new Error(`Mutation transform must match exactly once; matched ${matches}: ${filePath}`);
  }
  writeFileSync(filePath, normalized.replace(search, replacement), 'utf8');
  return original;
}

try {
  cpSync(repositoryRoot, tempRoot, {
    recursive: true,
    filter: shouldCopy,
  });
  symlinkSync(sourceNodeModules, join(tempRoot, 'node_modules'), 'junction');

  const baseline = runRealProof(tempRoot, 'baseline');
  const baselineOutput = combinedOutput(baseline);
  if (baseline.status !== 0) {
    process.stderr.write(baselineOutput);
    throw new Error('Unmutated AICO-006 integration proof is red; mutation evidence is invalid.');
  }
  if (!/Tests:\s+1 passed,\s+1 total/.test(baselineOutput)) {
    throw new Error('Unmutated proof selected no test or an unexpected test count.');
  }

  const killed = [];
  const rejected = [];
  for (const mutation of SOURCE_CONTROL_MUTATIONS) {
    const target = join(tempRoot, mutation.target);
    const original = applyExactlyOnce(target, mutation.search, mutation.replacement);
    try {
      const result = runRealProof(tempRoot, mutation.id);
      const output = combinedOutput(result);
      const selectedOneFailingTest = /Tests:\s+1 failed,\s+1 total/.test(output);
      const intendedCaseFailed = output.includes(`${mutation.intendedCase} failed`);
      if (result.status === 0 || !selectedOneFailingTest || !intendedCaseFailed) {
        rejected.push({
          mutation_id: mutation.id,
          intended_case: mutation.intendedCase,
          exit_code: result.status,
          selected_one_failing_test: selectedOneFailingTest,
          intended_case_failed: intendedCaseFailed,
        });
        process.stderr.write(output);
      } else {
        killed.push({ mutation_id: mutation.id, intended_case: mutation.intendedCase });
        console.log(
          JSON.stringify({
            mutation_id: mutation.id,
            intended_case: mutation.intendedCase,
            result: 'KILLED',
          }),
        );
      }
    } finally {
      writeFileSync(target, original, 'utf8');
    }
  }

  if (rejected.length > 0 || killed.length !== SOURCE_CONTROL_MUTATIONS.length) {
    throw new Error(
      `AICO-006 source mutants survived, selected no test, or failed outside their intended case: ${JSON.stringify(
        rejected,
      )}`,
    );
  }

  console.log(
    JSON.stringify({
      evidence_schema: 'aico-006-source-control-mutations/v1',
      baseline_tests: 1,
      control_mutations: SOURCE_CONTROL_MUTATIONS.length,
      killed_mutations: killed.length,
      surviving_or_invalid_mutations: 0,
      exception_failpoints_counted: 0,
      isolated_copy: true,
      disposable_schema_per_run: true,
      kills: killed,
    }),
  );
} finally {
  const checkedTempRoot = resolve(tempRoot);
  if (
    dirname(checkedTempRoot) !== tempParent ||
    !basename(checkedTempRoot).startsWith('aico006-source-mutations-')
  ) {
    throw new Error(`Refusing unsafe mutation cleanup: ${checkedTempRoot}`);
  }
  rmSync(checkedTempRoot, { recursive: true, force: true });
}
