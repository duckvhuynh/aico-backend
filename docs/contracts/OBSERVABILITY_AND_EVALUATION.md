# Observability, Versioning, Accounting, and Evaluation Contracts

- **Status:** Normative MVP foundation contract
- **Contract family:** `aico.aeo-foundations`
- **Initial schema version:** `1.0`
- **Architecture reference:** `../architecture/005-aeo-foundations.md`
- **Related contracts:** `AGENT_RUNTIME.md`, `API_AND_DATA.md`
- **Primary traceability:** SRS-FR-037 through 045, 056 through 069, 074 through 096; SRS-NFR-006 through 008, 012, 016, 020 through 027; AICO-005, 009, 022, 025, 030, 032, 033, 056, 059 through 064, 072, 073, 077, 079, 084 through 091

## 1. Normative rules

1. Contracts use `camelCase`. Database adapters may use `snake_case`; OpenTelemetry attributes use the dotted names defined here.
2. Contract readers reject unknown major versions. A minor version may add optional fields only. All schemas are strict and reject unknown fields unless a field is explicitly a bounded extension map.
3. IDs are opaque UUIDs. Timestamps are RFC 3339 UTC strings. W3C trace and span identifiers are lowercase hexadecimal strings and are never UUID aliases.
4. A digest is `sha256:<64 lowercase hex characters>` over canonical bytes. JSON uses RFC 8785-compatible canonicalization before hashing.
5. Monetary and potentially large integer quantities serialize as base-10 strings. Application code may use `bigint`; JSON may not emit JavaScript `BigInt` values or binary floating-point money.
6. Registry objects, execution manifests, evidence, fixtures, gate results, accounting entries, and domain events are immutable after publication/commit. Corrections are new records linked with `supersedesId` or `correctsId`.
7. `latest`, mutable aliases, unqualified model names, unversioned prompts, and unversioned rubrics are invalid in a committed run or attempt manifest.
8. Raw prompts, raw completions, arbitrary transcripts, hidden reasoning, source bodies, attachment bodies, credentials, cookies, authorization headers, signed URLs, and foreign-tenant content are prohibited telemetry, analytics, fixture-output, and debug-bundle fields.
9. A log, trace, metric, dashboard, or evaluation projection cannot authorize a transition, approval, tool invocation, or artifact publication.
10. Every diagnostic/evidence payload is size-bounded, classified, audience-checked, and redacted before it crosses a process boundary.

## 2. Shared primitives

```ts
type UUID = string;
type Rfc3339Utc = string;
type Sha256 = `sha256:${string}`;
type SchemaVersion = `${number}.${number}`;
type SemanticVersion = `${number}.${number}.${number}`;
type DecimalInteger = string; // /^0$|^[1-9][0-9]*$/
type SignedDecimalInteger = string; // /^0$|^-?[1-9][0-9]*$/
type TraceId = string; // /^[0-9a-f]{32}$/ and not all zeroes
type SpanId = string; // /^[0-9a-f]{16}$/ and not all zeroes

type DataClassification =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'TENANT_CONTENT'
  | 'SECURITY_RESTRICTED'
  | 'SECRET';

type ReproducibilityGrade = 'DETERMINISTIC' | 'INPUT_REPRODUCIBLE' | 'DEGRADED';

interface ObjectReference {
  objectId: UUID;
  version?: number;
  digest: Sha256;
  mediaType: string;
  sizeBytes: DecimalInteger;
}
```

`SECRET` is a valid classification outcome used to reject/contain data; it is not a permitted persisted signal classification. Public API `schema_version: 1` canonicalizes to schema family plus major `1`, minor `0`. Internal contracts serialize the same version as `"1.0"`.

## 3. Immutable registry

### 3.1 Registry object

```ts
type RegistryKind =
  | 'WORKFLOW'
  | 'POLICY'
  | 'EMPLOYEE_DEFINITION'
  | 'EMPLOYEE_ROLLOUT_SET'
  | 'INSTRUCTION_BUNDLE'
  | 'PROMPT_TEMPLATE'
  | 'INPUT_SCHEMA'
  | 'OUTPUT_SCHEMA'
  | 'ARTIFACT_SCHEMA'
  | 'EVENT_SCHEMA'
  | 'ANALYTICS_SCHEMA'
  | 'RUBRIC'
  | 'EVALUATOR'
  | 'CHECK_SET'
  | 'TOOL_DEFINITION'
  | 'TOOLSET'
  | 'PROVIDER_CONFIGURATION'
  | 'PRICING_CATALOG'
  | 'BUDGET_POLICY'
  | 'SOURCE_TEMPLATE'
  | 'SANDBOX_POLICY'
  | 'REDACTION_POLICY';

interface RegistryObjectRef {
  id: UUID;
  kind: RegistryKind;
  logicalKey: string;
  semanticVersion: SemanticVersion;
  contentDigest: Sha256;
}

interface RegistryObjectVersion {
  contract: 'aico.registry-object';
  schemaVersion: '1.0';
  id: UUID;
  kind: RegistryKind;
  logicalKey: string;
  semanticVersion: SemanticVersion;
  contentDigest: Sha256;
  contentRef?: ObjectReference;
  code: {
    sourceRevision?: string;
    packageOrImageDigest?: Sha256;
    entrypoint?: string;
  };
  compatibility: {
    consumesSchemaRefs: RegistryObjectRef[];
    producesSchemaRefs: RegistryObjectRef[];
    minimumApplicationVersion?: SemanticVersion;
    maximumApplicationVersionExclusive?: SemanticVersion;
  };
  lifecycle: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'RETIRED' | 'REVOKED';
  provenance: {
    repository: string;
    sourceRevision: string;
    buildId?: string;
    authorActorId: UUID;
    approvalRecordId: UUID;
  };
  createdAt: Rfc3339Utc;
  publishedAt?: Rfc3339Utc;
  supersedesId?: UUID;
}
```

### 3.2 Registry invariants

- `(kind, logicalKey, semanticVersion)` and `(kind, logicalKey, contentDigest)` are unique.
- A published semantic version resolves to one digest forever.
- `ACTIVE`, `PAUSED`, `RETIRED`, or `REVOKED` updates only targeting status metadata; content and compatibility remain immutable.
- `REVOKED` requires a reason, incident/audit reference, and resume policy. It cannot delete historical content required for audit.
- A schema registry object contains canonical JSON Schema. A prompt template or instruction bundle contains approved static text/configuration, not rendered tenant content.
- A code-backed object references both source revision and executable package/image digest.
- Targeting by environment/cohort resolves to exact refs before a run is created. Selection rules are versioned and audited.
- Registry publication fails if a consumed schema/tool/policy reference is missing, mutable, incompatible, or not authorized for that target.

### 3.3 Employee rollout set

```ts
interface EmployeeRolloutSetVersion {
  contract: 'aico.employee-rollout-set';
  schemaVersion: '1.0';
  registryRef: RegistryObjectRef;
  employees: {
    'EMP-PM': RegistryObjectRef;
    'EMP-DES': RegistryObjectRef;
    'EMP-ENG': RegistryObjectRef;
    'EMP-QA': RegistryObjectRef;
  };
}
```

All four keys are required exactly once. An attempt resolves one definition from the run's rollout set; it may not select a new active definition after the run starts.

## 4. Execution manifests

### 4.1 Release manifest

```ts
interface ReleaseManifest {
  contract: 'aico.release-manifest';
  schemaVersion: '1.0';
  releaseManifestId: UUID;
  applicationVersion: SemanticVersion;
  sourceRevision: string;
  imageDigest: Sha256;
  dependencyLockDigest: Sha256;
  nodeRuntimeVersion: SemanticVersion;
  migrationSetDigest: Sha256;
  supportedContractMajors: Array<{ family: string; majors: number[] }>;
  buildProvenanceRef: ObjectReference;
  createdAt: Rfc3339Utc;
}
```

### 4.2 Run execution manifest

```ts
interface RunExecutionManifest {
  contract: 'aico.run-execution-manifest';
  schemaVersion: '1.0';
  manifestId: UUID;
  companyId: UUID;
  runId: UUID;
  manifestVersion: number;
  releaseManifestId: UUID;
  workflow: RegistryObjectRef;
  policy: RegistryObjectRef;
  employeeRolloutSet: RegistryObjectRef;
  providerConfiguration: RegistryObjectRef;
  pricingCatalog: RegistryObjectRef;
  budgetPolicy: RegistryObjectRef;
  sourceTemplate: RegistryObjectRef;
  sandboxPolicy: RegistryObjectRef;
  checkSet: RegistryObjectRef;
  redactionPolicy: RegistryObjectRef;
  artifactSchemas: RegistryObjectRef[];
  eventSchemas: RegistryObjectRef[];
  targetDecisionId: UUID;
  digest: Sha256;
  createdAt: Rfc3339Utc;
  supersedesManifestId?: UUID;
}
```

A second manifest version is permitted only for a documented recovery/target change allowed by the pinned workflow/policy. It does not rewrite the initial manifest or earlier attempts.

### 4.3 Attempt execution manifest

```ts
interface AttemptExecutionManifest {
  contract: 'aico.attempt-execution-manifest';
  schemaVersion: '1.0';
  manifestId: UUID;
  companyId: UUID;
  runId: UUID;
  taskId: UUID;
  attemptId: UUID;
  runManifestId: UUID;
  employeeDefinition: RegistryObjectRef;
  instructionBundle: RegistryObjectRef;
  promptTemplates: RegistryObjectRef[];
  inputSchema: RegistryObjectRef;
  outputSchema: RegistryObjectRef;
  rubric?: RegistryObjectRef;
  toolset: RegistryObjectRef;
  providerConfiguration: RegistryObjectRef;
  pricingCatalog: RegistryObjectRef;
  redactionPolicy: RegistryObjectRef;
  contextManifestId: UUID;
  contextManifestDigest: Sha256;
  canonicalRequestDigest: Sha256;
  requestedProvider: string;
  requestedModel: string;
  requestedModelRevision?: string;
  deadlineAt: Rfc3339Utc;
  reproducibilityGrade: ReproducibilityGrade;
  degradedReasons: string[];
  digest: Sha256;
  createdAt: Rfc3339Utc;
}
```

On completion, the invocation record captures the resolved provider/model/revision or provider fingerprint. A manifest with a missing registry object, unreadable content reference, digest mismatch, or unknown compatibility becomes `DEGRADED` and cannot support a passing promotion gate.

## 5. Causal context and propagation

```ts
interface CausalContext {
  contract: 'aico.causal-context';
  schemaVersion: '1.0';
  correlationId: UUID;
  causationId?: UUID;
  requestId?: UUID;
  commandId?: UUID;
  companyId?: UUID;
  runId?: UUID;
  taskId?: UUID;
  attemptId?: UUID;
  invocationId?: UUID;
  eventId?: UUID;
  artifactVersionId?: UUID;
  traceId?: TraceId;
  spanId?: SpanId;
  traceFlags?: number;
}
```

Propagation rules:

- The API validates or creates the business `correlationId` and creates a W3C trace context for the live request.
- A committed command/event carries the business IDs but does not require an active trace.
- A worker consuming an outbox/task creates a new trace linked to the producing event span when available and retains `correlationId`/`causationId`.
- A durable human wait ends the live trace. The answer/resume command creates a new trace and a new command correlation while preserving run identity and explicit causation to the wait/answer.
- A retry creates a new `attemptId` and trace; it references the failed attempt as causation and keeps the task/run.
- Baggage must not contain company names, goals, content, emails, tokens, object keys, or any secret.

## 6. Structured operational signals

### 6.1 Signal envelope

```ts
type SignalSeverity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
type ProcessRole = 'API' | 'WORKER' | 'MIGRATE' | 'SANDBOX_MANAGER' | 'EVALUATION';

interface OperationalSignal<TAttributes> {
  contract: 'aico.operational-signal';
  schemaVersion: '1.0';
  signalId: UUID;
  signalName: string;
  signalSchemaRef: RegistryObjectRef;
  severity: SignalSeverity;
  observedAt: Rfc3339Utc;
  service: {
    name: string;
    version: SemanticVersion;
    processRole: ProcessRole;
    instanceId: string;
    environment: 'LOCAL' | 'TEST' | 'STAGING' | 'PRODUCTION';
    releaseManifestId: UUID;
  };
  causal: CausalContext;
  classification: Exclude<DataClassification, 'SECRET'>;
  audience: Array<'OPERATIONS' | 'SECURITY' | 'INTERNAL_RUNTIME'>;
  outcome: 'OK' | 'ERROR' | 'DENIED' | 'CANCELED' | 'UNKNOWN';
  durationMs?: number;
  reasonCode?: string;
  attributes: TAttributes;
  redaction: {
    policyRef: RegistryObjectRef;
    outcome: 'PASS' | 'REDACTED' | 'DROPPED';
    redactedFieldCount: number;
  };
}
```

`attributes` conforms to the strict registry schema named by `signalSchemaRef`; it is not an arbitrary property bag. String fields define maximum sizes. An exception is represented by safe class/code, retryability, and a stack fingerprint or restricted diagnostic reference, not a raw provider response or unconstrained stack.

### 6.2 Required log fields

Every JSON log record includes:

- `timestamp`, `severity`, `service.name`, `service.version`, `deployment.environment`, `process.role`;
- `signal.name`, `signal.schema_version`, `outcome`, and stable `reason.code` when non-success;
- business correlation and authorized run/task/attempt/invocation IDs when applicable;
- `trace_id`/`span_id` when an active span exists;
- `release_manifest_id` and the directly relevant workflow/provider/tool/check version cohort;
- redaction policy version/outcome.

Never log full request/response DTOs by default. HTTP logs record route template, method, status, duration, response size, auth result class, and correlation; they exclude raw URL query values, headers, and bodies.

### 6.3 Required spans

Recommended stable span names:

- `http.server <route-template>`;
- `db.transaction <use-case>` and `db.query <operation-class>` without raw SQL/values;
- `workflow.claim`, `workflow.transition`, `workflow.recover`;
- `outbox.claim`, `outbox.publish`, `consumer.apply`;
- `agent.context.assemble`, `model.invoke`, `model.output.validate`, `model.output.repair`;
- `policy.evaluate`, `tool.invoke`, `build.execute`, `object.promote`;
- `evaluation.collect`, `evaluation.score`, `regression.compare`;
- `manifest.resolve`, `registry.publish`, `version.target`, `incident.reconcile`.

Spans use the same redaction and attribute allowlist as logs. Span events are bounded and cannot contain prompt, completion, source, attachment, command-output, or provider-response bodies.

## 7. Metrics contract

### 7.1 Cardinality policy

Permitted labels are bounded enumerations or controlled version cohorts. The following are prohibited metric labels: `companyId`, `founderId`, `runId`, `taskId`, `attemptId`, `invocationId`, `eventId`, `artifactId`, `objectId`, correlation ID, trace ID, email, IP address, raw route, error message, model output, or user-provided text.

High-cardinality investigation uses logs/traces/events, a trace exemplar, or an authorized database projection. Version values exposed as labels use a bounded rollout cohort key, not an arbitrary digest.

### 7.2 Minimum metric set

| Metric                                 | Type      | Bounded labels                                                  | Purpose                      |
| -------------------------------------- | --------- | --------------------------------------------------------------- | ---------------------------- |
| `aico_http_requests_total`             | Counter   | role, route template, method, status class                      | Traffic/error rate           |
| `aico_http_request_duration_seconds`   | Histogram | role, route template, method, outcome                           | SRS read/write latency       |
| `aico_readiness_state`                 | Gauge     | role, dependency class, state                                   | Dependency readiness         |
| `aico_db_transaction_duration_seconds` | Histogram | role, operation class, outcome                                  | Transaction health           |
| `aico_db_pool_connections`             | Gauge     | role, state                                                     | Pool saturation              |
| `aico_work_eligible`                   | Gauge     | task class, stage, priority class                               | Runnable demand              |
| `aico_work_queue_age_seconds`          | Histogram | task class, stage                                               | Claim delay                  |
| `aico_lease_expirations_total`         | Counter   | task class, outcome                                             | Restart/recovery risk        |
| `aico_outbox_oldest_age_seconds`       | Gauge     | topic class                                                     | Event freshness              |
| `aico_outbox_publish_total`            | Counter   | topic class, outcome                                            | Publication reliability      |
| `aico_consumer_sequence_gap_total`     | Counter   | consumer class                                                  | Ordered projection integrity |
| `aico_model_invocations_total`         | Counter   | employee, provider cohort, model cohort, outcome, failure class | Model reliability            |
| `aico_model_duration_seconds`          | Histogram | employee, provider cohort, model cohort, outcome                | Provider latency             |
| `aico_model_tokens_total`              | Counter   | employee, provider cohort, direction, cache class               | Usage                        |
| `aico_invocation_cost_micros_total`    | Counter   | invocation kind, provider/tool cohort, currency, cost source    | Attributable cost            |
| `aico_tool_invocations_total`          | Counter   | employee, tool cohort, action class, outcome                    | Tool use and denial          |
| `aico_policy_decisions_total`          | Counter   | employee/actor class, action class, result, reason class        | Governance                   |
| `aico_budget_amount_total`             | Counter   | category, entry kind, policy cohort                             | Reserve/consume/release      |
| `aico_budget_exhaustions_total`        | Counter   | category, policy cohort                                         | Hard-stop monitoring         |
| `aico_build_results_total`             | Counter   | template cohort, check-set cohort, outcome                      | Build quality                |
| `aico_evaluation_verdicts_total`       | Counter   | rubric cohort, verdict, evidence class                          | Criterion quality            |
| `aico_evaluation_findings_total`       | Counter   | rubric cohort, severity, blocking                               | Finding quality              |
| `aico_rework_cycles_total`             | Counter   | workflow cohort, cycle, outcome                                 | Rework behavior              |
| `aico_regression_gate_total`           | Counter   | suite cohort, change class, outcome                             | Release governance           |
| `aico_redaction_actions_total`         | Counter   | signal class, outcome, reason class                             | Privacy controls             |
| `aico_security_signals_total`          | Counter   | signal class, severity                                          | Security monitoring          |

Metric timestamps and aggregation intervals come from the telemetry system; they do not replace invocation/accounting timestamps in PostgreSQL.

## 8. Invocation and budget accounting

```ts
type InvocationKind = 'MODEL' | 'TOOL' | 'BUILD' | 'OBJECT' | 'EVALUATOR';
type CostSource = 'PROVIDER_REPORTED' | 'CATALOG_COMPUTED' | 'ESTIMATED';

interface UsageLine {
  category:
    | 'MODEL_INPUT_TOKENS'
    | 'MODEL_OUTPUT_TOKENS'
    | 'MODEL_CACHED_INPUT_TOKENS'
    | 'COMPUTE_MILLISECONDS'
    | 'WALL_MILLISECONDS'
    | 'STORAGE_BYTES'
    | 'NETWORK_BYTES'
    | 'TOOL_CALLS'
    | 'FILE_BYTES'
    | 'OUTPUT_BYTES';
  quantity: DecimalInteger;
  unit: string;
  source: 'PROVIDER' | 'TOOL' | 'PLATFORM_METER' | 'CATALOG' | 'ESTIMATE';
}

interface CostLine {
  amountMicros: DecimalInteger;
  currency: string; // ISO 4217 uppercase
  source: CostSource;
  pricingCatalogRef: RegistryObjectRef;
  pricingRuleKey: string;
}

interface InvocationAccountingRecord {
  contract: 'aico.invocation-accounting';
  schemaVersion: '1.0';
  accountingId: UUID;
  companyId: UUID;
  runId: UUID;
  taskId?: UUID;
  attemptId?: UUID;
  invocationId: UUID;
  invocationKind: InvocationKind;
  logicalIdempotencyKey: string;
  providerOrToolKey: string;
  requestedVersion: string;
  resolvedVersion?: string;
  resolvedFingerprint?: string;
  attemptManifestId?: UUID;
  reservationIds: UUID[];
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN';
  usage: UsageLine[];
  cost: CostLine[];
  usageDigest: Sha256;
  startedAt: Rfc3339Utc;
  completedAt?: Rfc3339Utc;
  correlationId: UUID;
  causationId: UUID;
}
```

Accounting invariants:

- A side-effecting invocation has a reservation before `STARTED`.
- `(invocationId, usageDigest)` is idempotent; a different digest for an existing finalized invocation creates a reconciliation discrepancy, not an update.
- Total consumed/released values reconcile exactly to reservation IDs and the run Budget Ledger.
- `UNKNOWN` retains the reason and recovery reference and cannot be charged twice by automatic replay.
- Provider/tool invoice reconciliation appends a variance record linked to the original accounting ID.
- Cost aggregation never includes tenant content or high-cardinality IDs as metric labels.

## 9. Evidence contract

```ts
type EvidenceKind =
  | 'COMMAND_RESULT'
  | 'TEST_RESULT'
  | 'TYPECHECK_RESULT'
  | 'LINT_RESULT'
  | 'BUILD_RESULT'
  | 'ACCESSIBILITY_SMOKE'
  | 'VIEWPORT_SMOKE'
  | 'MODEL_ASSESSMENT'
  | 'FOUNDER_OBSERVATION'
  | 'SECURITY_CHECK'
  | 'INTEGRITY_CHECK';

interface EvidenceRecord {
  contract: 'aico.evidence';
  schemaVersion: '1.0';
  evidenceId: UUID;
  companyId?: UUID;
  evaluationNamespace: 'PRODUCT_RUN' | 'EVAL_RUN' | 'RELEASE_GATE' | 'INCIDENT';
  runId?: UUID;
  taskId?: UUID;
  attemptId?: UUID;
  invocationId?: UUID;
  kind: EvidenceKind;
  producer: RegistryObjectRef;
  checkKey: string;
  checkVersion: SemanticVersion;
  subject: {
    kind: 'ARTIFACT_VERSION' | 'SOURCE_SNAPSHOT' | 'BUILD_RESULT' | 'PREVIEW' | 'RELEASE';
    id: UUID;
    version?: number;
    digest: Sha256;
  };
  environmentManifestId: UUID;
  result: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_APPLICABLE';
  resultCode: string;
  summary: string;
  boundedDetailRef?: ObjectReference;
  integrityDigest: Sha256;
  classification: Exclude<DataClassification, 'SECRET'>;
  retentionClass: string;
  collectedAt: Rfc3339Utc;
  expiresAt?: Rfc3339Utc;
}
```

Evidence is valid only when its subject digest equals the exact candidate subject, its producer/check versions are accepted by the pinned rubric, its object is readable and checksum-valid, and its audience/classification permits evaluation. A missing, expired, unreadable, stale, unsupported, or cross-candidate required item produces `BLOCKED`.

Bounded command detail may include exit code, duration, assertion IDs, filenames relative to the isolated workspace, and redacted excerpts. It may not include source bodies, full command logs, environment dumps, credentials, or host paths.

## 10. Evaluation fixture and suite contracts

```ts
type ExpectationKind =
  | 'QUALIFICATION_CLASS'
  | 'SCHEMA_VALID'
  | 'PROPERTY_PRESENT'
  | 'PROPERTY_ABSENT'
  | 'POLICY_DENIED'
  | 'NO_SIDE_EFFECT'
  | 'CRITERION_VERDICT'
  | 'BUILD_CHECK'
  | 'COST_WITHIN_LIMIT'
  | 'LATENCY_WITHIN_LIMIT';

interface EvalExpectation {
  expectationId: string;
  kind: ExpectationKind;
  subjectPathOrKey: string;
  comparator: 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'OMITS' | 'LTE' | 'GTE' | 'MATCHES_SCHEMA';
  expectedValueRef: ObjectReference;
  required: boolean;
  blocking: boolean;
  rationale: string;
}

interface EvalFixtureVersion {
  contract: 'aico.eval-fixture';
  schemaVersion: '1.0';
  fixtureId: UUID;
  logicalKey: string;
  version: number;
  inputRef: ObjectReference;
  inputSchemaRef: RegistryObjectRef;
  expectedQualification: 'QUALIFIED' | 'NEEDS_CLARIFICATION' | 'OUT_OF_SCOPE';
  acceptanceCriterionIds: string[];
  expectations: EvalExpectation[];
  requiredEvidenceKinds: EvidenceKind[];
  deterministicScenarioRefs: RegistryObjectRef[];
  limits: {
    maximumWallMs: DecimalInteger;
    maximumCostMicros: DecimalInteger;
    currency: string;
    maximumRepairs: number;
    maximumReworkCycles: 0 | 1 | 2;
  };
  containsSyntheticNonSensitiveDataOnly: true;
  ownerActorId: UUID;
  approvalRecordId: UUID;
  reviewDueAt: Rfc3339Utc;
  digest: Sha256;
  createdAt: Rfc3339Utc;
}

interface EvalSuiteVersion {
  contract: 'aico.eval-suite';
  schemaVersion: '1.0';
  suiteId: UUID;
  logicalKey: string;
  version: number;
  fixtureRefs: Array<{ fixtureId: UUID; version: number; digest: Sha256 }>;
  baselineCandidateManifestId?: UUID;
  gatePolicyRef: RegistryObjectRef;
  ownerActorId: UUID;
  approvalRecordId: UUID;
  digest: Sha256;
  createdAt: Rfc3339Utc;
}
```

Fixture and suite rules:

- Fixtures contain only approved synthetic/non-sensitive input.
- A fixture version is immutable; corrected expectations publish a new version.
- Expected qualitative properties are explicit assertions, not a hidden reference answer.
- Deterministic failure fixtures include malformed output, timeout, rate limit, cancellation, safety block, policy denial, budget exhaustion, duplicate delivery, and unknown external outcome.
- The private-alpha goal suite contains exactly the 10 approved version-pinned fixtures referenced by AICO-086.

## 11. Criterion-level evaluation

```ts
interface CriterionEvaluation {
  criterionId: string;
  verdict: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_APPLICABLE';
  evidenceIds: UUID[];
  evidenceClass: 'AUTOMATED' | 'MODEL_JUDGMENT' | 'FOUNDER_OBSERVED' | 'MIXED';
  findingIds: UUID[];
  conciseConclusion: string;
}

interface EvaluationResult {
  contract: 'aico.evaluation-result';
  schemaVersion: '1.0';
  evaluationId: UUID;
  namespace: 'PRODUCT_RUN' | 'EVAL_RUN' | 'RELEASE_GATE';
  candidateManifestId: UUID;
  approvedBriefVersionId?: UUID;
  approvedDesignVersionId?: UUID;
  sourceSnapshotVersionId?: UUID;
  buildResultVersionId?: UUID;
  rubricRef: RegistryObjectRef;
  evaluatorRef: RegistryObjectRef;
  checkSetRef: RegistryObjectRef;
  cycle: 0 | 1 | 2;
  criteria: CriterionEvaluation[];
  recommendation: 'FINAL_READY' | 'REWORK' | 'BLOCKED';
  evidenceSetDigest: Sha256;
  resultDigest: Sha256;
  createdAt: Rfc3339Utc;
}
```

Validation rules:

1. The approved Product Brief's criterion set is the complete required set.
2. Exactly one `CriterionEvaluation` exists per required criterion; no unknown/duplicate criterion is allowed.
3. Every evidence ID resolves to a valid immutable record for the exact candidate subject.
4. A required automated check that did not execute is `BLOCKED`, never `PASS` or `NOT_APPLICABLE`.
5. `NOT_APPLICABLE` requires a rubric-allowed reason and evidence that the applicability condition is false.
6. Model judgment is visibly classified and cannot replace a required automated check.
7. An unresolved blocking finding prevents `FINAL_READY`.
8. A contradictory pass/finding state, stale evidence, dangling evidence, or cycle above two rejects publication.

## 12. Regression and drift gate

```ts
type ChangeClass =
  | 'CONTRACT'
  | 'WORKFLOW_POLICY'
  | 'EMPLOYEE_PROMPT_MODEL'
  | 'RUBRIC_EVALUATOR'
  | 'TOOL_SANDBOX_TEMPLATE'
  | 'REDACTION_ANALYTICS'
  | 'RELEASE_MIGRATION';

interface GateCheckResult {
  checkId: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  blocking: boolean;
  baselineValue?: string;
  candidateValue?: string;
  threshold?: string;
  evidenceIds: UUID[];
  reasonCode?: string;
}

interface RegressionGateResult {
  contract: 'aico.regression-gate';
  schemaVersion: '1.0';
  gateRunId: UUID;
  suiteId: UUID;
  suiteVersion: number;
  baselineManifestId: UUID;
  candidateManifestId: UUID;
  changedRegistryRefs: RegistryObjectRef[];
  changeClasses: ChangeClass[];
  driftPolicyRef: RegistryObjectRef;
  checks: GateCheckResult[];
  outcome: 'PASS' | 'FAIL' | 'BLOCKED';
  approvedBaselineChangeId?: UUID;
  startedAt: Rfc3339Utc;
  completedAt: Rfc3339Utc;
  resultDigest: Sha256;
}
```

### 12.1 Non-waivable checks

- zero tenant isolation, approval bypass, unauthorized tool, sandbox escape/egress, secret leakage, or hidden-reasoning persistence;
- 100% strict schema validation and required criterion coverage;
- missing required evidence is blocked;
- no duplicate logical side effect under command/event/task replay;
- historical manifests, approvals, artifacts, and events remain readable after migration/rollback;
- no cycle above two and no final-ready state with a blocking finding;
- cost/budget ledger reconciles exactly for deterministic fixtures.

### 12.2 Alpha release checks

- SRS AT-001 through AT-015 pass in the release-candidate environment;
- at least 8 of the 10 approved goal fixtures yield a runnable preview;
- three consecutive golden dogfood runs complete without privileged mutation, manual restart, or database edit;
- API/event/restart targets meet SRS-NFR-001 through 007 under declared alpha load;
- alert, restore, kill, incident, and rollback drills have passing evidence and named owners.

Behavioral comparisons group by exact baseline/candidate manifest. Qualification outcome, schema repair, build success, criterion verdict, blocking finding, rework, latency, tokens, cost, and operator intervention are compared. Numeric drift thresholds live in a published `BUDGET_POLICY`/gate policy registry object. An absent threshold is `BLOCKED`, never unlimited.

## 13. Dashboards

All dashboards display environment, release manifest, workflow/policy, provider/model cohort, template, rubric/check set, time window, denominator, data freshness, and known exclusions. A drill-down uses authorized event/state queries and correlation IDs; dashboard URLs do not embed tenant content or signed object URLs.

| Dashboard           | Required views                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intake/product      | Sign-in -> company -> goal -> qualification -> gates -> preview -> final approval -> export; conversion denominator and wait time                    |
| Workflow operations | Runs by durable state/stage; eligible/claimed work; queue age; lease recovery; retries; blocked/failed reason; event/outbox/consumer lag             |
| Agent runtime       | Invocation outcomes, structured-output validity/repair, provider/model latency, tool requests/denials, context/manifest failures by employee/version |
| Quality/evaluation  | Criterion verdict coverage; automated vs model evidence; findings/severity/blocking; rework cycles; goal-suite and golden-run status                 |
| Governance          | Exact-version approvals/revisions; policy allow/deny/action/reason; stale/bypass attempts; operator kill/rollback; registry targeting                |
| Cost/capacity       | Tokens, model cost, tool/build compute, storage, total/run outcome, reservation variance, exhaustion, p50/p95 by version cohort                      |
| Security/privacy    | Cross-tenant denials, sandbox/egress/credential signals, attachment safety, redaction drops, preview isolation, secret-seeding gate                  |
| Release/drift       | Running vs target manifests, compatibility, regression gate comparisons, migration/rollback/restore evidence and unresolved release gaps             |

## 14. Alert contract and initial alpha thresholds

Every rule has `alertKey`, severity, owner role, runbook reference, version, query, evaluation window, threshold, missing-data behavior, notification route, and safe correlation drill-down. Threshold changes are versioned. Initial alpha values below are defaults to ratify under AICO-008; they cannot silently become unlimited.

| Signal               | Initial condition                                                                                                               | Severity / owner                                                           | Required action                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| API availability     | 99.5% monthly SLO error-budget burn >=14.4x for 1 hour, or readiness false for 5 minutes                                        | Critical / Platform on-call                                                | Stop rollout; diagnose dependency/release; communicate status       |
| API latency          | read p95 >1.5 s or write acknowledgement p95 >2.0 s for 10 minutes with >=50 samples                                            | Warning / Backend; critical at 30 minutes                                  | Inspect route/DB/version cohort and capacity                        |
| Event freshness      | event/outbox visibility p95 >5 s for 5 minutes, or oldest unpublished age >30 s                                                 | Critical / Platform                                                        | Pause fan-out changes; recover publisher; verify ordered gaps/dedup |
| Worker recovery      | eligible in-progress work has no valid claim/progress or accurate blocked state for 15 minutes                                  | Critical / Runtime                                                         | Reconstruct state; recover lease or block safely                    |
| Provider degradation | error/timeout/rate-limit >10% over 10 minutes with >=20 calls, >25% critical; three consecutive failures warns at low volume    | Warning/Critical / AI Runtime                                              | Circuit/target review; no unrecorded provider switch                |
| Schema repair        | repair rate >20% over 20 eligible calls or any schema-invalid artifact mutation attempt                                         | Warning/Critical / AI Runtime                                              | Pause affected employee/prompt/model target; run fixtures           |
| Budget               | any per-run hard exhaustion; projected daily approved budget >=80%; oversubscription or unreconciled duplicate amount >0        | Warning for expected exhaustion, critical for integrity / Product+Platform | Stop dispatch per policy; reconcile ledger                          |
| Policy/security      | any approval bypass, unauthorized side effect, sandbox escape/credential/egress signal, or confirmed cross-tenant access        | Critical / Security incident owner                                         | Kill/pause affected scope; preserve evidence; incident workflow     |
| Policy denial drift  | denial rate >5x the seven-day same-version baseline with >=20 decisions, or repeated same actor/action denial >=3 in 10 minutes | Warning / Security+Runtime                                                 | Review attack, client bug, stale version, or bad policy target      |
| Redaction            | any `DROPPED` signal due to detected secret/tenant body; any prohibited value found at sink                                     | Critical / Security                                                        | Contain sink, rotate exposed secret if applicable, regression test  |
| Build/quality        | build success drops >20 percentage points against approved suite baseline or any required criterion is missing                  | Critical / Engineering+QA                                                  | Block target; inspect exact manifest/evidence                       |
| Regression gate      | any blocking check fails or cannot execute                                                                                      | Critical / Release owner                                                   | No promotion; retain failure evidence                               |
| Telemetry black hole | service traffic/work exists but no expected telemetry for 5 minutes                                                             | Warning / Platform; critical at 30 minutes                                 | Restore telemetry; authoritative work may continue only if safe     |

An alert is never resolved by editing a run, approval, artifact, event, accounting, or evaluation row. Resolution references the corrective deployment, target decision, reconciliation, or incident closure.

## 15. Replay and debug contracts

```ts
type ReplayMode =
  | 'STATE_RECONSTRUCTION'
  | 'OFFLINE_REPRODUCTION'
  | 'CONTROLLED_REEVALUATION'
  | 'SIDE_EFFECT_RECONCILIATION';

interface DebugBundleManifest {
  contract: 'aico.debug-bundle';
  schemaVersion: '1.0';
  bundleId: UUID;
  mode: ReplayMode;
  companyId?: UUID;
  runId?: UUID;
  taskId?: UUID;
  attemptId?: UUID;
  invocationId?: UUID;
  correlationIds: UUID[];
  eventRange?: { fromSequence: number; toSequence: number; digest: Sha256 };
  releaseManifestIds: UUID[];
  runManifestIds: UUID[];
  attemptManifestIds: UUID[];
  evidenceIds: UUID[];
  failureReasonCodes: string[];
  omittedClasses: Array<
    | 'SECRET'
    | 'RAW_PROMPT_COMPLETION'
    | 'SOURCE_OR_ATTACHMENT_BODY'
    | 'HIDDEN_REASONING'
    | 'SIGNED_URL'
    | 'FOREIGN_TENANT'
  >;
  redactionPolicyRef: RegistryObjectRef;
  classification: 'INTERNAL' | 'SECURITY_RESTRICTED';
  expiresAt: Rfc3339Utc;
  digest: Sha256;
  createdByActorId: UUID;
  createdAt: Rfc3339Utc;
}
```

Mode rules:

- `STATE_RECONSTRUCTION` is read-only and reports gaps/digest mismatches; it does not infer missing success.
- `OFFLINE_REPRODUCTION` uses the deterministic local provider and simulated tools. Network and product mutations are denied.
- `CONTROLLED_REEVALUATION` creates a separate evaluation identity and result linked to the immutable candidate. It never updates the original QA report or founder state.
- `SIDE_EFFECT_RECONCILIATION` is separately authorized and limited to provider/tool lookup, cancel, or status reconciliation. A new invocation is a new attempt requiring policy/budget; it is not called replay.
- Hidden reasoning is neither captured nor requested. Debugging uses versions, inputs, outputs, validation errors, evidence, policy decisions, state/event history, and concise conclusions.

## 16. Privacy and redaction contract

### 16.1 Handling matrix

| Classification/content               |        Domain artifact/object |              Domain event |             Log/trace |           Metric |       Analytics |                                    Debug bundle |
| ------------------------------------ | ----------------------------: | ------------------------: | --------------------: | ---------------: | --------------: | ----------------------------------------------: |
| Public metadata                      |                       Allowed |         Allowed by schema |               Allowed |   Aggregate only |         Allowed |                                         Allowed |
| Internal operational metadata        |                    Restricted |       Operations audience |   Restricted/retained |   Aggregate only |      Classified |                             Allowed with expiry |
| Tenant content                       |    Tenant-scoped exact object | Reference/conclusion only |       Prohibited body |       Prohibited | Prohibited body |                Prohibited body; references only |
| Security-restricted diagnostic       |   Restricted immutable object |   Security reference only | Fingerprint/reference | Aggregate signal |      Prohibited |        Allowed by incident authorization/expiry |
| Secret/credential/session/signed URL |           Secret manager only |                Prohibited |            Prohibited |       Prohibited |      Prohibited |                                      Prohibited |
| Raw prompt/completion/transcript     | Not a product artifact in MVP |                Prohibited |            Prohibited |       Prohibited |      Prohibited | Prohibited; reconstruct permitted input by refs |
| Hidden reasoning                     |                    Prohibited |                Prohibited |            Prohibited |       Prohibited |      Prohibited |                                      Prohibited |

### 16.2 Redaction result

```ts
interface RedactionResult {
  contract: 'aico.redaction-result';
  schemaVersion: '1.0';
  policyRef: RegistryObjectRef;
  outcome: 'PASS' | 'REDACTED' | 'DROPPED';
  inputClassification: DataClassification;
  outputClassification?: Exclude<DataClassification, 'SECRET'>;
  reasonCodes: string[];
  redactedFieldPaths: string[]; // schema field paths only, no values
  inputDigest: Sha256;
  outputDigest?: Sha256;
  evaluatedAt: Rfc3339Utc;
}
```

If the serializer cannot prove a payload safe, it drops the diagnostic signal and increments a safe redaction metric. Authoritative domain operations continue or fail according to their own contract; they never persist the unsafe telemetry as a fallback.

## 17. Deterministic local provider

```ts
interface LocalProviderScenarioVersion {
  contract: 'aico.local-provider-scenario';
  schemaVersion: '1.0';
  registryRef: RegistryObjectRef;
  scenarioKey: string;
  acceptedTaskTypes: string[];
  requiredAttemptManifestDigest?: Sha256;
  requiredRequestDigest?: Sha256;
  behavior:
    | 'SUCCESS'
    | 'MALFORMED_OUTPUT'
    | 'TIMEOUT'
    | 'RATE_LIMITED'
    | 'CANCELED'
    | 'SAFETY_BLOCKED'
    | 'UNKNOWN_OUTCOME';
  responseRef?: ObjectReference;
  providerMetadata: {
    provider: 'aico-local-fixture';
    model: string;
    revision: SemanticVersion;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    costMicros: DecimalInteger;
    currency: string;
  };
}
```

The local/test adapter is the default in CI and cannot be selected in a deployed production environment. It supports abort signals, fixed virtual latency, deterministic usage, strict request/manifest digest assertions, and every classified failure required by AICO-005. Scenario lookup is explicit; no unknown task silently receives a generic success.

## 18. Verification matrix

| Verification                                 | Required result                                                                          | Traceability                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Registry immutability and compatibility      | Exact published digest resolves forever; incompatible/missing ref fails before execution | SRS-NFR-020, 023â€“024; AICO-022, 030, 079                  |
| Run/attempt manifest completeness            | Every behavior-affecting version and release digest is present; no `latest`              | SRS-FR-037, 084, 090; AICO-030, 032                         |
| Causal propagation across wait/restart/retry | Durable business chain remains joinable across multiple traces                           | SRS-FR-038, 074â€“078; AICO-025, 027â€“028, 084             |
| Telemetry privacy/cardinality                | Seeded prohibited content absent; high-card IDs absent from metric labels                | SRS-FR-043, 091, 094; SRS-NFR-012, 021; AICO-056, 072       |
| Model/tool/budget reconciliation             | Reservation, usage, cost, retry/cancel/unknown outcome reconcile exactly                 | SRS-FR-090, 095; SRS-NFR-025â€“027; AICO-005, 033, 084      |
| Evidence integrity                           | Exact candidate/check/producer versions and checksums; missing evidence blocks           | SRS-FR-061â€“065; AICO-059â€“062                            |
| Rework regression                            | New immutable lineage; affected plus regression; hard two-cycle stop                     | SRS-FR-066â€“068; AICO-063â€“064                            |
| Drift gate                                   | Changed versions select correct gate; non-waivable failures block promotion              | SRS-NFR-023â€“024; AICO-079, 085â€“087                      |
| Replay modes                                 | Read-only/local/eval operations do not mutate product; unknown side effect not repeated  | SRS-FR-074â€“083; AT-006/007/012; AICO-084, 089             |
| Dashboards/alerts                            | Synthetic events reconcile exact measures and simulate each critical signal              | SRS-FR-093â€“096; SRS-NFR-022, 027; AICO-072, 073, 077, 089 |
| Alpha evidence                               | AT-001â€“015, 10-goal threshold, three golden runs, restore/rollback/incident drills     | SRS sections 12/15; AICO-085â€“091                          |

## 19. Contract definition of done

This foundation contract is implemented for private alpha only when:

1. JSON Schemas and typed codecs exist for every record in this document with strict unknown-field rejection and canonical digest fixtures;
2. PostgreSQL constraints/repositories enforce immutability, tenant scope, idempotency, and exact manifest/evidence references;
3. the API and worker emit safe structured signals and bounded metrics through replaceable ports;
4. deterministic local scenarios cover success plus malformed, timeout, rate-limit, cancel, safety, policy, budget, duplicate, and unknown-outcome behavior;
5. registry targeting and rollback preserve historical runs and surface `DEGRADED` evidence rather than silently resolving a new version;
6. evaluation publication proves exact criterion coverage and evidence integrity;
7. regression gates and alert simulations produce immutable release evidence;
8. replay/debug/incident tooling obeys mode, authorization, no-mutation, redaction, and expiry rules; and
9. the release evidence matrix links every applicable SRS requirement and AICO item to a passing artifact or explicitly records a launch-blocking gap.
