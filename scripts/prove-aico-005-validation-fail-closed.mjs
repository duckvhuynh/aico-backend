import { run } from './process-utils.mjs';

const probes = {
  'adr-status': 'status must be Proposed for AICO-005 owner acceptance or Accepted for AICO-005',
  'deterministic-only': 'is missing required literal: DETERMINISTIC_FIXTURE',
  'external-disabled': 'is missing required literal: CONDITIONAL_DISABLED',
  'training-prohibited': 'is missing required content: training use prohibited',
  'sdk-retries': 'is missing required content: provider SDK retries are disabled',
  'worker-sleep': 'is missing required content: no worker sleeps',
  'silent-fallback': 'is missing required content: no automatic cross-provider fallback',
  'unknown-outcome': 'is missing required content: post-dispatch timeout is UNKNOWN',
  'repair-bound': 'is missing required content: repair cap is 1',
  'repair-reservation': 'is missing required content: separate invocation and reservation',
  'zero-authority': 'is missing required content: zero state, artifact, or tool authority',
  'schema-closed': 'must set additionalProperties=false',
  'schema-result-state': 'result status enum must be exactly',
  'schema-failure-class': 'failure classification enum must be exactly',
  'schema-r0-guard': 'R0 execution guard provider_key must be exactly DETERMINISTIC_FIXTURE',
  'schema-r0-guard-binding':
    'R0 execution guard binding invariant configuration_matches_version_binding must be true',
  'schema-r0-content-classification':
    'R0 invocation content classification must be exactly SYNTHETIC',
  'schema-r0-content-redaction': 'R0 dispatch content redaction must be exactly PASS, REDACTED',
  'schema-unavailable': 'provenance must represent UNAVAILABLE honestly',
  'schema-dispatch-uncertain': 'dispatch phase must be exactly closed and uncertainty-preserving',
  'schema-redaction-drop': 'redaction outcome must be exactly PASS, REDACTED, DROPPED',
  'schema-reference-kind': 'version binding workflow must use exact workflowRef',
  'schema-success-safety': 'must reject SUCCEEDED with blocked safety',
  'schema-success-finish': 'successful finish reason must be exactly closed and non-terminal',
  'schema-success-provider': 'successful resolved provider must be exactly DETERMINISTIC_FIXTURE',
  'schema-repair-receipt': 'repair receipt must require a PASS disjointness invariant',
  'schema-terminal-no-retry': 'must reject TERMINAL_PROVIDER with a persisted retry schedule',
  'schema-integrity-reconciliation': 'must reject INTEGRITY without quarantine reconciliation',
  'schema-canceled-reconciliation': 'must reject post-dispatch CANCELED without reconciliation',
  'schema-evidence-coherence': 'must reject PASS evidence with an unauthorized tool effect',
  'schema-timestamp-bound': 'RFC 3339 timestamps must remain bounded to 35 characters',
  'acceptance-pending': [
    'Proposed owner evidence and semantic SHA must remain Pending',
    'Accepted-mode evidence must be wholly Pending or reconciled',
    'Accepted-mode hosted SHA must equal Accepted metadata SHA',
  ],
  'disputed-ids': 'Disputed IDs header must be exactly None',
  'product-trace-sha': 'must bind the reviewed Product trace SHA',
  'evidence-trace': 'is missing acceptance mapping: A5-TRACE-01',
  'aeo-cardinality': 'is missing required content: low-cardinality',
  'aeo-authority': 'is missing required content: Telemetry is not authority.',
};

for (const [probe, expected] of Object.entries(probes)) {
  const result = run(
    'node',
    ['scripts/validate-aico-005-architecture.mjs', '--probe-failure', probe],
    { capture: true, allowFailure: true },
  );
  const output = `${result.stdout}${result.stderr}`;
  const expectations = Array.isArray(expected) ? expected : [expected];
  if (result.status === 0 || !expectations.some((value) => output.includes(value))) {
    throw new Error(`AICO-005 validator probe ${probe} did not fail closed as expected.`);
  }
}

console.log(`AICO-005 validator failed closed for ${Object.keys(probes).length} mutations.`);
