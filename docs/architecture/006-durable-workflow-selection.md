# ADR-006: Durable Workflow and Ordered Event Selection

**Status:** Accepted for AICO-002 by the Architecture Decision Owner
**Date:** 2026-08-12  
**Decision owner:** Duc Huynh (`duckvhuynh`)  
**Decision evidence:** https://github.com/duckvhuynh/aico-backend/issues/6#issuecomment-5267668545
**Parent:** `duckvhuynh/aicompanyos#2`  
**Implementation child:** `duckvhuynh/aico-backend#7`  
**Product trace:** Goal G-04; MVP-CAP-006 and MVP-CAP-010; PRD-FR-025–032 and PRD-FR-052–054; SRS TD-001 and TD-006; SRS-FR-033–045 and SRS-FR-074–078; AT-006 and AT-007

## 1. Context and decision boundary

AI Company OS must preserve human waits, task dependencies, exact workflow versions, retries, cancellations, ordered history, and resumable state without relying on a worker's memory. At-least-once delivery is expected, while commands, continuations, projections, and external effects must remain logically once.

This decision selects the MVP workflow scheduler, authoritative state boundary, and ordered event/outbox approach. It does not implement the later Product Brief approval, clarification UX, full task graph, policy/budget engine, cancellation surface, Designer/build/QA stages, or a general workflow builder. Those remain assigned to their parent backlog issues.

The architecture proof required by AICO-002 is narrower: persist one exact-version human wait, restart the processes, resume it once, and prove duplicate command/event delivery has one logical effect. Backend issue #7 owns that proof.

## 2. Decision drivers

The selected option must satisfy all of these drivers:

1. Persist a wait for hours or days without a sleeping process, open transaction, or active lease.
2. Pin every run to an immutable workflow version and keep older runs readable during rollout or rollback.
3. Derive task readiness from persisted dependencies, approvals, policy, budget, and cancellation state.
4. Commit a material state transition, ordered event, and outbox message atomically with RPO 0 at the PostgreSQL boundary.
5. Support idempotent commands, replay-safe consumers, and explicit reconciliation for unknown external outcomes.
6. Prevent stale lease holders from committing after another worker recovers the work.
7. Preserve contiguous per-run event ordering, causation, correlation, and audience-safe history.
8. Recover an eligible wait/task to an accurate resumed or blocked state within 15 minutes of process restart.
9. Support local deterministic Docker verification without paid services or developer-managed background processes.
10. Remain operable by a small MVP team and expose replacement seams before additional infrastructure is justified.

## 3. Options considered

Legend: `Strong` meets the driver natively or with a small explicit pattern; `Viable` needs application discipline; `Weak` introduces a material gap for the MVP.

| Criterion                     | A — PostgreSQL state + lease scheduler + ordered events/outbox | B — External durable workflow engine                            | C — PostgreSQL state + broker/job queue                   | D — In-process scheduler                          |
| ----------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| Human waits                   | Strong: persisted wait row; no active worker                   | Strong: native durable timer/signal                             | Viable: wait stays in PostgreSQL, not broker              | Weak: process memory or custom recovery           |
| Immutable workflow versions   | Strong: run pins registry version                              | Strong: native versioning, but vendor semantics                 | Viable: PostgreSQL must remain authoritative              | Weak: deployment can silently change behavior     |
| Task dependencies             | Viable: explicit DAG/state predicates                          | Strong: native orchestration                                    | Viable: broker delivery is not readiness authority        | Weak: custom in-memory coordination               |
| Atomic state + event + intent | Strong: one PostgreSQL transaction                             | Viable: dual authority or engine-owned state must be reconciled | Weak: database/broker dual write without outbox           | Weak: process death loses intent                  |
| Command idempotency           | Strong: unique scoped record in the command transaction        | Viable: engine request IDs plus application state               | Viable: still needs PostgreSQL idempotency                | Weak: local maps do not survive restart           |
| Consumer replay/deduplication | Strong: stable event ID + inbox key                            | Strong: engine history; adapters still need dedupe              | Viable: broker is at-least-once; inbox still needed       | Weak: no durable receipt                          |
| Lease/fencing                 | Strong: short lease token checked at commit                    | Strong: engine task tokens                                      | Viable: broker visibility timeout plus DB fencing         | Weak: local lock dies with process                |
| Cancellation                  | Viable: persisted request and claim/commit predicates          | Strong: native cancellation model                               | Viable: database must override queued messages            | Weak: races are difficult to reconstruct          |
| Ordered founder history       | Strong: locked per-run counter in authoritative DB             | Viable: project engine history into product events              | Viable: partition order does not replace product sequence | Weak: log order is not authority                  |
| Recovery ≤15 minutes          | Strong: reclaim expired leases/persisted waits                 | Strong: native replay                                           | Viable: broker redelivery plus DB recovery                | Weak: manual reconstruction likely                |
| Local deterministic proof     | Strong: existing PostgreSQL/Docker baseline                    | Weak: another service/runtime and test harness                  | Viable: adds broker service and failure modes             | Strong only for happy process lifetime            |
| Small-team operations         | Strong: one authoritative data service                         | Weak for MVP: new operational/control plane                     | Viable: extra broker operations and dual diagnosis        | Superficially strong, but unsafe durability       |
| Future replacement seam       | Strong: scheduler/event-bus ports                              | Strong but raises exit cost                                     | Strong: broker adapters                                   | Weak: domain becomes coupled to process lifecycle |

## 4. Proposed decision

Select **Option A: PostgreSQL-authoritative workflow state, lease-based scheduling, ordered run events, and a transactional outbox** for the MVP.

The database is the only workflow authority. The queue is a derived eligibility query, not a second source of truth. API and worker processes remain stateless between transactions. No external broker or durable workflow engine is required for the first MVP. `WorkflowSchedulerPort` and `EventBusPort` remain explicit replacement seams.

This choice is conditional on backend issue #7 proving persisted wait/restart/resume, atomic rollback, lease fencing, duplicate delivery, pinned version recovery, and the 15-minute objective. Failure of a non-waivable proof reopens this decision; it does not permit a documentation-only waiver.

### 4.1 Why the other options are not selected now

- **Option B** provides excellent workflow primitives but adds another state/history authority, local service, upgrade surface, and operating model before MVP evidence shows PostgreSQL is inadequate.
- **Option C** improves distribution throughput but does not eliminate PostgreSQL idempotency, fencing, wait, or product-order requirements. It creates a second delivery system and dual-write risks without current load evidence.
- **Option D** is suitable only for non-authoritative polling or test helpers. It cannot meet restart, wait, or RPO requirements and is prohibited as the system of record.

## 5. Binding semantics

### 5.1 Atomic command and transition boundary

A transaction that acknowledges a material command must commit all applicable elements together:

1. current aggregate state and optimistic version;
2. immutable command/decision/wait/attempt record;
3. next contiguous run event;
4. linked outbox message; and
5. completed idempotency response.

If any write or validation fails, all five elements roll back. Publishing happens only after commit. Logs, model text, or transport acknowledgements cannot substitute for this transaction.

### 5.2 Human wait and exact-once resume

A persisted wait owns:

- `company_id`, `run_id`, immutable `workflow_version`, `wait_kind`, `wait_version`;
- expected run state and row version;
- exact artifact/context reference when applicable;
- `OPEN`, `RESOLVED`, `CANCELED`, or `EXPIRED` status;
- created, resolved, and optional expiry timestamps; and
- the resolving command/event/continuation references.

An open wait has no worker lease. A valid response transaction locks the wait and run, validates tenant/actor/schema/exact versions/expected state, changes the wait once, appends one event/outbox, and creates one continuation intent. The command idempotency record returns the original response for a retry with the same body and rejects a changed body. Duplicate delivery cannot create another continuation because uniqueness is enforced by wait/version and consumer/event keys.

### 5.3 Task claim, lease, and fencing

- Claim only persisted eligible work with `FOR UPDATE SKIP LOCKED`.
- Use a short `lease_token` and `lease_expires_at`; a lease is ownership permission, not completion evidence.
- Reclaim only after expiry and mark an abandoned attempt explicitly.
- Re-evaluate cancellation and terminal state before external work and before commit.
- Commit completion only when the task is still `RUNNING`, the lease token matches, and the run is eligible.
- A stale or unknown outcome may append separately authorized diagnostic evidence, but it cannot mutate task/run success or failure, emit a duplicate material event, or repeat a non-idempotent external action blindly.

### 5.4 Ordered events, outbox, and inbox

- Lock one `run_event_counters` row to allocate a contiguous sequence within a run.
- Insert event and outbox rows in the caller's state transaction.
- Publish at least once with a stable event ID and bounded outbox lease.
- A consumer commits its `(consumer_name, event_id)` inbox receipt and logical projection/effect in one transaction.
- Marking an outbox message published is conditional on its lease token. A crash after the consumer effect but before publisher acknowledgement causes redelivery, not a duplicate logical effect.
- Correlation and causation IDs are immutable history; high-cardinality IDs remain out of metric labels.

### 5.5 Dependencies, policy, budget, and cancellation

Queue presence never authorizes execution. Eligibility is a persisted predicate over predecessor states, exact approvals, current policy, available budget, run state, and cancellation. The AICO-002 spike may use a single test continuation, but it must not claim that the production predicates assigned to AICO-006, AICO-022–029, AICO-033, and AICO-041 are implemented.

## 6. Failure and unknown-outcome rules

| Failure point                                       | Required behavior                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Before state transaction commits                    | No state, event, outbox, or completed command receipt exists                                    |
| After commit, before outbox claim                   | Publisher discovers durable row later                                                           |
| After publish/effect, before outbox acknowledgement | Redelivery occurs; inbox uniqueness preserves one logical effect                                |
| Worker dies while waiting                           | No recovery action required; wait remains open with no lease                                    |
| Worker dies during a leased attempt                 | Lease expires; a new worker may recover; stale token cannot commit                              |
| External call outcome is known failed and retryable | Persist classified failure and bounded retry intent                                             |
| External outcome is unknown                         | Persist/retain a safe blocked reconciliation state; do not retry blindly                        |
| Cancellation races with claim/completion            | Claim and completion predicates re-check persisted cancellation; canceled work cannot resurrect |
| Configured default workflow changes                 | Existing run continues using its pinned workflow version                                        |

## 7. Migration, compatibility, and rollback

1. Schema changes are reviewed TypeORM migrations; synchronization remains disabled.
2. Additive migrations precede application code that writes the new representation.
3. API and worker support the declared workflow/schema compatibility window during rolling update.
4. Existing runs retain their recorded workflow version. New defaults apply only to new runs.
5. A rollback may stop targeting a bad workflow version for new runs, but it cannot rewrite historical runs, decisions, events, or artifacts.
6. Destructive cleanup occurs only after no readable/resumable run requires the old representation and after an explicit retention decision.
7. The spike migration must apply on empty storage, revert cleanly, reapply, and leave pre-existing fixture history readable at every supported application rollback point.

## 8. Evolution triggers

Reconsider a durable workflow engine or broker when measured evidence shows at least one of:

- PostgreSQL scheduler contention prevents approved alpha capacity or recovery objectives after query/index tuning;
- required workflow timers, fan-out, or operator tooling become unsafe or disproportionately costly to implement;
- outbox publication throughput/latency breaches a release NFR under representative load;
- independent service scaling or multi-region requirements exceed the PostgreSQL authority model; or
- the spike cannot meet a non-waivable wait, fencing, ordering, deduplication, or recovery test.

Any replacement must preserve domain state machines, stable IDs, exact versions, tenant boundaries, ordered founder history, and logical-once effects. Transport history never becomes the product system of record.

## 9. Current implementation truth

| Evidence already present                                                                     | What it proves                                                                   | What remains for backend issue #7                                              |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `runs`, tasks, attempts, edges, event counter, events, outbox, inbox, idempotency migrations | Required primitives and uniqueness boundaries exist                              | Persisted wait/checkpoint and exact resume references                          |
| `CommandExecutor`                                                                            | Same-key/same-body command replay and changed-body rejection pattern             | Resume-specific one-transition assertions across restart                       |
| `DomainEventService`                                                                         | Event and outbox are inserted through the caller's transaction with run ordering | Commit/rollback and concurrent-sequence fault tests                            |
| `OrchestrationWorkerService`                                                                 | `SKIP LOCKED`, expiring leases, completion token check, and abandoned attempts   | Process-restart proof, stale failure-path fencing, full eligibility predicates |
| `OutboxPublisherService`                                                                     | Leased outbox publication and inbox uniqueness                                   | Crash-after-effect/before-ack duplicate-delivery proof                         |
| Docker smoke and migration fixture                                                           | Reproducible local services and migration apply/revert/reapply                   | Architecture-spike restart, wait/resume, version, recovery evidence            |

The existing implementation is partial evidence only. This ADR must not be cited as proof of behavior that backend issue #7 has not executed.

## 10. Required AICO-002 evidence

The parent cannot complete until the following named evidence is linked:

- `A2-ADR-01`: this option matrix, owner decision, and tradeoffs;
- `A2-TX-01/02`: rollback absence and successful atomic commit;
- `A2-SEQ-01`: concurrent contiguous event allocation;
- `A2-CLAIM-01` and `A2-LEASE-01`: single claim and stale-holder rejection;
- `A2-WAIT-01` and `A2-RESUME-01/02`: restart-safe exact-version wait and one continuation;
- `A2-EVENT-01`: duplicate delivery with one logical consumer effect;
- `A2-RECOVERY-01`: measured recovery below 15 minutes;
- `A2-CANCEL-01`: canceled fixture cannot be claimed;
- `A2-VERSION-01`: configured default change cannot upgrade an existing run;
- `A2-MIGRATE-01`: migration and rollback compatibility proof; and
- `A2-VERIFY-01`: targeted spike plus canonical verifier on the reviewed revision.

## 11. Owner decision

Duc Huynh (`duckvhuynh`) approved Option A as Architecture Decision Owner on 2026-08-12 with no disputed sections. The decision is conditional on backend issue #7 passing all named AICO-002 evidence; failure reopens this decision. Permanent evidence is linked in the header.

The accepted-decision completion gate is:

```text
npm run verify:architecture:accepted
```

Agent authorship, an `Accepted` header copied from another ADR, existing code, or a green structural check is not the Architecture owner's decision. The linked owner comment is the authority for this status.
