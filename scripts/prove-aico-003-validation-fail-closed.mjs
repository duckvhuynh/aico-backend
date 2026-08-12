import { run } from './process-utils.mjs';

const probes = {
  'adr-status': 'ADR-007 status must be',
  boundary: 'is missing boundary: relational rows',
  'threat-ids': 'must define at least 12 unique stable A3-T-* threat cases',
  'evidence-id': 'is missing evidence ID: A3-VERIFY-01',
  'aeo-gate': 'is missing AEO gate: A3-AEO-12',
  ownership: 'is missing required content: AICO-082 owns tenant/redaction and signed-access tests',
};

for (const [probe, expected] of Object.entries(probes)) {
  const result = run(
    'node',
    ['scripts/validate-aico-003-architecture.mjs', '--probe-failure', probe],
    { capture: true, allowFailure: true },
  );
  const output = `${result.stdout}${result.stderr}`;
  if (result.status === 0 || !output.includes(expected)) {
    throw new Error(`AICO-003 validator probe ${probe} did not fail closed as expected.`);
  }
}

console.log(`AICO-003 validator failed closed for ${Object.keys(probes).length} mutations.`);
