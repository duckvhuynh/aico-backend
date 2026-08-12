import { readFileSync } from 'node:fs';
import { run } from './process-utils.mjs';
import { verificationGates } from './verification-gates.mjs';

const probeIndex = process.argv.indexOf('--probe-failure');
if (probeIndex >= 0) {
  const gate = process.argv[probeIndex + 1];
  if (!verificationGates.includes(gate)) throw new Error(`Unknown verification gate: ${gate}`);
  console.error(`Injected verification failure: ${gate}`);
  process.exit(1);
}

const project = `aico-backend-verify-${process.pid}`;
const apiPort = process.env.AICO_VERIFY_API_PORT ?? '13009';
const minioPort = process.env.AICO_VERIFY_MINIO_PORT ?? '19009';
const environment = {
  AICO_VERIFY_PROJECT: project,
  AICO_API_PORT: apiPort,
  AICO_POSTGRES_PORT: process.env.AICO_VERIFY_POSTGRES_PORT ?? '15439',
  AICO_MINIO_PORT: minioPort,
  AICO_MINIO_CONSOLE_PORT: process.env.AICO_VERIFY_MINIO_CONSOLE_PORT ?? '19019',
};
const compose = (...args) =>
  run('docker', ['compose', '-p', project, ...args], { env: environment });
const gate = (name, command, args, options = {}) => {
  console.log(`\n=== ${name} ===`);
  run(command, args, { ...options, env: { ...environment, ...options.env } });
};

try {
  gate('install', 'npm', ['ci']);
  gate('governance', 'node', ['scripts/check-pr-governance.mjs'], {
    env: {
      PR_BODY:
        process.env.PR_BODY?.trim() || readFileSync('test/fixtures/valid-pr-body.md', 'utf8'),
    },
  });
  gate('fail-closed', 'npm', ['run', 'verify:fail-closed']);
  gate('format', 'npm', ['run', 'format:check']);
  gate('lint', 'npm', ['run', 'lint']);
  gate('typecheck', 'npm', ['run', 'typecheck']);
  gate('unit-contract', 'npm', ['test']);
  gate('build', 'npm', ['run', 'build']);
  gate('audit', 'npm', ['audit', '--audit-level=high']);
  gate('compose-config', 'docker', ['compose', '-p', project, 'config', '--quiet']);
  gate('images', 'docker', ['compose', '-p', project, 'build', 'api', 'worker', 'migrate']);
  gate('dependencies', 'docker', [
    'compose',
    '-p',
    project,
    'up',
    '-d',
    '--wait',
    'postgres',
    'minio',
  ]);
  gate('object-init', 'docker', ['compose', '-p', project, 'up', '-d', 'minio-init']);
  gate('object-init-wait', 'docker', ['compose', '-p', project, 'wait', 'minio-init']);
  gate('migrations', 'node', ['scripts/migration-fixture.mjs']);
  gate('storage', 'node', ['scripts/storage-fixture.mjs'], {
    env: {
      OBJECT_STORAGE_ENDPOINT: `http://127.0.0.1:${minioPort}`,
      OBJECT_STORAGE_BUCKET: 'aico-local',
      OBJECT_STORAGE_ACCESS_KEY: 'aico',
      OBJECT_STORAGE_SECRET_KEY: 'local-minio-secret',
    },
  });
  gate('http-smoke-start', 'docker', [
    'compose',
    '-p',
    project,
    'up',
    '-d',
    '--wait',
    'api',
    'worker',
  ]);
  gate('http-smoke', 'npm', ['run', 'test:smoke'], {
    env: { AICO_BASE_URL: `http://127.0.0.1:${apiPort}/api/v1` },
  });
  console.log(`\nCanonical verification passed all ${verificationGates.length} gates.`);
} catch (error) {
  compose('logs', '--no-color', '--tail=200', 'api', 'worker', 'migrate', 'postgres', 'minio');
  throw error;
} finally {
  compose('down', '--volumes', '--remove-orphans');
}
