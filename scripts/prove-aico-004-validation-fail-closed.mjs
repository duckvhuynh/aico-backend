import { run } from './process-utils.mjs';

const probes = {
  'adr-status': 'ADR-009 status must be',
  'template-digest': 'baseImagePlatformDigest must be sha256:<hex>',
  'dependency-integrity': 'requires sha512 integrity',
  'workspace-boundary': 'is missing required content: workspace-root confinement',
  'command-allowlist': 'is missing required content: command IDs only',
  'network-deny': 'is missing required content: network-none',
  'credential-deny': 'is missing required content: credential-free',
  termination: 'is missing required content: entire process tree',
  'output-integrity': 'is missing required content: output integrity',
  'gate-binding': 'is missing required content: exact GATE-02',
  'threat-registry': 'must define at least 22 unique stable A4-T-* threat cases',
  'redaction-cardinality': 'is missing required content: low-cardinality',
};

for (const [probe, expected] of Object.entries(probes)) {
  const result = run(
    'node',
    ['scripts/validate-aico-004-architecture.mjs', '--probe-failure', probe],
    { capture: true, allowFailure: true },
  );
  const output = `${result.stdout}${result.stderr}`;
  if (result.status === 0 || !output.includes(expected)) {
    throw new Error(`AICO-004 validator probe ${probe} did not fail closed as expected.`);
  }
}

console.log(`AICO-004 validator failed closed for ${Object.keys(probes).length} mutations.`);
