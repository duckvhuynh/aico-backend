# ADR-007: Tenant, Object-Storage, and Retention Selection

**Status:** Proposed for AICO-003 owner acceptance
**Date:** 2026-08-12
**Decision owner:** Pending human Architecture owner acceptance
**Decision evidence:** Pending
**Parent:** `duckvhuynh/aicompanyos#3`
**Implementation child:** `duckvhuynh/aico-backend#10`
**Product trace:** Goal G-05; SRS TD-002, TD-006, and TD-009; SRS-FR-086–087 and SRS-FR-092; SRS-NFR-008–010 and 013–016; PRD-NFR-004, PRD-NFR-005, PRD-NFR-007, PRD-NFR-008; PRD-OQ-004; DEC-013

## 1. Context and decision boundary

AI Company OS must prevent one company from discovering, reading, mutating, exporting, prompting with, restoring, or paying for an effect caused by another company's data. The boundary includes relational rows, object bodies, attachments, model context, sandbox inputs and outputs, previews, exports, logs, backups, deletion, and security holds. A key prefix or an unguessable identifier is not authorization.

This ADR selects the MVP isolation, object registry, access, and retention architecture. It defines contracts that later issues must implement and test; it does not add a public upload/download API, preview or export service, production backup deployment, row-level security (RLS), retention worker, deletion workflow, or security-hold service.

DEC-013 and PRD-OQ-004 remain open. This ADR selects a versioned policy mechanism and safe lifecycle semantics, but deliberately selects **no final duration** for any data type.

## 2. Authority reconciliation

- Product scope and SRS constraints are authoritative. This decision may refine them but may not weaken them.
- [ADR-003](./003-backend-platform.md) is accepted and binds this decision to a modular NestJS monolith, PostgreSQL authority, application tenant scoping, composite tenant constraints, and an S3-compatible object-store port.
- [ADR-001](./001-system-architecture.md) is still proposed. Its `company_id`, tenant-aware object port, non-disclosing denial, and separate sandbox/preview boundaries are adopted here only as inputs consistent with accepted ADR-003; this ADR does not change ADR-001's status.
- [ADR-004](./004-deployment-topology.md) is still proposed. Its local MinIO and prospective managed PostgreSQL/object-storage topology is a deployment assumption, not evidence of production encryption, lifecycle, backup, revocation, or isolation. Accepting this ADR does not accept ADR-004.
- If this narrow decision is accepted, it governs AICO-003 where a proposed broader ADR differs. A later conflict with Product/SRS or accepted ADR-003 must reopen this decision rather than silently relaxing an invariant.

## 3. Decision drivers

1. Resolve actor and `company_id` from verified server-side identity; never trust a body, route, header, object key, model output, or sandbox manifest as tenant authority.
2. Make cross-tenant and unknown-resource behavior externally indistinguishable and effect-free.
3. Keep PostgreSQL metadata authoritative for ownership, state, versions, checksums, access, retention, holds, and deletion while storing large immutable bodies in private object storage.
4. Support exact object versions, content integrity, least-privilege access, expiry, revocation, encryption, backup reconciliation, and auditable deletion.
5. Support configurable, immutable, per-type retention-policy versions without inventing DEC-013 durations.
6. Keep local Docker deterministic while preserving managed-service security seams.
7. Remain operable by a small private-alpha team and migratable to stronger physical isolation if evidence requires it.

## 4. Options considered

| Criterion                           | A — Shared schema + private shared bucket + authoritative object registry                                      | B — Schema and bucket per company                               | C — Database/account and bucket per company                              | D — Shared rows + flat/client-selected object keys             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Tenant enforcement                  | Strong with mandatory `company_id`, composite constraints, scoped repositories, and later RLS defense in depth | Strong physical namespace; application scope still required     | Strongest physical boundary; control-plane routing remains critical      | Weak: key knowledge can become authorization                   |
| Transactional ownership and lineage | Strong: one PostgreSQL transaction owns metadata/references/events                                             | Viable, but cross-schema migrations and global work are complex | Weak for MVP global workflow/operations without distributed coordination | Weak: storage and relational authority diverge                 |
| Object authorization                | Strong through registry lookup plus private storage adapter                                                    | Strong but still needs metadata authorization                   | Strong but still needs metadata authorization                            | Weak: raw keys and bucket policy carry too much authority      |
| Retention/hold consistency          | Strong through versioned policy bindings and one deletion ledger                                               | Viable; policy rollout multiplies by company                    | Viable; policy and restore orchestration are costly                      | Weak: no reliable reference or hold authority                  |
| Backup/restore                      | One coordinated relational restore plus object-version reconciliation                                          | Per-schema/bucket coordination                                  | Per-company restore is isolated but operationally expensive              | Restore can revive untracked or foreign content                |
| Local deterministic proof           | Strong with existing PostgreSQL/MinIO baseline                                                                 | Viable but fixture-heavy                                        | Weak for MVP                                                             | Superficially simple but cannot satisfy isolation requirements |
| Small-team operations               | Strong                                                                                                         | Weak as company count grows                                     | Weakest                                                                  | Strong only by omitting required controls                      |
| Future stronger isolation           | Registry/ports permit later placement by company                                                               | Natural path                                                    | Already strongest                                                        | Requires redesign                                              |

Select **Option A** for the MVP. Options B and C remain escalation paths for regulatory, regional, enterprise, or measured isolation needs. Reject Option D because prefixes, opaque IDs, signed URLs, and storage ACLs do not replace server-side ownership authorization.

## 5. Selected tenant and authorization model

### 5.1 Identity and relational state

The authenticated subject is resolved server-side to an `ActorContext`; its authorized `company_id` becomes an immutable `CompanyScope` for one request or worker operation. Caller-supplied tenant identifiers may be validated only as resource references and must match the resolved scope; they never select authority.

Every tenant-owned repository method requires `CompanyScope` and includes `company_id` in reads, writes, joins, uniqueness, and pagination cursors. Tenant descendants repeat `company_id`; composite foreign keys use `(company_id, referenced_id)` where a cross-company relation is otherwise possible. Unscoped runtime lookup helpers are prohibited. Workers carry a durable, signed or integrity-protected tenant/resource manifest, then re-authorize persisted ownership and current policy before every external read or effect.

Application authorization is mandatory. RLS under AICO-015 is defense in depth, with transaction-local company context, `NOBYPASSRLS` runtime roles, `FORCE ROW LEVEL SECURITY`, and a narrowly granted global publisher/claim path. RLS is not implemented merely by accepting this ADR.

### 5.2 Boundary inventory

| Boundary                                           | Tenant/ownership authority                                                                                              | Authorization point and required behavior                                                                                                         | Denial and audit/redaction contract                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Relational rows                                    | `company_id` columns plus tenant-aware foreign keys                                                                     | API/worker application use case and scoped repository; later RLS repeats the check                                                                | Missing/foreign returns the same `resource_not_found`; safe denial metadata only                                             |
| Object bodies and immutable artifact/source bodies | PostgreSQL object-version registry binds `company_id`, object ID, storage key, purpose, state, checksum, and references | Authorize registry row first; object adapter accepts a typed authorized reference, never a raw caller key                                         | No object request or signed grant on denial; log IDs/reason, never key, URL, or content                                      |
| Attachments                                        | Tenant-owned attachment/version metadata references one registry object version and scan state                          | Intake and retrieval authorize company, purpose, exact version, state, media/size, scan result, and disposition                                   | No content, model inclusion, or execution; record safe validation/denial class                                               |
| Model context                                      | Run/context snapshot and every included object/artifact version share `company_id`                                      | Context assembler allowlists exact authorized versions before provider dispatch and repeats current policy/consent checks                         | Abort before provider call, tokens, or cost; never log prompts or source bodies                                              |
| Sandbox inputs/outputs                             | Run-scoped execution manifest binds company, run, attempt, exact source objects, and output staging prefix              | Worker authorizes manifest; sandbox receives only time-limited run-scoped capability; output is untrusted until validated and registered          | No sandbox dispatch/cost when input ownership fails; reject foreign/unmanifested output and preserve safe security signal    |
| Preview                                            | Preview grant and immutable successful build version bind company, origin, state, expiry, and revocation generation     | Isolated preview broker/origin validates each grant and current metadata; no control-plane cookies/private API                                    | Uniform unavailable response, zero bytes, no new grant; audit safe grant/build IDs                                           |
| Export                                             | Export record/manifest and every member bind company and exact object versions                                          | Export builder authorizes all members before build; download broker re-authorizes current grant and state                                         | Entire export fails closed; never produce a partial foreign archive or signed URL                                            |
| Logs, traces, metrics, analytics                   | Correlation references only; tenant content is not an ordinary telemetry payload                                        | Schema allowlist and redaction before serialization and again at sink; access separated by operator role                                          | Drop/redact unsafe diagnostic signal; no prompts, bodies, credentials, signed URLs, or high-cardinality tenant metric labels |
| Backups and restore                                | Encrypted backup set manifest identifies environment, policy version, database point, and object inventory/checksum set | Separate backup identity; restore only into isolated environment, then reconcile tenants, tombstones, holds, and object references before traffic | A restore mismatch blocks activation; reports safe counts/digests, not tenant content                                        |
| Deletion                                           | Tenant-scoped deletion request/ledger targets explicit row and object-version sets                                      | Privileged workflow re-authorizes scope, revokes access, records intent, deletes/verifies, and records outcome                                    | Partial/unknown deletion remains blocked and retryable; never report completion from intent alone                            |
| Security/retention hold                            | Immutable hold record binds company, scope, reason class, authorizer, start/end, and allowed actions                    | Current hold is evaluated before expiry/deletion and, for incident holds, before read/export; a hold preserves but never grants access            | Unauthorized hold discovery/change is non-disclosing; audit safe hold identity/reason code, not protected content            |

Unknown ownership, corrupt metadata, an unavailable authorization dependency, stale policy, unsupported version, or company mismatch is a deny. A denial creates zero content bytes, signed access, mutation, preview/export materialization, model/tool/sandbox invocation, provider token use, or cost reservation/settlement.

## 6. Object-storage contract

### 6.1 Registry and keys

PostgreSQL owns an immutable object-version record with, at minimum:

- opaque `object_id` and `object_version_id`, `company_id`, purpose/data type, and owning aggregate/version reference;
- server-generated canonical `storage_key` and provider `storage_version_id` when supported;
- media type, byte length, checksum algorithm and SHA-256 digest;
- validation/scan and lifecycle state;
- encryption profile/key reference (never key material), creation identity/time;
- bound `retention_policy_id` and immutable policy version, calculated expiry when applicable;
- access-revocation generation, deletion/tombstone state, and active hold references.

The canonical key builder, not a client/model/sandbox, creates keys such as:

```text
companies/{company_id}/{purpose}/{object_id}/versions/{object_version_id}/{opaque_blob_id}
```

All segments are validated opaque identifiers or closed enums; original filenames and user text are metadata, never key segments. Keys are never accepted as public API resource identifiers and never authorize access. Immutable versions are never overwritten or reused.

### 6.2 Write and integrity lifecycle

1. In a transaction, authorize the owner and reserve a `PENDING_UPLOAD` object version plus a server-generated staging/final key and retention-policy binding.
2. Grant only the required operation against that one staging key with byte/type/checksum limits. Attachment rules under AICO-017 and DEC-014 must also pass before availability.
3. Verify actual byte length, SHA-256, provider checksum where available, media/safety results, and tenant metadata. A client checksum is a claim, not proof.
4. Promote/copy idempotently to the immutable final key. In one database transaction, mark it `AVAILABLE`, bind the exact owner/reference, and append the event/outbox intent.
5. A reconciler removes expired unreferenced staging data and repairs or blocks unknown promotion outcomes. It never invents an available reference.

The relational transaction and object store cannot commit atomically. Therefore `PENDING_UPLOAD`, `PENDING_PROMOTION`, `AVAILABLE`, `QUARANTINED`, `DELETE_PENDING`, `LIVE_DELETED_BACKUP_PENDING`, and `PURGED` (or equivalent explicit states) make partial outcomes visible and recoverable. Only `AVAILABLE` exact versions may be consumed.

### 6.3 Encryption and network access

Storage is private and public listing is denied. Deployed storage requires TLS in transit, platform-managed server-side encryption at rest, least-privilege workload identity, object versioning where supported, and separately scoped API, worker, sandbox staging, preview, export, backup, and migration permissions. Encryption-profile and key-reference metadata permit rotation without exposing key material. Local MinIO plaintext on an isolated Docker network is development evidence only and cannot prove SRS-NFR-009.

### 6.4 Signed and brokered access

The control plane first authorizes tenant, actor, purpose, exact object version, current state, policy, expiry, and revocation generation. An access grant is operation-specific (`GET` or bounded `PUT`), single-object, short-lived, audience-bound, disposition-bound, and non-listable. It records grant ID, actor, company, object version, purpose, issued/expiry times, and revocation generation without storing the bearer token or URL.

A raw object-store presigned URL generally cannot be revoked immediately after issuance. It therefore cannot alone satisfy SRS-NFR-014. Preview/export/download must use a broker or isolated origin that rechecks grant state on each request, or use a separately accepted mechanism with equivalent immediate revocation evidence. Backend-only presigning may be used as a very short internal hop after that check. AICO-057 and AICO-071 own implementation and proof.

## 7. Versioned retention, expiry, deletion, backup, and hold

### 7.1 Policy model without durations

Retention is a published immutable `RetentionPolicyVersion`, targeted by data type and environment. A policy defines lifecycle states, start event, duration/configuration reference, expiry action, deletion mode, hold eligibility, backup treatment, provider-retention requirements, evidence, and compatibility version. Each row/object version binds the exact policy version effective at creation; targeting a new default does not silently rewrite history. Authorized migration may explicitly rebind eligible records with an auditable decision and recomputed date.

No duration is selected here. Until Security + Product accepts DEC-013, implementations may use deterministic fixture values only, must label them non-production, store only what the approved MVP flow requires, and must not expose an unlimited/default-forever policy. Immutable/audit does not mean indefinite.

Minimum policy classes cover transactional company/run state, immutable artifact/source versions, attachments/quarantine/staging, model/provider request metadata and any permitted content, sandbox workspace/input/output/logs, previews, exports/download grants, application/security audit, operational telemetry, idempotency/inbox/outbox data, and backups/PITR.

### 7.2 Expiry and deletion semantics

Expiry first closes new access and generation, then creates a tenant-scoped idempotent deletion intent. A deletion workflow:

1. locks and re-authorizes the exact scope and current policy/hold state;
2. marks content unavailable, increments the revocation generation, and emits an auditable deletion intent transactionally;
3. deletes every live object version/replica or records why it cannot;
4. verifies absence and reconciles relational references, using tombstones/minimal audit records where integrity requires them; and
5. records live deletion separately from backup expiry and reports the honest residual state.

Foreign, held, referenced, unknown, or failed targets are not skipped silently. A partial operation remains `DELETE_PENDING` or blocked with no content access. Retrying is idempotent. Deleting metadata first, overwriting immutable keys, treating a delete marker as proof all versions are gone, or reporting backup purge before its window expires is prohibited.

### 7.3 Holds

A hold is an immutable, separately authorized record over explicit tenant resources or a company scope. It has a reason code and authorized lifecycle; it does not grant read access. A retention hold suspends expiry/deletion. An incident/security hold may additionally suspend ordinary reads, preview, export, restore activation, or new processing according to its typed actions. Conflicting deletion remains blocked and visible until an authorized hold release; release resumes the bound policy rather than inventing a new duration.

### 7.4 Backup and restore limitations

Encrypted backup/PITR sets follow their own accepted retention policy and cannot generally remove one tenant surgically. Live deletion therefore may leave encrypted content in inaccessible backups until the accepted backup window expires. This limitation and earliest purge boundary must be founder-facing before external alpha.

A restore happens into an isolated environment. Before traffic, restoration must replay the durable deletion/tombstone ledger, reapply active holds and access revocations, reconcile all object references/checksums and missing/orphaned versions, rotate environment credentials, and pass cross-tenant tests. Restore activation fails closed on unknown policy, missing ledger, checksum mismatch, tenant mismatch, or unresolved deleted content. AICO-078 owns this proof.

Provider-side retention/training is a separate boundary: no founder content may be sent until the selected provider/configuration satisfies the accepted retention, training-use/consent, deletion, and contractual policy under SRS-NFR-015 and DEC-017.

## 8. Failure semantics

| Failure                                                        | Required outcome                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Missing or foreign row/object                                  | Same external not-found family; zero disclosure or effect                                            |
| Caller supplies another `company_id` or raw key                | Ignore as authority, validate against resolved scope, deny on mismatch                               |
| Metadata commits but upload/promotion fails                    | Explicit pending/blocked state; no available reference; reconciler safely retries or removes staging |
| Object exists but metadata is missing/corrupt                  | Do not serve; quarantine/report orphan by safe digest                                                |
| Checksum, size, type, scan, owner, or exact-version mismatch   | Quarantine/deny; no context, sandbox, preview, or export use                                         |
| Authorization/policy/hold service unavailable or stale         | Fail closed; do not mint a grant or invoke an external effect                                        |
| Access revoked after grant                                     | Broker denies subsequent request; do not claim raw presigned URLs are immediately revocable          |
| Delete partially succeeds                                      | Keep blocked deletion state and evidence; no completion claim or restored access                     |
| Restore contains deleted, foreign, missing, or mismatched data | Keep restore isolated and unavailable                                                                |
| Telemetry/redaction fails                                      | Drop or replace the diagnostic signal; authoritative transaction is not reconstructed from logs      |

Security telemetry may distinguish foreign from absent resources for authorized responders, but it contains no foreign content, object key, signed URL, prompt, source, attachment body, credentials, or unbounded provider response.

## 9. Migration, compatibility, and rollback

1. Introduce additive registry/policy/hold/grant/deletion fields and tables through reviewed migrations; synchronization remains disabled.
2. Backfill a classified policy version and tenant ownership only from authoritative relations. Ambiguous records are quarantined/blocked, never guessed.
3. Deploy dual-read compatibility, validate checksums/references and two-tenant negatives, then target new writes. Contract old columns only after all supported readers and retention/deletion workers have moved.
4. A key-layout or storage-provider migration copies one immutable version to a new server-generated key, verifies bytes/checksum/encryption/tenant metadata, atomically switches the registry pointer, and retains the old version until the accepted migration policy permits deletion. Keys are never renamed in place as authority.
5. Application rollback may restore the preceding compatible reader/writer while retaining new metadata. It may not reverse a completed external deletion, resurrect expired content, remove a hold, rewrite immutable history, or retarget existing object versions.
6. After object lifecycle side effects begin, schema `down` is not a safe business rollback. Stop lifecycle workers, preserve ledgers, deploy a compatible application, and reconcile forward. A destructive down migration must fail closed when populated lifecycle data exists.

## 10. Binding invariants

Acceptance of this ADR binds later implementation to all of the following:

1. `company_id` comes from verified server-side context and scopes every row, object, attachment, context, sandbox, preview, export, log/audit view, backup restore, deletion, and hold operation.
2. Missing and foreign resources are non-disclosing; denial creates zero unauthorized business/external effect. Where SRS-FR-087 applies, one scoped, redacted PolicyDecision/event records the denial without revealing the foreign resource or authorizing a tool effect.
3. PostgreSQL registry metadata, not a raw key, URL, bucket, provider tag, model output, or client claim, is ownership authority.
4. Object keys and version identities are server-generated, tenant-scoped, immutable, non-listable, and checksum-verifiable.
5. All data types bind an immutable retention-policy version; no final duration exists until DEC-013 is accepted.
6. Holds suspend configured actions but never grant access. Deletion and restore preserve an auditable, idempotent, fail-closed state machine.
7. Encryption, signed-access expiry/revocation, provider retention, lifecycle, backup, and restore require deployment/test evidence; Compose configuration is not proof.
8. Existing rows, the `objects` table, health checks, and the MinIO fixture are reusable partial evidence only, not completion of AICO-003 or later implementation issues.

## 11. Deferred implementation and evidence ownership

| Capability/evidence                                                                        | Current truth                                                                                                           | Owning issue(s)                  |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Scoped application repositories, composite constraints, RLS, two-tenant state/object tests | Some `company_id` constraints and scoped queries exist; complete inventory/RLS/adversarial proof is missing             | AICO-015, AICO-082               |
| Object registry/service, immutable artifact lineage/checksums                              | Initial tables and a deterministic MinIO key/checksum fixture exist; production object lifecycle/authorization does not | AICO-010, AICO-039               |
| Safe attachment formats, scanning, upload/retrieval                                        | Attachments are rejected in the current foundation slice; DEC-014 is open                                               | AICO-017, AICO-082               |
| Model-context isolation and provider retention/consent                                     | Versioned local context assembly is partial; cross-context and external-provider policy proof is missing                | AICO-030–032, AICO-082           |
| Sandbox staging/output isolation                                                           | Not implemented by this ADR                                                                                             | AICO-047–052, AICO-082–083       |
| Isolated preview, expiry, revocation                                                       | Not implemented by this ADR                                                                                             | AICO-007, AICO-057, AICO-082–083 |
| Tenant-authorized export/download grants                                                   | Not implemented by this ADR                                                                                             | AICO-069–071, AICO-082           |
| Retention, deletion, hold, and final durations                                             | Mechanism selected; DEC-013 durations and implementation remain open                                                    | AICO-076, AICO-082, AICO-090–091 |
| Backup/PITR and restore reconciliation                                                     | Proposed deployment assumptions only; no production restore evidence                                                    | AICO-078, AICO-084, AICO-091     |

## 12. Traceability

| Authority / acceptance ID        | Decision coverage                                                                                                | Required later proof                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A3-ADR-01; TD-002                | Options, authority reconciliation, selected tenant model, binding invariants                                     | Human Architecture acceptance plus complete boundary/adversarial suite |
| A3-OBJECT-01; TD-006             | Authoritative registry, server keys, checksum, encryption profile, access grants, versioning, promotion/deletion | Exact-version object lifecycle and cross-tenant negative tests         |
| A3-RETENTION-01; TD-009; DEC-013 | Versioned per-type mechanism, expiry/deletion/hold/backup semantics without durations                            | Security + Product duration decision, lifecycle and restore tests      |
| SRS-FR-092                       | Tenant scope across state, object, retrieval, preview, model context, and export                                 | End-to-end two-company negative matrix                                 |
| SRS-NFR-008                      | Backup metadata/object reconciliation and isolated restore                                                       | Restore drill before external alpha                                    |
| SRS-NFR-009–010                  | Platform encryption plus application/storage isolation                                                           | Deployment review and release-blocking cross-tenant tests              |
| SRS-NFR-013–014                  | Safe attachments and expiring/revocable access                                                                   | Attachment adversarial suite and broker revocation proof               |
| SRS-NFR-015–016                  | No training without policy/consent; tamper-evident security evidence                                             | Provider/config review, redaction and immutable audit checks           |
| Goal G-05 / M-10                 | Zero critical isolation/policy incidents                                                                         | AICO-082 security suite and R7 evidence/go-no-go                       |

## 13. Human acceptance gate

This file remains proposed until an identifiable authorized human Architecture owner records `APPROVE`, the exact reviewed commit SHA, date, selected Option A, disputed sections (or `None`), and any conditions in permanent GitHub evidence. Product/Security must separately confirm that this mechanism does not close DEC-013 or promise final durations. QA/Security must accept the non-waivable boundary/threat-test plan before AICO-003 completion.

An agent-authored `Accepted` label, passing formatter, existing code, or green CI cannot substitute for those decisions. If an owner disputes a binding invariant, the ADR remains proposed and AICO-003 remains open.
