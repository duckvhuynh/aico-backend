# AICO-002 Durable Workflow Spike Evidence

## Scope and authority

- Parent: [aicompanyos#2](https://github.com/duckvhuynh/aicompanyos/issues/2)
- Backend implementation child: [aico-backend#7](https://github.com/duckvhuynh/aico-backend/issues/7)
- Accepted selection: [ADR-006](../architecture/006-durable-workflow-selection.md)
- Product outcome: a persisted founder wait survives replacement-process restart, accepts one exact-version response, and schedules one continuation despite command or event redelivery.

This is an internal architecture spike. It does not add a public clarification endpoint or complete any later clarification, approval, Designer, build, or QA feature.

## One-command evidence

Run the canonical verifier from the repository root:

```text
npm run verify:ci
```

The foreground `workflow-resilience` gate emits a machine-readable evidence object containing the reviewed revision, process/container identities, measured recovery duration, persisted state snapshots, event sequences, invariant row counts, outbox attempt count, receipt/effect count, and lease-race attempt outcomes. The outer verifier then runs the existing HTTP smoke test on the same built images.

## Acceptance map

| Evidence ID    | Executable proof                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A2-TX-01       | An injected exception after wait/run/task/event/outbox writes rolls the entire transaction back.                                                                           |
| A2-TX-02       | A committed wait and response each expose complete state plus matching ordered event/outbox counts.                                                                        |
| A2-SEQ-01      | Eight concurrent event transactions receive a contiguous per-run sequence.                                                                                                 |
| A2-CLAIM-01    | Two simultaneous workers contend for one task; one winner atomically commits the lease, policy decision, effect reservation, and RUNNING attempt.                          |
| A2-LEASE-01    | A replacement worker sees an unresolved stable effect after lease expiry and blocks for reconciliation; the stale worker cannot fail or complete the run.                  |
| A2-WAIT-01     | Application code persists an exact run/workflow/wait/context checkpoint and clears every worker lease while waiting.                                                       |
| A2-RESUME-01   | One exact-version answer resolves the wait, creates a new immutable context snapshot, and makes the existing continuation task READY in one command transaction.           |
| A2-RESUME-02   | Same-key/same-body replay with a new correlation ID returns committed IDs; sequential/concurrent duplicates create no second transition, provider, budget, or cost effect. |
| A2-EVENT-01    | The publisher is stopped after inbox plus projection commit and before acknowledgement; forced redelivery yields two attempts, one receipt, and one projection effect.     |
| A2-RECOVERY-01 | The API container is replaced on the same PostgreSQL volume; run state, ETag, wait count, and ordered history reconstruct in less than 15 minutes.                         |
| A2-CANCEL-01   | A canceled wait rejects its response and its task cannot be claimed.                                                                                                       |
| A2-VERSION-01  | After the configured default rolls to v2, a new run pins v2 while the persisted v1 wait remains readable and pinned to v1.                                                 |
| A2-MIGRATE-01  | The migration fixture performs clean apply, pre-use revert, and forward reapply over populated run history; post-use schema-down rollback fails closed.                    |
| A2-VERIFY-01   | The fail-closed registry requires the workflow-resilience gate and the canonical verifier must finish green.                                                               |

## Failure semantics proved

- PostgreSQL is authoritative; no response is reconstructed from worker memory or logs.
- Waits hold no sleeping worker and no active lease.
- State, immutable answer version, immutable resumed context, event, and outbox commit atomically.
- At-least-once outbox transport applies one logical consumer projection.
- Expired lease holders cannot complete or fail a task after a replacement claimant wins.
- A stable model-effect key permits one provider invocation; an unresolved expired attempt blocks for reconciliation instead of invoking or charging again.
- Canceled/terminal runs cannot be resurrected.
- Schema-down rollback is pre-use only. After durable data exists, rollback keeps the forward-compatible schema and requires a subsequent forward migration.

## Explicit non-goals

- Public clarification or approval routes, question authoring, notifications, and UI.
- Product Brief acceptance, Designer/build/QA execution, general retry policy, and production cancellation UX.
- External broker, Temporal, paid model provider, production external action, or generic workflow builder.
