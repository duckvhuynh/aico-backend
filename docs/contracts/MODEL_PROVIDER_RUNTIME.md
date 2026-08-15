# Model Provider Runtime Contract

- **Status:** Normative AICO-005 decision contract
- **Contract family:** `aico.model-provider-runtime`
- **Schema version:** `1.0`
- **Wire schema:** `schemas/model-provider-runtime.v1.schema.json`
- **Architecture references:** ADR-002, `AGENT_RUNTIME.md`, `OBSERVABILITY_AND_EVALUATION.md`

## 1. Decision boundary

The Employee Runtime depends on one provider-neutral `ModelProviderPort`. Domain task, context, and employee-output envelopes remain outside provider adapters. Provider SDK request, response, exception, retry, and streaming types remain inside the selected adapter and never enter a domain record, event, log, artifact, or proof fixture.

The stable application signature is `invoke(request, signal)`. `request` is an `aico.model-provider-invocation-request`; `signal` is an `AbortSignal` owned by the runtime. The return value is an `aico.model-provider-invocation-result`. Aborting the signal requests cancellation but does not prove the external outcome. A late result cannot commit after cancellation, terminal run state, or lease loss.

For AICO-005 R0, the only invocable provider/adapter pair is `DETERMINISTIC_FIXTURE` / `DETERMINISTIC_FIXTURE` with `execution_mode: "DETERMINISTIC_ONLY"`. It is network-free, credential-free, and valid only in `LOCAL`, `TEST`, and `CI`; it must fail configuration validation in `STAGING` or `PRODUCTION`. `OPENAI_RESPONSES_DIRECT` / `DIRECT_PROVIDER` is the only recordable external pair, but an external configuration is always `DISABLED` or `PENDING_MANIFEST`, has no allowed environments, and is never invocable under schema version `1.0`. No acceptance record can activate external execution in v1; that requires a successor decision and schema after attributable Product + Legal/Security acceptance.

Normative safety rules:

1. provider SDK retries are disabled;
2. no worker sleeps; retry scheduling is persisted as `next_attempt_at` and performed by the durable scheduler;
3. no automatic cross-provider fallback is permitted;
4. post-dispatch timeout is UNKNOWN until separately reconciled;
5. repair cap is 1 for this contract version;
6. every repair is a separate invocation and reservation;
7. raw prompts and hidden reasoning are prohibited from results, evidence, logs, analytics, and debug bundles;
8. training use prohibited, with no training opt-in surface;
9. every provider result, candidate output, and proposed tool request has zero state, artifact, or tool authority; and
10. candidate output can affect authoritative state only after independent strict schema and semantic validation plus the application completion transaction.

## 2. Closed messages and stable discriminators

The schema rejects unknown fields and unknown enum values. Each top-level message is discriminated by `contract` plus `schema_version: "1.0"`:

| Contract                                 | Purpose                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `aico.model-provider-invocation-request` | Least-privilege provider-call DTO passed to `invoke(request, signal)`       |
| `aico.model-provider-invocation-result`  | Closed success, failed, canceled, or unknown result                         |
| `aico.model-provider-repair-request`     | One separately reserved repair invocation using safe validation diagnostics |
| `aico.model-provider-configuration`      | Immutable adapter, model, content-use, retry, and activation configuration  |
| `aico.model-provider-target-decision`    | Exact target activation, pause, kill, or rollback for eligible new attempts |
| `aico.model-provider-circuit-decision`   | Exact configuration circuit transition without silent failover              |
| `aico.model-provider-evidence`           | Bounded redacted verification evidence                                      |

All identifiers are opaque UUIDs. All digests are lowercase `sha256:<64 hex>`. All version/configuration/schema/tool references bind an immutable ID, exact declared kind, logical key, semantic version, and content digest. Named slots cannot substitute another reference kind: for example, `workflow` requires `WORKFLOW`, `output_schema` requires `OUTPUT_SCHEMA`, and `provider_configuration` requires `PROVIDER_CONFIGURATION`. Monetary and token quantities serialize as base-10 strings when known.

## 3. Invocation request

The request contains only the provider-call subset assembled by the trusted runtime:

- company/run/task/attempt/invocation identity and stable logical idempotency key;
- business causality and live W3C trace identifiers;
- exact attempt manifest, employee, workflow, policy, schemas, toolset, provider configuration, pricing, budget, and redaction references;
- exact target decision ID/digest and canonical request digest;
- a closed R0 execution guard binding the active deterministic configuration and applied target decision to the request;
- messages composed only from bounded synthetic `TEXT`, schema-bound canonical synthetic `JSON`, and exact immutable synthetic `REFERENCE` parts whose redaction outcome is `PASS` or `REDACTED`;
- strict required-output schema declaration;
- exact declared tools whose parameters/results are strict schemas;
- hard input/output/content/tool/cost limits, an absolute UTC deadline, and prior budget reservation IDs/digest;
- explicit zero SDK retries, persisted scheduler ownership, no worker sleep, and no automatic fallback; and
- a privacy assertion proving the DTO contains no credential or hidden reasoning and is safe for its declared provider boundary.

The execution guard structurally permits only `LOCAL`, `TEST`, or `CI`; provider/adapter `DETERMINISTIC_FIXTURE`; execution mode `DETERMINISTIC_ONLY`; network `DENY`; external transfer `NONE`; and `APPROVED_SYNTHETIC_FIXTURE_ONLY` content. Every dispatched message part is structurally `SYNTHETIC` and has a non-dropped `PASS` or `REDACTED` receipt. The guard carries the exact configuration reference, target decision ID/digest, resolved-target digest, active/applied statuses, and closed binding invariants. JSON Schema enforces those closed shapes and literals but cannot compare arbitrary sibling values. The independent semantic guard validator must establish that the repeated configuration and target bindings equal the request version and target bindings before dispatch; its integration proof is deferred to backend issue #26. A request naming `OPENAI_RESPONSES_DIRECT`, any external execution mode, a non-active configuration, a non-applied target, a mismatched repeated binding, or an unproved binding invariant is invalid and must not reach an adapter.

`REFERENCE` is a reference, never a signed URL or object-store credential. A provider adapter may dereference only the content already materialized and authorized by the runtime. `JSON` is carried as a canonical bounded string and validated against its exact schema reference before dispatch. `TOOL_RESULT` messages may carry only schema-bound `JSON` or immutable `REFERENCE` parts.

Tool declarations authorize description of a possible action, not execution. Returned proposals bind the declared tool and parameter schema, but carry `execution_authority: "NONE"`. The Tool Gateway must obtain a fresh, parameter-bound policy decision before any execution.

## 4. Result, failure, retry, and reconciliation

`status` is closed to `SUCCEEDED`, `FAILED`, `CANCELED`, or `UNKNOWN`. `SUCCEEDED` means the provider operation produced a candidate that independently validated `PASSED`, has safety `PASS` or `REDACTED`, has redaction `PASS` or `REDACTED`, resolves to `DETERMINISTIC_FIXTURE` with reported and accepted model facts and no unaccepted drift, and has finish reason `COMPLETED`, `LENGTH`, or `TOOL_PROPOSAL`. It still does not mean the task or artifact succeeded. A schema-invalid, semantically invalid, blocked, unsafe, dropped, integrity-uncertain, externally resolved, terminal-finish, or unaccepted-drift candidate cannot be `SUCCEEDED`; it must be `FAILED` or, when dispatch/integrity makes the outcome unknowable, `UNKNOWN`. Every successful result carries the candidate's canonical JSON/digest, independent validation receipt, proposed tools, resolved provider/model/configuration identity, usage, cost, latency, finish, safety, and redaction metadata. The independent result validator must also prove that the result configuration reference equals the request's pinned deterministic configuration; Draft 2020-12 cannot compare those cross-message values, and backend issue #26 owns the integration proof.

Failure classification is closed to:

`PRE_DISPATCH_TRANSIENT`, `RATE_LIMITED`, `VALIDATION`, `REFUSAL_SAFETY`, `CANCELED`, `POST_DISPATCH_TIMEOUT_UNKNOWN`, `POLICY_DENIED`, `BUDGET_EXHAUSTED`, `TERMINAL_PROVIDER`, `INTEGRITY`, `CONFIGURATION`, `TARGET_KILLED`, and `CIRCUIT_OPEN`.

Retry guidance is closed to `NO_RETRY`, `PERSISTED_RETRY_SCHEDULE`, `REPAIR_INVOCATION`, `RECONCILE_BEFORE_DECISION`, and `BLOCKED_OWNER_DECISION`.

Dispatch certainty is closed to `NOT_DISPATCHED`, `DISPATCHED`, and `UNCERTAIN`. `VALIDATION` can be pre-dispatch, in which case it has no retry, or post-dispatch, in which case the only permitted correction is the separately reserved repair invocation. `REFUSAL_SAFETY` and `TERMINAL_PROVIDER` are terminal: they are not persisted retries and do not reconcile. `INTEGRITY` is always `UNKNOWN` with `dispatch_phase: "UNCERTAIN"`, quarantine plus owner decision, and reconciliation required. A cancellation known to be pre-dispatch needs no reconciliation; a dispatched or uncertain cancellation requires cancel-or-lookup reconciliation.

The runtime, not the SDK or worker timer, owns retry scheduling. A retry creates a new attempt/invocation as required by ADR-002 and consumes a new reservation. Rate-limit hints are bounded UTC timestamps. A `POST_DISPATCH_TIMEOUT_UNKNOWN` result must use `status: "UNKNOWN"`, require reconciliation, and cannot be automatically repeated or marked failed/successful. Reconciliation may inspect provider status or request cancellation through a separately authorized operation; it never disguises a new call as replay.

Validation diagnostics contain only stable codes, JSON pointers, schema keywords, and expected classification. They cannot contain rejected values, model text, provider error bodies, prompt text, source/attachment bodies, credentials, or hidden reasoning. `VALIDATION` permits one repair only. The repair has a new invocation ID, idempotency key, request digest, accounting record, trace, and reservation, and links the failed result digest. The original allowed context may be reassembled by immutable reference; it is not copied into evidence.

Every accepted repair request carries a closed `receipt_version: "1.0"` semantic-validation receipt binding the request and reservation-set digests to an exact `EVALUATOR`. It asserts a new invocation identity, exact failed invocation/result linkage, unchanged context manifest, cap compliance, and disjoint original/repair reservation IDs. JSON Schema cannot prove cross-array inequality. Therefore, before accepting the repair request, the independent semantic validator must compare both reservation arrays, reject any overlap, and issue the PASS receipt only after every invariant holds. Schema validation proves that an accepted envelope cannot carry a non-PASS or false-invariant receipt; it does not prove that a caller's true assertion matches the arrays. The executable cross-value proof is deferred to backend issue #26.

## 5. Configuration, targeting, kill, rollback, and circuit

A provider configuration is immutable. Its activation block describes whether it is active, disabled, or awaiting exact manifest acceptance. The exact deterministic provider/adapter pair requires no credentials, denies network, disables training and SDK retries, and is restricted to local/test/CI. The exact external provider/adapter pair remains `DISABLED` or `PENDING_MANIFEST`, permits no founder/customer content, has no allowed environment or accepted activation, and cannot be selected by a v1 invocation or applied target.

Target decisions are append-only records. Activation resolves the exact configuration, provider, model, and revision before an attempt is created. Kill, pause, and rollback affect only eligible new attempts. Existing attempts follow their pinned configuration and explicit cancellation policy. Historical attempt lineage is never rewritten. Rollback selects an earlier exact configuration through a new decision; it does not mutate aliases.

Circuit decisions are scoped to one exact provider configuration. Opening a circuit blocks eligible new attempts and persists the next eligibility time when applicable. It does not select another provider. Half-open probes are separately scheduled, budgeted invocations. Closing a circuit is a new attributable decision.

Resolved-model facts record `NONE`, `EXPECTED_RESOLUTION`, `UNACCEPTED_DRIFT`, or `UNAVAILABLE`. Unaccepted drift fails closed and cannot support a successful result, publication, or promotion evidence.

## 6. Accounting, safety, and evidence

Every token line—input, output, cached input, reasoning, and total—records `REPORTED`, `ESTIMATED`, or `UNAVAILABLE` provenance, a per-line source, and either a decimal quantity or `null`. Every known result records cost as integer micros with ISO-4217 currency, the same provenance classes, a source, and an exact pricing-catalog reference. Resolved provider/model facts likewise record `REPORTED`, `ESTIMATED`, or `UNAVAILABLE`. `UNAVAILABLE` is not zero: unavailable quantities, amounts, currencies, provider/model/revision/fingerprint, and pricing rule are `null`, with an explicit unavailable source/resolution. A pre-dispatch failure may therefore carry entirely unavailable provider, usage, and cost facts without inventing zeros. A measured zero-cost deterministic fixture still records `0` micros with `REPORTED` provenance. Queue, provider, and total latency are non-negative bounded integers. Accounting reconciles by invocation and reservation IDs; an unknown outcome cannot be charged twice by automatic replay.

Safety metadata records `PASS`, `REDACTED`, `BLOCKED`, or `UNKNOWN`; redaction receipts record `PASS`, `REDACTED`, or `DROPPED`. They bind exact safety/redaction policies and use bounded reason codes and field paths only. A `DROPPED` receipt has no output digest and can never support `SUCCEEDED`. A failure message is safe and bounded. Provider request identifiers and provider error codes are bounded identifiers, not raw response bodies.

Evidence records contain assertion IDs/outcomes, exact subject and producer references, counters, a redaction receipt, digests, and privacy absence checks. A top-level evidence `PASS` structurally requires every assertion to be `PASS`, at least one passed check, zero failed and blocked counts, zero prohibited-content hits, zero unauthorized state/artifact/tool effects, and a non-dropped redaction outcome. Evidence contains no tenant content, raw prompts/completions, provider response bodies, credentials, signed URLs, arbitrary transcripts, or hidden reasoning. Evidence remains observational and has zero authority.

## 7. Export expectations

The implementation should expose provider-neutral domain names equivalent to:

- `ModelProviderPort.invoke(request, signal)`;
- `ModelProviderInvocationRequestV1`;
- `ModelProviderInvocationResultV1`;
- `ModelProviderRepairRequestV1`;
- `ModelProviderConfigurationV1`;
- `ModelProviderTargetDecisionV1`;
- `ModelProviderCircuitDecisionV1`;
- `ModelProviderEvidenceV1`;
- `ModelProviderResultStatus`;
- `ModelProviderFailureClassification`; and
- `ModelProviderRetryGuidance`.

Adapters may translate these values to SDK-specific structures internally. Domain/application modules must not import provider SDK types.

## 8. Verification

Validation must compile the Draft 2020-12 schema and validate every `model-provider-*.valid.json` example. Negative mutations must prove rejection of an unknown contract/version/field/enum; missing IDs/digests; mutable `latest`; credential-like or hidden-reasoning fields; nonzero SDK retries; worker sleep; automatic fallback; unbounded limits; every external invocation; external activation without acceptance; deterministic production targeting; non-synthetic or dropped dispatch content; wrong reference kinds; unsafe, external-resolved, invalid, or terminal-finish success; candidate/tool authority; invalid repair ordinal/cap/non-PASS receipt; unavailable accounting encoded as zero; ambiguous timeout reported as failed; terminal/refusal retry; missing integrity/cancellation reconciliation; raw diagnostic values; and unbounded or content-bearing evidence. Cross-message configuration/target equality and cross-array reservation inequality remain mandatory semantic checks whose production integration proof belongs to backend issue #26.

The architecture decision is not production activation. AICO-030 owns employee definitions, AICO-032 owns runtime/adapters, AICO-033 owns budget accounting, and a successor provider decision plus Product + Legal/Security acceptance owns any future external provider/content-use activation.
