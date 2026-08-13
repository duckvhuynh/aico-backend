# Policy and Exact-Version Approval Contract

- **Status:** Proposed for AICO-006; this contract becomes normative only under accepted ADR-008
- **Contract version:** 1
- **Decision scope:** deny-by-default policy evaluation and exact-version founder decisions, with GATE-01 specified completely
- **Primary traceability:** G-02, G-05; MVP-CAP-004; policy portion of MVP-CAP-011; PRD-FR-016-020 and PRD-FR-059-060; SRS TD-007; SRS-FR-021-027 and SRS-FR-085-088; AT-004-005
- **Delivery traceability:** AICO-006 decision child `aico-backend#12`; proof child `aico-backend#13`

This contract defines the backend boundary that later AICO-031 and AICO-041 implementation must satisfy. It does not register or promise a public HTTP endpoint. Existing `approvals`, `policy_decisions`, `events`, `outbox_messages`, `artifact_versions`, `runs`, `tasks`, and `idempotency_records` are reusable schema evidence, but the repository does not yet contain a production policy evaluator or founder decision service.

## 1. Normative language and trust boundary

`MUST`, `MUST NOT`, `SHOULD`, and `MAY` are normative after the governing ADR is accepted. Until then, they describe the proposed contract under review.

The trusted application constructs policy and decision inputs from authenticated identity and tenant-scoped persisted state. A caller, model, employee transcript, task payload, URL tenant value, custom header, object key, or event payload cannot assert identity, tenant membership, gate satisfaction, approval, budget, run state, or policy version.

The architecture is a NestJS feature boundary with inward-pointing dependencies:

- an interface adapter authenticates, validates a closed DTO, resolves correlation and command headers, and maps safe errors;
- an application service owns the command transaction and state transition;
- a pure, version-addressed `PolicyEvaluatorPort` returns a typed decision from a complete `PolicyInputV1`;
- tenant-scoped repositories load and lock authoritative PostgreSQL records; and
- the existing event/outbox facility appends evidence inside the caller transaction.

No provider, tool, object-store, sandbox, queue publish, email, or other external call may occur in the decision transaction.

## 2. Closed vocabulary

Version 1 accepts only the exact values below. Unknown enum values, unknown object fields, unsupported schema versions, duplicate JSON properties, invalid UUIDs, non-UTC timestamps, non-canonical digests, and implicit string/number coercion fail closed.

| Type                    | Closed v1 values                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ActorType`             | `FOUNDER`, `EMPLOYEE`, `OPERATOR`, `SYSTEM`                                                                |
| `Gate`                  | `GATE-01`, `GATE-02`, `GATE-03`                                                                            |
| `GateDecisionType`      | `APPROVE`, `REQUEST_REVISION`                                                                              |
| `PolicyEffect`          | `ALLOW`, `DENY`                                                                                            |
| `PolicyAction`          | `gate.gate-01.approve/v1`, `gate.gate-01.request-revision/v1`, `task.design.dispatch/v1`, `tool.invoke/v1` |
| `ResourceType`          | `GATE_INSTANCE`, `ARTIFACT_VERSION`, `TOOL_REQUEST`, `CONTINUATION_INTENT`                                 |
| `RunStage`              | `INTAKE`, `PRODUCT`, `DESIGN`, `BUILD`, `QA`, `FINAL`, `TERMINAL`                                          |
| `GateInstanceStatus`    | `PENDING`, `APPROVED`, `REVISION_REQUESTED`, `CANCELED`                                                    |
| `ContinuationKind`      | `START_DESIGN_FROM_BRIEF`, `REVISE_PRODUCT_BRIEF`                                                          |
| `EnvelopeSchemaVersion` | `1`                                                                                                        |

PostgreSQL stores these values as `text` plus reviewed `CHECK` constraints rather than PostgreSQL enum types, so expand-and-contract migrations can evolve a vocabulary without unsafe type replacement. Adding a value is a schema change; changing the meaning of an existing value is a breaking contract change and requires a new envelope or policy version.

### 2.1 Policy reason codes

Every decision carries one stable reason code. Reason codes are evidence, not permission. A consumer must branch on `effect`; an unknown code fails closed.

| Effect  | Closed v1 reason code                 | Meaning                                                                                            |
| ------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `ALLOW` | `FOUNDER_GATE_ALLOWED`        | Authenticated owner may make the supplied exact-version gate decision in the locked current state. |
| `ALLOW` | `PARAMETER_BOUND_TOOL_ALLOWED` | Assigned employee attempt may make this one parameter-bound tool request before expiry.            |
| `ALLOW` | `GATE_CONTINUATION_ALLOWED`   | Workflow may claim the single continuation already authorized by a committed gate decision.        |
| `DENY`  | `DEFAULT_DENY`                | No explicit versioned rule allowed the action.                                                     |
| `DENY`  | `INVALID_CONTEXT`             | A required authoritative input is absent, malformed, contradictory, or unknown.                   |
| `DENY`  | `AUTHENTICATION_REQUIRED`     | No active authenticated actor could be established.                                                |
| `DENY`  | `ACTOR_FORBIDDEN`             | The actor class or version cannot perform the action.                                              |
| `DENY`  | `TENANT_SCOPE_MISMATCH`       | Actor, run, task, attempt, or resource does not share the resolved tenant.                         |
| `DENY`  | `ASSIGNMENT_MISMATCH`         | Employee definition or attempt is not the current assigned principal.                              |
| `DENY`  | `ACTION_FORBIDDEN`            | The action key/version is not granted by the effective policy.                                    |
| `DENY`  | `RESOURCE_BINDING_MISMATCH`   | Resource identity, digest, gate, or parameters differ from the evaluated binding.                 |
| `DENY`  | `STATE_STALE`                 | Run, Gate Instance, Task, Attempt, or optimistic version is not current.                           |
| `DENY`  | `GATE_MISMATCH`               | Gate key/status/exact pending subject differs from the action schema.                              |
| `DENY`  | `RESOURCE_VERSION_STALE`      | Immutable resource/version/checksum differs from the evaluated version.                            |
| `DENY`  | `APPROVAL_MISSING`            | A required exact-version founder decision/binding is absent.                                      |
| `DENY`  | `POLICY_VERSION_UNSUPPORTED`  | Policy/action/targeting version is missing, incompatible, paused, or unsupported.                  |
| `DENY`  | `BUDGET_UNAVAILABLE`          | Required versioned budget is absent or insufficient.                                              |
| `DENY`  | `ENVIRONMENT_UNSAFE`          | Environment capability/configuration is absent, changed, killed, or incompatible.                 |
| `DENY`  | `ALLOW_EXPIRED`               | Evaluation or protected use reached the exclusive expiry boundary.                                |
| `DENY`  | `RUN_CANCELED`                | Cancellation is requested or the Run is canceled.                                                 |
| `DENY`  | `RUN_TERMINAL`                | The target Run is terminal and cannot be reopened.                                                 |

External errors expose the safe codes in section 9, not raw policy reasons when doing so could reveal a foreign resource, policy internals, or protected state. Structured audit data may retain the internal reason after applying the scoping and redaction rules in section 11.

## 3. Versioned envelopes

The TypeScript shapes below are the canonical logical schemas. Generated JSON Schema/OpenAPI/AsyncAPI artifacts may represent them differently but must preserve field names, requiredness, closed enums, tagged unions, bounds, and `additionalProperties: false`.

### 3.1 Shared primitives

```ts
type Uuid = string;
type Rfc3339Utc = string;
type Sha256Hex = string;
type PositiveInt = number;

interface EnvelopeMetaV1 {
  schema_version: 1;
  message_id: Uuid;
  correlation_id: Uuid;
  causation_id: Uuid | null;
  occurred_at: Rfc3339Utc;
}
```

`Sha256Hex` is exactly 64 lowercase hexadecimal characters over canonical JSON encoded as UTF-8. Canonicalization sorts object keys, preserves array order, rejects non-finite numbers, normalizes timestamps to RFC 3339 UTC, and never includes credentials or raw secret material.

### 3.2 `PolicyInputV1`

```ts
interface PolicyInputV1 {
  meta: EnvelopeMetaV1;
  policy_input_schema: 'policy-input/v1';
  policy_request_id: Uuid;
  evaluation_time: Rfc3339Utc;
  policy: {
    version_id: Uuid;
    semantic_version: string;
    digest: Sha256Hex;
    targeting_version_id: Uuid;
    targeting_state: 'ACTIVE' | 'PAUSED' | 'DENY_ALL' | 'ROLLED_BACK';
  };
  actor: {
    type: 'FOUNDER' | 'EMPLOYEE' | 'OPERATOR' | 'SYSTEM';
    id: Uuid | string;
    version: string | null;
    authentication_context_id: Uuid | null;
    authenticated_at: Rfc3339Utc | null;
    authentication_strength: string | null;
    revocation_version: PositiveInt | null;
  };
  company: {
    id: Uuid;
    status: 'ACTIVE' | 'DELETING' | 'DELETED';
    founder_id: Uuid;
  };
  run: {
    id: Uuid;
    state: string;
    stage: 'INTAKE' | 'PRODUCT' | 'DESIGN' | 'BUILD' | 'QA' | 'FINAL' | 'TERMINAL';
    row_version: PositiveInt;
    workflow_version: string;
    policy_version: string;
    cancellation_requested_at: Rfc3339Utc | null;
    operator_kill_version: PositiveInt;
  };
  task: {
    id: Uuid;
    state: string;
    row_version: PositiveInt;
    employee_definition_id: Uuid | null;
  } | null;
  attempt: {
    id: Uuid;
    number: PositiveInt;
    status: string;
    lease_token_digest: Sha256Hex | null;
    lease_expires_at: Rfc3339Utc | null;
  } | null;
  action: {
    key:
      | 'gate.gate-01.approve/v1'
      | 'gate.gate-01.request-revision/v1'
      | 'task.design.dispatch/v1'
      | 'tool.invoke/v1';
    parameters_digest: Sha256Hex;
  };
  resource: {
    type: 'GATE_INSTANCE' | 'ARTIFACT_VERSION' | 'TOOL_REQUEST' | 'CONTINUATION_INTENT';
    id: Uuid | string;
    version: PositiveInt | string;
    company_id: Uuid;
    run_id: Uuid;
    digest: Sha256Hex;
  };
  gate: {
    id: 'GATE-01' | 'GATE-02' | 'GATE-03';
    gate_instance_id: Uuid;
    gate_instance_status: 'PENDING' | 'APPROVED' | 'REVISION_REQUESTED' | 'CANCELED';
    gate_instance_row_version: PositiveInt;
    artifact_id: Uuid;
    artifact_version_id: Uuid;
    artifact_version: PositiveInt;
    artifact_checksum: Sha256Hex;
  } | null;
  approval_references: Array<{
    approval_id: Uuid;
    gate: 'GATE-01' | 'GATE-02' | 'GATE-03';
    artifact_version_id: Uuid;
    decision: 'APPROVE' | 'REQUEST_REVISION';
  }>;
  budget:
    | {
        applicability: 'NOT_APPLICABLE';
        policy_version: string;
        snapshot_digest: Sha256Hex;
      }
    | {
        applicability: 'REQUIRED';
        policy_version: string;
        ledger_row_version: PositiveInt;
        category: string;
        hard_limit: number;
        reserved: number;
        consumed: number;
        requested: number;
        snapshot_digest: Sha256Hex;
      };
  environment: {
    application_version: string;
    deployment_environment: 'LOCAL' | 'TEST' | 'STAGING' | 'PRODUCTION';
    provider: string | null;
    tool_key: string | null;
    tool_version: string | null;
    network_mode: string | null;
    digest: Sha256Hex;
  };
}
```

Authoritative sources are fixed:

| Field family                | Authoritative source                                                            | Prohibited source                                   |
| --------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| actor/authentication        | Verified identity adapter and server request context                            | Body, model claim, employee output, tenant header   |
| company/founder             | Active server-side subject-to-Founder-to-Company lookup                         | Path/body/query company ID                          |
| run/task/attempt            | Tenant-scoped PostgreSQL rows, locked for a material command                    | Task payload alone, queue metadata, cache           |
| stage/state/versions/cancel | Current locked rows and immutable version registry                              | Client display state, event arrival, "latest" alias |
| resource/gate/approval      | Tenant/run-bound rows and checksums                                             | Caller-supplied artifact content or approval flag   |
| action/parameters           | Typed application command or allowlisted tool descriptor after canonicalization | Free-form prose, prompt, generated code             |
| budget                      | Locked budget ledger and versioned budget rule                                  | Caller estimate, provider estimate alone            |
| environment                 | Trusted configuration and adapter registry                                      | Tool/model-requested capability                     |

Missing, contradictory, unsupported, or invalid authoritative input returns `DENY`. An `ALLOW` is valid only for the complete input digest; it is not a user, employee, session, role, run, or tool-wide grant.

The actor/employee version is mandatory wherever the actor has a versioned definition. A Founder uses the verified identity/authentication version applicable to the credential adapter; an Employee uses the exact immutable Employee Definition version assigned to the current Task/Attempt. It is never inferred from a role name or request payload.

### 3.3 `PolicyDecisionV1`

```ts
interface PolicyDecisionV1 {
  meta: EnvelopeMetaV1;
  policy_decision_schema: 'policy-decision/v1';
  policy_decision_id: Uuid;
  policy_request_id: Uuid;
  policy_input_digest: Sha256Hex;
  policy_version_id: Uuid;
  policy_version: string;
  policy_digest: Sha256Hex;
  policy_targeting_version_id: Uuid;
  effect: 'ALLOW' | 'DENY';
  reason_code:
    | 'FOUNDER_GATE_ALLOWED'
    | 'PARAMETER_BOUND_TOOL_ALLOWED'
    | 'GATE_CONTINUATION_ALLOWED'
    | 'DEFAULT_DENY'
    | 'INVALID_CONTEXT'
    | 'AUTHENTICATION_REQUIRED'
    | 'ACTOR_FORBIDDEN'
    | 'TENANT_SCOPE_MISMATCH'
    | 'ASSIGNMENT_MISMATCH'
    | 'ACTION_FORBIDDEN'
    | 'RESOURCE_BINDING_MISMATCH'
    | 'STATE_STALE'
    | 'GATE_MISMATCH'
    | 'RESOURCE_VERSION_STALE'
    | 'APPROVAL_MISSING'
    | 'POLICY_VERSION_UNSUPPORTED'
    | 'BUDGET_UNAVAILABLE'
    | 'ENVIRONMENT_UNSAFE'
    | 'ALLOW_EXPIRED'
    | 'RUN_CANCELED'
    | 'RUN_TERMINAL';
  binding: {
    actor_type: 'FOUNDER' | 'EMPLOYEE' | 'OPERATOR' | 'SYSTEM';
    actor_id: Uuid | string;
    actor_version: string | null;
    company_id: Uuid;
    run_id: Uuid;
    task_id: Uuid | null;
    attempt_id: Uuid | null;
    action:
      | 'gate.gate-01.approve/v1'
      | 'gate.gate-01.request-revision/v1'
      | 'task.design.dispatch/v1'
      | 'tool.invoke/v1';
    parameters_digest: Sha256Hex;
    resource_type: 'GATE_INSTANCE' | 'ARTIFACT_VERSION' | 'TOOL_REQUEST' | 'CONTINUATION_INTENT';
    resource_id: Uuid | string;
    resource_version: PositiveInt | string;
    resource_digest: Sha256Hex;
    run_state: string;
    run_stage: 'INTAKE' | 'PRODUCT' | 'DESIGN' | 'BUILD' | 'QA' | 'FINAL' | 'TERMINAL';
    run_row_version: PositiveInt;
    task_state: string | null;
    gate: 'GATE-01' | 'GATE-02' | 'GATE-03' | null;
    gate_instance_id: Uuid | null;
    gate_instance_row_version: PositiveInt | null;
    artifact_version_id: Uuid | null;
    approval_references_digest: Sha256Hex;
    budget_digest: Sha256Hex | null;
    environment_digest: Sha256Hex;
    workflow_version: string;
    policy_targeting_version_id: Uuid;
    maximum_uses: PositiveInt;
  };
  issued_at: Rfc3339Utc;
  expires_at: Rfc3339Utc | null;
}
```

An `ALLOW` MUST have `expires_at > issued_at`, MUST use the policy-version maximum lifetime, and MUST be revalidated against its complete binding immediately before its authorized effect. The GATE-01 command consumes its `ALLOW` within the same short database transaction; it cannot be carried into a later request. A `DENY` has `expires_at=null` and authorizes nothing.

Policy decisions are immutable and append-only. A later policy version does not rewrite prior evidence. A tool invocation may reference only a current `ALLOW` whose actor, tenant, run, task, attempt, action, resource, parameters, policy version, and expiry all match exactly.

### 3.4 `DecisionCommandV1`

Authentication and tenant are deliberately absent from the caller-controlled command. The adapter combines this body with the verified request context and headers.

```ts
interface DecisionCommandV1 {
  command_schema: 'founder-decision-command/v1';
  command_id: Uuid;
  run_id: Uuid;
  expected: {
    run_row_version: PositiveInt;
    run_state: 'AWAITING_BRIEF_APPROVAL';
    run_stage: 'PRODUCT';
    gate: 'GATE-01';
    gate_instance_id: Uuid;
    gate_instance_row_version: PositiveInt;
    artifact_id: Uuid;
    artifact_version_id: Uuid;
    artifact_version: PositiveInt;
    artifact_checksum: Sha256Hex;
  };
  decision: ApprovalV1 | RevisionDecisionV1;
}

interface ApprovalV1 {
  decision_schema: 'approval/v1';
  type: 'APPROVE';
  feedback: string | null;
}

interface RevisionDecisionV1 {
  decision_schema: 'revision-decision/v1';
  type: 'REQUEST_REVISION';
  feedback: string;
}
```

`RevisionDecisionV1.feedback` is required after Unicode trimming and has a versioned minimum/maximum length. `ApprovalV1.feedback` is optional and cannot contain executable instructions. The server persists feedback as founder-authored product evidence, but it never treats the text as authorization or executes it directly. A later PM revision task receives a bounded reference to the immutable decision, not an untrusted instruction injected into a privileged context.

The future transport adapter MUST require:

- an active Founder credential;
- `Idempotency-Key` as a UUID;
- `If-Match: "<run_row_version>"`, equal to `expected.run_row_version`; and
- optional `X-Correlation-Id` as a UUID, generated when absent.

The adapter MUST reject a body `company_id`, `founder_id`, `actor`, `policy_result`, `approved`, `current`, `latest`, `continuation`, or arbitrary downstream-task specification.

### 3.5 `DecisionReceiptV1`

```ts
interface DecisionReceiptV1 {
  receipt_schema: 'founder-decision-receipt/v1';
  command_id: Uuid;
  decision_record_id: Uuid;
  policy_decision_id: Uuid;
  event_id: Uuid;
  company_id: Uuid;
  run_id: Uuid;
  gate: 'GATE-01';
  gate_instance_id: Uuid;
  resulting_gate_instance_status: 'APPROVED' | 'REVISION_REQUESTED';
  artifact_version_id: Uuid;
  artifact_version: PositiveInt;
  artifact_checksum: Sha256Hex;
  decision: 'APPROVE' | 'REQUEST_REVISION';
  prior_run_state: 'AWAITING_BRIEF_APPROVAL';
  resulting_run_state: 'DESIGNING' | 'QUALIFYING';
  resulting_run_stage: 'DESIGN' | 'PRODUCT';
  resulting_run_row_version: PositiveInt;
  approved_artifact_binding_id: Uuid | null;
  continuation: {
    kind: 'START_DESIGN_FROM_BRIEF' | 'REVISE_PRODUCT_BRIEF';
    continuation_intent_id: Uuid;
  };
  decided_at: Rfc3339Utc;
  correlation_id: Uuid;
  replayed: boolean;
}
```

The receipt acknowledges committed state only. It does not claim the continuation ran, a Designer or PM produced output, an outbox consumer published, or a later gate passed. Replaying a completed command returns the original safe receipt and status with `replayed=true`; all persisted IDs, timestamps, versions, and the original correlation ID remain unchanged.

## 4. Exact GATE-01 invariants

GATE-01 binds one qualified goal/run to one immutable Product Brief version. These invariants are conjunctive; failure of any invariant denies the command.

### 4.1 Common preconditions

1. The verified actor is an active `FOUNDER` and the server-resolved Company row is active.
2. `companies.founder_id` equals the verified Founder ID. The relationship is checked through `(company_id, founder_id)`, not a bearer claim alone.
3. The tenant-scoped Run exists, is locked, has state `AWAITING_BRIEF_APPROVAL`, stage `PRODUCT`, the expected row version, and no cancellation request.
4. The Run is not `BLOCKED`, `FAILED`, `CANCELED`, `COMPLETED`, or otherwise terminal, and its pinned workflow/policy versions are supported.
5. The tenant/run-scoped Gate Instance exists and is locked. It is `PENDING`, is `GATE-01`, has the expected row version/source state, and names one exact Product Brief Artifact and Artifact Version.
6. The tenant/run-scoped Artifact and Artifact Version exist and are read through composite Company/Run ownership. Their type/schema/checksum/lineage are valid and immutable.
7. The exact Gate Instance, Artifact ID, Artifact Version ID, integer version, checksum, Company, and Run equal the command and the version rendered for review. No `latest` lookup or mutable artifact pointer may substitute another version.
8. No Founder Gate Decision or approved `PRODUCT_BRIEF` binding already exists for the Gate Instance except the same completed idempotent command.
9. The effective Policy Targeting Version and compatible Policy Version are locked/resolved for the environment; the `PolicyInputV1` action key matches the tagged decision and the evaluator returns an unexpired `FOUNDER_GATE_ALLOWED` binding the complete input with maximum use one.
10. `If-Match`, the command's expected Run row version, and the locked Run row version are equal. The command's expected Gate Instance row version also equals the locked Gate Instance row version.

Missing or foreign resources are non-disclosing. A stale same-tenant version, checksum, gate, state, or ETag is a precondition failure. Neither case may fall back to a newer artifact or infer approval from artifact state, event history, or model output.

### 4.2 `APPROVE` effect

In one transaction, `APPROVE` MUST:

- insert one immutable Founder Gate Decision carrying `ApprovalV1`, bound to Founder, Company, Run, Gate Instance, GATE-01, exact Artifact Version, command digest, idempotency key, and the consumed `PolicyDecisionV1`;
- transition only the Gate Instance from `PENDING` to `APPROVED`; the Artifact Version content, checksum, schema, creator, lifecycle, version, and lineage remain immutable;
- insert one immutable `PRODUCT_BRIEF` approved-artifact binding from this Run/Gate/Founder Gate Decision to the exact Artifact Version;
- transition the Run exactly once from `AWAITING_BRIEF_APPROVAL/PRODUCT` to `DESIGNING/DESIGN` and increment its row version;
- insert exactly one `START_DESIGN_FROM_BRIEF` continuation intent whose inputs reference the approved binding, exact Artifact Version ID, and frozen context versions; and
- append one ordered, audience-safe `gate_approved` event that references both decisions, plus its transactional outbox row.

Only this committed path can make Designer work eligible. A Designer task must resolve the exact approved Product Brief ID from the decision/continuation record, never `artifacts.current_version_id` or a mutable alias at dispatch time.

### 4.3 `REQUEST_REVISION` effect

In one transaction, `REQUEST_REVISION` MUST:

- insert one immutable Founder Gate Decision carrying `RevisionDecisionV1`, with bounded classified founder feedback and the same Gate Instance/exact-version bindings;
- transition only the Gate Instance from `PENDING` to `REVISION_REQUESTED`; preserve the reviewed Artifact Version content, lifecycle, checksum, lineage, and decision forever;
- transition the Run exactly once from `AWAITING_BRIEF_APPROVAL/PRODUCT` to `QUALIFYING/PRODUCT` and increment its row version;
- insert exactly one `REVISE_PRODUCT_BRIEF` continuation intent referencing the retained reviewed version, feedback, and Founder Gate Decision; and
- append one ordered, audience-safe `gate_revision_requested` event and its transactional outbox row.

No Designer continuation is created. The Product Brief version increments only when the PM publishes a new immutable version; requesting revision does not pre-create, overwrite, or renumber artifact content.

## 5. Atomic PostgreSQL transaction

The application service uses one short PostgreSQL `READ COMMITTED` transaction with explicit row locks, optimistic Run/Gate Instance versions, and unique constraints. This is deliberately more specific than the reusable `CommandExecutor`'s current `SERIALIZABLE` wrapper: AICO-041 may adapt that helper or introduce a `DecisionUnitOfWorkPort`, but it must preserve the lock order and invariant checks below. Isolation level alone does not express the business invariant.

The fixed lock/write order is:

1. Canonicalize the typed command plus parsed `If-Match`; compute the stable business-command digest. Exclude correlation/retry transport metadata from the digest.
2. Insert-or-load the tenant/actor/operation/idempotency record and lock it. If completed with the same digest, return its original receipt before evaluating stale post-success state. A different digest returns `409 idempotency_key_reused`.
3. Lock the authenticated session/Founder authority and server-resolved Founder-to-Company ownership rows.
4. Lock the effective Policy Targeting row/version, including emergency pause/deny/kill state.
5. Lock the tenant-scoped Run with `SELECT ... FOR UPDATE`.
6. Lock the exact Gate Instance and read its immutable Artifact/Artifact Version through composite Company/Run keys.
7. Lock the affected approved-binding/continuation logical key when present; then recheck all GATE-01 preconditions, cancellation/kill/revocation, uniqueness, supported workflow/policy/action versions, and expected Run/Gate Instance versions.
8. Construct and evaluate `PolicyInputV1` using database evaluation time. Immediately before mutation, recheck the `ALLOW` binding, effective targeting, maximum-use one, and `clock_timestamp() < expires_at`.
9. Insert immutable `PolicyDecisionV1` and Founder Gate Decision records. For `APPROVE`, insert the exact `PRODUCT_BRIEF` binding; for either outcome, apply only the legal Gate Instance/Run transitions using expected state and row version in each `WHERE` clause. Affected-row count other than one aborts.
10. Insert one unique `ContinuationIntent`; never claim or execute it inside this transaction.
11. Lock/advance the per-Run event counter, insert the decision-specific ordered event, and insert its outbox row.
12. Store the complete safe `DecisionReceiptV1` and status in the idempotency record, mark it completed, and commit.

Any exception rolls back the policy `ALLOW`, Founder Gate Decision, Gate Instance/Run transition, approved binding, continuation intent, event, outbox, and receipt together. No external call occurs before or during commit. A publisher processes the outbox only after commit and consumers deduplicate by `event_id`.

### 5.1 Unique continuation invariant

The task or durable intent uses a deterministic key:

```text
gate:v1:<company_id>:<run_id>:GATE-01:<artifact_version_id>:<decision_type>
```

There is one database uniqueness constraint for that key in tenant/run scope. The `APPROVE` key can produce only `START_DESIGN_FROM_BRIEF`; the `REQUEST_REVISION` key can produce only `REVISE_PRODUCT_BRIEF`. A worker restart, outbox replay, duplicate event, different worker, or alternate idempotency key cannot create a second logical continuation.

## 6. Idempotency, correlation, and concurrency

### 6.1 Stable-business-command idempotency

The idempotency scope is `(company_id, actor_id, operation, idempotency_key)`. The stable digest includes:

- command schema and command ID;
- run ID;
- expected state, stage, gate, Run row version, exact Artifact Version ID/version/checksum;
- tagged decision type and normalized feedback; and
- parsed `If-Match` value.

It excludes authorization credentials, request arrival time, trace/span IDs, retry count, network address, and correlation ID. The first committed execution fixes the response status, receipt, and correlation ID.

| Case                                              | Result                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Same key + same digest, first request committed   | Return original receipt/status with `replayed=true`; create no row/event/task.   |
| Same key + same digest, concurrent request        | Wait on the idempotency row; winner commits; loser returns winner's receipt.     |
| Same key + different digest                       | `409 idempotency_key_reused`; zero decision or continuation effect.              |
| Different key after exact version already decided | `409 decision_already_recorded`; never create a second decision or continuation. |
| Crash before commit                               | Entire transaction rolls back; retry may execute normally.                       |
| Crash after commit but before response            | Retry returns the committed receipt from PostgreSQL.                             |

An incoming correlation ID identifies the first attempt. On replay, the response exposes the original correlation ID so persisted receipt, decision, event, and outbox lineage remain stable. A replay request may have its own transport trace linked with `replay_of_correlation_id`, but this link is diagnostic only and never changes domain evidence.

### 6.2 Optimistic and pessimistic concurrency

`If-Match` is mandatory even though rows are locked. It proves which reviewed Run representation the founder acted on; the row lock serializes writers. The conditional update and unique decision/continuation constraints are the final correctness boundary.

Two different valid decisions racing for the same exact version produce one winner. The loser observes the committed state/unique key and returns a safe conflict or precondition failure with no additional domain write. PostgreSQL deadlock/serialization failures use bounded jittered retry inside the application service only while the original command deadline remains; the same idempotency key is retained.

## 7. Denial and zero-unauthorized-effect contract

A denied or invalid founder decision produces none of the following:

- Approval or RevisionDecision row;
- Artifact Version lifecycle/content change;
- Run/task/attempt/budget mutation;
- continuation or revision task;
- business-success event or outbox message;
- provider, tool, sandbox, object-store, notification, analytics, or other external call; or
- cost reservation/consumption.

Safe request logs, traces, rate-limit counters, and low-cardinality denial metrics are diagnostic evidence, not business effects. They cannot contain foreign resource identity or sensitive command/feedback content.

### 7.1 SRS-FR-087 denial-audit exception

For a schema-valid privileged employee tool request with a safely established authenticated employee, own Company, Run, Task, and Attempt, a policy `DENY` MUST atomically create exactly:

1. one immutable, actor-tenant-scoped, redacted `PolicyDecisionV1` with the internal reason code;
2. one linked ordered `policy_decision_recorded` denial event; and
3. one transactional outbox row for that event.

This is the only permitted durable exception to zero unauthorized business/external effect. It MUST NOT create a `tool_invocations` row, call the tool/provider, reserve or consume budget, mutate business/run/task state, create a continuation, disclose the target, or emit a business-success event. The denial audit uses a stable `policy_request_id` so replay creates the same logical evidence once.

If authenticated own-tenant/run/task scope cannot be established safely, no tenant/run row may be guessed or written. The request is rejected at the authentication/validation boundary and only redacted security telemetry is emitted. A forged cross-tenant target on an otherwise valid own-tenant employee request is audited against the employee's own scope with categorical/digested resource data; foreign IDs or existence are never persisted in an audience-visible payload.

## 8. Restart, replay, expiry, cancellation, and evolution

### Restart and replay

- PostgreSQL is the only source of pending/decided gate truth. Process memory, queue delivery, browser state, and logs are non-authoritative.
- Before commit, replacement processes see no partial decision. After commit, they reconstruct the receipt and unique continuation from rows.
- Event/outbox delivery is at least once; the event ID, decision ID, and continuation key make consumers replay-safe.
- A worker must re-read the committed Approval, exact Artifact Version, Run state, task eligibility, pinned versions, and cancellation state before claiming continuation work.

### Expiry

- Policy `ALLOW` lifetime is short, explicit, and policy-versioned. It is checked at action time and immediately before mutation.
- Expired `ALLOW` is `DENY_EXPIRED`; no decision may proceed by refreshing only its timestamp. A new complete policy evaluation is required.
- Founder Approval and RevisionDecision records do not expire. They remain historical facts tied to exact versions. A later action may still deny their use if the Run, gate, workflow, policy, or artifact binding is no longer current.

### Cancellation and terminal state

- `cancellation_requested_at` or `CANCELED` produces `DENY_CANCELED`; `FAILED` or `COMPLETED` produces `DENY_TERMINAL`.
- Cancel wins if it commits before the decision lock/check. A decision that commits first may create its continuation, but a later cancel prevents claim/dispatch and cannot delete the historical decision.
- Late policy results, HTTP retries, worker results, or outbox replays cannot reopen a canceled/terminal Run or make a continuation eligible.

### Versioning and rollback

- Runs pin `workflow_version` and `policy_version`; policy evaluation resolves those exact versions and never silently upgrades to `latest`.
- Envelopes carry schema version 1. Readers retain adapters for supported historical versions; writers emit only the active reviewed version.
- New optional output fields require compatibility tests. New required fields, enum meaning changes, reason-code semantic changes, or transition changes require a new schema/policy version and migration plan.
- Expand-and-contract deployment adds nullable/new tables and dual-read compatibility before enforcing new constraints. Backfill is tenant-scoped, restartable, checksummed, and reconciled before cutover.
- Rollback may use the prior application only while it can safely read all written schema/envelope versions. Otherwise startup/readiness fails closed; accepted decisions are never downgraded, rewritten, or deleted.

## 9. HTTP and internal behavior

This contract does not create a route. If AICO-041 later exposes a Founder transport, it MUST use the existing `/api/v1`, authentication guard, DTO validation, command headers, Problem Details filter, and correlation middleware conventions. Internal callers use the same application command and cannot bypass authentication/authorization by calling repositories directly.

The internal port is logically:

```ts
interface FounderDecisionUseCase {
  execute(input: {
    actor_context: VerifiedFounderContext;
    command: DecisionCommandV1;
    idempotency_key: Uuid;
    if_match_run_version: PositiveInt;
    correlation_id: Uuid;
  }): Promise<DecisionReceiptV1>;
}
```

Controllers, worker handlers, and tests depend on this port. Only the application service opens the transaction. Repository methods require an explicit transactional context and tenant scope.

| Status | Stable external code                                                                           | Safe behavior                                                                                                                                         |
| -----: | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
|  `400` | `validation_failed`, `malformed_json`, `unsupported_schema_version`                            | Reject malformed/unknown fields, bad UUID/digest/feedback bounds, inconsistent body/header; no persistence.                                           |
|  `401` | `authentication_required`, `session_expired`, `session_revoked`                                | No active verified actor; no tenant/domain write.                                                                                                     |
|  `403` | `action_denied`                                                                                | Known actor class cannot perform founder decisions, when this reveals no protected resource. Employee/operator/direct-repository attempts are denied. |
|  `404` | `resource_not_found`                                                                           | Run/artifact/version is missing or foreign to the resolved Company; identical response prevents existence disclosure.                                 |
|  `409` | `idempotency_key_reused`, `command_in_progress`, `decision_already_recorded`, `state_conflict` | Mutually exclusive/concurrent state or changed idempotent payload; no second decision/effect.                                                         |
|  `412` | `precondition_required`, `precondition_failed`                                                 | Missing/mismatched `If-Match`, or same-tenant expected state/stage/gate/artifact version/checksum is stale. Client must refresh.                      |

Error bodies use `application/problem+json`, carry the correlation/trace ID and safe remediation, and never expose foreign IDs, policy internals, SQL, credentials, raw feedback, artifact bodies, prompts/completions, hidden reasoning, or stack traces. A failure response never implies that an approval, denial audit, event, or continuation was committed unless its documented idempotent receipt says so.

## 10. PostgreSQL schema, constraints, and indexes

The existing migration is a partial starting point, not proof of this contract. AICO-031/AICO-041 migrations SHOULD evolve it with reviewed expand-and-contract changes. Production must not use ORM auto-sync.

### 10.1 Required record properties

- Primary/public IDs are UUIDs.
- All tenant-owned tables carry `company_id` and `UNIQUE (company_id, id)`.
- Cross-record ownership uses composite tenant foreign keys, including Company/Run/Artifact Version, Run/Task/Attempt, and Company/Founder ownership.
- Timestamps use `timestamptz`; database-generated `decided_at`, `issued_at`, `occurred_at`, and receipt times share the transaction clock.
- Immutable evidence tables expose insert/read repository methods only. Standard application roles cannot update/delete decisions, policy decisions, events, or committed receipts.
- Runtime login roles do not own schemas or tables. A no-login owner role owns DDL; a narrowly privileged gate-writer routine/role is the only path that can insert a founder decision and perform its coupled Run, Artifact Version, continuation, event, and outbox writes. The ordinary API/worker roles receive no independent `INSERT`/`UPDATE`/`DELETE` grants that could assemble a partial gate success outside that path.
- Closed values use `text` plus `CHECK`; integer versions use positive checks; JSON envelopes use `jsonb` plus schema validation before insert.
- SHA-256 digests use `text CHECK (value ~ '^[0-9a-f]{64}$')`.

### 10.2 Constraint recommendations

The target migration must provide equivalent constraints to:

```sql
-- Enables an exact tenant + run + artifact-version FK.
ALTER TABLE artifact_versions
  ADD CONSTRAINT artifact_versions_company_run_id_uq
  UNIQUE (company_id, run_id, id);

-- Approval rows remain append-only and bind the complete founder decision.
ALTER TABLE approvals
  ADD COLUMN schema_version integer NOT NULL DEFAULT 1,
  ADD COLUMN command_id uuid,
  ADD COLUMN policy_decision_id uuid,
  ADD COLUMN expected_run_version integer,
  ADD COLUMN command_digest text,
  ADD COLUMN correlation_id uuid,
  ADD CONSTRAINT approvals_schema_v1_ck CHECK (schema_version = 1),
  ADD CONSTRAINT approvals_gate_ck CHECK (gate IN ('GATE-01', 'GATE-02', 'GATE-03')),
  ADD CONSTRAINT approvals_digest_ck CHECK (command_digest ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT approvals_company_founder_fk
    FOREIGN KEY (company_id, actor_id) REFERENCES companies(id, founder_id),
  ADD CONSTRAINT approvals_company_run_artifact_fk
    FOREIGN KEY (company_id, run_id, artifact_version_id)
    REFERENCES artifact_versions(company_id, run_id, id),
  ADD CONSTRAINT approvals_policy_fk
    FOREIGN KEY (company_id, policy_decision_id)
    REFERENCES policy_decisions(company_id, id),
  ADD CONSTRAINT approvals_exact_decision_uq
    UNIQUE (company_id, run_id, gate, artifact_version_id),
  ADD CONSTRAINT approvals_command_uq UNIQUE (company_id, command_id);

-- Idempotency is explicit in tenant scope and retains the original receipt.
ALTER TABLE idempotency_records
  ADD COLUMN company_id uuid,
  ADD COLUMN correlation_id uuid,
  ADD CONSTRAINT idempotency_company_actor_fk
    FOREIGN KEY (company_id, actor_id) REFERENCES companies(id, founder_id);

-- The final migration replaces the legacy uniqueness constraint only after backfill.
CREATE UNIQUE INDEX idempotency_company_operation_key_uq
  ON idempotency_records(company_id, actor_id, operation, idempotency_key);

-- A continuation key is unique for a run and is created in the decision transaction.
ALTER TABLE tasks ADD COLUMN continuation_key text;
CREATE UNIQUE INDEX tasks_gate_continuation_uq
  ON tasks(company_id, run_id, continuation_key)
  WHERE continuation_key IS NOT NULL;
```

Migration SQL must add new columns nullable, backfill/reconcile, validate foreign keys, then apply `NOT NULL`; the illustrative single statements above are target constraints, not a safe deployment sequence. The final schema also requires:

- `policy_decisions.schema_version`, `policy_request_id`, `policy_input_digest`, `parameters_digest`, typed resource identity/version, binding columns, `issued_at`, and expiry/effect checks;
- unique `(company_id, policy_request_id)` to make SRS-FR-087 denial audit replay-safe;
- composite FKs from PolicyDecision to Run, optional Task, and optional Attempt;
- a constraint that `ALLOW` has non-null future `expires_at`, while `DENY` has null `expires_at`;
- a tagged decision/feedback check: `REQUEST_REVISION` requires bounded nonblank feedback;
- conditional state updates or database constraints preventing a second GATE-01 effect; and
- event causation linking to the decision or PolicyDecision, with outbox uniqueness already enforced by `outbox_messages.event_id`.

The privileged gate-writer surface is not an alternate public API and cannot authenticate a Founder by itself. The NestJS application still verifies identity and resolves Company authority before invoking it. Its database signature accepts only the already validated closed command fields, expected row version, idempotency scope, and correlation context; internally it re-resolves tenant ownership, takes the locks, evaluates/calls only the pinned deterministic policy function or consumes an equivalently transaction-local result, and emits the receipt. Migration/superuser credentials are never available to API or worker processes. Direct-DML negative tests run with the actual runtime roles and must fail; testing with a superuser does not prove the boundary.

### 10.3 Index recommendations

Indexes serve known authorization/audit paths and must be confirmed with `EXPLAIN (ANALYZE, BUFFERS)` against representative data:

```sql
CREATE INDEX approvals_run_gate_history_idx
  ON approvals(company_id, run_id, gate, created_at DESC, id DESC);

CREATE INDEX policy_decisions_run_time_idx
  ON policy_decisions(company_id, run_id, occurred_at DESC, id DESC);

CREATE INDEX policy_decisions_action_result_idx
  ON policy_decisions(company_id, action, result, occurred_at DESC, id DESC);

CREATE INDEX artifact_versions_pending_gate_idx
  ON artifact_versions(company_id, run_id, lifecycle_state, created_at DESC, id DESC)
  WHERE lifecycle_state = 'PENDING_APPROVAL';
```

Do not index raw feedback or whole policy JSON for speculative search. Avoid an index already covered by a unique constraint. Retention/deletion of decision evidence follows the accepted retention mechanism; no final duration is invented here.

## 11. Observability, audit, and redaction

Every committed success carries the same `correlation_id` through receipt, PolicyDecision, founder decision, ordered event, outbox envelope, and continuation input. `causation_id` points to the command/decision that directly caused the record. Worker processing adds task/attempt IDs without changing original lineage.

Structured logs/traces MAY include allowlisted:

- environment and application/policy/workflow/schema versions;
- actor type, action, gate, effect, safe reason family, replay flag, and HTTP status;
- correlation/causation, Run, Task, Attempt, decision, and event UUIDs when authorized for internal operations; and
- duration, lock retry count, outbox lag, and affected-row count.

They MUST NOT include bearer/session material, auth subject, raw policy input, raw parameters, artifact/attachment content, founder feedback, prompts/completions, hidden reasoning, object keys, tool credentials, source bodies, cross-tenant target IDs, SQL parameters, or stack traces in client output. High-sensitivity internal identifiers are access-controlled and removed from analytics payloads.

Required low-cardinality measures include:

- `policy_decision_total{action,effect,reason_family,policy_version}`;
- `founder_gate_decision_total{gate,decision,schema_version}`;
- `founder_gate_decision_duration_seconds{gate,outcome}`;
- `founder_gate_idempotency_replay_total{operation}`;
- `founder_gate_conflict_total{gate,conflict_family}`;
- `gate_continuation_created_total{gate,kind}`; and
- `outbox_publish_lag_seconds{topic}`.

Company, Founder, Run, Artifact, command, decision, event, correlation, and idempotency values are never metric labels. Alerts concern symptom rates, stuck outbox/continuations, denial anomalies, invariant violations, and decision latency; they do not infer readiness from request success alone.

## 12. Stable AICO-006 evidence mapping

| Evidence ID     | Contract obligation                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `A6-INPUT-01`   | Sections 2-3 define closed/versioned inputs, authoritative sources, canonical digest, validation, and default-deny behavior.                                                            |
| `A6-ALLOW-01`   | Sections 2-4 bind each `ALLOW` to actor/version, tenant, action, parameters, resource/version/digest, attempt, gate/artifact, workflow/policy version, environment, budget, and expiry. |
| `A6-TX-01`      | Sections 4-5 define the fixed PostgreSQL lock/write/event/outbox/continuation transaction and rollback boundary.                                                                        |
| `A6-REPLAY-01`  | Sections 5-6 and 8 define stable-business-command idempotency, concurrency, crash/restart replay, and one logical continuation.                                                         |
| `A6-DENY-01`    | Sections 2, 4, 7, and 9 define closed denial reasons, non-disclosing errors, stale/cross-tenant/canceled/terminal denial, and zero unauthorized effects.                                |
| `A6-AUDIT-01`   | Section 7.1 defines exactly one scoped/redacted PolicyDecision plus linked denial event/outbox under SRS-FR-087 and prohibits tool/business effects.                                    |
| `A6-RESTART-01` | Section 8 binds recovery to PostgreSQL truth and prevents duplicate continuation after process replacement.                                                                             |
| `A6-VERSION-01` | Sections 2-3 and 8 define pinned policy/workflow/schema versions, historical readability, expand-and-contract evolution, and fail-closed rollback.                                      |
| `A6-TRACE-01`   | This section maps the stable evidence IDs used by `AICO_006_EVIDENCE.md` and the structural validator.                                                                                  |

`A6-ADR-01`, `A6-AEO-01-12`, and `A6-VERIFY-01` are supplied by their respective architecture, AEO, evidence, validator, and CI artifacts; this contract does not claim those checks passed.

## 13. Non-goals and retained implementation gaps

This decision contract does not:

- expose or document a production URL, generate OpenAPI for a founder decision endpoint, or claim AICO-041 complete;
- implement the AICO-031 policy engine, policy administration, policy authoring language, or dynamic policy rollout;
- create the approval/revision UI, diff view, Product Brief revision generator, Designer execution, later gate services, or end-to-end release proof;
- authorize a whole employee session, accept model-authored identity/approval, or weaken parameter-bound tool checks;
- implement cancellation/kill, final retention durations, PostgreSQL RLS, external identity, notifications, analytics delivery, or object/sandbox/preview behavior;
- mutate immutable artifact content or rewrite historical decisions/events; or
- claim that current migrations, deterministic fixtures, hard-coded model `ALLOW`, or passing smoke tests satisfy this contract.

Known gaps and downstream owners:

| Gap                                                                                                 | Required direction                                                                                                            | Owner                                                      |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Current worker inserts a hard-coded deterministic-provider `ALLOW`                                  | Replace with typed action-time evaluator and binding checks; retain fixture only as non-production evidence.                  | AICO-031                                                   |
| No production founder decision use case or transport                                                | Implement this transaction/receipt/error contract and contract tests without repository bypass.                               | AICO-041                                                   |
| Current approval/policy/idempotency schemas lack parts of the complete binding and uniqueness model | Apply expand-and-contract migrations, backfill, constraint validation, and reconciliation.                                    | AICO-031, AICO-041                                         |
| No approval/revision review UI                                                                      | Render exact version/checksum/diff and refresh safely on 409/412.                                                             | AICO-040, AICO-042                                         |
| No Designer/revision orchestration                                                                  | Materialize and execute only the unique committed intent; never dispatch before GATE-01 `APPROVE`.                            | AICO-043, AICO-045                                         |
| No complete negative/restart harness                                                                | Prove actor, tenant, direct, stale, duplicate, expiry, cancel, restart, version, and audit-exception cases deterministically. | AICO-006 proof child `aico-backend#13`, AICO-046, AICO-085 |

No parent acceptance criterion or later issue is complete merely because this document exists.
