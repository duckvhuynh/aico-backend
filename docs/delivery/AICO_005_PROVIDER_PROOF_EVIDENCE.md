# AICO-005 Bounded Provider-Runtime Proof Evidence

## Status and authority

- **Status:** Proposed for attributable QA/Security acceptance
- **Parent:** [`duckvhuynh/aicompanyos#5`](https://github.com/duckvhuynh/aicompanyos/issues/5)
- **Decision child:** [`duckvhuynh/aico-backend#25`](https://github.com/duckvhuynh/aico-backend/issues/25)
- **Proof child:** [`duckvhuynh/aico-backend#26`](https://github.com/duckvhuynh/aico-backend/issues/26)
- **Architecture authority:** ADR-011 and `MODEL_PROVIDER_RUNTIME.md`
- **Decision semantic SHA:** `3ccb09cf6f320872d9c964240dd6673da06713ad`
- **Accepted decision evidence:** `sha256:5a81f0e33b88ad1d5b618611fffebbc11b4e8df5cac5ed0ef8b66b7c32d4f838`
- **Proof semantic SHA:** Pending
- **Hosted semantic verification:** Pending
- **Retained hosted artifact:** Pending
- **Hosted manifest self-digest:** Pending
- **Hosted deterministic proof-body digest:** Pending
- **QA/Security acceptance:** Pending
- **Disputed IDs:** None
- **Claim class:** `ARCHITECTURE_TEST_ONLY`

This document does not record or imply QA/Security acceptance. Its Pending fields remain Pending in
the semantic proof package so that later metadata cannot change the SHA or deterministic
`proofBodyDigest` that was reviewed. After the complete proof passes on one clean exact semantic SHA,
an attributable human QA/Security owner records acceptance externally on proof child #26, naming
that SHA and its retained hosted evidence. Routine agent comments, authorship, labels, a green
unrelated workflow, or this Proposed document are not acceptance.

## One canonical foreground command

```text
node scripts/aico-005-provider-runtime-proof.mjs
```

The standalone runner first executes the repository's existing, frozen `npm run verify:ci` command.
It then runs the complete deterministic provider-runtime baseline and all source-control mutations,
validates exact registry equality and bounded evidence, and writes one canonical manifest:

```text
.aico-evidence/aico-005-provider-proof.json
```

The command refuses a dirty worktree, a non-40-hex revision, or a mismatch with
`AICO_PROVIDER_RUNTIME_PROOF_EXPECTED_SHA`. It uses no provider credential, paid service, external
model, production data, worker-local sleep, or automatic provider fallback.

## Accepted-decision freeze

The proof is additive. It does not modify the accepted ADR-011 semantic package, including the
provider contract/schema/examples, AEO audit, decision evidence, package/lock files,
`scripts/process-utils.mjs`, `scripts/verify-ci.mjs`, or `.github/workflows/ci.yml`. The accepted
decision validator continues to compare those files to the accepted semantic SHA.

The proof implementation remains under `test/aico-005-spike/` and proof-only scripts. It is not
imported by `AppModule`, `WorkerModule`, a controller, a migration, or a production entry point.

## Closed registry contract

The proof requires exact set and order equality for all registries:

| Registry               | Exact count | Stable identifiers                                              |
| ---------------------- | ----------: | --------------------------------------------------------------- |
| Issue acceptance       |          13 | The live `A5-T-*` identifiers from proof child #26              |
| Deterministic fixtures |          15 | `A5-FX-01` through `A5-FX-15`                                   |
| Granular scenarios     |          64 | Closed `A5-S-*` scenarios mapped to every acceptance identifier |
| Source mutations       |          30 | `A5-M-01` through `A5-M-30`                                     |

Missing, duplicate, reordered, renamed, unexpected, skipped, flaky, selectively unsupported, or
surviving entries fail the proof. The unmodified 64-scenario baseline must pass before mutation
evidence is eligible.

### Acceptance and scenario mapping

| Acceptance ID       | Closed scenario range               | Required observation                                                                                                                                               |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `A5-T-SUCCESS-01`   | Closed `A5-S-SUCCESS-*` scenarios   | Exact strict output and lineage, zero candidate/tool authority before validation, and one fenced commit after live lease/state/policy/budget/lineage checks.       |
| `A5-T-MALFORMED-01` | Closed `A5-S-MALFORMED-*` scenarios | Malformed JSON, missing/unknown fields, wrong types/enums, oversize output, and semantic invalidity cannot publish or create an unauthorized effect.               |
| `A5-T-REPAIR-01`    | Closed `A5-S-REPAIR-*` scenarios    | At most one safely diagnosed repair uses a new invocation and disjoint reservation; identity/reservation reuse and exhaustion block.                               |
| `A5-T-TIMEOUT-01`   | Closed `A5-S-TIMEOUT-*` scenarios   | Pre-dispatch expiry has no provider effect; post-dispatch uncertainty maps reconciliation to still-pending, committed success, or terminal failure explicitly.     |
| `A5-T-RATE-01`      | Closed `A5-S-RATE-*` scenarios      | Bounded retry metadata is persisted within deadline and budget; SDK retries, worker sleep, hidden invocation, and silent fallback remain zero.                     |
| `A5-T-CANCEL-01`    | Closed `A5-S-CANCEL-*` scenarios    | Pre-dispatch cancellation has zero effect; abort propagates; late or reconciled success after cancellation, lease loss, or terminal state cannot commit.           |
| `A5-T-SAFETY-01`    | Closed `A5-S-SAFETY-*` scenarios    | Refusal, safety block, dropped output, and uncertain sanitization cannot repair or publish; a redacted success still passes independent validation.                |
| `A5-T-SECRET-01`    | Closed `A5-S-SECRET-*` scenarios    | Seeded prohibited classes are absent from provider DTOs and every retained sink; uncertain sanitization fails closed.                                              |
| `A5-T-META-01`      | Closed `A5-S-META-*` scenarios      | Success, failure, canceled, unknown, accounting, reservation, and bounded-label profiles retain exact metadata and honest provenance.                              |
| `A5-T-VERSION-01`   | Closed `A5-S-VERSION-*` scenarios   | Exact in-flight target pinning, drift rejection, history, target kill/circuit recovery, rollout/rollback lineage, and production/external rejection remain closed. |
| `A5-T-REPLAY-01`    | Closed `A5-S-REPLAY-*` scenarios    | Deterministically overlapping duplicate delivery converges to one logical effect, digest collisions are denied, and unknown replay requires reconciliation.        |
| `A5-T-MUTATION-01`  | Closed `A5-S-MUTATION-*` scenarios  | The mutation registry is exact; every real transform is applied once, killed by every declared intended scenario, restored, and cleaned.                           |
| `A5-T-VERIFY-01`    | Closed `A5-S-VERIFY-*` scenarios    | Exact SHA and registries, deterministic adapter boundary, bounded evidence, canonical digests, and resource cleanup all pass.                                      |

## Deterministic concurrency and side effects

The test-only state machine uses a frozen clock, deterministic identities, and an in-memory atomic
store. Cancellation/lease-loss/terminal late-result cases, overlapping duplicate delivery, and an
in-flight target rollout use manual `DeferredBarrier` schedules, so their order is explicit rather
than timer-dependent. Deadline cases use the frozen clock. Repair, reconciliation, target
kill/circuit recovery, and rollout/rollback history use deterministic state transitions.

The proof does not claim a nondeterministic load race, distributed-store atomicity, multi-process
coordination, or production rollout behavior. Those remain later integration obligations.

The evidence records only closed schedule identifiers and digests. A watchdog may classify a
harness deadlock as `BARRIER_DEADLOCK`, but elapsed wall time never decides provider-runtime
semantics.

Each scenario emits a fixed-key ledger covering provider calls, SDK retries, worker sleeps,
reservations, persisted retry schedules, repair invocations, reconciliation, candidate commits,
artifacts, task effects, tool effects, state effects, external provider calls, and cost-accounting
effects. The canonical runner validates every field as a bounded non-negative safe integer and
binds the complete ledger to canonical per-scenario digests. Individual scenarios assert their
declared zero-effect fences before emitting `PASSED`; the retained manifest does not invent a
separate unauthorized-effect count. The aggregate gate separately requires zero external provider
calls, SDK retries, and worker sleeps; deterministic internal cost-accounting effects are not
misreported as external spend.

## Real source-control mutations

The mutation runner copies the repository's tracked source plus an exact proof-development file
allowlist into a validated temporary directory. Arbitrary untracked and ignored local files, such
as credentials, are excluded. It links the pinned dependency installation, proves the unmodified
baseline, and then applies each accepted transform exactly once. Each transform changes one
executable control and runs every declared killing scenario.

| Mutation range | Removed or weakened control                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `A5-M-01..02`  | Provider DTO/content allowlist and exact request/configuration/target binding                        |
| `A5-M-03..05`  | Strict JSON Schema, semantic/reference validation, and output-size validation                        |
| `A5-M-06`      | Candidate and proposed-tool zero-authority fence                                                     |
| `A5-M-07..10`  | Distinct repair invocation, disjoint reservation, safe diagnostics, and repair cap                   |
| `A5-M-11..12`  | Pre-dispatch deadline and post-dispatch `UNKNOWN` classification                                     |
| `A5-M-13..14`  | `AbortSignal` propagation and late-result commit rejection                                           |
| `A5-M-15..17`  | SDK retry disablement, persisted no-sleep scheduling, and retry hint/deadline/budget bounds          |
| `A5-M-18..19`  | Atomic idempotency and unknown reconciliation/double-charge guards                                   |
| `A5-M-20..22`  | Refusal/safety/redaction terminal behavior, redacted-success validation, and multi-sink sanitization |
| `A5-M-23..25`  | Usage/cost provenance, reservation/variance reconciliation, and metric-label allowlist               |
| `A5-M-26..28`  | Resolved-model drift, eligible-new/history lifecycle, and half-open/no-fallback rules                |
| `A5-M-29`      | Deterministic-provider deployed-production rejection                                                 |
| `A5-M-30`      | External activation rejection                                                                        |

A mutation is counted as killed when each declared intended scenario fails its named semantic
assertion. A compile failure, thrown failpoint, empty/mock-only transform, unrelated failure,
skipped intended scenario, survivor, restoration mismatch, or cleanup failure blocks the proof.
Non-declared scenarios are not run per mutant, so the evidence does not claim that a transform can
affect only its declared killing scenario.

`A5-M-29` and `A5-M-30` specifically prove that the named production/external rejection
classification branches remain observable and fail closed. Layered wire-schema and exact-binding
checks continue to deny those requests when either single branch is mutated, so these two kills do
not claim that disabling one classification branch alone would permit provider dispatch or an
external effect. The `30/30` total is a closed control-and-classification registry, not a claim of
30 independently sufficient authorization barriers.

## Bounded canonical manifest

The manifest schema is `aico-005-provider-proof/v1`, its claim class is
`ARCHITECTURE_TEST_ONLY`, and its serialized size cannot exceed 65,536 bytes. It contains only:

- exact repository SHA, clean-state assertion, accepted decision/product-trace and proof input
  digests;
- complete acceptance, fixture, scenario, mutation, and evidence-file registries with digests;
- per-scenario stable scenario/acceptance identifiers, safe outcome/reason classes, exact bounded
  side-effect totals, and canonical ledger/evidence digests;
- source mutation before/patch/after/restored digests and exact killing scenarios;
- bounded accounting and cleanup summaries;
- validated zero counts emitted by the deterministic harness for external provider calls,
  production credentials, paid services, SDK retries, and worker sleeps; and
- a deterministic `proofBodyDigest` plus a canonical artifact `selfDigest`.

`proofBodyDigest` covers only semantic proof evidence and must agree between local and hosted runs.
`selfDigest` covers the complete run-specific manifest with `selfDigest` omitted. Canonicalization
sorts object keys recursively and retains array order. Unknown fields, oversized values, malformed
digests, missing registry entries, or non-canonical round trips fail.

The artifact never retains raw prompts/completions, invalid candidate bodies, arbitrary transcripts,
tenant/source/attachment content, credentials, authorization headers, signed URLs, provider error
bodies, stack traces, private hidden reasoning, raw environment dumps, or unbounded diagnostics. If
required evidence cannot fit the schema and byte limit, the proof fails rather than truncating it.

## Hosted evidence and QA/Security gate

The dedicated `AICO-005 Provider Runtime Proof` workflow runs on the exact pull-request head SHA,
executes the canonical foreground command, and retains
`aico-005-provider-proof-<40-hex-sha>` for 90 days.

Before merge:

1. the same semantic proof SHA passes locally and in the dedicated hosted workflow;
2. the hosted artifact is downloaded; its byte bound and registries are checked; and its
   proof-body and self-digests are independently recomputed;
3. an attributable human QA/Security owner names the exact semantic SHA, permanent run URL, artifact
   identity, both digests, `64/64` scenarios, `30/30` killed mutations, the emitted zero
   external-provider/credential/paid-service/SDK-retry/worker-sleep counts, and any disputed IDs in
   an attributable acceptance comment on proof child #26, outside the tracked semantic proof
   package.

An agent must not author or infer the QA/Security acceptance. A failed case, missing artifact,
different SHA, surviving mutation, unsafe evidence, or non-clean run remains blocked.

## Explicit limitations and non-goals

This proof demonstrates one deterministic internal architecture claim. It does not implement or
prove a production Employee Runtime, external provider adapter, provider account, persistence
migration, Budget Ledger, distributed reconciliation, production telemetry, provider quality,
availability, price, latency, retention/deletion, regional behavior, or release readiness.

It does not activate OpenAI or any other external provider; send founder, customer, production,
sensitive, secret, or foreign-company content; store a production credential; spend money; authorize
a tool directly from model output; implement employee definitions; offer provider selection or BYOK;
permit automatic cross-provider fallback; create founder UI; or complete AICO-032, AICO-033, the
full cited PRD/SRS requirements, external alpha, or later release gates.
