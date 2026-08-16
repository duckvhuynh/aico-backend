# API and Data Contract: Backend MVP

- **Status:** Baseline v1 contract
- **Base path:** `/api/v1`
- **Media type:** `application/json`; errors use `application/problem+json`
- **Primary traceability:** SRS sections 4–10; AICO-011–016, AICO-022–025, AICO-031, AICO-034

This document defines the externally observable REST contract and the PostgreSQL data rules behind it. Examples are illustrative values, not fixture secrets. The generated OpenAPI document and schema-versioned contract fixtures must conform to this baseline.

## Global HTTP contract

### Authentication and scope

All endpoints except `/api/v1/health/live`, `/api/v1/health/ready`, `POST /api/v1/auth/session`, and the local/test-only `POST /api/v1/auth/invites` operator adapter require a bearer credential accepted by the configured authentication adapter. Public registration (`POST /api/v1/auth/register` and the retired `/api/v1/auth/dev-token` helper) is unavailable and returns the same non-disclosing `404`. The server resolves the credential subject to an active Founder session and, when provisioned, that Founder's one Company. The client cannot select a tenant with a body field, URL field, query field, role claim, or custom company header. Authenticated and error responses set `Cache-Control: no-store`. Sign-out, expiry, and revocation invalidate the session and any signed-resource grant bound to it.

Resource routes may contain a resource ID, but repository lookup is always `(resolved_company_id, resource_id)`. Missing and foreign resources produce the same safe `404` response. Operator and employee APIs use separate authentication audiences and are not reachable through Founder credentials.

Local/test authentication is an adapter, not a hidden production endpoint. A development signing secret or deterministic test principal is accepted only when `APP_ENV` is explicitly local/test; startup fails if that mode is configured in a deployed environment.

### Headers

| Header | Direction | Rule |
|---|---|---|
| `Authorization: Bearer <token>` | request | Required except health endpoints |
| `Idempotency-Key: <uuid>` | request | Required for every mutating command; retained for the configured replay window |
| `If-Match: "<etag>"` | request | Required for versioned updates and commands whose resource representation may be stale |
| `X-Correlation-Id: <uuid>` | request | Optional; generated when absent; invalid values are rejected |
| `X-Correlation-Id` | response | Always returned |
| `Idempotency-Key` | response | Echoed for accepted/replayed commands |
| `ETag` | response | Returned on versioned resources |

Unknown body properties are rejected. JSON numbers are not silently accepted as strings and vice versa. Date/time values use RFC 3339 UTC output. IDs are UUID strings. Empty string and `null` are distinct and allowed only when the field schema says so.

### Successful command envelope

Commands return the created/changed resource directly, plus response metadata:

```json
{
  "data": {
    "id": "019c1234-1234-7abc-8def-1234567890ab"
  },
  "meta": {
    "correlation_id": "019c1234-1234-7abc-8def-1234567890ac",
    "replayed": false
  }
}
```

A replay with the same operation, actor, key, and canonical request digest returns the original status and safe response with `meta.replayed=true`. Reusing a key for a different request is a conflict.

### Problem details

Errors follow RFC 9457 and add stable, machine-readable fields:

```json
{
  "type": "https://api.aicompanyos.dev/problems/precondition-failed",
  "title": "The resource changed",
  "status": 412,
  "detail": "Refresh the company profile and retry with its current ETag.",
  "instance": "/api/v1/companies/current/profile",
  "code": "precondition_failed",
  "trace_id": "019c1234-1234-7abc-8def-1234567890ac",
  "errors": [],
  "remediation": ["refresh_resource", "retry_command"]
}
```

`detail`, `errors`, and `remediation` are audience-safe. They never reveal a foreign tenant, credential, SQL, stack trace, object key, provider prompt/completion, or hidden reasoning.

| Status | Stable codes | Meaning |
|---:|---|---|
| 400 | `validation_failed`, `malformed_json`, `unsupported_schema_version` | Transport/schema failure; no partial persistence |
| 401 | `authentication_required`, `session_expired`, `session_revoked` | Credential cannot establish an active actor |
| 403 | `action_denied` | Actor is known but action class is forbidden; tenant resource denials still use 404 |
| 404 | `resource_not_found` | Resource absent or outside resolved tenant |
| 409 | `state_conflict`, `active_initiative_exists`, `idempotency_key_reused`, `command_in_progress` | Current material state conflicts with otherwise valid command |
| 412 | `precondition_required`, `precondition_failed` | Missing/stale `If-Match` or expected exact version/state |
| 422 | `domain_rule_violated`, `goal_out_of_scope`, `unsupported_sensitive_data` | Valid JSON cannot be accepted by product/domain policy |
| 429 | `rate_limited`, `capacity_exhausted` | Retry according to `Retry-After` when supplied |
| 503 | `dependency_unavailable`, `service_not_ready` | Safe transient failure; acknowledgement does not imply a domain commit |

## Health

### `GET /api/v1/health/live`

No authentication. Returns `200` when the process can serve requests. It performs no dependency call.

```json
{ "status": "ok", "role": "api" }
```

### `GET /api/v1/health/ready`

No authentication. Returns `200` only when required dependencies, migration compatibility, and the process role are ready; otherwise `503`. It exposes component labels and coarse states, not addresses or credentials.

```json
{
  "status": "ready",
  "role": "api",
  "checks": { "database": "up", "object_store": "up", "migrations": "compatible" }
}
```

## First-slice Founder endpoints

### `POST /companies`

Creates the authenticated Founder's single Company and immutable Company Profile Version 1 in one transaction. Requires `Idempotency-Key`. It does not accept `founder_id` or `company_id`.

Request:

```json
{
  "name": "Northstar Studio",
  "profile": {
    "purpose": "Help independent consultants prepare concise client proposals.",
    "target_customer": "Independent consultants serving small businesses",
    "constraints": ["No customer PII", "English only"],
    "normalized_limits": {
      "max_screens": 5,
      "primary_flows": 1,
      "data_mode": "mock_or_local"
    },
    "sensitive_data_warning_acknowledged": true
  }
}
```

Response `201`, with `Location: /api/v1/companies/current` and a profile ETag:

```json
{
  "data": {
    "id": "019c1234-1234-7abc-8def-1234567890ab",
    "name": "Northstar Studio",
    "status": "ACTIVE",
    "current_profile": {
      "id": "019c1234-1234-7abc-8def-1234567890ad",
      "version": 1,
      "purpose": "Help independent consultants prepare concise client proposals.",
      "target_customer": "Independent consultants serving small businesses",
      "constraints": ["No customer PII", "English only"],
      "normalized_limits": {
        "max_screens": 5,
        "primary_flows": 1,
        "data_mode": "mock_or_local"
      },
      "created_at": "2026-08-12T10:30:00.000Z"
    },
    "created_at": "2026-08-12T10:30:00.000Z"
  },
  "meta": { "correlation_id": "019c1234-1234-7abc-8def-1234567890ac", "replayed": false }
}
```

Conflicts: `409 company_already_exists`; validation/domain failures do not create either row or an event.

### `GET /companies/current`

Returns the resolved Founder's Company and current immutable profile. `404 resource_not_found` means the Founder has not provisioned a Company. Returns the current profile ETag.

### `PATCH /companies/current/profile`

Creates a new immutable profile version and atomically advances `companies.current_profile_version_id`. Requires `Idempotency-Key` and `If-Match` from the current profile. The request is a complete replacement of the versioned profile fields so frozen context is unambiguous.

```json
{
  "purpose": "Help independent consultants prepare and review client proposals.",
  "target_customer": "Independent consultants serving small businesses",
  "constraints": ["No customer PII", "English only"],
  "normalized_limits": {
    "max_screens": 5,
    "primary_flows": 1,
    "data_mode": "mock_or_local"
  },
  "sensitive_data_warning_acknowledged": true
}
```

Response `200` contains profile version 2 and its ETag. Prior rows remain readable to Runs that reference them. A stale/missing ETag produces `412`; no version or event is created.

### `POST /initiatives`

Creates the Company's active Prototype Initiative. Requires `Idempotency-Key`.

```json
{ "type": "PROTOTYPE", "title": "Proposal workspace prototype" }
```

Response `201`:

```json
{
  "data": {
    "id": "019c1234-1234-7abc-8def-123456789101",
    "type": "PROTOTYPE",
    "title": "Proposal workspace prototype",
    "status": "DRAFT",
    "current_goal_version": null,
    "created_at": "2026-08-12T10:35:00.000Z"
  },
  "meta": { "correlation_id": "019c1234-1234-7abc-8def-123456789102", "replayed": false }
}
```

The database partial unique constraint settles concurrent creation. A second non-terminal Prototype Initiative returns `409 active_initiative_exists` and creates no event. Terminal initiatives do not reopen; a later run uses a new Initiative.

### `POST /initiatives/{initiative_id}/goals`

Creates an immutable founder-authored Goal Version. With `start_run=true` (required for the first slice), the same transaction freezes a Context Snapshot, creates a Run, creates the initial Product Manager Task, assigns Run Event sequence 1, and writes the Outbox message. Requires `Idempotency-Key` and the Initiative ETag through `If-Match`.

```json
{
  "schema_version": 1,
  "goal": {
    "target_user": "Independent consultants",
    "problem": "Turning discovery notes into a reviewable proposal is slow and inconsistent.",
    "desired_outcome": "Prepare a clear proposal draft and review its sections before export.",
    "primary_flow": "Create proposal, review sections, mark ready",
    "must_haves": [
      { "id": "MH-001", "text": "Create a proposal from structured mock client data" },
      { "id": "MH-002", "text": "Review scope, timeline, and price sections" }
    ],
    "non_goals": ["Payment processing", "Real customer data", "Production deployment"],
    "visual_direction": "Calm editorial workspace with clear status hierarchy",
    "constraints": {
      "max_screens": 5,
      "primary_flows": 1,
      "client_only": true,
      "data_mode": "mock_or_local"
    },
    "reference_ids": []
  },
  "attachment_ids": [],
  "start_run": true
}
```

Response `201`, with `Location: /api/v1/runs/{run_id}` and the Initiative ETag after the goal pointer advances. Prior Company Profile Versions remain readable to Runs whose Context Snapshot references them.

```json
{
  "data": {
    "goal_version": {
      "id": "019c1234-1234-7abc-8def-123456789111",
      "version": 1,
      "schema_version": 1,
      "created_by": "FOUNDER",
      "created_at": "2026-08-12T10:40:00.000Z"
    },
    "run": {
      "id": "019c1234-1234-7abc-8def-123456789112",
      "state": "DRAFT",
      "stage": "INTAKE",
      "version": 1,
      "context_snapshot_id": "019c1234-1234-7abc-8def-123456789113",
      "workflow_version": "prototype-run/v1",
      "policy_version": "mvp-v1"
    }
  },
  "meta": { "correlation_id": "019c1234-1234-7abc-8def-123456789114", "replayed": false }
}
```

The submitted goal is never silently shortened or edited. Product-limit failures return `422 goal_out_of_scope` with machine-readable violated rules and safe narrowing suggestions; the Founder must submit a new Goal Version. Unvalidated attachment references fail the whole command.

### `GET /runs/{run_id}`

Returns persisted state only. It must not infer `working` from a worker heartbeat or generated prose.

```json
{
  "data": {
    "id": "019c1234-1234-7abc-8def-123456789112",
    "initiative_id": "019c1234-1234-7abc-8def-123456789101",
    "state": "DRAFT",
    "stage": "INTAKE",
    "version": 1,
    "workflow_version": "prototype-run/v1",
    "policy_version": "mvp-v1",
    "context": {
      "company_profile_version_id": "019c1234-1234-7abc-8def-1234567890ad",
      "goal_version_id": "019c1234-1234-7abc-8def-123456789111",
      "answer_version_ids": [],
      "company_profile": {
        "id": "019c1234-1234-7abc-8def-1234567890ad",
        "version": 1,
        "purpose": "Help independent consultants prepare concise client proposals.",
        "target_customer": "Independent consultants serving small businesses",
        "constraints": ["No customer PII", "English only"],
        "normalized_limits": {
          "max_screens": 5,
          "primary_flows": 1,
          "data_mode": "mock_or_local"
        },
        "created_at": "2026-08-12T10:30:00.000Z"
      }
    },
    "summary": {
      "task_counts": { "QUEUED": 1 },
      "pending_decisions": 0,
      "blocking_reason": null
    },
    "created_at": "2026-08-12T10:40:00.000Z",
    "updated_at": "2026-08-12T10:40:00.000Z"
  },
  "meta": { "correlation_id": "019c1234-1234-7abc-8def-123456789115" }
}
```

### `GET /runs/{run_id}/tasks`

Cursor-paginated task/edge/attempt summaries. Query: `limit` (default 50, max 100), `cursor`, `state`, `type`. Stable order is `(created_at, id)`. The cursor is opaque, signed/versioned, and bound to the tenant/run/filter set.

Response fields may include typed status, owner Employee Definition reference, predecessor IDs, attempt count, blocker/retry reason code, and bounded timestamps. Inputs/outputs are immutable references, not prompt/source bodies. Hidden reasoning and provider content are prohibited.

### `GET /runs/{run_id}/events`

Cursor-paginated, ascending Run sequence. Query: `after_sequence`, `limit` (default 100, max 200), `stage`, `type`, `task_id`, `artifact_id`, `actor_type`. A concurrent append may appear on the next request but cannot reorder an earlier sequence.

```json
{
  "data": [
    {
      "event_id": "019c1234-1234-7abc-8def-123456789116",
      "schema_version": 1,
      "type": "run_created",
      "run_sequence": 1,
      "actor": { "type": "FOUNDER", "id": "019c1234-1234-7abc-8def-123456789117" },
      "occurred_at": "2026-08-12T10:40:00.000Z",
      "correlation_id": "019c1234-1234-7abc-8def-123456789114",
      "causation_id": null,
      "audience": "FOUNDER",
      "payload": {
        "initiative_id": "019c1234-1234-7abc-8def-123456789101",
        "goal_version_id": "019c1234-1234-7abc-8def-123456789111",
        "state": "DRAFT",
        "stage": "INTAKE"
      }
    }
  ],
  "page": { "next_cursor": null, "has_more": false },
  "meta": { "correlation_id": "019c1234-1234-7abc-8def-123456789118" }
}
```

Audience projection happens before serialization. Founder events contain concise conclusions/references only, never credentials, raw prompts/completions, source bodies, attachment content, or hidden reasoning.

## Reserved v1 command contracts

These routes are reserved so the first slice does not force a breaking API later. They are not considered implemented until their linked AICO acceptance tests pass.

| Endpoint | Preconditions and atomic effect | Traceability |
|---|---|---|
| `POST /clarifications/{id}/answers` | Founder ownership, exact waiting request/version, idempotent answer version plus one resume event | SRS-FR-017–019 |
| `POST /runs/{id}/decisions` | Expected run state/gate, exact pending Artifact Version, policy allow; append decision, transition, and event | SRS-FR-021–026; AICO-006/031 |
| `POST /runs/{id}/retry` | Current blocked reason permits named recovery; new attempt/transition/event, never history mutation | SRS-FR-077–079 |
| `POST /runs/{id}/cancel` | Non-terminal Run; terminal cancel, stop-dispatch marker, termination request, event | SRS-FR-080–081 |
| `GET /artifacts/{id}/versions/{version}` | Tenant and audience projection, immutable exact version and lineage | SRS-FR-020, 024–026 |
| `GET /runs/{id}/preview` | Exact successful Build, tenant-authorized short-lived isolated access | SRS-FR-059–060 |
| `POST /runs/{id}/exports` | Final-approved exact manifest; idempotent export generation/audit | SRS-FR-070–073 |

## Command, task, and event envelopes

Every envelope has an integer `schema_version` and rejects unknown major versions before persistence or action. Contract fixtures are stored by schema version. Compatibility is backward-compatible within the supported window or performed by an explicit adapter that retains the original envelope/checksum.

### Internal command envelope

```json
{
  "command_id": "uuid",
  "schema_version": 1,
  "type": "start_prototype_run",
  "company_id": "uuid",
  "actor": { "type": "FOUNDER", "id": "uuid", "version": null },
  "correlation_id": "uuid",
  "causation_id": null,
  "idempotency_key": "uuid",
  "expected": { "initiative_version": 1, "run_state": null },
  "issued_at": "2026-08-12T10:40:00.000Z",
  "payload": { "initiative_id": "uuid", "goal_version_id": "uuid" }
}
```

The HTTP actor is re-resolved; internal envelopes do not elevate an actor merely by claiming an ID.

### Employee task envelope

```json
{
  "schema_version": 1,
  "company_id": "uuid",
  "run_id": "uuid",
  "task_id": "uuid",
  "attempt_id": "uuid",
  "correlation_id": "uuid",
  "causation_id": "uuid",
  "employee_definition": { "id": "uuid", "key": "EMP-PM", "version": 1 },
  "versions": { "workflow": "prototype-run/v1", "policy": "mvp-v1", "output_schema": "product-brief-v1", "rubric": "pm-v1" },
  "context": {
    "context_snapshot_id": "uuid",
    "artifact_version_ids": [],
    "allowed_fields": ["company.purpose", "goal.target_user", "goal.problem"]
  },
  "objective": { "type": "create_product_brief", "expected_output": "product_brief" },
  "budget": { "remaining_tokens": 20000, "remaining_cost_minor": 500 },
  "tools": []
}
```

The runtime returns a schema-valid typed result or classified failure. Free-form text cannot approve, transition, dispatch, or authorize a tool.

### Policy decision contract

Input includes actor/Employee Definition version, company, Run, Task/Attempt, current stage/state, action, exact resource parameters, approval references, remaining/reserved budget, and environment facts. Missing or stale input is deny.

Allow output is bound to `policy_version`, action, canonical resource digest, `attempt_id`, issue/expiry timestamps, and reason code. A Tool Invocation must reference the matching allow decision; a session-wide allow is invalid. Deny creates the immutable decision/event and causes zero tool side effect.

## PostgreSQL logical schema

All tenant-owned tables have `company_id uuid NOT NULL`, composite tenant foreign keys, and indexes beginning with `company_id`. All timestamps are `timestamptz`. Status text values have stable check constraints or migration-controlled enums. `created_at` is immutable. Normal API code does not update or delete version/event/decision rows.

### Identity and company

| Table | Required columns | Keys and invariants |
|---|---|---|
| `founders` | `id`, `auth_subject`, `status`, `created_at`, `updated_at` | PK `id`; unique `auth_subject`; no credential secret columns |
| `companies` | `id`, `founder_id`, `name`, `status`, `current_profile_version_id`, `row_version`, timestamps | unique `founder_id`; unique `(id, founder_id)`; current profile composite FK belongs to Company |
| `company_profile_versions` | `id`, `company_id`, `version`, `purpose`, `target_customer`, `constraints jsonb`, `normalized_limits jsonb`, acknowledgement, `created_by`, `created_at` | unique `(company_id, version)` and `(company_id, id)`; immutable; validated JSON schemas |

### Initiative and frozen context

| Table | Required columns | Keys and invariants |
|---|---|---|
| `initiatives` | `id`, `company_id`, `type`, `title`, `status`, `current_goal_version_id`, `row_version`, timestamps | unique `(company_id,id)`; partial unique active Prototype per Company; goal pointer belongs to same Initiative/Company |
| `goal_versions` | `id`, `company_id`, `initiative_id`, `version`, `schema_version`, `structured_goal jsonb`, `created_by`, `created_at` | unique `(initiative_id,version)` and `(company_id,id)`; immutable; no silent transform |
| `goal_version_attachments` | `company_id`, `goal_version_id`, `object_id`, `ordinal` | exact validated object refs; unique ordinal/ref per goal |
| `context_snapshots` | `id`, `company_id`, `company_profile_version_id`, `goal_version_id`, `created_at` | exact immutable same-company refs; unique `(company_id,id)` |
| `context_snapshot_answers` | `company_id`, `context_snapshot_id`, `answer_version_id`, `ordinal` | exact same-run/company answer refs |

### Governed runtime

| Table | Required columns | Keys and invariants |
|---|---|---|
| `runs` | `id`, `company_id`, `initiative_id`, `context_snapshot_id`, `state`, `stage`, `row_version`, workflow/policy versions, blocking/failure code, budget limits, timestamps | exact context; transition checks; terminal state cannot reopen; unique `(company_id,id)` |
| `run_event_counters` | `company_id`, `run_id`, `next_sequence` | one row/run; locked increment; no `max+1` |
| `tasks` | `id`, `company_id`, `run_id`, type, owner Employee Definition version ref, state, priority, input refs, attempt count, row version, timestamps | unique `(company_id,run_id,id)`; state/attempt constraints |
| `task_edges` | `company_id`, `run_id`, `from_task_id`, `to_task_id`, `edge_type`, `created_at` | PK edge; both composite FKs same Run; no self-edge; DAG checked before insert/commit |
| `task_attempts` | `id`, `company_id`, `run_id`, `task_id`, attempt number, idempotency key, manifests/versions, classified result, usage/cost, timestamps | unique `(task_id,attempt_number)`; scoped unique idempotency; exact Task relation |
| `artifacts` | `id`, `company_id`, `run_id`, `type`, `logical_key`, `current_version_id`, timestamps | unique logical key per Run/type; current pointer exact |
| `artifact_versions` | `id`, `company_id`, `run_id`, `artifact_id`, version/schema version, object/content ref, checksum, size, creator/version refs, lineage jsonb, `created_at` | unique `(artifact_id,version)`; immutable; checksum/size checks |
| `approvals` | `id`, `company_id`, `run_id`, gate, exact Artifact Version, founder actor, decision, feedback ref, `created_at` | append-only; one decision command/idempotency result; exact pending version |
| `policy_decisions` | `id`, tenant/run/task/attempt refs, actor/action/resource digest, context digest, policy version, result/reason, expiry, `occurred_at` | append-only; allow parameter-bound; denied Tool Invocation FK impossible |
| `tool_invocations` | `id`, tenant/task attempt, allow decision, tool/version, request digest, status/result ref, timestamps | allow decision required and matching context checked in application transaction |
| `budget_ledgers` | `company_id`, `run_id`, category, limit, reserved, consumed, row version, `updated_at` | PK Run/category; non-negative; `reserved + consumed <= limit` unless explicit terminal reconciliation state |

### Events, idempotency, and objects

| Table | Required columns | Keys and invariants |
|---|---|---|
| `events` | event ID, schema/type, company/run/sequence, actor fields, correlation/causation, audience/classification, payload, `occurred_at` | unique `(run_id,sequence)` and event ID; append-only; validated payload |
| `outbox_messages` | event ID, topic, envelope, available/lease/published timestamps, attempts, error class | unique event ID; leased claim indexes; event FK |
| `inbox_receipts` | consumer name, event ID, received/processed timestamps, result digest | PK `(consumer_name,event_id)` before side effect |
| `idempotency_records` | actor, operation, key, request digest, status, response code/body/ref, expiry, timestamps | unique `(actor_id,operation,key)`; changed digest conflicts |
| `objects` | `id`, `company_id`, purpose/type, opaque storage key, media type, size, checksum, scan/state, retention/expiry, timestamps | unique `(company_id,id)` and storage key; no public ACL; metadata precedes signed access |

Later migrations add Clarification, Employee Definition, Evaluation/Verdict/Finding, Notification, Export, and feedback tables using the same tenant/exact-version/outbox rules.

## Required indexes

Indexes are driven by scoped API and worker access, not by speculative entity fields:

- every tenant table: `(company_id, id)` unique or primary access index;
- profiles/goals/artifacts: `(company_id, parent_id, version DESC)` unique where appropriate;
- active initiative: partial unique `(company_id)` where `type='PROTOTYPE'` and status is non-terminal;
- Run list/read: `(company_id, updated_at DESC, id DESC)` and `(company_id, state, updated_at DESC)`;
- tasks: `(company_id, run_id, state, priority DESC, created_at, id)`;
- events: unique `(run_id, sequence)` plus `(company_id, run_id, type, sequence)`; optional task/artifact columns are normalized if filters require them rather than unbounded JSON expression indexes;
- outbox claim: partial `(available_at, id)` where `published_at IS NULL` plus lease expiry;
- idempotency cleanup: `(expires_at)` and unique actor/operation/key;
- objects retention: `(company_id, state, expires_at)`.

Every new index requires its target query and `EXPLAIN (ANALYZE, BUFFERS)` evidence on representative data before release. Foreign-key columns used for deletion/retention are indexed.

## Migration sequence for the first slice

1. Extensions/roles and common timestamp/UUID/check helpers; create runtime/migration grants without embedded credentials.
2. Founder, Company, Company Profile Version with pointer added after both tables exist.
3. Initiative, Goal Version, attachment reference metadata, Context Snapshot.
4. Run, counter, Task, edge, attempt, minimal Artifact/Decision/Policy/Budget foundations.
5. Event, Outbox, Inbox, Idempotency.
6. Object metadata and private bucket bootstrap contract.
7. Composite tenant foreign keys, immutability grants/triggers where selected, RLS policies, and indexes.
8. Deterministic seed/factory data in test code only; no production seed mutation.

Migration integration tests run each step, verify constraints, run rollback where safe, then migrate forward again. A deployment runs the one-shot migrator before API/worker readiness. Application roles cannot apply DDL.

## Acceptance matrix

| Check | Expected observable result | Requirements / issues |
|---|---|---|
| Create Company twice concurrently for one Founder | One Company/profile/event; other command safely conflicts or replays | SRS-FR-003–005; AICO-011/013 |
| Update profile with stale ETag | `412`; no new version/pointer/event | SRS-FR-005; AICO-013 |
| Start second active Prototype Initiative | Database-settled `409`; no partial rows | SRS-FR-007; AICO-011/016 |
| Change Company profile after Run creation | Existing snapshot still resolves prior exact profile | SRS-FR-006/012; AICO-013 |
| Reuse command key with identical request | Original status/resource; one state effect and event | SRS-FR-023/076; AICO-016/025 |
| Reuse command key with changed request | `409 idempotency_key_reused`; no second effect | SRS-FR-023/076; AICO-016/025 |
| Foreign Run/Company/Object ID | Same `404` as absent; no content, timing-sensitive metadata, or mutation | SRS-FR-001–002/092; AT-008; AICO-003/015/034 |
| Fail after state write but before transaction commit | State/event/outbox all absent | SRS-FR-038–039/074; AICO-025 |
| Crash after publish before outbox acknowledgement | Event replayed; inbox makes downstream side effect once | SRS-FR-039/076; AT-006; AICO-025 |
| Concurrent Run event append | Unique contiguous sequence under committed order; no `max+1` race | SRS-FR-038/042; AICO-025/034 |
| Invalid/unknown envelope fields/version | `400` or classified worker failure before action/persistence | SRS section 7; AICO-022 |
| Policy request lacks exact current approval/budget/attempt | Immutable deny/event and zero tool side effect | SRS-FR-085–088; AICO-006/031 |
| Run/task/event query while appending | Stable cursor/order, audience redaction, later append on next page | SRS-FR-040–043; AICO-034 |
| Fresh Docker checkout verification | Config validates, migration passes, health/readiness, tests and production build succeed | AICO-009/010 |
