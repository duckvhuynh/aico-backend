# ADR-003: NestJS Backend Platform and Persistence Boundaries

- **Status:** Accepted for MVP foundation
- **Date:** 2026-08-12
- **Owners:** Backend Architecture
- **Decision scope:** AICO-003, AICO-006, AICO-009–016, AICO-022–025, AICO-031, AICO-034
- **Product authority:** `docs/product/SRS.md` sections 3–10

## Context

AI Company OS is a governed control plane, not a chat transcript with automation attached. The backend must preserve founder identity, tenant boundaries, exact input and artifact versions, workflow state, policy decisions, and an ordered audit history even when a process restarts or receives a command twice. Model output, worker memory, logs, analytics, and narrative status are not authoritative.

The MVP has one founder, one company, and at most one active Prototype Initiative per company. That apparent simplicity must not weaken tenant isolation because all later artifacts, model contexts, sandboxes, previews, exports, and support paths inherit the company boundary.

## Decision

Build a **modular monolith** in one repository and one deployable image, started in two process roles:

1. `api` serves the versioned control-plane REST API.
2. `worker` claims durable outbox/work items and executes orchestration/application handlers.

Both roles use the same NestJS modules and PostgreSQL schema. They do not share process memory. PostgreSQL is the system of record and transactional coordination boundary. Object bodies use an S3-compatible object store behind a port; PostgreSQL retains tenant ownership, content type, size, checksum, state, and retention metadata. No message broker is required for the first slice. A broker may be added behind the publisher/subscriber ports when fan-out requires it, without changing the state/outbox transaction.

This is intentionally not a microservice architecture. The MVP's hard problem is correct governance across one transaction boundary. Splitting services before the domain and event contracts stabilize would add distributed consistency failure modes without improving the value unit.

## Runtime and dependency policy

- Use a supported Node.js LTS line and the current supported NestJS major selected in `package.json`; the lockfile and container digest are authoritative.
- Enable TypeScript strict mode. Production compilation must contain no type errors.
- Use PostgreSQL with `timestamptz`, `uuid`, `text`, `bigint`, `numeric`, and constrained `jsonb`; do not use `timestamp without time zone` or unconstrained `varchar(n)`.
- Use TypeORM only in infrastructure adapters and migrations. It is justified by first-party NestJS integration, explicit transaction/query-runner support, PostgreSQL locking, and mature migrations. Domain and application code must not expose `Repository`, `EntityManager`, decorators, or lazy entity relations.
- Set `synchronize: false` in every environment. Forward and compensating migrations are reviewed, deterministic, and tested.
- Generate externally visible IDs as UUIDv7 in the application and store them in PostgreSQL `uuid` columns. Database constraints, not ID shape, establish ownership.
- Use JSON only for versioned structured documents/envelopes that are validated before persistence. Fields used for authorization, relations, ordering, state, uniqueness, or routine filters are relational columns.

## NestJS module boundaries

Each feature exposes an application facade and injection-token ports. Infrastructure adapters are private to the composition root. Imports must follow the direction `interface -> application -> domain`; infrastructure implements inward-facing ports.

| Module | Owns | Does not own |
|---|---|---|
| `IdentityModule` | Authentication adapter, founder resolution, session/revocation contract, actor context | Company selection from client input |
| `CompaniesModule` | Company aggregate, immutable profile versions, current pointer, company commands/queries | Initiatives or runs |
| `InitiativesModule` | Prototype Initiative and immutable Goal Versions, active-initiative invariant | Workflow transitions |
| `RunsModule` | Context Snapshot, Run aggregate, run summary queries, state transition port | Worker scheduling details |
| `TasksModule` | Task, edge, attempt persistence and graph invariants | Model/provider invocation |
| `ArtifactsModule` | Artifact identity/version metadata, lineage, checksums, object port | Direct SDK access outside adapter |
| `DecisionsModule` | Founder clarification/approval/revision decisions bound to exact versions | Policy implementation |
| `PolicyModule` | Default-deny, reason-coded, immutable contextual decisions | Tool side effects |
| `OrchestrationModule` | Workflow definitions, readiness, durable dispatch/retry/wait/cancel behavior | HTTP or ORM concerns |
| `EventsModule` | Event envelope, per-run ordering, transactional outbox, inbox deduplication | Product projections' business rules |
| `ObjectStorageModule` | Tenant-keyed S3 port, checksums, signed-access policy, retention metadata | Authorizing the caller |
| `ObservabilityModule` | Correlation, redaction, structured logs, metrics/traces ports | Product state or authorization |
| `HealthModule` | Liveness and dependency readiness | Business data |

Cross-module collaboration uses application interfaces or domain events. Circular module imports and `forwardRef` are architecture failures. A feature needing another feature's data asks its public query port or receives exact immutable references; it does not query the other module's tables through TypeORM.

## Request and command flow

1. Authentication verifies the credential and resolves an `ActorContext` from server-side state.
2. A global validation pipe rejects unknown properties and invalid types. Coercion is explicit per field.
3. The controller converts transport input into a command and calls one application handler.
4. The handler opens one transaction, resolves tenant-owned aggregates through scoped repository ports, checks idempotency and preconditions, executes domain rules, persists state, appends its event, and records the outbox message.
5. Only after commit does the controller acknowledge success. The response is stored for idempotent replay.
6. The worker claims outbox records using a bounded lease and `FOR UPDATE SKIP LOCKED`, publishes at least once, and records publication. Consumers deduplicate with an inbox table.

No controller contains business rules. No entity hook performs network I/O or publishes an event. No event is emitted before its material state commits.

## Actor and tenant resolution

`ActorContext` contains `actor_type`, `actor_id`, `auth_subject`, `company_id` when one exists, authentication strength/session ID, and correlation ID. Founder/company values come from the verified credential plus database lookup. The API never authorizes `company_id`, `founder_id`, role, or employee identity supplied in a body, query parameter, or `X-Company-Id` header.

All tenant-owned repository methods require a `CompanyScope` argument and include `company_id` in their predicates. There is no ordinary unscoped `findById` helper. A foreign tenant identifier produces the same `404 resource_not_found` response as an absent identifier; security telemetry may retain the classified denial without foreign content.

Database relations repeat `company_id` on tenant-owned rows and use composite foreign keys `(company_id, referenced_id)` wherever a child can otherwise be joined across tenants. Unique constraints include the tenant key. This makes an accidental cross-company write fail even if application authorization regresses.

Production/staging add PostgreSQL row-level security as defense in depth after the AICO-015 migration gate:

- the runtime role is `NOBYPASSRLS` and does not own tables;
- every tenant transaction sets `SET LOCAL app.company_id = '<uuid>'` before accessing tenant tables;
- tenant tables use `USING` and `WITH CHECK` against that transaction-local value and `FORCE ROW LEVEL SECURITY`;
- migrations use a separate non-runtime role;
- global outbox work is claimed through a narrowly granted database function or dedicated publisher role that returns only publishable envelopes, never arbitrary tenant rows.

Application scoping, composite constraints, and cross-tenant tests remain mandatory even with RLS. RLS is not a substitute for authorization.

## Transactions, concurrency, and idempotency

Use `READ COMMITTED` by default with explicit aggregate row locks for contested mutations. Database uniqueness and check constraints settle races. Use `SERIALIZABLE` only for a measured invariant that cannot be expressed otherwise.

Every mutating API requires `Idempotency-Key`. The idempotency record key is `(actor_id, operation, idempotency_key)` and stores a canonical request digest, lifecycle (`PROCESSING`, `SUCCEEDED`, `FAILED_REPLAYABLE`), HTTP status, safe response body/resource reference, and expiry. Reusing the key with a different digest returns `409 idempotency_key_reused`. A concurrent duplicate waits briefly for the owning transaction or returns a safe retryable conflict; it never runs the domain command twice.

Optimistic concurrency uses a monotonically increasing aggregate/resource version and a strong `ETag`. Updates require `If-Match`. Gate decisions additionally require expected run state, gate, and exact pending Artifact Version ID. A stale representation returns `412 precondition_failed`; a valid representation that violates current domain state returns `409 state_conflict`.

The first-slice goal command atomically creates the immutable Goal Version, Context Snapshot, Run, initial Product Manager Task, ordered Event, Outbox row, and idempotency result. Partial creation is impossible.

## Relational invariants and migrations

Important constraints include:

- unique `founders.auth_subject` and `companies.founder_id` (one company per founder);
- unique `(company_id, profile_version)` and `(initiative_id, goal_version)`;
- partial unique `(company_id)` for non-terminal Prototype Initiatives;
- unique `(company_id, id)` on tenant roots referenced by composite foreign keys;
- unique `(run_id, sequence)` for events and a locked per-run counter; never compute `max(sequence) + 1`;
- unique `(task_id, attempt_number)` and globally unique attempt idempotency key in its operation scope;
- unique `(artifact_id, version)` and checksum/size checks;
- task-edge endpoints constrained to the same `(company_id, run_id)`; graph acyclicity remains an application/domain transaction check;
- state, stage, actor type, decision, audience, and data classification constrained with checks or stable database enum policy selected in migrations;
- non-negative budget/cost/attempt counters and bounded numeric precision;
- `created_at` and relevant lifecycle timestamps as `timestamptz`, with database defaults where ordering evidence matters.

Immutable version, approval, event, and policy-decision tables have no application update repository. Runtime database grants deny updates/deletes except narrowly defined retention or migration procedures. Retention deletion is an audited privileged workflow and does not weaken ordinary immutability.

Migration rules:

1. Migrations are the only schema change mechanism.
2. A pull request proves clean `up`, compensating `down` where safe, and `up` again against an empty database.
3. Destructive or long-lock changes use expand/backfill/verify/contract phases.
4. Application releases remain compatible with the immediately preceding schema during rolling deployment.
5. Historical workflow/artifact/event schema versions remain readable through explicit adapters; migrations never rewrite an approval to a newer artifact version.

## Transactional event/outbox design

Each run has a counter row. While holding its row lock, a mutation increments `next_sequence`, inserts the immutable Event, and inserts the Outbox message in the same transaction. The canonical envelope has:

`event_id`, `schema_version`, `type`, `company_id`, `run_id`, `run_sequence`, `actor`, `occurred_at`, `correlation_id`, `causation_id`, `audience`, `data_classification`, and schema-validated `payload`.

Outbox rows include `available_at`, `lease_owner`, `lease_expires_at`, `attempt_count`, `published_at`, and a bounded last error classification. The worker claims batches with `FOR UPDATE SKIP LOCKED`, publishes outside the claim transaction, then marks success. A crash after publication and before acknowledgement causes a replay by design. Consumers use `(consumer_name, event_id)` inbox uniqueness before side effects and process run-sensitive projections in `run_sequence` order. Poison messages back off and eventually enter an operator-visible dead-letter state without deleting the original event.

## Configuration and secrets

Use `@nestjs/config` with a fail-fast startup schema. Configuration has typed namespaces for app, database, auth, object storage, worker, observability, retention, and bounded execution. Required values are validated before Nest starts listening. Error output names missing keys but never prints values.

- `.env.example` contains names and safe local defaults only.
- Local Docker secrets may come from an ignored `.env`; deployed secrets come from the platform secret manager.
- Production credentials are never passed to build/model contexts or written into logs, events, artifact content, analytics, or exports.
- TLS is required for deployed database/object/auth connections; local plaintext is bound to the Docker network and documented as development-only.
- The app handles `SIGTERM`: stop accepting requests, stop new claims, finish/abort within the grace period, release leases, close stores, and exit non-zero if shutdown fails.

## Logging, telemetry, and health

Emit JSON logs to stdout with request/correlation IDs and, when allowed, company/run/task/attempt IDs. Redact authorization, cookies, API keys, signed URLs, prompts/completions, source bodies, attachment content, and configured secret patterns at serializer and sink boundaries. Hidden reasoning is never an accepted telemetry field.

`GET /api/v1/health/live` reports only whether the process event loop is alive; it never performs network I/O. `GET /api/v1/health/ready` verifies PostgreSQL, migration compatibility, required object-store access for the current role, and worker lease/publisher dependencies with short timeouts. It returns no credentials or topology detail. API and worker expose role-specific readiness. Metrics must cover request latency/error, connection pool saturation, transaction retries, outbox age/attempts/dead letters, worker lease age, policy denials, and state transition failures.

## Local Docker topology

`docker compose` provides:

- `postgres`: persistent local volume, health check, database isolated from host except an optional loopback development port;
- `minio`: S3-compatible object store plus an initialization job that creates the private tenant bucket and lifecycle policy;
- `migrate`: one-shot image command; `api` and `worker` depend on successful migration and healthy dependencies;
- `api`: HTTP port exposed on loopback, non-root container user, read-only root filesystem where practical;
- `worker`: no host port, same immutable image with a different start command.

Tests do not depend on a long-running background service. The foreground verification command starts disposable Compose dependencies, migrates, runs checks/tests, and tears them down. CI uses unique database/bucket names and deterministic fake auth, object, model, and publisher adapters; no paid provider call is allowed.

## Test pyramid and CI gates

| Layer | Required proof |
|---|---|
| Static | Format, ESLint, strict TypeScript, dependency/architecture boundaries, production build |
| Schema/contract | REST DTO/OpenAPI, event/envelope fixtures, unknown-field rejection, compatibility fixtures |
| Unit | Aggregate transitions, profile/goal invariants, graph validation, policy matrix, idempotency digest, redaction |
| PostgreSQL integration | Migrations, scoped repositories, composite FKs, immutable versions, one-active constraint, RLS, row locking, transaction rollback |
| Component | Nest modules with real PostgreSQL and fake external ports; state plus event/outbox atomicity |
| End-to-end | Authenticated API through worker/event projection for the slice, duplicate/stale/cross-tenant/restart cases |
| Security/resilience | Two-company negative harness, credential/log seeding, failure before/after commit/publish acknowledgement, graceful shutdown/lease recovery |

CI blocks on one foreground `verify` workflow covering lint, format check, type check, unit/contract tests, migration `up/down/up`, PostgreSQL integration tests, production build, container build, and Compose configuration/health smoke. Coverage percentage alone is not a release gate; the named invariants and negative scenarios are.

## First implementable vertical slice

Deliver `Company -> Profile v1 -> Prototype Initiative -> Goal v1 -> Context Snapshot -> Run + initial PM task` with a read model and event timeline.

The slice includes:

1. public liveness/readiness;
2. an authentication port with production JWT/OIDC adapter boundary and deterministic test/local adapter (local bypass must fail to start in production);
3. idempotent company creation and profile version update with `ETag`/`If-Match`;
4. one-active Prototype Initiative creation;
5. immutable structured Goal Version submission that atomically starts a frozen Run and PM task;
6. tenant-scoped `GET run`, `GET tasks`, and ordered `GET events`;
7. transactional event/outbox records for every acknowledged command;
8. Dockerized PostgreSQL/object store, migrations, API/worker roles, and the CI gates above.

Slice acceptance checks:

- two founders can create isolated companies with current/prior profile and goal versions;
- the same command/key returns the same status/body/resource and one event; a changed body/key pair conflicts;
- stale `If-Match` changes nothing and emits no domain event;
- a second active initiative fails transactionally under concurrency;
- an existing Run remains bound to its original profile/goal Context Snapshot after later profile/goal versions;
- foreign company/run/object identifiers return the non-disclosing not-found problem and never mutate or leak content;
- failure injection before commit yields no state/event; failure after commit before publisher acknowledgement replays one event but downstream side effects deduplicate;
- killing/restarting the worker preserves the run and resumes eligible outbox work;
- the documented foreground verify command passes from a fresh clone.

This slice fully targets AICO-009–011 and contributes executable acceptance evidence to AICO-003, AICO-010, AICO-013, AICO-015–016, AICO-022–025, and AICO-034. AICO-012 is complete only after the selected invite-only identity provider and revocation lifecycle replace the local/test adapter. AICO-006 and AICO-031 require the separate policy/exact-version gate slice.

## Consequences

### Positive

- The hardest integrity properties live inside one PostgreSQL transaction.
- Explicit ports keep TypeORM, S3, identity, models, and future transport replaceable.
- The API and worker scale independently without divergent domain implementations.
- Tenant, version, idempotency, and event-order invariants are testable before model or sandbox integration.

### Costs and risks

- Repeated tenant keys and composite foreign keys add migration and repository ceremony.
- RLS requires transaction-local scope discipline and separate migration/publisher roles.
- An outbox is at-least-once, so every consumer must implement inbox deduplication.
- A modular monolith needs enforced import rules or it will decay into cross-module repository access.

## Rejected alternatives

- **Early microservices:** rejected because approvals, transitions, artifacts, and events need an atomic consistency boundary and the MVP load does not justify distributed transactions.
- **In-memory queues or event emitter as authority:** rejected because process restart would lose waits/work and violate SRS-FR-074–076.
- **Redis/BullMQ as the only durable source:** rejected because it cannot atomically commit relational state and the canonical event without an outbox.
- **Client-provided tenant headers:** rejected because identity and company scope must be resolved server-side.
- **TypeORM entities as domain models:** rejected because persistence behavior would leak across modules and make invariants/transactions implicit.
- **Automatic schema synchronization:** rejected because it is not reviewable or rollback-safe and can destroy historical compatibility.

## Traceability

| Decision area | Requirements / work items | Acceptance evidence |
|---|---|---|
| Tenant and storage boundaries | SRS-FR-001–002, 092; SRS-NFR-009–016; AICO-003, AICO-015 | Composite-FK/RLS migrations, two-company negative suite, object-key tests |
| Exact versions/concurrency | SRS-FR-005–006, 021–026; AICO-006, AICO-013, AICO-016 | ETag/stale/duplicate tests, immutable rows, frozen snapshot test |
| Platform bootstrap | SRS CMP-02–10/15; SRS-NFR-005–010; AICO-009–010 | Fresh Compose setup, readiness, migration and build gates |
| Core schema | SRS section 4.1; SRS-FR-003–012; AICO-011 | Migration constraints/factories and transactional negative tests |
| Envelopes/state | SRS sections 5 and 7; SRS-FR-033–044, 074–079; AICO-022–024 | Contract fixtures and complete transition/graph tests |
| Events/outbox | SRS-FR-038–039, 076; SRS section 7.3; AT-006; AICO-025 | Commit/publish failure injection and inbox replay test |
| Policy boundary | SRS-FR-035–036, 084–092; AICO-031 | Default-deny decision/tool-side-effect matrix |
| Founder query surface | SRS-FR-040–043; AICO-034 | Pagination/filter/redaction/cross-tenant API tests |
