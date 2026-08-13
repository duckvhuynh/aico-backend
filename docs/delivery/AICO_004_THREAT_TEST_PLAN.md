# AICO-004 Sandbox, Template, and Dependency Threat Test Plan

## Purpose, authority, and status

This plan defines the proposed adversarial and evidence contract for decision child
[aico-backend#16](https://github.com/duckvhuynh/aico-backend/issues/16), proof child
[aico-backend#17](https://github.com/duckvhuynh/aico-backend/issues/17), and parent
[aicompanyos#4](https://github.com/duckvhuynh/aicompanyos/issues/4). Product authority
is SRS TD-003 through TD-004, PRD-FR-034 through PRD-FR-039, SRS-FR-048 through
SRS-FR-058, SRS-NFR-011, SRS-NFR-025 through SRS-NFR-026, AT-009, and the
non-waivable sandbox, tenant, secret, cancellation, durability, and observability
rules in the Product v0.1 baseline.

The plan becomes binding only after attributable human Architecture plus
Security/Platform acceptance and separate Design plus Engineering scope acceptance
identify the same exact semantic SHA. Until then it is a decision candidate. A test
result becomes acceptance evidence only when independent QA/Security approval and a
hosted clean-checkout run identify the exact final evidence SHA.

No production Sandbox Manager, workspace materializer, Engineer file tool, bounded
command runner, dependency service, output promoter, or generated application build
exists in the current backend. Existing migrations, typed runtime contracts, tenant
rules, durable attempts, policy records, and local Docker availability are reusable
foundations only. Accordingly, every sandbox case below is **Planned** for child #17
and for its named production owner unless a row explicitly identifies narrower
partial evidence. Architecture prose, Docker installation, or a successful manual
container command is not passing isolation evidence.

Stable `A4-T-*` identifiers form a closed registry for the bounded proof. Renaming,
combining, deleting, skipping, or treating one as advisory requires a new exact SHA,
updated trace, and fresh applicable human acceptance. Later implementations may add
surface-specific cases but cannot weaken or silently replace these cases.

Decision child #16 owns the decision-grade candidate bundle: the canonical template
archive and file manifest, reproducible committed lockfile, complete SBOM and license
report, immutable dependency OCI image, command/config manifests, their exact
digests, and the rollback target. Proof child #17 consumes that exact bundle. AICO-047
later productizes the accepted bundle and its registry/publication lifecycle; it is
not a prerequisite for #16 or #17. PRD-FR-040 and all preview publication/isolation
behavior are downstream under AICO-007 and AICO-057 through AICO-058, not AICO-004
acceptance evidence.

## Governed authority and artifact flow

The MVP is hierarchical and artifact-driven, not a peer mesh and not a chain of
agents sharing a shell:

```text
EMP-DES
  -> immutable, schema-valid Design Specification
  -> Founder GATE-02 decision on the exact Design Specification and linked Brief
  -> deterministic Orchestrator and persisted task ledger
  -> EMP-ENG task with an allowlisted context manifest
  -> ToolGateway policy decision for each exact action and parameter digest
       -> bounded workspace-file adapter
       -> SandboxManager boundary
            -> isolated attempt workload
            -> staging output validator and promoter
  -> immutable source/build evidence for QA
```

The authority split is mandatory:

| Component                 | Receives                                                                                                                 | May produce or perform                                                                         | Must not do                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EMP-DES`                 | Frozen allowlisted company fields and exact approved Product Brief version                                               | One typed Design Specification or bounded revision                                             | Add scope, edit code, invoke a file/build/package/network tool, approve, or choose a sandbox                                                                            |
| Founder GATE-02           | Exact current Design Specification and its exact linked approved Product Brief                                           | Append-only approve or revision decision                                                       | Grant session-wide authority or approve a mutable `latest` value                                                                                                        |
| Orchestrator              | Persisted gate, task graph, versions, policy, budget, and cancellation state                                             | Materialize and claim one typed Engineer task                                                  | Execute code, edit files, synthesize missing approval, or pass its own credentials to a workload                                                                        |
| `EMP-ENG`                 | Exact approved Brief/Design, bounded task objective, template/tool descriptions, and allowed findings                    | Typed file mutations and requests for registered command IDs; candidate source/build artifacts | Receive a shell, host path, raw object key, credential, arbitrary environment/network/package authority, approve, deploy, or mutate an approved artifact/prior snapshot |
| `ToolGateway`             | Current actor/company/run/task/attempt/stage, exact action/parameters, approval, budget, environment, and policy version | One expiring, parameter-bound decision and one invocation intent on `ALLOW`                    | Reuse a session grant, trust model output as authority, or call an adapter after `DENY`                                                                                 |
| `SandboxManager`          | Server-built execution manifest and persisted invocation intent                                                          | Create, inspect, terminate, collect, and destroy one attempt-scoped workload                   | Process prompts, choose a tenant/artifact, expose host paths, accept raw commands, or possess founder/control-plane authority                                           |
| Output validator/promoter | Attempt-owned staging output plus expected manifest and current persisted state                                          | Validate bounded relative files/checksums and atomically promote immutable references          | Follow links, trust generated ownership metadata, accept unmanifested output, or promote after cancel/expiry/stale lease                                                |

The normal workflow worker may control the Sandbox Manager through a narrow port, but
its environment is not a guest template. The current local worker carries database,
JWT, and object-storage credentials. No such environment, volume, socket, token, or
identity may be copied or mounted into generated execution. Scope tokens and
credentials are never passed between employees or into an artifact.

Engineer permission to edit files means creating a new candidate generated-source
snapshot within the assigned attempt. It never means mutating the approved Product
Brief, Design Specification, template, lockfile, command policy, prior immutable
source snapshot, or another attempt's workspace.

## Context and execution manifests

Model context and executable sandbox input are separate typed contracts. Neither is
free-form prose authority, and neither accepts caller-selected references. The
execution contract below is the threat-plan projection of the normative
[`SandboxExecutionRequestV1`](../contracts/SANDBOX_EXECUTION.md) and its closed
[JSON Schema](../contracts/schemas/sandbox-execution.v1.schema.json); divergence
between this plan, that contract, and its schema blocks acceptance.

### `EngineerContextManifestV1`

The context assembler resolves every source through the authoritative
company/run/task relationship and binds:

- company, run, task, attempt, employee-definition, workflow, instruction, output
  schema, policy, and toolset versions;
- exact approved Product Brief and Design Specification IDs, versions, schema
  versions, checksums, lineage, and the exact GATE-02 decision ID;
- task-plan version, objective, permitted file/output scope, required checks, bounded
  findings, remaining budget, deadline, and correlation/causation IDs;
- per-source allowed field paths, serialized-byte count, canonical content digest,
  and redaction version; and
- explicit exclusion of cross-company/cross-run content, mutable `latest`, arbitrary
  transcripts, credentials, control-plane details, signed URLs, raw object keys, and
  hidden reasoning.

Required fields are never silently compressed away or truncated. If required exact
references and fields cannot fit the declared context budget, assembly fails with
`INVALID_CONTEXT` before model, tool, sandbox, budget, or cost effect.

### `SandboxExecutionManifestV1`

Only a trusted application service derives this manifest from persisted authorized
intent. In addition to company/run/task/attempt/invocation and correlation fields, it
binds:

- exact approved Brief/Design/task/context-manifest digests and the unexpired
  parameter-bound `ALLOW` decision;
- template archive and file-manifest digests, OCI image digest, lockfile digest,
  dependency/package allowlist digest, SBOM digest, license-report digest, trusted
  build-config digest, command policy/version, source snapshot digest, and aggregate
  manifest digest;
- allowed input objects by opaque immutable reference and checksum; allowed writable
  relative paths; expected output roots, file types, counts, sizes, and checksums;
- one registered command ID mapped server-side to an exact executable, literal argv,
  fixed working directory, minimal literal environment, and no shell;
- wall, CPU, memory, PID/process, storage, file-count, stdout/stderr, artifact-output,
  and attributable compute/cost ceilings;
- network mode `NONE`, read-only root/template/config/lockfile, no host mounts,
  device nodes, capabilities, daemon socket, broad workload identity, or privilege
  escalation; and
- cancellation generation, attempt/lease fencing token, expiry, cleanup policy, and
  evidence/redaction versions.

The manifest contains no raw host/client path, final storage key, provider URL,
control-plane session, database/object-store credential, arbitrary environment
field, or generated tenant/ownership assertion. It is canonically serialized and
checksum-verified before materialization and again before promotion.

## Closed result and failure vocabulary

Every case returns one terminal observation in
`SUCCEEDED | DENIED | FAILED | CANCELED | UNKNOWN`. A `DENIED` request does not start
an adapter or workload. `FAILED` means a started workload or integrity check has a
known classified failure. `CANCELED` means current cancellation/kill authority won
and no result may be promoted. `UNKNOWN` means the external outcome cannot be proven
and always blocks reconciliation; it is never success and never an automatic rerun.

The existing `RuntimeFailure` classes remain authoritative. Sandbox reason codes are
closed, safe refinements, including `APPROVAL_MISSING`, `STALE_VERSION`,
`TENANT_MISMATCH`, `INVALID_CONTEXT`, `ROLE_FORBIDDEN`, `RESOURCE_OUT_OF_SCOPE`,
`ENVIRONMENT_UNSAFE`, `BUDGET_UNAVAILABLE`, `TEMPLATE_INTEGRITY`,
`DEPENDENCY_NOT_ALLOWED`, `FILESYSTEM_BOUNDARY`, `COMMAND_NOT_ALLOWED`,
`EGRESS_DENIED`, `CREDENTIAL_BOUNDARY`, `RESOURCE_LIMIT`, `OUTPUT_LIMIT`,
`TIMEOUT`, `CANCELED`, `OUTPUT_INTEGRITY`, `SECURITY`, `INTEGRITY`, and
`UNKNOWN_OUTCOME`. Internal paths, commands, tenant identifiers, credentials, and
generated bodies never enter founder-visible reason text.

## Deterministic two-company fixture and zero-effect protocol

Child #17 must create a disposable, uniquely named test workspace and two synthetic
companies, A and B, each with distinct founders, approved Brief/Design versions,
tasks, attempts, opaque input objects, workspaces, output staging prefixes, and
random marker/canary bytes. It also seeds:

- a third absent-control reference;
- a checksum-pinned client-only React/TypeScript fixture with no more than five
  responsive routes, local/mock data, and loading/empty/error states;
- a pinned OCI image, canonical template archive/file manifest, reproducible lockfile,
  package allowlist, complete SBOM/license report, trusted configs, and command-policy
  registry supplied as decision evidence by #16;
- host, Company A, Company B, credential, URL, prompt, source, and hidden-reasoning
  canaries that have never been valid secrets; and
- deterministic fake DNS/IP receivers plus database, object, policy, tool, sandbox,
  process, network, promotion, event/outbox, budget, usage/cost, evidence, and
  cleanup ledgers.

For each case, the runner snapshots all authoritative rows, objects, workspace trees,
host/other-workspace sentinels, process/container inventory, network receivers, and
side-effect ledgers. It executes through the real proof boundary, then proves the
expected classification and all applicable zero unauthorized effect properties:

1. no host, foreign-company, foreign-workspace, template, lockfile, trusted-config,
   or prior-snapshot byte read, disclosed, or changed;
2. no unapproved materialization, process/container start, command, child/background
   process, network request, credential grant/read, adapter call, signed access, or
   package fetch;
3. no output promotion, Artifact Version, build success, preview/export work,
   continuation, task/run success transition, or business-success event/outbox;
4. no unauthorized budget reservation/consumption, token, compute/storage charge, or
   cost; a started and then bounded workload records only its attributable allowed
   consumption;
5. no surviving process/container/mount/identity/workspace/staging object after the
   bounded cleanup deadline; and
6. no seeded prohibited value in response, logs, traces, metrics, events, evidence,
   retained output, or CI console.

Where SRS-FR-087 applies to a privileged request, exactly one scoped, redacted,
replay-safe `DENY` PolicyDecision plus its linked denial event/outbox is required.
That audit mutation is evidence, not an unauthorized business or external effect.
Pre-invocation denials must additionally prove `sandbox_start_count = 0`. A response
assertion without state, adapter, resource, promotion, budget, and cleanup ledgers is
insufficient.

## Threat and evidence matrix

| Test ID                     | Preconditions                                                                                                                                                                               | Attack or action                                                                                                                                                                | Expected classification                                                                                                                                                                                          | Required zero-unauthorized-effect proof                                                                                                                                                                                       | Authoritative evidence                                                                                                                                         | Evidence owner                                          | Later implementation owner                                                        | Current status                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `A4-T-BUILD-01`             | B has current exact GATE-02 approval, #16's exact decision-bundle digests, fresh attempt, sufficient budget, and clean isolated workspace                                                   | Materialize the pinned fixture and run only the registered format/lint, type-check, test, and production-build commands                                                         | `SUCCEEDED`; all required commands and output-integrity checks pass; missing/not-run is never pass                                                                                                               | Only B attempt workspace/output changes; no network/credential/host/A workspace access; one accepted invocation/result and attributable bounded usage; complete cleanup                                                       | Exact input/output manifest, command evidence, output tree/checksums, receiver/process/ledger diffs, cleanup report                                            | Platform + Design/Engineering + QA                      | #16 decision bundle; #17 proof; AICO-047, AICO-048, AICO-051, AICO-055 production | **Planned for #17.** The exact archive/lockfile/SBOM/license/image bundle is #16 acceptance evidence; no Sandbox Manager exists and local Docker is not proof. |
| `A4-T-TEMPLATE-01`          | #16's canonical archive/file manifest, immutable image/config digests, tampered variants, and exact rollback target are fixture-owned                                                       | Change a template byte, image digest, trusted config, or select mutable/latest/unknown/killed version before start                                                              | `DENIED` with `TEMPLATE_INTEGRITY` or `STALE_VERSION`                                                                                                                                                            | No materialization, sandbox start, command, output, promotion, event/continuation, budget, compute, or cost; rollback never mutates prior evidence                                                                            | Registry resolution, canonical archive/file/image/config digest mismatch, start counter zero, workspace/tree and all-ledger diff                               | Template Platform + Design + Security QA                | #16 decision archive/image/rollback; #17 proof; AICO-047, AICO-048 production     | **Planned for #17.** #16 must supply and receive acceptance for the exact decision-grade assets; the production registry remains later.                        |
| `A4-T-DEPENDENCY-01`        | #16's reproducible lockfile, package/integrity allowlist, complete SBOM/license report, immutable dependency image, and adversarial variants exist                                          | Request or introduce an unpinned/nonallowlisted package, altered lockfile/SBOM/image, install hook, runtime dependency fetch, unsupported license, or missing integrity         | `DENIED` with `DEPENDENCY_NOT_ALLOWED` or `INTEGRITY`                                                                                                                                                            | No registry/proxy request, install/script execution, network, workspace write, sandbox start when rejected preflight, output, promotion, budget, or cost                                                                      | Lockfile/package/integrity/SBOM/license/image comparison, dependency proxy/network ledgers, start/file/state/budget diff                                       | Template/Dependency Platform + Design/Legal/Security QA | #16 decision lock/SBOM/license/image; #17 proof; AICO-047, AICO-052 production    | **Planned for #17.** Exact bundle acceptance by human Design plus Engineering is a #16 gate, not deferred to AICO-047.                                         |
| `A4-T-GATE-01`              | Valid control plus missing, revision-requested, stale, mismatched-Brief, wrong-stage, terminal, and expired GATE-02 variants                                                                | Dispatch or materialize Engineer work without the exact current founder-approved Design Specification linked to the exact approved Brief                                        | `DENIED` with `APPROVAL_MISSING`, `STALE_VERSION`, or `INVALID_CONTEXT`                                                                                                                                          | No Engineer/model/tool/sandbox invocation, task continuation, workspace, credential, budget reservation, event claiming success, or cost; only required safe denial evidence                                                  | Locked gate/artifact/task state, context/policy result, fake adapter and all-ledger zeros                                                                      | Workflow + Policy + Security QA                         | AICO-031, AICO-041, AICO-046, AICO-048                                            | **Partial reusable foundation only.** AICO-006 proves GATE-01 semantics; no production GATE-02/build dispatch exists.                                          |
| `A4-T-TENANT-01`            | A/B own disjoint exact artifacts, objects, tasks, attempts, workspace identities, and canaries; absent control exists                                                                       | B supplies any A artifact/object/source/workspace/output reference or swaps tenant/run/attempt in context or execution manifest                                                 | `DENIED` with non-disclosing `TENANT_MISMATCH`/`INVALID_CONTEXT`, response equivalent to absent where applicable                                                                                                 | No A metadata/body/path disclosure; no context assembly, credential, materialization, sandbox start, command, output, promotion, transition, budget, compute, or cost                                                         | Two-company manifest/materializer ledgers, A/B/host tree and object diffs, response equivalence, provider/tool/sandbox/budget zeros                            | Tenant Platform + Sandbox Security QA                   | AICO-015, AICO-032, AICO-048, AICO-049, AICO-083                                  | **Planned for #17.** Tenant contract exists, but sandbox input/output are explicitly unimplemented.                                                            |
| `A4-T-HOST-01`              | Host has inaccessible sentinel paths; guest receives only opaque manifest refs and attempt root                                                                                             | Try absolute/relative traversal, alternate separators/encoding, `/proc`, `/sys`, `/dev`, daemon socket, parent/root, host mount, or write outside output root                   | Started malicious probe `FAILED` with `FILESYSTEM_BOUNDARY`/`SECURITY`; preflight-invalid path is `DENIED`                                                                                                       | No host path/metadata/byte disclosure or mutation, no daemon call/mount, no accepted output/promotion/success, bounded usage only, entire workload killed and cleaned                                                         | Sentinel hashes, mount/device/socket inventory, syscall/security signal, output/promotion/event diff, resource and cleanup ledger                              | Sandbox Platform + Security QA                          | AICO-049, AICO-050, AICO-083                                                      | **Planned.** No sandbox filesystem enforcement exists.                                                                                                         |
| `A4-T-WORKSPACE-01`         | A/B workloads and sentinels run in distinct identities/namespaces with no shared writable state                                                                                             | B enumerates, reads, writes, links, signals, attaches to, or races cleanup against A workspace/process/staging output                                                           | Started probe `FAILED` with `TENANT_MISMATCH`/`FILESYSTEM_BOUNDARY`/`SECURITY`; forged preflight ref is `DENIED`                                                                                                 | No A existence/cardinality/path/process/content disclosure or mutation; no foreign signal/attach/output; no B success/promotion; cleanup isolates both workspaces                                                             | Namespace/cgroup/process/tree/object inventories and hashes, response equivalence, security signal, promotion/budget diff                                      | Sandbox/Tenant Platform + Security QA                   | AICO-048, AICO-049, AICO-083                                                      | **Planned.** No unique ephemeral workspace runtime exists.                                                                                                     |
| `A4-T-FS-LINK-01`           | Workspace contains fixture traversal targets, symlink/hardlink chains, FIFO/socket/device candidates, mount-like paths, and output links                                                    | Read/write/collect through a symlink, hardlink, bind/mount, device, FIFO, socket, race-swapped path, or special file                                                            | `FAILED` with `FILESYSTEM_BOUNDARY`, `OUTPUT_INTEGRITY`, or `SECURITY`; invalid manifest path is `DENIED`                                                                                                        | No target read/write, host/foreign link following, device/mount effect, unbounded block, output acceptance/promotion, or residue; workload terminated                                                                         | No-follow canonicalization/lstat evidence, inode/device/mount diff, sentinel hashes, collector and kill/cleanup ledgers                                        | Sandbox Filesystem + Artifact Security QA               | AICO-049, AICO-054, AICO-083                                                      | **Planned.** No materializer or output collector exists.                                                                                                       |
| `A4-T-COMMAND-01`           | Closed command registry contains exact permitted IDs; guest fixture contains alternative binaries and scripts                                                                               | Submit raw shell, unknown command ID, different executable, package manager, interpreter, deploy tool, daemon client, or background launcher                                    | `DENIED` with `COMMAND_NOT_ALLOWED` before process start                                                                                                                                                         | No shell/binary/process, workspace write, network, output, promotion, budget reservation/compute, event, or cost; one safe denial record where required                                                                       | Policy/registry resolution, executable and process ledgers, start count zero, tree/network/state/budget diff                                                   | Tool/Command Platform + Security QA                     | AICO-031, AICO-051, AICO-083                                                      | **Planned.** Employee grant rows are placeholders; no command gateway exists.                                                                                  |
| `A4-T-COMMAND-BINDING-01`   | Valid command ID maps server-side to exact executable, argv, cwd, literal environment, policy digest, and expiry                                                                            | Add shell metacharacters, extra args, response/config indirection, cwd escape, env injection, executable replacement, digest/version/attempt swap, or use expired `ALLOW`       | `DENIED` with `RESOURCE_OUT_OF_SCOPE`, `INVALID_CONTEXT`, `STALE_VERSION`, or `COMMAND_NOT_ALLOWED`                                                                                                              | No process start, partial write, environment disclosure, network, output, promotion, continuation, budget, compute, or cost                                                                                                   | Canonical parameter vectors/digests, fresh-policy binding, process/start and all-ledger zeros                                                                  | Policy + Tool Platform + Security QA                    | AICO-031, AICO-050, AICO-051, AICO-083                                            | **Planned.** Runtime contract defines binding, but production ToolGateway is absent.                                                                           |
| `A4-T-EGRESS-DNS-01`        | Guest network mode is `NONE`; deterministic DNS receiver records all attempts                                                                                                               | Generated build/runtime performs direct resolver calls, alternate DNS protocols/ports, encoded names, or child-process lookup                                                   | `FAILED` with `EGRESS_DENIED`/`SECURITY`; command may not be reported successful                                                                                                                                 | Receiver count zero, no DNS packet, resolution, download, output promotion, success event, or external/cost effect; process tree killed/cleaned                                                                               | Namespace/firewall configuration, receiver capture, syscall/security signal, result/output/event/resource/cleanup diff                                         | Network/Sandbox Security QA                             | AICO-052, AICO-083                                                                | **Planned.** No generated runtime network policy exists.                                                                                                       |
| `A4-T-EGRESS-IP-01`         | Deterministic public, private, loopback, link-local/metadata, control-plane, alternate-protocol, and redirect endpoints are seeded outside the guest                                        | Attempt direct IP/IPv6, loopback, metadata, private/control-plane, proxy, redirect, socket, or tunnel access                                                                    | `FAILED` with `EGRESS_DENIED`/`SECURITY`; no successful command/build                                                                                                                                            | All endpoint receiver counts zero; no connection/response/body, credential, download, side effect, output promotion, success, or external cost; kill/cleanup complete                                                         | Network namespace/firewall and route state, endpoint capture, syscall/security signal, resource/promotion/cleanup ledgers                                      | Network/Sandbox Security QA                             | AICO-052, AICO-083                                                                | **Planned.** No deny-default sandbox egress exists.                                                                                                            |
| `A4-T-CREDENTIAL-01`        | Synthetic canaries are seeded only in forbidden host/worker env, files, metadata, daemon/cloud identity, logs, and object-store/control-plane surfaces                                      | Probe env/files/process metadata/cloud metadata/socket/config/history and attempt to emit any secret-like value through source, output, logs, evidence, DNS, or IP              | `FAILED` with `CREDENTIAL_BOUNDARY`/`SECURITY`; any positive canary detection fails the whole proof                                                                                                              | Guest receives zero forbidden credential bytes/identity; receiver/output/log/evidence/canary scans empty; no promotion, provider/tool/external effect, success, or residual identity                                          | Guest env/file allowlist, credential broker/metadata/socket ledgers, receiver capture, multi-sink canary scan, cleanup report                                  | Identity/Sandbox + Observability Security QA            | AICO-049, AICO-052, AICO-056, AICO-082, AICO-083                                  | **Planned.** Current worker has local secrets and therefore cannot be the guest.                                                                               |
| `A4-T-CPU-01`               | Attempt has a low deterministic CPU quota and hard wall deadline; workload has a busy-loop/process fixture                                                                                  | Exhaust CPU continuously or evade accounting across descendants                                                                                                                 | `FAILED` with `RESOURCE_LIMIT`; if wall deadline wins, `TIMEOUT`                                                                                                                                                 | CPU remains within configured accounting tolerance; whole cgroup/process tree terminates, no later output/promotion/success or other-workspace impact; only bounded attributable usage                                        | Cgroup/runtime CPU metrics, timing, process inventory, termination proof, output/state/budget reconciliation, cleanup report                                   | Sandbox Resource Platform + Reliability QA              | AICO-033, AICO-051, AICO-083                                                      | **Planned.** No sandbox CPU enforcement exists; exact numeric limits remain AICO-008.                                                                          |
| `A4-T-MEMORY-PID-01`        | Attempt has deterministic memory and PID ceilings with allocation/fork/child-detach fixtures                                                                                                | Exceed memory, fork/process limits, respawn, daemonize, or leave descendants after parent exit                                                                                  | `FAILED` with `RESOURCE_LIMIT`; no partial success                                                                                                                                                               | Memory/PID high-water stays bounded; descendants and background processes killed; no host/foreign disruption, late output/promotion/success, excess cost, or residue                                                          | Cgroup/runtime memory/PID evidence, OOM/limit signal, process tree before/after, state/budget/cleanup diff                                                     | Sandbox Resource Platform + Reliability/Security QA     | AICO-033, AICO-051, AICO-083                                                      | **Planned.** No memory/PID sandbox controls exist.                                                                                                             |
| `A4-T-STORAGE-01`           | Attempt has low deterministic writable-byte, inode/file-count, individual-file, and total-output ceilings                                                                                   | Create sparse/dense/large/many/nested files, cache-like output, or race writes during collection                                                                                | `FAILED` with `RESOURCE_LIMIT` or `OUTPUT_LIMIT`                                                                                                                                                                 | Storage/file limits hold; no host/foreign/template change, no partial/unmanifested promotion, no success, no unbounded storage charge, staging/workspace removed                                                              | Filesystem quota/usage and file-count evidence, tree/checksum diff, collector/promotion/budget/cleanup ledger                                                  | Sandbox Storage + Artifact Reliability QA               | AICO-033, AICO-050, AICO-051, AICO-054, AICO-083                                  | **Planned.** No workspace/output quota exists; exact limits remain AICO-008.                                                                                   |
| `A4-T-OUTPUT-01`            | stdout, stderr, retained excerpt, diagnostic, and artifact-output ceilings/redaction policy are pinned                                                                                      | Flood stdout/stderr, invalid bytes, long lines, secret-like markers, repeated diagnostics, or oversized artifact output                                                         | `FAILED` with `OUTPUT_LIMIT`; unsafe diagnostic is redacted/dropped, never spooled unboundedly                                                                                                                   | Pipe draining cannot deadlock; retained bytes remain bounded; no prohibited canary/source body, full log, partial promotion, fake success, downstream payload amplification, or excess cost; cleanup complete                 | Raw-count versus retained-count digest, truncation/redaction/drop counters, canary scan, process/timing/output/state/budget diff                               | Sandbox + Observability/Artifact Security QA            | AICO-051, AICO-054, AICO-056, AICO-083                                            | **Planned.** Existing logging contract is architecture only for sandbox output.                                                                                |
| `A4-T-TIMEOUT-01`           | Registered command has a short hard deadline; fixture spawns nested/background processes and ignores cooperative termination                                                                | Exceed deadline, trap/ignore termination, detach descendants, keep pipes/files open, or write after parent timeout                                                              | `FAILED` with `TIMEOUT`; timeout is never command/build success                                                                                                                                                  | Entire process/cgroup dies within cleanup deadline; no descendant, late write/output/promotion/success, new task, or cost after reconciliation; workspace/staging destroyed                                                   | Monotonic timing, TERM/KILL/cgroup evidence, process/file observations after deadline, state/event/budget reconciliation, cleanup report                       | Sandbox Command Platform + Reliability QA               | AICO-029, AICO-033, AICO-051, AICO-084                                            | **Planned.** No build timeout/descendant-kill implementation exists.                                                                                           |
| `A4-T-CANCEL-01`            | Running attempt is paused at deterministic pre-start, started, output-written, collection, and pre-promotion barriers                                                                       | Race founder cancel/operator kill or a newer cancellation generation against each barrier and deliver late completion                                                           | `CANCELED`; terminal authority wins and late result is fenced, never promoted                                                                                                                                    | No post-cancel command start at pre-start barrier; active process/identity revoked and descendants killed; no late promotion/artifact/success/continuation/new task; bounded usage reconciles and historical evidence remains | Barrier timeline, cancellation generation/lease token, process/credential/workspace ledger, late-completion rejection, state/event/budget/cleanup diff         | Workflow + Sandbox Reliability/Security QA              | AICO-029, AICO-048, AICO-051, AICO-084                                            | **Planned.** Cancellation foundations exist only in durability/policy spikes, not sandbox execution.                                                           |
| `A4-T-REPLAY-01`            | Stable logical invocation key and workload labels exist; deterministic crashes occur before start, after start, after result persistence, and before acknowledgement                        | Redeliver concurrently/sequentially, replace Sandbox Manager, change digest under same key, expire lease, or lose start/result acknowledgement                                  | Original result replays when proven; changed digest `DENIED`; active workload is reattached/terminated per policy; irreconcilable outcome is `UNKNOWN`/`UNKNOWN_OUTCOME` and `BLOCKED`, never auto-started again | At most one workload and accepted logical result; no second command/output/promotion/event/charge; stale lease cannot commit; unknown creates no fabricated success or blind retry; eventual cleanup                          | Idempotency/invocation records, workload-label inventory, process IDs, crash barriers, replacement-process result, output/event/budget counts, cleanup report  | Workflow + Sandbox Reliability QA                       | AICO-025, AICO-027, AICO-048, AICO-051, AICO-084                                  | **Planned for #17.** AICO-002 proves selected model/workflow recovery only, not sandbox start reconciliation.                                                  |
| `A4-T-OUTPUT-INTEGRITY-01`  | Successful control output and traversal, link, special-file, hidden/config/cache, unmanifested, oversized, checksum, foreign-owner, canceled, and expired variants exist in attempt staging | Collect or promote tampered/unexpected output, output outside root, link to host/A, generated ownership metadata, or output after cancel/lease expiry                           | `FAILED` with `OUTPUT_INTEGRITY`, `FILESYSTEM_BOUNDARY`, `TENANT_MISMATCH`, or `INTEGRITY`                                                                                                                       | No offending byte/path/foreign metadata disclosed or promoted; no Artifact Version/build/preview/success/event/continuation/storage charge; staging quarantined/deleted by policy and cleanup completes                       | No-follow collector report, expected/actual per-file and aggregate checksums, tenant/attempt/state revalidation, object/artifact/event/budget/cleanup diff     | Artifact/Sandbox + Tenant Security QA                   | AICO-049, AICO-054, AICO-055, AICO-083                                            | **Planned.** No sandbox output collector/promoter exists.                                                                                                      |
| `A4-T-REDACTION-CLEANUP-01` | Every success/deny/failure/cancel/unknown/crash path is seeded with host/A/B credential, URL, prompt, source, and reasoning canaries; cleanup failures are injected                         | Scan all responses, logs, traces, metrics, events, evidence, command output, CI console, workspaces, staging, containers/processes/mounts/identities after the cleanup deadline | Safe terminal result retains bounded evidence; any prohibited canary or unexplained residue makes the proof `FAILED` with `SECURITY`/`INTEGRITY` and blocks promotion                                            | No prohibited value in any sink; no orphan workload/process/mount/workspace/staging/identity; cleanup failure cannot become success or weaken isolation; evidence generation creates no replay/effect                         | Multi-sink schema/canary scan, resource inventory/reconciler report, redaction counters, evidence checksum/size/audience validation, all-ledger reconciliation | Observability + Sandbox Operations + Security QA        | AICO-020, AICO-048, AICO-056, AICO-077, AICO-082, AICO-083                        | **Planned.** Central sandbox redaction and lifecycle reconciler do not exist.                                                                                  |

References to preview work in zero-effect columns assert only that a denied, failed,
canceled, stale, or unverified build cannot trigger a downstream preview side effect.
They neither execute nor verify PRD-FR-040, preview origin/security, publication,
access, expiry, or UI behavior.

## Sandbox lifecycle, restart, replay, cancellation, and unknown outcomes

The proof and later production implementation use the following stateful protocol:

1. In one application transaction, revalidate current tenant/run/task/gate/versions,
   record the exact authorized invocation intent and idempotency key, reserve budget,
   and emit its ordered event/outbox when applicable.
2. Immediately before credential issuance or materialization, revalidate policy,
   cancellation generation, lease fencing token, manifest digest, and expiry.
3. Create a fresh attempt-scoped identity/workspace, materialize only exact immutable
   references, verify every checksum, and keep the template/root/config read-only.
4. Start the registered command without a shell inside the isolated workload. Track
   a durable invocation record and stable manager/workload labels before considering
   the start acknowledged.
5. Enforce limits and cancellation through the entire cgroup/process tree. A timeout,
   security signal, cancel, or kill revokes temporary identity and terminates all
   descendants; parent process exit alone is not completion.
6. Collect only explicit relative output roots without following links or accepting
   special files. Validate types, counts, sizes, checksums, tenant/attempt ownership,
   current lease, and cancellation state into attempt-scoped staging.
7. In one transaction, revalidate current state and accept at most one result,
   reconcile usage, publish exact immutable references and ordered evidence, or
   classify failure. Generated data never chooses its tenant or target artifact.
8. Destroy workspace, staging, identity, mounts, and workload. Persist cleanup state;
   a reconciler safely terminates/removes expired or uncertain resources.

Retries create a new attempt only for a classified transient infrastructure failure
where the reconciler proves no workload started or proves the previous workload
terminated with no accepted result. Transport replay retains one logical invocation
key; it observes the persisted outcome or current workload and never starts a second
one. A key reused with a changed stable manifest digest conflicts and has no effect.

Worker or manager crash after possible start is not evidence that nothing happened.
A replacement process looks up the persisted invocation and stable workload label,
then observes, terminates, or reconciles it. If existence, termination, or output
cannot be established safely, result is `UNKNOWN`/`UNKNOWN_OUTCOME`, the task/run is
`BLOCKED`, budget is reconciled conservatively, and an authorized operator receives
a safe correlation reference. The system never reports success or blindly replays.

Founder cancel is an idempotent terminal run decision; operator kill is separate
execution-only authority. The first valid terminal transition wins. Both prevent new
starts, request in-flight termination, revoke temporary identity, and fence late
completion/promotion. Neither deletes immutable historical source/build/evidence or
grants an operator founder approval authority.

## Deliberate-failure and fail-closed mutations

The document validator must fail on a missing/duplicate/renamed stable case, missing
matrix column, owner/status, two-company or zero-effect protocol, context/execution
manifest separation, exact-SHA gate, runc limitation, non-goal, closed-result rule,
or one of the 12 mutation controls. Child #17 must apply each real mutation once to
an isolated copy of the actual proof implementation and demonstrate that the real
matrix turns red in the declared case:

| Mutation ID | Control removed or weakened                                                                                             | Required killing cases                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `A4-M-01`   | Skip exact GATE-02, current artifact/linkage, or cancellation revalidation before intent/start                          | `A4-T-GATE-01`, `A4-T-CANCEL-01`                                 |
| `A4-M-02`   | Trust caller tenant/run/workspace/object ownership or remove same-company manifest lookup                               | `A4-T-TENANT-01`, `A4-T-WORKSPACE-01`                            |
| `A4-M-03`   | Stop canonical/no-follow containment checks or allow host/mount/symlink/special-file traversal                          | `A4-T-HOST-01`, `A4-T-FS-LINK-01`, `A4-T-OUTPUT-INTEGRITY-01`    |
| `A4-M-04`   | Accept mutable/tampered template, image, config, lockfile, package, integrity, or license version                       | `A4-T-TEMPLATE-01`, `A4-T-DEPENDENCY-01`                         |
| `A4-M-05`   | Permit raw command/shell or stop exact executable/argv/cwd/env/attempt/expiry digest binding                            | `A4-T-COMMAND-01`, `A4-T-COMMAND-BINDING-01`                     |
| `A4-M-06`   | Enable guest network, DNS, loopback/private/metadata/control-plane route, redirect, or proxy fallback                   | `A4-T-EGRESS-DNS-01`, `A4-T-EGRESS-IP-01`                        |
| `A4-M-07`   | Pass worker/host environment, secret file, daemon socket, metadata/cloud identity, or broad credential into guest       | `A4-T-CREDENTIAL-01`, `A4-T-REDACTION-CLEANUP-01`                |
| `A4-M-08`   | Disable or mis-scope CPU, memory, PID, storage, file-count, or descendant process accounting                            | `A4-T-CPU-01`, `A4-T-MEMORY-PID-01`, `A4-T-STORAGE-01`           |
| `A4-M-09`   | Remove wall timeout, output/log bound, pipe draining, whole-tree kill, or cleanup deadline                              | `A4-T-OUTPUT-01`, `A4-T-TIMEOUT-01`, `A4-T-REDACTION-CLEANUP-01` |
| `A4-M-10`   | Allow collection/promotion without exact output roots/types/counts/sizes/checksums/current lease/cancel state           | `A4-T-OUTPUT-INTEGRITY-01`, `A4-T-CANCEL-01`                     |
| `A4-M-11`   | Remove invocation idempotency, stable workload identity, stale-lease fencing, or unknown-outcome block                  | `A4-T-REPLAY-01`                                                 |
| `A4-M-12`   | Remove bounded evidence schema, redaction/canary scan, zero-effect ledger assertion, or resource cleanup reconciliation | `A4-T-CREDENTIAL-01`, `A4-T-REDACTION-CLEANUP-01`                |

A mutation is killed only when the intended real case assertion fails. Compilation
failure, unrelated exception, empty selection, mock-only assertion, or cleanup/test
harness failure does not count. A surviving, skipped, invalid, or non-applied
mutation blocks acceptance. The runner also fails for any unknown effect, missing
ledger, skipped case, dirty exact-SHA run, external/paid call, or local/hosted result
mismatch.

## Bounded proof boundary and Docker/runc limitation

The smallest child #17 proof is internal, test-only, deterministic, and
paid-service-free. It must be excluded from
`AppModule`, `WorkerModule`, production TypeScript build, public HTTP endpoints, and
ordinary production CLI. One foreground command creates a uniquely named disposable
environment, runs the exact 22-case registry plus all 12 mutations, emits a bounded
machine-readable manifest, and removes its containers, processes, networks, volumes,
workspaces, identities, and staging objects. It uses only synthetic fixtures, pinned
images, local fake receivers, and no production/paid credential or service.

Docker Desktop's Linux engine with hardened OCI/runc isolation is acceptable only
for deterministic development evidence that the chosen manifest, lifecycle, policy,
limits, network configuration, and assertions fail closed on the development host.
Docker/runc shares the host kernel and does not by itself satisfy the production
hostile-code isolation claim: it is not production isolation. A green local proof must be labeled
`DEVELOPMENT_ONLY_RUNC`, must record engine/runtime/kernel/image digests, and cannot
authorize production generated execution.

The target production decision should use a stronger sandbox boundary such as gVisor
on dedicated, patched, non-control-plane sandbox workers, with no host/control-plane
credentials and deny-default network. The accepted ADR must name the selected
technology, compatibility assumptions, patch/rollout owner, workload identity,
fallback behavior, kill/rollback strategy, and required pre-production rerun.
Sandbox unavailability must block safely; it may not fall back to runc, the workflow
worker, host execution, or a weaker unapproved runtime.

## Later issue ownership and explicit non-goals

| Work item                                            | Required later outcome                                                                                                                                                                                                                                    | Not completed by AICO-004                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| aico-backend#16 and #17                              | #16 publishes and receives owner acceptance for the exact decision-grade archive/file manifest, lockfile, SBOM/license report, dependency image, command/config manifests, digests, and rollback target; #17 proves that bundle against the closed matrix | These decision/proof artifacts are not a production template registry, publication lifecycle, or build service. |
| AICO-022 through AICO-024, AICO-030 through AICO-033 | Production typed envelopes/graph, immutable Employee Definitions, current default-deny policy, allowlisted context assembly, and atomic budgets                                                                                                           | The proof's fixture schemas do not become production runtime state automatically.                               |
| AICO-041, AICO-043 through AICO-046                  | Exact production GATE-02, Designer artifact/validation, revision lineage, and build-dispatch orchestration                                                                                                                                                | Child #17 may seed approved synthetic inputs; it must not run Designer/model work or claim the Design workflow. |
| AICO-047                                             | Productize the accepted #16 bundle through the production template registry/publication lifecycle, reproducible instantiate/build integration, version targeting, and rollback                                                                            | It cannot supply missing #16 decision artifacts retroactively or serve as a prerequisite for #16/#17.           |
| AICO-048 through AICO-052                            | Production workspace lifecycle, filesystem confinement, Engineer file gateway, bounded command runner, egress/credential/dependency isolation                                                                                                             | The test-only Docker harness is not a production Sandbox Manager or Engineer tool.                              |
| AICO-053 through AICO-056                            | Production Engineer task plan, immutable source/output lineage, blocking build pipeline, and bounded redacted evidence                                                                                                                                    | A successful fixture is not a product Build Artifact or QA pass.                                                |
| AICO-007, AICO-057 through AICO-058                  | Separate preview isolation decision and production preview service/UX                                                                                                                                                                                     | No preview server, origin, token, browser claim, or control-plane access is in this proof.                      |
| AICO-029, AICO-084                                   | Production cancel/kill and complete resilience matrix                                                                                                                                                                                                     | Proof barriers define the sandbox seam but do not expose production founder/operator commands.                  |
| AICO-082 through AICO-083                            | Release-candidate tenant/secret/redaction and sandbox/egress/credential/preview isolation suites                                                                                                                                                          | R0 architecture evidence never waives R7 release evidence.                                                      |

Additional non-goals are production deployment/hosting of generated code, repository
import or write, arbitrary shell/package/network access, real authentication,
payments, email, analytics, backend/data service generation, customer attachments,
external credentials/connectors, runtime dependency fetch, and any claim that a
prototype is production-ready. Mesh negotiation, free-form inter-agent chat,
session-wide tool grants, model-selected tools/tenants/paths, and manual state repair
are rejected.

## Evidence handling, human gates, and non-waivable exit

Retained evidence may contain only synthetic safe identifiers, stable case/mutation
and reason codes, exact version/digest references, bounded relative workspace paths,
exit/signal and timing/resource summaries, file counts/sizes/checksums, redaction and
cleanup outcomes, correlation/trace references, and aggregate side-effect counts.
Host paths, raw command output, source/artifact bodies, arbitrary environment dumps,
credentials, tokens/cookies, object keys, signed URLs, prompts/completions,
transcripts, hidden reasoning, foreign metadata, raw stack/SQL, and provider/tool
bodies are prohibited. If evidence serialization cannot prove safety, it drops the
diagnostic signal and fails the applicable evidence gate; it never spools the unsafe
payload as fallback.

AICO-004 cannot become accepted/Done until all of the following are true:

1. A named human Architecture owner and Security/Platform owner accept the isolation,
   lifecycle, manifest, dependency-acquisition, failure, and production-runtime
   decision on the exact semantic SHA.
2. Separately, named human Design and Engineering owners accept what counts as at
   most five routes/screens versus states; primary flow, responsive behavior,
   navigation, tokens/styling/component surface, loading/empty/error/interaction and
   accessibility expectations; prototype warning; the exact canonical template
   archive/file-manifest digest, reproducible lockfile digest, package/integrity
   allowlist, complete SBOM/license-report digest, immutable dependency-image digest,
   command/config manifests, build commands, and rollback target on that same
   semantic SHA.
3. Any condition or dispute is resolved in permanent evidence; any semantic change
   after acceptance receives a new exact SHA and fresh applicable decisions.
4. Child #17 consumes only the exact #16 owner-accepted decision bundle and runs all
   22 stable cases and 12 real mutations with no skip, survivor, unknown ledger,
   external/paid/production call, canary finding, cleanup residue, or unresolved
   Critical/High result. Positive build evidence and every denial bind the exact
   candidate commit, archive/file manifest, lockfile, SBOM/license report, dependency
   image, package, command/config, policy, runtime, and evidence-schema versions.
5. The document validator, mutation gate, canonical foreground verification, and
   hosted CI pass at the exact clean repository SHA, which is the exact final SHA. QA/Security
   independently approves that exact-final-SHA evidence and the local run is
   explicitly labeled `DEVELOPMENT_ONLY_RUNC` where applicable.
6. Production gaps remain open under their named issues. No decision, local Docker
   run, fixture build, or human approval is relabeled as production sandbox,
   template, Engineer workflow, preview, or release evidence.

Any host/cross-workspace access, tenant disclosure, credential exposure,
unauthorized egress/command/external side effect, sandbox escape, limit/termination
escape, post-cancel promotion, duplicate workload/result, fabricated success,
unexplained unknown outcome, prohibited evidence value, or cleanup residue is
Critical and non-waivable. The affected candidate/runtime/template version must be
killed or paused, evidence preserved safely, and the complete applicable matrix and
full-pipeline regression suite rerun after correction. New or materially changed
sandbox/runtime/template agents require at least 20 representative eval cases, a
recorded baseline, meets-or-exceeds evidence, and a full-pipeline regression before
deployment.
