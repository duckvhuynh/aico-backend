import { run } from './process-utils.mjs';

const probes = {
  'adr-status': 'ADR-008 status must be',
  'policy-input': 'is missing required content: actor/employee version',
  'parameter-bound': 'is missing required content: parameter-bound',
  'atomic-transaction': 'is missing required content: atomic',
  'threat-ids': 'must define at least 30 unique stable A6-T-* threat cases',
  'denial-audit': 'must preserve one SRS-FR-087 PolicyDecision/denial event-outbox',
  'evidence-id': 'is missing evidence ID: A6-VERIFY-01',
  'aeo-gate': 'is missing AEO gate: A6-AEO-12',
  'model-authority':
    'is missing required content: model response, a transcript, green CI on another SHA, or an unreviewed demo is not acceptance or authority',
  'downstream-ownership': 'is missing required content: AICO-031',
};

for (const [probe, expected] of Object.entries(probes)) {
  const result = run(
    'node',
    ['scripts/validate-aico-006-architecture.mjs', '--probe-failure', probe],
    { capture: true, allowFailure: true },
  );
  const output = `${result.stdout}${result.stderr}`;
  if (result.status === 0 || !output.includes(expected)) {
    throw new Error(`AICO-006 validator probe ${probe} did not fail closed as expected.`);
  }
}

console.log(`AICO-006 validator failed closed for ${Object.keys(probes).length} mutations.`);
