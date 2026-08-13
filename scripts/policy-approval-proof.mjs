import { randomUUID } from 'node:crypto';
import { run } from './process-utils.mjs';

const project = process.env.AICO_VERIFY_PROJECT;
if (!project) throw new Error('AICO_VERIFY_PROJECT is required.');

const status = run('git', ['status', '--porcelain'], { capture: true });
const dirty = status.stdout.trim().length > 0;
if (dirty && process.env.AICO_ALLOW_DIRTY_POLICY_PROOF !== 'true') {
  throw new Error('AICO-006 exact-SHA proof refuses a dirty worktree.');
}
const revision = run('git', ['rev-parse', 'HEAD'], { capture: true }).stdout.trim();

const postgresPort = process.env.AICO_VERIFY_POSTGRES_PORT ?? '15439';
const databaseUrl = `postgresql://aico:aico@127.0.0.1:${postgresPort}/aico`;
const schema = `aico006_${process.pid}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;

run('npm', ['run', 'test:policy-approval-proof'], {
  env: {
    AICO_PROOF_DATABASE_URL: databaseUrl,
    AICO_PROOF_SCHEMA: schema,
    AICO_PROOF_PROJECT: project,
    AICO_REQUIRE_POLICY_PROOF: 'true',
    AICO_PROOF_REPOSITORY_SHA: dirty ? 'UNCOMMITTED' : revision,
    AICO_PROOF_DIRTY_DEVELOPMENT: dirty ? 'true' : 'false',
  },
});

run('node', ['scripts/prove-aico-006-control-mutations.mjs'], {
  env: { AICO_PROOF_DATABASE_URL: databaseUrl },
});
