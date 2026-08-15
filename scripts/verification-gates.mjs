import { readFileSync } from 'node:fs';

export const verificationGates = Object.freeze([
  'install',
  'governance',
  'architecture',
  'provider-decision-evidence',
  'fail-closed',
  'format',
  'lint',
  'typecheck',
  'unit-contract',
  'build',
  'audit',
  'compose-config',
  'images',
  'sandbox-proof',
  'preview-proof',
  'dependencies',
  'object-init',
  'migrations',
  'policy-approval-proof',
  'storage',
  'workflow-resilience',
  'http-smoke',
]);

export function resolveArchitectureVerificationScript() {
  const decisions = [
    ['docs/architecture/010-preview-isolation-selection.md', 'AICO-007'],
    ['docs/architecture/011-model-provider-employee-runtime-selection.md', 'AICO-005'],
  ];
  const accepted = decisions.every(([path, issue]) =>
    new RegExp(`^-?\\s*\\*\\*Status:\\*\\* Accepted for ${issue}\\b`, 'm').test(
      readFileSync(path, 'utf8'),
    ),
  );
  return accepted ? 'verify:architecture:accepted' : 'verify:architecture';
}

export function createVerificationGateCommands({
  apiPort,
  architectureVerificationScript,
  minioPort,
  prBody,
  project,
}) {
  if (
    !['verify:architecture', 'verify:architecture:accepted'].includes(
      architectureVerificationScript,
    )
  ) {
    throw new Error('Unknown architecture verification wrapper.');
  }
  for (const [name, value] of Object.entries({ apiPort, minioPort, prBody, project })) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Verification command context ${name} is required.`);
    }
  }

  const commands = [
    { name: 'install', command: 'npm', args: ['ci'] },
    {
      name: 'governance',
      command: 'node',
      args: ['scripts/check-pr-governance.mjs'],
      env: { PR_BODY: prBody },
    },
    {
      name: 'architecture',
      command: 'npm',
      args: ['run', architectureVerificationScript],
    },
    {
      name: 'provider-decision-evidence',
      command: 'npm',
      args: ['run', 'prove:provider-decision'],
    },
    { name: 'fail-closed', command: 'npm', args: ['run', 'verify:fail-closed'] },
    { name: 'format', command: 'npm', args: ['run', 'format:check'] },
    { name: 'lint', command: 'npm', args: ['run', 'lint'] },
    { name: 'typecheck', command: 'npm', args: ['run', 'typecheck'] },
    { name: 'unit-contract', command: 'npm', args: ['test'] },
    { name: 'build', command: 'npm', args: ['run', 'build'] },
    { name: 'audit', command: 'npm', args: ['audit', '--audit-level=high'] },
    {
      name: 'compose-config',
      command: 'docker',
      args: ['compose', '-p', project, 'config', '--quiet'],
    },
    {
      name: 'images',
      command: 'docker',
      args: ['compose', '-p', project, 'build', 'api', 'worker', 'migrate'],
    },
    { name: 'sandbox-proof', command: 'npm', args: ['run', 'prove:sandbox'] },
    { name: 'preview-proof', command: 'npm', args: ['run', 'prove:preview'] },
    {
      name: 'dependencies',
      command: 'docker',
      args: ['compose', '-p', project, 'up', '-d', '--wait', 'postgres', 'minio'],
    },
    {
      name: 'object-init',
      command: 'docker',
      args: [
        'compose',
        '-p',
        project,
        'up',
        '--no-deps',
        '--abort-on-container-exit',
        '--exit-code-from',
        'minio-init',
        'minio-init',
      ],
    },
    { name: 'migrations', command: 'node', args: ['scripts/migration-fixture.mjs'] },
    {
      name: 'policy-approval-proof',
      command: 'node',
      args: ['scripts/policy-approval-proof.mjs'],
    },
    {
      name: 'storage',
      command: 'node',
      args: ['scripts/storage-fixture.mjs'],
      env: {
        OBJECT_STORAGE_ENDPOINT: `http://127.0.0.1:${minioPort}`,
        OBJECT_STORAGE_BUCKET: 'aico-local',
        OBJECT_STORAGE_ACCESS_KEY: 'aico',
        OBJECT_STORAGE_SECRET_KEY: 'local-minio-secret',
      },
    },
    {
      name: 'workflow-resilience',
      command: 'node',
      args: ['scripts/workflow-resilience-fixture.mjs'],
      env: { AICO_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1` },
      before: [
        {
          name: 'workflow-resilience-start',
          command: 'docker',
          args: ['compose', '-p', project, 'up', '-d', '--wait', 'api'],
        },
      ],
    },
    {
      name: 'http-smoke',
      command: 'npm',
      args: ['run', 'test:smoke'],
      env: { AICO_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1` },
      before: [
        {
          name: 'http-smoke-start',
          command: 'docker',
          args: ['compose', '-p', project, 'up', '-d', '--wait', 'api', 'worker'],
        },
      ],
    },
  ];

  if (commands.map(({ name }) => name).join('\n') !== verificationGates.join('\n')) {
    throw new Error('Verification command factory diverges from the logical gate manifest.');
  }
  return Object.freeze(
    commands.map((spec) =>
      Object.freeze({
        ...spec,
        args: Object.freeze([...spec.args]),
        before: Object.freeze(
          (spec.before ?? []).map((setup) =>
            Object.freeze({
              ...setup,
              args: Object.freeze([...setup.args]),
              env: Object.freeze({ ...(setup.env ?? {}) }),
            }),
          ),
        ),
        env: Object.freeze({ ...(spec.env ?? {}) }),
      }),
    ),
  );
}
