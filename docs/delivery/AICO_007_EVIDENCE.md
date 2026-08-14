# AICO-007 Decision Evidence and Traceability

**Status:** Accepted architecture decision; no proof-child result, production implementation, R4
completion, or AT-014 pass is claimed

**Parent:** [`duckvhuynh/aicompanyos#7`](https://github.com/duckvhuynh/aicompanyos/issues/7)
**Decision child:** [`duckvhuynh/aico-backend#20`](https://github.com/duckvhuynh/aico-backend/issues/20)
**Proof child:** [`duckvhuynh/aico-backend#21`](https://github.com/duckvhuynh/aico-backend/issues/21),
blocked until decision child #20 is accepted

## Accepted decision evidence

- Accepted semantic revision: `d30b76fb6aa47212450aee4cd592577f8df1300a`
- Architecture/Security owner: Duc Huynh (`@duckvhuynh`)
- Architecture/Security decision:
  https://github.com/duckvhuynh/aico-backend/pull/22#issuecomment-5290436765
- Product/Platform owner: Duc Huynh (`@duckvhuynh`)
- Product/Platform decision:
  https://github.com/duckvhuynh/aico-backend/pull/22#issuecomment-5290437423
- Candidate exact-SHA verification:
  https://github.com/duckvhuynh/aico-backend/actions/runs/31775182096
- Decision date: 2026-08-14
- Disputes: None
- Conditions: None

These two separate, explicitly role-bound decisions accept the architecture package only. The
metadata-only acceptance revision must pass accepted-mode hosted CI before merge. Proof child #21
remains required for executable architecture proof, and parent AICO-007 remains incomplete.

## 1. Decision outcome and evidence semantics

AICO-007 selects a bounded preview-isolation architecture. The selected contract permits only an
immutable, checksum-verified successful AICO-004 static build to receive short-lived, revocable
preview access on a control-plane-isolated origin. Generated content receives no control-plane
identity, cookies, storage, private API, another preview's authority, or unrestricted network
authority.

That statement is now **selected**, but not yet **proved**, **implemented**, or
**release-qualified**:

- **Specified** means the proposed ADR, contract, schema, threat plan, and audit describe the
  required behavior.
- **Structurally verified** means the package validators and document/schema mutations pass on an
  exact clean semantic SHA. It does not prove browser, HTTP, production, or release behavior.
- **Selected** means separate attributable Architecture/Security and Product/Platform owners accept
  that exact semantic SHA through permanent evidence URLs.
- **Proved** means proof child #21 executes its closed deterministic fixture and mutation matrix on
  the accepted decision. It remains architecture-test evidence, not production evidence.
- **Implemented** means AICO-057 and AICO-058 deliver the production Preview Service and founder UX.
- **Release-qualified** means AICO-083 and AICO-085 pass applicable release-candidate security and
  AT-014 evidence. Only this final level supports an AT-014 pass claim.

## 2. Authority and scope trace

The Product sources define the eventual product behavior; the issues divide delivery ownership.
Later implementation cannot silently weaken the accepted AICO-007 boundary, while architecture
evidence cannot be substituted for later implementation or release evidence.

| Source      | Required outcome                                                                                                                           | What this package can establish                                                                            | What it cannot establish                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-01 / G-05 | A usable preview value unit with zero critical policy/isolation incidents.                                                                 | A reversible isolation decision and proof contract.                                                        | Founder value, production reliability, or an incident-free release.                                                                                     |
| SRS TD-008  | Use an origin/security context that cannot access control-plane identity or private APIs.                                                  | Select and freeze the origin, access, header, integrity, cache, and lifecycle boundary.                    | That deployed infrastructure or supported browsers enforce the boundary.                                                                                |
| PRD-FR-040  | Create a browser preview only from a successful build and isolate it from the control plane.                                               | Bind eligibility to accepted AICO-004 success and immutable manifest/checksum evidence.                    | Create a production browser preview. Proof child #21 supplies only a bounded fixture; AICO-057, AICO-083, and AICO-085 retain production/release proof. |
| PRD-FR-041  | Label the preview and export README as prototype-only and not production-ready.                                                            | Retain the labeling obligation and prevent generated content from being the authoritative warning surface. | Deliver the preview UI or export README. AICO-058 owns preview labeling; AICO-069/AICO-070 own package/README delivery and validation.                  |
| SRS-FR-059  | Preview Service accepts only successful outputs, uses an isolated origin and restrictive headers, and prevents private control API access. | Define the closed service contract and deterministic proof cases.                                          | Implement or qualify Preview Service. AICO-057 implements it; AICO-083 tests the deployed candidate.                                                    |
| SRS-FR-060  | Preview UI shows prototype label, exact build version, availability/expiry, and eligible rebuild action.                                   | Define metadata and trust boundaries consumed by the UI.                                                   | Implement or validate the founder UX. AICO-058 implements it; AICO-085 verifies the complete flow.                                                      |
| AT-014      | A release-candidate preview attempt against the control plane fails because isolated origin/auth prevents access.                          | Provide partial enabling architecture and, after #21, deterministic component evidence.                    | Claim AT-014 passed. AICO-085 owns the complete release-candidate scenario after AICO-057/058 and AICO-083.                                             |

### Parent acceptance criteria

| Parent `aicompanyos#7` criterion                                                                                                   | Present evidence                                                                                                                                                                                                               | Current verdict                                                                               | Completion gate                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| ADR defines isolated origin/security headers, signed access, expiry/revocation, build integrity, caching, and cleanup.             | [`ADR-010`](../architecture/010-preview-isolation-selection.md), [`PREVIEW_ISOLATION.md`](../contracts/PREVIEW_ISOLATION.md), and [`preview-isolation.v1.schema.json`](../contracts/schemas/preview-isolation.v1.schema.json). | **Accepted decision.** Both role-bound owner decisions reference the same exact semantic SHA. | Metadata-only accepted-mode hosted CI and merge complete decision child #20; parent completion still requires #21.     |
| Threat model covers control-plane request, cookie/storage access, navigation, script, another preview, and expired-token attempts. | [`AICO_007_THREAT_TEST_PLAN.md`](./AICO_007_THREAT_TEST_PLAN.md) defines the closed `A7-T-*` registry and `A7-M-*` mutation ownership.                                                                                         | **Accepted contract, not executed.** A registry is not a passing proof result.                | #21 executes every required case/mutation without skip, waiver, survivor, prohibited evidence, or cleanup residue.     |
| Spike serves fixture output and proves private control API access fails.                                                           | #21 defines the required spike outcome. No proof result bundle is part of this proposed decision package.                                                                                                                      | **Not met.** The proof child remains blocked and no fixture pass is claimed.                  | #21 is unblocked after #20 acceptance, then merges exact-SHA local/hosted evidence and criterion-level reconciliation. |

The first two parent criteria are decision-child work. The third is proof-child work. Parent
AICO-007 must remain incomplete until both children are accepted/merged and all three parent
criteria are reconciled to permanent evidence.

## 3. Evidence map

| Evidence ID       | Proposed package evidence                                                                                                                                                  | Present truth                                                                                       | Missing completion evidence / owner                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `A7-ADR-01`       | ADR-010 compares delivery choices and selects a reversible MVP boundary.                                                                                                   | Accepted by both named roles on exact semantic SHA `d30b76fb6aa47212450aee4cd592577f8df1300a`.      | Metadata-only accepted-mode hosted CI and #20 merge.                                                                    |
| `A7-ORIGIN-01`    | ADR/contract define separate site/origin, no control cookies/storage/service workers, closed headers, navigation/opener/referrer/download rules, and no private API route. | Text and schema are present.                                                                        | #21 browser/HTTP fixture; production DNS/TLS/ingress/browser evidence in AICO-057/083.                                  |
| `A7-ACCESS-01`    | Grant binds tenant, preview, build/artifact/manifest versions and checksums, audience, expiry, epoch, nonce, key, and policy.                                              | Contract is specified; no issuer, broker, or key custody exists here.                               | #21 invalid/foreign/replay cases; production issuer/broker in AICO-057; release proof in AICO-083.                      |
| `A7-INTEGRITY-01` | Admission requires successful immutable AICO-004 output and rejects tamper, stale, partial, mixed, or unsafe content.                                                      | Reuses only accepted AICO-004 build/output evidence.                                                | #21 fixture; production publication/object/cache verification in AICO-055/057; adversarial proof in AICO-083.           |
| `A7-CACHE-01`     | Authorization precedes any cache lookup; authenticated responses are no-store; optional byte cache uses the complete immutable identity.                                   | Cache policy is specified, not deployed.                                                            | #21 cache mutations; AICO-057 production cache configuration; AICO-083 candidate attacks.                               |
| `A7-CLEANUP-01`   | Logical denial precedes idempotent physical cleanup; ambiguity remains unavailable and reconciled; public identities are not reused.                                       | State/failure contract is specified.                                                                | #21 cleanup/unknown-outcome proof; AICO-057/076/084 production lifecycle and resilience; AICO-083/085 release evidence. |
| `A7-THREAT-01`    | Threat plan provides stable positive/negative cases and one-control-at-a-time mutations.                                                                                   | Registry exists; executable results do not.                                                         | #21 complete exact-SHA proof, then AICO-083/085 production/release reruns.                                              |
| `A7-TRACE-01`     | This file maps requirements, criteria, evidence state, gaps, owners, gates, and non-goals.                                                                                 | Accepted decision evidence and remaining gaps are explicit.                                         | Merge and issue/Project reconciliation / #20 and Delivery.                                                              |
| `A7-AEO-01-12`    | [`AICO_007_AEO_AUDIT.md`](./AICO_007_AEO_AUDIT.md) defines authoritative-state, causal-identity, redaction, reproduction, reconciliation, and cumulative readiness gates.  | Audit reports `pre-A7-READY-0`; it does not confer readiness.                                       | #20/#21 evidence, followed by AICO-057/072 production telemetry and AICO-083 release evidence.                          |
| `A7-VERIFY-01`    | Structural validator and document/schema mutation probes are included in the package.                                                                                      | Exact semantic SHA passed proposed-mode hosted CI; metadata revision passes accepted mode locally.  | Accepted-mode hosted CI on the metadata-only revision / #20.                                                            |
| `A7-ACCEPT-01`    | ADR reserves separate Architecture/Security and Product/Platform decisions.                                                                                                | Both permanent attributable role-bound decisions are recorded against the same 40-hex semantic SHA. | Accepted metadata merge and issue reconciliation / #20.                                                                 |

## 4. Present-versus-required truth

| Layer                     | Present now                                                                                                                                                    | Required before the corresponding claim                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proposed package          | ADR, contract/schema, threat plan, AEO audit, evidence map, structural validator, and document/schema mutation probe source.                                   | Internal consistency and Proposed-mode verification on the final clean semantic SHA.                                                                                                              |
| Decision acceptance       | Accepted status, semantic SHA, and both permanent role-bound owner decisions are recorded; accepted-mode local validation passes.                              | Accepted-mode hosted CI and metadata-only merge complete #20.                                                                                                                                     |
| Architecture proof        | Threat cases and mutation registry are specifications only; #21 has no result bundle.                                                                          | The immutable checksum-pinned AICO-004 fixture, complete closed `A7-T-*`/`A7-M-*` execution, private control API denial, clean-SHA hosted rerun, bounded redacted evidence, and verified cleanup. |
| Production implementation | No Preview Service, publisher, broker/issuer, preview database state, isolated production origin, CDN/cache, revocation/cleanup worker, or founder preview UI. | AICO-057 platform implementation and AICO-058 frontend implementation with their R4 gates.                                                                                                        |
| Release qualification     | No production DNS/TLS/CDN/WAF attestation, supported-browser isolation result, adversarial candidate result, or full-flow acceptance result.                   | AICO-083 security evidence and AICO-085 AT-014 evidence on the exact release candidate with real service boundaries.                                                                              |
| Product completion        | No R4, R7, MVP-CAP-007, SRS definition-of-done, or alpha-readiness claim.                                                                                      | All named downstream work and release gates pass; Product/Delivery reconcile the authoritative issues and evidence.                                                                               |

Local loopback/browser/HTTP evidence may prove only the bounded contract behavior it actually
executes. It must not be described as production origin, CDN, infrastructure, supported-browser,
R4, R7, or full AT-014 evidence.

## 5. Non-waivable acceptance gates

### Gate 1 — `A7-READY-0 AUDITABLE` for decision child #20

1. ADR, contract/schema, threat plan, AEO audit, evidence map, stable IDs, structural validator,
   and document/schema mutation probes are complete and mutually consistent.
2. `npm run verify:preview-architecture` and the canonical repository verification pass in
   Proposed mode on the final clean semantic SHA; hosted CI passes the same SHA.
3. Proposed status and both ADR owner-evidence fields remain `Pending`. A local pass, agent review,
   or green check cannot approve the decision.

### Gate 2 — `A7-READY-1 SELECTED` for decision child #20

1. An attributable Architecture/Security owner approves the origin, access, integrity, header,
   cache, lifecycle, rollback, and retained platform limitations on the exact semantic SHA.
2. A separate attributable Product/Platform decision approves the PRD/SRS interpretation,
   prototype labeling boundary, downstream ownership, and explicit non-goals on that same SHA. If
   repository governance assigns both decision roles to one human, the reviews and permanent
   comments remain separate and explicitly role-bound.
3. The ADR records both permanent evidence URLs and the 40-hex semantic SHA. A metadata-only
   accepted-status revision passes accepted-mode validation and hosted CI.
4. Any semantic change after either decision invalidates both decisions and requires renewed review.

Reaching Gate 2 accepts the decision child and unblocks proof child #21. It does not complete parent
AICO-007, check the spike criterion, or satisfy AT-014.

### Gate 3 — `A7-READY-2 PROVED` for proof child #21 and parent AICO-007

1. #21 serves the exact immutable successful AICO-004 fixture and executes the complete closed
   proof/mutation registry in one paid-service-free foreground command with unconditional cleanup.
2. Private control API, control identity/cookie/storage, foreign tenant/preview, invalid/replayed/
   expired/revoked access, integrity, cache, navigation, script, cleanup, ambiguity, and redaction
   cases fail closed with no unauthorized side effect.
3. Exact-SHA local and hosted results, complete case-set equality, bounded evidence, cleanup result,
   and attributable QA/Security acceptance are permanent and reconciled to #21.
4. Parent issue #7 reconciles all three acceptance criteria only after both children are merged.

Gate 3 proves the architecture spike. It still does not implement the production Preview Service,
satisfy R4, or pass AT-014.

### Gates 4–5 — implementation and release qualification

- `A7-READY-3 IMPLEMENTED`: AICO-057 and AICO-058 deliver and verify production publication,
  access, isolation, lifecycle, telemetry, and founder UX under R4.
- `A7-READY-4 RELEASE-QUALIFIED`: AICO-083 adversarially verifies the deployed candidate and
  AICO-085 passes AT-014 in the complete release-candidate flow. Only then may Release/Product claim
  AT-014 or the linked preview capability complete.

## 6. Downstream ownership

| Owner                                     | Required downstream responsibility                                                                                                                                                                                               | Boundary retained by this package                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| AICO-057 / R4 Platform                    | Production publication/access service, durable state, exact successful-output consumption, origin/edge/object/cache/workload identity, issuer/broker, expiry/revocation, observability, cleanup, retry, migration, and rollback. | Cannot weaken the accepted isolation contract or claim founder UX/release evidence.                  |
| AICO-058 / R4 Frontend                    | Safe top-level open with `noopener,noreferrer`, persistent prototype warning outside generated content, exact build/version/state/expiry, and accessible eligible rebuild/recovery actions.                                      | Cannot claim server isolation, signed access, publication integrity, private API denial, or cleanup. |
| AICO-069 / AICO-070 / R6                  | Generate and validate the export package/README, including prototype/client/mock limitations and reproducible instructions.                                                                                                      | PRD-FR-041's export-README requirement is not delivered by AICO-007 or AICO-058.                     |
| AICO-076 / AICO-081 / AICO-082 / AICO-084 | Retention/deletion policy; browser compatibility; broad tenant/redaction evidence; restart/race resilience.                                                                                                                      | Supporting suites may reuse stable IDs but cannot waive AICO-057/058/083/085 obligations.            |
| AICO-083 / R7 Security                    | Attack the deployed release candidate across origin, control API, tenant/preview, token, browser, integrity, cache, lifecycle, telemetry, and alert/kill boundaries.                                                             | Architecture fixtures cannot substitute for production controls.                                     |
| AICO-085 / R7 QA                          | Run AT-014 in the full candidate flow from exact successful build through founder open, hostile control attempt, expiry/revocation, and safe UI outcome.                                                                         | A green component or loopback test is not AT-014.                                                    |

These owners share one immutable candidate lineage. AICO-057 records the backend
SHA/image, schema and migration set, issuer/edge/DNS/TLS/policy/profile/config
digests, and evidence manifest. AICO-058 adds the frontend SHA/image and control API
contract digest. AICO-083 must test that exact tuple and record its adversarial
result digest; AICO-085 must test the same tuple plus the AICO-083 result. Any
change to a bound component invalidates the affected downstream evidence rather
than inheriting an earlier green result.

## 7. Explicit non-goals and prohibited claims

This proposed package does not:

- implement a production module, API, database migration, Preview Service, publisher, token issuer,
  access broker, CDN, DNS/TLS/WAF configuration, object/cache platform, cleanup worker, or founder UI;
- deliver the export README or satisfy all of PRD-FR-041/SRS-FR-060;
- support public or anonymous preview links, custom domains, persistent public hosting, generated
  backend/server code, generated authentication, uploads, arbitrary packages, external network,
  deployment, or a control-plane proxy;
- prove production infrastructure, all supported browser/vendor behavior, recall of already viewed
  bytes, or deletion from a founder-controlled device;
- complete AICO-057, AICO-058, AICO-083, AICO-085, R4, R7, MVP-CAP-007, the SRS definition of
  done, private-alpha readiness, or full AT-014; or
- treat documentation, structural validation, local loopback evidence, green CI, or agent review as
  human owner acceptance or production/release evidence.

Any future claim must name the exact evidence level, immutable SHA/candidate version, owner,
permanent evidence URL, and unresolved downstream gaps. Missing or ambiguous evidence remains
`BLOCKED`; it never defaults to success.
