import { execFileSync } from 'node:child_process';

const commands = [
  ['scripts/validate-aico-008-policy.mjs'],
  ['scripts/prove-aico-008-policy-fail-closed.mjs'],
];

for (const args of commands) {
  execFileSync(process.execPath, args, { stdio: 'inherit' });
}
