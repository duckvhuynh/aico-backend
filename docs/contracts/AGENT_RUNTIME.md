# Agent Runtime Contracts

- **Status:** Normative MVP contract
- **Contract family:** `aico.agent-runtime`
- **Initial schema version:** `1.0`
- **Architecture reference:** `docs/architecture/002-multi-agent-runtime.md`
- **Backlog trace:** AICO-005, AICO-006, AICO-022 through AICO-033

## 1. Contract rules

1. All runtime ingress and egress is schema validated before use.
2. Contract objects use `camelCase`; database columns may use `snake_case` in adapters.
3. IDs are opaque UUIDs. Timestamps are RFC 3339 UTC strings. Money is integer micros in a declared currency; never binary floating point.
4. `schemaVersion` uses `major.minor`. Readers reject unknown major versions. A minor version may only add optional fields. Field removal, rename, meaning change, or enum narrowing requires a new major version and adapter.
5. Parsers are strict: unknown fields are rejected at command, model-output, policy, and tool boundaries. Event consumers may preserve unknown optional fields only after the envelope version is accepted.
6. All enumerations are closed per schema version. Unknown values fail safely.
7. Content fields are size bounded. Credentials, raw hidden reasoning, raw provider prompts/completions, and arbitrary transcripts are prohibited product fields.
8. Every referenced artifact, employee, workflow, policy, rubric, schema, provider configuration, template, and tool is an exact immutable ID/version, never `latest`.
9. `correlationId` identifies a founder/API operation or workflow chain. `causationId` identifies the exact command/event/attempt that produced the record.
10. Tenant/company identity is resolved by the API or persisted parent reference. A client-supplied company ID is never sufficient authorization.

## 2. Shared primitives

```ts
type UUID = string;
type Rfc3339Utc = string;
type Sha256 = `sha256:${string}`;
type SchemaVersion = `${number}.${number}`;

type ActorRef =
  | { kind: 'FOUNDER'; actorId: UUID }
  | { kind: 'EMPLOYEE'; actorId: UUID; employeeKey: EmployeeKey; employeeDefinitionVersionId: UUID }
  | { kind: 'SYSTEM'; actorId: UUID; component: string }
  | { kind: 'OPERATOR'; actorId: UUID; authorizationRef: UUID };

type EmployeeKey = 'EMP-PM' | 'EMP-DES' | 'EMP-ENG' | 'EMP-QA';
type Audience = 'FOUNDER' | 'OPERATIONS' | 'SECURITY' | 'INTERNAL_RUNTIME';

interface VersionSet {
  workflowVersion: string;
  policyVersion: string;
  employeeDefinitionVersionId: UUID;
  instructionBundleVersion: string;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  rubricVersion: string;
  toolsetVersion: string;
  providerConfigurationVersion: string;
  templateVersion?: string;
}
```

`OPERATOR` is never a substitute for `FOUNDER`. Internal events may have multiple separately rendered audience projections, but one payload must not expose a more privileged audience's fields to a less privileged audience.

## 3. Command envelope

All state-changing API and internal commands conform to:

```ts
interface CommandEnvelope<TType extends string, TPayload> {
  contract: 'aico.command';
  schemaVersion: '1.0';
  commandId: UUID;
  commandType: TType;
  idempotencyKey: string;              // 16..128 characters
  issuedAt: Rfc3339Utc;
  actor: ActorRef;
  companyId: UUID;
  runId?: UUID;
  taskId?: UUID;
  attemptId?: UUID;
  correlationId: UUID;
  causationId?: UUID;
  expected: {
    runState?: RunState;
    taskState?: TaskState;
    aggregateVersion?: number;
    artifactVersionId?: UUID;
    waitRequestVersion?: number;
  };
  payload: TPayload;
}
```

Database uniqueness is at least `(company_id, actor_kind, actor_id, command_type, idempotency_key)`. The stored command receipt contains request digest, status, result reference, and response digest. Reuse with an identical request returns the stored result; reuse with a different digest returns `IDEMPOTENCY_KEY_REUSED` and makes no mutation.

Commands that require founder authority include `answerClarification`, `decideApproval`, `requestRevision`, and `cancelRun`. `decideApproval` also requires `expected.runState` and `expected.artifactVersionId`.

## 4. Employee definition

```ts
interface EmployeeDefinitionVersion {
  contract: 'aico.employee-definition';
  schemaVersion: '1.0';
  id: UUID;
  employeeKey: EmployeeKey;
  definitionVersion: number;
  role: string;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED' | 'KILLED';
  instructionBundle: { version: string; digest: Sha256 };
  acceptedTaskTypes: TaskType[];
  inputSchemaVersions: string[];
  outputSchemaVersions: string[];
  toolGrants: Array<{
    toolKey: string;
    toolVersion: string;
    actions: string[];
    parameterConstraintsRef: string;
  }>;
  prohibitedActions: string[];
  memoryScope: {
    allowedSourceKinds: ContextSourceKind[];
    allowedFieldPaths: string[];
    maximumSerializedBytes: number;
    allowPriorTranscripts: false;
    allowCrossCompanyContent: false;
  };
  rubricVersion: string;
  providerRequirements: {
    structuredOutput: true;
    toolCalling: boolean;
    minimumContextTokens: number;
  };
  limits: AttemptLimits;
  createdAt: Rfc3339Utc;
  activatedAt?: Rfc3339Utc;
}
```

There is one active version per fixed employee key per rollout target. User-authored definitions and unknown employee keys are invalid in MVP. Runs pin a rollout/version set; attempts pin the resolved definition ID.

### 4.1 Role permission matrix

| Capability | EMP-PM | EMP-DES | EMP-ENG | EMP-QA |
|---|:---:|:---:|:---:|:---:|
| Read frozen company/goal context | Allow | Allow only task-scoped fields | Allow only approved task inputs | Allow only evaluation inputs |
| Create Product Brief / clarification | Allow | Deny | Deny | Deny |
| Create Design Specification | Deny | Allow | Deny | Deny |
| Add or change approved product scope | Deny | Deny | Deny | Deny |
| Edit isolated workspace files | Deny | Deny | Allow for assigned attempt | Deny |
| Execute allowlisted build/test commands | Deny | Deny | Allow for assigned attempt | Read evidence only |
| Use arbitrary network / deploy / production secrets | Deny | Deny | Deny | Deny |
| Produce criterion verdicts/findings | Deny | Deny | Deny | Allow |
| Edit requirements/source or waive required failure | Deny | Deny | Deny | Deny |
| Approve any gate | Deny | Deny | Deny | Deny |

## 5. Task plan and graph

```ts
type TaskType =
  | 'QUALIFY_GOAL'
  | 'CREATE_PRODUCT_BRIEF'
  | 'REVISE_PRODUCT_BRIEF'
  | 'CREATE_DESIGN_SPEC'
  | 'REVISE_DESIGN_SPEC'
  | 'CREATE_IMPLEMENTATION_PLAN'
  | 'BUILD_PROTOTYPE'
  | 'EVALUATE_PROTOTYPE'
  | 'REWORK_PROTOTYPE'
  | 'CREATE_FINAL_MANIFEST';

interface TaskPlanVersion {
  contract: 'aico.task-plan';
  schemaVersion: '1.0';
  id: UUID;
  runId: UUID;
  version: number;
  workflowVersion: string;
  sourceArtifactVersionIds: UUID[];
  tasks: TaskDefinition[];
  edges: TaskEdge[];
  digest: Sha256;
  createdAt: Rfc3339Utc;
}

interface TaskDefinition {
  taskId: UUID;
  logicalKey: string;
  taskType: TaskType;
  ownerEmployeeKey: EmployeeKey | null;
  ownerEmployeeDefinitionVersionId: UUID | null;
  stage: RunStage;
  objective: string;
  inputRefs: VersionedReference[];
  expectedOutputs: Array<{ artifactType: string; schemaVersion: string; logicalKey: string }>;
  requiredApprovalRefs: UUID[];
  checks: Array<{ checkKey: string; version: string; required: boolean }>;
  limits: AttemptLimits;
}

interface TaskEdge {
  fromTaskId: UUID;
  toTaskId: UUID;
  edgeType: 'REQUIRES_SUCCESS' | 'REQUIRES_ARTIFACT' | 'REWORK_OF';
}
```

`logicalKey` is stable within a plan lineage. `(run_id, plan_version, logical_key)` and `(run_id, from_task_id, to_task_id, edge_type)` are unique. Both edge endpoints must belong to the same run. The graph is validated acyclic before publication. Rework publishes a new plan version that contains prior nodes unchanged plus new nodes/edges.

## 6. State contracts

```ts
type RunState =
  | 'DRAFT' | 'QUALIFYING' | 'AWAITING_FOUNDER_INPUT'
  | 'AWAITING_BRIEF_APPROVAL' | 'DESIGNING' | 'AWAITING_DESIGN_APPROVAL'
  | 'BUILDING' | 'REVIEWING' | 'REWORKING'
  | 'AWAITING_FINAL_APPROVAL' | 'BLOCKED' | 'FAILED' | 'CANCELED' | 'COMPLETED';

type RunStage = 'INTAKE' | 'PRODUCT' | 'DESIGN' | 'BUILD' | 'QA' | 'FINAL';

type TaskState =
  | 'QUEUED' | 'READY' | 'RUNNING' | 'AWAITING_INPUT' | 'RETRY_WAIT'
  | 'SUCCEEDED' | 'BLOCKED' | 'FAILED' | 'CANCELED';
```

`READY` is an optimization/projection. A claim must recompute eligibility. `SUCCEEDED`, `FAILED`, and `CANCELED` task records are immutable except for separately stored operational annotations. Terminal run states reject all new domain work.

Each accepted transition writes:

```ts
interface TransitionRecord {
  aggregateType: 'RUN' | 'TASK' | 'ARTIFACT';
  aggregateId: UUID;
  fromState: string;
  toState: string;
  triggerType: string;
  triggerId: UUID;
  actor: ActorRef;
  workflowVersion: string;
  policyDecisionId?: UUID;
  gate?: 'PRODUCT_BRIEF' | 'DESIGN_SPEC' | 'FINAL_PROTOTYPE';
  approvalId?: UUID;
  correlationId: UUID;
  causationId: UUID;
  occurredAt: Rfc3339Utc;
}
```

## 7. Attempt input and context manifest

```ts
type ContextSourceKind =
  | 'CONTEXT_SNAPSHOT' | 'GOAL_VERSION' | 'CLARIFICATION_ANSWER_VERSION'
  | 'APPROVED_ARTIFACT_VERSION' | 'TASK_DEFINITION' | 'FINDING'
  | 'RUBRIC' | 'POLICY_SUMMARY' | 'TOOL_DESCRIPTION';

interface VersionedReference {
  kind: ContextSourceKind | 'ARTIFACT_VERSION' | 'OBJECT';
  id: UUID;
  version?: number | string;
  digest: Sha256;
}

interface ContextManifest {
  contract: 'aico.context-manifest';
  schemaVersion: '1.0';
  companyId: UUID;
  runId: UUID;
  taskId: UUID;
  attemptId: UUID;
  employeeDefinitionVersionId: UUID;
  sources: Array<VersionedReference & { allowedFields: string[] }>;
  excludedClasses: Array<'CROSS_TENANT' | 'ARBITRARY_TRANSCRIPT' | 'CREDENTIAL' | 'HIDDEN_REASONING' | 'MUTABLE_LATEST'>;
  serializedBytes: number;
  contentDigest: Sha256;
  redactionVersion: string;
  assembledAt: Rfc3339Utc;
}

interface TaskAttemptInput {
  contract: 'aico.task-attempt-input';
  schemaVersion: '1.0';
  companyId: UUID;
  runId: UUID;
  taskId: UUID;
  attemptId: UUID;
  attemptNumber: number;
  idempotencyKey: string;
  correlationId: UUID;
  causationId: UUID;
  versions: VersionSet;
  contextManifest: ContextManifest;
  objective: string;
  expectedOutput: { artifactType: string; schemaVersion: string };
  remainingBudget: BudgetSnapshot;
  deadlineAt: Rfc3339Utc;
}
```

The manifest is assembled under the company/run relationship from persisted references. Callers cannot inject arbitrary content references. Context digest is calculated after canonical serialization and redaction.

## 8. Model provider port

```ts
interface ModelInvocationRequest<TOutput> {
  invocationId: UUID;
  logicalIdempotencyKey: string;
  taskAttempt: TaskAttemptInput;
  employeeKey: EmployeeKey;
  messages: Array<{
    role: 'SYSTEM' | 'USER' | 'TOOL_RESULT';
    contentParts: Array<{ kind: 'TEXT' | 'JSON' | 'REFERENCE'; value: unknown }>;
  }>;
  outputSchema: { id: string; version: string; jsonSchema: object };
  declaredTools: ToolDeclaration[];
  limits: { timeoutMs: number; maximumInputTokens: number; maximumOutputTokens: number; maximumCostMicros: bigint; currency: string };
}

interface ModelInvocationResult<TOutput> {
  invocationId: UUID;
  providerRequestId?: string;
  status: 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN';
  candidateOutput?: TOutput;
  proposedToolRequests?: ToolRequest[];
  finishReason?: string;
  provider: string;
  model: string;
  configurationVersion: string;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens?: number };
  cost: { amountMicros: bigint; currency: string; estimated: boolean };
  latencyMs: number;
  safety: { outcome: 'PASS' | 'REDACTED' | 'BLOCKED'; redactionVersion: string };
  failure?: RuntimeFailure;
}
```

`ModelProviderPort` must accept an abort signal and return no SDK-specific types. The runtime validates `candidateOutput` independently. A repair invocation references the failed invocation, receives only safe validation diagnostics plus the original allowed context, and consumes a separate budget reservation.

## 9. Agent output

Each employee output is an employee-specific strict schema wrapped by:

```ts
interface AgentOutputEnvelope<TOutput> {
  contract: 'aico.agent-output';
  schemaVersion: '1.0';
  outputId: UUID;
  companyId: UUID;
  runId: UUID;
  taskId: UUID;
  attemptId: UUID;
  employeeKey: EmployeeKey;
  employeeDefinitionVersionId: UUID;
  versions: VersionSet;
  inputManifestDigest: Sha256;
  outputType: string;
  output: TOutput;
  evidenceRefs: VersionedReference[];
  conciseRationale?: string; // conclusion/evidence only; never hidden reasoning
  createdAt: Rfc3339Utc;
}
```

Validation success does not itself publish an artifact or transition state. The application service checks attempt lease, current run/task state, policy/budget, lineage, and output-specific invariants in the commit transaction.

## 10. Tool request, policy decision, and invocation

```ts
interface ToolRequest {
  requestId: UUID;
  companyId: UUID;
  runId: UUID;
  taskId: UUID;
  attemptId: UUID;
  employeeDefinitionVersionId: UUID;
  toolKey: string;
  toolVersion: string;
  action: string;
  parameters: unknown;
  parameterDigest: Sha256;
  requestedAt: Rfc3339Utc;
}

interface PolicyDecision {
  contract: 'aico.policy-decision';
  schemaVersion: '1.0';
  decisionId: UUID;
  policyVersion: string;
  companyId: UUID;
  runId: UUID;
  taskId: UUID;
  attemptId: UUID;
  actor: ActorRef;
  stage: RunStage;
  runState: RunState;
  taskState: TaskState;
  action: string;
  resource: { type: string; id?: UUID; parameterDigest: Sha256 };
  approvalRefs: UUID[];
  budgetSnapshotDigest: Sha256;
  environmentDigest: Sha256;
  contextDigest: Sha256;
  result: 'ALLOW' | 'DENY';
  reasonCode: PolicyReasonCode;
  evaluatedAt: Rfc3339Utc;
  expiresAt?: Rfc3339Utc;
}

interface ToolInvocation {
  invocationId: UUID;
  requestId: UUID;
  policyDecisionId: UUID;
  attemptId: UUID;
  logicalIdempotencyKey: string;
  status: 'REQUESTED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'UNKNOWN';
  requestDigest: Sha256;
  boundedResultRef?: VersionedReference;
  usage?: BudgetConsumption[];
  startedAt?: Rfc3339Utc;
  completedAt?: Rfc3339Utc;
}
```

`ToolGateway` checks that an `ALLOW` belongs to the same task/attempt/action/resource digest, uses the current policy version where required, and has not expired. A deny never calls the adapter. Suggested reason codes include `ROLE_FORBIDDEN`, `WRONG_STAGE`, `APPROVAL_MISSING`, `STALE_VERSION`, `RESOURCE_OUT_OF_SCOPE`, `BUDGET_UNAVAILABLE`, `ENVIRONMENT_UNSAFE`, `TENANT_MISMATCH`, and `INVALID_CONTEXT`.

## 11. Budget contracts

```ts
type BudgetCategory =
  | 'MODEL_INPUT_TOKENS' | 'MODEL_OUTPUT_TOKENS' | 'MODEL_COST_MICROS'
  | 'COMPUTE_MILLISECONDS' | 'WALL_MILLISECONDS' | 'STORAGE_BYTES'
  | 'TOOL_CALLS' | 'FILE_BYTES' | 'OUTPUT_BYTES'
  | 'TRANSIENT_RETRIES' | 'SCHEMA_REPAIRS' | 'REWORK_CYCLES';

interface BudgetSnapshot {
  version: number;
  policyVersion: string;
  currency: string;
  entries: Array<{ category: BudgetCategory; limit: bigint; reserved: bigint; consumed: bigint }>;
  digest: Sha256;
}

interface BudgetReservation {
  reservationId: UUID;
  runId: UUID;
  attemptId?: UUID;
  invocationId?: UUID;
  category: BudgetCategory;
  amount: bigint;
  state: 'RESERVED' | 'CONSUMED' | 'RELEASED';
  expiresAt?: Rfc3339Utc;
}

interface BudgetConsumption {
  category: BudgetCategory;
  amount: bigint;
  source: 'MODEL' | 'TOOL' | 'BUILD' | 'STORAGE' | 'RETRY' | 'REWORK';
  meteredAt: Rfc3339Utc;
}
```

The invariant is `consumed + reserved <= limit` for every hard-limit entry. Reservation and claim occur atomically. Reconciliation is idempotent by reservation ID. Expired reservations are released only after the associated invocation outcome is reconciled or explicitly classified unknown/blocked.

## 12. Human wait and checkpoint

```ts
interface HumanWaitCheckpoint {
  contract: 'aico.human-wait';
  schemaVersion: '1.0';
  waitId: UUID;
  requestId: UUID;
  requestVersion: number;
  companyId: UUID;
  runId: UUID;
  taskId?: UUID;
  waitType: 'CLARIFICATION' | 'BRIEF_APPROVAL' | 'DESIGN_APPROVAL' | 'FINAL_APPROVAL' | 'RECOVERY_DECISION';
  status: 'OPEN' | 'SATISFIED' | 'CANCELED';
  priorRunState: RunState;
  resumeRunState: RunState;
  responseSchema: { id: string; version: string };
  reasonCodes: string[];
  contextSnapshotId: UUID;
  versions: Omit<VersionSet, 'employeeDefinitionVersionId'>;
  openedAt: Rfc3339Utc;
  satisfiedByCommandId?: UUID;
  satisfiedAt?: Rfc3339Utc;
}
```

Only one open blocking wait is permitted per run checkpoint. Satisfying a wait and resuming is one transaction. The exact response content is stored as an immutable founder-authored version and referenced, not copied into every event.

## 13. Failure contract

```ts
type FailureClass =
  | 'TRANSIENT_PROVIDER' | 'TRANSIENT_INFRA' | 'RATE_LIMITED'
  | 'VALIDATION' | 'POLICY_DENIED' | 'BUDGET_EXHAUSTED'
  | 'FOUNDER_INPUT_REQUIRED' | 'NON_RETRYABLE_PROVIDER'
  | 'SECURITY' | 'INTEGRITY' | 'CANCELED' | 'UNKNOWN_OUTCOME';

interface RuntimeFailure {
  failureId: UUID;
  classification: FailureClass;
  reasonCode: string;
  safeMessage: string;
  retryable: boolean;
  retryAfter?: Rfc3339Utc;
  affectedStage: RunStage;
  taskId?: UUID;
  attemptId?: UUID;
  correlationId: UUID;
  providerOrToolCode?: string;
  diagnosticRef?: VersionedReference; // operations audience only
}
```

Safe messages contain no credentials, prompts, source bodies, or hidden reasoning. `UNKNOWN_OUTCOME` always requires reconciliation or a human/operator recovery decision; it is never auto-replayed for a potentially side-effecting operation.

## 14. Event and outbox contracts

```ts
interface EventEnvelope<TType extends string, TPayload> {
  contract: 'aico.event';
  schemaVersion: '1.0';
  eventId: UUID;
  eventType: TType;
  companyId: UUID;
  runId: UUID;
  runSequence: number;
  taskId?: UUID;
  attemptId?: UUID;
  artifactVersionId?: UUID;
  actor: ActorRef;
  audience: Audience[];
  correlationId: UUID;
  causationId: UUID;
  workflowVersion: string;
  occurredAt: Rfc3339Utc;
  payload: TPayload;
}

interface OutboxRecord {
  outboxId: UUID;
  eventId: UUID;
  topic: string;
  partitionKey: UUID; // runId
  payloadDigest: Sha256;
  availableAt: Rfc3339Utc;
  attempts: number;
  claimedBy?: string;
  claimExpiresAt?: Rfc3339Utc;
  deliveredAt?: Rfc3339Utc;
}
```

Required uniqueness: `event_id`, `(run_id, run_sequence)`, and `(consumer_key, event_id)` in each consumer inbox. Events are immutable. Corrections are new events. A run consumer must not apply sequence `n + 1` while `n` is missing; it defers and alerts on a persistent gap.

Representative event types:

- `run.created`, `run.transitioned`, `run.blocked`, `run.failed`, `run.canceled`, `run.completed`;
- `task.queued`, `task.ready`, `task.started`, `task.retry_scheduled`, `task.succeeded`, `task.failed`;
- `founder_input.requested`, `founder_input.received`;
- `artifact.version_published`, `approval.decided`;
- `policy.decided`, `tool.invocation_completed`, `model.invocation_completed`;
- `budget.reserved`, `budget.reconciled`, `budget.exhausted`;
- `evaluation.completed`, `rework.cycle_started`, `rework.limit_reached`.

## 15. Claim and lease contract

```ts
interface TaskLease {
  taskId: UUID;
  attemptId: UUID;
  leaseToken: UUID;
  owner: string;
  acquiredAt: Rfc3339Utc;
  expiresAt: Rfc3339Utc;
  heartbeatAt: Rfc3339Utc;
}
```

Only the current token may heartbeat or complete. Lease acquisition happens with task-state change, attempt creation, budget reservation, event, and outbox record in one transaction. External work is not performed while holding database locks. A completion transaction locks the run/task/attempt, checks the token and non-terminal run, then accepts one outcome. Stale completion is recorded for diagnostics but cannot mutate domain state.

## 16. QA and rework output

```ts
interface QaEvaluationOutput {
  evaluationId: UUID;
  cycle: 0 | 1 | 2;
  approvedBriefVersionId: UUID;
  approvedDesignVersionId: UUID;
  sourceSnapshotVersionId: UUID;
  buildResultVersionId: UUID;
  rubricVersion: string;
  evaluatorVersion: string;
  verdicts: Array<{
    criterionId: string;
    verdict: 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_APPLICABLE';
    evidence: Array<{ type: 'AUTOMATED' | 'MODEL_ASSESSMENT' | 'MANUAL'; ref: VersionedReference }>;
    note: string;
  }>;
  findings: Array<{
    findingId: UUID;
    criterionId?: string;
    checkId?: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    blocking: boolean;
    description: string;
    evidenceRefs: VersionedReference[];
    reproduction?: string;
  }>;
  recommendation: 'FINAL_READY' | 'REWORK' | 'BLOCKED';
}
```

There must be exactly one verdict for every approved acceptance criterion. Missing required evidence produces `BLOCKED`. A `FINAL_READY` recommendation is invalid while a blocking finding is unresolved. Cycle `2` with blocking findings cannot create a third automatic rework cycle.

## 17. Persistence and transaction invariants

Adapters must enforce, with database constraints where possible:

- one non-terminal Prototype Initiative per company;
- unique attempt number per task and unique task-attempt idempotency key;
- unique artifact version per artifact and immutable published content/checksum;
- unique gate decision for the exact pending version/decision command;
- one open wait per run checkpoint;
- unique run event sequence and event ID;
- one accepted task success;
- one consumer inbox row per event;
- non-negative budget values and no hard-limit oversubscription;
- tenant inheritance through run relationships and no cross-run task edge;
- terminal run immutability.

Every material mutation uses one transaction containing aggregate update, transition record, ordered event, and outbox row. If any part fails, none commits.

## 18. Minimum contract verification fixtures

1. Valid `1.0` envelopes round-trip through JSON schema and canonical hashing.
2. Unknown major, unknown field, unknown enum, missing ID/version, oversized content, or prohibited content fails before mutation.
3. A cross-company or mutable-latest context reference is rejected.
4. Every forbidden role/action pair produces a deny and no tool invocation.
5. An allow with altered parameter digest, attempt, version, or expiry is unusable.
6. Duplicate command/event/task completion converges to one logical result.
7. Concurrent budget reservations cannot exceed a hard limit.
8. Expired lease plus stale completion cannot overwrite the current attempt.
9. Worker restart can rebuild the next action from persisted checkpoint and immutable references.
10. Hidden reasoning, credentials, raw prompts/completions, source bodies, and attachment contents are absent from founder events and analytics fixtures.
11. QA rejects missing criterion coverage and a third automatic rework cycle.
12. Cancellation racing dispatch/completion yields one terminal outcome and no post-terminal work.

