import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const paths = {
  adr: 'docs/architecture/011-model-provider-employee-runtime-selection.md',
  contract: 'docs/contracts/MODEL_PROVIDER_RUNTIME.md',
  schema: 'docs/contracts/schemas/model-provider-runtime.v1.schema.json',
  evidence: 'docs/delivery/AICO_005_PROVIDER_EVIDENCE.md',
  productTrace: 'docs/delivery/AICO_005_PRODUCT_TRACE.json',
  aeo: 'docs/delivery/AICO_005_AEO_AUDIT.md',
};

const documents = Object.fromEntries(
  Object.entries(paths).map(([name, path]) => [name, readFileSync(path, 'utf8')]),
);
const requireAccepted = process.argv.includes('--require-accepted');
const requireReconciled = process.argv.includes('--require-reconciled');
const probeIndex = process.argv.indexOf('--probe-failure');
const probe = probeIndex >= 0 ? process.argv[probeIndex + 1] : undefined;
const errors = [];
const expectedProductTraceSha = '28d2bc0ecd9e5676a4e87f1bf5e81c602a1a0714';
const expectedProductTrace = {
  schema_version: 'aico.product-trace/1.0',
  repository: 'duckvhuynh/aicompanyos',
  commit_sha: expectedProductTraceSha,
  reviewed_at: '2026-08-15',
  files: [
    {
      path: 'docs/product/MVP_SCOPE.md',
      git_blob_sha: '9bb0e19a2fae53f67caae9834823534805cffe2f',
    },
    {
      path: 'docs/product/PRD.md',
      git_blob_sha: '11931cf515c8b7aaab530a34c56ad22462a74aab',
    },
    {
      path: 'docs/product/SRS.md',
      git_blob_sha: '5049f48593845fdf2b227f279c30df93a9e1e6ad',
    },
  ],
};

const normalize = (value) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const replacements = {
  'adr-status': [
    'adr',
    /(?:Proposed for AICO-005 owner acceptance|Accepted for AICO-005)/g,
    'REMOVED',
  ],
  'deterministic-only': ['adr', /deterministic(?:_|[ -])fixture/gi, 'removed provider'],
  'external-disabled': ['adr', /conditional(?:_|-|\s)+disabled/gi, 'conditionally active'],
  'training-prohibited': [
    'adr',
    /training use prohibited; no opt-in training or consent surface in MVP/gi,
    'training may be enabled in MVP',
  ],
  'sdk-retries': ['contract', /provider SDK retries are disabled/gi, 'SDK retries are enabled'],
  'worker-sleep': ['contract', /no worker sleeps/gi, 'workers may sleep'],
  'silent-fallback': [
    'contract',
    /no automatic cross-provider fallback/gi,
    'automatic cross-provider fallback is permitted',
  ],
  'unknown-outcome': [
    'contract',
    /post-dispatch timeout is UNKNOWN/gi,
    'post-dispatch timeout is FAILED',
  ],
  'repair-bound': ['contract', /repair cap is 1/gi, 'repair cap is unbounded'],
  'repair-reservation': [
    'contract',
    /separate invocation and reservation/gi,
    'same invocation and reservation',
  ],
  'zero-authority': [
    'contract',
    /zero state, artifact, or tool authority/gi,
    'may mutate state, artifacts, or tools',
  ],
  'schema-closed': ['schema', /"additionalProperties": false/, '"additionalProperties": true'],
  'schema-result-state': ['schema', /"UNKNOWN"/g, '"REMOVED_UNKNOWN"'],
  'schema-failure-class': [
    'schema',
    /"POST_DISPATCH_TIMEOUT_UNKNOWN"/g,
    '"POST_DISPATCH_TIMEOUT_FAILED"',
  ],
  'schema-r0-guard': [
    'schema',
    /"provider_key": \{\s*"const": "DETERMINISTIC_FIXTURE"\s*\}/,
    '"provider_key": { "const": "OPENAI_RESPONSES_DIRECT" }',
  ],
  'schema-r0-guard-binding': [
    'schema',
    /"configuration_matches_version_binding": \{ "const": true \}/,
    '"configuration_matches_version_binding": { "type": "boolean" }',
  ],
  'schema-r0-content-classification': [
    'schema',
    /"r0ContentClassification": \{ "const": "SYNTHETIC" \}/,
    '"r0ContentClassification": { "enum": ["SYNTHETIC", "INTERNAL"] }',
  ],
  'schema-r0-content-redaction': [
    'schema',
    /("r0DispatchableRedactionReceipt": \{[\s\S]*?"outcome": \{ )"enum": \["PASS", "REDACTED"\]/,
    '$1"enum": ["PASS", "REDACTED", "DROPPED"]',
  ],
  'schema-unavailable': ['schema', /"UNAVAILABLE"/g, '"REMOVED_UNAVAILABLE"'],
  'schema-dispatch-uncertain': ['schema', /"UNCERTAIN"/g, '"REMOVED_UNCERTAIN"'],
  'schema-redaction-drop': ['schema', /"DROPPED"/g, '"REMOVED_DROPPED"'],
  'schema-reference-kind': [
    'schema',
    /"workflow": \{\s*"\$ref": "#\/\$defs\/workflowRef"\s*\}/,
    '"workflow": { "$ref": "#/$defs/versionRef" }',
  ],
  'schema-success-safety': [
    'schema',
    /("r0SuccessfulSafety": \{[\s\S]*?"outcome": \{ )"enum": \["PASS", "REDACTED"\]/,
    '$1"enum": ["PASS", "REDACTED", "BLOCKED"]',
  ],
  'schema-success-finish': [
    'schema',
    /"successfulFinishReason": \{\s*"enum": \["COMPLETED", "LENGTH", "TOOL_PROPOSAL"\]\s*\}/,
    '"successfulFinishReason": { "enum": ["COMPLETED", "LENGTH", "TOOL_PROPOSAL", "ERROR"] }',
  ],
  'schema-success-provider': [
    'schema',
    /("r0SuccessfulResolvedProviderFacts": \{[\s\S]*?"provider_key": \{ )"const": "DETERMINISTIC_FIXTURE"/,
    '$1"enum": ["DETERMINISTIC_FIXTURE", "OPENAI_RESPONSES_DIRECT"]',
  ],
  'schema-repair-receipt': [
    'schema',
    /"original_and_repair_reservations_disjoint": \{ "const": true \}/,
    '"original_and_repair_reservations_disjoint": { "type": "boolean" }',
  ],
  'schema-terminal-no-retry': [
    'schema',
    /("classification": \{ "enum": \["REFUSAL_SAFETY", "TERMINAL_PROVIDER"\] \}[\s\S]*?)"retry_guidance": \{ "const": "NO_RETRY" \},\s*"retryable": \{ "const": false \}/,
    '$1"retry_guidance": { "enum": ["NO_RETRY", "PERSISTED_RETRY_SCHEDULE"] }, "retryable": { "type": "boolean" }',
  ],
  'schema-integrity-reconciliation': [
    'schema',
    /("classification": \{ "const": "INTEGRITY" \}[\s\S]*?)"reconciliation_required": \{ "const": true \},\s*"reconciliation_action": \{ "const": "QUARANTINE_AND_OWNER_DECISION" \}/,
    '$1"reconciliation_required": { "type": "boolean" }, "reconciliation_action": { "enum": ["NONE", "QUARANTINE_AND_OWNER_DECISION"] }',
  ],
  'schema-canceled-reconciliation': [
    'schema',
    /("classification": \{ "const": "CANCELED" \}[\s\S]*?"dispatch_phase": \{ "enum": \["DISPATCHED", "UNCERTAIN"\] \}[\s\S]*?)"reconciliation_required": \{ "const": true \},\s*"reconciliation_action": \{ "const": "CANCEL_OR_LOOKUP" \}/,
    '$1"reconciliation_required": { "type": "boolean" }, "reconciliation_action": { "enum": ["NONE", "CANCEL_OR_LOOKUP"] }',
  ],
  'schema-evidence-coherence': [
    'schema',
    /"unauthorized_tool_effects": \{ "const": 0 \}/g,
    '"unauthorized_tool_effects": { "type": "integer", "minimum": 0 }',
  ],
  'schema-timestamp-bound': ['schema', /"maxLength": 35/, '"maxLength": 100001'],
  'acceptance-pending': [
    'evidence',
    /^\*\*Accepted-mode hosted verification SHA:\*\* .+$/m,
    '**Accepted-mode hosted verification SHA:** 0000000000000000000000000000000000000000',
  ],
  'disputed-ids': ['evidence', /^\*\*Disputed IDs:\*\* None$/m, '**Disputed IDs:** A5-TEST'],
  'product-trace-sha': [
    'evidence',
    /28d2bc0ecd9e5676a4e87f1bf5e81c602a1a0714/g,
    '0000000000000000000000000000000000000000',
  ],
  'evidence-trace': ['evidence', /A5-TRACE-01/g, 'REMOVED-TRACE'],
  'aeo-cardinality': ['aeo', /low-cardinality/gi, 'unbounded-cardinality'],
  'aeo-authority': ['aeo', /Telemetry is not authority\./g, 'Telemetry may grant authority.'],
};

if (probe !== undefined) {
  const mutation = replacements[probe];
  if (!mutation) throw new Error(`Unknown AICO-005 validation failure probe: ${probe}`);
  const [documentName, pattern, replacement] = mutation;
  const mutated = documents[documentName].replace(pattern, replacement);
  if (mutated === documents[documentName]) {
    throw new Error(`AICO-005 validation failure probe ${probe} did not mutate its target.`);
  }
  documents[documentName] = mutated;
}

function requireText(documentName, values) {
  const normalizedDocument = normalize(documents[documentName]);
  for (const value of values) {
    if (!normalizedDocument.includes(normalize(value))) {
      errors.push(`${paths[documentName]} is missing required content: ${value}`);
    }
  }
}

function requireLiteral(documentName, values) {
  for (const value of values) {
    if (!documents[documentName].includes(value)) {
      errors.push(`${paths[documentName]} is missing required literal: ${value}`);
    }
  }
}

requireLiteral('adr', ['DETERMINISTIC_FIXTURE', 'OPENAI_RESPONSES_DIRECT', 'CONDITIONAL_DISABLED']);

requireText('adr', [
  'AICO-005',
  'ADR-011',
  'Anthropic',
  'Gemini',
  'Aggregator/router',
  'Rejected for MVP',
  'training use prohibited; no opt-in training or consent surface in MVP',
  'no automatic cross-provider fallback',
  'provider SDK retries are disabled',
  'no worker sleeps',
  'post-dispatch timeout is UNKNOWN',
  'repair cap is 1',
  'separate invocation and reservation',
  'raw prompts and hidden reasoning are prohibited',
  'rollback and kill never rewrite historical lineage',
  'AICO-008',
  'AICO-030',
  'AICO-032',
  'AICO-033',
  'AICO-076',
  'AICO-077',
  'AICO-079',
  'AICO-082',
  'AICO-086',
  'AICO-087',
  'AICO-090',
]);

requireText('contract', [
  'invoke(request, signal)',
  'AbortSignal',
  'deadline',
  'trusted runtime',
  'privacy assertion',
  'provider SDK retries are disabled',
  'no worker sleeps',
  'no automatic cross-provider fallback',
  'post-dispatch timeout is UNKNOWN',
  'independent validation',
  'repair cap is 1',
  'separate invocation and reservation',
  'zero state, artifact, or tool authority',
  'raw prompts and hidden reasoning are prohibited',
  'training use prohibited',
  'integer micros',
  'currency',
  'latency',
  'safety',
  'redaction',
  'JSON Schema cannot prove cross-array inequality',
  'independent semantic validator must compare both reservation arrays',
  'reject any overlap',
]);

const expectedAcceptanceIds = [
  'A5-ADR-01',
  'A5-PORT-01',
  'A5-RESULT-01',
  'A5-VALIDATE-01',
  'A5-REPAIR-01',
  'A5-FAILURE-01',
  'A5-META-01',
  'A5-SECRET-01',
  'A5-VERSION-01',
  'A5-TERMS-01',
  'A5-TRACE-01',
  'A5-ACCEPT-01',
];
for (const id of expectedAcceptanceIds) {
  if (!documents.evidence.includes(id)) {
    errors.push(`${paths.evidence} is missing acceptance mapping: ${id}`);
  }
}
requireText('evidence', [
  'no external provider activation or production runtime is claimed',
  'Candidate semantic SHA',
  'Architecture/AI evidence',
  'Product + Legal/Security evidence',
  'Proposed-mode hosted verification',
  'Proposed-mode hosted verification SHA',
  'Accepted metadata SHA',
  'Accepted-mode hosted verification',
  'Accepted-mode hosted verification SHA',
  'Accepted-mode verification artifact digest',
  'Disputed IDs: None',
  'backend issue #25',
  'proof child #26',
  'exact SHA',
]);

requireText('aeo', [
  'AICO-005',
  'R0',
  'STATE_RECONSTRUCTION',
  'OFFLINE_REPRODUCTION',
  'CONTROLLED_REEVALUATION',
  'SIDE_EFFECT_RECONCILIATION',
  'low-cardinality',
  'bounded',
  'redacted',
  'exact SHA',
  'Telemetry is not authority.',
  'provider configuration digest',
  'schema digest',
]);
for (let number = 1; number <= 14; number += 1) {
  const id = `A5-AEO-${String(number).padStart(2, '0')}`;
  if (!documents.aeo.includes(id)) errors.push(`${paths.aeo} is missing AEO gate: ${id}`);
}

let schema;
try {
  schema = JSON.parse(documents.schema);
} catch (error) {
  errors.push(`${paths.schema} is not valid JSON: ${error.message}`);
}

function assertClosedObjects(value, location = '#') {
  if (!value || typeof value !== 'object') return;
  const isAllOfRefinement = location.includes('/allOf/');
  if (value.type === 'object' && value.additionalProperties !== false && !isAllOfRefinement) {
    errors.push(`${paths.schema} object schema ${location} must set additionalProperties=false`);
  }
  for (const [key, child] of Object.entries(value)) {
    assertClosedObjects(child, `${location}/${key}`);
  }
}

const wireContracts = [
  'aico.model-provider-invocation-request',
  'aico.model-provider-invocation-result',
  'aico.model-provider-repair-request',
  'aico.model-provider-configuration',
  'aico.model-provider-target-decision',
  'aico.model-provider-circuit-decision',
  'aico.model-provider-evidence',
];
const resultStates = ['SUCCEEDED', 'FAILED', 'CANCELED', 'UNKNOWN'];
const failureClasses = [
  'PRE_DISPATCH_TRANSIENT',
  'RATE_LIMITED',
  'VALIDATION',
  'REFUSAL_SAFETY',
  'CANCELED',
  'POST_DISPATCH_TIMEOUT_UNKNOWN',
  'POLICY_DENIED',
  'BUDGET_EXHAUSTED',
  'TERMINAL_PROVIDER',
  'INTEGRITY',
  'CONFIGURATION',
  'TARGET_KILLED',
  'CIRCUIT_OPEN',
];
const retryGuidance = [
  'NO_RETRY',
  'PERSISTED_RETRY_SCHEDULE',
  'REPAIR_INVOCATION',
  'RECONCILE_BEFORE_DECISION',
  'BLOCKED_OWNER_DECISION',
];

if (schema) {
  assertClosedObjects(schema);
  const serialized = JSON.stringify(schema);
  for (const term of [
    ...wireContracts,
    ...resultStates,
    ...failureClasses,
    ...retryGuidance,
    'schema_version',
    '1.0',
    'provider_configuration_ref',
    'logical_idempotency_key',
    'deadline_at',
    'cost_micros',
    'currency',
    'provider_ms',
    'total_ms',
    'redaction',
  ]) {
    if (!serialized.includes(term)) {
      errors.push(`${paths.schema} is missing required schema term: ${term}`);
    }
  }
  for (const forbidden of [
    'api_key',
    'credential',
    'raw_prompt',
    'raw_completion',
    'hidden_reasoning',
    'chain_of_thought',
    'provider_sdk_request',
  ]) {
    if (serialized.includes(`"${forbidden}"`)) {
      errors.push(`${paths.schema} contains forbidden wire field: ${forbidden}`);
    }
  }

  const exactEnum = (actual, expected) =>
    JSON.stringify([...(actual ?? [])].sort()) === JSON.stringify([...expected].sort());
  if (
    !exactEnum(schema.$defs?.modelProviderInvocationResult?.properties?.status?.enum, resultStates)
  ) {
    errors.push(`${paths.schema} result status enum must be exactly ${resultStates.join(', ')}`);
  }
  if (!exactEnum(schema.$defs?.runtimeFailure?.properties?.classification?.enum, failureClasses)) {
    errors.push(
      `${paths.schema} failure classification enum must be exactly ${failureClasses.join(', ')}`,
    );
  }
  if (!exactEnum(schema.$defs?.runtimeFailure?.properties?.retry_guidance?.enum, retryGuidance)) {
    errors.push(`${paths.schema} retry guidance enum must be exactly ${retryGuidance.join(', ')}`);
  }
  const guard = schema.$defs?.r0ExecutionGuard?.properties;
  for (const [field, expected] of Object.entries({
    provider_key: 'DETERMINISTIC_FIXTURE',
    adapter_kind: 'DETERMINISTIC_FIXTURE',
    execution_mode: 'DETERMINISTIC_ONLY',
    network_access: 'DENY',
    external_data_transfer: 'NONE',
    content_scope: 'APPROVED_SYNTHETIC_FIXTURE_ONLY',
    configuration_status: 'ACTIVE',
    target_decision_status: 'APPLIED',
    external_content_authorized: false,
    guard_validation_outcome: 'PASS',
  })) {
    if (guard?.[field]?.const !== expected) {
      errors.push(`${paths.schema} R0 execution guard ${field} must be exactly ${expected}`);
    }
  }
  if (!exactEnum(guard?.environment?.enum, ['LOCAL', 'TEST', 'CI'])) {
    errors.push(`${paths.schema} R0 execution guard environment must be exactly LOCAL, TEST, CI`);
  }
  if (!exactEnum(guard?.target_decision_kind?.enum, ['ACTIVATE', 'ROLLBACK'])) {
    errors.push(`${paths.schema} R0 target decision kind must be exactly ACTIVATE, ROLLBACK`);
  }
  const guardBindingInvariants = guard?.binding_invariants?.properties;
  for (const field of [
    'configuration_matches_version_binding',
    'target_matches_request_binding',
    'resolved_target_matches_configuration',
  ]) {
    if (guardBindingInvariants?.[field]?.const !== true) {
      errors.push(`${paths.schema} R0 execution guard binding invariant ${field} must be true`);
    }
  }
  if (!schema.$defs?.modelProviderInvocationRequest?.required?.includes('execution_guard')) {
    errors.push(`${paths.schema} invocation request must require the R0 execution guard`);
  }
  if (schema.$defs?.r0ContentClassification?.const !== 'SYNTHETIC') {
    errors.push(`${paths.schema} R0 invocation content classification must be exactly SYNTHETIC`);
  }
  const dispatchRedaction =
    schema.$defs?.r0DispatchableRedactionReceipt?.allOf?.[1]?.properties?.outcome?.enum;
  if (!exactEnum(dispatchRedaction, ['PASS', 'REDACTED'])) {
    errors.push(`${paths.schema} R0 dispatch content redaction must be exactly PASS, REDACTED`);
  }
  if (
    !exactEnum(schema.$defs?.successfulFinishReason?.enum, ['COMPLETED', 'LENGTH', 'TOOL_PROPOSAL'])
  ) {
    errors.push(`${paths.schema} successful finish reason must be exactly closed and non-terminal`);
  }
  const successfulResolved =
    schema.$defs?.r0SuccessfulResolvedProviderFacts?.allOf?.[1]?.properties;
  if (successfulResolved?.provider_key?.const !== 'DETERMINISTIC_FIXTURE') {
    errors.push(
      `${paths.schema} successful resolved provider must be exactly DETERMINISTIC_FIXTURE`,
    );
  }
  if (
    !exactEnum(schema.$defs?.runtimeFailure?.properties?.dispatch_phase?.enum, [
      'NOT_DISPATCHED',
      'DISPATCHED',
      'UNCERTAIN',
    ])
  ) {
    errors.push(`${paths.schema} dispatch phase must be exactly closed and uncertainty-preserving`);
  }
  for (const [location, actual] of [
    ['token measurement', schema.$defs?.tokenMeasurement?.properties?.provenance?.enum],
    ['cost', schema.$defs?.cost?.properties?.provenance?.enum],
    ['resolved provider facts', schema.$defs?.resolvedProviderFacts?.properties?.provenance?.enum],
  ]) {
    if (!exactEnum(actual, ['REPORTED', 'ESTIMATED', 'UNAVAILABLE'])) {
      errors.push(`${paths.schema} ${location} provenance must represent UNAVAILABLE honestly`);
    }
  }
  if (
    !exactEnum(schema.$defs?.redactionReceipt?.properties?.outcome?.enum, [
      'PASS',
      'REDACTED',
      'DROPPED',
    ])
  ) {
    errors.push(`${paths.schema} redaction outcome must be exactly PASS, REDACTED, DROPPED`);
  }
  if (schema.$defs?.rfc3339Utc?.maxLength !== 35) {
    errors.push(`${paths.schema} RFC 3339 timestamps must remain bounded to 35 characters`);
  }
  const expectedVersionRefs = {
    workflow: 'workflowRef',
    policy: 'policyRef',
    employee_definition: 'employeeDefinitionRef',
    instruction_bundle: 'instructionBundleRef',
    input_schema: 'inputSchemaRef',
    output_schema: 'outputSchemaRef',
    rubric: 'nullableRubricRef',
    toolset: 'toolsetRef',
    provider_configuration: 'providerConfigurationRef',
    pricing_catalog: 'pricingCatalogRef',
    budget_policy: 'budgetPolicyRef',
    redaction_policy: 'redactionPolicyRef',
  };
  for (const [field, refName] of Object.entries(expectedVersionRefs)) {
    if (schema.$defs?.versionBindings?.properties?.[field]?.$ref !== `#/$defs/${refName}`) {
      errors.push(`${paths.schema} version binding ${field} must use exact ${refName}`);
    }
  }
  const repairReceipt = schema.$defs?.repairSemanticValidationReceipt;
  if (
    repairReceipt?.properties?.outcome?.const !== 'PASS' ||
    repairReceipt?.properties?.invariants?.properties?.original_and_repair_reservations_disjoint
      ?.const !== true
  ) {
    errors.push(`${paths.schema} repair receipt must require a PASS disjointness invariant`);
  }

  try {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const exampleDirectory = 'docs/contracts/examples';
    const examples = readdirSync(exampleDirectory)
      .filter((name) => /^model-provider-.*\.json$/.test(name))
      .sort();
    const validExamples = examples.filter((name) => name.endsWith('.valid.json'));
    const invalidExamples = examples.filter((name) => name.endsWith('.invalid.json'));
    if (validExamples.length < wireContracts.length) {
      errors.push(`${exampleDirectory} must contain at least one valid example per wire contract`);
    }
    if (invalidExamples.length === 0) {
      errors.push(`${exampleDirectory} must contain at least one fail-closed invalid example`);
    }
    const exampleContracts = new Set();
    let validInvocationRequest;
    for (const name of validExamples) {
      const path = `${exampleDirectory}/${name}`;
      const value = JSON.parse(readFileSync(path, 'utf8'));
      exampleContracts.add(value.contract);
      if (value.contract === 'aico.model-provider-invocation-request') {
        validInvocationRequest = value;
      }
      if (!validate(value)) {
        errors.push(`${path} must validate: ${ajv.errorsText(validate.errors)}`);
      }
    }
    for (const contract of wireContracts) {
      if (!exampleContracts.has(contract)) {
        errors.push(`${exampleDirectory} is missing a valid example for ${contract}`);
      }
    }
    for (const name of invalidExamples) {
      const path = `${exampleDirectory}/${name}`;
      const value = JSON.parse(readFileSync(path, 'utf8'));
      if (validate(value)) errors.push(`${path} must fail the closed runtime schema`);
    }
    const secretFixturePath = `${exampleDirectory}/model-provider-invocation-request.secret.invalid.json`;
    const secretFixture = JSON.parse(readFileSync(secretFixturePath, 'utf8'));
    if (!validInvocationRequest || secretFixture.credential !== 'prohibited-example-field') {
      errors.push(`${secretFixturePath} must define the stable credential-field mutation`);
    } else {
      const secretMutation = structuredClone(validInvocationRequest);
      secretMutation.credential = secretFixture.credential;
      if (validate(secretMutation)) {
        errors.push(
          `${secretFixturePath} must be rejected when added to an otherwise valid request`,
        );
      } else if (
        !validate.errors?.some(
          (error) =>
            error.keyword === 'additionalProperties' &&
            error.params.additionalProperty === 'credential',
        )
      ) {
        errors.push(`${secretFixturePath} must fail specifically as a forbidden credential field`);
      }
    }

    const readExample = (name) => JSON.parse(readFileSync(`${exampleDirectory}/${name}`, 'utf8'));
    const assertRejectedMutation = (label, value) => {
      if (validate(value)) {
        errors.push(`${paths.schema} must reject ${label}`);
      }
    };
    const assertAcceptedShape = (label, value) => {
      if (!validate(value)) {
        errors.push(
          `${paths.schema} must accept coherent ${label}: ${ajv.errorsText(validate.errors)}`,
        );
      }
    };
    const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
    const requestBindingsMatch = (value) =>
      sameValue(value.execution_guard.configuration_ref, value.versions.provider_configuration) &&
      value.execution_guard.target_decision_id === value.target_decision_id &&
      value.execution_guard.target_decision_digest === value.target_decision_digest &&
      value.execution_guard.binding_invariants.configuration_matches_version_binding === true &&
      value.execution_guard.binding_invariants.target_matches_request_binding === true &&
      value.execution_guard.binding_invariants.resolved_target_matches_configuration === true;
    const resultBindingsMatch = (value, request) =>
      value.request_digest === request.request_digest &&
      value.invocation_id === request.invocation_id &&
      sameValue(value.provider_configuration_ref, request.versions.provider_configuration) &&
      (value.resolved.provenance === 'UNAVAILABLE' ||
        value.resolved.provider_key === 'DETERMINISTIC_FIXTURE');
    const repairBindingsMatch = (value) => {
      const originalReservations = new Set(value.original_reservation_ids);
      return (
        value.failed_invocation_id !== value.repair_invocation.invocation_id &&
        value.repair_reservation_ids.every((id) => !originalReservations.has(id)) &&
        value.semantic_validation_receipt.invariants.original_and_repair_reservations_disjoint ===
          true
      );
    };
    const assertSemanticMismatchRejected = (label, value, predicate) => {
      if (predicate(value)) {
        errors.push(`${paths.schema} semantic fixture check must reject ${label}`);
      }
    };
    const validRequest = readExample('model-provider-invocation-request.valid.json');
    const successResult = readExample('model-provider-invocation-result.success.valid.json');
    const unavailableResult = readExample(
      'model-provider-invocation-result.unavailable.valid.json',
    );
    const deterministicConfiguration = readExample(
      'model-provider-configuration.deterministic.valid.json',
    );
    const externalConfiguration = readExample(
      'model-provider-configuration.external-disabled.valid.json',
    );
    const repairRequest = readExample('model-provider-repair-request.valid.json');
    const validEvidence = readExample('model-provider-evidence.valid.json');

    if (!requestBindingsMatch(validRequest)) {
      errors.push(
        `${exampleDirectory} valid request must have exact configuration and target bindings`,
      );
    }
    if (!resultBindingsMatch(successResult, validRequest)) {
      errors.push(
        `${exampleDirectory} successful result must match its pinned request configuration`,
      );
    }
    if (!repairBindingsMatch(repairRequest)) {
      errors.push(
        `${exampleDirectory} valid repair request must have disjoint identities and reservations`,
      );
    }

    const externalInvocation = structuredClone(validRequest);
    externalInvocation.execution_guard.provider_key = 'OPENAI_RESPONSES_DIRECT';
    assertRejectedMutation('an external provider in the R0 invocation guard', externalInvocation);

    const nonSyntheticInvocation = structuredClone(validRequest);
    nonSyntheticInvocation.messages[0].content_parts[0].classification = 'INTERNAL';
    assertRejectedMutation('non-synthetic R0 invocation content', nonSyntheticInvocation);

    const droppedInvocationContent = structuredClone(validRequest);
    droppedInvocationContent.messages[0].content_parts[0].redaction.outcome = 'DROPPED';
    droppedInvocationContent.messages[0].content_parts[0].redaction.output_digest = null;
    assertRejectedMutation('dropped content in an R0 invocation', droppedInvocationContent);

    const mismatchedConfigurationBinding = structuredClone(validRequest);
    mismatchedConfigurationBinding.versions.provider_configuration =
      externalConfiguration.configuration_ref;
    assertSemanticMismatchRejected(
      'an invocation guard whose configuration differs from the version binding',
      mismatchedConfigurationBinding,
      requestBindingsMatch,
    );

    const mismatchedTargetBinding = structuredClone(validRequest);
    mismatchedTargetBinding.target_decision_id = '99999999-9999-4999-8999-999999999999';
    assertSemanticMismatchRejected(
      'an invocation guard whose target differs from the request binding',
      mismatchedTargetBinding,
      requestBindingsMatch,
    );

    const wrongRefKind = structuredClone(validRequest);
    wrongRefKind.versions.workflow.kind = 'PRICING_CATALOG';
    assertRejectedMutation('a workflow reference with the wrong kind', wrongRefKind);

    const unboundedTimestamp = structuredClone(validRequest);
    unboundedTimestamp.meta.emitted_at = `2026-08-15T04:02:00.${'1'.repeat(100_000)}Z`;
    assertRejectedMutation('an unbounded timestamp', unboundedTimestamp);

    const invalidCandidate = structuredClone(successResult);
    invalidCandidate.validation.status = 'FAILED';
    assertRejectedMutation('SUCCEEDED with failed independent validation', invalidCandidate);

    const unsafeCandidate = structuredClone(successResult);
    unsafeCandidate.safety.outcome = 'BLOCKED';
    assertRejectedMutation('SUCCEEDED with blocked safety', unsafeCandidate);

    const terminalFinishCandidate = structuredClone(successResult);
    terminalFinishCandidate.finish_reason = 'ERROR';
    assertRejectedMutation('SUCCEEDED with a terminal finish reason', terminalFinishCandidate);

    const externallyResolvedCandidate = structuredClone(successResult);
    externallyResolvedCandidate.resolved.provider_key = 'OPENAI_RESPONSES_DIRECT';
    assertRejectedMutation(
      'SUCCEEDED with an external resolved provider',
      externallyResolvedCandidate,
    );

    const mismatchedResultConfiguration = structuredClone(successResult);
    mismatchedResultConfiguration.provider_configuration_ref =
      externalConfiguration.configuration_ref;
    assertSemanticMismatchRejected(
      'a result whose configuration differs from its pinned request',
      mismatchedResultConfiguration,
      (value) => resultBindingsMatch(value, validRequest),
    );

    const driftedCandidate = structuredClone(successResult);
    driftedCandidate.resolved.model_resolution = 'UNACCEPTED_DRIFT';
    driftedCandidate.resolved.model_resolution_accepted = false;
    driftedCandidate.resolved.reproducibility_grade = 'DEGRADED';
    assertRejectedMutation('SUCCEEDED with unaccepted model drift', driftedCandidate);

    const invalidDeterministicPair = structuredClone(deterministicConfiguration);
    invalidDeterministicPair.provider_key = 'OPENAI_RESPONSES_DIRECT';
    assertRejectedMutation(
      'a mismatched deterministic provider and adapter pair',
      invalidDeterministicPair,
    );

    const invalidExternalPair = structuredClone(externalConfiguration);
    invalidExternalPair.adapter_kind = 'DETERMINISTIC_FIXTURE';
    assertRejectedMutation('a mismatched external provider and adapter pair', invalidExternalPair);

    const terminalFailure = structuredClone(unavailableResult);
    terminalFailure.failure.classification = 'TERMINAL_PROVIDER';
    terminalFailure.failure.reason_code = 'TERMINAL_PROVIDER_RESPONSE';
    terminalFailure.failure.dispatch_phase = 'DISPATCHED';
    terminalFailure.failure.retry_guidance = 'NO_RETRY';
    terminalFailure.failure.retryable = false;
    terminalFailure.failure.reconciliation_required = false;
    terminalFailure.failure.reconciliation_action = 'NONE';
    assertAcceptedShape('TERMINAL_PROVIDER without retry', terminalFailure);
    const retryingTerminalFailure = structuredClone(terminalFailure);
    retryingTerminalFailure.failure.retry_guidance = 'PERSISTED_RETRY_SCHEDULE';
    retryingTerminalFailure.failure.retryable = true;
    assertRejectedMutation(
      'TERMINAL_PROVIDER with a persisted retry schedule',
      retryingTerminalFailure,
    );

    const refusalFailure = structuredClone(terminalFailure);
    refusalFailure.failure.classification = 'REFUSAL_SAFETY';
    refusalFailure.failure.reason_code = 'PROVIDER_REFUSAL';
    refusalFailure.finish_reason = 'REFUSAL';
    refusalFailure.safety.outcome = 'BLOCKED';
    refusalFailure.safety.reason_codes = ['PROVIDER_REFUSAL'];
    assertAcceptedShape('REFUSAL_SAFETY without retry', refusalFailure);
    const retryingRefusalFailure = structuredClone(refusalFailure);
    retryingRefusalFailure.failure.retry_guidance = 'PERSISTED_RETRY_SCHEDULE';
    retryingRefusalFailure.failure.retryable = true;
    assertRejectedMutation(
      'REFUSAL_SAFETY with a persisted retry schedule',
      retryingRefusalFailure,
    );

    const integrityUnknown = structuredClone(unavailableResult);
    integrityUnknown.status = 'UNKNOWN';
    integrityUnknown.failure.classification = 'INTEGRITY';
    integrityUnknown.failure.reason_code = 'MALFORMED_ADAPTER_RESULT';
    integrityUnknown.failure.dispatch_phase = 'UNCERTAIN';
    integrityUnknown.failure.retry_guidance = 'BLOCKED_OWNER_DECISION';
    integrityUnknown.failure.retryable = false;
    integrityUnknown.failure.reconciliation_required = true;
    integrityUnknown.failure.reconciliation_action = 'QUARANTINE_AND_OWNER_DECISION';
    integrityUnknown.finish_reason = 'UNKNOWN';
    assertAcceptedShape('UNKNOWN integrity quarantine', integrityUnknown);
    const unreconciledIntegrity = structuredClone(integrityUnknown);
    unreconciledIntegrity.failure.reconciliation_required = false;
    unreconciledIntegrity.failure.reconciliation_action = 'NONE';
    assertRejectedMutation('INTEGRITY without quarantine reconciliation', unreconciledIntegrity);

    const postDispatchCancellation = structuredClone(unavailableResult);
    postDispatchCancellation.status = 'CANCELED';
    postDispatchCancellation.failure.classification = 'CANCELED';
    postDispatchCancellation.failure.reason_code = 'CANCELED_AFTER_DISPATCH';
    postDispatchCancellation.failure.dispatch_phase = 'DISPATCHED';
    postDispatchCancellation.failure.retry_guidance = 'NO_RETRY';
    postDispatchCancellation.failure.retryable = false;
    postDispatchCancellation.failure.reconciliation_required = true;
    postDispatchCancellation.failure.reconciliation_action = 'CANCEL_OR_LOOKUP';
    postDispatchCancellation.finish_reason = 'CANCELED';
    assertAcceptedShape('post-dispatch cancellation reconciliation', postDispatchCancellation);
    const unreconciledCancellation = structuredClone(postDispatchCancellation);
    unreconciledCancellation.failure.reconciliation_required = false;
    unreconciledCancellation.failure.reconciliation_action = 'NONE';
    assertRejectedMutation(
      'post-dispatch CANCELED without reconciliation',
      unreconciledCancellation,
    );

    const nonPassRepairReceipt = structuredClone(repairRequest);
    nonPassRepairReceipt.semantic_validation_receipt.invariants.original_and_repair_reservations_disjoint = false;
    assertRejectedMutation(
      'a repair receipt with a false disjointness invariant',
      nonPassRepairReceipt,
    );

    const overlappedRepair = structuredClone(repairRequest);
    overlappedRepair.repair_reservation_ids = [...overlappedRepair.original_reservation_ids];
    assertSemanticMismatchRejected(
      'overlapping original and repair reservation IDs',
      overlappedRepair,
      repairBindingsMatch,
    );

    const failedPassEvidence = structuredClone(validEvidence);
    failedPassEvidence.assertions[0].outcome = 'FAIL';
    assertRejectedMutation('PASS evidence with a failed assertion', failedPassEvidence);

    const effectfulPassEvidence = structuredClone(validEvidence);
    effectfulPassEvidence.counters.unauthorized_tool_effects = 1;
    assertRejectedMutation('PASS evidence with an unauthorized tool effect', effectfulPassEvidence);

    const unavailableMeasurements = [
      unavailableResult.usage.input_tokens,
      unavailableResult.usage.output_tokens,
      unavailableResult.usage.cached_input_tokens,
      unavailableResult.usage.reasoning_tokens,
      unavailableResult.usage.total_tokens,
    ];
    if (
      unavailableMeasurements.some(
        (measurement) =>
          measurement.provenance !== 'UNAVAILABLE' ||
          measurement.quantity !== null ||
          measurement.source !== 'UNAVAILABLE',
      ) ||
      unavailableResult.cost.provenance !== 'UNAVAILABLE' ||
      unavailableResult.cost.amount_micros !== null ||
      unavailableResult.cost.currency !== null ||
      unavailableResult.resolved.provenance !== 'UNAVAILABLE' ||
      unavailableResult.resolved.provider_key !== null
    ) {
      errors.push(`${exampleDirectory} unavailable result must not encode unknown facts as zero`);
    }
  } catch (error) {
    errors.push(`${paths.schema} must compile under JSON Schema 2020-12: ${error.message}`);
  }
}

const accepted = /^-?\s*\*\*Status:\*\* Accepted for AICO-005\b/m.test(documents.adr);
const proposed = /^-?\s*\*\*Status:\*\* Proposed for AICO-005 owner acceptance\b/m.test(
  documents.adr,
);
const evidenceField = (label) =>
  documents.evidence.match(new RegExp(`^\\*\\*${label}:\\*\\* (.+)$`, 'm'))?.[1]?.trim();
const candidateSemanticValue = evidenceField('Candidate semantic SHA');
const semanticSha = candidateSemanticValue?.match(/^`?([a-f0-9]{40})`?$/i)?.[1];
const architectureEvidence = evidenceField('Architecture/AI evidence');
const productEvidence = evidenceField('Product \\+ Legal/Security evidence');
const proposedHostedEvidence = evidenceField('Proposed-mode hosted verification');
const proposedHostedShaValue = evidenceField('Proposed-mode hosted verification SHA');
const proposedHostedSha = proposedHostedShaValue?.match(/^`?([a-f0-9]{40})`?$/i)?.[1];
const acceptedMetadataShaValue = evidenceField('Accepted metadata SHA');
const acceptedMetadataSha = acceptedMetadataShaValue?.match(/^`?([a-f0-9]{40})`?$/i)?.[1];
const acceptedHostedEvidence = evidenceField('Accepted-mode hosted verification');
const acceptedHostedShaValue = evidenceField('Accepted-mode hosted verification SHA');
const acceptedHostedSha = acceptedHostedShaValue?.match(/^`?([a-f0-9]{40})`?$/i)?.[1];
const acceptedArtifactDigest = evidenceField('Accepted-mode verification artifact digest');
const decisionDate = evidenceField('Decision date');
const adrArchitectureEvidence = documents.adr
  .match(/^\*\*Architecture\/AI evidence:\*\* (.+)$/m)?.[1]
  ?.trim();
const adrProductEvidence = documents.adr
  .match(/^\*\*Product \+ Legal\/Security evidence:\*\* (.+)$/m)?.[1]
  ?.trim();
const adrProductTraceSha = documents.adr.match(
  /^\*\*Product trace SHA:\*\* `([a-f0-9]{40})`$/m,
)?.[1];
const evidenceProductTraceSha = documents.evidence.match(
  /^\*\*Product trace SHA:\*\* `([a-f0-9]{40})`$/m,
)?.[1];
const disputedIds = evidenceField('Disputed IDs');
const permanentComment =
  /^https:\/\/github\.com\/duckvhuynh\/aico-backend\/pull\/\d+#issuecomment-\d+$/;
const permanentRun = /^https:\/\/github\.com\/duckvhuynh\/aico-backend\/actions\/runs\/\d+$/;
const pendingEvidenceValues = [
  candidateSemanticValue,
  architectureEvidence,
  productEvidence,
  proposedHostedEvidence,
  proposedHostedShaValue,
  acceptedMetadataShaValue,
  acceptedHostedEvidence,
  acceptedHostedShaValue,
  acceptedArtifactDigest,
  decisionDate,
  adrArchitectureEvidence,
  adrProductEvidence,
];
const acceptedStageValues = [
  acceptedMetadataShaValue,
  acceptedHostedEvidence,
  acceptedHostedShaValue,
  acceptedArtifactDigest,
];
const acceptedTransition = accepted && acceptedStageValues.every((value) => value === 'Pending');
const acceptedReconciled = accepted && acceptedStageValues.every((value) => value !== 'Pending');

if (!accepted && !proposed) {
  errors.push(
    `${paths.adr} status must be Proposed for AICO-005 owner acceptance or Accepted for AICO-005`,
  );
}
if (
  adrProductTraceSha !== expectedProductTraceSha ||
  evidenceProductTraceSha !== expectedProductTraceSha
) {
  errors.push(
    `${paths.adr} and ${paths.evidence} must bind the reviewed Product trace SHA ${expectedProductTraceSha}`,
  );
}
try {
  const productTrace = JSON.parse(documents.productTrace);
  if (JSON.stringify(productTrace) !== JSON.stringify(expectedProductTrace)) {
    errors.push(`${paths.productTrace} must exactly bind the reviewed Product commit and blobs`);
  }
} catch {
  errors.push(`${paths.productTrace} must be valid JSON`);
}
if (disputedIds !== 'None') {
  errors.push(`${paths.evidence} Disputed IDs header must be exactly None`);
}
if ((requireAccepted || requireReconciled) && !accepted) {
  errors.push(`${paths.adr} must be Accepted for AICO-005`);
}
if (requireReconciled && !acceptedReconciled) {
  errors.push(`${paths.evidence} must contain reconciled Accepted-mode hosted evidence`);
}
if (accepted) {
  if (!acceptedTransition && !acceptedReconciled) {
    errors.push(`${paths.evidence} Accepted-mode evidence must be wholly Pending or reconciled`);
  }
  if (!semanticSha)
    errors.push(`${paths.evidence} accepted decision must bind a 40-hex semantic SHA`);
  if (!permanentComment.test(architectureEvidence ?? '')) {
    errors.push(
      `${paths.evidence} accepted Architecture/AI evidence must be a permanent PR comment`,
    );
  }
  if (!permanentComment.test(productEvidence ?? '')) {
    errors.push(
      `${paths.evidence} accepted Product + Legal/Security evidence must be a permanent PR comment`,
    );
  }
  if (architectureEvidence === productEvidence) {
    errors.push(`${paths.evidence} accepted owner decisions must use two distinct PR comments`);
  }
  if (adrArchitectureEvidence !== architectureEvidence || adrProductEvidence !== productEvidence) {
    errors.push(`${paths.adr} accepted owner evidence must match the evidence map`);
  }
  if (!permanentRun.test(proposedHostedEvidence ?? '')) {
    errors.push(`${paths.evidence} accepted decision must cite its Proposed-mode hosted run`);
  }
  if (!proposedHostedSha || proposedHostedSha !== semanticSha) {
    errors.push(`${paths.evidence} Proposed-mode hosted SHA must equal Candidate semantic SHA`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(decisionDate ?? '')) {
    errors.push(`${paths.evidence} accepted decision must record an ISO decision date`);
  }
  if (acceptedReconciled) {
    if (!acceptedMetadataSha || acceptedMetadataSha === semanticSha) {
      errors.push(`${paths.evidence} accepted decision must bind a distinct 40-hex metadata SHA`);
    }
    if (!permanentRun.test(acceptedHostedEvidence ?? '')) {
      errors.push(`${paths.evidence} accepted decision must cite its Accepted-mode hosted run`);
    }
    if (!acceptedHostedSha || acceptedHostedSha !== acceptedMetadataSha) {
      errors.push(`${paths.evidence} Accepted-mode hosted SHA must equal Accepted metadata SHA`);
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(acceptedArtifactDigest ?? '')) {
      errors.push(`${paths.evidence} accepted verification artifact must bind a SHA-256 digest`);
    }
  }
  if (semanticSha) {
    try {
      const ancestryShas = acceptedReconciled ? [semanticSha, acceptedMetadataSha] : [semanticSha];
      for (const sha of ancestryShas) {
        execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
        execFileSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { stdio: 'ignore' });
      }
      if (acceptedReconciled) {
        execFileSync('git', ['merge-base', '--is-ancestor', semanticSha, acceptedMetadataSha], {
          stdio: 'ignore',
        });
      }
      const candidateAdr = execFileSync('git', ['show', `${semanticSha}:${paths.adr}`], {
        encoding: 'utf8',
      });
      if (!/^\*\*Status:\*\* Proposed for AICO-005 owner acceptance\b/m.test(candidateAdr)) {
        errors.push(`${paths.adr} Candidate semantic SHA must contain the Proposed decision`);
      }
      if (acceptedReconciled) {
        const acceptedMetadataAdr = execFileSync(
          'git',
          ['show', `${acceptedMetadataSha}:${paths.adr}`],
          { encoding: 'utf8' },
        );
        if (!/^\*\*Status:\*\* Accepted for AICO-005\b/m.test(acceptedMetadataAdr)) {
          errors.push(`${paths.adr} Accepted metadata SHA must contain the Accepted status`);
        }
        const acceptedMetadataEvidence = execFileSync(
          'git',
          ['show', `${acceptedMetadataSha}:${paths.evidence}`],
          { encoding: 'utf8' },
        );
        const acceptedStageFields = [
          'Accepted metadata SHA',
          'Accepted-mode hosted verification',
          'Accepted-mode hosted verification SHA',
          'Accepted-mode verification artifact digest',
        ];
        for (const label of acceptedStageFields) {
          if (!new RegExp(`^\\*\\*${label}:\\*\\* Pending$`, 'm').test(acceptedMetadataEvidence)) {
            errors.push(
              `${paths.evidence} Accepted metadata commit must leave ${label} Pending for non-cyclic hosted verification`,
            );
          }
        }
      }

      const semanticPaths = [
        paths.contract,
        paths.schema,
        paths.aeo,
        paths.productTrace,
        'scripts/validate-aico-005-architecture.mjs',
        'scripts/prove-aico-005-validation-fail-closed.mjs',
        'scripts/aico-005-decision-evidence.mjs',
        'scripts/process-utils.mjs',
        'scripts/verify-ci.mjs',
        '.github/workflows/ci.yml',
        'package.json',
        'package-lock.json',
        ...readdirSync('docs/contracts/examples')
          .filter((name) => /^model-provider-.*\.json$/.test(name))
          .sort()
          .map((name) => `docs/contracts/examples/${name}`),
      ];
      const semanticComparisons = acceptedReconciled
        ? [
            [semanticSha, acceptedMetadataSha],
            [acceptedMetadataSha, 'HEAD'],
          ]
        : [[semanticSha, 'HEAD']];
      for (const [from, to] of semanticComparisons) {
        execFileSync('git', ['diff', '--quiet', from, to, '--', ...semanticPaths], {
          stdio: 'ignore',
        });
      }

      const maskDecisionMetadata = (value) =>
        value
          .replace(/\r\n/g, '\n')
          .replace(
            /^\*\*(?:Status|Candidate semantic SHA|Architecture\/AI evidence|Product \+ Legal\/Security evidence|Proposed-mode hosted verification|Proposed-mode hosted verification SHA|Accepted metadata SHA|Accepted-mode hosted verification|Accepted-mode hosted verification SHA|Accepted-mode verification artifact digest|Decision date):\*\* .+$/gm,
            '**MASKED ACCEPTANCE METADATA**',
          );
      for (const [path, current] of [
        [paths.adr, documents.adr],
        [paths.evidence, documents.evidence],
      ]) {
        const candidate = execFileSync('git', ['show', `${semanticSha}:${path}`], {
          encoding: 'utf8',
        });
        if (maskDecisionMetadata(candidate) !== maskDecisionMetadata(current)) {
          errors.push(
            `${path} changed outside the accepted metadata allowlist after semantic review`,
          );
        }
      }
      const worktreeStatus = execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
      }).trim();
      if (worktreeStatus)
        errors.push('accepted-mode architecture validation requires a clean worktree');
      if (acceptedTransition) {
        const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
        if (headSha === semanticSha) {
          errors.push(`${paths.evidence} Accepted transition must be a metadata-only later commit`);
        }
      }
    } catch {
      errors.push(`${paths.evidence} decision SHAs must be ancestor commits with frozen semantics`);
    }
  }
} else if (pendingEvidenceValues.some((value) => value !== 'Pending')) {
  errors.push(`${paths.evidence} Proposed owner evidence and semantic SHA must remain Pending`);
}

if (errors.length > 0) {
  throw new Error(`AICO-005 architecture validation failed:\n- ${errors.join('\n- ')}`);
}

console.log(
  `AICO-005 architecture validation passed (${accepted ? 'Accepted' : 'Proposed'} mode; ${wireContracts.length} closed wire contracts).`,
);
