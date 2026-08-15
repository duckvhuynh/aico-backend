import { readFileSync } from 'node:fs';
import { run } from './process-utils.mjs';
import {
  createVerificationGateCommands,
  resolveArchitectureVerificationScript,
  verificationGates,
} from './verification-gates.mjs';

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
const gateCommands = createVerificationGateCommands({
  apiPort,
  architectureVerificationScript: resolveArchitectureVerificationScript(),
  minioPort,
  prBody: process.env.PR_BODY?.trim() || readFileSync('test/fixtures/valid-pr-body.md', 'utf8'),
  project,
});
const compose = (...args) =>
  run('docker', ['compose', '-p', project, ...args], { env: environment });
const gate = (name, command, args, options = {}) => {
  console.log(`\n=== ${name} ===`);
  run(command, args, { ...options, env: { ...environment, ...options.env } });
};

try {
  for (const spec of gateCommands) {
    for (const setup of spec.before) {
      gate(setup.name, setup.command, setup.args, { env: setup.env });
    }
    gate(spec.name, spec.command, spec.args, { env: spec.env });
  }
  console.log(`\nCanonical verification passed all ${verificationGates.length} gates.`);
} catch (error) {
  compose('logs', '--no-color', '--tail=200', 'api', 'worker', 'migrate', 'postgres', 'minio');
  throw error;
} finally {
  compose('down', '--volumes', '--remove-orphans');
}
