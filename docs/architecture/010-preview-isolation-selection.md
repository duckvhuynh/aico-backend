# ADR-010: Isolated Preview Origin and Delivery Selection

**Status:** Accepted for AICO-007
**Date:** 2026-08-14
**Architecture/Security evidence:** https://github.com/duckvhuynh/aico-backend/pull/23#issuecomment-5291254107
**Product/Platform evidence:** https://github.com/duckvhuynh/aico-backend/pull/23#issuecomment-5291254854
**Parent:** `duckvhuynh/aicompanyos#7`
**Decision child:** `duckvhuynh/aico-backend#20`
**Product trace:** Goals G-01 and G-05; MVP-CAP-007; PRD-FR-040–041; SRS TD-008; SRS-FR-059–060; AT-014

The accepted semantic SHA `0f355699848a5e1c388c70b33dd7bfe61e3fbb4c` is the clean
corrigendum revision reviewed in the two attributable owner decisions above. This
metadata-only acceptance records those decisions without changing the semantic
package they approved. Acceptance unblocks the bounded proof child #21; it does
not approve that proof, a production Preview Service, founder UX, or AT-014.

The previously accepted revision
`d30b76fb6aa47212450aee4cd592577f8df1300a` is historical evidence only. Delivery
review found browser-token and response-profile contradictions inside that bundle.
This bounded semantic corrigendum therefore withdraws that revision from
implementation/proof authority.

Acceptance requires two separate, attributable human decision acts in different
roles: one
Architecture/Security decision and one Product/Platform decision. Each must approve
the same exact semantic revision in a different permanent pull-request
issue-comment URL. If repository governance assigns both roles to one human, that
person must perform two separate review acts and explicitly name the role exercised
in each comment. The accepted paragraph must name the exact 40-hex semantic SHA,
and both comments must repeat that same SHA and their role. One URL, comment, review
state, edited PR body, commit signature, agent statement, green formatter,
validator, fixture, CI run, or implementation cannot satisfy or be counted as both
owner decisions; an agent statement cannot satisfy either decision.

For this package, **semantic SHA** means the full 40-lowercase-hex Git commit SHA
of the clean repository revision whose ADR, contract/schema, threat registry,
AEO audit, evidence map, validators, and mutation probes are being accepted. It
is not a Markdown content hash, branch head alias, tree prefix, PR number, build
number, image tag, or later metadata-only commit. If any semantic file changes,
the candidate needs a new clean 40-hex semantic SHA and both owners must approve
that new SHA; acceptance comments for an earlier revision do not carry forward.

## 1. Context and decision boundary

AI Company OS must let a founder inspect a successful static prototype without
letting generated HTML, JavaScript, CSS, or assets obtain control-plane identity,
cookies, storage, private APIs, credentials, another Company's content, or a
different preview version. A URL, object key, opaque identifier, successful
build flag, CDN cache entry, or valid signature by itself is not current
authorization.

The browser is an active security boundary. Generated client code can issue
requests, attempt navigation, register persistent browser state, frame or open
other contexts, probe paths, and try to reuse a cached or expired response. The
Preview Service is trusted delivery infrastructure; generated output is inert
static input and is never executed by that service.

This ADR selects the AICO-007 delivery architecture and its binding contracts:

- the preview origin/site and deployment boundary;
- signed exact-version access, exchange, expiry, and revocation;
- publication and request-time integrity;
- security headers, methods, path handling, navigation, and browser storage;
- cache partitioning, cleanup, unknown outcomes, observability, and rollback;
- release-blocking threat/evidence expectations and later ownership.

In compact terms, the selected architecture is a control-plane-isolated origin with signed access
to one exact successful build and a browser boundary that cannot reach private control APIs.

It is a decision contract, not a production Preview Service. It does not create
a public preview API, founder preview UI, CDN account, DNS zone, signing key,
production retention duration, cleanup worker, or AT-014 pass.

## 2. Authority reconciliation

- Product v0.1 and the SRS are authoritative. PRD-FR-040 permits a preview only
  from a successful build; SRS-FR-059 requires an isolated origin, restrictive
  headers, and no private-control-API access. SRS-FR-060 owns accurate prototype,
  version, availability, expiry, and rebuild presentation.
- [ADR-003](./003-backend-platform.md) is accepted and keeps the modular
  monolith, inward-facing ports, PostgreSQL authority, server-derived tenant
  scope, TypeORM inside infrastructure adapters, and S3-compatible storage port.
  This ADR adds a preview-only composition/process role from the same repository
  and deployable image. It is a narrow extension of the original API/worker role
  inventory, not a new domain authority or independently evolving microservice.
- [ADR-007](./007-tenant-object-retention-selection.md) is accepted for
  AICO-003. PostgreSQL registry metadata remains authoritative for Company
  ownership, object versions, checksums, state, expiry, revocation generation,
  holds, and deletion. Raw keys and presigned URLs never authorize a preview.
  Access is brokered and current state is rechecked on every request.
- [ADR-009](./009-sandbox-template-dependency-selection.md) is accepted for
  AICO-004. A preview can consume only its closed, checksum-bound output manifest
  from a successful build receipt. The build sandbox, dependency acquisition,
  publication, and browser delivery boundaries stay separate. Preview delivery
  never executes generated commands or installs packages.
- [ADR-006](./006-durable-workflow-selection.md) governs transactional events,
  outbox delivery, idempotency, uncertain external effects, and recovery. Preview
  publication and cleanup use explicit durable states rather than treating an
  object-store call or process acknowledgement as a commit.
- [ADR-008](./008-policy-exact-version-approval.md) governs current-state,
  exact-version, default-deny policy evaluation. A prior allow or stale UI state
  cannot mint or continue preview access.
- [ADR-004](./004-deployment-topology.md) remains proposed. Its separate preview
  zone is consistent input, but accepting this ADR does not accept its wider
  production topology or prove any cloud control.
- DEC-013 remains open. This ADR requires finite, versioned availability and
  grant expiry plus fail-closed cleanup semantics, but does not invent final
  preview, audit, tombstone, object, or backup retention durations.

If implementation conflicts with Product/SRS or an accepted ADR, AICO-007 must
be reopened. It must not be resolved by sharing an origin, trusting `latest`,
weakening tenant checks, exposing a control credential, or calling a partial
cleanup complete.

A model, prompt, completion, transcript, agent memory, employee memory, chat or
browser session, UI state, browser storage, log, metric, trace, event, outbox
message, receipt, cached result, signed snapshot, or previous policy `ALLOW` is
evidence at most. None is actor, tenant, resource, policy, lifecycle, or
authorization authority. Only current server-derived identity plus locked or
zero-staleness authoritative state evaluated through the accepted policy and
ToolGateway contracts can authorize a protected effect.

## 3. Decision drivers and non-waivable invariants

1. **Separate browser site.** Preview content is on a registrable site separate
   from every control-plane environment, not merely another path or subdomain of
   the control site's registrable domain.
2. **One immutable version, one origin.** Each immutable `PreviewVersion` gets a
   random, never-reassigned hostname. Rebuilds and republishing create new
   versions/origins, preventing browser storage, service-worker, and cache reuse
   across builds.
3. **No control identity.** Preview requests receive no control cookie, bearer
   token, local/session storage, credential, private API route, or unrestricted
   workload identity. Control cookies are host-only, `Secure`, `HttpOnly`, and
   `SameSite=Strict`.
4. **Current exact authorization.** Every content request binds and rechecks the
   server-derived Company, intended audience, exact preview/build/artifact
   versions, output-manifest digest, host/environment, grant expiry, revocation
   epoch, nonce/session, signing-key version, and policy versions.
5. **Successful immutable bytes only.** Publication accepts only an AICO-004
   successful receipt whose canonical manifest and every bounded file digest are
   verified. Missing, stale, partial, mixed-version, unsafe, or tampered output
   never becomes available.
6. **Static delivery only.** The preview role maps normalized paths to an accepted
   immutable manifest. It never proxies a URL, resolves a caller object key,
   executes server code, installs a dependency, lists storage, or falls through
   to control routes.
7. **Restrictive browser context.** Header policy blocks connections, forms,
   frames, workers/service workers, plugins, uncontrolled embedding, referrers,
   opener access, and downloads. The fixed template must build without inline
   script/style or `eval` exceptions.
8. **Authorization is not cached.** Each request consults current authoritative
   access state. No browser, shared edge, or CDN may reuse an authenticated
   response after expiry or revocation.
9. **Non-disclosing default deny.** Unknown host, token, actor/audience, tenant,
   version, path, state, algorithm, policy, key, checksum, expiry, or dependency
   outage yields the same unavailable family with zero preview bytes and no new
   grant/cookie.
10. **Revocation precedes reclamation.** Expiry, cancellation, hold, incident, or
    deletion first closes access. Cache/object cleanup may retry later and may
    never reopen access.
11. **Unknown is not success.** Uncertain publication, signature exchange,
    revocation, purge, cache invalidation, or process outcome remains blocked and
    reconcilable; it is never inferred to be `AVAILABLE` or `PURGED`.
12. **Safe evidence.** Logs and events contain bounded opaque IDs, policy/version
    references, outcome/reason codes, and correlation only—never tokens, cookies,
    query/fragment values, control identity, object keys, filenames, source,
    generated bodies, or raw content digests in ordinary telemetry.
13. **One use, one exact effect.** Publication, grant issuance, revocation,
    cleanup, and state-changing reconciliation each require a freshly revalidated,
    parameter-bound `ALLOW` with `maximum_uses=1`. ToolGateway atomically consumes
    it with the matching durable intent; no session, signed snapshot, previous
    allow, receipt, retry, worker message, or model output can reuse it.
14. **Causal and redacted evidence.** Every protected request, intent, invocation,
    receipt, event, unknown outcome, inspection, and reconciliation binds immutable
    correlation/causation parentage and an immutable redaction-profile ID, version,
    and digest. Missing, mutable, unsupported, or mismatched evidence bindings fail
    closed; evidence never becomes authority.

These invariants are the stable `A7-ADR-01` evidence target.

## 4. Options considered

Legend: **Strong** meets the driver by construction; **Viable** requires explicit
controls and proof; **Weak** leaves a material MVP isolation gap.

| Criterion                                   | A — Control-origin path                                                         | B — One shared preview origin, path per preview                                  | C — Separate site, origin per immutable PreviewVersion, brokered delivery                 | D — Dedicated container/microVM or vendor site per preview                    |
| ------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Control cookies/storage                     | Weak: same-origin code can read non-HttpOnly state and target privileged routes | Viable only if the preview site is separate from control                         | Strong: unrelated registrable site cannot receive or read control state                   | Strong with correct account/domain separation                                 |
| Other-preview isolation                     | Weak: path is not an origin boundary                                            | Weak: storage, service workers, same-origin reads, and cache bugs cross previews | Strong: never-reused hostname partitions origin state and paths                           | Strongest physical placement                                                  |
| Private API non-reachability                | Weak: privileged routes share host and routing stack                            | Viable: CSP/control ingress still required                                       | Strong: preview-only ingress/role plus CSP and control ingress denial                     | Strong, but vendor/runtime networks still require proof                       |
| Exact-version authorization                 | Viable but route confusion is high                                              | Viable with a broker; path/version mistakes remain high impact                   | Strong: host, grant, registry, manifest, and path must agree                              | Strong if every deployment has equivalent metadata authority                  |
| Immediate subsequent-request revocation     | Weak with static public hosting                                                 | Viable with an authorization broker in front                                     | Strong: broker rechecks PostgreSQL on every request                                       | Viable; per-site teardown may be slower than grant denial                     |
| Integrity and mixed-version prevention      | Weak if web root is mutable                                                     | Viable with immutable namespaces                                                 | Strong: closed manifest and immutable preview copy/cache identity                         | Strong but duplication/orchestration grows                                    |
| Cache safety                                | Weak: control and preview cache rules can collide                               | Weak to viable: one shared origin needs perfect cache keys                       | Strong: no-store downstream; trusted cache keys include exact public/version/digest tuple | Strong isolation, higher purge fleet cost                                     |
| Browser navigation/opener/frame containment | Weak: control origin makes one mistake critical                                 | Viable with headers                                                              | Strong with separate site, CSP sandbox, COOP, no framing, and `noopener`                  | Strong when equivalently configured                                           |
| Small-team operations                       | Superficially simple, unacceptable risk                                         | Simple but leaves generated previews mutually same-origin                        | Viable: wildcard DNS/TLS and one preview role; no per-preview compute                     | Weak for MVP: orchestration, cold start, patching, cost, and cleanup multiply |
| Local deterministic proof                   | Simple but proves the wrong boundary                                            | Viable                                                                           | Strong with distinct loopback hostnames plus a production-like TLS/network proof later    | Weak without substantial platform harness                                     |
| Evolution/reversibility                     | Requires breaking URL/security redesign                                         | Requires origin migration and storage clearing                                   | Strong: ports and immutable mappings permit CDN or stronger workload placement later      | Vendor/runtime exit and historical routing cost are higher                    |

Select **Option C: a separate registrable preview site with one never-reused
origin per immutable PreviewVersion and brokered exact-version delivery**.

### 4.1 Why the other options are not selected

- **Option A is rejected.** CSP and route guards cannot compensate for serving
  untrusted generated content inside the control-plane origin.
- **Option B is rejected.** A shared preview hostname makes mutually untrusted
  previews same-origin. Path prefixes do not isolate DOM storage, service workers,
  same-origin fetches, or accidental cache/path traversal.
- **Option D is deferred.** Static files are never executed on the server, so a
  container or microVM per preview adds a scheduler, image/runtime patching,
  capacity, and cleanup plane without addressing a demonstrated gap in Option C.
  It becomes appropriate if previews gain generated server code or regulation
  requires dedicated compute/accounts.

The selected option gives up simple same-host deployment and public CDN caching.
It accepts wildcard DNS/TLS, a third process role, a signing lifecycle, per-request
metadata reads, and explicit cleanup in exchange for a boundary the team can test
and later strengthen without changing artifact or authorization semantics.

## 5. Selected architecture

### 5.1 Origin and environment topology

Every environment uses an unrelated registrable preview site and distinct key,
database, storage, cache, and DNS namespaces. A canonical host has this logical
shape:

```text
p-<random-128-bit-public-id>.<environment>.preview.<isolated-registrable-site>
```

The public ID carries no Company, Run, founder, artifact, filename, or sequential
information. Wildcard DNS and TLS terminate only at the preview ingress. The
ingress validates TLS SNI and `Host` against the closed pattern and the exact
registry mapping; an arbitrary wildcard host is not enough to select a preview.
A hostname is never reassigned, even after expiry or purge.

Control and preview sites must not share a parent capable of receiving a control
`Domain` cookie. Control CORS never allowlists the preview site. The production
preview role has no route to private control-plane HTTP, metadata endpoints, or
operator surfaces. The control API also rejects preview-origin CORS, credentialed
cross-site fetches, unsafe Fetch Metadata, and state-changing requests without
its ordinary authentication/CSRF contract. CSP is defense in depth; control API
authorization remains mandatory.

Local loopback hostnames can prove cookie/origin behavior deterministically, but
`localhost`, plain HTTP, Compose networking, and a mock ingress do not prove
production TLS, registrable-site, workload-identity, or network-policy isolation.

### 5.2 Component and dependency boundary

```text
authenticated control UI
        |
        v
Control API / PreviewModule publication + grant use cases
        |        PostgreSQL transaction/outbox
        +------> PreviewVersion / PreviewAccessGrant authority
        |
        +------> private immutable preview object namespace

founder browser -- fragment capability --> preview bootstrap
        |                                     |
        |                              POST one-time exchange
        v                                     v
per-version preview origin ----------> preview-only delivery role
                                              |
                         exact registry/grant recheck + manifest lookup
                                              |
                                  private exact-object GET only
```

`PreviewModule` owns publication, grant, revocation, and cleanup application
contracts. Domain/application code imports no NestJS, HTTP, cookie, JWT/JWS,
PostgreSQL, TypeORM, CDN, DNS, or S3 types. Infrastructure implements:

- `PreviewPublicationPort` for immutable staging/copy/verification;
- `PreviewRegistryPort` and `PreviewGrantPort` for Company-scoped exact records;
- `PreviewAccessSignerPort` for a closed signing format/key version;
- `PreviewObjectReadPort` accepting only an authorized manifest entry;
- `PreviewCachePort` for trusted exact-version bytes, if enabled; and
- `PreviewLifecyclePort` for expiry, revocation, purge, and reconciliation.

All state-changing use cases invoke `PolicyDecisionPort` through ToolGateway.
ToolGateway is the only adapter-call/effect gate; a controller, worker, outbox
consumer, signer, lifecycle job, model, or preview broker cannot invoke these
ports directly from a prior decision or transport/session state. Read-only
`inspectPublication`, `inspectGrantIssue`, `inspectExchange`,
`inspectRevocation`, and `inspectCleanup` operations reconcile the original
logical operation and never create, repeat, or authorize an effect.

The same repository/deployable image gains a `preview` composition role, separate
from `api` and `worker`. Its ingress exposes only the fixed bootstrap, bounded
exchange, health endpoints on an internal listener, and manifest-backed `GET` or
`HEAD`. The composition root excludes control controllers, identity/session
adapters, model providers, sandbox adapters, operator routes, and control signing
keys. Its database identity can read only the preview authorization projection
and execute narrowly scoped exchange/reconciliation operations; its object
identity can read only the private published-preview namespace. It cannot list a
bucket or read source, attachment, sandbox, export, backup, or general artifact
namespaces.

This role remains part of the modular monolith. Splitting deployment does not
permit cross-module table access or make its projection a second authority.

### 5.3 Authoritative records and state machines

An immutable `PreviewVersion` records at minimum:

- `company_id`, opaque `preview_id`, `preview_version_id`, and random public ID;
- exact Run, Build Result, Build Artifact, source/output object, and output
  manifest version references;
- canonical manifest algorithm/version, SHA-256 manifest digest, aggregate
  content-set digest, file count, and total bytes;
- exact hostname, environment, publication policy, access policy, header policy,
  and retention-policy versions;
- availability expiry, current revocation epoch, hold/cancellation facts, and
  signing-key compatibility requirements;
- publication state, timestamps, causation/correlation, safe failure class, and
  cleanup/reconciliation state.

Every request/intent/receipt record also binds its closed schema/version and
digest; logical operation ID; idempotency key and canonical request digest;
correlation ID; immediate causation ID; parent command/decision/ToolGateway
invocation/event IDs; current policy-decision ID; consumed-allow ID/use number;
attempt, lease, and fencing data where external work occurs; and immutable
redaction-profile ID, version, and digest. Telemetry `trace_id`, `span_id`, and
`parent_span_id` may mirror that lineage but are correlation evidence only and
never replace durable causation.

An immutable manifest entry binds canonical normalized path, exact preview object
version/key reference, media type, bytes, SHA-256 digest, and safe disposition.
Keys remain server-generated infrastructure data, never public identifiers.

Publication states are explicit:

```text
PENDING_VERIFICATION -> VERIFYING -> AVAILABLE
          |                 |             |
          +-----> QUARANTINED/UNKNOWN <---+
                                          |
                           REVOKED or EXPIRED
                                          |
                                 DELETE_PENDING
                                          |
                                PURGED or UNKNOWN
```

Only `AVAILABLE` may serve. `REVOKED`, `EXPIRED`, `DELETE_PENDING`, `PURGED`,
`QUARANTINED`, and `UNKNOWN` deny content. A retry advances an existing durable
operation idempotently; it does not create a second logical preview or overwrite
an immutable version.

A `PreviewAccessGrant` records the server-derived Company and actor/audience,
exact preview/build/artifact/manifest tuple, exact hostname/environment,
operation, issue/not-before/expiry times, nonce digest, session state, current
preview and grant revocation epochs, signer/key version, publication/access/header
policy versions, idempotency/correlation, and safe outcome. The bearer capability
and presentation cookie are never stored or logged.

### 5.4 Current authority and ToolGateway effect gate

The protected actions are `preview.publish/v1`, `preview.grant.issue/v1`,
`preview.revoke/v1`, `preview.cleanup/v1`, and
`preview.reconcile-effect/v1`. Immediately before preparing the matching durable
effect, ToolGateway reloads and locks or consistently revalidates all authoritative
identity, membership, Company, Run/Task/Attempt, build/artifact/manifest,
publication/grant, hold/cancellation/kill, budget applicability, epoch, policy,
profile, expiry, idempotency, and lifecycle facts required by that action schema.
It rejects a supplied snapshot or decision as authority.

The evaluator then creates a fresh parameter-bound `ALLOW` whose exact action,
actor/system identity, Company, resources and versions, canonical parameter
digest, operation/idempotency/request digests, limits, epoch, expiry, policy and
profile versions, environment, correlation, and causation match the proposed
intent. Every such `ALLOW` has `maximum_uses=1`, a finite expiry, and no wildcard.
In one PostgreSQL transaction ToolGateway revalidates it, consumes use one, and
records the matching invocation/effect intent, operation state, ordered event,
and outbox record where required. If any binding changed, the allow is expired or
consumed, or any write fails, no intent/effect is authorized.

No PostgreSQL lock spans a signer, object, cache, DNS, or other external call.
After the consumed intent commits, a fenced worker performs only those exact
parameters. Retry of the same logical key and request digest inspects/reconciles
the existing operation; it does not consume the old allow or blindly invoke the
effect again. Conflicting digest reuse denies. A genuinely new effect attempt or
state-changing repair obtains and consumes a new single-use allow. A read-only
inspection may reconstruct facts without an allow but cannot mutate, issue a
grant, call an adapter, retry an effect, or infer success.

Policy denial creates only the accepted bounded, tenant-safe denial evidence.
The model, prompt, completion, transcript, agent memory, employee/session state,
UI/browser state, log, metric, trace, event/outbox message, receipt, prior allow,
or signed capability cannot call ToolGateway on its own or widen its parameters.

## 6. Publication and integrity contract (`A7-INTEGRITY-01`)

### 6.1 Admission

The publish handler can prepare work only after ToolGateway reloads current state
and atomically consumes a fresh `preview.publish/v1` parameter-bound `ALLOW` with
`maximum_uses=1` into the exact idempotent publication intent described in
section 5.4. It then opens the required Company-scoped transaction, locks the
exact build and output records, and denies unless all of the following agree:

1. server-derived Company, Run, Task/Attempt, and currently approved exact Design
   and Product Brief lineage;
2. a terminal AICO-004 Build Receipt with `SUCCEEDED` outcome and no later
   cancellation, hold, quarantine, or superseding policy denial;
3. all configured blocking format/lint, type-check, test, and production-build
   evidence required for that receipt;
4. the accepted output-manifest schema/version, canonicalization algorithm,
   manifest digest, per-file digest, aggregate digest, file count, and byte bounds;
5. exact immutable output object versions in `AVAILABLE` state under ADR-007;
6. the accepted fixed template/dependency/sandbox/output policy versions; and
7. the immutable publication, access, header, cache, retention, and redaction
   profile IDs, versions, and digests selected by current policy; and
8. a new random hostname not present in live records, tombstones, caches, DNS
   assignments, or historical mappings.

No mutable `latest`, directory scan, object prefix, client checksum, caller path,
Build ID without its version, or prior success event satisfies admission.

### 6.2 Closed output surface

Canonicalization decodes and normalizes once and rejects ambiguous encoding,
absolute paths, dot segments, backslashes, NUL/control characters, duplicate
normalized names, case/Unicode collisions under the selected filesystem policy,
links, devices, sockets, sparse/oversized files, and reserved `__aico` paths.

The accepted fixed client-only template permits one `index.html` and an explicit
set of browser-static script, stylesheet, image, font, media, and bounded data
types. Publication rejects source maps, server executables, package-manager
caches, secrets, hidden files, service-worker files/registration, manifests that
enable installation, active content outside the accepted HTML/script set,
unknown media types, `Content-Disposition: attachment`, and content requiring
inline script/style or `eval` CSP exceptions.

Client-side route navigation may map a normalized document navigation to the
exact accepted `index.html`. It is not a general missing-path fallback. Asset,
script, fetch, and unknown destinations require an exact manifest path and never
fall through to a different version, object prefix, control route, or network
proxy.

### 6.3 Copy, verify, and publish

The publication worker copies accepted files into a private, immutable preview
namespace using server-generated exact-version references. It reads every bounded
source object, verifies length and SHA-256, writes without overwrite, then reads
back or uses provider checksum evidence and verifies the destination. A client
checksum, multipart ETag, mutable metadata tag, or successful copy response alone
is insufficient.

Only after every file and the reconstructed canonical manifest match does one
PostgreSQL transaction compare-and-set the `PreviewVersion` to `AVAILABLE`, bind
its exact expiry/epoch/policy versions, append the ordered event, and enqueue the
outbox intent. Partial object copies remain unreachable staging material and are
later reconciled or deleted.

On a cold content read, the broker obtains the exact registered object, buffers
it within the accepted per-file bound, verifies length and SHA-256 before sending
headers or bytes, and only then may populate a trusted internal byte cache. A
checksum/length/type/object-version mismatch returns no bytes, closes access,
quarantines the preview through an idempotent security intent, and records a safe
signal. Range and transform responses are disabled so an unverified partial or
alternate representation cannot escape.

## 7. Signed exact-version access (`A7-ACCESS-01`)

### 7.1 Grant issuance and signed binding

The authenticated control API resolves the actor and Company from verified
server-side identity. ToolGateway reloads current authority and atomically consumes
a fresh, parameter-bound `preview.grant.issue/v1` `ALLOW` with `maximum_uses=1`
into the exact causal/idempotent grant intent before signing. The grant is
single-preview, read-only, and finite. Caller-supplied Company, host, object key,
manifest digest, version, policy, epoch, expiry, prior allow, receipt, event,
session, UI, or model output never selects authority.

The browser capability is deliberately minimal and opaque. Its protected header
contains only the fixed type, `alg=EdDSA`, and a server-selected opaque `kid`; the
only accepted algorithm is Ed25519 `EdDSA`. There is no algorithm negotiation or
second accepted algorithm. `none`, symmetric/MAC confusion, embedded verification
keys, remote `jku`/`x5u`, unknown critical headers, caller-selected key lookup,
duplicate fields, and signature malleability are rejected.

The compact JWS protected header contains exactly `typ`, `alg=EdDSA`, and one
server-selected opaque `kid`. It contains no token-schema or key-version field;
the server resolves the active Ed25519 verification-key record and version from
the opaque `kid`.

The signed payload contains only:

- a constant preview-viewer audience and an opaque random grant reference;
- one opaque one-time nonce plus bounded issue/not-before/exclusive-expiry times;
- the exact preview-delivery environment and exact registered host; and
- `binding_sha256`, a domain-separated SHA-256 digest of the complete canonical
  server-side grant record.

The capability contains **no** `company_id`, actor/employee ID, Run/Task/Attempt,
preview ID or version, build/execution/receipt, artifact/object/output-manifest ID,
version or checksum, revocation epoch, policy/profile ID/version/digest, hold,
budget, object key, cache key, path, correlation/causation, token-schema version,
key version, issuer, or control-session fact. It contains no readable tenant or
resource locator other than the exact delivery host/environment already required
to route the request.

The authoritative server record behind the opaque grant reference contains the
full Company, actor/audience, exact preview/build/artifact/output-manifest versions
and checksums, host/environment, exclusive expiry, preview/grant revocation
epochs, nonce digest, key version, policy/profile bindings, idempotency/request
digest, consumed single-use allow/invocation, immutable redaction profile, and
causal parentage. `binding_sha256` is computed as a domain-separated digest over
its RFC 8785 canonical representation, including the random grant reference and
nonce binding. The broker reloads that current record and recomputes the digest;
it never reconstructs authority from browser claims.

Signature validity, a matching digest, signer output, or a successfully issued
grant is evidence only. It never replaces current Company membership, registry,
state, expiry, hold, cancellation/kill, epoch, key, or policy/profile validation.
The token cannot be decoded into data useful for another tenant or preview.

### 7.2 Fragment bootstrap and one-time exchange

The control UI opens a new top-level context with `noopener,noreferrer` at the
exact registered host:

```text
https://<exact-preview-host>/__aico/bootstrap#<signed-one-time-capability>
```

URL fragments are not sent to DNS, TLS intermediaries, ingress, HTTP logs, or
referrers. The unauthenticated bootstrap is fixed platform code, never generated
output. Its pinned inline-script hash permits only this sequence:

1. read the bounded fragment;
2. immediately remove it with `history.replaceState`;
3. `POST` it in a bounded body to same-origin `/__aico/exchange`; and
4. on success use `location.replace` to the clean canonical preview URL.

The exchange requires exact `Host`, same-origin `Origin`, expected Fetch Metadata,
content type, body size, signature, grant binding, unused nonce, and current
authority. It atomically consumes the nonce/session transition before returning
success. Crash after consume but before browser receipt is safe: no content is
served, and the founder requests a new grant; the nonce is never unconsumed.

Grant issuance and exchange each persist a closed causal/idempotent operation
record before acknowledging success: logical operation and request digests,
correlation/causation/parent IDs, consumed ToolGateway allow/invocation where
applicable, grant/nonce fingerprints, state, timestamps, immutable redaction
profile ID/version/digest, and a closed success/denied/unknown classification.
`inspectGrantIssue` and `inspectExchange` read those original records after a lost
response or commit uncertainty. They never sign again, unconsume a nonce, mint a
session, infer success from a token/receipt, or repeat an external effect.

The successful response sets only:

```text
Set-Cookie: __Host-aico_preview=<signed-presentation>;
            Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=<no later than grant expiry>
```

It has no `Domain` attribute. Generated JavaScript cannot read the cookie. A
different preview hostname, build version, environment, or control site never
receives it. The bootstrap/exchange response is `no-store` and carries no preview
bytes. If supported-browser behavior cannot complete this Strict-cookie exchange,
the implementation must fail closed and use a fixed same-site interstitial; it
must not relax the cookie, expose the capability to generated code, or add the
control site to preview CORS.

Sibling subdomains under one preview registrable site can set attacker-controlled
parent-domain cookies. The broker therefore recognizes exactly one authentication
cookie name, requires its `__Host-` properties and signed host/version binding,
and ignores every other cookie for identity, routing, authorization, cache keys,
and tenant selection. Duplicate authentication-cookie names, malformed cookies,
or a cookie header above the accepted small bound deny before database/object
work. Tests must cover parent-domain cookie tossing and cookie-header exhaustion.

### 7.3 Request-time validation and denial

For every content `GET` and `HEAD`, including same-document route navigation and
conditional-looking requests, the broker:

1. validates exact SNI/Host/public-ID mapping and method;
2. verifies the closed signature format, algorithm, type, key version, audience,
   time bounds, and presentation/session binding;
3. loads current grant and PreviewVersion authority without a positive allow
   cache and recomputes the canonical signed binding;
4. compares Company, audience, exact preview/build/artifact/manifest versions,
   host/environment, both revocation epochs, and all policy versions;
5. denies holds, cancellation, non-`AVAILABLE`, expiry, revoked key/policy/grant,
   unsupported versions, or unavailable/corrupt authority;
6. resolves a canonical path to one exact manifest entry; and
7. verifies trusted cached bytes or the complete bounded object before response.

A prior `ALLOW`, signed access token, signed session, signed revocation snapshot,
event, receipt, materialized projection, or cached authority result cannot satisfy
step 3. The selected MVP performs a current authoritative read on every request.
A future signed snapshot/projection may substitute only after separately accepted
evidence proves **zero staleness at the authorization linearization point** for
every membership, publication, expiry, hold, cancel/kill, epoch, key, and policy/
profile change. Missing, expired, gapped, reordered, signature-invalid,
unreconciled, or any nonzero-staleness snapshot denies. A bounded stale-while-
revalidate window is prohibited for authorization even if content is immutable.

Unknown, absent, foreign, expired, revoked, tampered, and unsupported cases use
the same minimal unavailable status/body/timing family. They set no grant or
preview cookie, return zero generated bytes, never redirect to control, and never
reveal whether a Company, preview, version, path, or key exists. An unavailable
response may clear preview-site data as defense in depth.

Revocation is immediate for the next request after the authoritative PostgreSQL
commit. No server can recall bytes already rendered in a live browser document;
this ADR does not make that false claim. Short grants, no-store responses,
never-reused origins, founder UI state, and `Clear-Site-Data` reduce residual
exposure, while reload/subresource/new navigation rechecks authority.

## 8. Browser security and response contract (`A7-ORIGIN-01`)

### 8.1 Generated-content CSP

Every generated-content response applies this semantic policy as a versioned,
validated header (line breaks shown only for readability):

```text
Content-Security-Policy:
  default-src 'none';
  script-src 'self';
  style-src 'self';
  img-src 'self' data:;
  font-src 'self';
  media-src 'self';
  connect-src 'none';
  object-src 'none';
  frame-src 'none';
  child-src 'none';
  worker-src 'none';
  manifest-src 'none';
  base-uri 'none';
  form-action 'none';
  frame-ancestors 'none';
  sandbox allow-scripts allow-same-origin
```

There is no `unsafe-inline`, `unsafe-eval`, wildcard, external script/style host,
control origin, report body containing content, or per-preview caller extension.
`worker-src 'none'`, output validation, and never-reused origins jointly prevent
service-worker persistence. `sandbox` omits forms, popups, top-navigation of an
embedding context, modals, presentation, pointer lock, orientation lock, and
downloads. Prototype interactions must remain client-only and conform to this
profile; a build that needs an exception is not publishable under this policy.

The fixed bootstrap uses this distinct exact CSP:

```text
Content-Security-Policy: default-src 'none'; script-src 'sha256-0K99yYE6jYGRdI008pEtqIua6cTps5n1zRKB0UzSqJA='; style-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; connect-src 'self'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-scripts allow-same-origin
```

The hash pins these exact 349 UTF-8/ASCII script bytes with no leading/trailing
whitespace or newline:

```js
(() => {
  const c = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  fetch('/__aico/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: c,
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'manual',
  }).finally(() => location.replace('/'));
})();
```

The bootstrap permits only that script and its same-origin exchange. Generated
files are never loaded or executed in that page. Changing any byte requires a new
bootstrap/profile version and hash; there is no nonce, `unsafe-inline`, second
hash, or caller override.

### 8.2 Mandatory headers and transport behavior

One `preview-response-policy/v1` contains the exact generated CSP above, the exact
bootstrap CSP above, their closed response-class mapping, and the following exact
common headers/cache controls. Generated, denial/unavailable-document, HTML, and
asset responses use the generated CSP. Only `/__aico/bootstrap` uses the bootstrap
CSP. Exchange and 303 responses create no active document; they still receive the
bootstrap CSP defensively, while CSP enforcement is meaningful only if a user
agent creates a document. Response-specific `Content-Type`, `Content-Length`,
`Location`, `Set-Cookie`, and permitted `Clear-Site-Data` do not alter the common
profile. No response may select a third or weaker CSP.

All bootstrap, exchange, unavailable, HTML, and asset responses set or enforce:

| Control                        | Binding behavior                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TLS/HSTS                       | HTTPS only; exact `Strict-Transport-Security: max-age=31536000; includeSubDomains`; `preload` is absent; no HTTP content or downgrade redirect                                                                                             |
| `Cross-Origin-Opener-Policy`   | `same-origin`, plus the control UI opens with `noopener,noreferrer`; no usable opener channel                                                                                                                                              |
| `Cross-Origin-Embedder-Policy` | `require-corp`; preview resources are same-origin and exact-manifest only                                                                                                                                                                  |
| `Cross-Origin-Resource-Policy` | `same-origin`; no cross-origin reuse of preview responses                                                                                                                                                                                  |
| `Referrer-Policy`              | `no-referrer`, including bootstrap, redirect, assets, and unavailable responses                                                                                                                                                            |
| `X-Content-Type-Options`       | `nosniff`; server derives a closed media type from the accepted manifest                                                                                                                                                                   |
| Framing                        | CSP `frame-ancestors 'none'` and `X-Frame-Options: DENY`; preview opens top-level, not embedded in control UI                                                                                                                              |
| Process isolation              | `Origin-Agent-Cluster: ?1`                                                                                                                                                                                                                 |
| Capabilities                   | A versioned `Permissions-Policy` disables camera, microphone, geolocation, payment, USB/serial/HID, sensors, display capture, clipboard read/write, public-key credential create/get, storage access, and other unneeded powerful features |
| Legacy plugins                 | `X-Permitted-Cross-Domain-Policies: none`; no plugin/object media                                                                                                                                                                          |
| Cache                          | `Cache-Control: private, no-store, no-transform`, `Pragma: no-cache`, `Expires: 0`, `CDN-Cache-Control: no-store`, and `Surrogate-Control: no-store`                                                                                       |
| CORS                           | no `Access-Control-Allow-Origin` or credential grant; cross-origin `OPTIONS` and all write methods deny                                                                                                                                    |
| Representation                 | exact media type and byte length; no content negotiation, compression transform, attachment disposition, range, 304, directory listing, or redirect to an object-store URL                                                                 |

Unavailable/expired/revoked cleanup responses also use
`Clear-Site-Data: "cache", "cookies", "storage"` where supported. This header is
best-effort cleanup, not revocation authority.

### 8.3 Navigation, storage, and control API rules

The preview is a top-level inspection context. It cannot be framed by control or
third parties. Generated links may change the current document only within normal
browser behavior; a navigation away exits the preview. It has no opener, sends no
referrer, cannot submit forms or open popups/downloads under the sandbox policy,
and cannot read the destination. Control cookies are Strict and host-only, control
state changes reject GET/cross-site/unauthenticated requests, and private APIs are
not preview-network reachable. Navigation is therefore not treated as API access
or authority.

Preview code may create origin-scoped storage only inside its own random origin;
it cannot see control or another preview's DOM storage. Cookie domain semantics
are broader than origins: generated code can create an attacker-controlled parent
preview-site cookie visible to sibling hosts. Such cookies contain no platform
data and are ignored as described in section 7.2; they never select Company,
preview, authorization, path, or cache. The origin is never reused and cleanup
attempts `Clear-Site-Data`. No design may depend on that best-effort clearing for
confidentiality.

The delivery role reserves all `__aico` paths before manifest lookup. Besides the
fixed bootstrap and exchange, it exposes no JSON status API, proxy, upload,
filesystem, debug, health, metrics, source-map, control, rebuild, or operator
route on the public listener. Rebuild remains an authenticated control-plane
action under SRS-FR-060.

## 9. Cache contract (`A7-CACHE-01`)

The MVP sends every browser and shared-edge response as `private, no-store`.
There is no browser 304/range reuse and no public immutable URL mode, because a
valid immutable byte identity does not remove current grant/revocation checks.
`Vary` is not used as a substitute for this rule.

A trusted server-side byte cache behind the authorization broker is optional.
If enabled, its complete key is at least:

```text
(environment,
 preview_public_id,
 preview_version_id,
 output_manifest_digest,
 normalized_manifest_path,
 exact_object_version_id,
 content_sha256,
 representation/header_policy_version)
```

The cache stores verified bytes only after a complete pre-release digest check.
It stores no grant result, cookie, signed capability, Company lookup result,
unverified stream, redirect, error body, or cross-version alias. A cache hit still
performs every current authorization check before any byte. Keys are derived from
authoritative metadata, never caller headers, path strings before
canonicalization, token claims alone, `latest`, ETag, or mutable storage metadata.

Revocation does not depend on content-cache purge: the broker closes access first.
Purge removes exact version keys for minimization. A purge miss, timeout, or
ambiguous provider acknowledgement remains cleanup `UNKNOWN`; it cannot make a
revoked preview serveable. A future CDN is acceptable only if it preserves this
auth-before-cache order or presents separately accepted equivalent immediate
revocation evidence.

Every publication, access, grant, exchange, revocation, cleanup, and
reconciliation request/intent/receipt/event binds one immutable
`redaction_profile_id`, `redaction_profile_version`, and
`redaction_profile_digest`. The registry entry is append-only; changing a field
creates a new version/digest. The selected profile and its current policy target
are revalidated before the protected effect. Unknown, mutable, missing, or
mismatched profiles deny rather than falling back to raw telemetry.

Every durable and telemetry record also preserves explicit trace parentage:
correlation ID, immediate causation ID, parent operation/command/decision/
ToolGateway invocation/event IDs, plus `trace_id`, `span_id`, and `parent_span_id`
when telemetry exists. A child cannot detach from or rewrite its parent. Redaction
runs before sampling/export and again at sinks; failure drops the unsafe record
and emits only a credential-free bounded signal. These records are audit evidence,
never tenant, policy, lifecycle, or access authority.

## 10. Expiry, revocation, cleanup, and retention (`A7-CLEANUP-01`)

### 10.1 Revocation

Grant, preview, key, and policy revocation are monotonic epochs/states. An
authorized control transaction can proceed only after ToolGateway reloads current
authority and atomically consumes a parameter-bound `preview.revoke/v1` `ALLOW`
with `maximum_uses=1`. It locks the exact Company/PreviewVersion, increments the
applicable epoch or closes the grant, and commits the revocation intent/receipt,
consumed allow/invocation, event, and outbox atomically. Minting and serving
compare current epochs. Duplicate commands with the same logical key and request
digest inspect/replay that record with one logical effect; conflicting reuse
denies. `inspectRevocation` resolves commit uncertainty from the original causal
record and current row; it never decrements an epoch or repeats revocation.

Cancellation, expiry, incident/security hold, policy withdrawal, key compromise,
integrity mismatch, tenant deletion, and operator quarantine close new grants and
all subsequent content before cleanup. A hold may preserve evidence or suspend
ordinary reads; it never grants access.

There is no positive authorization cache in the MVP. PostgreSQL or required
projection unavailability therefore denies. A later projection/cache needs an
accepted maximum staleness, push invalidation, epoch proof, and fail-closed outage
contract before replacing per-request authority reads.

### 10.2 Cleanup and reconciliation

The versioned retention policy supplies availability and lifecycle configuration;
this ADR supplies no final duration. Expiry/revocation creates one idempotent,
tenant-scoped deletion intent. A cleanup worker:

1. passes ToolGateway reload/revalidation and atomically consumes a fresh,
   parameter-bound `preview.cleanup/v1` `ALLOW` with `maximum_uses=1` into the
   exact causal/idempotent cleanup intent;
2. confirms exact Company, PreviewVersion, current state, hold, policy, and epoch;
3. keeps access closed and marks `DELETE_PENDING`;
4. enumerates only registry-owned preview object versions and exact internal
   cache keys—never a caller prefix or wildcard host;
5. deletes each live copy/replica/cache entry and records bounded provider
   outcomes without credentials or keys;
6. verifies absence and DNS/host mapping non-reassignment, reconciles object and
   relational references, and retains the required immutable tombstone/audit; and
7. records `PURGED` only after proof, otherwise `UNKNOWN`/blocked and retryable.

Partial deletion, timeout, process death, provider ambiguity, backup presence, or
failed site-data clearing does not report completion and does not restore access.
Retries are fenced and idempotent. Backups follow their own accepted policy;
restore reconciliation must reapply tombstones, expiry, revocation epochs, holds,
and hostname non-reuse before an environment receives traffic.

`inspectCleanup` and the other inspect operations first reconstruct the original
logical key, canonical request digest, correlation/causation parents, lease/fence,
allow/invocation, receipt and provider observations. Read-only inspection never
repeats a purge. Any state-changing repair uses
`preview.reconcile-effect/v1`, reloads current authority, and atomically consumes
its own parameter-bound `maximum_uses=1` allow and reconciliation intent.
Unknown/missing/conflicting parentage stays `UNKNOWN` and unavailable.

## 11. Failure, recovery, and rollback

| Failure or race                                                            | Required outcome                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Build state changes or is canceled during publication                      | Locked/current-state compare fails; no `AVAILABLE`; staging is blocked for reconciliation                          |
| Copy succeeds but database availability commit fails                       | Bytes remain unreachable staging; retry verifies the same digest or cleans up                                      |
| Database commits availability but event publication fails                  | PostgreSQL state remains authority; transactional outbox retries                                                   |
| Exchange signature, nonce, epoch, key, policy, audience, or host mismatch  | Uniform unavailable; no cookie, bytes, redirect, or disclosure                                                     |
| Exchange consumes nonce then response/process is lost                      | Nonce stays consumed; founder mints a new grant; never roll back consumption by inference                          |
| PostgreSQL, key registry, policy resolver, or object metadata unavailable  | Deny; no stale allow or cached authenticated response                                                              |
| Object/cache byte or metadata mismatch                                     | Buffer/reject before response, quarantine/revoke intent, safe security signal                                      |
| Revocation races with a content request                                    | Transaction/current epoch decides; requests validating after commit deny; already delivered bytes are not recalled |
| Process dies during streaming                                              | Only preverified bounded bytes may stream; no state is inferred from socket outcome                                |
| Cache purge or object deletion is partial/unknown                          | Access remains closed; cleanup stays `DELETE_PENDING`/`UNKNOWN` and retries                                        |
| Restore contains purged, expired, foreign, reused-host, or mismatched data | Environment remains isolated; no DNS/ingress activation                                                            |

Rollout is expand/verify/target/contract:

1. add versioned records, states, policies, ports, preview role, private object
   namespace, and tombstones without serving traffic;
2. publish two-Company fixtures and validate manifest/digest/hostname uniqueness;
3. enable exact grant/bootstrap/content flow for a targeted environment/policy;
4. run the adversarial browser/network/cache/cleanup matrix; and
5. contract compatibility only after all supported previews and cleanup workers
   understand the new versions.

Rollback changes targeting for **new** PreviewVersions to the preceding accepted,
compatible policy/implementation. Existing records keep their exact build,
manifest, host, key, header/access/publication policy, and retention bindings so
history remains readable. A preceding binary may serve an existing preview only
if it understands every bound version and current revocation state; otherwise it
denies and owners republish a new version after the rollback candidate passes.

Rollback never remaps a hostname, aliases a new build as an old preview, reissues
an expired/revoked grant, decrements an epoch, unconsumes a nonce, resurrects
purged bytes, removes a hold, weakens headers silently, or treats schema `down` as
a business rollback. After lifecycle effects begin, stop mint/publication/cleanup
workers as needed, preserve ledgers, deploy a compatible reader, and reconcile
forward. A destructive down migration must fail when populated lifecycle data
would become unreadable.

Signing-key rotation publishes a new key version, targets new grants, keeps old
public verification material only through its accepted overlap/readability
window, then revokes the old version. Compromise closes the key version and its
grants immediately; it does not rewrite historical evidence.

## 12. Threat and release-blocking evidence matrix (`A7-THREAT-01`)

Architecture tests must prove the contract and fail when a named control is
mutated. Production claims additionally require deployment evidence from the
release-candidate environment.

| Threat ID                                                    | Attempt                                                                                                                                           | Required prevention/evidence                                                                                                                                                                                | Later executable owner       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| A7-T-CONTROL-REQUEST-01 / A7-T-CONNECT-01                    | `fetch`, XHR, beacon, WebSocket/EventSource, image/script, form, DNS/IP/metadata, or private control API                                          | CSP/connect/form/source denial, no preview network route, no CORS credential path, control Fetch Metadata/auth denial; zero authenticated private effect                                                    | AICO-057, AICO-083, AICO-085 |
| A7-T-COOKIE-01 / A7-T-COOKIE-STORAGE-01 / A7-T-STORAGE-01    | Read control cookies/local/session/IndexedDB/cache, reuse another build's storage, toss a parent-domain preview cookie, or exhaust cookie parsing | unrelated registrable site, exact `__Host-` auth cookie only, bounded/duplicate-safe parsing, attacker cookies ignored for authority/cache, random never-reused preview origin, two-host browser assertions | AICO-057, AICO-083           |
| A7-T-SERVICE-WORKER-01                                       | Register/retain a service worker or manifest across reload/rebuild                                                                                | output rejection, `worker-src 'none'`, `manifest-src 'none'`, immutable hostname non-reuse, cleanup evidence                                                                                                | AICO-057, AICO-083           |
| A7-T-OPENER-NAV-01 / A7-T-NAVIGATION-01 / A7-T-REFERRER-01   | Read/opener-postMessage, frame control, navigate parent/opener, leak referrer                                                                     | top-level only, `noopener,noreferrer`, COOP, no framing/forms/popups/top-navigation/download permission, no-referrer; control remains unauthenticated                                                       | AICO-058, AICO-083           |
| A7-T-SCRIPT-TARGET-01 / A7-T-SCRIPT-01 / A7-T-FRAME-CHILD-01 | Inline/eval/external script, external style/font/media, object/frame/child target                                                                 | exact CSP/header assertions and fixed-template positive proof; publication rejects required exceptions                                                                                                      | AICO-057, AICO-083           |
| A7-T-FOREIGN-01 / A7-T-FOREIGN-PREVIEW-01                    | Present another Company/preview/build/path token or change Host/public ID                                                                         | canonical signature binding plus current Company/host/version lookup; uniform no-byte denial and safe signal                                                                                                | AICO-057, AICO-082, AICO-083 |
| A7-T-REPLAY-01                                               | Replay exchange nonce/cookie, swap environment/audience, use unknown/retired key or policy                                                        | atomic one-use exchange, fixed algorithm/audience, exact epochs/versions, per-request authoritative validation                                                                                              | AICO-057, AICO-083           |
| A7-T-EXPIRY-REVOCATION-01 / A7-T-REVOCATION-01               | Request after grant/preview expiry, cancel, hold, key compromise, or epoch increment                                                              | next request denies before cache/object; UI shows accurate state; no claim to recall already-rendered bytes                                                                                                 | AICO-057, AICO-058, AICO-083 |
| A7-T-INTEGRITY-01 / A7-T-SERVE-INTEGRITY-01                  | Failed, stale, partial, mixed-version, wrong-type, unsafe-file, altered manifest/object/cache bytes                                               | successful AICO-004 receipt, complete canonical/per-file verification before availability and cold response; quarantine                                                                                     | AICO-055, AICO-057, AICO-083 |
| A7-T-PATH-01                                                 | Traversal, double encoding, case/Unicode collision, reserved route, SPA fallback confusion, range/transform                                       | one canonicalizer, closed manifest/media map, reserved namespace, exact document fallback only, range/transform denial                                                                                      | AICO-057, AICO-083           |
| A7-T-CACHE-01 / A7-T-CACHE-KEY-01 / A7-T-HISTORY-01          | Reuse another grant/tenant/version/path, 304/range reuse, stale allow after revoke                                                                | downstream no-store, auth-before-cache, complete immutable internal key, verified bytes, no positive auth cache                                                                                             | AICO-057, AICO-083           |
| A7-T-REDACTION-01                                            | Leak fragment/body/cookie/token, object key/path/content/digest through ingress, errors, traces, analytics                                        | fragment bootstrap, disabled body/query/cookie logging, schema allowlist/redaction, seeded canaries and sink inspection                                                                                     | AICO-052, AICO-057, AICO-083 |
| A7-T-CLEANUP-01                                              | Cleanup races access, partial purge, process death, provider unknown, hostname reuse, restore resurrection                                        | close access first, fenced idempotent ledger, absence verification, tombstone/non-reuse, isolated restore reconciliation                                                                                    | AICO-057, AICO-076, AICO-083 |
| A7-T-ACCESS-BINDING-01 / A7-T-FOREIGN-01 / A7-T-EVIDENCE-01  | Compare missing/foreign/expired/revoked/tampered response to enumerate resources                                                                  | same unavailable family/timing envelope, zero bytes/cookie/new grant, safe opaque security telemetry                                                                                                        | AICO-057, AICO-082, AICO-083 |

The AICO-007 parent spike must serve a successful checksum-bound fixture on the
selected origin model and demonstrate that malicious fixture code cannot obtain a
control cookie/storage value, call a private control API with identity, open/frame
the control plane, reach another preview, reuse an expired/revoked grant, or serve
tampered bytes. A local fixture is architecture evidence only. AT-014 passes only
under AICO-085 on the release candidate with the accepted DNS/TLS, cookie,
ingress, network, key, storage, cache, and policy configuration.

## 13. Traceability, reusable evidence, and ownership (`A7-TRACE-01`)

| Criterion/requirement        | Selected decision                                                                                                         | Reusable evidence                                                                                               | Missing implementation/proof and owner                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| A7-ADR-01 / TD-008           | Option C; separate site and origin per immutable version; explicit tradeoffs/evolution/rollback                           | ADR-003 module/port/DB direction; ADR-007 tenant/object authority; ADR-009 build boundary                       | Exact-revision owner acceptance in AICO-007/#20; deployment proof AICO-057/AICO-083   |
| A7-ORIGIN-01 / SRS-FR-059    | preview-only role/ingress, no control identity/routes, closed CSP/header/browser contract                                 | ADR-007 Preview boundary; ADR-009 static output/non-network boundary                                            | DNS/TLS/process/network/header implementation AICO-057; browser isolation AICO-083    |
| A7-ACCESS-01                 | signed canonical grant binding, fragment bootstrap, Strict HttpOnly cookie, current per-request epoch/state check         | ADR-007 brokered exact-version access/revocation; ADR-008 current exact policy                                  | signer/key/grant/exchange implementation AICO-057; adversarial replay/revoke AICO-083 |
| A7-INTEGRITY-01 / PRD-FR-040 | successful AICO-004 receipt only; immutable copy; manifest/per-file SHA-256 before availability/serve                     | ADR-007 object registry/checksum states; ADR-009 receipt/output manifest contract                               | publication/object/cache implementation AICO-055/AICO-057; tamper proof AICO-083      |
| A7-CACHE-01                  | no-store downstream; optional trusted exact tuple byte cache behind authorization                                         | ADR-007 broker revocation rule                                                                                  | cache configuration and mutation tests AICO-057/AICO-083                              |
| A7-CLEANUP-01                | access closes first; durable deletion ledger, tombstone, unknown-safe retry, hostname non-reuse                           | ADR-007 retention/hold/deletion/restore semantics; ADR-006 outbox/idempotency                                   | cleanup worker AICO-057/AICO-076; fault/restore proof AICO-083                        |
| A7-THREAT-01 / AT-014        | release-blocking matrix in section 12                                                                                     | accepted AICO-003 two-tenant negatives and AICO-004 boundary/output evidence are reusable only for their scopes | AICO-083 adversarial isolation suite; AICO-085 release-candidate AT-014               |
| PRD-FR-041 / SRS-FR-060      | control UI labels exact build/version/state/expiry and offers only eligible rebuild; warning is outside generated content | AICO-004 fixed template contains contextual prototype obligation                                                | founder preview/recovery UX AICO-058; UI/browser proof AICO-081/AICO-085              |

### 13.1 Later issue ownership

- **AICO-057** owns production PreviewModule publication, grant, preview-only
  composition/ingress, signer verification, immutable object delivery, header,
  cache, expiry/revocation, and cleanup implementation. It may split work but may
  not weaken this contract without reopening AICO-007.
- **AICO-058** owns founder-facing top-level launch, `noopener,noreferrer`, exact
  build/version/prototype labeling, accurate availability/expiry/revocation
  states, and policy-safe rebuild/recovery actions. It receives no preview bearer
  in generated content.
- **AICO-083** owns hostile browser, tenant, token, origin, header, network,
  integrity, cache, log, and cleanup testing against the deployed candidate. No
  critical exception may be waived by documentation.
- **AICO-085** owns automated AT-014 and linked requirement evidence on the exact
  release candidate; architecture fixtures do not substitute for it.
- **AICO-076** owns the accepted production retention durations and deletion
  rollout under DEC-013. This ADR defines safe states, not those durations.
- AICO-003/AICO-004 evidence may be cited only for its accepted tenant/object and
  sandbox/output scopes. It cannot prove DNS, browser, signing, header, CDN,
  preview-service, or cleanup behavior that it never executed.

### 13.2 Immutable downstream candidate tuple

AICO-057, AICO-058, AICO-083, and AICO-085 form one cumulative, immutable
evidence chain, not four independently retargetable claims. `A7CandidateTupleV1`
binds at least the clean Product/backend/frontend 40-hex SHAs; accepted AICO-007
semantic SHA; ADR/contract/schema/threat-registry digests; AICO-004 template,
dependency, successful receipt, output-manifest and fixture digests; database/
migration and service/UI image or bundle digests; environment/region; DNS/TLS/
ingress/network/workload-identity configuration digests; signer/key, publication,
access, origin, header, cache, retention, redaction and kill-profile IDs/versions/
digests; browser/test-harness versions; and exact public fixture identity.

Each stage emits an immutable envelope containing its stage ID, result/evidence
digest, this complete tuple, and the predecessor envelope digest:

```text
AICO-057 implementation -> AICO-058 UX -> AICO-083 adversarial -> AICO-085 AT-014
```

No stage may replace a tuple field, inherit evidence from a different candidate,
or reinterpret an earlier result. Any semantic code, UI, artifact, schema,
manifest, environment, network, key, profile, fixture, browser, harness, or
configuration change invalidates the changed stage and every descendant envelope;
the affected stages rerun and produce a new causal chain. A later pass cannot
backfill, bless, or repair an earlier candidate. Missing predecessor, digest
mismatch, dirty-tree input, unknown outcome, skipped case, waiver, cleanup residue,
or redaction failure blocks the tuple rather than producing release evidence.

## 14. Evolution triggers and consequences

Reconsider the selected placement, without weakening the contracts, when:

- generated output requires server-side code, WebAssembly capabilities, external
  network, authentication, uploads, third-party APIs, or production deployment;
- preview throughput/latency proves per-request PostgreSQL or bounded digest
  verification insufficient;
- a CDN can provide auth-before-cache and immediate epoch invalidation with tested
  evidence, or a vendor isolated-site service is adopted through a separate ADR;
- regulation or enterprise contracts require per-tenant account/bucket/domain,
  regional placement, customer keys, or dedicated compute;
- browser changes make the fragment bootstrap, Strict cookie, CSP sandbox, COOP,
  or storage clearing unreliable across the supported matrix; or
- a critical finding shows shared preview-role runtime credentials exceed the
  acceptable blast radius, triggering a dedicated service/account or microVM.

The stable seam is the immutable `PreviewVersion`/manifest/grant/epoch contract.
Changing CDN, signer/HSM, object provider, process placement, database projection,
or hostname provider must preserve those versioned records and historical
readability.

Consequences:

- generated previews cannot share control identity or another preview's browser
  origin, which sharply limits one content mistake's blast radius;
- current authorization and integrity remain explicit and auditable rather than
  delegated to an unrevocable URL or mutable web root;
- previews are deliberately client-only: external APIs, forms, workers,
  downloads, framing, inline/eval code, and public caching are unavailable;
- wildcard DNS/TLS, a preview role, signing keys, object copies, metadata reads,
  and lifecycle reconciliation add operational work; and
- revocation blocks future requests but cannot erase bytes already viewed,
  screenshots, browser memory, or a founder's external recording.

## 15. Non-goals

This ADR does not:

- implement a public preview API, founder UI, production Preview Service, DNS,
  certificates, CDN, KMS/HSM, object bucket, key rotation job, or cleanup worker;
- define a final grant TTL, preview availability duration, audit/tombstone/object
  retention duration, backup purge window, or DEC-013 outcome;
- permit public/anonymous preview links, custom domains, generated authentication,
  preview uploads, comments, collaboration, production hosting, deployment,
  generated backend/server code, arbitrary packages, network access, or proxying;
- make the preview a control-plane iframe, give generated code a rebuild/status
  API, or send control sessions/credentials to the preview site;
- guarantee recall of already-rendered/downloaded/screenshot bytes or clearing of
  storage on a device the platform no longer controls;
- accept ADR-004, finish AICO-057/AICO-058/AICO-076/AICO-083/AICO-085, satisfy R4
  or R7, or claim AT-014/MVP capability completion; or
- allow implementation evidence, green CI, or an agent-authored document to
  approve this proposed decision without the named human owner evidence and exact
  accepted semantic SHA.

## 16. Validation and acceptance requirements

Before this ADR can be accepted, repository validation must prove at least:

1. required metadata, product/issue trace, option matrix, selected option,
   authority reconciliation, tradeoffs, non-goals, evolution, rollback, later
   ownership, and every `A7-*` evidence target are present;
2. the exact origin, grant-binding fields, per-request current-state checks,
   integrity admission/read rules, CSP/header profile, cache key/no-store rules,
   cleanup states, failure matrix, threat IDs, and trace rows cannot be removed or
   relaxed without validator failure;
3. fail-closed document mutations cover at least shared/control origin, reusable
   hostname, `latest`, raw key/presigned-only access, missing Company/version/
   checksum/audience/expiry/epoch/nonce/key/policy binding, stale authorization
   cache, CSP `connect-src`/worker/frame/form relaxation, control CORS/cookie,
   public cache, partial/range serve, integrity bypass, cleanup-unknown success,
   silent rollback, missing ownership, and false acceptance;
4. Markdown formatting and relative links pass without editing unrelated files;
5. proposed mode requires both evidence fields to be exactly `Pending`; accepted
   mode requires the exact accepted status and two distinct permanent attributable
   GitHub pull-request issue-comment URLs for the Architecture/Security and
   Product/Platform decision roles, respectively. If repository governance assigns
   both roles to one human, that person must perform and record two separate review
   acts; neither URL nor comment may be counted twice and role separation remains explicit;
6. each owner comment explicitly says `Accepted for AICO-007`, states its owner
   role, and names the same full clean 40-lowercase-hex semantic SHA; the accepted
   ADR paragraph names that identical SHA and validator comparison covers the
   semantic package at that commit; and
7. any semantic-package edit after either decision invalidates both decisions and
   requires a new clean SHA plus two new distinct role acceptances.

Parent AICO-007 completion additionally requires the executable fixture spike in
section 12. Production/release completion requires AICO-057/AICO-058 behavior,
AICO-083 adversarial evidence, and AICO-085 AT-014 on the release-candidate
environment. None is implied by accepting this decision contract.
