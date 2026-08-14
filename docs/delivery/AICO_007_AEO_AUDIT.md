# AICO-007 AEO, Reproduction, and Evidence Audit

**Status:** Proposed audit for AICO-007 owner acceptance
**Current readiness:** `pre-A7-READY-0`
**Audit result:** `BLOCKED`
**Reviewed:** 2026-08-14
**Parent:** `duckvhuynh/aicompanyos#7`
**Decision child:** `duckvhuynh/aico-backend#20`
**Proof child:** `duckvhuynh/aico-backend#21`

Normative words `MUST`, `MUST NOT`, `MAY`, and `BLOCKED` in this audit describe
the evidence contract. This file is not runtime authority and does not grant an
agent permission to publish, issue access, revoke, delete, contact an external
service, or approve an architecture decision.

## 1. Verdict and current truth

AICO-007 currently has a proposed ADR, proposed contract, schema reference,
closed threat plan, evidence map, and structural validator. The selected design
is a separate registrable preview site, one never-reused origin per immutable
Preview Version, exact-version brokered access, authorization before cache, and
logical denial before cleanup. These are reviewable design claims, not observed
production controls.

The package has no recorded exact-SHA Architecture/Security or Product/Platform
acceptance, no proof-child result bundle, and no production Preview Service.
Therefore it is `BLOCKED` at `pre-A7-READY-0`. Green backend tests, document
validation, a local browser fixture, generated summaries, telemetry, or sandbox
CI cannot promote readiness by themselves.

The former semantic revision `d30b76fb6aa47212450aee4cd592577f8df1300a`
and its two role-bound owner comments are historical evidence only. A bounded
semantic corrigendum changed the browser capability and response-policy contracts,
invalidating that revision as current decision authority. This package must first
pass Proposed-mode validation on a new clean semantic SHA and then receive fresh,
separate Architecture/Security and Product/Platform decisions citing that same SHA.
Until then proof child #21 remains blocked; an accepted-status metadata change is
not valid without those fresh decisions and accepted-mode hosted CI.

The earliest honest promotions are cumulative:

- `A7-READY-0` requires a complete, internally consistent document/schema
  package and passing strict structural checks.
- `A7-READY-1` additionally requires both human owner decisions on one exact
  semantic SHA.
- `A7-READY-2` additionally requires proof child #21 to pass the complete
  closed threat and real-mutation registries on that SHA.
- Production AICO-057/058 and release AICO-083/085 evidence remain separate
  later gates.

## 2. Agent discovery and deterministic reading order

An agent MUST resolve every repository-relative source against the same exact
Git SHA. A working-tree path, search index, cached excerpt, issue summary, or
this audit alone is not immutable evidence.

| Order | Stable source                                                                                                        | Machine-reader purpose                                                                                        | Current authority                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1     | [`../architecture/010-preview-isolation-selection.md`](../architecture/010-preview-isolation-selection.md)           | Decision, options, invariants, selected boundary, acceptance fields                                           | Proposed; not accepted                                                      |
| 2     | [`../contracts/PREVIEW_ISOLATION.md`](../contracts/PREVIEW_ISOLATION.md)                                             | Normative preview publication, access, response, cache, lifecycle, outcome, and ownership contract            | Proposed; binding only after ADR acceptance                                 |
| 3     | [`../contracts/schemas/preview-isolation.v1.schema.json`](../contracts/schemas/preview-isolation.v1.schema.json)     | Closed machine-readable record shapes and enums                                                               | Required input; presence and strict validation are a readiness prerequisite |
| 4     | [`AICO_007_THREAT_TEST_PLAN.md`](./AICO_007_THREAT_TEST_PLAN.md)                                                     | Closed `A7-T-*` case registry, real `A7-M-*` mutation registry, deterministic proof protocol, and limitations | Proposed proof contract                                                     |
| 5     | [`AICO_007_EVIDENCE.md`](./AICO_007_EVIDENCE.md)                                                                     | Requirements, evidence IDs, gaps, owners, and exact-SHA acceptance trace                                      | Proposed evidence map                                                       |
| 6     | [`../../scripts/validate-aico-007-architecture.mjs`](../../scripts/validate-aico-007-architecture.mjs)               | Structural consistency checks and accepted-mode gate                                                          | Executable structural check only                                            |
| 7     | [`../../scripts/prove-aico-007-validation-fail-closed.mjs`](../../scripts/prove-aico-007-validation-fail-closed.mjs) | In-memory validator mutation probes                                                                           | Validator proof only; not the real control mutations                        |
| 8     | This file                                                                                                            | AEO discoverability, causal evidence, reproduction, telemetry, action, and cumulative-readiness rules         | Descriptive audit                                                           |

Deterministic parse rules:

1. Use the stable IDs, table cells, closed enums, explicit file references, and
   exact digests. Do not derive a pass from prose sentiment.
2. Product/SRS and accepted ADRs outrank proposed ADR-010. An accepted ADR-010
   outranks this audit. PostgreSQL rows and immutable object manifests remain
   runtime authority.
3. If two sources disagree on a security binding, evidence state, registry, or
   owner, return `BLOCKED`; do not select the more permissive interpretation.
4. Missing, duplicate, renamed, skipped, unsupported, flaky, unobserved,
   cleanup-incomplete, redaction-failed, or digest-mismatched evidence is not
   `PASS`.
5. The threat case set and mutation set MUST equal their executable registries;
   minimum-count matching or prose-only coverage is insufficient.
6. `A7-READY-*` is cumulative. A higher level cannot be true if any lower-level
   prerequisite is not proven on the same applicable revision.

## 3. Stable AEO gates

The following twelve identifiers are the closed AICO-007 AEO registry. They
MUST NOT be removed, renamed, merged, or treated as optional.

| Gate        | Binding requirement                                                                                                                                                                                                                                                                                                                                                                       | Present evidence and gap                                                                                                                                                             | Required closure                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `A7-AEO-01` | **Authoritative state.** PostgreSQL and immutable object records MUST remain authority. A URL, host, token claim, edge/CDN state, cache hit, log, metric, browser state, generated content, or agent statement MUST NOT authorize publication, access, cleanup, or success.                                                                                                               | Proposed ADR/contract state this boundary; no production registry or per-request authority check exists.                                                                             | Exact-SHA decision proof, then AICO-057 schema/transaction/integration evidence and AICO-083 adversarial evidence.                       |
| `A7-AEO-02` | **Immutable publication binding.** One publication MUST bind exact company, Run, successful Build Result, Artifact Version, canonical file manifest and digest, object versions and checksums, public identity/origin, policy, header/cache profiles, expiry, revocation epoch, and lifecycle version. `latest`, partial qualification, mutable files, and silent fallback are invalid.   | Proposed contract and schema reference define the tuple; no accepted schema, database constraint, or served-byte receipt is proved.                                                  | Closed schema validation, proof-child positive/negative cases, and production database/object receipts.                                  |
| `A7-AEO-03` | **Separate current access authority.** A short-lived, revocable grant MUST bind the exact immutable publication, audience, allowed action, exclusive expiry, nonce/replay rule, signing key version, policy/profile versions, and current revocation epoch. Every request MUST reauthorize before cache/body lookup.                                                                      | Proposed signed-access and host-only session contract exists; no issuer, key custody, atomic exchange, or request-time production proof exists.                                      | Proof-child access/expiry/replay/revoke matrix; AICO-057 issuer/broker and key/profile rollout evidence.                                 |
| `A7-AEO-04` | **Generated-content isolation.** Generated bytes MUST receive no control-plane cookie, credential, private API route, unrestricted workload identity, ambient network, privileged frame/opener, service worker, cross-preview storage authority, or task-completion authority.                                                                                                            | ADR-010 and the threat plan define separate-site, unique-origin, CSP, browser, ingress, and composition boundaries; local proof and production network/browser evidence are pending. | Exact hostile browser/service fixture, production ingress/workload/network proof, then AICO-083/085 release-candidate rerun.             |
| `A7-AEO-05` | **Closed response and origin profiles.** CSP, framing, MIME, referrer, opener, permissions, download, cache, path/method, TLS/site, and service-worker controls MUST be versioned closed profiles. Callers, generated files, providers, and deployment defaults cannot weaken or add behavior.                                                                                            | Exact proposed policy is documented; no accepted serialized profile digest or production response conformance evidence exists.                                                       | Byte-normalized profile fixtures, fail-closed drift tests, browser cases, rollout/kill/rollback evidence.                                |
| `A7-AEO-06` | **Immutable lifecycle and selection.** Rebuild, republish, origin/profile change, expiry extension, rollback, and migration MUST create or select an exact new immutable version. Expiry, revocation, delete, purge, cleanup, and rollback change selection or availability only; a retired public identity is never reassigned.                                                          | Proposed lifecycle and cleanup state machines exist; no durable implementation, purge provider receipt, restore test, or non-reuse registry proof exists.                            | Proof-child lifecycle/race cases; AICO-057/076 production lifecycle and AICO-085 restore/rollback evidence.                              |
| `A7-AEO-07` | **Causal evidence graph.** Successful build -> publication intent -> action-time policy decision -> publication receipt -> access grant -> access request/receipt -> optional revoke/expiry -> cleanup/reconciliation MUST use distinct causal, correlation, event, attempt, receipt, and idempotency identities. A retry cannot overwrite history or manufacture authority.              | Contract prose and proposed records name the chain; no complete immutable graph or concurrency/restart proof exists.                                                                 | Before/after authoritative rows, exact identity/digest edges, ordered event/outbox evidence, duplicate/late/unknown outcome cases.       |
| `A7-AEO-08` | **Bounded evidence and low-cardinality telemetry.** Evidence MUST be audience-checked, classified, size-bounded, checksummed, and redacted before serialization. Metrics MAY use only reviewed finite cohorts from section 5; high-cardinality causal IDs remain restricted to authorized logs/traces and tenant audit records.                                                           | Proposed allowlists and threat canaries exist; no emitted-signal conformance, label-set ceiling, sink scan, retention implementation, or production alert simulation exists.         | Proof-child in-memory multi-sink scan; AICO-056/072 signal registry and reconciliation; AICO-077 alerts/runbooks.                        |
| `A7-AEO-09` | **Unknown and denial stay unavailable.** Expiry, revoke, delete, retry, duplicate, lease loss, late completion, provider ambiguity, and unknown outcome MUST deny access until authoritative reconciliation proves the exact state. Telemetry, a provider acknowledgement, or absence of an error cannot infer success.                                                                   | Proposed state/outcome contract and threat cases exist; no external-effect ledger or replacement-process reconciliation has run.                                                     | Proof-child crash/race/idempotency cases, then production inspect/reconcile and operator-repair evidence.                                |
| `A7-AEO-10` | **Offline deterministic proof.** The architecture fixture MUST use two synthetic companies and disjoint previews, frozen clock/IDs, pinned fixtures/profiles, disposable isolated HTTPS `.test` sites, no public DNS, no paid service, no production credential, no tenant content, no control-plane mutation, and unconditional verified cleanup.                                        | Threat protocol is specified; no complete proof-child result bundle or canonical foreground runner is present.                                                                       | Proof child #21 exact case-set run and hosted rerun on the clean accepted SHA, with bounded immutable evidence.                          |
| `A7-AEO-11` | **Fail-closed validators and real mutations.** Strict validators plus one-control-at-a-time real mutations MUST prove every binding origin, access, integrity, header, cache, lifecycle, cleanup, and evidence control fails closed. Compilation failure, empty mutation, mock-only change, exception injection, unrelated failure, or a different case failing does not kill a mutation. | Structural validator and its in-memory document/schema probes exist; these do not execute the twelve real control mutations in the threat plan.                                      | Complete unmodified threat matrix first, then each real mutation applied and killed only by its declared case, with no skip or survivor. |
| `A7-AEO-12` | **Immutable acceptance and cumulative readiness.** Every claimed level MUST use checksummed evidence bound to exact Product and Backend SHAs, clean-tree state, exact registry/profile/fixture digests, attributable owner decisions, and complete result indexes. Agent review, a green check, feature flag, or later-scope claim cannot waive missing evidence.                         | Package is proposed and `BLOCKED`; owner links and proof-child evidence are pending.                                                                                                 | Sections 8-9 must be satisfied in order; later AICO-057/058/083/085 evidence cannot be backfilled by architecture prose.                 |

## 4. Deterministic evidence and causal reconstruction

### 4.1 Closed claim states

Every machine-readable assertion MUST use one of these states:

| State     | Meaning                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PASS`    | The required observation ran on the declared exact revision and all required assertions, side-effect ledgers, redaction checks, and cleanup checks passed.      |
| `FAIL`    | The observation ran and a required assertion, invariant, mutation kill, redaction check, or cleanup check failed.                                               |
| `BLOCKED` | Required input, owner authority, environment capability, observation, evidence, or safe cleanup is missing/unknown. It MUST NOT be coerced to `PASS` or `FAIL`. |

Required cases do not support `SKIP`, `FLAKY_PASS`, `EXPECTED_FAILURE`, or a
semantic waiver. `NOT_APPLICABLE` is valid only for a later-owner evidence row
whose non-applicability is itself explicitly declared in the closed registry;
it cannot remove an AICO-007 required case.

### 4.2 Assertion record

Each retained assertion MUST be closed, bounded, and independently joinable:

| Field                         | Rule                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema_version`              | Exact supported evidence schema; unknown version is `BLOCKED`.                                                                                      |
| `assertion_id`                | Stable A7 gate, threat, mutation, verification, or acceptance ID.                                                                                   |
| `claim_scope`                 | One of `STRUCTURE`, `ARCHITECTURE_PROOF`, `PRODUCTION`, or `RELEASE_CANDIDATE`.                                                                     |
| `result` / `reason_class`     | Closed state above plus bounded allowlisted reason; no free-form exception text.                                                                    |
| `product_sha` / `backend_sha` | Full 40-hex SHAs for the evaluated revisions; a dirty-tree assertion is recorded separately and blocks acceptance.                                  |
| `input_digests`               | Contract, schema, registry, fixture, header/profile, runtime, image, and browser digests required by the assertion.                                 |
| `causal_ids`                  | Bounded references to intent, decision, attempt, receipt, event, correlation, and evidence identities; distinct concepts cannot reuse one identity. |
| `observations`                | Safe result classes, exact expected/actual digest equality, bounded counts, size/duration buckets, and before/after authoritative-state digests.    |
| `side_effect_summary`         | Object/cache/control/API/event/outbox/provider/tool/sandbox/task/budget/cost counts, including explicit zeros required by denial cases.             |
| `redaction_result`            | Prohibited-canary finding count, dropped-record count, scanner version, and sink-set digest. Any prohibited finding blocks the claim.               |
| `cleanup_result`              | Closed cleanup disposition and residue counts. Missing or unknown cleanup blocks the run.                                                           |
| `evidence_digest`             | Digest of canonical bounded evidence plus producer/check version and authorized audience/retention class.                                           |

An evidence bundle MUST separate observed facts, contract requirements, and
reviewer decisions. A derived summary MAY point to observations by digest, but
it cannot become a new observation or runtime authority. If any causal edge is
missing, contradictory, cross-tenant, or bound to another SHA/profile/fixture,
the affected assertion is `BLOCKED`.

### 4.3 Required causal joins

| Transition                     | Authoritative precondition                                                                                    | New immutable evidence                                                                                                 | Forbidden inference                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Build -> publication intent    | Exact AICO-004 successful Build Result and complete accepted output manifest                                  | New publication intent/attempt with company, Run, build, artifact, manifest, policy, profile, and idempotency bindings | A successful task flag or object presence means published                  |
| Intent -> publication receipt  | Current action-time allow, verified staging copy, complete digest reconciliation, unique host/public identity | Publication receipt and ordered event/outbox bound to the intent and exact immutable tuple                             | Provider copy acknowledgement or DNS route means `AVAILABLE`               |
| Publication -> grant           | Current active publication, audience, policy/profile/key compatibility, expiry and epoch                      | New grant identity/digest and atomic one-time exchange state                                                           | Hostname, URL, signed claim, or prior allow is current access              |
| Grant -> access receipt        | Revalidated company/publication/grant/session/host/path/epoch/expiry/key/policy/profile before cache          | New request and receipt IDs, safe result class, served manifest/body/header/cache digests when allowed                 | Cache hit, HTTP 200, browser render, or log line proves authorization      |
| Active -> revoked/expired      | Locked exact lifecycle version and current epoch                                                              | Revocation/expiry receipt with old/new epoch and event/outbox                                                          | Purge success is logical revocation, or purge delay extends access         |
| Inactive -> cleaned/reconciled | Exact inactive publication, scoped object/cache/route inventory, hold and retention disposition               | Cleanup attempt/receipt with exact counts/digests and retained tombstone                                               | Timeout, missing response, partial delete, or metric silence means cleaned |

## 5. Low-cardinality telemetry contract

Metrics are navigation and alerting summaries, never evidence of tenant state or
authorization. Every label name and value MUST be registered before emission;
the registry MUST calculate and review each metric family's finite Cartesian
cardinality ceiling. Unknown raw values map to a bounded `other` or `unknown`
cohort and emit a safe schema-drift counter; they are never copied into labels.

| Allowed metric label             | Closed cohort examples                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `operation`                      | `publish`, `grant_issue`, `exchange`, `authorize`, `serve`, `revoke`, `expire`, `cleanup`, `reconcile` |
| `outcome`                        | `allowed`, `denied`, `conflict`, `failed`, `unknown`                                                   |
| `lifecycle_cohort`               | `pre_active`, `active`, `inactive`, `cleanup_pending`, `terminal`, `unknown`                           |
| `denial_cohort`                  | `credential`, `binding`, `policy`, `state`, `path_method`, `integrity`, `platform`, `kill`, `other`    |
| `profile_cohort`                 | `current`, `previous_compatible`, `unsupported`, `unknown`; never a raw profile/version ID             |
| `cache_outcome`                  | `disabled`, `miss`, `hit_verified`, `poison_rejected`, `error`                                         |
| `security_signal_cohort`         | `cross_tenant`, `control_api`, `header`, `integrity`, `cache`, `redaction`, `cleanup`, `other`         |
| `cleanup_disposition`            | `cleaned`, `deferred`, `quarantined`, `failed`, `unknown`                                              |
| `latency_bucket` / `size_bucket` | Versioned finite bucket names; never raw timestamps, durations, byte counts, or paths                  |

Metrics MUST NOT label company, actor, Run, task, attempt, build, artifact,
preview, publication, public identity, grant, nonce, request, event, correlation,
trace, idempotency, evidence, hostname, URL, origin, path, object key, digest,
header value, error text, generated content, user data, or arbitrary version.

Authorized structured logs/traces and tenant audit storage MAY carry required
opaque causal IDs only after audience and tenant scope are established. They
remain access-controlled, allowlisted, redacted, retention-governed, and
non-authoritative. No sampling policy may discard a required evidence record or
turn telemetry absence into proof of zero effects.

## 6. Evidence retention, privacy, and redaction

Retained architecture evidence MAY contain only:

- stable assertion/case/mutation IDs, full repository SHAs, clean-tree result,
  producer/check versions, and approved fixture/profile/runtime/browser/image
  digests;
- safe origin classes, closed result/reason classes, equality results, bounded
  counts and buckets, side-effect totals, redaction/drop counts, cleanup state,
  evidence file digests/sizes, audience, classification, and retention class;
- authorized opaque causal references where needed to reconcile the immutable
  assertion graph.

It MUST NOT retain raw or weakly hashed access capabilities, signed URLs,
nonces, cookies, authorization headers, query strings, fragments, referrers,
`Location`, generated or control bodies, source maps, filenames not explicitly
allowlisted, object keys/prefixes, private hosts, host filesystem paths, HAR
files, screenshots, console text, browser profiles/storage, credentials,
private API responses, foreign IDs/metadata, stack traces, SQL/provider errors,
prompts, model transcripts, or hidden reasoning.

Redaction MUST occur before serialization and again at every sink. A serializer,
redactor, audience check, retention classifier, or canary scan that cannot prove
safety drops the diagnostic and makes the applicable assertion `FAIL` or
`BLOCKED`; it never spools the raw value for later review. DEC-013 still owns
final retention durations, so this audit does not invent one.

## 7. Safe reproduction modes and agent action boundaries

Only these four modes may reconstruct or reevaluate AICO-007 evidence:

| Mode                         | Permitted behavior                                                                                                                                                                           | Prohibited behavior                                                                                                                                                                              | Required output                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `STATE_RECONSTRUCTION`       | Read authoritative publication, grant, revoke, cleanup, event/outbox, manifest, checksum, profile, and evidence records to report current legal state and causal gaps.                       | Any mutation, access issuance, cache fill, content request on behalf of a user, external call, cleanup retry, or inferred success.                                                               | Read-only causal graph with explicit missing/conflicting edges and `PASS`/`FAIL`/`BLOCKED` assertions.                               |
| `OFFLINE_REPRODUCTION`       | On a clean exact SHA, use synthetic companies/builds/previews, frozen time/IDs, pinned profiles, disposable local HTTPS `.test` origins, fake/scoped receivers, and a new evidence identity. | Public DNS, internet, paid/provider service, production credential, real tenant content, shared database, product/control-plane mutation, persistent hosting, or readiness beyond fixture scope. | Bounded result index, exact registry equality, side-effect ledgers, redaction result, and verified cleanup.                          |
| `CONTROLLED_REEVALUATION`    | Under explicit scope, create a new proof identity against immutable prior inputs using an explicitly selected evaluator/schema/profile revision and compare both lineages.                   | Rewriting an original publication, grant, receipt, lifecycle state, owner decision, fixture result, or evidence bundle; silently upgrading an old interpretation.                                | New immutable comparison evidence with old/new inputs, distinct IDs, exact digests, and no changed runtime authority.                |
| `SIDE_EFFECT_RECONCILIATION` | With separate human/service authorization, inspect an already recorded exact publication/purge/delete effect and append its observed disposition or bounded recovery decision.               | Blind retry, republish, access reissue, broad prefix delete, new effect under old authority, changed tenant/version/parameters, or treating timeout/absence as success.                          | New attempt/receipt identity linked to prior intent, exact observed state, safe disposition, and retained ambiguity when unresolved. |

An agent may discover files, parse closed registries, run read-only checks, run
the local structural validator, and propose patches within its assigned scope.
It MUST stop and request the named authority before any of these actions:

| Action                                                                      | Required authority                                                                                   | Default agent disposition                                              |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Accept ADR-010 or promote readiness                                         | Attributable Architecture/Security and separate Product/Platform decisions on the exact semantic SHA | `BLOCKED`; an agent cannot self-approve                                |
| Publish a preview or issue/redeem/reissue access                            | Production application authorization and AICO-057 implementation contract                            | Forbidden in architecture reproduction                                 |
| Revoke, purge, delete, retry, or reconcile an external effect               | Exact lifecycle authorization, scoped idempotency identity, and operator/service permission          | Read-only unless separately authorized                                 |
| Use public network, DNS, paid services, cloud accounts, or real credentials | Explicit proof/operations scope and approved environment                                             | Forbidden by default; offline proof uses disposable local dependencies |
| Post issue/PR decisions, upload evidence, deploy, or change release state   | Explicit user/human workflow authorization                                                           | Out of scope for this audit                                            |

Republication, grant reissue, cleanup retry, and controlled reevaluation always
receive a new attempt/receipt/evidence identity and retain prior immutable
evidence. A transport retry is not automatically a permitted reproduction mode.

## 8. Deterministic verification and proof boundary

From the repository root, the bounded structural command is:

```text
npm run verify:preview-architecture
```

It validates required files/content/schema and deliberately mutates validator
inputs in memory to demonstrate that the structural checks fail closed. It does
not run the hostile browser/service fixture and does not execute the real
`A7-M-*` control mutations. Passing it can satisfy only part of `A7-READY-0`.

After the ADR contains the required permanent owner evidence URLs and exact
40-hex semantic SHA, the accepted-mode structural command is:

```text
npm run verify:preview-architecture:accepted
```

Before acceptance, that command is expected to fail; bypassing it is not
evidence. The canonical proof-child foreground command, runner, bounded evidence
schema, and result bundle remain required deliverables. Until they exist and
pass, `A7-READY-2` is `BLOCKED`.

Proof child #21 MUST use two synthetic companies and previews, the exact accepted
AICO-004 output fixture semantics, pinned disposable dependencies, frozen clock
and IDs, deterministic HTTPS `.test` origins on separate registrable sites, no
external network, no paid service or production credential, and unconditional
cleanup. Positive cases bind exact served bytes, manifest, MIME, headers, cache
profile, grant, and lifecycle state. Every denial proves its stable external
class and zero unauthorized effect across object reads/body release, cache fills,
redirect/session/grant issuance, control requests, mutation, events/outbox,
providers/tools/sandbox, task continuation, budget, and cost.

The executable threat registry MUST exactly equal the document registry. After
the unmodified matrix passes, each real mutation is applied separately to an
isolated copy of the actual proof/control implementation. Only its declared
case may count as its required kill. Any missing case, skip, unsupported result,
unobserved ledger, mutation survivor, prohibited evidence, or cleanup residue
blocks the bundle.

## 9. Cumulative readiness

| Level                          | Completion condition                                                                                                                                                                                                                              | Current disposition                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `A7-READY-0 AUDITABLE`         | ADR, contract, closed schema, threat/AEO/evidence maps, stable registries, strict validator, and structural mutation probes exist, agree, and pass in Proposed mode.                                                                              | `BLOCKED`: package is still proposed and must produce a complete passing structural result on its final clean SHA. |
| `A7-READY-1 SELECTED`          | Level 0 plus TD-008 acceptance by Architecture/Security and separately Product/Platform through permanent evidence URLs on one exact semantic SHA; origin, access, integrity, header, cache, lifecycle, rollback, and scope decisions are frozen. | `BLOCKED`: both owner evidence fields are pending.                                                                 |
| `A7-READY-2 PROVED`            | Level 1 plus exact-SHA hosted fixture passes the complete closed threat registry and every real mutation with no skip, waiver, survivor, prohibited evidence, or cleanup residue. This is the minimum for parent AICO-007 completion.             | `BLOCKED`: proof child #21 result bundle is absent.                                                                |
| `A7-READY-3 IMPLEMENTED`       | Level 2 plus AICO-057/058 production publication, brokered access, UI, expiry/revocation, cleanup, telemetry, migration, and integration evidence.                                                                                                | `BLOCKED`: downstream implementation is not delivered by this package.                                             |
| `A7-READY-4 RELEASE-QUALIFIED` | Level 3 plus AICO-083/085 and applicable R4/R7 release-candidate browser, isolation, resilience, alert/kill, rollback/restore, and AT-014 acceptance evidence.                                                                                    | `BLOCKED`: no production release-candidate evidence exists.                                                        |

The local fixture cannot prove production registrable-site ownership, DNS/TLS,
certificate policy, CDN/WAF/cache configuration, workload identity, cloud
network denial, signing-key custody/rotation, provider logging/redaction, purge
semantics, backup/restore behavior, supported-browser coverage, founder UX, or
full AT-014. Those limitations remain visible even after Level 2.

The downstream evidence chain is one immutable candidate lineage, not four
independent green results. AICO-057 emits the candidate tuple binding the backend
SHA/image, schema and migration set, issuer/edge/DNS/TLS/policy/profile/config
digests, and evidence manifest. AICO-058 adds the frontend SHA/image and control
API contract digest without changing that base tuple. AICO-083 consumes that exact
tuple and emits its adversarial result digest; AICO-085 consumes the same tuple plus
the AICO-083 result. Changing any bound component invalidates later evidence and
returns the affected readiness level to `BLOCKED`.

## 10. Ownership and non-goals

| Owner                  | Boundary                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AICO-007 / backend #20 | Selects the preview-isolation architecture and closes the reviewable contract, schema, threat, AEO, trace, and structural-validation package.                 |
| Proof child #21        | Implements and runs the bounded deterministic architecture fixture, complete case registry, real mutation kills, and immutable evidence bundle.               |
| AICO-003               | Tenant/object authority, retention, deletion, holds, restore, and non-disclosing object access.                                                               |
| AICO-004               | Fixed template, sandbox, dependency, successful-build receipt, and exact output-manifest authority.                                                           |
| AICO-006               | Action-time deny-by-default policy, exact-version decision, approval, and continuation patterns.                                                              |
| AICO-057               | Production publication/access service, issuer/broker, origin/edge/object/cache/workload boundary, expiry/revocation, telemetry, cleanup, retry, and rollback. |
| AICO-058               | Founder warning, top-level safe open, exact version/availability/expiry presentation, rebuild/failure UX, accessibility, and focus behavior.                  |
| AICO-056/072/077       | Durable bounded evidence, reconciled analytics/metric allowlists, and operational alerts/runbooks.                                                            |
| AICO-076/081/082/084   | Lifecycle operations, browser compatibility, broad tenant/redaction evidence, and race/restart resilience.                                                    |
| AICO-083/085           | Release adversarial preview-isolation suite and end-to-end AT-014 acceptance proof.                                                                           |

This package does not authorize production DNS/TLS/CDN/WAF, public preview
access, a production token issuer or signer, control-plane proxy, founder UI,
generated backend, persistent public hosting, arbitrary network, production
retention duration, R4 completion, AT-014 completion, MVP completion, or alpha
readiness. Generated preview content remains an untrusted static prototype and
never receives an agent capability to act on the control plane.

## 11. Audit conclusion

The proposed package is discoverable and its intended boundaries are explicit,
but honest readiness remains `BLOCKED` at `pre-A7-READY-0`. Closure requires a
present closed schema, a passing structural package on the final clean SHA,
separate exact-SHA owner decisions, and then the full proof-child registry with
real control mutations and safe immutable evidence. No monitoring projection,
agent interpretation, local render, document count, or later production plan
can substitute for those causal observations.
