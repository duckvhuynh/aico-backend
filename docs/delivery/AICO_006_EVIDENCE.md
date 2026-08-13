# AICO-006 Policy and Exact-Version Approval Evidence

## Scope and authority

- Parent: [aicompanyos#6](https://github.com/duckvhuynh/aicompanyos/issues/6)
- Decision child: [aico-backend#12](https://github.com/duckvhuynh/aico-backend/issues/12)
- Proof child: [aico-backend#13](https://github.com/duckvhuynh/aico-backend/issues/13)
- Product authority: G-02, G-05; MVP-CAP-004 and policy portion of MVP-CAP-011; PRD-FR-016–020 and PRD-FR-059–060; SRS TD-007, SRS-FR-021–026 and SRS-FR-085–088; AT-004–005.
- Delivery authority: Epic E0, Sprint S0, Priority P0, Release Gate R0.

This package selects the deny-by-default policy and exact-version approval architecture. It does not ship the public decision service or UI, complete AICO-041/AICO-042, execute Designer work, or claim MVP-CAP-004 complete.

## Accepted decision evidence

- Accepted semantic revision: `907c563fa336d01afae0fc9da48bd7ccc7327d9a`
- Architecture/Engineering owner: Duc Huynh (`@duckvhuynh`)
- Architecture decision: https://github.com/duckvhuynh/aico-backend/pull/14#issuecomment-5275214714
- Product/Security owner: Duc Huynh (`@duckvhuynh`)
- Product/Security acceptance: https://github.com/duckvhuynh/aico-backend/pull/14#issuecomment-5275215380
- Candidate exact-SHA verification: https://github.com/duckvhuynh/aico-backend/actions/runs/31659994562
- Decision date: 2026-08-13
- Disputes: None
- Conditions: None

These decisions accept the architecture package only. Backend child #13 remains required for executable proof, and exact-final-SHA QA/Security approval remains a merge gate for child #12.

## Founder trust outcome

The architecture must make one claim provable: only an authenticated founder decision about the exact pending artifact version that they reviewed may release the corresponding gate, and replay, stale context, another actor, another company, or process replacement cannot create an additional or unauthorized effect.

## Parent acceptance map

| Parent criterion                                      | Binding evidence                                        | Completion rule                                                                                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versioned policy input and parameter-bound ALLOW      | ADR-008; `POLICY_APPROVAL.md`; A6-INPUT-01; A6-ALLOW-01 | Every authoritative input, digest, version, expiry, and missing-context denial is explicit; no model, transcript, session, or caller-selected tenant becomes authority.                                     |
| Atomic exact-version founder decision                 | ADR-008; `POLICY_APPROVAL.md`; A6-TX-01; A6-REPLAY-01   | The transaction locks current tenant/run/artifact authority, records immutable decision and ordered event/outbox, changes only the permitted state, and creates one unique continuation or revision intent. |
| Complete negative matrix with no unauthorized effects | `AICO_006_THREAT_TEST_PLAN.md`; A6-DENY-01; A6-AUDIT-01 | Stable cases cover actor, tenant, version, state, gate, expiry, cancellation, duplicate, restart, and forged-bypass attempts while preserving required scoped/redacted denial audit evidence.               |

## Evidence inventory

| Evidence ID   | Evidence or command                                          | Expected authority/result                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A6-ADR-01     | `docs/architecture/008-policy-exact-version-approval.md`     | Compares viable approaches, selects the bounded MVP architecture, reconciles accepted/proposed authority, and binds attributable Architecture and Product/Security decisions to the exact accepted semantic SHA. |
| A6-INPUT-01   | ADR-008 and `docs/contracts/POLICY_APPROVAL.md`              | Defines the closed, versioned action-time policy and decision command inputs, authoritative sources, digests, validation, and default-deny behavior.                                                             |
| A6-ALLOW-01   | ADR-008 and policy contract                                  | ALLOW binds actor/employee, tenant, action, resource, parameters, attempt, artifact, gate, workflow/policy version, environment, budget state, and expiry; it never grants a session.                            |
| A6-TX-01      | ADR-008 and policy contract                                  | Defines one PostgreSQL transaction for locks, policy result, immutable founder decision, artifact/run/task transition, ordered event/outbox, and unique continuation/revision intent.                            |
| A6-REPLAY-01  | Policy contract and A6 threat plan                           | Same key plus same stable business command replays the original receipt; changed business content conflicts; concurrent commands create one winner and one logical effect.                                       |
| A6-DENY-01    | `docs/delivery/AICO_006_THREAT_TEST_PLAN.md`                 | Stable adversarial cases deny unauthorized/stale/invalid actions without business, tool, provider, budget, or downstream effects and without tenant/resource disclosure.                                         |
| A6-AUDIT-01   | Policy contract and A6 threat plan                           | A denial that falls under SRS-FR-087 creates exactly one scoped/redacted PolicyDecision plus linked denial event/outbox; this audit is not an authorized business success effect.                                |
| A6-RESTART-01 | Backend child #13 deterministic harness                      | Replacement processes reconstruct the pending/decided truth from PostgreSQL and resume at most once within the recorded recovery objective.                                                                      |
| A6-VERSION-01 | ADR-008, policy contract, and child #13                      | Existing decisions/runs remain readable under pinned workflow/policy/schema versions; unsupported or unsafe migration/rollback fails closed.                                                                     |
| A6-AEO-01-12  | `docs/delivery/AICO_006_AEO_AUDIT.md`                        | Causal, privacy-safe, low-cardinality evidence, replay modes, reconciliation, and readiness gates prevent unsupported or non-reproducible claims.                                                                |
| A6-TRACE-01   | This file and `scripts/validate-aico-006-architecture.mjs`   | Every parent criterion and cited authority has a binding artifact or explicit downstream owner; missing required text/evidence fails closed.                                                                     |
| A6-VERIFY-01  | `npm run verify:policy-architecture` and `npm run verify:ci` | Structural validation, deterministic mutation probes, and all canonical foreground gates pass on the exact reviewed SHA without paid services.                                                                   |

## Current reusable evidence is partial

- PostgreSQL already has tenant-bound `runs`, immutable `artifact_versions`, `approvals`, `policy_decisions`, ordered `events`, transactional `outbox_messages`, and command idempotency records.
- `CommandExecutor` already provides transactional stable-business-payload idempotency and changed-payload conflict behavior.
- `DomainEventService` allocates contiguous per-run order and writes the event/outbox pair in the caller transaction.
- AICO-002 proves durable waits, restart/replay, one continuation, outbox/inbox deduplication, version pinning, and stale-worker fencing.
- AICO-003 binds tenant ownership, non-disclosing denial, zero unauthorized business/external effect, and the SRS-FR-087 safe denial-audit exception.
- The worker publishes a Product Brief artifact as `PENDING_APPROVAL` and reaches `AWAITING_BRIEF_APPROVAL`.

These facts reduce proof cost but do not complete AICO-006. The worker currently inserts a hard-coded `ALLOW` for deterministic model invocation. No production founder decision command, deny-by-default evaluator, exact GATE-01 transaction, revision transaction, or complete negative matrix exists.

## Downstream ownership and non-goals

| Retained gap                                    | Required contract now                                                                                                              | Later owner        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| No production policy evaluator/port integration | Define typed port, versioned rules, default-deny, parameter binding, and audit semantics.                                          | AICO-031           |
| No public founder decision command/API          | Define the exact transaction, receipt, failure, replay, and authorization contract without registering a production endpoint here. | AICO-041           |
| No approval/revision UI or artifact diff        | Preserve exact-version and refresh/remediation requirements; do not invent UI acceptance.                                          | AICO-040, AICO-042 |
| No Designer dispatch or revision generation     | Define one synthetic continuation/revision intent for the proof; never execute later employee work.                                | AICO-043, AICO-045 |
| No complete run cancellation implementation     | Specify that canceled/terminal work cannot be approved or resurrected.                                                             | AICO-029, AICO-074 |
| No release E2E                                  | Keep AT-004/005 and complete founder gate behavior open after the bounded architecture proof.                                      | AICO-046, AICO-085 |

## Decision and merge gates

1. The AICO-006 validator and fail-closed mutation probes pass in Proposed mode.
2. An identifiable human Architecture owner accepts the selected decision on the exact semantic SHA.
3. An identifiable human Product/Security owner separately accepts founder semantics, scope boundaries, and non-waivable denial/audit controls on that same SHA.
4. ADR status and both permanent evidence URLs are bound in a metadata-only revision.
5. Accepted-mode and canonical exact-SHA verification pass; QA/Security approves the final evidence SHA.
6. Decision child #12 may then merge and become Done; proof child #13 moves `Blocked → Ready`.
7. Parent AICO-006 remains In progress until child #13 proves the bounded matrix and receives exact-SHA QA/Security approval.

Any semantic change after owner acceptance requires new Architecture and Product/Security decisions. Any commit after QA/Security approval requires new exact-SHA verification and QA/Security approval.
