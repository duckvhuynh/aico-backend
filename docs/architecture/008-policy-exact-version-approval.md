# ADR-008: Deny-by-Default Policy and Exact-Version Founder Approval

**Status:** Accepted for AICO-006
**Date:** 2026-08-13
**Decision owner:** Duc Huynh (`@duckvhuynh`), authorized Architecture/Engineering owner
**Decision evidence:** https://github.com/duckvhuynh/aico-backend/pull/14#issuecomment-5275214714
**Product/Security acceptance owner:** Duc Huynh (`@duckvhuynh`), authorized Product and Security owner
**Product/Security evidence:** https://github.com/duckvhuynh/aico-backend/pull/14#issuecomment-5275215380
**Accepted semantic revision:** `907c563fa336d01afae0fc9da48bd7ccc7327d9a`
**Candidate verification:** https://github.com/duckvhuynh/aico-backend/actions/runs/31659994562
**Parent:** `duckvhuynh/aicompanyos#6`
**Decision child:** `duckvhuynh/aico-backend#12`
**Product trace:** Goals G-02 and G-05; MVP-CAP-004 and the policy portion of MVP-CAP-011; SRS TD-007; PRD-FR-016–020 and PRD-FR-059–060; SRS-FR-021–027 and SRS-FR-085–088; AT-004–005

## 1. Context and decision boundary

AI Company OS must decide whether an actor may perform one privileged action from current authoritative state, and it must deny before any unauthorized tool or business effect. Founder decisions have an additional invariant: only the authenticated founder who owns the Company may decide the exact pending artifact version at the expected gate and Run state. A model, employee, operator, session, transcript, stale readiness flag, or prior allow result has no approval authority.

This ADR selects the MVP policy representation and the atomic transaction contract for `GATE-01` `APPROVE` and `REQUEST_REVISION`. It defines the domain, persistence, concurrency, denial-audit, versioning, and failure semantics that later issues must implement and test. It does not claim a public decision endpoint, approval UI, production `PolicyModule`, production `DecisionsModule`, Designer execution, or complete AICO-031/AICO-041 behavior.

The decision intentionally covers only the first gate deeply. The same machinery may later be extended through separately reviewed action schemas and transition rules, but accepting this ADR does not authorize `GATE-02`, `GATE-03`, final export, cancellation, or any bypass from `GATE-01` directly to build work.

## 2. Authority reconciliation

- Product v0.1 and SRS requirements are authoritative. DEC-002 accepted that baseline; this ADR may refine its implementation contract but may not weaken founder authority, exact-version binding, default deny, append-only evidence, or zero unauthorized business/external effect.
- [ADR-002](./002-multi-agent-runtime.md) is accepted for runtime constraints. It already requires current-state evaluation, parameter-bound allow, immutable denial evidence, and deterministic application rules behind `PolicyDecisionPort`. This ADR makes that narrow representation decision explicit for AICO-006; it does not reopen the governed four-role runtime.
- [ADR-003](./003-backend-platform.md) is accepted and binds this decision to the modular NestJS monolith, inward-facing ports, TypeORM only in infrastructure adapters, PostgreSQL authority, short transactions, composite tenant constraints, and the `DecisionsModule`/`PolicyModule` ownership split.
- [ADR-005](./005-aeo-foundations.md) is accepted and requires versioned, digest-addressed behavior, causal evidence, safe telemetry, readable history, and explicit rollout/rollback truth.
- [ADR-006](./006-durable-workflow-selection.md) is accepted for AICO-002 and governs Run locks, persisted continuations, ordered Run events, transactional outbox, idempotent replay, and recovery after commit uncertainty.
- [ADR-007](./007-tenant-object-retention-selection.md) is accepted for AICO-003 and governs server-derived tenant scope, composite tenant foreign keys, non-disclosing cross-tenant denial, and tenant-safe evidence.
- [ADR-001](./001-system-architecture.md) and [ADR-004](./004-deployment-topology.md) remain proposed. This ADR uses only their policy/approval statements repeated by the SRS and accepted decisions; accepting ADR-008 would not accept either broader ADR.
- `AGENT_RUNTIME.md` is a normative runtime contract and `API_AND_DATA.md` is the baseline data/API contract. Their examples constrain this decision, but a documented route or logical table is not implementation evidence.
- Existing code, fixtures, agent-authored documents, a formatter pass, or green CI cannot accept this ADR. An attributable Architecture decision and a separate attributable Product/Security acceptance must approve the exact semantic revision.

If a later implementation discovers a conflict with Product/SRS or an accepted ADR, AICO-006 is reopened. It must not be resolved by silently broadening a role, trusting a mutable pointer, weakening an audit requirement, or treating existing code as authority.

## 3. Decision drivers and non-waivable invariants

1. **Default deny.** Missing, stale, unknown, malformed, cross-tenant, unsupported-version, expired, canceled, or otherwise inconsistent context is `DENY`.
2. **Action-time truth.** Authorization is evaluated from server-resolved current state immediately before the protected commit or invocation intent; cached readiness and a prior session decision are not authority.
3. **Narrow authority.** `ALLOW` binds one actor/employee version, Company, Run, Task/Attempt where applicable, action, exact resource/version, canonical parameters, approval/budget/environment facts, policy targeting, and expiry.
4. **Founder-only gates.** Only the active authenticated founder who currently owns the Company may decide `GATE-01`. Employees, operators, models, workers, and support tools cannot substitute.
5. **Exact pending version.** No mutable `latest` lookup, artifact identity without a version, or client-supplied current pointer may approve or unlock work.
6. **One logical effect.** The approval/revision decision, allowed transition, continuation intent, ordered event, outbox row, and idempotent response commit together or not at all.
7. **Safe denial evidence.** A denial produces zero unauthorized business or external effect. Where SRS-FR-087 applies, it still produces exactly one scoped/redacted `PolicyDecision` and linked denial event/outbox; that required audit is not counted as an unauthorized side effect.
8. **No policy from prose.** A model response, transcript, prompt, UI visibility, role label, or free-form reason cannot authorize an action.
9. **Readable immutable history.** Policy versions, targeting versions, inputs/digests, decisions, founder decisions, artifact versions, and events are never rewritten to resemble a newer policy or artifact.
10. **Dependency direction.** Domain policy and gate rules import no NestJS, TypeORM, HTTP, queue, provider, or object-store types.

These invariants are the stable evidence target `A6-ADR-01`.

## 4. Options considered

| Option                                                                         | Benefits                                                                                                                                                                                                                       | Costs and failure modes                                                                                                                                                                                                                                | Decision                                                                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Application-owned explicit typed rules behind `PolicyDecisionPort`**      | Smallest operational surface; deterministic and fast; typed action inputs; straightforward unit/property tests; current PostgreSQL state can be assembled under the same application transaction; no network policy dependency | Policy changes require a reviewed release/targeting change; engineers own rule readability; careless rule branching could become a home-grown DSL                                                                                                      | **Selected for MVP.** Keep the evaluator small, explicit, deny-by-default, versioned, and replaceable.                                      |
| **B. Embedded or sidecar policy engine (OPA/Rego, Cedar-like, or equivalent)** | Mature policy language, centralized bundles, strong policy-as-data tooling, possible non-application authoring                                                                                                                 | Adds bundle/compiler/runtime/supply-chain/version compatibility; translating current transactional state risks stale snapshots; remote evaluation adds availability/latency; language semantics and partial evaluation expand the alpha review surface | Defer. Reconsider when rule volume, independent policy authorship, or multi-service enforcement justifies the adapter and operational cost. |
| **C. Ad-hoc controller guards and role checks**                                | Few initial files and familiar NestJS guard mechanics                                                                                                                                                                          | Transport-only enforcement is bypassed by workers/application calls; rules duplicate and drift; cannot bind exact parameters/attempt/version/expiry; no single versioned decision; controller logic violates accepted dependency boundaries            | Rejected. Authentication guards may establish actor context but cannot be the policy engine.                                                |

PostgreSQL RLS, foreign keys, runtime database roles, and sandbox/tool restrictions remain defense in depth. None can replace contextual application authorization because no one layer contains actor, workflow, approval, attempt, budget, exact resource, and action semantics together.

## 5. Selected architecture

The MVP uses an application-owned registry of explicit, deterministic TypeScript rules in `PolicyModule`. Every protected action has:

- a stable action key and versioned input schema;
- a typed normalizer that rejects unknown fields and canonicalizes parameters;
- one explicit rule function returning `ALLOW` or `DENY` plus a stable internal reason code;
- a public-safe reason mapping separate from the internal reason;
- declared resource, attempt, approval, budget, environment, and, for `ALLOW` only, maximum-use and expiry requirements; and
- unit, mutation, race, and negative-matrix fixtures.

The application depends on a replaceable inward-facing port:

```ts
interface PolicyDecisionPort {
  evaluate(input: PolicyEvaluationInput): PolicyVerdict;
}
```

`evaluate` is pure: it performs no repository lookup, clock read, network call, event publication, or persistence. The application handler resolves and locks authoritative facts, supplies a database-derived evaluation time, invokes the evaluator, and persists the resulting decision. This keeps transactional semantics outside an engine adapter and permits a future OPA/Cedar-like implementation of the same port without changing callers, decision rows, Tool Invocation binding, or denial behavior.

`PolicyModule` owns action schemas, evaluation rules, reason codes, and version resolution. `DecisionsModule` owns founder gate commands and domain transitions. A `DecideFounderGate` application handler coordinates them through narrow ports and one `DecisionUnitOfWorkPort`; infrastructure implements that unit of work with TypeORM/SQL. Controllers authenticate, validate transport shape, and invoke the handler. They contain no approval or policy rules.

The first rule set contains at least:

- `gate.gate-01.approve/v1`;
- `gate.gate-01.request-revision/v1`;
- `task.design.dispatch/v1`; and
- a default rule that denies every unknown action/version.

`gate.gate-01.approve/v1` unlocks only Design work from the exact approved Product Brief. `task.design.dispatch/v1` performs a separate action-time check before a Designer task is claimed. Neither action authorizes build, network, deployment, export, another gate, or an entire session.

ADR-008 uses the canonical `POLICY_APPROVAL.md` decision catalog and the accepted `AGENT_RUNTIME.md` event/stage vocabulary without aliases. The only Run stages are `INTAKE`, `PRODUCT`, `DESIGN`, `BUILD`, `QA`, and `FINAL`. Failed, canceled, and completed are Run states; there is no terminal Run stage. The only policy/approval event types used by this decision are `policy.decided` and `approval.decided`.

This selection is `A6-ADR-01`.

## 6. Complete action-time input contract

The normalized `PolicyEvaluationInput` is a versioned discriminated union. The handler resolves all authority server-side; caller-supplied actor, Company, role, policy version, current state, approval status, and environment values are ignored or rejected as transport violations.

| Input group          | Required fields and semantics                                                                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract and time    | Input schema version; action schema key/version; database evaluation time; requested expiry/maximum use only when action schema permits it                                                                                                                                                |
| Actor                | Actor kind and ID; verified auth subject reference; active session ID/version; authentication strength; session/founder revocation version; founder ownership version, or immutable Employee Definition ID/version/status and assigned role; operator capability version where applicable |
| Tenant               | Server-derived `company_id`; Company status and `row_version`; current founder-owner ID; tenant-scope resolution outcome                                                                                                                                                                  |
| Workflow             | Run ID; workflow definition version; context snapshot ID; Run state; one exact `RunStage` value from `INTAKE/PRODUCT/DESIGN/BUILD/QA/FINAL`; `row_version`; current policy baseline; cancellation and operator-kill status/version                                                        |
| Work                 | Task ID/type/state/`row_version`; Attempt ID/number/state; assigned Employee Definition version; lease token digest and lease expiry when the action is attempt-bound                                                                                                                     |
| Gate and approvals   | Gate key, Gate Instance ID/status/`row_version`; expected Run state/version; exact pending Artifact ID and Artifact Version ID; artifact type/schema/checksum/status; required approval decision IDs/versions and their subject versions                                                  |
| Action and resource  | Stable action key/version; resource kind; exact tenant-owned resource ID and immutable version ID; tool key/version when applicable; canonical validated parameter digest; intended logical invocation/continuation key                                                                   |
| Budget               | Budget policy version; required categories; ledger `row_version`; remaining, reserved, and hard-limit state; explicit `NOT_APPLICABLE` only for an action schema that consumes no budget                                                                                                  |
| Environment          | Deployment environment; application revision/container digest cohort; capability/configuration version; execution-boundary class; approved provider/tool/sandbox configuration versions when applicable; emergency kill/deny version                                                      |
| Behavior versions    | Effective Policy Version ID/digest; Policy Targeting Version ID; workflow, employee, action schema, tool, redaction, and command schema versions needed by the action                                                                                                                     |
| Causality and replay | Command ID; idempotency key and canonical request digest; correlation ID; optional immediate causation ID; originating Task/Attempt/Invocation IDs                                                                                                                                        |

An input is complete only when every field required by that action schema is present, internally consistent, and resolved at a supported version. Unknown major versions, fields, enum values, reason codes, action keys, or resource kinds deny before any protected effect. An optional field is not a wildcard: its absence is valid only when the action schema explicitly marks that fact not applicable.

The input stores exact references and canonical digests, not raw prompts, transcripts, credentials, source bodies, foreign identifiers, or hidden reasoning. Authorization fields used for joins, ordering, constraints, and routine filters remain relational rather than unbounded JSON.

This contract is `A6-INPUT-01`.

## 7. Decision output and allow binding

A persisted `PolicyDecision` is a tagged union, not one shape with misleading nullable authority fields:

```ts
interface PolicyDecisionBaseV1 {
  meta: EnvelopeMetaV1;
  policy_decision_schema: 'policy-decision/v1';
  policy_decision_id: Uuid;
  policy_request_id: Uuid;
  policy_input_digest: Sha256Hex;
  policy_version_id: Uuid;
  policy_version: string;
  policy_digest: Sha256Hex;
  policy_targeting_version_id: Uuid;
}

interface AllowBindingV1 {
  actor_type: 'FOUNDER' | 'EMPLOYEE' | 'OPERATOR' | 'SYSTEM';
  actor_id: Uuid | string;
  actor_version: string;
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
  run_stage: 'INTAKE' | 'PRODUCT' | 'DESIGN' | 'BUILD' | 'QA' | 'FINAL';
  run_row_version: PositiveInt;
  task_state: string | null;
  gate: 'GATE-01' | 'GATE-02' | 'GATE-03' | null;
  gate_instance_id: Uuid | null;
  gate_instance_row_version: PositiveInt | null;
  artifact_version_id: Uuid | null;
  approval_references_digest: Sha256Hex;
  budget_digest: Sha256Hex;
  environment_digest: Sha256Hex;
  workflow_version: string;
  policy_targeting_version_id: Uuid;
  maximum_uses: PositiveInt;
}

interface DenyBindingV1 {
  actor_type: 'FOUNDER' | 'EMPLOYEE' | 'OPERATOR' | 'SYSTEM' | null;
  actor_version: string | null;
  company_id: Uuid | null;
  action_class: string;
  resource_class: string;
  supplied_reference_digest: Sha256Hex | null;
  run_id?: Uuid;
  task_id?: Uuid;
  attempt_id?: Uuid;
}

interface AllowPolicyDecisionV1 extends PolicyDecisionBaseV1 {
  effect: 'ALLOW';
  reason_code: 'ACTION_ALLOWED';
  binding: AllowBindingV1;
  issued_at: Rfc3339Utc;
  expires_at: Rfc3339Utc;
}

interface DenyPolicyDecisionV1 extends PolicyDecisionBaseV1 {
  effect: 'DENY';
  reason_code:
    | 'ROLE_FORBIDDEN'
    | 'WRONG_STAGE'
    | 'APPROVAL_MISSING'
    | 'STALE_VERSION'
    | 'RESOURCE_OUT_OF_SCOPE'
    | 'BUDGET_UNAVAILABLE'
    | 'ENVIRONMENT_UNSAFE'
    | 'TENANT_MISMATCH'
    | 'INVALID_CONTEXT'
    | 'AUTHENTICATION_REQUIRED'
    | 'POLICY_VERSION_UNSUPPORTED'
    | 'ALLOW_EXPIRED'
    | 'RUN_CANCELED'
    | 'RUN_TERMINAL';
  binding: DenyBindingV1;
  issued_at: Rfc3339Utc;
  expires_at: null;
  maximum_uses: 0;
}

type PolicyDecisionV1 = AllowPolicyDecisionV1 | DenyPolicyDecisionV1;
```

An `ALLOW` therefore contains the complete positive authority binding, `maximum_uses > 0`, and a non-null `expires_at` later than issue time. A `DENY` authorizes nothing: it records exactly `maximum_uses = 0` and `expires_at = null`, carries only a redacted denial binding, and may omit possible victim Run, Task, Attempt, or resource IDs. An in-scope `runId` may be retained only after the actor's Company and the Run's Company are proven equal. Policy source details, foreign identifiers, and sensitive input content never enter the redacted binding.

The closed allow reason is `ACTION_ALLOWED`. The closed deny reasons are `ROLE_FORBIDDEN`, `WRONG_STAGE`, `APPROVAL_MISSING`, `STALE_VERSION`, `RESOURCE_OUT_OF_SCOPE`, `BUDGET_UNAVAILABLE`, `ENVIRONMENT_UNSAFE`, `TENANT_MISMATCH`, `INVALID_CONTEXT`, `AUTHENTICATION_REQUIRED`, `POLICY_VERSION_UNSUPPORTED`, `ALLOW_EXPIRED`, `RUN_CANCELED`, and `RUN_TERMINAL`. These names and meanings are exactly the canonical `POLICY_APPROVAL.md` catalog. New names or changed meanings require a new policy/contract version. `ACTION_ALLOWED` is allow-only and conveys no authority beyond the tagged `ALLOW` binding.

An `ALLOW` is valid only if all stored bindings still match at use time:

- effect is `ALLOW` and the policy/targeting version remains eligible;
- Company, Run, Task, Attempt, actor/employee, action, resource, exact version, action schema, tool version, and canonical parameter digest match;
- required approval and budget versions still match current authoritative state;
- cancellation, operator kill, tenant status, lease, resource state, and environment capability remain eligible;
- database time is before `expires_at`; and
- use count remains within the action schema's bound, which is one for every side-effecting MVP action.

The allow UUID is an internal reference, not a bearer capability. A client, model, transcript, or session cannot present it to widen authority. A side-effecting Tool Invocation references and consumes its matching allow in an invocation-intent transaction; a retry reconciles the same logical invocation or obtains a new decision rather than reusing a stale grant. Reads may use a separately declared maximum-use rule, but there is no session-wide allow.

For the exact founder decision, the allow is evaluated, persisted, referenced by the founder decision, and consumed by that decision in the same transaction. It cannot be replayed for another gate or version.

Every persisted decision appends the canonical ordered `policy.decided` event and its outbox row. Its redacted payload includes `policy_decision_id`, `effect`, `reason_code`, action, policy/targeting versions, safe subject/resource classes, and causal references. An `ALLOW` that completes a founder gate command is followed in the same transaction by `approval.decided`; a `DENY` never emits `approval.decided`.

This contract is `A6-ALLOW-01`.

## 8. `GATE-01` domain semantics

Each pending exact artifact version has a distinct `GateInstance`. `REQUEST_REVISION` closes that instance. Publishing a later Product Brief version creates a new Gate Instance rather than editing or reopening the old one. At most one `PENDING` `GATE-01` instance exists per Run.

### 8.1 `APPROVE`

The action is allowed only when all of the following are true at the locked database state:

- the active authenticated actor is the current founder-owner of the active Company;
- the Run and Gate Instance belong to that Company;
- the Run is exactly `AWAITING_BRIEF_APPROVAL` at the expected `row_version` and is neither canceled nor killed;
- the Gate Instance is `PENDING`, is `GATE-01`, and points to the request's exact immutable Product Brief Artifact Version;
- the version is still valid/published, has the required type/schema/checksum/lineage, and is the Run's exact pending version;
- no founder decision or approved binding already exists for that Gate Instance;
- the effective policy/action/workflow versions are supported and current; and
- the command's idempotency key/digest is unused or an identical replay.

The successful transaction appends `APPROVE`, marks the Gate Instance `APPROVED`, creates the immutable `PRODUCT_BRIEF` approved-version binding, transitions the Run from `AWAITING_BRIEF_APPROVAL` to `DESIGNING`, and inserts one `START_DESIGN_FROM_BRIEF` continuation bound to the exact Product Brief version. After the preceding `policy.decided` `ALLOW`, it appends the canonical ordered `approval.decided` event and outbox row. The payload has `decision: APPROVE`, the Policy Decision and Founder Gate Decision IDs, exact gate/artifact version, prior/resulting Run state and stage, approved-binding ID, and continuation-intent ID.

The continuation is only durable intent. A worker must still recheck cancellation, exact approved binding, current policy, dependencies, and budget before creating/claiming Designer work. `APPROVE` does not invoke a model, tool, provider, or sandbox inside the decision transaction.

### 8.2 `REQUEST_REVISION`

The same founder, Company, Run, Gate Instance, exact-version, expected-state, policy, and idempotency checks apply. Revision requires bounded schema-valid feedback with a digest and classification; it cannot alter the reviewed Artifact Version.

The successful transaction appends `REQUEST_REVISION`, stores the immutable feedback reference/content, marks the Gate Instance `REVISION_REQUESTED`, transitions the Run from `AWAITING_BRIEF_APPROVAL` to the accepted workflow's `QUALIFYING` revision checkpoint, and inserts one `REVISE_PRODUCT_BRIEF` continuation bound to the reviewed version and feedback. It creates no approved binding and unlocks no Designer/build work. After the preceding `policy.decided` `ALLOW`, it appends the canonical ordered `approval.decided` event and outbox row. The payload has `decision: REQUEST_REVISION`, the same exact-version/causal fields, a redacted feedback reference/digest, no approved-binding ID, and the revision continuation-intent ID.

A later PM revision task may publish a new immutable Product Brief and a new Gate Instance under AICO-039/AICO-045. Neither the reviewed version nor its decision is updated or deleted.

## 9. Founder decision transaction

The command handler uses `READ COMMITTED` with explicit row locks, uniqueness constraints, and optimistic `row_version` checks. All decision commands use the same documented lock order to avoid deadlocks:

1. after credential verification, lock the current session/founder authority and server-resolved Company ownership rows, then revalidate active session, founder status, Company status, current ownership, and their revocation/row versions;
2. only for that still-authorized founder/Company, claim or lock the scoped idempotency record for actor, command type, and key;
3. if a completed record has the same canonical request digest, return its stored safe receipt/status and original correlation after commit without locking or re-evaluating the now-changed Run, Gate Instance, Artifact Version, policy target, or continuation state;
4. if the key is new, lock the effective Policy Targeting pointer/version;
5. lock the tenant-scoped Run row;
6. lock its exact Gate Instance and read its immutable Artifact Version through same-Company composite keys;
7. lock the affected approved-binding/continuation logical key when it exists;
8. lock the Run event counter when new ordered events will be appended; and
9. finalize the command receipt before commit.

The replay shortcut is deliberately after current authority validation but before post-success business preconditions. A committed approval has already moved the Run and closed the Gate Instance, so re-evaluating those stale expected values would incorrectly reject a valid retry. Conversely, a revoked session, inactive founder, changed Company owner, or inactive Company cannot retrieve an earlier success merely by replaying its key: current-authority validation denies before receipt lookup and exposes no receipt IDs or result. A safely established but no-longer-authorized subject receives a redacted `ROLE_FORBIDDEN` result/evidence where policy auditing applies; absence of an active authenticated actor maps to `AUTHENTICATION_REQUIRED` and only safe platform telemetry when no trustworthy tenant scope exists.

Within that transaction the handler:

1. handles the authority-checked idempotency branch above: identical completed replay returns early; a changed digest returns `IDEMPOTENCY_KEY_REUSED`; an in-progress row serializes or returns a safe in-progress result;
2. for a new command, validates exact Company/Run/Gate/Artifact relationships, expected Run state/stage and `row_version`, Gate Instance `row_version`, decision kind, feedback schema, cancellation/kill state, and immutable version state;
3. resolves the effective compatible Policy Version and action schema from the locked targeting version;
4. assembles the complete action-time input and invokes the pure `PolicyDecisionPort`;
5. persists the tagged immutable Policy Decision, appends ordered `policy.decided`, and inserts its outbox row;
6. on `DENY`, creates no founder/business effect, stores the safe idempotent denial result, and commits only the evidence permitted by Section 11;
7. on `ALLOW`, appends one Founder Gate Decision and only the transition/binding/continuation permitted by Section 8;
8. appends the next ordered `approval.decided` event with `APPROVE` or `REQUEST_REVISION` in its payload and inserts its outbox row; and
9. stores the safe command receipt/digest for replay and commits.

If any constraint, event, outbox, continuation, or receipt write fails, none commits. No event is published and no external adapter is called before commit. A crash after commit but before response is recovered by the idempotency receipt; a crash after outbox publication but before acknowledgement is handled by inbox deduplication under ADR-006/AICO-025.

An identical key and request digest, presented by the still-current founder/owner, returns the original safe result without a new policy/founder decision, transition, continuation, event, or outbox row and without failing on the successful command's now-stale gate/artifact preconditions. Reusing a key with a changed digest returns `IDEMPOTENCY_KEY_REUSED` and has no business effect. Replay after revocation or ownership loss is denied before receipt disclosure. Two valid commands with different keys serialize on the Run/Gate locks; only the first can close the pending Gate Instance.

This transaction contract is `A6-TX-01`.

## 10. Domain model and PostgreSQL shape

The domain model is deliberately small:

- `PolicyVersion`: immutable evaluator/rule release and compatibility metadata;
- `PolicyTargetingVersion`: immutable environment/cohort targeting decision, including emergency deny/kill state;
- `PolicyInput`: normalized action-time facts at explicit schema versions;
- `PolicyDecision`: immutable tagged `ALLOW` authority binding or redacted `DENY` evidence binding;
- `GateInstance`: one gate over one exact artifact version with optimistic version;
- `FounderGateDecision`: append-only `APPROVE` or `REQUEST_REVISION` fact;
- `ApprovedArtifactBinding`: immutable Run/gate-role to exact Artifact Version link; and
- `ContinuationIntent`: durable, unique downstream intent, not evidence that work ran.

The implementation migrations owned by later issues use the following logical shape:

| Table                            | Required columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Keys and invariants                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy_versions`                | `id uuid`, policy key, semantic version, input/output/action-schema versions, evaluator/source/application revision, rules/package digests, compatibility range, publication state, `published_at timestamptz`, `created_at timestamptz`                                                                                                                                                                                                                                                            | UUID PK; immutable after publication; unique policy key/version and digest; checked `DRAFT/PUBLISHED` publication state; pause/kill/rollback is targeting state rather than a mutation of the published version; no silent replacement                                                                                                                                                                                            |
| `policy_targets`                 | `id uuid`, environment/cohort key, current Policy Targeting Version ID, `row_version bigint`, `created_at/updated_at timestamptz`                                                                                                                                                                                                                                                                                                                                                                   | UUID PK; one explicitly addressed mutable pointer per environment/cohort; checked positive row version; locked for action-time resolution and targeting changes; never infer current by maximum semantic version                                                                                                                                                                                                                  |
| `policy_targeting_versions`      | `id uuid`, environment/cohort, target Policy Version ID, targeting version, state, reason, actor/evidence refs, `effective_at timestamptz`, `created_at timestamptz`                                                                                                                                                                                                                                                                                                                                | append-only; unique environment/cohort/version; checked `ACTIVE/PAUSED/DENY_ALL/ROLLED_BACK` state; an active target must reference a published compatible Policy Version                                                                                                                                                                                                                                                         |
| `policy_decisions`               | `id uuid`; nullable subject `company_id` and provably same-tenant Run/Task/Attempt refs; actor kind/ID and employee version; action key/version; nullable exact resource ID/version plus safe resource class; supplied-reference/resource/parameter/context/approval/budget/environment digests/versions; Policy and Targeting Version IDs; `effect`; `reason_code`; non-null `maximum_uses`; `issued_at timestamptz`; nullable `expires_at timestamptz`; correlation/causation IDs; classification | append-only tagged-row checks: `ALLOW` requires Company/Run, exact action/resource/version/parameter, targeting, `maximum_uses > 0`, non-null `expires_at > issued_at`, and `ACTION_ALLOWED`; `DENY` requires `maximum_uses = 0`, `expires_at IS NULL`, and one canonical deny reason, permits victim Run/resource IDs to be null, and cannot be referenced by an invocation; every present tenant ref uses a composite tenant FK |
| `gate_instances`                 | `id uuid`, `company_id uuid NOT NULL`, Run ID, gate key, exact Artifact/Artifact Version IDs, expected Run state, status, `row_version bigint`, `opened_at/decided_at timestamptz`                                                                                                                                                                                                                                                                                                                  | unique `(company_id,id)`; all composite FKs share Company/Run; checked `row_version > 0`; partial unique one `PENDING` gate key per Run; status transitions only `PENDING -> APPROVED/REVISION_REQUESTED/CANCELED`                                                                                                                                                                                                                |
| `founder_gate_decisions`         | `id uuid`, `company_id uuid NOT NULL`, Run/Gate/Artifact/Artifact Version/Founder/Policy Decision IDs, decision, expected Run/Gate versions, feedback/digest/classification, command/idempotency refs, `created_at timestamptz`                                                                                                                                                                                                                                                                     | append-only; unique Gate Instance and command result; composite tenant FKs; checked `APPROVE/REQUEST_REVISION`; revision requires nonblank bounded validated feedback while approval feedback is optional; no update/delete grant to runtime role                                                                                                                                                                                 |
| `run_approved_artifact_bindings` | `id uuid`, `company_id uuid NOT NULL`, Run ID, binding key, exact Artifact Version ID, Gate and Founder Decision IDs, `created_at timestamptz`                                                                                                                                                                                                                                                                                                                                                      | immutable; unique Run/binding key; composite tenant/exact-version FKs; only `APPROVE` may create `PRODUCT_BRIEF`                                                                                                                                                                                                                                                                                                                  |
| `continuation_intents`           | `id uuid`, `company_id uuid NOT NULL`, Run/Gate/Founder Decision IDs, type, exact input Artifact Version/feedback refs, state, logical idempotency key, `created_at/claimed_at/completed_at timestamptz`                                                                                                                                                                                                                                                                                            | unique same-tenant logical key; checked type/state; no cross-Run refs; claimed under lease/revalidation; one logical continuation per decision                                                                                                                                                                                                                                                                                    |

Existing `runs`, `artifact_versions`, `events`, `outbox_messages`, `idempotency_records`, and `run_event_counters` remain authoritative under accepted ADRs. Authorization columns are relational; JSON is permitted only for schema-validated versioned evidence that is not used to establish ownership, state, ordering, or joins.

All externally visible/application-generated IDs are UUIDv7 stored as PostgreSQL `uuid`. All instants are `timestamptz`; expiry comparison uses database time. Domain labels are `text` with meaningful `CHECK` constraints or migration-controlled enums, not arbitrary strings or artificial `varchar(n)` limits. Tenant-owned indexes begin with `company_id`. Every child-to-tenant-owned-parent relation repeats `company_id` in a composite foreign key, and material exact-version uniqueness is settled by database constraints rather than ID shape. Platform-scoped or redacted foreign-target denials with no safe Company binding are stored in their separately authorized security-evidence boundary rather than fabricating a tenant key.

This persistence contract is `A6-SCHEMA-01`.

## 11. Denial behavior and negative matrix

"Zero side effects" means zero unauthorized business state change, gate/approval, artifact mutation, continuation/task, budget consumption, provider/tool/sandbox call, external event, or cost. It does not suppress the scoped/redacted security evidence required by PRD-FR-060 and SRS-FR-087.

For an authenticated actor and a provably same-Company Run, denial appends one tenant-scoped tagged `DENY` Policy Decision and one safe canonical `policy.decided` event/outbox in the denial transaction. For an authenticated employee attempting a foreign/unknown resource, the redacted denial binding is scoped to the employee's verified Company with no victim Run FK or foreign identifier; its `policy.decided` payload records only the action/resource class, stable generic reason, keyed digest of the supplied reference, policy versions, actor version, and causality. It never writes to or exposes the possible victim Run. A known operator with no Company receives a platform-security audit event rather than a tenant row. Unauthenticated, malformed, or schema-unparseable traffic is rejected by the authentication/validation boundary and recorded only in safe platform security telemetry because no trustworthy policy subject/tenant exists.

Internal reasons use the Section 7 canonical catalog without aliases. Employee/operator authority maps to `ROLE_FORBIDDEN`; wrong current stage/state or Gate Instance state maps to `WRONG_STAGE`; a missing exact approval maps to `APPROVAL_MISSING`; stale Run/Gate/workflow/resource/checksum/optimistic versions map to `STALE_VERSION`; wrong resource/parameter/assignment scope maps to `RESOURCE_OUT_OF_SCOPE`; missing budget maps to `BUDGET_UNAVAILABLE`; unsafe environment state maps to `ENVIRONMENT_UNSAFE`; a foreign tenant maps to `TENANT_MISMATCH`; malformed/contradictory/unknown context maps to `INVALID_CONTEXT`; no active actor maps to `AUTHENTICATION_REQUIRED`; missing/incompatible/paused policy targeting maps to `POLICY_VERSION_UNSUPPORTED`; exclusive expiry maps to `ALLOW_EXPIRED`; requested/effective cancellation maps to `RUN_CANCELED`; and failed/completed/canceled immutable Run state maps to `RUN_TERMINAL`. Public responses remain non-disclosing (`action_denied`, `resource_not_found`, `precondition_failed`, or `conflict`) and never reveal another tenant, current foreign version, policy source, credentials, or hidden content. Metrics use only bounded action/outcome/reason cohorts; high-cardinality IDs stay in authorized events/logs/traces.

| Attempt                                                                                                                | Required result                                                                                                                                               | Permitted evidence only                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Employee/model tries to approve or request revision                                                                    | Deny; no Founder Gate Decision, transition, approved binding, continuation, tool, or cost                                                                     | One scoped/redacted SRS-FR-087 Policy Decision and linked denial event/outbox                                                                             |
| Operator/support tool tries to approve                                                                                 | Deny even if the operator may kill a Run; no founder impersonation                                                                                            | Platform-security audit with no tenant content unless separately authorized to view that Company                                                          |
| Direct HTTP/API call bypasses the UI                                                                                   | Normal authentication, tenant resolution, policy, exact-version, and transaction checks; UI visibility grants nothing                                         | Same evidence as the resulting allow/deny                                                                                                                 |
| Ordinary runtime code tries to bypass the handler/repository port or update history                                    | Composition/import checks and database grants/constraints reject it; no supported direct mutation path                                                        | Architecture/security violation signal; never fabricate a Policy Decision after an untrusted raw SQL attempt                                              |
| Stale Artifact Version, stale expected Run/Gate version, mutable-latest reference, or repeated decision with a new key | Deny; current exact version/gate remains pending or already decided; no second business effect                                                                | Same-Run safe denial decision/event                                                                                                                       |
| Wrong Company or foreign Run/Gate/Artifact reference                                                                   | Non-disclosing not-found/deny; no victim read/write/event, approval, continuation, or timing-sensitive detail                                                 | Requester-scoped or platform security evidence with no foreign ID/content                                                                                 |
| Wrong Run state, Gate, Artifact type, resource, action, workflow version, or Policy Version                            | Deny before transition/invocation                                                                                                                             | Safe reason-coded denial decision/event when actor and scope are trustworthy                                                                              |
| Identical idempotency replay by the still-current founder/owner                                                        | After current authority locks pass, return the original safe result without rechecking the now-closed Gate/current Artifact state; exactly one logical effect | Original evidence only; replay metadata may increment an operational counter                                                                              |
| Identical replay after session/founder revocation, ownership change, or Company inactivation                           | Deny before idempotency receipt disclosure; never return the old success or use its stale authority                                                           | Safe `AUTHENTICATION_REQUIRED` platform evidence, or redacted `ROLE_FORBIDDEN` `policy.decided` evidence only when subject/Company scope remains provable |
| Same key with changed request digest                                                                                   | Conflict; no new business effect                                                                                                                              | Safe idempotency/security evidence without request content                                                                                                |
| Expired, altered, already-consumed, wrong-attempt, wrong-parameter, or superseded-target allow                         | ToolGateway denies before adapter invocation                                                                                                                  | New safe denial decision/event tied to the attempted use, never reuse the old allow                                                                       |
| Canceled/terminal/killed Run or revoked session/employee/policy                                                        | Deny; no reopening, dispatch, adapter call, or new continuation                                                                                               | Safe current-state denial evidence                                                                                                                        |
| Policy evaluator error, unsupported input/output major, missing targeting, or database uncertainty                     | Fail closed; no protected effect                                                                                                                              | Persist denial only if the transaction/evidence boundary is trustworthy; otherwise safe availability/security telemetry                                   |

This matrix is `A6-DENY-01`; its scoped/redacted evidence rules are `A6-AUDIT-01`.

## 12. Concurrency, cancellation, and failure semantics

- **Competing decisions:** Run/Gate row locks plus unique Gate Instance/decision constraints allow exactly one close. The loser re-reads current state and denies or returns the identical replay; it never creates a second approval/revision.
- **Artifact publication race:** a Gate Instance points to an immutable exact version. Publishing a newer version cannot retarget it. A new version requires a new pending Gate Instance through the revision workflow.
- **Policy rollout race:** the command locks/records the effective Targeting Version. A rollout or emergency kill serializes on the targeting row. A Tool Invocation revalidates targeting at use; an allow issued under a superseded/killed target is unusable.
- **Cancellation race:** cancellation and gate decisions lock the Run in the same order. Commit order decides: if cancellation commits first, the decision denies; if a gate decision commits first, cancellation observes the new state and must cancel any unclaimed continuation under its own rules. Workers still recheck cancellation at claim. No terminal Run reopens.
- **Session/ownership revocation race:** founder/session/Company authority is locked and version-checked. Revocation uses the same authority lock; whichever commits second observes the changed version and cannot preserve stale authority.
- **Budget race:** a no-cost gate action records the action schema's explicit `NOT_APPLICABLE`; it does not reserve budget or imply future budget eligibility. Tool/dispatch actions lock or conditionally reserve the required budget before invocation intent, so concurrent workers cannot oversubscribe.
- **Clock/expiry:** issue and expiry instants use PostgreSQL time. Application clock skew cannot extend authority. Expired allows are never refreshed implicitly.
- **Transaction failure:** failure before commit leaves no acknowledged decision, transition, event, outbox, or continuation. Event/outbox/receipt failure rolls back the material mutation.
- **Commit uncertainty:** the caller retries with the same key/digest. Current founder/Company authority is locked and revalidated first; if still authorized, the handler returns the stored result without rechecking post-success Gate/Artifact state. If authority was revoked, replay denies without receipt disclosure. The caller never guesses whether approval succeeded.
- **Outbox uncertainty:** publication is at least once; consumers deduplicate by Event ID/inbox receipt. A continuation is additionally unique by logical decision key.
- **Database unavailable:** no durable Policy Decision means no privileged Tool Invocation or founder decision may proceed. Readiness/capability degrades and the action fails closed.
- **External-effect uncertainty:** gate decisions perform no external call. For later tool actions, a persisted invocation intent and provider/tool idempotency key are reconciled; unknown outcome becomes `BLOCKED`, never blind replay.

These semantics are `A6-CONCURRENCY-01` and `A6-FAIL-01`.

## 13. Policy targeting, migration, rollback, and readability

Policy behavior is an immutable pair of a Policy Version and a Policy Targeting Version. A Run records its baseline policy set for reproducibility, while every protected action resolves and records the effective action-time target. A historical Run pin cannot bypass a newer emergency deny/kill. Targeting changes are append-only, authorized platform decisions with evidence; no caller selects its policy version.

Each Policy Version records rule/action schemas, evaluator/source/application revision, package/rules digests, compatibility range, reason-code catalog, and human-readable summary. A deployment supports an explicit compatibility window. If the targeted version or its input/output adapter is unavailable, readiness/capability fails and actions deny; the system never silently evaluates with `latest` or a "close enough" version.

Rollout uses expand/verify/target/contract:

1. add forward-compatible tables/columns/checks and deploy readers for old and new supported versions;
2. publish the immutable new Policy Version and deterministic conformance fixtures without targeting it;
3. verify action schemas, denial matrix, decision readability, and rollback on the candidate revision;
4. append a Targeting Version for the approved environment/cohort; and
5. retire old writers only after active/history compatibility and evidence retention are satisfied.

Rollback appends a new Targeting Version pointing to a previously published compatible policy and pauses/kills the bad version. It never edits prior decisions, approvals, events, Run manifests, or Artifact Versions. Previously issued allows under a superseded/killed targeting version fail use-time validation. Database rollback is a reviewed compensating forward migration; destructive down-migration of immutable evidence is prohibited.

Historical decision views render stored stable reason/action labels, exact versions, digests, actor class, subject references, outcome, time, and evidence links without re-evaluating history. Unknown retired presentation metadata is shown as unsupported, not reinterpreted. Legacy/unverified approval rows, if discovered during migration, remain readable but cannot create an approved binding or unlock new work until explicitly reconciled; no backfill fabricates founder authority.

The complete targeting/rollback implementation belongs to AICO-079. This ADR defines its policy-specific invariants as `A6-VERSION-01`.

## 14. Non-goals and accepted trade-offs

- No public decision endpoint, DTO, UI control, database migration, production evaluator, or production gate service is implemented by this ADR.
- No general-purpose policy language, customer-authored RBAC/ABAC, policy editor, dynamic code upload, or non-engineer rule authoring is selected for MVP.
- No remote policy service, service mesh authorization, microservice split, or policy availability SLO is introduced.
- No `GATE-02`, `GATE-03`, final approval/export, cancellation command, operator kill, provider, sandbox, preview, or attachment behavior is implemented or bypassed.
- No model, employee, QA verdict, operator, or automated evaluator receives founder approval authority.
- No policy decision authorizes an entire session, broad resource collection, mutable latest version, arbitrary parameters, or future attempts.
- No raw prompt, completion, transcript, source body, credential, foreign resource identifier, or hidden reasoning is required in audit evidence.
- No final alpha budget, retention duration, provider term, or deployment isolation choice is made here.

The selected approach accepts that policy changes are engineering releases and that the explicit rule registry must be kept small. Reconsider an embedded engine only when independently authored policy, materially larger rule volume, or enforcement across extracted services outweighs its bundle, compatibility, data-mapping, availability, and review costs. Replacement still has to satisfy this ADR's port, decision schema, transaction, denial, exact-version, and evidence invariants.

## 15. Later implementation and evidence ownership

| Boundary                                                                            | Present truth after accepting this ADR                                       | Owning issue(s)    |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------ |
| Versioned envelopes and schemas                                                     | Contract selected; implementation fixtures remain separate                   | AICO-022           |
| Run/Gate/decision/continuation state machines and migrations                        | Logical model selected; no production tables or handlers claimed             | AICO-023, AICO-041 |
| Ordered events, outbox, inbox, fault injection                                      | ADR-006 behavior is binding; complete shared implementation remains separate | AICO-025           |
| Employee Definition identity/permission versions                                    | Required policy input; production definitions remain separate                | AICO-030           |
| Default-deny evaluator, Policy Version registry, ToolGateway binding, reason matrix | Selected here; production behavior and adapter-call proof remain separate    | AICO-031           |
| Immutable Product Brief Artifact Versions and exact lineage                         | Required by Gate Instance; production service remains separate               | AICO-039           |
| Founder decision handler/API and database enforcement                               | Transaction specified; production service and negative tests remain separate | AICO-041           |
| Deliberate accessible approve/revision controls                                     | No UI claim in this ADR                                                      | AICO-042           |
| Designer dispatch from exact approved brief                                         | Continuation intent only; no Designer execution claim                        | AICO-043           |
| Product Brief revision task/new version/new Gate Instance                           | Revision intent only; full lineage/orchestration remains separate            | AICO-045           |
| End-to-end clarification/brief/design/approval automation                           | Not proven by architecture evidence                                          | AICO-046           |
| Final founder gate behavior                                                         | Must reuse exact-version controls without broadening GATE-01                 | AICO-067           |
| Policy targeting, compatibility migration, kill, and rollback                       | Invariants selected; operational implementation remains separate             | AICO-079           |
| Tenant/policy adversarial and redaction evidence                                    | Architecture matrix is not a release-candidate security pass                 | AICO-082, AICO-085 |
| Restart/duplicate/cancel/race/restore evidence                                      | Semantics selected; release resilience proof remains separate                | AICO-084, AICO-085 |

## 16. Traceability and evidence IDs

| Stable ID           | Authority covered                                                 | Decision coverage                                                                                                                             | Required later proof                                                           |
| ------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `A6-ADR-01`         | TD-007; DEC-002; ADR-002/003/005/006/007                          | Options, authority reconciliation, selected typed application evaluator, dependency direction, non-waivable invariants                        | Exact-revision Architecture decision plus separate Product/Security acceptance |
| `A6-INPUT-01`       | PRD-FR-059; SRS-FR-085–086                                        | Complete server-resolved versioned action-time input; missing/stale/unknown denies                                                            | Typed schema fixtures and mutation tests under AICO-031                        |
| `A6-ALLOW-01`       | SRS-FR-086 and SRS-FR-088                                         | Action/tenant/resource/attempt/exact-version/parameter/policy/target/expiry/single-use binding; no session authority                          | ToolGateway altered-binding and zero-adapter-call tests under AICO-031         |
| `A6-TX-01`          | PRD-FR-016–020; SRS-FR-021–026                                    | Founder-only exact pending `GATE-01` `APPROVE`/`REQUEST_REVISION`, immutable decision, transition, continuation, event/outbox, idempotency    | Transaction/fault/race suite under AICO-041/AICO-025                           |
| `A6-DENY-01`        | PRD-FR-018, PRD-FR-060; SRS-FR-027 and SRS-FR-086–088; AT-004–005 | Employee/operator/direct/stale/cross-tenant/duplicate/wrong-state/gate/resource/version/expired/canceled matrix with zero unauthorized effect | Negative integration suite under AICO-031/AICO-041/AICO-082/AICO-085           |
| `A6-AUDIT-01`       | PRD-FR-020, PRD-FR-060; SRS-FR-022 and SRS-FR-087                 | Exactly one safe Policy Decision/event where applicable, non-disclosing cross-tenant/platform tiers, redacted causal evidence                 | Event/outbox/redaction inspection under AICO-025/AICO-031/AICO-082             |
| `A6-SCHEMA-01`      | SRS-FR-021–026 and SRS-FR-085–088; ADR-003/007                    | UUID/timestamptz, immutable domain rows, checks, uniqueness, composite tenant FKs, relational authority fields                                | Migration/fresh-setup/constraint tests under AICO-023/AICO-041                 |
| `A6-CONCURRENCY-01` | SRS-FR-022–023; AT-005 and applicable AT-006                      | Lock order, optimistic versions, one Gate close, cancellation/session/policy rollout races                                                    | Deterministic concurrent-command tests under AICO-041/AICO-084                 |
| `A6-FAIL-01`        | SRS-FR-022–023, SRS-FR-087; ADR-006                               | Fail closed on evaluator/DB/event/outbox uncertainty; idempotent recovery; no external call in gate transaction                               | Failure injection under AICO-025/AICO-031/AICO-041/AICO-084                    |
| `A6-VERSION-01`     | TD-007; SRS-FR-085–088; PRD-FR-063                                | Immutable policy/targeting versions, emergency deny, compatibility window, rollback without history rewrite, readable legacy truth            | Target/kill/rollback fixture under AICO-079/AICO-085                           |

## 17. Human acceptance gate

This ADR is **Accepted** for AICO-006. Duc Huynh (`@duckvhuynh`) approved the exact semantic revision `907c563fa336d01afae0fc9da48bd7ccc7327d9a` separately as the authorized Architecture/Engineering owner and as the authorized Product/Security owner. Both decisions were recorded on 2026-08-13 with no disputes or conditions. Candidate verification [run 31659994562](https://github.com/duckvhuynh/aico-backend/actions/runs/31659994562) passed on that revision.

Before backend child #12 or parent AICO-006 can be `Done`:

1. an identifiable authorized Architecture owner must approve the exact semantic revision and selected Option A;
2. a separate identifiable authorized Product/Security owner must accept the founder authority, denial/audit semantics, GATE-01 outcomes, non-goals, and later-issue boundaries on that same semantic revision;
3. stable `A6-*` architecture/evidence validation must fail closed when required contract text is removed;
4. the evidence package and canonical verification must pass on the exact clean final SHA; and
5. any semantic edit after either human decision must reopen the affected decision rather than carrying approval forward.

The permanent Architecture and Product/Security comments are bound in the header. This metadata-only acceptance revision must pass accepted-mode and canonical exact-final-SHA verification, then receive attributable QA/Security approval before merge. Agent-authored summaries, labels, issue assignment, draft PR state, local tests, or CI alone are not QA/Security acceptance.
