import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  createVerificationGateCommands,
  resolveArchitectureVerificationScript,
  verificationGates,
} from './verification-gates.mjs';

const root = process.cwd();
const timeoutMs = 30_000;
const results = [];

function execute(command, args, options = {}) {
  const windowsNpm = process.platform === 'win32' && command === 'npm';
  const executable = windowsNpm ? (process.env.ComSpec ?? 'cmd.exe') : command;
  const commandArgs = windowsNpm ? ['/d', '/s', '/c', 'npm', ...args] : args;
  return spawnSync(executable, commandArgs, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 2 * 1024 * 1024,
    timeout: options.timeout ?? timeoutMs,
    windowsHide: true,
  });
}

function expectFailure(gate, command, args, options = {}) {
  if (!(options.expected instanceof RegExp)) {
    throw new Error(`${gate} fault probe is missing its intended-failure fingerprint.`);
  }
  const result = execute(command, args, options);
  if (result.error) {
    throw new Error(`${gate} fault probe could not execute: ${result.error.message}`);
  }
  if (result.status === 0) {
    throw new Error(`${gate} fault unexpectedly succeeded.`);
  }
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (!options.expected.test(output)) {
    if (process.env.AICO_GATE_PROOF_DEBUG === 'true') {
      process.stderr.write(`${gate} unmatched output:\n${output.slice(0, 2_000)}\n`);
    }
    throw new Error(`${gate} failed for an unexpected reason; bounded output withheld.`);
  }
  results.push(gate);
}

if (process.argv.includes('--self-test-unexpected-success')) {
  expectFailure('fail-closed', 'node', ['-e', 'process.exit(0)'], {
    expected: /this pattern cannot match an empty successful process/u,
  });
  process.exit(0);
}

const project = `aico-009-gate-proof-${process.pid}`;
const dirtySentinel = resolve(root, `.aico-009-fault-${process.pid}`);
const architectureFaultFile = resolve(root, 'docs', 'contracts', 'TENANT_DATA_BOUNDARIES.md');
const formatFaultFile = resolve(root, 'scripts', `aico-009-format-fault-${process.pid}.mjs`);
const lintFaultFile = resolve(root, 'test', `aico-009-lint-fault-${process.pid}.ts`);
const typecheckFaultFile = resolve(root, 'src', `aico-009-typecheck-fault-${process.pid}.ts`);
const unitFaultFile = resolve(root, 'test', `aico-009-unit-fault-${process.pid}.spec.ts`);
const buildFaultFile = resolve(root, 'src', `aico-009-build-fault-${process.pid}.ts`);
let workspace;
let minimalCompose;
let architectureOriginal;
let architectureFaultActive = false;

function write(relativePath, contents) {
  if (!workspace) throw new Error('AICO-009 fault-proof workspace is not initialized.');
  const path = join(workspace, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return path;
}

const gateCommands = createVerificationGateCommands({
  apiPort: '13009',
  architectureVerificationScript: resolveArchitectureVerificationScript(),
  minioPort: '19009',
  prBody: readFileSync('test/fixtures/valid-pr-body.md', 'utf8'),
  project,
});
if (
  verificationGates.length !== 22 ||
  new Set(verificationGates).size !== verificationGates.length ||
  gateCommands.map(({ name }) => name).join('\n') !== verificationGates.join('\n')
) {
  throw new Error('The AICO-009 command specs must match exactly 22 unique logical gates.');
}
const gateCommandByName = new Map(gateCommands.map((spec) => [spec.name, spec]));

function expectGateFailure(name, fault) {
  const spec = gateCommandByName.get(name);
  if (!spec) throw new Error(`Missing canonical command spec for ${name}.`);
  expectFailure(name, spec.command, [...spec.args, ...(fault.selfTestArgs ?? [])], {
    cwd: fault.cwd,
    env: { ...spec.env, ...fault.env },
    expected: fault.expected,
    timeout: fault.timeout,
  });
}

let primaryError;
let successMessage;
try {
  workspace = mkdtempSync(join(tmpdir(), 'aico-009-gate-proof-'));
  const installDirectory = join(workspace, 'install');
  write(
    'install/package.json',
    JSON.stringify({
      name: 'aico-009-install-fault',
      version: '1.0.0',
      dependencies: { 'aico-local-dependency': 'file:../local-dependency' },
    }),
  );
  write(
    'local-dependency/package.json',
    JSON.stringify({ name: 'aico-local-dependency', version: '1.0.0' }),
  );
  write(
    'install/package-lock.json',
    JSON.stringify({
      name: 'aico-009-install-fault',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: { '': { name: 'aico-009-install-fault', version: '1.0.0' } },
    }),
  );
  const invalidCompose = write(
    'invalid-compose.yaml',
    'services:\n  api:\n    image: scratch\n    unknown_aico_key: true\n',
  );
  minimalCompose = write('minimal-compose.yaml', 'services:\n  placeholder:\n    image: scratch\n');

  expectGateFailure('install', {
    cwd: installDirectory,
    expected: /(?:EUSAGE|Missing:\s+aico-local-dependency@1\.0\.0|package-lock\.json.*in sync)/isu,
  });
  expectGateFailure('governance', {
    env: { PR_BODY: 'deliberately incomplete' },
    expected: /Missing delivery traceability/u,
  });
  architectureOriginal = readFileSync(architectureFaultFile, 'utf8');
  const architectureFault = architectureOriginal.replace(/relational rows/iu, 'removed boundary');
  if (architectureFault === architectureOriginal) {
    throw new Error('Could not inject the AICO-009 architecture boundary fault.');
  }
  writeFileSync(architectureFaultFile, architectureFault);
  architectureFaultActive = true;
  expectGateFailure('architecture', {
    expected: /missing boundary:\s*relational rows/iu,
  });
  writeFileSync(architectureFaultFile, architectureOriginal);
  architectureFaultActive = false;
  expectGateFailure('provider-decision-evidence', {
    env: { AICO_PROVIDER_DECISION_EXPECTED_SHA: '0000000000000000000000000000000000000000' },
    expected: /AICO-005 decision evidence must bind the exact 40-hex HEAD SHA/u,
  });
  expectGateFailure('fail-closed', {
    selfTestArgs: ['--', '--self-test-unexpected-success'],
    expected: /unexpectedly succeeded/u,
  });
  writeFileSync(formatFaultFile, 'export const badlyFormatted={value:1}\n');
  expectGateFailure('format', {
    expected: /(?:Code style issues found|forgotten to run Prettier)/iu,
  });
  rmSync(formatFaultFile, { force: true });

  writeFileSync(
    lintFaultFile,
    'export function aico009LintFault(value: any): any { return value; }\n',
  );
  expectGateFailure('lint', {
    expected: /(?:Unexpected any|no-explicit-any)/iu,
  });
  rmSync(lintFaultFile, { force: true });

  writeFileSync(typecheckFaultFile, 'export const aico009TypecheckFault: string = 42;\n');
  expectGateFailure('typecheck', {
    expected: /(?:TS2322|Type 'number' is not assignable to type 'string')/u,
  });
  rmSync(typecheckFaultFile, { force: true });

  writeFileSync(
    unitFaultFile,
    "describe('AICO-009 deliberate unit fault', () => { it('must fail', () => expect(1).toBe(2)); });\n",
  );
  expectGateFailure('unit-contract', {
    expected: /AICO-009 deliberate unit fault/u,
    timeout: 90_000,
  });
  rmSync(unitFaultFile, { force: true });

  writeFileSync(buildFaultFile, 'export const aico009BuildFault: string = 42;\n');
  expectGateFailure('build', {
    expected: /(?:TS2322|Type 'number' is not assignable to type 'string')/u,
  });
  rmSync(buildFaultFile, { force: true });
  expectGateFailure('audit', {
    cwd: workspace,
    expected: /(?:ENOLOCK|requires an existing lockfile|loadVirtual)/iu,
  });
  expectGateFailure('compose-config', {
    env: { COMPOSE_FILE: invalidCompose },
    expected: /(?:unknown_aico_key.*not allowed|Additional property unknown_aico_key)/isu,
  });
  expectGateFailure('images', {
    env: { DOCKER_HOST: 'tcp://127.0.0.1:1' },
    expected:
      /(?:127\.0\.0\.1:1|Cannot connect to the Docker daemon|connection refused|connectex)/iu,
  });

  writeFileSync(dirtySentinel, 'bounded dirty-worktree fault\n');
  expectGateFailure('sandbox-proof', {
    expected: /refuses a dirty worktree/u,
  });
  expectGateFailure('preview-proof', {
    expected: /refuses a dirty worktree/u,
  });
  rmSync(dirtySentinel, { force: true });

  expectGateFailure('dependencies', {
    env: { DOCKER_HOST: 'tcp://127.0.0.1:1' },
    expected:
      /(?:127\.0\.0\.1:1|Cannot connect to the Docker daemon|connection refused|connectex)/iu,
  });
  expectGateFailure('object-init', {
    env: { DOCKER_HOST: 'tcp://127.0.0.1:1' },
    expected:
      /(?:127\.0\.0\.1:1|Cannot connect to the Docker daemon|connection refused|connectex)/iu,
  });
  expectGateFailure('migrations', {
    env: { AICO_VERIFY_PROJECT: '' },
    expected: /AICO_VERIFY_PROJECT is required/u,
  });
  expectGateFailure('policy-approval-proof', {
    env: { AICO_VERIFY_PROJECT: '' },
    expected: /AICO_VERIFY_PROJECT is required/u,
  });
  expectGateFailure('storage', {
    env: { OBJECT_STORAGE_ENDPOINT: 'not-a-valid-url' },
    expected: /(?:Invalid URL|Endpoint URL.*https?|not-a-valid-url)/iu,
  });
  expectGateFailure('workflow-resilience', {
    env: { AICO_VERIFY_PROJECT: '', AICO_BASE_URL: '' },
    expected: /AICO_VERIFY_PROJECT is required/u,
  });
  expectGateFailure('http-smoke', {
    env: { AICO_BASE_URL: 'not-a-valid-url' },
    expected: /(?:Invalid URL|Failed to parse URL|not-a-valid-url)/iu,
  });

  if (results.join('\n') !== verificationGates.join('\n')) {
    throw new Error('Fault-proof execution order diverged from the canonical gate manifest.');
  }
  successMessage = `Fail-closed runner contract passed ${results.length} bounded command-level fault injections.`;
} catch (error) {
  primaryError = error instanceof Error ? error : new Error(String(error));
} finally {
  const cleanupErrors = [];
  function captureCleanup(label, operation) {
    try {
      operation();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      cleanupErrors.push(new Error(`${label}: ${detail}`, { cause: error }));
    }
  }

  function requireCleanupCommand(label, args) {
    const result = execute('docker', args, { timeout: 10_000 });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, 500);
      throw new Error(`${label} exited ${result.status ?? 1}${output ? `: ${output}` : ''}`);
    }
    return result;
  }

  captureCleanup('remove dirty-worktree sentinel', () => rmSync(dirtySentinel, { force: true }));
  captureCleanup('restore architecture fixture', () => {
    if (architectureFaultActive && architectureOriginal !== undefined) {
      writeFileSync(architectureFaultFile, architectureOriginal);
      architectureFaultActive = false;
    }
  });
  captureCleanup('remove format-fault source', () => rmSync(formatFaultFile, { force: true }));
  captureCleanup('remove lint-fault source', () => rmSync(lintFaultFile, { force: true }));
  captureCleanup('remove typecheck-fault source', () =>
    rmSync(typecheckFaultFile, { force: true }),
  );
  captureCleanup('remove unit-fault source', () => rmSync(unitFaultFile, { force: true }));
  captureCleanup('remove build-fault source', () => rmSync(buildFaultFile, { force: true }));

  if (minimalCompose) {
    captureCleanup('Compose down', () =>
      requireCleanupCommand('docker compose down', [
        'compose',
        '-f',
        minimalCompose,
        '-p',
        project,
        'down',
        '--volumes',
        '--remove-orphans',
      ]),
    );
    captureCleanup('Compose zero-residue verification', () => {
      const result = requireCleanupCommand('docker compose ps', [
        'compose',
        '-f',
        minimalCompose,
        '-p',
        project,
        'ps',
        '--all',
        '--quiet',
      ]);
      if ((result.stdout ?? '').trim()) {
        throw new Error('the disposable Compose project still has resources');
      }
    });
    for (const [resource, command] of [
      [
        'containers',
        ['ps', '--all', '--filter', `label=com.docker.compose.project=${project}`, '--quiet'],
      ],
      [
        'volumes',
        ['volume', 'ls', '--filter', `label=com.docker.compose.project=${project}`, '--quiet'],
      ],
      [
        'networks',
        ['network', 'ls', '--filter', `label=com.docker.compose.project=${project}`, '--quiet'],
      ],
    ]) {
      captureCleanup(`verify zero ${resource}`, () => {
        const result = requireCleanupCommand(`docker ${command[0]}`, command);
        if ((result.stdout ?? '').trim()) {
          throw new Error(`the disposable Compose project still has ${resource}`);
        }
      });
    }
  }

  captureCleanup('remove temporary workspace', () => {
    if (workspace) rmSync(workspace, { force: true, recursive: true });
  });
  captureCleanup('verify filesystem cleanup', () => {
    const residue = [
      dirtySentinel,
      formatFaultFile,
      lintFaultFile,
      typecheckFaultFile,
      unitFaultFile,
      buildFaultFile,
      workspace,
    ]
      .filter((path) => path && existsSync(path))
      .join(', ');
    if (residue) throw new Error(`proof residue remains: ${residue}`);
    if (
      architectureOriginal !== undefined &&
      readFileSync(architectureFaultFile, 'utf8') !== architectureOriginal
    ) {
      throw new Error('architecture fixture was not restored byte-for-byte');
    }
  });

  if (cleanupErrors.length > 0) {
    const errors = primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors;
    throw new AggregateError(errors, 'AICO-009 proof cleanup was not verified.', {
      cause: primaryError,
    });
  }
}
if (primaryError) throw primaryError;
console.log(successMessage);
