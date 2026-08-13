import { run } from './process-utils.mjs';

const status = run('git', ['status', '--porcelain'], { capture: true });
const dirty = status.stdout.trim().length > 0;
if (dirty && process.env.AICO_ALLOW_DIRTY_SANDBOX_PROOF !== 'true') {
  throw new Error('AICO-004 exact-SHA proof refuses a dirty worktree.');
}
const revision = run('git', ['rev-parse', 'HEAD'], { capture: true }).stdout.trim();

run(
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
    env: {
      AICO_REQUIRE_SANDBOX_PROOF: 'true',
      AICO_SANDBOX_PROOF_REPOSITORY_SHA: dirty ? 'UNCOMMITTED' : revision,
      AICO_SANDBOX_PROOF_DIRTY_DEVELOPMENT: dirty ? 'true' : 'false',
    },
  },
);

run('node', ['scripts/prove-aico-004-control-mutations.mjs']);

process.stdout.write(
  `${JSON.stringify({
    evidenceSchema: 'aico-004-canonical-proof/v1',
    repositorySha: dirty ? 'UNCOMMITTED' : revision,
    dirtyDevelopmentEvidence: dirty,
    threatCases: 22,
    sourceControlMutations: 12,
    runtimeClass: 'DEVELOPMENT_ONLY_RUNC',
    paidExternalServices: 0,
  })}\n`,
);
