import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const paths = {
  schema: 'docs/contracts/schemas/alpha-operating-policy.v1.schema.json',
  policy: 'docs/policies/alpha-operating-policy-v1.json',
  decision: 'docs/policies/alpha-operating-policy-v1.md',
  evidence: 'docs/delivery/AICO_008_EVIDENCE.md',
};

const schema = JSON.parse(readFileSync(paths.schema, 'utf8'));
const originalPolicy = JSON.parse(readFileSync(paths.policy, 'utf8'));
const decision = readFileSync(paths.decision, 'utf8');
const evidence = readFileSync(paths.evidence, 'utf8');
const policy = structuredClone(originalPolicy);
const errors = [];
const requireAccepted = process.argv.includes('--require-accepted');
const probeIndex = process.argv.indexOf('--probe-failure');
const probe = probeIndex >= 0 ? process.argv[probeIndex + 1] : undefined;

const expectedKeys = {
  qualification: [
    'alpha.v1.goal.categories.allowed',
    'alpha.v1.goal.primary_personas.max',
    'alpha.v1.goal.primary_flows.max',
    'alpha.v1.goal.routes.max',
    'alpha.v1.goal.output.platform',
    'alpha.v1.goal.template.key',
    'alpha.v1.goal.runtime.client_only',
    'alpha.v1.goal.data.mode',
    'alpha.v1.goal.capabilities.denied',
    'alpha.v1.goal.clarification_questions.max',
  ],
  attachments: [
    'alpha.v1.attachment.media_types.allowed',
    'alpha.v1.attachment.count.max',
    'alpha.v1.attachment.bytes.per_file_max',
    'alpha.v1.attachment.bytes.aggregate_max',
    'alpha.v1.attachment.pdf.pages.max',
    'alpha.v1.attachment.image.pixels.max',
    'alpha.v1.attachment.validation.required',
    'alpha.v1.attachment.classes.denied',
  ],
  qa: [
    'alpha.v1.qa.checks.blocking',
    'alpha.v1.qa.checks.advisory',
    'alpha.v1.qa.regression.required',
    'alpha.v1.qa.viewport_widths.required',
    'alpha.v1.qa.accessibility.blocking_severities',
  ],
  budgets: [
    'alpha.v1.model.input_tokens.per_invocation_max',
    'alpha.v1.model.output_tokens.per_invocation_max',
    'alpha.v1.model.input_tokens.per_run_max',
    'alpha.v1.model.output_tokens.per_run_max',
    'alpha.v1.model.cost_micros_usd.per_invocation_max',
    'alpha.v1.model.cost_micros_usd.per_run_max',
    'alpha.v1.model.wall_seconds.per_invocation_max',
    'alpha.v1.model.invocations.per_run_max',
    'alpha.v1.model.external_provider.enabled',
    'alpha.v1.run.active_wall_seconds.max',
    'alpha.v1.sandbox.command_wall_seconds.max',
    'alpha.v1.sandbox.wall_seconds.per_run_max',
    'alpha.v1.sandbox.cpu_cores.max',
    'alpha.v1.sandbox.cpu_seconds.per_run_max',
    'alpha.v1.sandbox.memory_bytes.max',
    'alpha.v1.sandbox.processes.max',
    'alpha.v1.sandbox.writable_bytes.max',
    'alpha.v1.sandbox.files.max',
    'alpha.v1.source.file_bytes.max',
    'alpha.v1.source.snapshot_bytes.max',
    'alpha.v1.build.output_bytes.max',
    'alpha.v1.command.output_bytes.max',
    'alpha.v1.logs.retained_bytes.per_run_max',
    'alpha.v1.storage.bytes.per_run_max',
    'alpha.v1.retry.transient_per_attempt.max',
    'alpha.v1.repair.schema_per_invocation.max',
    'alpha.v1.task.attempts.max',
    'alpha.v1.provider.sdk_retries.max',
    'alpha.v1.command.retries.max',
    'alpha.v1.unknown_outcome.auto_replays.max',
    'alpha.v1.qa.automatic_rework_cycles.max',
  ],
  capacity: [
    'alpha.v1.capacity.alpha_founders.max',
    'alpha.v1.capacity.active_runs_per_company.max',
    'alpha.v1.capacity.active_runs_global.max',
    'alpha.v1.capacity.active_builds_global.max',
    'alpha.v1.capacity.active_model_invocations_global.max',
    'alpha.v1.capacity.test_safety_factor',
    'alpha.v1.capacity.test_active_runs.target',
    'alpha.v1.capacity.test_active_builds.target',
    'alpha.v1.capacity.test_model_invocations.target',
  ],
};

const expectedValues = {
  'alpha.v1.goal.categories.allowed': [
    'crud_workspace',
    'dashboard_reporting',
    'intake_onboarding',
    'catalog_directory',
    'planning_scheduling',
    'content_library',
  ],
  'alpha.v1.goal.primary_personas.max': 1,
  'alpha.v1.goal.primary_flows.max': 1,
  'alpha.v1.goal.routes.max': 5,
  'alpha.v1.goal.output.platform': 'responsive_browser',
  'alpha.v1.goal.template.key': 'react_typescript_template_v1',
  'alpha.v1.goal.runtime.client_only': true,
  'alpha.v1.goal.data.mode': 'mock_local_only',
  'alpha.v1.goal.capabilities.denied': [
    'production_deployment',
    'generated_backend',
    'production_database',
    'real_authentication',
    'real_payment',
    'email_delivery',
    'third_party_business_api',
    'sensitive_data',
    'native_mobile',
    'native_desktop',
    'browser_extension',
    'multi_user_collaboration',
    'multiple_primary_flows',
    'multiple_concurrent_initiatives',
    'custom_employees',
    'arbitrary_shell',
    'unrestricted_network',
    'external_business_action',
  ],
  'alpha.v1.goal.clarification_questions.max': 5,
  'alpha.v1.attachment.media_types.allowed': [
    'text/plain',
    'text/markdown',
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
  ],
  'alpha.v1.attachment.count.max': 5,
  'alpha.v1.attachment.bytes.per_file_max': {
    'text/plain': 262144,
    'text/markdown': 262144,
    'application/pdf': 10485760,
    'image/png': 5242880,
    'image/jpeg': 5242880,
    'image/webp': 5242880,
  },
  'alpha.v1.attachment.bytes.aggregate_max': 20971520,
  'alpha.v1.attachment.pdf.pages.max': 50,
  'alpha.v1.attachment.image.pixels.max': 20000000,
  'alpha.v1.attachment.validation.required': [
    'declared_type_allowlisted',
    'detected_type_allowlisted',
    'declared_matches_detected',
    'byte_limit',
    'sha256_verified',
    'malware_scan_clean',
    'active_content_absent',
    'parser_limits_enforced',
    'tenant_scope_verified',
  ],
  'alpha.v1.attachment.classes.denied': [
    'archive',
    'svg',
    'html',
    'office_document',
    'executable',
    'script',
    'encrypted_pdf',
    'password_protected',
    'polyglot',
    'embedded_file',
    'active_content',
    'unknown_type',
  ],
  'alpha.v1.qa.checks.blocking': [
    'approved_criterion_fail_or_blocked',
    'missing_or_dangling_criterion_evidence',
    'format_failure',
    'lint_failure',
    'typecheck_failure',
    'unit_or_route_test_failure',
    'production_build_failure',
    'scope_or_screen_mapping_violation',
    'secret_or_sensitive_content_detected',
    'tenant_policy_sandbox_or_egress_violation',
    'broken_primary_flow_or_navigation',
    'critical_or_serious_accessibility_violation',
    'required_check_not_executed',
  ],
  'alpha.v1.qa.checks.advisory': [
    'minor_or_moderate_accessibility_finding',
    'non_blocking_visual_polish',
    'copy_consistency',
    'performance_budget_warning',
    'maintainability_observation',
  ],
  'alpha.v1.qa.regression.required': [
    'format',
    'lint',
    'typecheck',
    'unit_and_route_tests',
    'production_build',
    'all_previously_passed_blocking_checks',
    'affected_criteria_screens_and_states',
    'primary_flow_navigation',
    'responsive_viewports',
    'critical_and_serious_accessibility',
    'secret_scope_egress_and_prototype_labeling',
  ],
  'alpha.v1.qa.viewport_widths.required': [360, 1440],
  'alpha.v1.qa.accessibility.blocking_severities': ['critical', 'serious'],
  'alpha.v1.model.input_tokens.per_invocation_max': 32768,
  'alpha.v1.model.output_tokens.per_invocation_max': 8192,
  'alpha.v1.model.input_tokens.per_run_max': 300000,
  'alpha.v1.model.output_tokens.per_run_max': 60000,
  'alpha.v1.model.cost_micros_usd.per_invocation_max': 2500000,
  'alpha.v1.model.cost_micros_usd.per_run_max': 15000000,
  'alpha.v1.model.wall_seconds.per_invocation_max': 120,
  'alpha.v1.model.invocations.per_run_max': 24,
  'alpha.v1.model.external_provider.enabled': false,
  'alpha.v1.run.active_wall_seconds.max': 5400,
  'alpha.v1.sandbox.command_wall_seconds.max': 300,
  'alpha.v1.sandbox.wall_seconds.per_run_max': 1800,
  'alpha.v1.sandbox.cpu_cores.max': 2,
  'alpha.v1.sandbox.cpu_seconds.per_run_max': 2400,
  'alpha.v1.sandbox.memory_bytes.max': 2147483648,
  'alpha.v1.sandbox.processes.max': 128,
  'alpha.v1.sandbox.writable_bytes.max': 536870912,
  'alpha.v1.sandbox.files.max': 5000,
  'alpha.v1.source.file_bytes.max': 1048576,
  'alpha.v1.source.snapshot_bytes.max': 26214400,
  'alpha.v1.build.output_bytes.max': 104857600,
  'alpha.v1.command.output_bytes.max': 1048576,
  'alpha.v1.logs.retained_bytes.per_run_max': 10485760,
  'alpha.v1.storage.bytes.per_run_max': 268435456,
  'alpha.v1.retry.transient_per_attempt.max': 1,
  'alpha.v1.repair.schema_per_invocation.max': 1,
  'alpha.v1.task.attempts.max': 3,
  'alpha.v1.provider.sdk_retries.max': 0,
  'alpha.v1.command.retries.max': 0,
  'alpha.v1.unknown_outcome.auto_replays.max': 0,
  'alpha.v1.qa.automatic_rework_cycles.max': 2,
  'alpha.v1.capacity.alpha_founders.max': 5,
  'alpha.v1.capacity.active_runs_per_company.max': 1,
  'alpha.v1.capacity.active_runs_global.max': 2,
  'alpha.v1.capacity.active_builds_global.max': 1,
  'alpha.v1.capacity.active_model_invocations_global.max': 2,
  'alpha.v1.capacity.test_safety_factor': 2,
  'alpha.v1.capacity.test_active_runs.target': 4,
  'alpha.v1.capacity.test_active_builds.target': 2,
  'alpha.v1.capacity.test_model_invocations.target': 4,
};

const expectedReasonCodes = [
  'GOAL_CATEGORY_UNSUPPORTED',
  'GOAL_TOO_MANY_PERSONAS',
  'GOAL_TOO_MANY_FLOWS',
  'GOAL_TOO_MANY_SCREENS',
  'GOAL_PLATFORM_UNSUPPORTED',
  'GOAL_TEMPLATE_UNAVAILABLE',
  'GOAL_REQUIRES_BACKEND',
  'GOAL_REQUIRES_REAL_DATA',
  'GOAL_CAPABILITY_UNSUPPORTED',
  'GOAL_NEEDS_CLARIFICATION',
  'ATTACHMENT_TYPE_UNSUPPORTED',
  'ATTACHMENT_COUNT_EXCEEDED',
  'ATTACHMENT_TOO_LARGE',
  'ATTACHMENT_TOTAL_EXCEEDED',
  'ATTACHMENT_PDF_TOO_LONG',
  'ATTACHMENT_IMAGE_TOO_LARGE',
  'ATTACHMENT_VALIDATION_FAILED',
  'ATTACHMENT_UNSAFE',
  'QA_BLOCKING_CHECK_FAILED',
  'QA_ADVISORY_FINDING',
  'QA_REGRESSION_REQUIRED',
  'QA_VIEWPORT_CHECK_FAILED',
  'QA_ACCESSIBILITY_BLOCKED',
  'MODEL_BUDGET_EXHAUSTED',
  'RUN_BUDGET_EXHAUSTED',
  'RUN_TIME_EXHAUSTED',
  'SANDBOX_LIMIT_EXCEEDED',
  'RETRY_LIMIT_EXHAUSTED',
  'REWORK_LIMIT_EXHAUSTED',
  'CAPACITY_UNAVAILABLE',
  'ALPHA_COHORT_FULL',
  'PROVIDER_DISABLED',
];

const expectedDownstream = [
  'AICO-017',
  'AICO-019',
  'AICO-033',
  'AICO-047',
  'AICO-051',
  'AICO-060',
  'AICO-064',
  'AICO-072',
  'AICO-080',
  'AICO-082',
  'AICO-086',
  'AICO-091',
];

const findEntry = (configurationKey) =>
  Object.values(policy)
    .filter((section) => section && Array.isArray(section.entries))
    .flatMap((section) => section.entries)
    .find((entry) => entry.configuration_key === configurationKey);

const probes = {
  'schema-extra-property': () => {
    policy.unreviewed_default = true;
  },
  'missing-owner': () => {
    findEntry('alpha.v1.goal.routes.max').owner_roles = [];
  },
  'unbounded-value': () => {
    findEntry('alpha.v1.sandbox.memory_bytes.max').value = 'unlimited';
  },
  'unknown-configuration-key': () => {
    findEntry('alpha.v1.goal.routes.max').configuration_key = 'alpha.v1.goal.routes.unreviewed';
  },
  'duplicate-id': () => {
    policy.capacity.entries[0].id = policy.qualification.entries[0].id;
  },
  'unknown-reason-code': () => {
    findEntry('alpha.v1.goal.routes.max').reason_code = 'GOAL_UNREVIEWED';
  },
  'screen-limit-weakened': () => {
    findEntry('alpha.v1.goal.routes.max').value = 6;
  },
  'unsafe-media-allowed': () => {
    findEntry('alpha.v1.attachment.media_types.allowed').value.push('image/svg+xml');
  },
  'security-check-advisory': () => {
    findEntry('alpha.v1.qa.checks.advisory').value.push(
      'tenant_policy_sandbox_or_egress_violation',
    );
  },
  'rework-limit-weakened': () => {
    findEntry('alpha.v1.qa.automatic_rework_cycles.max').value = 3;
  },
  'capacity-factor-mismatch': () => {
    findEntry('alpha.v1.capacity.test_active_runs.target').value = 3;
  },
  'run-cost-unbounded': () => {
    findEntry('alpha.v1.model.cost_micros_usd.per_run_max').value = 'unlimited';
  },
  'external-provider-enabled': () => {
    findEntry('alpha.v1.model.external_provider.enabled').value = true;
  },
  'accepted-without-evidence': () => {
    policy.status = 'ACCEPTED';
    policy.acceptance.decision = 'ACCEPTED';
    policy.acceptance.candidate_sha = null;
  },
  'missing-downstream-owner': () => {
    policy.downstream_owners = policy.downstream_owners.filter((id) => id !== 'AICO-082');
  },
};

if (probe !== undefined) {
  if (!probes[probe]) throw new Error(`Unknown AICO-008 policy failure probe: ${probe}`);
  probes[probe]();
}

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validate = ajv.compile(schema);
if (!validate(policy)) {
  for (const issue of validate.errors ?? []) {
    errors.push(`schema ${issue.instancePath || '/'} ${issue.message}`);
  }
}

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const equalSet = (actual, expected) =>
  actual.length === expected.length &&
  [...actual].sort().every((value, index) => value === [...expected].sort()[index]);

const allEntries = Object.entries(expectedKeys).flatMap(
  ([sectionName]) => policy[sectionName]?.entries ?? [],
);
const entryIds = allEntries.map((entry) => entry.id);
const configurationKeys = allEntries.map((entry) => entry.configuration_key);

if (new Set(entryIds).size !== entryIds.length)
  errors.push('policy entry IDs must be globally unique');
if (new Set(configurationKeys).size !== configurationKeys.length) {
  errors.push('policy configuration keys must be globally unique');
}

for (const [sectionName, expected] of Object.entries(expectedKeys)) {
  const actual = (policy[sectionName]?.entries ?? []).map((entry) => entry.configuration_key);
  if (!equalSet(actual, expected)) {
    errors.push(`${sectionName} configuration registry differs from the closed expected set`);
  }
}

if (!equalSet(configurationKeys, Object.keys(expectedValues))) {
  errors.push('global configuration registry differs from the closed expected set');
}

for (const [configurationKey, expectedValue] of Object.entries(expectedValues)) {
  const entry = findEntry(configurationKey);
  if (!entry) {
    errors.push(`missing required configuration ${configurationKey}`);
    continue;
  }
  if (canonical(entry.value) !== canonical(expectedValue)) {
    errors.push(`${configurationKey} differs from policy version 1.0.0`);
  }
  if (!Array.isArray(entry.owner_roles) || entry.owner_roles.length === 0) {
    errors.push(`${configurationKey} has no accountable owner role`);
  }
  if (entry.review_by !== policy.review_by) {
    errors.push(`${configurationKey} review date must equal the policy review date`);
  }
}

const actualReasonCodes = policy.reason_codes.map((reason) => reason.code);
if (new Set(actualReasonCodes).size !== actualReasonCodes.length) {
  errors.push('reason codes must be unique');
}
if (!equalSet(actualReasonCodes, expectedReasonCodes)) {
  errors.push('reason-code registry differs from the closed expected set');
}
const referencedReasonCodes = [...new Set(allEntries.map((entry) => entry.reason_code))];
for (const code of referencedReasonCodes) {
  if (!actualReasonCodes.includes(code))
    errors.push(`policy entry references unknown reason code ${code}`);
}
for (const code of actualReasonCodes) {
  if (!referencedReasonCodes.includes(code))
    errors.push(`reason code ${code} is not used by a policy value`);
}

if (!equalSet(policy.downstream_owners, expectedDownstream)) {
  errors.push('downstream owner registry differs from the closed expected set');
}

const value = (key) => findEntry(key)?.value;
if (
  value('alpha.v1.model.input_tokens.per_invocation_max') >
  value('alpha.v1.model.input_tokens.per_run_max')
) {
  errors.push('per-invocation input tokens exceed the per-run input budget');
}
if (
  value('alpha.v1.model.output_tokens.per_invocation_max') >
  value('alpha.v1.model.output_tokens.per_run_max')
) {
  errors.push('per-invocation output tokens exceed the per-run output budget');
}
if (
  value('alpha.v1.model.cost_micros_usd.per_invocation_max') >
  value('alpha.v1.model.cost_micros_usd.per_run_max')
) {
  errors.push('per-invocation model cost exceeds the per-run cost budget');
}
if (
  value('alpha.v1.sandbox.wall_seconds.per_run_max') > value('alpha.v1.run.active_wall_seconds.max')
) {
  errors.push('sandbox wall budget exceeds the run active-wall budget');
}
const reservedStorage =
  value('alpha.v1.attachment.bytes.aggregate_max') +
  value('alpha.v1.source.snapshot_bytes.max') +
  value('alpha.v1.build.output_bytes.max') +
  value('alpha.v1.logs.retained_bytes.per_run_max');
if (reservedStorage > value('alpha.v1.storage.bytes.per_run_max')) {
  errors.push('attachment/source/build/log ceilings exceed total run storage');
}
if (value('alpha.v1.task.attempts.max') < value('alpha.v1.retry.transient_per_attempt.max') + 2) {
  errors.push('task attempt cap cannot represent initial, retry, and bounded replacement work');
}
if (value('alpha.v1.provider.sdk_retries.max') !== 0)
  errors.push('provider SDK retries must remain zero');
if (value('alpha.v1.command.retries.max') !== 0)
  errors.push('automatic command retries must remain zero');
if (value('alpha.v1.unknown_outcome.auto_replays.max') !== 0) {
  errors.push('unknown outcomes must never be automatically replayed');
}
if (value('alpha.v1.qa.automatic_rework_cycles.max') !== 2) {
  errors.push('automatic QA rework must remain capped at two cycles');
}
if (value('alpha.v1.model.external_provider.enabled') !== false) {
  errors.push('external providers must remain disabled in the R0 policy');
}
const factor = value('alpha.v1.capacity.test_safety_factor');
for (const [liveKey, testKey] of [
  ['alpha.v1.capacity.active_runs_global.max', 'alpha.v1.capacity.test_active_runs.target'],
  ['alpha.v1.capacity.active_builds_global.max', 'alpha.v1.capacity.test_active_builds.target'],
  [
    'alpha.v1.capacity.active_model_invocations_global.max',
    'alpha.v1.capacity.test_model_invocations.target',
  ],
]) {
  if (value(testKey) !== value(liveKey) * factor) {
    errors.push(`${testKey} must equal ${liveKey} multiplied by the safety factor`);
  }
}

const allAcceptanceFieldsNull = [
  policy.acceptance.candidate_sha,
  policy.acceptance.hosted_run_url,
  policy.acceptance.accepted_by,
  policy.acceptance.accepted_at,
  policy.acceptance.evidence_url,
].every((field) => field === null);
if (policy.status === 'CANDIDATE') {
  if (policy.acceptance.decision !== 'PENDING' || !allAcceptanceFieldsNull) {
    errors.push('Candidate policy must keep the owner decision Pending and evidence fields null');
  }
}
if (policy.status === 'ACCEPTED' || requireAccepted) {
  if (policy.status !== 'ACCEPTED' || policy.acceptance.decision !== 'ACCEPTED') {
    errors.push('accepted mode requires ACCEPTED policy and owner decision states');
  }
  for (const field of [
    'candidate_sha',
    'hosted_run_url',
    'accepted_by',
    'accepted_at',
    'evidence_url',
  ]) {
    if (!policy.acceptance[field]) errors.push(`accepted mode requires acceptance.${field}`);
  }
}

for (const requiredText of [
  'A8-QUAL-01',
  'A8-ATTACH-01',
  'A8-QA-01',
  'A8-BUDGET-01',
  'A8-CAPACITY-01',
  'A8-META-01',
  'A8-STOP-01',
  'A8-VALIDATE-01',
  'A8-ACCEPT-01',
  'Candidate for AICO-008 owner acceptance',
  'deterministic fixture remains the only enabled R0 model target',
  'agent-authored text',
  'Disputed IDs:** None',
]) {
  if (!decision.toLowerCase().includes(requiredText.toLowerCase())) {
    errors.push(`${paths.decision} is missing required content: ${requiredText}`);
  }
}
for (const requiredText of [
  'A8-QUAL-01',
  'A8-ATTACH-01',
  'A8-QA-01',
  'A8-BUDGET-01',
  'A8-CAPACITY-01',
  'A8-META-01',
  'A8-STOP-01',
  'A8-VALIDATE-01',
  'A8-ACCEPT-01',
  'owner acceptance Pending',
  'passing structural and fail-closed validation',
]) {
  if (!evidence.toLowerCase().includes(requiredText.toLowerCase())) {
    errors.push(`${paths.evidence} is missing required content: ${requiredText}`);
  }
}

if (errors.length > 0) {
  console.error(`AICO-008 alpha policy validation failed (${errors.length} issue(s)):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `AICO-008 alpha policy ${policy.policy_version} ${policy.status}: ${allEntries.length} values, ${actualReasonCodes.length} reason codes, ${policy.downstream_owners.length} downstream owners.`,
);
