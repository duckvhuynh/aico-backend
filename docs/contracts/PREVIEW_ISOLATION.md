# Preview Isolation Contract

- **Status:** Proposed for AICO-007 owner acceptance
- **Contract version:** `1.0`
- **Machine-readable schema:** [`schemas/preview-isolation.v1.schema.json`](./schemas/preview-isolation.v1.schema.json)
- **Authority:** G-01, G-05; SRS TD-008; PRD-FR-040-041; SRS-FR-059-060; AT-014; AICO-003; AICO-004
- **Decision child:** `duckvhuynh/aico-backend#20`

This contract defines the backend and delivery boundary for publishing one exact successful static build as a short-lived browser preview. It is an architecture contract, not a production Preview Service, endpoint, CDN deployment, founder UI, or AT-014 completion claim. Normative terms become binding only when the governing AICO-007 ADR is accepted at an exact semantic SHA.

The security invariant is: **generated content is untrusted static content on a control-plane-isolated origin, with no control-plane identity, cookie, storage, private control APIs, credential, service worker, or route to another preview**. Possession of an ID, object key, hostname, cached body, expired token, prior receipt, or successful sandbox result is never current authorization.

## 1. Binding rules

1. The Preview application depends on `PreviewPublicationPort`, `PreviewAccessPort`, and `PreviewLifecyclePort`; domain/application code receives no CDN, bucket, DNS, signing-provider, or platform SDK type.
2. The control plane derives actor, `company_id`, Run, Build Task/Attempt, exact Build Result receipt, artifact version, policy, expiry, and revocation authority from current PostgreSQL state. A caller, model, prompt, completion, transcript, agent memory, application session, UI/browser state, path, body, host, token claim, generated file, object key, cache, log, metric, event, or receipt is never authority.
3. Publication requires a ToolGateway intent for `preview.publish/v1` bound to the exact AICO-004 `SUCCEEDED` Build Result receipt. All five blocking commands must have succeeded and the complete output manifest must already have passed integrity validation.
4. Every binding uses immutable IDs, versions, and `sha256:<64 lowercase hexadecimal>` digests. `latest`, mutable tags, path-selected versions, inferred checksums, and partially qualified references are invalid.
5. A publication is immutable. Rebuild, expiry extension, origin/profile change, artifact change, or header/cache policy change creates a new publication version and public identity; it never mutates files beneath an existing public identity.
6. Content is staged under a non-serving identity, copied only through tenant- and purpose-scoped object capabilities, re-listed and checksum-verified, and made active by one authoritative state transition. `PREPARED`, `STAGING`, `VERIFYING`, `UNKNOWN`, `FAILED`, `QUARANTINED`, `REVOKED`, `EXPIRED`, and `CLEANUP_PENDING` content is not served.
7. The browser receives only an opaque short-lived EdDSA v1 grant. Its unencrypted JWS contains issuer, audience, opaque grant/public-preview IDs, exact host/environment/time, nonce, token-schema/key versions, and `binding_sha256`; tenant, Run, build, receipt, artifact, manifest, revocation, policy, and profile facts exist only in the server-side binding record covered by that digest.
8. Every grant issue, exchange, content request, publication, revocation, cleanup, inspection, and reconciliation rereads current PostgreSQL authority before effect. A prior `ALLOW`, signed snapshot, asynchronously replicated projection, replica read, token, session, or cached authorization never suffices in v1. Read or freshness uncertainty denies before body-cache lookup.
9. Unknown schemas, fields, enum values, algorithms, keys, profiles, media types, paths, digests, or ambiguous external outcomes fail closed. There is no fallback to unsigned access, a shared control-plane origin, an old revocation snapshot, permissive headers, a public bucket, or direct object-store URLs.
10. Denial exposes no protected content or resource-existence distinction and causes zero publication, copy, signed access, positive cache fill, preview body read, redirect to a protected body, mutation, task continuation, model/tool/sandbox call, or billable business effect. A bounded redacted denial audit record is the only permitted effect.
11. Publication, signing, access, purge, and deletion external calls never occur while PostgreSQL locks or transactions are held. Prepare/complete transactions and outbox records surround external effects.
12. Publication, grant issuance, revocation, cleanup, and reconciliation cross the external-effect boundary only through action-specific ToolGateway intents. Each intent binds `invocation_intent_id`, `decision_id`, `logical_invocation_key`, `request_digest`, the exact action and parameters/resource digests, and `max_uses=1`; ToolGateway atomically consumes use one with the prepared effect. A caller-, model-, browser-, or payload-supplied `ALLOW` is rejected.
13. Every derived request, attempt, receipt, and event has a non-null `causation_id` and distinct correlation, trace, span, and operation-attempt identities. Every receipt/event binds one immutable redaction-profile ID/version/digest and is untrusted until all schema, digest, authority, lease, bound, causation, and redaction fields validate.

## 2. Selected boundary and ports

### 2.1 Origin and network topology

Each environment has a dedicated preview registrable site that is not the control-plane site and is not a subdomain of it. Production-like examples are illustrative only:

```text
control plane: app.example.com / api.example.com
preview site:  <public-identity>.preview-example.net
```

`public_identity` is a server-generated, cryptographically random value with at least 128 bits of entropy. One immutable publication version owns one hostname. It is not a tenant ID, Run ID, artifact ID, checksum, sequential identifier, or object key. A wildcard route may terminate TLS, but host resolution must match one active authoritative publication before access validation. Unknown hosts return the same generic response as unknown publications.

The preview serving plane has:

- a separate workload identity, account/project boundary, network segment, logs, signing verifier, object prefix, cache namespace, and deployment from the control API;
- read-only access to active preview objects through opaque publication-scoped references, never the source bucket or arbitrary object keys;
- no control-plane session/authentication credential, cloud metadata route, browser-reachable private API route, general bucket listing, write capability, or internet egress from a renderer (there is no renderer in the selected client-only design); and
- a narrow server-side authorization broker whose least-privileged PostgreSQL role can read only the current preview/grant/session/publication authority needed for one request. Generated content cannot address this broker or use its database identity. V1 has no signed authorization snapshot or asynchronously stale projection fallback.

The browser also receives defense in depth: the preview site is cross-site with the control plane, control cookies are host-only/Secure/HttpOnly with no preview Domain scope, control APIs send no permissive CORS, and private APIs authenticate independently. Network isolation and API authentication remain required even if CSP is bypassed.

### 2.2 Application ports

```ts
interface PreviewPublicationPort {
  publish(
    request: PreviewPublicationRequestV1,
    signal: AbortSignal,
  ): Promise<PreviewPublicationReceiptV1>;
  inspectPublication(
    request: PreviewReconciliationRequestV1,
    signal: AbortSignal,
  ): Promise<PreviewReconciliationReceiptV1>;
}

interface PreviewAccessPort {
  issueGrant(
    request: PreviewGrantIssueRequestV1,
    signal: AbortSignal,
  ): Promise<{ grant: PreviewAccessGrantV1; receipt: PreviewGrantIssueReceiptV1 }>;
  exchange(
    attempt: PreviewAccessExchangeAttemptV1,
    signal: AbortSignal,
  ): Promise<PreviewAccessExchangeReceiptV1>;
  authorize(request: PreviewAccessRequestV1, signal: AbortSignal): Promise<PreviewAccessReceiptV1>;
}

interface PreviewLifecyclePort {
  revoke(
    request: PreviewRevocationRequestV1,
    signal: AbortSignal,
  ): Promise<PreviewRevocationReceiptV1>;
  inspectRevocation(
    request: PreviewRevocationInspectRequestV1,
    signal: AbortSignal,
  ): Promise<PreviewRevocationInspectReceiptV1>;
  cleanup(request: PreviewCleanupRequestV1, signal: AbortSignal): Promise<PreviewCleanupReceiptV1>;
  inspectCleanup(
    request: PreviewReconciliationRequestV1,
    signal: AbortSignal,
  ): Promise<PreviewReconciliationReceiptV1>;
}
```

Every mutating call and every inspection/reconciliation call is idempotent by its logical key plus request digest. Reusing a key with another digest is `CONFLICT` / `IDEMPOTENCY_KEY_REUSED` with zero external effect. Inspection only observes/reconciles the original exact request; it never creates or repeats that effect. Cancellation of a caller does not prove an external copy, token exchange, revocation, purge, or deletion stopped.

The linked JSON Schema is the normative wire representation. TypeScript names are explanatory projections.

## 3. Exact authority and publication request

`aico.preview-publication-request/1.0` binds:

- publication request, logical-idempotency, message, correlation, and causation IDs plus the canonical request digest calculated with `request_digest` omitted;
- `company_id`, Run ID/version, Build Task ID/version, Attempt ID/number, sandbox execution ID, and the exact `build_id`, Build version, Build Result receipt ID/version/digest, and workflow version/digest;
- exact artifact ID, artifact-version ID/number/checksum and source snapshot ID/version/digest;
- exact AICO-004 output-manifest ID/version/digest, positive byte/file counts, entry document, and `SUCCEEDED` build status;
- a server-loaded single-use ToolGateway intent with action exactly `preview.publish/v1`, `invocation_intent_id`, `decision_id`, `logical_invocation_key`, request/decision/parameters/resource digests, exact policy/targeting versions, exclusive expiry, and `max_uses=1`;
- preview/publication IDs and version, non-derivable public identity, environment-specific isolated origin, and exclusive availability interval;
- exact accepted origin, isolation, security-header, cache, media/path validation, access-policy, retention, and cleanup profile IDs/versions/digests; and
- positive finite object, file, path, and time limits no greater than the accepted profile.

The trusted assembler obtains all authority fields through tenant-composite relations. Before preparing a publication it locks and verifies current PostgreSQL Run/Task/Attempt state, the exact successful Build Result receipt, non-revoked artifact/output, active policy/rollout profiles, expiry, budget applicability, and kill switches. It loads the ToolGateway intent and decision from PostgreSQL; serialized intent fields are equality evidence, never caller authority. A stale, already-consumed, foreign, inconsistent, or freshness-uncertain field denies before an object adapter, signer, DNS, or cache call.

The same ToolGateway rule applies at action time to grant issuance (`preview.grant.issue/v1`), revocation (`preview.revoke/v1`), cleanup (`preview.cleanup/v1`), and inspection/reconciliation (`preview.reconcile/v1`). In the prepare transaction ToolGateway compares the exact request digest and logical invocation key, re-evaluates current policy, and atomically records use ordinal one beside the prepared effect/outbox. `max_uses` is exactly one. A retry may return the prior digest-bound result but cannot consume the intent again; a different digest conflicts. No request body accepts a free-standing `ALLOW`.

Canonical JSON uses RFC 8785 semantics over UTF-8, rejects duplicate properties and non-finite numbers, preserves array order, and includes contract/schema discriminators and every authority/profile/limit field. A self-digest is computed with only that object's digest field omitted. Adapter validators additionally enforce equal bindings across nested objects; JSON Schema cannot express all cross-field equality.

### 3.1 File and manifest admission

Only a complete manifest from the exact successful AICO-004 receipt is admissible. The publication worker must verify before copying and again before activation:

- the aggregate manifest digest, exact file count and total bytes;
- each normalized relative path, byte count, media type, content digest, and object version/checksum;
- no absolute path, empty segment, `.`/`..`, backslash, control character, percent-decoding ambiguity, Unicode normalization ambiguity, case-fold collision, duplicate normalized path, symlink, hardlink, directory escape, socket, device, FIFO, hidden control file, source map, embedded source, package cache, credential, or unmanifested file;
- an allowlisted bounded static media type and `nosniff`-compatible response type;
- one exact entry document and only relative same-publication asset references accepted by the selected validator profile;
- the persistent, non-dismissible text `Prototype only - not a live production system.` in every route/state, as frozen by the AICO-004 design/template manifest; and
- staged object metadata matching company, preview, publication version, manifest digest, relative path digest, body digest, byte count, media type, encryption/key reference, and retention policy.

HTML, CSS, JavaScript, JSON, SVG, fonts, and images remain untrusted even after checksum verification. Verification proves exact lineage, not safety. Every served type receives the security policy; downloads, unknown types, content sniffing, directory listings, range amplification, and provider-native error bodies are denied.

### 3.2 Publication protocol and receipt

The prepare transaction:

1. resolves authenticated/system authority and current tenant membership before idempotency or resource lookup;
2. locks the tenant/Run/Task/Attempt/build/artifact/output/profile/retention rows, loads the exact ToolGateway intent/decision, and reevaluates `preview.publish/v1` against the request digest;
3. on denial or conflict, writes only permitted scoped policy/audit evidence and produces no invocation consumption, publication row, or external effect;
4. on allow, inserts or verifies idempotency, atomically consumes use one, stores its consumption receipt, stores the immutable request, creates `PREPARED` publication state with a non-serving staging identity, and appends `preview.publication.requested` plus outbox; and
5. commits before dispatch.

A capability-partitioned publisher claims prepared work with a short lease. It stages exact objects, verifies the complete set independently, installs cache/origin routing in a non-serving state, and returns a receipt. One completion transaction validates the current lease and receipt, rereads current PostgreSQL authority, then atomically records immutable published-manifest metadata, transitions to `ACTIVE`, and appends the ordered result/outbox event. Only after that commit can a subsequent current PostgreSQL authorization read admit access.

`aico.preview-publication-receipt/1.0` is a closed `SUCCEEDED` / `DENIED` / `CONFLICT` / `FAILED` / `UNKNOWN` union. Success requires `PUBLISHED`, exact request and ToolGateway-consumption bindings, complete staged and verified counts, published-manifest digest, isolated hostname, applied profile digests, and active routing. Denial or conflict proves zero external effect and no intent consumption. Failure has no active manifest. Timeout, lost response, lease loss, adapter crash, or uncertain activation returns `UNKNOWN_EXTERNAL_OUTCOME`; it never becomes success through retry or elapsed time. `preview.reconcile/v1` inspects by the original logical key/request digest under a separately single-use intent. Conflicting or unverifiable material is quarantined and never routed.

## 4. Signed access and per-request authorization

### 4.1 Grant issuance

An authenticated control-plane request for an unknown or foreign Run/preview is the same `404 resource_not_found`; it signs nothing. Once own-tenant visibility is proven, ineligible state is a safe `409 preview_unavailable` or `403 action_denied` as defined by the API contract.

Grant issuance uses `aico.preview-grant-issue-request/1.0`, rereads every binding from current PostgreSQL state, and invokes ToolGateway action `preview.grant.issue/v1`. Its request digest, `invocation_intent_id`, `decision_id`, `logical_invocation_key`, and `max_uses=1` are validated and consumed atomically with the immutable grant-binding row. A prior grant, access decision, session, serialized `ALLOW`, or UI state cannot authorize issuance.

The server-side binding contains exact `company_id`; preview/publication/version and current revocation epoch; Run/Task/Attempt; `build_id`, Build version, and Build Result receipt ID/version/digest; execution/artifact/output-manifest IDs/versions/digests; content policy; and origin/isolation/header/cache/redaction profile IDs/versions/digests. `binding_sha256` is the canonical digest of that closed record.

The unencrypted browser capability is deliberately minimal. `aico.preview-access-grant/1.0` is JWS EdDSA v1 only and contains exactly:

- issuer and `PREVIEW_VIEWER` audience;
- opaque random grant ID and opaque public-preview ID;
- exact preview hostname and environment;
- issued-at, not-before, and exclusive expiry;
- random nonce, token schema version, signing key ID/version; and
- `binding_sha256`.

It contains no `company_id`, Run, Task, Attempt, internal preview/publication ID, build, Build Result receipt, sandbox execution, artifact, output manifest, revocation epoch, policy, profile, message, correlation, causation, object, or cache fact.

The raw nonce, signature, compact token, redemption query, and access URL are bearer secrets. They are returned only over TLS to the authorized caller, never persisted in plaintext, placed in an event, used as an idempotency key, accepted from a referrer, or written to logs/traces/metrics/error monitoring. Only a keyed token fingerprint or SHA-256 nonce digest may be retained for one-time redemption and replay detection.

Key selection is server-controlled. The verifier accepts only protected `typ=AICO-PREVIEW-GRANT+JWT`, `alg=EdDSA`, token schema v1, issuer, audience, and a server-selected active Ed25519 key ID/version. It rejects ES256, `none`, symmetric confusion, caller key URLs/certificates, unknown critical headers, duplicate claims, invalid canonicalization, signature malleability, and unknown/revoked versions.

`aico.preview-grant-issue-receipt/1.0` records a closed success/denied/conflict/failed/unknown outcome, current-authority evidence, ToolGateway consumption when applicable, token fingerprint, binding digest, and immutable redaction profile. It never contains nonce, signature, compact token, access URL, or session value.

### 4.2 Redemption and host-only session

The control plane returns a short-lived access URL for the exact public host. Each redemption is an idempotent `aico.preview-access-exchange-attempt/1.0` and produces `aico.preview-access-exchange-receipt/1.0`. The token endpoint:

1. checks host/public-identity agreement before resource lookup;
2. validates EdDSA v1 and the minimal claims, loads the server binding by opaque ID, recomputes `binding_sha256`, and rereads current PostgreSQL publication, Build Result receipt, epoch, key, policy, kill, and profile authority;
3. atomically consumes the nonce/grant ID once and creates the digest-bound host session; freshness uncertainty denies without consumption;
4. returns `303` to the clean same-host entry path with no credential in the location; and
5. sets an opaque preview session as `__Host-aico_preview`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, with no `Domain`, and expiry no later than the grant/publication.

Redemption and session responses use the one mandatory profile in section 5. The raw token query is stripped before access logging/tracing. A replayed nonce denies identically. The receipt distinguishes success, denial, idempotency conflict, and `UNKNOWN`; ambiguous nonce/session outcome is inspected with the same logical key before retry and is never presumed successful.

The opaque server-side session record binds `binding_sha256` and the complete current authority record, including exact Build Result receipt. It is never available to generated JavaScript. Rotating it cannot extend the original grant or publication expiry.

### 4.3 Authorization on every content request

`aico.preview-access-request/1.0` is the sanitized application-port input after transport credential parsing. It contains no raw cookie/token. For `GET` or `HEAD`, the broker validates:

1. exact environment and host/public identity;
2. the opaque host session and its server-side `binding_sha256` record;
3. `not_before <= now < expires_at` with the accepted bounded clock-skew rule;
4. current PostgreSQL revocation epoch, publication/Build Result state, global kill state, and content decision for `preview.content.read/v1`;
5. exact active publication/build/Build Result receipt/artifact/manifest/policy/profile bindings from that same current-authority read;
6. one normalized manifest path, with `/` resolving only to the manifest entry document; and
7. method, media type, byte/range limits, and rate/concurrency policy.

Authorization occurs before cache lookup. Current PostgreSQL is the v1 authority source. A signed authorization snapshot, prior `ALLOW`, validated token, session row alone, cached decision, replica/projection, or freshness guess is insufficient. Any read/transaction/freshness ambiguity denies. The allowed result supplies an opaque content handle for exactly one manifest entry; it never supplies a bucket, prefix, arbitrary object key, provider URL, signing credential, or list capability.

`aico.preview-access-receipt/1.0` is a closed `ALLOWED`/`DENIED` union. `ALLOWED` records exact non-secret bindings, path digest, response digest/size/media type, cache result, applied profiles, and redaction metadata. `DENIED` records no tenant/preview/build/artifact/path/token/session binding unless ownership was already established and the owning audit policy explicitly permits it. Every external denial is the same bounded `404 resource_not_found` response with no redirect, body detail, `Set-Cookie`, `Location`, content metadata, positive cache interaction, or provider-native error.

Authentication failure at the control-plane grant-issuance endpoint may be `401`; the isolated preview origin deliberately collapses invalid signature, unknown host, foreign tenant, wrong preview, expired grant, revoked epoch, stale policy, missing object, and inactive publication to the same `404` shape and bounded timing class. Internal reason classes are low-cardinality security evidence, not external response variations.

## 5. Mandatory response policy

There is one accepted v1 generated-content header/cache profile. It applies byte-for-byte to success assets and, where a header is meaningful, to bootstrap, exchange, redirect, denial, unavailable, and error responses; there is no caller override or alternate weaker profile:

```text
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-scripts allow-same-origin
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
Origin-Agent-Cluster: ?1
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-Permitted-Cross-Domain-Policies: none
Permissions-Policy: accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-create=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), storage-access=(), usb=(), web-share=(), xr-spatial-tracking=()
Cache-Control: private, no-store, no-transform
Pragma: no-cache
Expires: 0
CDN-Cache-Control: no-store
Surrogate-Control: no-store
```

The platform validates the serialized header set byte-for-byte against the versioned header-profile digest. HTTPS is mandatory and the preview parent owns HSTS with the accepted `max-age` and `includeSubDomains`. It must not reflect generated headers, MIME parameters, filenames, origins, or CSP fragments. `Access-Control-Allow-Origin`, credential grants, permissive `Timing-Allow-Origin`, provider debug headers, server banners, directory metadata, and source-map headers are absent. There is no range, 304, content negotiation, compression transform, attachment disposition, or object-store redirect. Unavailable/expired/revoked responses also send `Clear-Site-Data: "cache", "cookies", "storage"` where supported; this is cleanup defense, never revocation authority.

The CSP `sandbox` intentionally omits forms, popups, top navigation, downloads, pointer lock, presentation, modals, orientation lock, and storage-access escape. Generated content cannot register a service worker because `worker-src 'none'`; preview routing also reserves and denies service-worker control endpoints. Every route remains under the same exact header policy. A browser feature unsupported by a header is not considered safely enabled.

The prototype warning is content integrity inherited from the exact AICO-004 manifest. The delivery plane does not inject mutable HTML, script, analytics, a toolbar, control-plane bridge, postMessage channel, or rebuild capability. The control-plane UI displays build version, availability/expiry state, and a separately authorized rebuild action; those controls do not execute inside the untrusted preview origin.

## 6. Cache model

There are three distinct cache classes:

| Class                                    | Rule                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Browser/intermediary HTTP response cache | Every authenticated, redemption, success, denial, and error response is `private, no-store`. No response containing `Set-Cookie`, a token, authorization result, or protected body is reusable.                                                                                                                          |
| Request authorization                    | Current PostgreSQL read through the narrow broker on every request. V1 has no signed snapshot or authorization cache. Read, transaction, routing, or freshness uncertainty denies before body-cache lookup.                                                                                                              |
| Internal immutable body cache            | May store only verified bytes after authorization, keyed by `(environment, public_identity, publication_version, output_manifest_digest, normalized_path_digest, body_digest, header_profile_digest)`. A hit still reauthorizes first. It stores neither HTTP auth/session state nor tenant IDs in a client-visible key. |

Cache partition construction is versioned and collision-tested. Query strings, cookies, bearer values, caller headers, untrusted `Host` spellings, path encodings, `Vary`, and provider defaults never select body identity. Normalization happens once before both authorization and cache lookup. Negative entries contain no protected content and cannot be promoted to positive entries.

Activation may warm only already-verified immutable bodies under the non-serving/publication-specific namespace; it cannot make a route accessible. Revocation, expiry, kill, deletion, header-profile kill, or integrity failure first denies authorization globally, then enqueues purge by exact immutable namespace. A missed purge cannot restore access because authorization precedes cache lookup. Cache purge receipts are evidence, not authority.

## 7. Revocation, expiry, cleanup, and ambiguity

### 7.1 Immediate logical denial

`aico.preview-revocation-request/1.0` binds exact tenant/preview/publication/current epoch, reason, request digest, and a single-use ToolGateway `preview.revoke/v1` intent. The transaction locks and rereads current PostgreSQL authority, validates the intent/request/decision/logical key, atomically consumes use one, increments the epoch exactly once, changes serving state to `REVOKED` or `EXPIRED`, and appends event/outbox. A stale epoch or idempotency mismatch is `CONFLICT` and cannot consume or revoke another publication.

Expiry is enforced from the signed publication state and credential on every request; cleanup-worker delay never extends availability. Global and version-scoped kill switches may deny new grants and all access immediately. A hold may delay physical destruction but never serving revocation.

`aico.preview-revocation-receipt/1.0` is a closed success/denied/conflict/failed/unknown result and proves current-authority evidence plus consumption when applicable. It contains no raw grant/session. Ambiguity is resolved only through idempotent `aico.preview-revocation-inspect-request/1.0` / receipt under action `preview.reconcile/v1`; inspection never revokes. Success triggers cleanup, while purge failure cannot roll state back to active.

### 7.2 Physical cleanup

`aico.preview-cleanup-request/1.0` binds the exact inactive publication, manifest/prefix digests, retention-policy version, cleanup profile, object/file/byte expectations, cache namespace digest, not-before time, request digest, idempotency key, and one-use `preview.cleanup/v1` ToolGateway intent. It rereads current PostgreSQL authority and atomically consumes the intent with prepared cleanup before the worker:

1. revalidates that the exact publication is non-serving and the request is current;
2. acquires only a publication-scoped delete/list capability;
3. purges the exact edge namespace and invalidates origin routing;
4. deletes exact object versions and temporary/staging material under the governed retention/hold disposition;
5. lists/reconciles remaining expected and unexpected objects without broad tenant deletion; and
6. emits a bounded receipt, security signal for any extra/mismatched object, and completion event.

`aico.preview-cleanup-receipt/1.0` distinguishes `CLEANED`, `DENIED`, `CONFLICT`, `FAILED`, and `UNKNOWN`; hold/unexpected-object details are reason/state fields. `CLEANED` requires route removal, cache purge acknowledgement, zero eligible remaining objects, exact counts/digests, and invocation consumption. Partial create and failed publication use the same protocol. Unexpected objects are quarantined; broad prefix deletion is forbidden until exact ownership is reconciled.

Timeout, lost response, stale lease, or provider ambiguity remains `UNKNOWN_EXTERNAL_OUTCOME`. The same logical key is inspected before retry. Repeated delete/purge calls must be idempotent against exact object versions. Operator repair is required when the provider cannot prove outcome. Neither retry nor manual repair may reuse a public identity or mutate historical receipts.

Cleanup never deletes append-only decisions, events, receipts, object metadata required for audit, or source/build/artifact records. Those follow their own versioned retention/hold policies. Destruction completion is claimed only when all applicable provider and metadata criteria reconcile; backups must replay revocation/deletion so restore cannot republish an expired or revoked preview.

## 8. Closed outcomes, denial reasons, and events

Publication reasons are:

```text
PUBLISHED
BUILD_NOT_SUCCESSFUL
BUILD_BINDING_INVALID
OUTPUT_INTEGRITY_FAILED
UNSAFE_FILE_SET
POLICY_DENIED
PROFILE_UNSUPPORTED
ORIGIN_UNAVAILABLE
STAGING_FAILED
ACTIVATION_FAILED
UNKNOWN_EXTERNAL_OUTCOME
IDEMPOTENCY_KEY_REUSED
```

Access results and internal reason classes are:

```text
ACCESS_ALLOWED
RESOURCE_NOT_FOUND
CREDENTIAL_INVALID
CREDENTIAL_EXPIRED
CREDENTIAL_REPLAYED
REVOCATION_EPOCH_STALE
PUBLICATION_NOT_ACTIVE
BINDING_MISMATCH
POLICY_DENIED
PROFILE_UNSUPPORTED
PATH_NOT_ALLOWED
METHOD_NOT_ALLOWED
RATE_LIMITED
GLOBAL_KILL_ACTIVE
INTEGRITY_FAILED
```

Only `ACCESS_ALLOWED` is externally distinguishable as success. Every denied class at the isolated origin maps to the identical safe `404 resource_not_found`; the class is retained only in an allowlisted internal receipt when safe. `RATE_LIMITED` may drive an internal counter, but returning a distinct response for a protected/unknown host is prohibited.

Canonical events are:

```text
preview.publication.requested
preview.publication.staging
preview.publication.activated
preview.publication.failed
preview.publication.outcome_unknown
preview.grant.issued
preview.access.exchange_allowed
preview.access.exchange_denied
preview.access.allowed
preview.access.denied
preview.revoked
preview.expired
preview.cleanup.requested
preview.cleanup.completed
preview.cleanup.deferred
preview.cleanup.failed
preview.cleanup.outcome_unknown
preview.reconciliation.completed
preview.security_signal.detected
```

Every event carries schema/version; unique message/event ID; non-null causation ID; distinct correlation, trace, span, and operation-attempt IDs; immutable redaction-profile ID/version/digest; ordered Run sequence when applicable; safe exact record IDs only after tenant scope is proven; digests, result classes, times, and bounded counts. Consumers are at-least-once, deduplicate by `(consumer_name, event_id)`, and defer Run sequence gaps. An event, receipt, log, or metric is never authority.

## 9. Observability, redaction, and operations

Structured logs and traces use stable operation names and separate correlation/trace/span/operation-attempt IDs, deployment/profile versions, result/reason class, latency bucket, cache outcome, byte-count bucket, and cleanup state. Correlation IDs are not span IDs or attempt IDs, and none is authorization. Each receipt/event binds the immutable redaction profile used before export. Tenant/preview/build IDs may appear only in tenant-scoped audit storage after ownership is established; centralized operational metrics use bounded classifications or a non-reversible keyed partition label, never raw high-cardinality IDs.

The following are prohibited from logs, spans, metrics, events, receipts, exception messages, analytics, support tooling, and cache diagnostics:

- raw or hashed-without-a-key access token, nonce, session cookie, signature, `Authorization`, `Cookie`, or `Set-Cookie` value;
- full access/signed/provider URL, query string, fragment, `Location`, object key/prefix, bucket, control/private hostname, or foreign/unknown public identity;
- generated HTML/CSS/JavaScript/JSON/SVG, source body/map, filename when not allowlisted, request/response body, browser storage, referrer, user agent fingerprint, or private API response; and
- credentials, signing keys, verification-key source, database/provider errors, stack traces, or arbitrary generated strings.

Redaction happens at ingress before sampling/export and again at sinks. Query strings and credential headers are dropped, not masked. A redaction/configuration failure drops the unsafe record, emits a credential-free counter/security alert, and fails a release check; it never falls back to raw logging.

Required signals include publication/grant/exchange/access/revocation/cleanup/reconciliation rates and outcomes; p50/p95/p99 authorize and first-byte latency; PostgreSQL authority-read/freshness failure, signature/key, binding, CSP/header, integrity, cache-confusion, cross-tenant, control-API attempt, unexpected object, purge, deletion, and unknown-outcome counts; serving saturation; active/quarantined/cleanup-backlog age; and policy/profile version adoption. Alerting is symptom-based and separates safe user denial from platform failure. Numeric SLOs and paging thresholds remain versioned operational policy owned downstream, not implicit provider defaults.

Audit access is least-privileged, immutable, retention-governed, and itself audited. Security investigations use controlled correlation to tenant records; broad operational search cannot reconstruct a bearer grant or browse preview content.

## 10. Threat and evidence matrix

Release evidence must use two companies, two previews in one company, seeded credentials/content, exact deterministic fixtures, cache warm/cold paths, and downstream spies/counters. A denied case asserts both the external response and zero unauthorized effects.

| Threat or mutation                                                                                                                   | Required prevention and assertion                                                                                                                             | Evidence owner                         |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Preview requests control identity/private API by fetch, image, script, form, frame, WebSocket, navigation, or guessed host           | CSP/sandbox blocks browser action; separate site sends no control cookie; no CORS; network/API auth denies independently; zero private content and credential | AICO-057, AICO-083, AICO-085 / AT-014  |
| Cookie, local/session storage, IndexedDB, cache, service worker, opener, referrer, or postMessage escape                             | host-only HttpOnly credential, unique origin, no service worker/worker, COOP, no-referrer, frame/form/navigation sandbox restrictions, no opener/bridge       | AICO-057, AICO-083                     |
| Foreign tenant, sibling preview, swapped host/token/cookie, guessed public identity                                                  | exact host/company/preview/publication/manifest/epoch binding; identical 404; zero object/cache/body/redirect/signing effect                                  | AICO-003, AICO-057, AICO-083           |
| Expired, revoked, replayed, wrong-audience, stale-policy, old-key, or killed credential                                              | exclusive expiry, one-time nonce, per-request epoch and key/profile validation before cache; identical denial                                                 | AICO-057, AICO-083                     |
| Tampered, missing, partial, duplicate, extra, mixed-version, traversal, symlink, unsafe media, source-map, or checksum-invalid build | complete independent staging verification; no activation; quarantine and bounded signal                                                                       | AICO-004, AICO-057, AICO-083           |
| Cache-key confusion, encoding/case collision, warm-cache revocation, cached denial/auth response                                     | one normalization, exact immutable key, authorization before hit, no-store client responses, revoke-before-purge                                              | AICO-057, AICO-083                     |
| Header/CSP removal or weaker profile rollout                                                                                         | exact version/digest on every receipt/response, closed header fixtures, kill switch, no silent fallback                                                       | AICO-057, AICO-083, AICO-085           |
| Token/URL/cookie/content seeded into logs, traces, events, receipts, errors, analytics, or CDN logs                                  | ingress/sink allowlist and secret scan; unsafe record dropped; no query/header/body capture                                                                   | AICO-057, AICO-083, AICO-085           |
| Activation/copy/purge/delete timeout, crash, lease loss, duplicate dispatch, stale completion                                        | request digest idempotency, inspect/reconcile, `UNKNOWN`, current-lease completion, quarantine, no blind retry                                                | AICO-057, AICO-085                     |
| Expiry/revoke cleanup race, hold, partial-create debris, unexpected object, restore resurrection                                     | logical deny first, exact-version deletion, hold-aware deferred state, reconciliation, restore reapplies tombstones                                           | AICO-003, AICO-057, AICO-083, AICO-085 |

Decision child #20 supplies structural contract/validator evidence only. Executable fixture and adversarial proof belongs to proof child #21 and later AICO-083/AICO-085. A local hosts file, localhost ports, ordinary same-host process, Docker network, or browser-only CSP assertion does not prove production site, workload identity, CDN, DNS, cloud network, key custody, provider logs, purge, or multi-tenant isolation.

## 11. Version evolution and rollback

All v1 objects are closed with `additionalProperties: false`. Adding, removing, or renaming a required field; changing an enum, meaning, canonicalization, signature format, normalization, cache-key composition, header behavior, expiry semantics, or digest algorithm is breaking and requires a new schema/contract version.

Rollout uses expand-and-contract:

1. register immutable candidate schema, origin/isolation/header/cache/access/retention/cleanup/key profiles and compatibility edges;
2. deploy readers/verifiers for old and new versions, with contract and adversarial fixtures, before issuing new objects;
3. publish shadow/non-serving fixtures and compare canonical manifests, headers, cache behavior, receipts, redaction, and cleanup;
4. target new publications/grants to the accepted compatible set; do not mutate active publication bytes or bindings;
5. keep prior readers, verification keys, and cleanup capability for the documented maximum historical window; and
6. stop issuance, activate the kill switch, and roll targeting back to an exact previously accepted compatible set on anomaly.

There is no dual interpretation. An explicit version adapter must validate the original object against its original schema and digest, produce a new object with a new ID/version/digest and lineage, and never infer a missing security binding. Unknown or lossy conversion denies. Historical requests, grants metadata, receipts, events, and manifests remain readable under their original immutable schema; they are not rewritten.

An origin/site migration uses a new public identity and publication version on the new site. The control plane issues fresh grants only after the new publication is active. It does not redirect old bearer URLs across sites, copy cookies/storage, reuse cache keys, or CNAME the old identity to weaker policy. The old site stays deny-capable through the maximum grant/session TTL, is revoked, purged, and cleaned, then removed.

Key rotation publishes verification material before issuance, binds every grant to exact key ID/version, keeps only the minimum overlap needed for unexpired grants, and supports immediate deny by key version. Rollback never reactivates a revoked key or lowers the recorded revocation epoch. A profile vulnerability uses deny/kill plus republish under a new profile; an in-place weaker header change is forbidden.

Schema/database changes are expand/backfill/validate/contract, use text plus reviewed checks for evolving state vocabularies, preserve composite tenant foreign keys and immutable receipt fields, and have no destructive schema-down rollback after populated production use.

## 12. Traceability and ownership

| Criterion / requirement                 | Contract decision or reusable evidence                                                                                                                   | Delivery state / later owner                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Parent isolated origin/security headers | Sections 2 and 5; AICO-003 tenant boundary and AICO-004 static-only output                                                                               | Decision only; AICO-057 provisions/implements, AICO-083 attacks, AICO-085 release evidence |
| Parent signed access, expiry/revocation | Section 4 and section 7 exact signed grant/epoch protocol                                                                                                | Decision only; AICO-057 backend/platform, AICO-058 UX                                      |
| Parent build integrity                  | Section 3 reuses exact successful AICO-004 receipt/output manifest, then independently verifies staging                                                  | AICO-004 accepted inputs; AICO-057 productizes; AICO-083 mutation proof                    |
| Parent caching and cleanup              | Sections 6-7 authorization-before-cache and logical-deny-before-physical-cleanup                                                                         | Decision only; AICO-057 implementation, AICO-085 operations                                |
| Parent threat model/spike               | Section 10 covers control requests, cookie/storage, navigation/opener/referrer, script/connect/frame/form, foreign preview, expiry, cache, logs, cleanup | Architecture fixture only; no AT-014 claim until AICO-083/AICO-085                         |
| PRD-FR-040 / SRS-FR-059 / TD-008        | Successful immutable static output on separate site with restrictive headers and private API non-reachability                                            | Not implemented by this contract; AICO-057 and AICO-083                                    |
| PRD-FR-041 / SRS-FR-060                 | Exact AICO-004 warning integrity; metadata/rebuild remains trusted control-plane UI                                                                      | AICO-058 owns UX; AICO-047 owns productized template                                       |
| AICO-003                                | Server tenant authority, non-disclosing denial, private exact objects, retention/deletion/restore rules                                                  | Reused; preview-specific negative proof remains open                                       |
| AICO-004                                | Exact accepted static design/template/dependency/build receipt and output-manifest integrity                                                             | Reused; preview does not weaken sandbox or claim build proof                               |

This contract deliberately does not define a public Preview HTTP API, founder UI, production table migration, CDN/DNS/cloud setup, production signer/key custody, production cleanup worker, arbitrary server-generated code, SSR, preview-to-control proxy, analytics injection, final alpha numeric limits, R4 completion, or AT-014 success. Architecture acceptance requires attributable Architecture/Security and Product/Platform approval on the same exact semantic SHA; documentation alone cannot close the downstream implementation or release evidence.
