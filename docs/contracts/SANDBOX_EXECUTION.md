# Sandbox Execution Contract

**Status:** Proposed for AICO-004 owner acceptance

**Contract version:** `1.0`

**Machine-readable schema:** [`schemas/sandbox-execution.v1.schema.json`](./schemas/sandbox-execution.v1.schema.json)
**Authority:** SRS TD-003–004; PRD-FR-034–039; SRS-FR-048–058; SRS-NFR-011, 025–026; AICO-004

This contract defines the credential-free boundary between the AI Company OS control plane and an isolated prototype-build executor. It is an architecture contract, not a production sandbox implementation or acceptance evidence. A model response, task payload, transcript, successful build, or local Docker result cannot authorize execution.

The canonical security requirements are: **workspace-root confinement**, **command IDs only**, **network-none**, **credential-free**, **exact GATE-02**, termination of the **entire process tree**, fail-closed **output integrity**, and **no silent fallback** to a weaker runtime, policy, dependency source, command, or evidence path.

## 1. Binding rules

1. `SandboxExecutionPort` is an application port. Domain/application code receives no Docker, Kubernetes, gVisor, containerd, cloud-runner, filesystem, or provider SDK type.
2. The control plane derives company, Run, Task, Attempt, approval, policy, budget, and version authority from locked PostgreSQL state. A caller, employee, model, request body, object key, or sandbox manifest is never tenant or approval authority.
3. Execution requires a current parameter-bound `ALLOW` for `sandbox.execute`, an active EMP-ENG Attempt, and exact GATE-02 approval of the exact Design Specification and its exact linked approved Product Brief.
4. Every reference is an immutable ID, version, and SHA-256 digest. Mutable tags such as `latest`, floating dependency ranges, and unqualified image tags are invalid.
5. The request supplies command IDs only. The five command identifiers are exactly, and execute in this order: `FORMAT_CHECK`, `LINT`, `TYPECHECK`, `TEST`, `PRODUCTION_BUILD`. The caller supplies no executable, shell, argument vector, working directory, environment map, image, mount, device, capability, credential, or network setting.
6. A versioned command profile inside the trusted dependency bundle resolves command IDs to executable details. Generated source cannot modify that profile.
7. Runtime uses network-none: no DNS, IP, metadata, loopback service, private subnet, control-plane, package registry, or internet route is available. Dependency acquisition occurs only while producing the trusted, immutable dependency bundle; it is not part of `execute`.
8. The workload receives an empty, executor-constructed environment except fixed non-sensitive runtime values defined by the sandbox profile. It receives no control-plane session, database/object-store/model/provider secret, cloud identity, host socket, or sibling-workspace capability.
9. Every attempt gets a unique ephemeral workspace with workspace-root confinement. The executor uses a read-only root filesystem, non-root UID/GID, no added Linux capabilities, `no-new-privileges`, bounded writable storage, process/resource limits, and termination of the entire process tree.
10. Output, logs, and receipts are untrusted until the control plane validates schema, tenant/version bindings, size, checksum, completeness, redaction metadata, and the current lease.
11. External execution never occurs inside a database transaction or while PostgreSQL locks are held.
12. Unknown schema versions, missing fields, additional properties, invalid digests, unsupported command IDs, absent evidence, and ambiguous external outcomes fail closed.

## 2. Port

```ts
interface SandboxExecutionPort {
  execute(
    request: SandboxExecutionRequestV1,
    signal: AbortSignal,
  ): Promise<SandboxExecutionReceiptV1>;

  inspect(
    logicalIdempotencyKey: string,
    signal: AbortSignal,
  ): Promise<SandboxExecutionReceiptV1 | null>;

  terminate(
    request: SandboxTerminationRequestV1,
    signal: AbortSignal,
  ): Promise<SandboxTerminationReceiptV1>;
}
```

Adapter requirements:

- `execute` is idempotent by `logical_idempotency_key` plus `request_digest`. The same key and digest identifies one external effect; the same key with a different digest is `IDEMPOTENCY_KEY_REUSED` and causes zero execution.
- `inspect` is the reconciliation operation after timeout, restart, lost response, or lease ambiguity. It does not create an execution.
- `terminate` is idempotent and must target only the bound execution. It terminates descendants and reports cleanup separately from process termination.
- All methods accept cancellation. An aborted client call does not prove that the external effect stopped; the application persists `UNKNOWN` until `inspect` or a termination receipt resolves it.
- Adapter transport authentication is workload-to-workload infrastructure. It is never materialized in the generated workload, source tree, command output, or receipt.

The normative JSON representation is the linked schema. The TypeScript names in this document are explanatory projections of it.

## 3. Design DoR and decision-grade manifest

The same schema defines `aico.sandbox-design-decision-manifest/1.0`. This is the machine-readable Design Definition-of-Ready and decision artifact for `duckvhuynh/aico-backend#16`; it is not a generated application, production template, build, preview, or sandbox implementation.

Decision child #16 owns freezing, on one exact semantic SHA:

- one to five typed normalized `/...` route paths selected by the fixed hash router, with navigation labels/order;
- one corresponding screen definition per route, with named layout regions;
- the complete screen-state inventory, including `LOADING`, `EMPTY`, `ERROR`, and `SUCCESS` for every screen;
- exactly one primary flow whose step ordinals are contiguous and whose route, screen, state, and interaction references resolve inside the same manifest;
- explicit interactions with control role, accessible name, trigger, from/to state, keyboard operation, and visible feedback;
- compact and expanded navigation, non-overlapping responsive breakpoints, column counts, content width, region order, and layout-gutter token;
- exact color, typography, spacing, shape/focus, and motion tokens;
- the WCAG 2.2 AA-oriented semantic HTML, keyboard, focus, programmatic-label, contrast, and reduced-motion design target, paired with the explicit verification claim `BASIC_AUTOMATED_SMOKE_ONLY_NO_CONFORMANCE_CLAIM`; this target is not a conformance assertion; and
- the persistent, non-dismissible warning `Prototype only - not a live production system.` in every route/state.

The manifest contains stable canonical artifact slots for the template archive, committed package lock, CycloneDX SBOM, license report, immutable base image evidence, and immutable dependency-bundle image evidence. AICO-004/#16 owns materializing each decision-grade candidate under the reviewed artifact boundary, calculating its digest, and freezing its canonical reference. Each slot therefore has `materialization_owner: AICO-004`; `PENDING_AICO_004_MATERIALIZATION` is valid only while the package remains Proposed. `MATERIALIZED_CANDIDATE` and `DECISION_FROZEN` require both an immutable reference and digest, and every slot must be `DECISION_FROZEN` before #16 can be Accepted.

`productization_owner: AICO-047` records downstream ownership only. AICO-047 later productizes and publishes the already frozen decision artifacts; it cannot unblock #16, supply missing decision evidence after acceptance, or silently change the accepted route, screen, state, flow, responsive, token, interaction, accessibility, warning, dependency, or artifact contract. Any such productization change creates a new Proposed manifest version and repeats owner review.

Machine validators additionally enforce uniqueness and reference integrity that JSON Schema alone cannot express: unique route/screen/state/interaction IDs; unique route paths and inventory ordinals; one screen per route; four required state kinds per screen; contiguous primary-flow ordinals; all cross-references resolving; responsive breakpoints not overlapping; canonical artifact keys matching their declared kinds/media types; both accepted owner-evidence SHAs equaling the manifest `semantic_sha`; the `canonical_artifact_set_digest` calculated over the canonical six-slot object; and the canonical manifest digest calculated with `manifest_digest` omitted.

### 3.1 Proposed and accepted compatibility

- `PROPOSED` permits pending owner decisions and `PENDING_AICO_004_MATERIALIZATION` artifact slots, forbids `semantic_sha`, and is never admissible to `SandboxExecutionPort`.
- `ACCEPTED` requires both attributable Engineering/Design and Architecture/Security/Platform decisions on the same required semantic SHA and six AICO-004-owned `DECISION_FROZEN` canonical artifact references/digests. Acceptance freezes the entire manifest, not only its digest fields.
- An execution request references the exact `ACCEPTED` #16 design-decision manifest and its `canonical_artifact_set_digest`, then separately binds the same materialized template archive, lockfile, base/dependency image, and related manifest digests. The accepted manifest digest transitively binds the SBOM and license report as well. Pending/null canonical slots cannot dispatch work or pass accepted-mode validation.
- Proposed-to-accepted promotion is metadata-only on unchanged decision content. Any semantic change after either owner decision invalidates that evidence and returns the new version to Proposed.
- Because every object is closed with `additionalProperties: false`, any structural field addition, removal, rename, enum change, or semantic reinterpretation is breaking. After schema `1.0` is accepted, such a change requires a new schema version and explicit adapter; there is no permissive mixed-version parsing or silent fallback.
- Historical requests, receipts, and decision manifests remain validated by their original immutable schema and content digest. Rollout pointers may select a prior accepted compatible set for new work but never rewrite history.

This contract does not implement or claim PRD-FR-040 preview publication/completion. Preview publication remains AICO-057 behind the separate preview-isolation decision AICO-007.

## 4. Execution request

`aico.sandbox-execution-request/1.0` contains:

- stable execution, logical-idempotency, correlation, and causation identifiers;
- a canonical request digest calculated with `request_digest` omitted;
- tenant binding: `company_id`, `run_id`, `task_id`, `attempt_id`, and the exact EMP-ENG definition version;
- GATE-02 binding to the exact approved Product Brief and Design Specification versions and approval decision IDs;
- a non-expired, parameter-bound `ALLOW` binding the same tenant, Attempt, action, and resource digest;
- exact workflow, template, dependency-bundle, sandbox-profile, command-profile, task-plan, and source-snapshot versions/digests;
- the exact accepted #16 design-decision manifest version, digest, and semantic SHA;
- the closed five-command sequence;
- positive finite resource/evidence limits, a finite deadline, and a closed output policy.

The trusted manifest assembler loads these fields through tenant-composite relations. It rejects a foreign, stale, revoked, killed, unsupported, mutable, or checksum-mismatched reference before persistence or dispatch.

### 4.1 Digest and image rules

All digest values use `sha256:` followed by exactly 64 lowercase hexadecimal characters. An OCI image reference is accepted only by immutable manifest digest; a tag is descriptive metadata at most and is not an execution selector. Canonical JSON serialization is deterministic and includes contract/schema tags and every authority/version/limit field.

### 4.2 Command and output rules

The command profile is immutable and included in the trusted dependency image. Each command:

- executes directly without a shell;
- has a fixed executable, arguments, working directory, environment allowlist, and blocking status;
- cannot start a background daemon or survive termination;
- writes only inside the workspace and fixed temporary directories;
- cannot fetch a package or use a runtime network;
- produces one bounded `COMMAND` receipt even on timeout, failure, or cancellation.

Build success requires all five command receipts to be `SUCCEEDED` and an integrity-valid complete output manifest. Missing, skipped, truncated-as-success, or not-run blocking commands cannot produce `SUCCEEDED`.

Output paths are normalized relative paths. Absolute paths, `.`/`..` segments, backslashes, links, sockets, devices, hidden control files, dependency caches, source maps containing embedded source, logs, credentials, and files outside the output policy are rejected. Every accepted file has an exact media type, byte count, and digest; the aggregate manifest has its own digest.

## 5. Receipts and evidence

Every receipt is tagged by both `contract` and `receipt_type`:

- execution: `aico.sandbox-execution-receipt`, `EXECUTION`;
- nested command: `aico.sandbox-command-receipt`, `COMMAND`;
- termination: `aico.sandbox-termination-receipt`, `TERMINATION`.

Execution outcomes are closed: `SUCCEEDED`, `FAILED`, `CANCELED`, or `UNKNOWN`. `UNKNOWN` means that the control plane cannot prove whether the external effect completed; it is never converted to success by retry or elapsed time.

The execution receipt binds the original identifiers/digest, exact executor and runtime versions, OCI image digest, applied sandbox-profile digest, non-root UID/GID, isolation attestations, timings, command receipts, security signals, output manifest when available, cleanup state, and its own digest. Runtime attestations include read-only root, all-capability drop, `no-new-privileges`, denied egress, no workload credentials, and no host mounts.

Per-command evidence contains only bounded object references and digests. It records byte count, truncation, redaction version, and checksum; it never embeds unbounded stdout/stderr or source bodies. Redaction is defense in depth: seeded-secret detection, invalid UTF-8/binary handling, and redaction failure produce a safe failure and security signal, not an unredacted log.

Execution evidence reason codes are:

```text
ALL_COMMANDS_SUCCEEDED
COMMAND_FAILED
COMMAND_TIMED_OUT
EXECUTION_CANCELED
SECURITY_POLICY_VIOLATION
OUTPUT_INTEGRITY_FAILED
RESOURCE_LIMIT_EXCEEDED
RUNTIME_UNAVAILABLE
DEPENDENCY_BUNDLE_UNAVAILABLE
UNKNOWN_EXTERNAL_OUTCOME
CLEANUP_FAILED
```

Security signals are bounded, enumerated summaries. They contain no discovered secret value or source content. A suspected host-path, cross-workspace, credential, mount/device, privilege, process, or egress violation terminates execution, records `SECURITY_POLICY_VIOLATION`, and cannot be automatically retried.

## 6. Authority-first transaction and outbox

### 6.1 Prepare or deny

The prepare transaction executes in this order:

1. Resolve and lock the current authenticated/system actor and current company membership before looking up any idempotency record or prior receipt.
2. Lock the Run, BUILD Task, active EMP-ENG Attempt, current lease, budget ledger, GATE-02 decisions, exact approved artifacts, source/task-plan versions, and targeted rollout records.
3. Re-evaluate current policy using exact actor/employee, company, Run, Task, Attempt, stage/state, action, resource digest, approval references, budget, environment facts, kill switches, and versions.
4. On `DENY`, atomically insert the append-only policy decision, ordered denial event, and outbox row. Create no Tool Invocation, sandbox row, cost reservation, object grant, or external side effect.
5. On `ALLOW`, insert-or-validate the logical idempotency record, reserve budget, insert the Tool Invocation and `PREPARED` sandbox execution, and append `sandbox.execution.requested` plus its outbox row in the same transaction.
6. Commit before dispatch.

An idempotent replay re-resolves current authority first. A stored response is not an authorization cache. Revoked authority, stale approval, cancellation, terminal state, killed version, or changed request digest denies replay and cannot reveal a prior cross-tenant receipt.

### 6.2 Dispatch and complete

After commit, a capability-partitioned sandbox dispatcher claims only prepared BUILD executions with `FOR UPDATE SKIP LOCKED`, a short lease, and a stable logical key. Dispatch occurs outside the claim transaction. The normal PM/model worker must not claim BUILD tasks.

On a definitive receipt, one completion transaction:

1. locks the company/Run/Task/Attempt/execution and verifies the current execution lease;
2. rejects stale completion from changing authoritative state;
3. validates receipt schema, request/tenant/version bindings, runtime attestations, command completeness, evidence bounds, output checksums, and cleanup state;
4. reconciles reserved/consumed budget;
5. persists immutable command receipts and accepted output/object/artifact metadata;
6. transitions Task/Run only when permitted; and
7. appends the ordered result event and outbox row atomically.

If any database write fails, none commits. A publisher/consumer is at-least-once and deduplicates with `(consumer_name, event_id)`. Run consumers apply `run_sequence` in order and defer gaps.

### 6.3 Ambiguity, cancellation, kill, and cleanup

- A timeout, lost response, executor restart, or dispatch crash after the external boundary produces `UNKNOWN_EXTERNAL_OUTCOME` unless a signed/verified receipt proves a terminal result.
- An `UNKNOWN` execution blocks blind retry and success publication. Reconciliation calls `inspect` with the same logical key; operator action is required when the provider cannot establish an outcome.
- Cancellation first persists a termination intent/event/outbox. `terminate` then runs outside the transaction. A current termination receipt atomically updates execution/task/run and emits the result event.
- Lease loss prevents authoritative completion and triggers termination/reconciliation; a new Attempt never attaches to the old workspace.
- Kill switches can target sandbox, template, dependency-bundle, command-profile, or workflow versions for new dispatch. Historical receipts remain readable and immutable.
- Process termination and workspace cleanup are distinct facts. `CLEANUP_FAILED` keeps the workspace quarantined, alerts an operator, and prevents identifier reuse. Cleanup never deletes historical receipts, source snapshots, artifacts, events, or object metadata.

## 7. Canonical policy reasons and events

The only successful policy reason is `ACTION_ALLOWED`. Canonical deny reasons are:

```text
ROLE_FORBIDDEN
WRONG_STAGE
APPROVAL_MISSING
STALE_VERSION
RESOURCE_OUT_OF_SCOPE
BUDGET_UNAVAILABLE
ENVIRONMENT_UNSAFE
TENANT_MISMATCH
INVALID_CONTEXT
AUTHENTICATION_REQUIRED
POLICY_VERSION_UNSUPPORTED
ALLOW_EXPIRED
RUN_CANCELED
RUN_TERMINAL
```

`IDEMPOTENCY_KEY_REUSED` is a command conflict, not an ALLOW/DENY policy result.

Canonical event types are:

```text
sandbox.execution.requested
sandbox.execution.dispatched
sandbox.execution.started
sandbox.execution.succeeded
sandbox.execution.failed
sandbox.execution.canceled
sandbox.execution.outcome_unknown
sandbox.execution.termination_requested
sandbox.execution.terminated
sandbox.execution.cleanup_failed
sandbox.security_signal.detected
```

Events carry IDs/digests and safe bounded summaries, never source bodies, command output, secrets, arbitrary exception text, or transport credentials.

## 8. Future PostgreSQL model

This section reserves a later expand-only implementation model; AICO-004 does not add these tables.

### 8.1 Immutable version registries

`sandbox_template_versions`, `dependency_bundle_versions`, `sandbox_profile_versions`, and `command_profile_versions` use UUID primary keys, immutable semantic versions and SHA-256 digests, `timestamptz` lifecycle fields, compatibility metadata, rollout/kill state, and unique stable-key/version constraints. Large manifests and SBOMs are private object references with digest/size metadata rather than unbounded rows.

### 8.2 Execution tables

`sandbox_execution_attempts` contains:

- UUID ID plus non-null `company_id`, `run_id`, `task_id`, `attempt_id`, and `tool_invocation_id` with composite tenant/run foreign keys;
- logical idempotency key, request schema version/digest, all exact version-registry/source/task-plan references;
- migration-controlled status text: `PREPARED`, `DISPATCHING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELED`, `UNKNOWN`;
- provider execution identifier, receipt digest, stable result reason, output/log object references;
- lease owner/token/expiry, positive resource usage, row version, and `timestamptz` prepare/dispatch/start/complete fields.

Required uniqueness includes the logical idempotency key, `(task_id, attempt_id)` where one execution is permitted, `(company_id, id)`, and the provider execution identifier when present. Partial indexes cover dispatchable `(available_at, id)` and active lease expiry. Completed receipt fields are immutable.

`sandbox_command_receipts` contains the execution ID, ordinal, closed command ID, command-profile version, request digest, closed outcome/reason, exit code, bounded stdout/stderr references and digests, truncation/redaction metadata, timing, and resource usage. Its primary/unique key is `(execution_id, ordinal)`; the command ID/ordinal pairing must match the fixed sequence.

Output/log object foreign keys must belong to the same company. Foreign-key columns used for cleanup/retention require supporting indexes. A populated execution schema has no schema-down rollback; deployment uses expand/backfill/validate/contract and forward repair.

## 9. Local proof and production limitation

The AICO-004 test-only spike may use `RUNC_LOCAL_PROOF` on local Docker to demonstrate:

- non-root process, read-only root, dropped capabilities, `no-new-privileges`, seccomp, PID/memory/CPU/storage limits, and tmpfs workspace;
- no inherited application environment, credentials, host bind mount, Docker socket, device, or shared control/data network;
- rejection of host paths, sibling workspaces, non-allowlisted commands, and egress attempts;
- deterministic completion of the fixed fixture pipeline with manifests and receipts.

Local Docker/runc evidence does **not** prove gVisor syscall isolation, a rootless container engine, kernel-escape resistance, production workload identity, production dependency-cache policy, multi-tenant platform controls, or preview isolation. Production build execution requires `RUNSC` (gVisor or an independently accepted stronger runtime), separate workload identity/account and network, platform security review, adversarial evidence, monitoring, and operational kill/reconciliation drills. Docker Compose convenience is never production isolation evidence.

## 10. Downstream ownership

This proposed contract preserves the following decision/productization and downstream ownership boundaries; it does not implement the listed production work:

| Concern                                                                 | Owner                 |
| ----------------------------------------------------------------------- | --------------------- |
| Decision-grade Design DoR and canonical candidate artifact freeze       | AICO-004 / #16        |
| Productized React/TypeScript template publication and package allowlist | AICO-047              |
| Ephemeral workspaces and partial-create cleanup                         | AICO-048              |
| Filesystem, host-path, symlink, device, and cross-workspace confinement | AICO-049              |
| Policy-bound Engineer file tools                                        | AICO-050              |
| Bounded allowlisted command runner                                      | AICO-051              |
| Egress, dependency acquisition, and credential denial                   | AICO-052              |
| Exact approved-input Engineer task plan                                 | AICO-053              |
| Source snapshots, file manifests, checksums, and lineage                | AICO-054              |
| Format/lint/type/test/build pipeline                                    | AICO-055              |
| Bounded redacted command/build evidence                                 | AICO-056              |
| Isolated preview publication                                            | AICO-007 and AICO-057 |
| Release-blocking sandbox/egress/credential/preview adversarial suite    | AICO-083              |

Production tables/migrations, capability-partitioned dispatcher, executor adapter, gVisor provisioning, object-staging identities, health/SLOs, alerts, and runbooks remain downstream implementation. Architecture acceptance requires separate permanent Security/Platform and Design owner evidence; until both exist, this contract remains Proposed and cannot close AICO-004.
