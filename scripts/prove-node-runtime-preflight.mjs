import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readNodeRuntimeContract, runtimeContractProblems } from './node-runtime-contract.mjs';

const contract = readNodeRuntimeContract();
const expectedNodeVersion = contract.expectedNodeVersion;
const expectedNpmVersion = contract.expectedNpmVersion;
const npmBootstrap = `npm install --global npm@${expectedNpmVersion} --ignore-scripts --no-audit --no-fund`;
const problems = (value, node = expectedNodeVersion, npm = expectedNpmVersion) =>
  runtimeContractProblems(value, node, npm);

assert.deepEqual(
  problems(contract),
  [],
  'the checked-in runtime contract must be internally consistent',
);

const nodeRuntimeMutation = problems(contract, '0.0.0');
assert.equal(nodeRuntimeMutation.length, 1);
assert.match(nodeRuntimeMutation[0], /^Unsupported Node\.js runtime 0\.0\.0\./u);

const npmRuntimeMutation = problems(contract, expectedNodeVersion, '0.0.0');
assert.equal(npmRuntimeMutation.length, 1);
assert.match(npmRuntimeMutation[0], /^Unsupported npm runtime 0\.0\.0\./u);

for (const path of Object.keys(contract.nodeVersionFiles)) {
  const mutated = structuredClone(contract);
  mutated.nodeVersionFiles[path] = '0.0.0';
  assert(
    problems(mutated).some((problem) => problem.startsWith(path)),
    `${path} mismatch must fail closed`,
  );
}

for (const path of Object.keys(contract.npmVersionFiles)) {
  const mutated = structuredClone(contract);
  mutated.npmVersionFiles[path] = 'npm@0.0.0';
  assert(
    problems(mutated).some((problem) => problem.startsWith(path)),
    `${path} mismatch must fail closed`,
  );
}

for (const mutation of [
  { name: 'npm engine-strict', apply: (value) => (value.npmrc = 'engine-strict=false\n') },
  {
    name: 'omitted Docker runtime base stage',
    apply: (value) => {
      value.dockerfile = value.dockerfile.replace(
        /^FROM\s+node:[^\r\n]+\s+AS\s+runtime\s*$/imu,
        'FROM dependencies AS runtime',
      );
    },
  },
  {
    name: 'Docker base image version drift',
    apply: (value) => {
      value.dockerfile = value.dockerfile.replaceAll(expectedNodeVersion, '0.0.0');
    },
  },
  {
    name: 'unaliased extra Docker Node base',
    apply: (value) => {
      value.dockerfile += `\nFROM node:${expectedNodeVersion}-alpine\n`;
    },
  },
  {
    name: 'Docker npm bootstrap after npm ci',
    apply: (value) => {
      value.dockerfile = value.dockerfile.replace(npmBootstrap, `npm ci\nRUN ${npmBootstrap}`);
    },
  },
  {
    name: 'workflow setup-node pin',
    apply: (value) => {
      const workflow = Object.keys(value.workflows).find((name) =>
        value.workflows[name].includes(`node-version: ${expectedNodeVersion}`),
      );
      assert(workflow, 'at least one workflow must carry the supported Node pin');
      value.workflows[workflow] = value.workflows[workflow].replace(
        `node-version: ${expectedNodeVersion}`,
        'node-version: 0.0.0',
      );
    },
  },
  {
    name: 'workflow setup-node missing pin',
    apply: (value) => {
      const workflow = Object.keys(value.workflows).find((name) =>
        value.workflows[name].includes(`node-version: ${expectedNodeVersion}`),
      );
      assert(workflow, 'at least one workflow must carry the supported Node pin');
      value.workflows[workflow] = value.workflows[workflow].replace(
        /^\s*node-version:.*\r?\n/mu,
        '',
      );
    },
  },
  {
    name: 'workflow npm command before exact bootstrap',
    apply: (value) => {
      const workflow = Object.keys(value.workflows).find((name) =>
        value.workflows[name].includes(npmBootstrap),
      );
      assert(workflow, 'at least one workflow must carry the exact npm bootstrap');
      value.workflows[workflow] = value.workflows[workflow].replace(
        npmBootstrap,
        `npm --version\n          ${npmBootstrap}`,
      );
    },
  },
  {
    name: 'Node-using workflow without setup-node',
    apply: (value) => {
      value.workflows['unpinned-node.yml'] =
        'jobs:\n  verify:\n    steps:\n      - run: npm test\n';
    },
  },
]) {
  const mutated = structuredClone(contract);
  mutation.apply(mutated);
  assert(problems(mutated).length > 0, `${mutation.name} mismatch must fail closed`);
}

const twoJobMutation = structuredClone(contract);
twoJobMutation.workflows['mixed-job-pinning.yml'] = `jobs:
  valid:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v7
        with:
          node-version: ${expectedNodeVersion}
      - run: ${npmBootstrap}
      - run: npm test
  unpinned:
    runs-on: ubuntu-latest
    steps:
      - run: echo '{}' | node script.mjs
`;
assert(
  problems(twoJobMutation).some(
    (problem) => problem.includes('job unpinned') && problem.includes('without actions/setup-node'),
  ),
  'a valid job must not mask a second Node-using job without setup-node',
);

const entrySource = readFileSync(new URL('./verify-ci-entry.mjs', import.meta.url), 'utf8');
const entryTokens = [
  'assertSupportedNodeRuntime();',
  "await import('./prove-node-runtime-preflight.mjs');",
  "await import('./verify-ci.mjs');",
];
let previousOffset = -1;
for (const token of entryTokens) {
  const offset = entrySource.indexOf(token);
  assert(offset > previousOffset, `verify-ci entrypoint wiring/order must contain ${token}`);
  previousOffset = offset;
}

console.log(
  'Runtime preflight proof passed: Node/npm baseline, mismatch controls, Docker/workflow completeness, and canonical entry order checked.',
);
