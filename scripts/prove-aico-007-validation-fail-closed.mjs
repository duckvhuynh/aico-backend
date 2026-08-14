import { run } from './process-utils.mjs';

const probes = {
  'adr-status': 'status must be Proposed for AICO-007 owner acceptance',
  'origin-isolation': 'is missing required content: control-plane-isolated origin',
  'control-api-deny': 'is missing required content: private control APIs',
  'signed-access': 'is missing required content: signed access',
  'successful-build': 'is missing required content: successful immutable',
  'cache-partition': 'is missing required content: cache partition',
  'cleanup-unknown': 'is missing required content: ambiguous external outcomes',
  'threat-registry': 'is missing stable threat case: A7-T-ACCESS-BINDING-01',
  'aeo-cardinality': 'is missing required content: low-cardinality',
  'schema-closed': 'must set additionalProperties=false',
  'schema-access-kind': 'is missing required schema term: previewAccessGrant',
  'schema-browser-header': 'browser protected header keys must be exactly typ, alg, kid',
  'schema-browser-claims': 'browser claim keys must match the exact minimal allowlist',
  'generated-csp-exact': 'must contain exact generated CSP',
  'bootstrap-csp-exact': 'must contain exact bootstrap CSP',
  'bootstrap-script-exact': 'must contain the exact bootstrap script bytes',
  'permissions-policy-exact': 'must contain exact Permissions-Policy',
  'hsts-exact': 'must contain exact HSTS',
  'response-profile-mapping': 'is missing exact response-profile mapping',
  'trace-owner': 'is missing required content: AICO-057',
};

for (const [probe, expected] of Object.entries(probes)) {
  const result = run(
    'node',
    ['scripts/validate-aico-007-architecture.mjs', '--probe-failure', probe],
    { capture: true, allowFailure: true },
  );
  const output = `${result.stdout}${result.stderr}`;
  if (result.status === 0 || !output.includes(expected)) {
    throw new Error(`AICO-007 validator probe ${probe} did not fail closed as expected.`);
  }
}

console.log(`AICO-007 validator failed closed for ${Object.keys(probes).length} mutations.`);
