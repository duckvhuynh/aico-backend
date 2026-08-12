import { run } from './process-utils.mjs';
import { verificationGates } from './verification-gates.mjs';

for (const gate of verificationGates) {
  const result = run('node', ['scripts/verify-ci.mjs', '--probe-failure', gate], {
    capture: true,
    allowFailure: true,
  });
  const output = `${result.stdout}${result.stderr}`;
  if (result.status === 0 || !output.includes(`Injected verification failure: ${gate}`)) {
    throw new Error(`Gate ${gate} did not fail closed under its deterministic probe.`);
  }
}

console.log(`Fail-closed runner contract passed for ${verificationGates.length} gates.`);
