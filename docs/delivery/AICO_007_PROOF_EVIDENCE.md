# AICO-007 Bounded Preview-Isolation Proof Evidence

## Status and authority

- Parent: [aicompanyos#7](https://github.com/duckvhuynh/aicompanyos/issues/7)
- Decision child: [aico-backend#20](https://github.com/duckvhuynh/aico-backend/issues/20)
- Proof child: [aico-backend#21](https://github.com/duckvhuynh/aico-backend/issues/21)
- Architecture authority: ADR-010 and `PREVIEW_ISOLATION.md`
- Evidence schema: `aico-007-canonical-proof/v1`
- Claim class: `ARCHITECTURE_TEST_ONLY`
- Corrected decision semantic SHA: `0f355699848a5e1c388c70b33dd7bfe61e3fbb4c`
- Architecture/Security decision: [PR #23 comment 5291254107](https://github.com/duckvhuynh/aico-backend/pull/23#issuecomment-5291254107)
- Product/Platform decision: [PR #23 comment 5291254854](https://github.com/duckvhuynh/aico-backend/pull/23#issuecomment-5291254854)
- Accepted proof semantic SHA: [`cb93673e1891a92a81966f4d811d880512602509`](https://github.com/duckvhuynh/aico-backend/commit/cb93673e1891a92a81966f4d811d880512602509)
- Hosted semantic verification: [Backend CI run 31791120796](https://github.com/duckvhuynh/aico-backend/actions/runs/31791120796)
- Retained semantic artifact: `aico-007-preview-proof-cb93673e1891a92a81966f4d811d880512602509` (artifact `9216022086`; expires 2026-11-12)
- Hosted semantic manifest self-digest: `sha256:714788a30180ed7672884ba3bd12b5c0dcfa20960550f6687004f05f6e77a21b`
- QA/Security acceptance: [PR #24 comment 5300021809](https://github.com/duckvhuynh/aico-backend/pull/24#issuecomment-5300021809)

The earlier decision SHA `d30b76fb6aa47212450aee4cd592577f8df1300a` is historical
evidence only. Delivery review found contradictions between its ADR, browser-token schema, and
response profiles. The corrected bundle is accepted independently of this proof; accepting it does
not accept #21, production implementation, founder UX, or AT-014.

## One canonical foreground command

```text
npm run verify:ci
```

The canonical verifier runs the accepted architecture validators, normal repository gates, the
accepted AICO-004 candidate verification, and `npm run prove:preview`. The preview runner refuses a
dirty worktree, records the exact repository SHA, runs the closed 39-case matrix, applies all 12
source-level control mutations in isolated copies, emits only a bounded redacted manifest, and
verifies cleanup before success. `npm run prove:preview` is also available as the proof-only local
entry point after the corrected decision is accepted.

## Test-only boundary

The proof uses synthetic components under `test/aico-007-spike/` plus a locally installed real
Chrome-family browser:

```text
accepted AICO-004-shaped immutable fixture
  -> PreviewProofService
  -> in-memory current-authority/object/cache state
  -> DeterministicBrowserHttpAdapter
  -> loopback HTTPS on two registrable .test sites with a disposable CA
  -> one fresh real-browser profile executing hostile page JavaScript
  -> bounded side-effect and browser-evidence ledgers
```

The spike is outside `src/`, excluded from production builds, and not imported by `AppModule`,
`WorkerModule`, any controller, or a production entry point. It uses no production credential,
external provider, paid service, public DNS, CDN, OS trust-store mutation, broad certificate bypass,
or control-plane route. Browser certificate trust is scoped to the run's disposable CA SPKI; both
HTTPS receivers and CDP are loopback-only, all other harness DNS fails closed, and the fresh profile
must be removed before success. Current authority,
publication, grant, nonce/session, revocation, cache, cleanup, and reconciliation behavior are
represented by a deterministic in-memory state machine so exact races and unknown outcomes can be
replayed without nondeterministic external infrastructure.

## Closed stable-case registry

The integration proof requires exact set equality with all 39 accepted IDs:

| Group                        | Stable cases                                                                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Positive delivery            | `A7-T-POSITIVE-01`                                                                                                                                                         |
| Origin and routing           | `A7-T-ORIGIN-SITE-01`, `A7-T-HOST-TLS-01`                                                                                                                                  |
| Private control boundary     | `A7-T-CONTROL-REQUEST-01`                                                                                                                                                  |
| Cookie, storage, worker      | `A7-T-COOKIE-01`, `A7-T-COOKIE-STORAGE-01`, `A7-T-STORAGE-01`, `A7-T-SERVICE-WORKER-01`                                                                                    |
| Browsing context             | `A7-T-OPENER-NAV-01`, `A7-T-NAVIGATION-01`, `A7-T-FRAME-ANCESTOR-01`, `A7-T-FRAME-CHILD-01`                                                                                |
| CSP, routing, representation | `A7-T-SCRIPT-TARGET-01`, `A7-T-CONNECT-01`, `A7-T-FORM-01`, `A7-T-SCRIPT-01`, `A7-T-REFERRER-01`, `A7-T-MIME-01`, `A7-T-DOWNLOAD-01`, `A7-T-PATH-01`                       |
| Publication integrity        | `A7-T-BUILD-STATE-01`, `A7-T-INTEGRITY-01`, `A7-T-SERVE-INTEGRITY-01`                                                                                                      |
| Current access authority     | `A7-T-ACCESS-BINDING-01`, `A7-T-AUTHORITY-SOURCE-01`, `A7-T-FOREIGN-01`, `A7-T-FOREIGN-PREVIEW-01`                                                                         |
| Lifecycle and cache          | `A7-T-EXPIRY-REVOCATION-01`, `A7-T-REVOCATION-01`, `A7-T-REPLAY-01`, `A7-T-CACHE-01`, `A7-T-CACHE-KEY-01`, `A7-T-HISTORY-01`, `A7-T-CLEANUP-01`, `A7-T-UNKNOWN-OUTCOME-01` |
| Evidence and disclosure      | `A7-T-LOG-01`, `A7-T-DISCLOSURE-01`, `A7-T-REDACTION-01`, `A7-T-EVIDENCE-01`                                                                                               |

Missing, duplicated, renamed, skipped, extra, or selectively unsupported cases fail the baseline.
Mutation runs may select one intended case, but the unmodified baseline always executes all 39.

## Real source-control mutations

`scripts/prove-aico-007-control-mutations.mjs` copies the actual proof implementation into a
validated temporary workspace, links the existing pinned dependency installation, and applies each
accepted transform exactly once. Each transform removes one default real control in
`test/aico-007-spike/contracts.ts`; the affected service or HTTP adapter then exhibits the weakened
behavior. The runner executes every required killing case for that mutation.

| Mutation  | Removed control                                                    | Required killing cases                                 |
| --------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| `A7-M-01` | origin/site separation, host uniqueness, no fallback               | Origin-site, host-TLS                                  |
| `A7-M-02` | strict host-only cookie parsing and isolation                      | Cookie, cookie-storage                                 |
| `A7-M-03` | storage non-authority, worker denial, origin non-reuse             | Storage, service-worker                                |
| `A7-M-04` | opener/navigation/frame isolation                                  | Opener-nav, navigation, both frame cases               |
| `A7-M-05` | exact CSP and private/external target denial                       | Script-target, connect, form, control-request          |
| `A7-M-06` | script and MIME integrity                                          | Script, MIME                                           |
| `A7-M-07` | current authority and exact grant/access bindings                  | Authority-source, access-binding, both foreign cases   |
| `A7-M-08` | successful-build and complete byte integrity                       | Build-state, integrity, serve-integrity                |
| `A7-M-09` | authorization-before-cache and complete immutable key              | Cache, cache-key, history                              |
| `A7-M-10` | action-time expiry/revocation and atomic nonce use                 | Expiry-revocation, revocation, replay                  |
| `A7-M-11` | safe method/path/download/referrer policy                          | Path, download, referrer                               |
| `A7-M-12` | cleanup, unknown, disclosure, redaction, exact-evidence discipline | Cleanup, unknown, log, disclosure, redaction, evidence |

A mutation is killed only if each declared real case fails its named security assertion. Compilation
failure, empty selection, exception injection, unrelated failure, cleanup failure, mock-only drift,
or a surviving intended case blocks the gate.

## Non-waivable ledger and privacy invariants

- Current authority precedes every positive cache or object lookup.
- Each protected state change consumes one matching `maximum_uses=1` invocation intent.
- One grant nonce creates at most one clean host session.
- `HEAD` emits no body; `GET` bytes, length, media type, and digest match the immutable manifest.
- Denied access creates no generated/foreign bytes, redirect, cookie, publication, model, provider,
  ToolGateway, sandbox, budget, cost, or business-success effect.
- Revocation becomes logical authority before purge; later authorizations deny even when cleanup is
  incomplete.
- Cleanup is tenant-scoped and idempotent, preserves the other company and historical evidence,
  tombstones the old host, and never maps ambiguity to success.
- Unknown outcomes inspect the original logical key and request digest; they do not blindly retry or
  invent grants, sessions, publications, or cleanup success.
- Absent and foreign access share the same bounded `404 resource_not_found` status/header/empty-body
  digest and low-cardinality timing class.
- Capability, nonce, cookie, session, URL, query, referrer, body, object key, generated content,
  foreign identifiers, credentials, stacks, SQL, and source maps are never serialized as evidence.

The retained manifest contains only safe classes, counts, closed case/mutation results, exact input
digests, per-case ledger digests and side-effect totals, cleanup inventory counts,
expected-versus-actual file hashes, closed origin classes, browser/runtime/TLS profile digests, a
duration bucket, and an RFC-8785-style canonical self-digest. Unsafe diagnostics, unknown fields,
unbounded evidence, or malformed records fail the proof.

## Required merge evidence

Proof child #21 remains open until all evidence points to the same accepted clean semantic proof
SHA. A later metadata-only reconciliation commit may record those permanent links, but it must not
change proof code, fixtures, cases, mutations, controls, or verification behavior:

- corrected ADR-010 bundle accepted on its own clean semantic SHA;
- 39/39 stable cases pass with exact registry equality;
- 12/12 real source mutations are applied and killed, with zero survivors or invalid kills;
- `npm run verify:ci` passes in hosted Backend CI;
- an attributable human QA/Security acceptance names the exact proof SHA and any disputed IDs;
- issue #21 criteria are reconciled and checked only after those gates pass.

## Explicit limitations

This bounded proof exercises a real browser against disposable local TLS identities, but it does not
prove production DNS, production TLS certificates, CDN/WAF behavior,
provider object storage, production PostgreSQL roles, distributed cache behavior, browser-vendor
isolation bugs, public token issuance, production cleanup workers, or the full supported-browser
matrix. It does not implement AICO-057, AICO-058, AICO-083, or AICO-085; it does not complete
AT-014 or the parent AICO-007 outcome by itself. Those production, UI, adversarial, and release
claims remain with their named downstream issues.
