# AICO-006 Bounded GATE-01 Proof Evidence

## Evidence identity

- Parent: `duckvhuynh/aicompanyos#6`
- Proof child: `duckvhuynh/aico-backend#13`
- Accepted decision: ADR-008
- Contract: `docs/contracts/POLICY_APPROVAL.md`
- Evidence schema: `aico-006-proof/v1`
- Candidate revision: Pending clean commit
- Hosted verification: Pending
- QA/Security evidence: Pending

## One foreground command

```text
npm run verify:ci
```

The canonical verifier starts an isolated PostgreSQL dependency and invokes `scripts/policy-approval-proof.mjs`. That runner selects a unique validated schema, sets `AICO_REQUIRE_POLICY_PROOF=true`, and runs only `test/policy-approval-proof.integration.spec.ts`. Missing environment, an invalid schema, a skipped case, an unknown gate, a failed invariant, or any nonzero subprocess exit fails the foreground command.

## Proof boundary

The proof uses an internal test-only application shape:

```text
Gate01CommandService
  -> PolicyDecisionPort
  -> DeterministicPolicyDecisionService
  -> PostgresDecisionUnitOfWork
  -> isolated proof schema
```

Current Founder, session, active Company, and ownership rows are locked before any idempotency receipt lookup. The command then locks the pinned policy target, Run, exact Artifact Version, and Gate Instance. Policy evidence, founder decision, Run/Gate transition, immutable binding where applicable, one synthetic continuation, ordered events/outboxes, and the completed receipt commit together or roll back together.

The spike is excluded from `tsconfig.build.json` and is never imported by `AppModule`, `WorkerModule`, an HTTP controller, or a production CLI. Synthetic continuations are not Task rows, so the normal worker cannot claim or execute them.

## Stable case coverage

The fixture requires all 33 accepted cases:

```text
A6-T-APPROVE-01
A6-T-REVISION-01
A6-T-REPLAY-01
A6-T-REPLAY-REVOKED-01
A6-T-KEY-COLLISION-01
A6-T-CONCURRENT-01
A6-T-EMPLOYEE-01
A6-T-MODEL-01
A6-T-OPERATOR-01
A6-T-DIRECT-DB-01
A6-T-SERVICE-BYPASS-01
A6-T-CROSS-TENANT-01
A6-T-UNKNOWN-01
A6-T-STALE-RUN-01
A6-T-STALE-ARTIFACT-01
A6-T-STALE-ATTEMPT-01
A6-T-STALE-EMPLOYEE-01
A6-T-STALE-POLICY-01
A6-T-STALE-WORKFLOW-01
A6-T-WRONG-GATE-01
A6-T-WRONG-STATE-01
A6-T-WRONG-ACTION-01
A6-T-WRONG-RESOURCE-01
A6-T-EXPIRED-01
A6-T-TERMINAL-01
A6-T-RESTART-01
A6-T-OUTBOX-REDELIVERY-01
A6-T-FORGED-CONTINUATION-01
A6-T-MISSING-BUDGET-01
A6-T-MISSING-ENVIRONMENT-01
A6-T-MISSING-PARAMETER-01
A6-T-AUDIT-REDACTION-01
A6-T-DENIAL-EVENT-01
```

Coverage equality is executable: the integration test compares the exact passed-ID set to this closed 33-case registry. Missing, duplicated, renamed, skipped, or extra cases fail.

## Transaction and recovery controls

The proof injects failure at these 13 pre-commit boundaries:

```text
AFTER_AUTHORITY_LOCK
AFTER_RECEIPT_LOCK
BEFORE_RECEIPT_WRITE
AFTER_RECEIPT_WRITE
AFTER_POLICY_DECISION
AFTER_FOUNDER_DECISION
AFTER_GATE_TRANSITION
AFTER_APPROVED_BINDING
AFTER_CONTINUATION
AFTER_POLICY_EVENT
AFTER_POLICY_OUTBOX
AFTER_APPROVAL_EVENT
AFTER_APPROVAL_OUTBOX
```

Every injection preserves the exact before-state and leaves the Gate pending. These are rollback-boundary checks, not control mutations. A separate lost-response case commits before the caller receives a result; a replacement command path revalidates current authority before returning the original immutable receipt with no second decision, event, outbox, transition, or continuation.

`scripts/prove-aico-006-control-mutations.mjs` copies the actual proof implementation into a validated temporary workspace, applies each of the 14 accepted control-removal transforms exactly once, and runs the real PostgreSQL integration matrix against a fresh schema. A mutant is killed only when the single real integration test fails in its declared A6 case. Compilation failures, unrelated failures, empty selections, rollback exceptions, and surviving mutants fail the gate. The development evidence recorded 14/14 killed, zero survivors/invalid mutations, and zero exception failpoints counted.

Restart evidence launches `scripts/policy-approval-restart-probe.mjs` as a different operating-system process over the same PostgreSQL schema. One process is forcibly terminated while holding an uncommitted state change; PostgreSQL restores the exact pending state. A replacement process then reconstructs the committed Run/Gate, one founder decision, one continuation, and two ordered events in less than 15 minutes without manual SQL repair.

## Privacy and zero-effect reconciliation

- Raw revision feedback is retained only in the immutable, protected Founder Gate Decision together with a deterministic digest and `CONFIDENTIAL_FOUNDER_INPUT` classification so the later revision task can dereference it. Receipts, events, outbox messages, logs, and general evidence output never contain it.
- Cross-tenant and unknown-resource paths do not return victim identifiers or receipts; safe tenant-scoped denials retain only a keyed supplied-reference digest.
- Tagged DENY has `maximum_uses=0`, `expires_at=null`, a closed reason, and a redacted binding.
- A real subprocess consumer defers sequence gaps, commits inbox/projection, is terminated before outbox acknowledgement, and is replaced; redelivery deduplicates by stable event ID and the replacement acknowledges once.
- A forged delivery is submitted to the consumer and durably quarantined without creating a continuation or execution effect.
- Adapter, provider/model/tool/external, budget, and Designer execution ledgers must all remain zero.
- Multiple seeded canaries are scanned through every base table in the disposable proof schema and retained proof output; any occurrence fails the run.
- The exact-SHA runner rejects a dirty worktree and emits all 33 stable case IDs. Dirty local runs are labeled development-only and cannot serve as acceptance evidence.

## Retained gaps and downstream authority

- AICO-031 owns the production policy registry, general privileged-action evaluator, and tool binding.
- AICO-041 owns production schemas/migrations, identity/session enforcement, the public founder decision service/API, and production database-role deployment.
- AICO-042 owns founder-facing controls, stale/conflict UX, accessibility, and audit links.
- AICO-025/AICO-056/AICO-077 and release issues own durable evidence storage, production event/alert behavior, and release qualification.

Passing this proof may complete AICO-006's bounded architecture outcome. It does not complete MVP-CAP-004, AT-004/005, a production feature, or any later gate.
