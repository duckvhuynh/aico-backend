# AICO-005 AEO, Reproduction, and Evidence Audit

**Status:** Proposed / Pending owner acceptance
**Current readiness:** `pre-A5-READY-0`
**Audit result:** `BLOCKED`
**Reviewed:** 2026-08-15
**Parent:** `duckvhuynh/aicompanyos#5`
**Decision child:** `duckvhuynh/aico-backend#25`
**Proof child:** `duckvhuynh/aico-backend#26` (blocked pending decision acceptance)

Normative words `MUST`, `MUST NOT`, `MAY`, and `BLOCKED` in this audit describe
the AICO-005 evidence contract. This document is not runtime authority. It does
not select or activate a model provider, authorize a model or tool call, grant
content-use permission, publish a registry object, approve a budget, or permit
an agent to mutate product state.

## 1. Verdict and current truth

The accepted AEO foundations, observability contract, and Employee Runtime
contract already define the reusable versioning, causality, privacy, accounting,
and provider-port rules that constrain AICO-005. Product authority requires a
provider abstraction with typed outputs, exact metadata and cost capture,
timeouts, version targeting, rollback, allowlisted context, and no hidden-reasoning
dependency. Issue #25 now asks for the bounded provider/runtime architecture
decision that applies those rules.

The AICO-005 decision is still pending. Issue #25 is open and its acceptance
criteria are unchecked. Proposed ADR-011, the Model Provider Runtime contract,
its Draft 2020-12 schema, seven closed wire-envelope families with examples, the
evidence/AEO maps, and the structural validator now exist; the current Proposed-mode
structural validation passes. These are auditable structural artifacts, not an
accepted decision or hostile execution proof. There is no accepted exact-SHA
provider selection, attributable owner decision, proof-child #26 result bundle,
hosted proof evidence, production Employee Runtime, production Budget Ledger, or
external-provider activation. Consequently, this audit remains `BLOCKED` at
`pre-A5-READY-0`. A green structural check, generated summary, provider marketing
statement, model response, telemetry signal, or agent review cannot promote the
decision.

AICO-005 deterministic fixtures are the only enabled provider for R0. They are
test/development evidence, not a production fallback. No external provider is
activated by this audit. Founder, customer, production, sensitive, credential,
or secret content MUST NOT be sent to an external model under this decision
package. Training use is prohibited and there is no training opt-in surface.

**No external provider is activated by this audit.**

The earliest honest promotions are cumulative:

- `A5-READY-0` requires an internally consistent decision, contract/schema,
  threat/proof, evidence, AEO, and strict-validator package.
- `A5-READY-1` additionally requires attributable Architecture/AI and separate
  Product + Legal/Security decisions on the same exact semantic SHA.
- `A5-READY-2` additionally requires the separate deterministic proof child to
  pass the complete closed fixture/case and real-mutation registries on that SHA.
- Production runtime, external-provider activation, retention, budgets, rollout,
  release, and founder disclosure remain later gates.

## 2. Agent discovery and deterministic reading order

An agent MUST resolve every repository-relative source against one exact Git SHA.
A working-tree path, cached excerpt, issue summary, search index, provider alias,
or this audit alone is not immutable evidence.

| Order | Stable source                                                                                                                          | Purpose                                                                                                | Current authority                                                                  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 1     | Product [`PRD.md`](../../../docs/product/PRD.md) and [`SRS.md`](../../../docs/product/SRS.md)                                          | G-03/G-04, PRD-FR-058/061/063, TD-005, SRS-FR-084/089-091, SRS-NFR-020/025-027, and DEP-01 authority   | Authoritative product requirements                                                 |
| 2     | [`../architecture/005-aeo-foundations.md`](../architecture/005-aeo-foundations.md)                                                     | Accepted immutable-registry, reproducibility, causality, telemetry-authority, and readiness rules      | Accepted MVP foundation                                                            |
| 3     | [`../contracts/OBSERVABILITY_AND_EVALUATION.md`](../contracts/OBSERVABILITY_AND_EVALUATION.md)                                         | Registry/manifests, accounting, evidence, fixtures, drift, metrics, redaction, and local provider      | Normative companion to accepted ADR-005                                            |
| 4     | [`../contracts/AGENT_RUNTIME.md`](../contracts/AGENT_RUNTIME.md)                                                                       | Provider-neutral request/result, independent validation, repair, failure, budget, and lease boundary   | Current runtime contract                                                           |
| 5     | [`duckvhuynh/aico-backend#25`](https://github.com/duckvhuynh/aico-backend/issues/25)                                                   | AICO-005 decision outcome, criteria, exact owner lanes, downstream owners, and non-goals               | Open delivery contract; not an accepted decision                                   |
| 6     | [`../architecture/011-model-provider-employee-runtime-selection.md`](../architecture/011-model-provider-employee-runtime-selection.md) | Candidate selection, option evidence, provider/runtime boundary, content-use gate, and decision record | Proposed; not accepted                                                             |
| 7     | [`../contracts/MODEL_PROVIDER_RUNTIME.md`](../contracts/MODEL_PROVIDER_RUNTIME.md), its strict schema, and examples                    | Seven closed provider request/result/repair/configuration/target/circuit/evidence envelopes            | Proposed structural artifacts; validation passes; not accepted or execution-proved |
| 8     | The AICO-005 evidence map and validator artifacts for decision #25 and proof #26                                                       | Structural consistency/fail-closed probes and future exact-SHA hostile proof gate                      | Proposed structural checks pass; proof #26 and hosted evidence are pending         |
| 9     | This file                                                                                                                              | AEO discoverability, reproducibility, evidence, telemetry, readiness, and action boundaries            | Proposed descriptive audit; never runtime authority                                |

Deterministic parse rules:

1. Use stable IDs, closed enums, explicit references, exact versions, and exact
   digests. Do not infer a pass from prose sentiment or a provider response.
2. Product/SRS and accepted ADR-005 outrank the pending AICO-005 decision. An
   accepted decision/contract outranks this audit. PostgreSQL rows and immutable
   object/registry records remain runtime authority.
3. If two sources disagree about content use, provider activation, version
   resolution, accounting, repair, cancellation, or side-effect authority, return
   `BLOCKED`; do not choose the more permissive interpretation.
4. Missing, mutable, stale, unreadable, unsupported, skipped, duplicate,
   dirty-tree, redaction-failed, or digest-mismatched evidence is not `PASS`.
5. The proof case and mutation sets MUST equal their executable registries.
   Minimum-count matching, prose coverage, or a passing unrelated case is
   insufficient.
6. `A5-READY-*` is cumulative. A later implementation or release check cannot
   backfill an unaccepted architecture decision or missing bounded proof.

## 3. Stable AEO gates

The following fourteen identifiers are the closed AICO-005 AEO registry. They
MUST NOT be removed, renamed, merged, or treated as optional.

| Gate        | Binding requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Present evidence and gap                                                                                                                                                                          | Required closure                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `A5-AEO-01` | **Authoritative state.** PostgreSQL state, ordered domain events, immutable registry/manifests, accounting rows, and accepted evidence remain authority. Telemetry is not authority. A model response, provider receipt, dashboard, agent statement, or circuit metric cannot authorize success, repair, tool execution, artifact publication, targeting, or rollback.                                                                                                                                | Accepted ADR-005 and runtime contracts state the boundary; AICO-005 has no implementation or decision proof.                                                                                      | Exact-SHA decision acceptance, then AICO-032/033 transactional and denial integration evidence.                             |
| `A5-AEO-02` | **Immutable behavior manifest.** Every attempt MUST pin exact release, workflow, policy, employee rollout/definition, instruction, prompt, input/output schema, toolset, provider configuration, pricing catalog, budget, redaction policy, context, request digest, deadline, and application/runtime references. `latest`, an unqualified model, or a caller-supplied mutable alias alone is invalid.                                                                                               | Proposed closed schema/envelopes structurally represent these bindings and validate; no accepted registry publication, exact canonical-digest proof, or production persistence exists.            | Exact-SHA contract/schema acceptance, semantic digest/compatibility fixtures, and later production persistence.             |
| `A5-AEO-03` | **Honest reproducibility.** Local frozen fixtures may be `DETERMINISTIC`. External snapshots and aliases are at most `INPUT_REPRODUCIBLE`; both requested target and returned revision/fingerprint MUST be retained. Missing/unreadable manifests are `DEGRADED`. No temperature, seed, snapshot label, or provider claim makes an external generation bitwise deterministic.                                                                                                                         | Proposed target/result fields cover requested/resolved model identity and fingerprint; proof-child drift and missing-manifest observations are absent.                                            | Snapshot, alias+fingerprint, opaque-alias, changed-fingerprint, and missing-manifest fixtures.                              |
| `A5-AEO-04` | **Provider-neutral least privilege.** Domain task/context/output envelopes remain separate from the smallest provider-call DTO. SDK types stay inside adapters. `invoke(request, signal)` uses closed typed input, allowlisted/redacted content, exact identities/versions, schema/tool declarations, finite limits, and an absolute deadline. Proposed tool calls have zero execution authority.                                                                                                     | Proposed request/result/configuration schemas and examples now pass structural validation; no adapter, semantic guard, or hostile DTO execution proof exists.                                     | Exact-SHA contract/schema acceptance, proof #26 negative DTO/guard cases, and AICO-032 adapter conformance.                 |
| `A5-AEO-05` | **Independent validation and bounded repair.** Provider-native structured output is defense-in-depth. Candidate output MUST pass strict schema and semantic validation before any authority is considered. Invalid output has zero artifact/task/tool/state authority. Each repair is a new causal invocation, reservation, manifest/accounting record, and finite versioned count.                                                                                                                   | Proposed validation/repair envelopes encode zero authority, cap one, and separate invocation/reservation assertions; semantic cross-record and hostile mutation proof is absent.                  | Malformed/semantic-invalid fixtures, validation-bypass/reuse mutations, repair success/exhaustion, and zero-effect ledgers. |
| `A5-AEO-06` | **Closed outcomes and causality.** Success, failed, canceled, and unknown outcomes; pre-dispatch failure, rate limit, refusal/safety, timeout, lease loss, and late completion MUST remain distinguishable. Run/task/attempt/invocation, correlation, immediate causation, provider request, idempotency, event, trace, and span identities remain distinct. Unknown is never silently retried.                                                                                                       | Proposed result/failure envelopes and closed enums pass structural validation; restart, cancellation race, late-result, and semantic retry-matrix proof is pending.                               | Exact-SHA schema acceptance and deterministic retry/cancel/unknown/late-result cases.                                       |
| `A5-AEO-07` | **Attributable accounting.** Every dispatch MUST reconcile reservation, returned usage, immutable pricing catalog, computed/provider-reported or estimated cost micros, currency, latency, completion status, and any later invoice variance by invocation ID and usage digest. Corrections append; they never overwrite history or double-charge unknown/duplicate delivery.                                                                                                                         | Proposed envelopes represent reservation IDs/digests, usage, cost micros/currency/source, pricing refs, and bounded latency; no semantic reconciliation proof or production Budget Ledger exists. | Deterministic accounting fixtures, mismatch/duplicate/unknown mutations, and AICO-033 ledger integration.                   |
| `A5-AEO-08` | **Bounded redacted evidence.** Raw prompt/completion, arbitrary transcript, tenant/source/attachment body, credential, header, signed URL, provider error body, hidden reasoning, and foreign content are prohibited from logs, metrics, analytics, artifacts, proof evidence, and debug bundles. Redaction `PASS/REDACTED/DROPPED` accounting is versioned and digest-bound. `DROPPED` means the unsafe payload did not cross the boundary; only a safe bounded guard/accounting receipt may remain. | Proposed privacy guards, evidence envelope, and redaction receipts structurally validate; no seeded multi-sink canary or safe `DROPPED` accounting proof exists.                                  | Hostile canary/sink scan, maximum-size checks, field-path-only receipts, and safe `DROPPED` counter/receipt proof.          |
| `A5-AEO-09` | **Low-cardinality telemetry.** Metrics MAY use reviewed finite role, employee, operation, state, outcome, failure, provider/model cohort, safety/redaction, currency, and cost-source labels only. Company/run/task/attempt/invocation/event/correlation/trace IDs, raw digests, aliases, prompts, URLs, provider error text, and user values are forbidden labels.                                                                                                                                   | The accepted metrics contract defines the baseline; no AICO-005 emitted-cardinality proof exists.                                                                                                 | Static label allowlist/ceiling, runtime conformance, sink scan, and AICO-077 alert simulation.                              |
| `A5-AEO-10` | **Closed deterministic fixture registry.** R0/CI MUST use approved synthetic inputs, frozen clock/IDs, exact request/manifest digests, fixed latency/usage/cost, explicit scenario lookup, network denial, no paid service, no production credential, no tenant mutation, and verified cleanup. An unknown fixture cannot receive generic success.                                                                                                                                                    | The local-provider contract names required behaviors; AICO-005 proof registry/result bundle is pending.                                                                                           | Complete `A5-FX-*` registry and exact-SHA local/hosted foreground proof.                                                    |
| `A5-AEO-11` | **Fail-closed real mutations.** After the unmodified matrix passes, one binding control at a time MUST be changed and killed by its declared case with zero unauthorized effect. Compilation failure, exception injection, empty/mock-only change, unrelated failure, skipped case, surviving mutation, or killing a different case is not acceptable.                                                                                                                                                | No AICO-005 proof implementation or mutation result exists.                                                                                                                                       | Complete executable `A5-M-*` registry with before/after digests, declared killer, no skip, and no survivor.                 |
| `A5-AEO-12` | **Capability-scoped readiness and circuit behavior.** PostgreSQL/schema compatibility controls process readiness. Provider failure does not make the API unready; it degrades or opens the circuit only for the affected worker capability/cohort. Circuit, pause, kill, and recovery decisions are persisted, reason-coded, versioned, and cannot silently route elsewhere.                                                                                                                          | ADR-005 has the role/capability rule and alert contract; selected circuit state/transition contract and proof are pending.                                                                        | Health/capability matrix, circuit fixtures, explicit recovery probe, and zero-auto-failover mutation.                       |
| `A5-AEO-13` | **Targeting, rollback, and drift preserve history.** Activation, kill, cohort targeting, alias resolution, fingerprint change, rollback, and retirement affect only eligible new attempts under an audited decision. Existing attempts keep their manifests. Rollback never rewrites lineage, repeats an unknown result, or hides changed model behavior.                                                                                                                                             | Registry/drift foundations exist; no accepted AICO-005 candidate target or rollback drill exists.                                                                                                 | Exact baseline/candidate manifests, changed-ref classification, drift gate, kill/rollback and historical-read tests.        |
| `A5-AEO-14` | **External activation and immutable acceptance.** Deterministic local execution MUST fail production configuration validation. An external target remains disabled until exact provider/model/configuration, account access, retention/deletion/training, region/subprocessor, disclosure, redaction, and bounded-spend manifests receive attributable Product + Legal/Security acceptance.                                                                                                           | Issue #25 and the owner DoR state this boundary; exact manifest and approvals do not exist.                                                                                                       | Exact-SHA decisions, retained proof, later activation manifest, and downstream production/release evidence.                 |

## 4. Reproducibility and immutable manifests

### 4.1 Reproducibility classification

| Execution target or evidence condition                                                                                                    | Grade / gate consequence                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local fixture registry, frozen IDs/clock, pinned runtime, exact request/response refs, fixed metadata, no uncontrolled input              | `DETERMINISTIC`; only the declared contract output and evidence digest may be claimed reproducible.                                                                             |
| External immutable model snapshot requested and exact returned revision/fingerprint retained                                              | `INPUT_REPRODUCIBLE`; request and evaluation conditions are reconstructable, but output equality is not promised.                                                               |
| External mutable alias requested and returned resolved revision/fingerprint retained                                                      | `INPUT_REPRODUCIBLE`; store both values, evaluate by resolved cohort, and run drift evaluation if the resolved value changes.                                                   |
| External alias with no exposed immutable revision/fingerprint, while all requested inputs/configuration remain reconstructable            | Inputs remain `INPUT_REPRODUCIBLE`, but quality/promotion evidence is `DEGRADED`/`BLOCKED` because the serving cohort is opaque. A provider name or alias is not a fingerprint. |
| Missing, mutable, unreadable, incompatible, or digest-mismatched configuration, pricing, schema, redaction, context, or release reference | `DEGRADED`; no success, quality, cost, targeting, rollback, or promotion claim is valid.                                                                                        |

An attempt stores the requested provider/model/configuration separately from
the returned provider/model revision or fingerprint. A snapshot string is not
trusted as immutable merely because it looks dated. A fingerprint is a cohort
identifier supplied or derived under an accepted adapter contract; it is not a
substitute for the exact request/configuration manifest. A changed fingerprint
is a drift event, not an automatic failure and never a silent success.

### 4.2 Required immutable manifest set

Before a provider call can support an AICO-005 evidence claim, the exact attempt
graph MUST resolve these immutable, checksummed inputs:

- the release manifest: application/source revision, image/runtime, dependency
  lock, migrations, supported contract window, and build provenance;
- the run/attempt manifests: workflow, policy, all four fixed employee rollout
  definitions, the resolved employee, instruction bundle, prompt templates,
  toolset, context manifest, input/output schema, request digest, deadline,
  target decision, reproducibility grade, and degraded reasons;
- the provider-configuration manifest: provider key, adapter and SDK versions,
  endpoint/region class without credentials, requested model target, target
  kind, structured-output/tool modes, retry-disabled rule, finite time/token/
  output/cost limits, safety settings, and activation/kill/rollback status;
- the pricing manifest: catalog version/digest, ISO currency, exact unit and
  cache/input/output rate rules, effective interval, source/approval, rounding
  rule, and whether each cost line is provider-reported, catalog-computed, or
  estimated;
- the redaction/content-use manifest: policy version/digest, accepted data
  classes and field paths, prohibited content, serializer schema, maximum sizes,
  drop reasons, retention/access class, and training/external-use prohibition;
- the input, output, error, accounting, signal, evidence, and proof-bundle schema
  manifests, all using closed unknown-field rejection and canonical hashing;
- the budget policy and reservations, evaluation fixture/suite/check refs, and
  any baseline/candidate drift manifests used to make a readiness claim.

Digests use `sha256:<64 lowercase hex>` over canonical bytes. Monetary and other
potentially large integers serialize as canonical base-10 strings; floating-point
money is forbidden. Credentials, raw prompts, raw completions, provider response
bodies, and hidden reasoning MUST NOT appear in a manifest. Reproduction uses
allowed immutable source references, field paths, redaction policy, and canonical
request/result digests instead of logging those bodies.

Every claim index MUST expose the exact provider configuration digest and every
applicable schema digest. A display name, semantic version, alias, object URL, or
Git path without the verified digest is insufficient.

### 4.3 Safe reproduction and reconciliation modes

Only these four named operations are valid:

- `STATE_RECONSTRUCTION` reads authoritative state, manifests, accounting,
  evidence, and ordered events without a provider call or mutation. It cannot
  infer a success that was never committed.
- `OFFLINE_REPRODUCTION` uses only the deterministic local fixture provider,
  exact synthetic inputs, an isolated evidence namespace, network denial, and
  no product mutation.
- `CONTROLLED_REEVALUATION` creates a new evaluation identity against immutable
  inputs and candidate evidence. It never rewrites the original result, QA
  verdict, founder decision, or Budget Ledger.
- `SIDE_EFFECT_RECONCILIATION` is a separately authorized inspect/cancel/status
  operation for a known invocation. It cannot dispatch a new model request,
  repeat an unknown outcome, or activate an external provider.

Calling a retry, repair, or provider switch "replay" does not grant authority.
Each is a newly authorized invocation with its own manifest, reservation,
causality, accounting, and applicable content-use gate.

## 5. Causal accounting and low-cardinality telemetry

### 5.1 Minimum causal graph

```text
target/content-use decision
  -> run manifest -> attempt manifest -> budget reservation
  -> provider invocation -> closed provider outcome
  -> independent validation
      -> candidate output with zero authority until application commit
      -> optional separate repair reservation/invocation/validation
  -> accounting reconciliation -> evidence/evaluation
```

The graph keeps `companyId`, `runId`, `taskId`, `attemptId`, `invocationId`,
`providerRequestId`, `reservationId`, `correlationId`, immediate `causationId`,
`idempotencyKey`, `eventId`, `traceId`, and `spanId` distinct. A retry or repair
gets a new attempt/invocation identity and explicit causation. A trace can end at
a durable wait; business causality persists. A late response after cancellation,
lease loss, or accepted completion is diagnostic evidence only and cannot commit.

### 5.2 Usage, cost, and latency reconciliation

Each invocation accounting record MUST include the exact attempt manifest,
requested and resolved provider/model values, logical idempotency key, reservation
IDs, closed status, provider/tool/platform usage lines, immutable pricing catalog
and rule keys, cost micros/currency/source, usage digest, start/completion time,
latency, correlation, and causation. The reconciler MUST:

1. consume or release the exact reservation without exceeding the hard Budget
   Ledger invariant;
2. compare adapter-normalized provider usage with catalog/platform computation;
3. append a bounded variance/discrepancy record instead of overwriting a finalized
   invocation when a provider report, invoice, or duplicate digest disagrees;
4. preserve `UNKNOWN` and prevent automatic double charge or blind re-dispatch;
5. make p50/p95 latency, tokens, and cost queryable by bounded workflow/provider/
   model/configuration cohort; and
6. perform all reconciliation without retaining prompt, completion, tenant body,
   provider error body, arbitrary transcript, credential, or hidden reasoning.

An R0 envelope constant or boolean assertion is not evidence that the guard ran.
The semantic guard MUST independently reject a reused repair invocation, overlap
between original and repair reservation IDs, contradictory result/failure/retry
semantics, stale or mismatched content/accounting digests, and a `PASS` evidence
summary whose assertions or counters contain `FAIL` or `BLOCKED`. Guard failure
has zero state/artifact/tool authority and produces only a bounded safe reason.

### 5.3 Signal and cardinality contract

Metrics may label only finite reviewed dimensions such as process role, employee,
operation, state, outcome, failure class, provider cohort, model cohort, structured
output mode, safety outcome, redaction outcome/reason class, currency, cost source,
repair class, target state, and circuit state. A version exposed to metrics uses a
bounded rollout cohort key, never an arbitrary digest or raw provider alias.

Company, founder, run, task, attempt, invocation, provider-request, reservation,
event, artifact, correlation, causation, trace, and span IDs; raw digests; prompts;
model outputs; user text; hosts; paths; URLs; error messages; and provider response
codes outside a closed mapped class are forbidden metric labels. Authorized logs,
traces, and audit rows may retain high-cardinality causal IDs under classification,
audience, retention, redaction, and size limits.

Every candidate signal passes an exact redaction policy before serialization and
records `PASS`, `REDACTED`, or `DROPPED`, safe reason classes, redacted schema field
paths/count, an input digest, and an output digest only when safe output exists.
`DROPPED` is a guard outcome: the unsafe payload is not serialized, referenced,
or retained as evidence. Only its bounded policy/reason/class accounting receipt
may remain, and `aico_redaction_actions_total` increments by bounded signal/outcome/
reason class only. No dropped value, raw path, digest, or content becomes a label.
Redaction/drop accounting cannot substitute for the authoritative model outcome,
Budget Ledger, state transition, policy decision, or evidence record.

## 6. Deterministic fixture and mutation proof

### 6.1 Closed fixture registry

The proof package MUST publish an immutable fixture registry and map each fixture
to exact proof-case IDs. At minimum its stable behavior classes are:

| Fixture ID | Required deterministic observation                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `A5-FX-01` | Strict success produces the exact schema-valid candidate, fixed usage/cost/latency metadata, complete manifests, and no state authority before commit. |
| `A5-FX-02` | Malformed or unknown-field output fails independent validation with no artifact, task, tool, event, or state effect.                                   |
| `A5-FX-03` | Semantic-invalid output fails even when provider-native structured output claims success.                                                              |
| `A5-FX-04` | One separately reserved repair receives only safe diagnostics; repair cap exhaustion blocks without another invocation.                                |
| `A5-FX-05` | Pre-dispatch transient/rate-limit result schedules bounded persisted retry guidance; the worker does not sleep and the SDK does not retry.             |
| `A5-FX-06` | Post-dispatch timeout/unknown outcome remains unknown and is not blindly dispatched or charged twice.                                                  |
| `A5-FX-07` | Abort/cancellation and lease loss prevent late provider output from committing.                                                                        |
| `A5-FX-08` | Refusal/safety/redaction/drop outcomes are classified, bounded, and leak no prohibited content.                                                        |
| `A5-FX-09` | Seeded prompt, completion, tenant, secret, credential, error-body, and hidden-reasoning canaries are absent from every retained sink.                  |
| `A5-FX-10` | Usage, pricing-catalog cost, reservation, latency, duplicate delivery, and variance reconciliation converge exactly.                                   |
| `A5-FX-11` | Snapshot, alias+fingerprint, opaque alias, and changed-fingerprint paths receive the required reproducibility/drift classification.                    |
| `A5-FX-12` | Pause, kill, circuit-open, recovery probe, retarget, and rollback affect only eligible new attempts and never auto-fail over.                          |
| `A5-FX-13` | Missing/incompatible/digest-mismatched configuration, pricing, redaction, schema, or fixture reference fails before dispatch.                          |
| `A5-FX-14` | Unknown fixture/scenario fails closed rather than returning generic success.                                                                           |
| `A5-FX-15` | The local provider is rejected by deployed-production configuration validation, and every external provider remains disabled.                          |

Every fixture uses synthetic non-sensitive data, explicit scenario lookup, exact
manifest/request digests, frozen virtual time and IDs, fixed usage/cost/latency,
network denial, no paid service, no production credential, isolated evidence,
and unconditional verified cleanup. Required fixtures do not support `SKIP`,
`FLAKY_PASS`, `EXPECTED_FAILURE`, or a semantic waiver.

### 6.2 Real mutation gate

The unmodified full registry MUST pass first. Then each executable `A5-M-*`
mutation changes one real binding control and records candidate-before digest,
mutation patch digest, candidate-after digest, declared killer case, observed
failure, side-effect ledger, cleanup result, and restored digest. Required mutation
classes include:

- provider DTO allowlist, deadline/abort, SDK retry disablement, and identity
  binding;
- schema/semantic validation authority and proposed-tool non-authority;
- separate repair identity/reservation and finite cap;
- cancellation/lease/idempotency/unknown-outcome commit and accounting guards;
- provider configuration, requested/resolved revision, pricing, redaction, schema,
  and request digest binding;
- usage/cost/latency reconciliation and duplicate/variance handling;
- evidence redaction/drop, prohibited metric label, and size/audience boundary;
- target, kill, circuit, no-auto-failover, rollback, and historical-lineage rules;
- production rejection of the deterministic adapter and external activation gate.

A mutation is killed only when its declared case detects the changed behavior and
all required zero-effect, accounting, redaction, and cleanup assertions pass.
Compilation failure, test-discovery failure, exception injection, empty or mock-only
change, unrelated failure, different-case failure, skipped case, or surviving
mutation is `FAIL`/`BLOCKED`, never proof.

## 7. Readiness, degradation, circuit, rollback, and drift

Readiness is role-and-capability based. PostgreSQL connectivity and schema/
contract compatibility are always required for API and worker readiness. A
provider outage MUST NOT make the control API unready. It places only dependent
worker work in an accurate blocked/degraded condition. The deterministic adapter
is allowed in local/test/CI capability profiles and MUST make a deployed production
profile fail configuration validation.

Each provider/model/configuration cohort exposes a bounded capability state such
as `DISABLED`, `READY`, `DEGRADED`, or `CIRCUIT_OPEN`, plus a safe reason class,
effective targeting decision, transition time, and owner/runbook reference.
Telemetry may report that state but cannot set it. A missing health signal does
not prove readiness. A circuit open, pause, retirement, revocation, or kill blocks
eligible new dispatch for the affected exact cohort; it does not cancel unrelated
work, rewrite in-flight manifests, or select another provider/model.

Any recovery/half-open probe is a separately authorized, budgeted invocation with
a new identity and synthetic or otherwise approved content. Before the later
external activation manifest is accepted, recovery probes MUST remain local and
synthetic. Unknown outcomes stay unavailable until explicit reconciliation.

Target changes resolve to exact registry refs before an attempt. Rollback changes
selection only for eligible new attempts and preserves the requested/resolved
target, fingerprint, pricing, redaction, schema, outcome, and accounting lineage
of historical attempts. An alias resolving to a new fingerprint, configuration/
schema/redaction/pricing change, repair-rate shift, or cost/latency/quality change
triggers an exact baseline/candidate drift evaluation. Missing thresholds or
unreadable baseline evidence are `BLOCKED`; no limit defaults to unlimited.

## 8. Evidence integrity and acceptance readiness

### 8.1 Evidence bundle

Every claimed A5 readiness level MUST retain a bounded canonical evidence bundle
containing:

- full 40-hex Product and Backend SHAs, repository and branch identity, clean-tree
  assertion, command/runner version, environment/release manifest, and timestamps;
- complete sorted fixture/case and mutation registries with no missing, duplicate,
  skipped, flaky, or surviving entry;
- exact decision, contract/schema, provider configuration, pricing, redaction,
  fixture, baseline/candidate, runtime, and validator digests;
- per-assertion `PASS`/`FAIL`/`BLOCKED`, safe reason class, input/result digests,
  causal IDs, bounded accounting/redaction/side-effect/cleanup summaries, and
  independently resolvable evidence references;
- local and hosted foreground-run identity/result, artifact name/ID/retention,
  attributable owner decision links, and a bundle self-digest.

Canonical JSON evidence calculates `selfDigest` with that field omitted, then
stores `sha256:<64 lowercase hex>`. The verifier independently recomputes every
referenced digest and the self-digest. Acceptance uses one clean semantic SHA;
a later metadata-only commit may record permanent links only if it changes no
contract, schema, fixture, case, mutation, validator, behavior, or result. Dirty
tree evidence, a different hosted SHA, missing artifact, mutable link alone, or a
generated summary is `BLOCKED`.

### 8.2 Issue #25 acceptance readiness

| Issue criterion                   | Current state | Evidence needed before checked                                                                                                                                  |
| --------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `A5-ADR-01`                       | `BLOCKED`     | Current official option evidence, bounded selected boundary, conditional external candidate, prerequisites, trade-offs, and rejection/evolution triggers.       |
| `A5-PORT-01`                      | `BLOCKED`     | Proposed request/configuration envelopes structurally validate; exact-SHA acceptance, semantic guard cases, SDK containment proof, and AICO-032 remain.         |
| `A5-RESULT-01`                    | `BLOCKED`     | Proposed closed result/failure envelope structurally validates; semantic outcome/accounting/redaction guard and hostile cancel/unknown proof remain.            |
| `A5-VALIDATE-01` / `A5-REPAIR-01` | `BLOCKED`     | Proposed validation/repair structures encode zero authority and cap one; independent semantic validation, disjoint IDs/reservations, and real mutations remain. |
| `A5-FAILURE-01`                   | `BLOCKED`     | Pre/post-dispatch, retry-disabled, persisted scheduling, rate-limit, refusal, cancellation, timeout/unknown, lease-loss, and late-result cases.                 |
| `A5-META-01` / `A5-SECRET-01`     | `BLOCKED`     | Immutable manifest/accounting evidence, multi-sink prohibited-content canaries, low-cardinality ceiling, redaction/drop receipts, and bounded retention.        |
| `A5-VERSION-01`                   | `BLOCKED`     | Snapshot/alias/fingerprint classifications, exact targeting/kill/circuit/rollback/drift fixtures, and historical-read proof with no silent failover.            |
| `A5-TERMS-01`                     | `BLOCKED`     | Deterministic-only configuration proof and later exact provider/content-use manifest; no external call, credential, or founder content in AICO-005 proof.       |
| `A5-TRACE-01`                     | `BLOCKED`     | Criterion/requirement/downstream-owner evidence map distinguishing reused foundations, AICO-005 decision proof, missing production work, and later release.     |
| `A5-ACCEPT-01`                    | `BLOCKED`     | Proposed and accepted-mode validators/mutations, exact-SHA hosted evidence, Architecture/AI approval, and separate Product + Legal/Security approval.           |

### 8.3 Cumulative readiness

| Level                          | Completion condition                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `A5-READY-0 AUDITABLE`         | Decision/option evidence, provider/runtime contract and strict schemas, threat/proof plan, evidence/trace map, this AEO audit, stable registries, strict validator, and structural fail-closed probes exist and pass on a clean SHA. |
| `A5-READY-1 SELECTED`          | Architecture/AI and separately Product + Legal/Security accept the same exact semantic SHA; the external candidate remains disabled and all selected configuration/content-use boundaries are explicit.                              |
| `A5-READY-2 PROVED`            | Separate proof child passes every closed deterministic fixture/case and every real mutation locally and in hosted CI with no skip/survivor, retained self-digested evidence, and attributable QA/Security acceptance.                |
| `A5-READY-3 IMPLEMENTED`       | AICO-030/032/033 and related policy, registry, telemetry, retention, targeting, and operations surfaces pass production contract/integration/security tests; any external activation also has its exact accepted manifest.           |
| `A5-READY-4 RELEASE-QUALIFIED` | AICO-076/077/079/082/086/087/090 and applicable R2/R7 release-candidate, content-use, drift, rollback, redaction, cost, incident, and disclosure checks pass.                                                                        |

Parent AICO-005 completion requires `A5-READY-2`, not production or release
qualification. No higher level is valid when a lower-level prerequisite is absent.

## 9. Agent action, discovery, and external-provider boundaries

An authorized development agent MAY read exact-SHA public/product sources, propose
the decision/contract, validate schemas/documents, execute the deterministic local
matrix, compare canonical evidence, and report `PASS`/`FAIL`/`BLOCKED`. It MUST NOT
infer provider acceptance from issue labels or telemetry, use a credential, send
tenant content, activate a target, alter a budget/content-use decision, approve
its own evidence, retry an unknown external effect, execute a proposed tool call,
or publish product artifacts/state without the separately authorized application
transaction.

Repository `AGENTS.md`, `llms.txt`, `llms-full.txt`, skill files, WebMCP/action
descriptions, search indexes, and crawler directives are discovery aids only.
They are not provider, policy, budget, data-use, tool, task, or state authority.
AICO-005 does not require a public crawler/discovery endpoint. If a later public
discovery file links this architecture, it MUST expose only intentionally public,
stable documentation; it MUST NOT contain tenant prompts/content, credentials,
private endpoints, internal provider configuration, pricing/account manifests,
retained evidence objects, or executable capability claims. Discovery metadata
cannot activate the local or external adapter.

External provider activation is a later explicit control-plane decision. It MUST
bind the exact provider/model/configuration and account access, training/retention/
deletion controls, region/subprocessor constraints, disclosure, redaction,
credential ownership, finite budget, rollback, drift, effective time, and
attributable Product + Legal/Security approval. There is no implied consent,
automatic cross-provider fallback, BYOK, provider/model picker, or custom-prompt
surface in AICO-005.

## 10. Ownership and non-goals

- AICO-005 and decision child #25 own the bounded architecture choice and reusable
  provider/runtime contract; the separate proof child owns deterministic R0 proof.
- AICO-008 owns accepted numeric execution and budget limits. AICO-030 owns fixed
  employee definitions. AICO-032 owns the production Employee Runtime and provider
  adapter. AICO-033 owns the authoritative Budget Ledger.
- AICO-076 owns retention/deletion execution, AICO-077 alerts/diagnostics/kill
  operations, AICO-079 version targeting/migration/rollback, AICO-082 privacy and
  redaction adversarial tests, AICO-086 the ten version-pinned fixtures, AICO-087
  golden dogfood runs, and AICO-090 the alpha limitations/data/support guide.
- External provider access, content-use activation, production credentials,
  provider quality/SLA/economic claims, and full G-03/G-04 or PRD/SRS acceptance
  remain downstream.

This audit does not implement a production Employee Runtime, employee definitions,
Budget Ledger, provider adapter, external provider call, provider router, generic
agent mesh/chat, founder/customer content processing, automatic failover, user
provider/model selection, BYOK, custom prompt surface, training opt-in, production
retention, production numeric budgets, release qualification, or hidden-reasoning
capture. Deterministic fixtures demonstrate a bounded contract only.

## 11. Audit conclusion

AICO-005 has strong accepted foundations plus a Proposed schema/envelope package
that passes current structural validation, but no accepted AICO-005 decision or
hostile proof yet. Its honest state is `Proposed / Pending`, `BLOCKED`, and
`pre-A5-READY-0`. Closure requires exact-SHA acceptance of the immutable
configuration/pricing/redaction/schema manifests, honest snapshot/alias/fingerprint
reproducibility, independent validation and bounded repair, causal accounting
without prompt bodies, safe `DROPPED` guard accounting, low-cardinality redacted
telemetry, proof #26's complete deterministic fixture/mutation evidence,
capability-scoped circuit/rollback/drift behavior, hosted exact-SHA self-digested
evidence, and the required separate owner decisions. No external provider is
activated by this audit.
