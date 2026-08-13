# Tenant and Data Boundary Contract

- **Status:** Proposed AICO-003 contract; becomes normative only with accepted ADR-007 decision evidence
- **Date:** 2026-08-12
- **Scope:** A3-BOUNDARY-01, A3-DENY-01, A3-OBJECT-01
- **Authority:** SRS TD-002, TD-006, TD-009; SRS-FR-092; SRS-NFR-008-010 and 013-016
- **Related decisions:** ADR-001, ADR-003, ADR-004, and the AICO-003 tenant/object/retention selection
- **Retention authority:** DEC-013 remains open; this contract defines mechanisms and invariants, not final durations

This contract defines the tenant boundary for PostgreSQL, S3-compatible object storage, model context, generated execution, derived delivery surfaces, operational data, backup/restore, and destruction. `company_id` is the authoritative tenant key. A caller-provided company identifier, storage key, object metadata field, model value, task envelope, sandbox path, preview token, export manifest, log field, or backup label is never a trusted source of tenant authority.

If ADR-007 is accepted, normative terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** become binding in the usual RFC sense. Until then, this document is a proposed contract. A row marked **Required** is a proposed implementation obligation and must not be represented as already deployed.

## 1. Universal boundary rules

### 1.1 Trusted identity and tenant resolution

1. The Control API MUST authenticate the credential, re-resolve its subject against server-side identity state, and derive the active Founder and `company_id`. The MVP never accepts a tenant selector from a path, query, body, role claim, custom header, object key, or model output.
2. An internal worker MUST derive `company_id` from the claimed, persisted Task/Run relation. It MUST re-read and authorize every referenced row using that same tenant key. A tenant value carried in a task, event, model response, or tool result is correlation data only.
3. An operator or service identity MUST use a separate audience and explicit action permission. It has no implicit Founder authority and no general cross-tenant data browse capability.
4. Once resolved, tenant context is immutable for the request, command, attempt, signed grant, sandbox execution, preview publication, export job, deletion job, or restore job.

### 1.2 Authorization before effect

Authorization occurs at the application boundary before content lookup, object-store access, URL signing, provider/tool invocation, sandbox start, preview/export publication, mutation, or cost reservation. The authorization decision MUST bind:

- authenticated actor/service identity and audience;
- resolved `company_id`;
- action and exact resource ID/version;
- current lifecycle/state and, where relevant, Run, Task, Attempt, policy, and approval versions;
- an expiry for delegated or signed access; and
- a canonical digest when the later side effect occurs outside the authorization transaction.

Missing, malformed, stale, expired, revoked, cross-tenant, or ambiguous inputs deny. Denial is final for that attempt; downstream components MUST NOT infer permission from possession of a raw identifier or storage key.

### 1.3 Zero-unauthorized-effect denial with auditable policy decisions

Every denial covered by this contract MUST produce all of the following:

- zero response content from the protected resource;
- zero signed URL, redirect, preview credential, export credential, or sandbox credential;
- zero row/object mutation, promotion, publication, deletion, restoration, or hold change;
- zero model/provider/tool invocation, sandbox execution, task continuation, budget reservation, billable cost, unauthorized business-success event/outbox effect, or cache fill containing protected content; and
- where SRS-FR-087 applies, exactly one tenant-scoped, reason-coded, redacted `PolicyDecision` and linked denial event/outbox record. Other denials produce at most the bounded redacted security/audit record required by their owning contract. Neither record may contain a foreign identifier, object key, payload, signed URL, prompt/completion, source, attachment, or export body.

The denial record is an authorized audit mutation, not the denied business effect. It MUST NOT grant access, transition work, trigger a tool/provider/sandbox, reserve budget, or disclose whether a foreign resource exists.

Pre-authorization idempotency bookkeeping MAY record only request-local, non-sensitive replay state. It MUST neither prove resource existence nor acquire a resource-level lock in a foreign tenant.

### 1.4 Non-disclosing HTTP and internal failure policy

| Situation                                                                                          | External result                                                                                                    | Rule                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credential absent, invalid, expired, or revoked                                                    | `401 authentication_required`, `session_expired`, or `session_revoked`                                             | No resource lookup is exposed.                                                                                                                                 |
| Authenticated actor requests an unknown resource ID or a resource owned by another company         | `404 resource_not_found` with the same status, stable code, title, detail shape, headers, and bounded timing class | Tenant-owned resource existence is not disclosed. This rule includes row, object, attachment, preview, export, deletion, hold, and restore references.         |
| Authenticated actor is proven to own/see the resource, but the requested action class is forbidden | `403 action_denied`                                                                                                | Examples: a Founder attempts an operator-only hold release, or a read-authorized user attempts deletion. Ownership MUST be established before returning `403`. |
| Authenticated actor requests a known own-tenant resource in an incompatible state/version          | `409` or `412` under the API contract                                                                              | State/version details are safe only after ownership succeeds.                                                                                                  |
| Internal worker/service receives a missing or foreign reference                                    | Typed non-retryable `resource_not_found`/`tenant_scope_denied`; no content/effect                                  | Do not retry by dropping the tenant predicate or using an unscoped lookup.                                                                                     |

The service MUST NOT use provider/object-store native error bodies as the external response. Cache keys for protected lookups MUST include resolved tenant, resource version, action/audience, and policy version; a denied response MUST NOT populate a positive cache entry.

## 2. Boundary inventory

The following matrix is normative. “Authorization point” names the last trusted component that must authorize before a protected operation. “Allowed references” are exact identifiers carried across boundaries; they are not authority.

| Boundary             | Authoritative tenant key and trusted source                                                                                                              | Authorization point                                                                                                                                                        | Storage ownership and allowed references                                                                                                                                                                                                   | Non-disclosing denial and zero effect                                                                                                                                                                                                | Audit and redaction                                                                                                                                                                           | Delivery state                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relational rows      | `company_id` derived by API identity resolution or from a worker's persisted Task/Run claim                                                              | NestJS application handler/repository before query or mutation; PostgreSQL constraints reject cross-company relations                                                      | Tenant-owned tables carry `company_id`; references use exact immutable IDs/versions and composite tenant FKs. Global identity/outbox/inbox rows must resolve through an owned tenant relation before content access.                       | Unknown/foreign ID is the same `404`; no row read returned, lock, write, event, outbox, work dispatch, provider/tool call, or cost effect                                                                                            | Record action, actor class, correlation ID, own tenant, safe resource type, result/reason; never foreign IDs or row bodies                                                                    | **Partial now:** many core rows and reads are scoped and constrained. Repository abstraction/grants and full negative coverage remain required.                     |
| Object bodies        | `objects.company_id`, first written from trusted application context and rechecked against the caller/claim; bucket metadata is corroboration only       | Application object authorization service before every stage/head/get/copy/delete/sign; adapter accepts an authorized opaque reference, not an arbitrary key                | Private bucket; PostgreSQL owns object identity/lifecycle metadata. Server-generated opaque key under a tenant partition; allowed reference is `(company_id, object_id, immutable version/checksum)`                                       | Unknown/foreign object returns `404`; do not call object store, reveal metadata/body/key, sign, mutate, invoke downstream work, or charge cost                                                                                       | Audit operation, purpose, object ID only when own-tenant, version/checksum prefix if safe, decision and correlation; redact key/body/URL/credentials                                          | **Fixture only:** MinIO put/head/get/checksum and a local prefix guard exist. Production port, authorization, encryption/lifecycle, and signed access are required. |
| Attachments          | Attachment/object metadata `company_id` derived from the authenticated Founder plus the owning Goal/Run                                                  | Attachment acceptance service before upload grant, finalize, scan, attach, context inclusion, read, or delete                                                              | Body follows object rules; immutable attachment metadata binds purpose, media type, size, checksum, scan state, and exact Goal/Artifact reference. Only `CLEAN`/allowed objects may be referenced                                          | Foreign/unknown/unscanned/rejected attachment is non-disclosing `404` or safe own-tenant policy denial; no grant, body, Goal/Run mutation, context inclusion, scan-triggered publication, model/tool call, or cost                   | Record safe classification/scan result and own-tenant object ID; never filename/body, malware content, URL, or foreign ID                                                                     | **Required:** `attachment_ids` exists in current Goal storage, but no production attachment authorization/upload/scan lifecycle is implemented.                     |
| Model context        | Company from the claimed persisted Run/Task; each source row/object must match it                                                                        | Context assembler before retrieval, serialization, and provider invocation; worker revalidates current lease/policy immediately before invoke                              | PostgreSQL stores exact context manifest/digest and immutable version references; large permitted bodies remain tenant objects. Allowed refs: frozen profile, Goal/answer/artifact versions, bounded findings, rubric/policy/tool versions | Any missing/foreign/mutable/disallowed ref fails the attempt safely; no prompt assembly containing the data, provider/tool invocation, token/cost reservation/consumption, continuation, artifact, or success event                  | Store reference manifest, digest, versions, counts, usage, reason codes; prohibit prompts, completions, hidden reasoning, attachment/source bodies, credentials, signed URLs, and foreign IDs | **Partial now:** durable Run context and scoped worker queries exist. Complete allowlisted context assembler and cross-tenant fixture remain required.              |
| Sandbox input        | Company/Run/Task/Attempt from authorized persisted execution intent                                                                                      | Policy service and sandbox gateway before issuing workload identity or materializing a workspace                                                                           | A fresh run/attempt-scoped workspace; inputs are exact immutable object/artifact refs plus a checksum manifest. No host path, client path, raw object key, control DB identity, or unrelated tenant ref                                    | Invalid/foreign input denies before credential issuance/download/start; no workspace data, command, egress, tool/provider call, output, transition, or cost                                                                          | Audit manifest digest, approved command/template/dependency versions, resource limits, attempt and result class; redact source bodies, secrets, host paths, URLs                              | **Required; not implemented.** AICO-004/047-056 own execution isolation.                                                                                            |
| Sandbox output       | Inherits immutable tenant/Run/Attempt from the authorized sandbox manifest; generated content cannot select tenant                                       | Sandbox gateway validates result manifest/checksums, then application handler authorizes promotion                                                                         | Output first lands in attempt-scoped staging; accepted output becomes immutable tenant object/artifact refs only after validation and a committed metadata/event transaction                                                               | Foreign/missing/unmanifested/oversized/checksum-invalid output is quarantined or deleted by policy; no promotion, Artifact Version, preview/export, success transition, model/tool continuation, or additional cost                  | Bounded command evidence, file counts/sizes/checksums, policy/result class; redact source/output bodies, secrets, raw paths and URLs                                                          | **Required; not implemented.**                                                                                                                                      |
| Previews             | `company_id` and exact approved Build/Artifact Version from PostgreSQL; token cannot change them                                                         | Preview publication service before copying/publishing and access broker before token/signature issuance                                                                    | Separate origin, immutable preview object set/manifest, tenant/run/build ownership, expiry/revocation state. Reference is opaque preview ID plus exact manifest digest                                                                     | Unknown/foreign/unapproved/expired/revoked preview is identical `404`; no URL/token, cache fill, copy, publication, private API call, mutation, model/tool invocation, or cost                                                       | Audit publication/access/revoke metadata and safe manifest digest; never log token, signed URL, generated body, cookie, private API data, or foreign ID                                       | **Required; not implemented.** AICO-007/057-058 own preview isolation.                                                                                              |
| Exports              | `company_id` and exact final-approved artifact/build manifest from PostgreSQL                                                                            | Export command handler before job creation; export worker reauthorizes persisted intent before materialization/signing                                                     | Immutable tenant object plus export metadata, checksum, schema/template version, exact source/version lineage, expiry/deletion/hold state                                                                                                  | Unknown/foreign/unapproved/stale source is `404` or safe own-tenant conflict; no job, body, URL, source read, publish, event, model/tool call, or cost                                                                               | Audit export ID when own-tenant, source versions, digest, format, decision/result; redact body, URL/token, credentials and foreign IDs                                                        | **Required; not implemented.** AICO-069-071 own export behavior.                                                                                                    |
| Logs and telemetry   | Tenant from trusted request/attempt context; downstream log attributes are never authority                                                               | Structured logger/telemetry adapter applies allowlist and redaction before emission                                                                                        | Telemetry is non-authoritative and stored under operational access controls; tenant field MAY be a pseudonymous stable token where tenant correlation is required. References are correlation/trace IDs and safe own-tenant resource IDs   | Authorization failures emit only bounded redacted signal; telemetry failure must not cause protected payload spooling or weaken authorization. Logs cannot be used to reconstruct or authorize content                               | Never emit credentials, authorization/cookies, raw prompts/completions/reasoning, row/object/attachment/source/output/export bodies, object keys, signed URLs, or foreign IDs                 | **Partial now:** correlation and structured logging exist. Central allowlist/redaction and seeded-secret/content tests remain required.                             |
| Backups and restores | Backup catalog records environment/region/data-set policy; tenant ownership is recovered from authoritative row/object metadata, never a backup filename | Backup platform creates encrypted backups; separately authorized restore controller restores only to an isolated environment, then reconciliation authorizes any promotion | PostgreSQL backup, object versions, object metadata, policy versions, and checksums are a consistent recovery set. Restore preserves original `company_id`, immutable IDs/versions, deletion/hold tombstones, and audit ordering           | Unknown/foreign selective restore or unverified set fails closed; no overwrite/promotion to live, no object publication/URL, no workflow resume, model/tool call, or cost. Missing objects leave resources blocked, never “ready”    | Audit backup set/version, scope class, operator, restore target, checksums/counts and reconciliation result; redact bodies, keys, URLs, credentials and foreign IDs                           | **Required; not deployed.** AICO-078/082 own backup and restore proof.                                                                                              |
| Deletion             | Target `company_id` is resolved from authenticated owner/operator authority and confirmed against each target row/object                                 | Privileged deletion workflow before request acceptance and again before each phase/object command                                                                          | PostgreSQL deletion request/tombstone is authoritative; object deletion follows exact inventory. References are versioned request, policy, object set digest, approval, and idempotency key                                                | Foreign/unknown target is `404`; hold/policy/state conflict fails closed. No partial unrecorded deletion, cascade into another tenant, new URL, provider/tool invocation, or cost. Failed object delete remains pending/reconcilable | Immutable request/phase/result events, counts and reason codes; no deleted bodies, raw keys, URLs, secrets, or foreign IDs                                                                    | **Required; not implemented.** AICO-076 owns lifecycle deletion.                                                                                                    |
| Security holds       | Held resource's `company_id`; hold authority comes from separately authenticated authorized operator/legal policy, never Founder/model input alone       | Hold service before apply/release; every retention/deletion/reconciliation operation checks effective holds                                                                | Versioned immutable hold records bind company, scope/resource set, reason code, authority, start/release, and audit refs. Hold precedence protects row metadata, object versions, exports and relevant backup recovery points              | Unknown/foreign resource is `404`; known own-tenant but unauthorized action is `403`. No hold disclosure/change, deletion, expiry, overwrite, URL, workflow/provider/tool effect, or cost                                            | Record authorized operator identity, safe scope/digest, reason code, timestamps, result; restrict reason details and redact content/foreign IDs                                               | **Required; not implemented.** Hold release cannot erase history; AICO-076/078/082 and security governance own implementation.                                      |

## 3. PostgreSQL enforcement contract

### 3.1 Schema and composite tenant references

Every tenant-owned table MUST have `company_id uuid NOT NULL`, `UNIQUE (company_id, id)` when referenced, and indexes whose leading columns match tenant-scoped access paths. A relation between tenant-owned records MUST use a composite foreign key that carries the tenant:

```sql
FOREIGN KEY (company_id, run_id)
  REFERENCES runs (company_id, id)
```

For a child scoped to a Run and Task, the stronger `(company_id, run_id, task_id)` shape MUST be used when the parent exposes that key. A foreign key on `id` alone is insufficient for a tenant-owned relation. Tenant-local uniqueness MUST include `company_id` unless the identifier is intentionally global and disclosure-safe. JSON, arrays, event payloads, object metadata, and application checks MUST NOT replace an enforceable relational reference when the relationship participates in authorization, ownership, lifecycle, or exact-version approval.

Migrations MUST introduce ownership columns and constraints before code depends on them, validate any backfill, and fail closed on ambiguous or orphaned ownership. A down migration MUST reject destructive rollback after protected data has been used unless a separately reviewed preservation/forward-repair plan proves it safe.

### 3.2 Repository/query rules

1. Every tenant-owned repository method MUST require a non-null `CompanyScope`; ordinary code MUST NOT expose `findById(id)`, a raw-key object method, or an optional tenant predicate.
2. Every root query, join, subquery, update, delete, lock, count, existence check, cursor, and uniqueness pre-check MUST bind `company_id`. Joins between tenant tables MUST include tenant equality, not only globally unique IDs.
3. A worker may globally claim eligible work only through a reviewed narrow claim operation. After claim, all reads/writes MUST use the returned persisted company and revalidate ownership/state/lease before an external effect and before commit.
4. Public IDs and cursors are opaque. A cursor MUST be signed/versioned and bound to company, resource, filters, sort, and expiry.
5. An authorization query MUST return only the fields needed to decide. Content is loaded only after allow. No fallback query may retry without the tenant predicate.
6. Multi-step material changes, event/outbox creation, budget reservation, object intent, deletion phases, and hold state MUST commit atomically where they share PostgreSQL authority. External calls occur after durable intent and outside a database transaction.
7. Administrative/reporting access MUST use purpose-specific repositories or redacted views and a separate identity; a general `bypassTenant` option is prohibited.

### 3.3 PostgreSQL RLS defense in depth

RLS is **required before external alpha but is not implemented by the current migrations**. Until its separately tested rollout, application scoping and composite constraints are the primary enforcement layers; documentation, readiness, or tests MUST NOT claim RLS protection.

When implemented:

- runtime roles MUST be non-owner `NOBYPASSRLS` roles;
- each tenant transaction MUST set a transaction-local `app.company_id` only from trusted context;
- each tenant table MUST enable and force RLS with both `USING` and `WITH CHECK` policies;
- connection pooling MUST prove context does not leak between transactions;
- migrations use a separate role unavailable to application traffic; and
- publisher/maintenance work uses narrow security-definer functions or purpose-specific roles returning bounded data, never an unrestricted tenant-table bypass.

RLS never replaces application authorization, composite foreign keys, repository scoping, or adversarial tests.

## 4. Object storage contract

### 4.1 Identity, key, and metadata

The API, caller, model, tool, and sandbox MUST NOT supply a raw final storage key. The server generates an opaque object ID and key, for example:

```text
companies/{company_uuid}/{purpose}/{opaque_uuid}/{immutable_version}
```

Only the canonical key builder may create or parse this structure. Tenant segmentation is defense in depth, not authorization. A key MUST NOT contain a filename, email, user-entered title, auth subject, prompt, or other sensitive/business value.

PostgreSQL is authoritative for object ownership and lifecycle. Object-store metadata MUST at least corroborate `company_id`, opaque object ID, purpose, immutable version, and SHA-256 checksum. PostgreSQL MUST also store media type, size, checksum, scan/classification state, lifecycle state, encryption mode/key reference (never key material), retention-policy version, expiry when applicable, deletion state, and effective-hold reference. A download, promotion, preview, export, restore, or deletion MUST verify the PostgreSQL record, expected immutable version/state, object metadata, size, and checksum.

Deployed buckets MUST be private, encrypted in transit and at rest, block anonymous listing/access, use least-privilege workload identities, and enable versioning/lifecycle according to the accepted environment policy. Local MinIO is contract test infrastructure, not evidence of deployed production controls.

### 4.2 Staging and immutable promotion

Uploads and sandbox outputs first use an opaque, tenant/attempt-scoped staging key with a bounded expiry. Finalization verifies authorization, size/type policy, safety/scan result, and checksum; it then writes immutable metadata and durable promotion intent. Promotion is idempotent. A final object version is never overwritten in place. A reconciler MUST detect and safely remove expired unreferenced staging objects, retry incomplete promotion, report missing referenced objects, and quarantine checksum/ownership mismatches.

No Artifact Version, preview, export, successful Task/Run transition, or Founder-visible readiness may reference unverified staging content.

### 4.3 Signed access

A signed URL or equivalent grant MAY be issued only after application authorization and MUST be bound to:

- one exact tenant-owned opaque object/version;
- one operation (`GET` or narrowly constrained staged `PUT`), never list/copy/delete;
- an approved audience/session and purpose;
- an explicitly bounded short expiry from configuration;
- expected content type, maximum size, and checksum for upload when supported; and
- current object state, retention/deletion state, and absence of a prohibiting hold rule.

URLs MUST use TLS outside local development, MUST NOT expose provider credentials, MUST NOT be logged or persisted in events/telemetry, and MUST NOT authorize bucket listing. Access is revoked by disabling the grant/reference and denying subsequent application access; if immediate revocation of an already issued provider URL cannot be guaranteed, maximum TTL and key/version isolation are mandatory and the limitation must be documented/tested. A cache/CDN MUST key by immutable object/version and authorization context and must purge or deny on preview/export revocation or deletion.

## 5. Retention, deletion, holds, backup, and restore

### 5.1 Versioned retention without invented durations

DEC-013 remains open. No fixed retention, signed-URL, staging, preview, export, log, backup, deletion-grace, or hold duration in code or this contract is a final Product/legal promise. The implementation MUST support versioned per-data-type/environment policies with owner, effective time, classification, disposition, and policy version recorded on the governed resource or action. Defaults are finite, minimum-necessary, explicit configuration and fail closed if missing; `forever`, zero-day destructive defaults, and silent provider defaults are prohibited.

A policy change applies prospectively through an audited reconciliation plan. It MUST NOT silently rewrite immutable history, remove an active hold, or make an expired/deleted resource live again.

### 5.2 Deletion and hold invariants

Deletion is a monotonic, resumable workflow such as `ACTIVE -> DELETION_REQUESTED -> DELETING -> DELETED`, with explicit `BLOCKED_BY_HOLD`/failure evidence where necessary. The authoritative tombstone/request is committed before external deletion. Replays are idempotent. Partial failures remain visible and retryable; they never produce a false completion.

An effective security hold takes precedence over expiry, lifecycle deletion, Founder deletion, compaction, and ordinary backup expiry for its exact scope. Applying a hold does not grant read access. Releasing a hold requires separate authority, creates an immutable release record, and returns the resource to its applicable retention/deletion workflow; it never restores already verified destruction or erases audit history.

Deletion MUST cover relational material, object versions, attachments, model-context sources/caches, sandbox workspaces, previews, exports, derived caches, and eligible telemetry. Where a provider, immutable audit obligation, backup medium, or external system cannot immediately delete data, the limitation and pending state MUST be recorded and access denied; completion cannot be claimed until the applicable policy's verifiable criteria are met.

### 5.3 Backup/restore invariants

Backups MUST preserve the ability to reconcile PostgreSQL ownership/lineage with object versions/checksums, retention-policy versions, deletion tombstones, and holds. Backup encryption, access, inventory, restore, and disposal use separate least-privilege identities and audited procedures.

A restore MUST first target an isolated, non-serving environment. Before any live promotion it MUST verify schema/workflow compatibility, tenant constraints, event ordering, immutable versions, checksums, missing/orphan objects, holds, and deletions that occurred after the restore point. Restore MUST replay current deletion/hold reconciliation so old backup data cannot resurrect a deleted resource, remove a hold, publish a preview/export, resume work, or become model context. Any ambiguity blocks the affected resource and requires authorized reconciliation.

Application/config rollback is preferred. Schema-down or backup rollback after tenant/object/retention data is used MUST fail closed unless a reviewed, tested recovery plan preserves all ownership, tombstone, hold, and immutable-version evidence.

## 6. Present implementation versus required delivery

### 6.1 Present, reusable evidence

- Authentication re-resolves the Founder and Company from PostgreSQL; request context carries `companyId` and does not accept a company header/body as authority.
- Core migrations put `company_id` on most tenant-owned state and define many composite unique keys and foreign keys across Runs, Tasks, Events, Artifact Versions, waits, answers, and model invocation effects.
- Founder Run/task/event reads use `(company_id, resource_id)` and return the common `resource_not_found` response for missing/foreign IDs.
- Worker context retrieval scopes the Run and frozen version joins by company; worker effect/lease work records stable tenant ownership.
- The local S3-compatible fixture writes under a tenant prefix with tenant metadata and a SHA-256 checksum, verifies content, and exercises a fixture-local cross-prefix denial.
- Object-store configuration is fail-fast and local Compose creates a private MinIO bucket.

These are reusable controls/evidence only. They do not satisfy production object authorization, signed access, deletion, retention, hold, backup/restore, preview/export, sandbox, or comprehensive tenant-isolation proof.

### 6.2 Required before the relevant capabilities/release gates

- Introduce tenant-scoped repository ports and remove/contain raw ad hoc data access that can omit company predicates; repair remaining ID-only tenant joins/updates and constraint gaps through migrations.
- Implement an object authorization/application service and S3-compatible adapter using the key/metadata/checksum/staging/signed-access rules above; add real two-company negative tests that prove the adapter is not called on denial.
- Add immutable attachment metadata, validation/scan lifecycle, and exact tenant-aware relation tables instead of treating a JSON/array attachment ID as ownership proof.
- Implement allowlisted exact-version context assembly and assert zero provider/tool/cost effects for a foreign reference.
- Implement sandbox, preview, and export boundaries only under their owning AICO issues and this contract.
- Add centralized log/telemetry allowlists and seeded secret/content/foreign-ID leakage tests.
- Add versioned retention-policy, deletion/tombstone, hold, and object-reconciliation records and services without selecting DEC-013 durations.
- Implement backup/restore reconciliation and isolated recovery drills before claiming recoverability.
- Roll out and prove PostgreSQL RLS as defense in depth before external alpha; until then report it as absent.

## 7. Conformance and release-blocking evidence

An implementation conforms only when automated, deterministic two-company tests prove every applicable boundary. For each foreign/unknown attempt, assertions MUST cover the response/error and downstream spies/counters for database mutations, object adapter calls, signed grants, provider/tool calls, sandbox starts, preview/export work, events/outbox, task continuation, and budget/cost effects. A content/secret-seeding scan MUST cover response, logs, telemetry, events, caches, and generated evidence.

Required evidence includes:

1. composite-FK migration failures for cross-tenant row/reference writes;
2. repository cross-row read/update/delete/lock/cursor denials;
3. object head/get/put/finalize/copy/delete/sign denials before adapter invocation;
4. attachment and model-context foreign-reference denials before scan/provider/tool/cost effects;
5. sandbox input/output, preview, and export denial/isolation tests when those capabilities exist;
6. deletion/hold precedence, replay, partial-failure, and cross-tenant tests;
7. isolated restore reconciliation proving deleted data is not resurrected and holds persist;
8. RLS role/context/pool-reuse/`USING`/`WITH CHECK` tests when RLS is introduced; and
9. exact reviewed SHA, canonical verifier result, and the human approvals required by backend issue #10.

Tenant isolation and zero unauthorized business/external effect on denial are non-waivable. Where SRS-FR-087 applies, absence of the required scoped/redacted PolicyDecision/event is also blocking. A missing implementation or non-executable future boundary remains explicitly open under its owning AICO issue; documentation alone cannot convert it to a passed control.
