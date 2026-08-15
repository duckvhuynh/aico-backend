import { execFileSync } from 'node:child_process';

const validator = 'scripts/validate-aico-008-policy.mjs';
const probes = {
  'schema-extra-property': 'schema / must NOT have additional properties',
  'missing-owner': 'owner_roles must NOT have fewer than 1 items',
  'unbounded-value': 'differs from policy version 1.0.0',
  'unknown-configuration-key': 'configuration registry differs from the closed expected set',
  'duplicate-id': 'policy entry IDs must be globally unique',
  'unknown-reason-code': 'references unknown reason code GOAL_UNREVIEWED',
  'screen-limit-weakened': 'alpha.v1.goal.routes.max differs from policy version 1.0.0',
  'unsafe-media-allowed':
    'alpha.v1.attachment.media_types.allowed differs from policy version 1.0.0',
  'security-check-advisory': 'alpha.v1.qa.checks.advisory differs from policy version 1.0.0',
  'rework-limit-weakened': 'automatic QA rework must remain capped at two cycles',
  'capacity-factor-mismatch':
    'must equal alpha.v1.capacity.active_runs_global.max multiplied by the safety factor',
  'run-cost-unbounded':
    'alpha.v1.model.cost_micros_usd.per_run_max differs from policy version 1.0.0',
  'external-provider-enabled': 'external providers must remain disabled in the R0 policy',
  'accepted-without-evidence': 'accepted mode requires acceptance.candidate_sha',
  'missing-downstream-owner': 'downstream owner registry differs from the closed expected set',
};

execFileSync(process.execPath, [validator], { stdio: 'pipe' });

for (const [probe, expectedFailure] of Object.entries(probes)) {
  let failed = false;
  try {
    execFileSync(process.execPath, [validator, '--probe-failure', probe], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    failed = true;
    const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
    if (!output.includes(expectedFailure)) {
      throw new Error(
        `AICO-008 probe ${probe} failed for an unexpected reason. Expected output containing: ${expectedFailure}\n${output}`,
      );
    }
  }
  if (!failed) throw new Error(`AICO-008 fail-closed probe unexpectedly passed: ${probe}`);
}

console.log(
  `AICO-008 policy fail-closed proof: ${Object.keys(probes).length}/${Object.keys(probes).length} deliberate invalid policies rejected.`,
);
