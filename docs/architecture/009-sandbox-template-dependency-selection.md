# ADR-009: Sandbox, fixed template, and dependency acquisition boundary

**Status:** Proposed for AICO-004 owner acceptance

**Engineering/Design evidence:** Pending

**Architecture/Security/Platform evidence:** Pending

This ADR is a candidate decision package for AICO-004. It does not become
Accepted, satisfy DEC-010, or authorize execution until attributable human
owners accept the exact semantic SHA and immutable artifacts described below.

## Context

The MVP must turn an exact, founder-approved GATE-02 design into a bounded
React/TypeScript prototype without giving an EMP-ENG agent ambient access to the
control plane, host, another company, credentials, a package registry, or an
arbitrary command runner. The current backend has no production Build,
Preview, or Sandbox module, no fixed frontend template or package allowlist, and
no target-platform isolation proof. Its local Docker Compose topology and runc
containers are development conveniences, not evidence of a hostile-code
sandbox.

This decision is constrained by:

- G-01 and G-05; MVP-CAP-007; PRD-FR-034 through PRD-FR-041;
- SRS-FR-048 through SRS-FR-060, SRS-TD-003 through SRS-TD-004;
- SRS-NFR-011, SRS-NFR-025, and SRS-NFR-026; partial enablement of AT-009;
- DEC-010, which remains open until the exact template and package set are
  accepted by Engineering and Design;
- ADR-003's accepted modular-monolith and inward dependency direction; and
- ADR-001's Proposed logical Sandbox Manager boundary. ADR-001 is not authority
  for a production runtime choice and this ADR does not promote it to Accepted.

The direct trace includes PRD-FR-034 through PRD-FR-039, PRD-FR-041,
SRS-FR-048, SRS-FR-058, SRS-NFR-011, SRS-NFR-025, SRS-NFR-026, and AT-009.
PRD-FR-040 belongs to the downstream isolated preview capability; it does not
expand this build decision. PRD-FR-041 is the contextual prototype-warning
obligation implemented by this fixed template.

The smallest credible boundary must be reversible. It must keep orchestration,
policy, sandbox mechanics, template content, dependency acquisition, and
preview publication separable so a stronger runtime can replace the MVP
candidate without changing the application use case.

## Decision drivers

1. Default-deny containment of generated or dependency-supplied code.
2. Exact GATE-02, tenant, policy, template, dependency, source, task, command,
   limit, attempt, and expiry binding before any workspace is created.
3. Reproducible builds with no runtime package installation or network access.
4. Complete process-tree termination, bounded redacted evidence, and explicit
   `UNKNOWN` when completion or cleanup cannot be proven.
5. A fixed, small client-only prototype surface that the alpha team can
   maintain.
6. Replaceable ports and immutable versioned manifests rather than runtime
   vendor coupling.

## Options considered

### Sandbox placement and isolation

| Option                                                       | Containment                                                                                             | Operational cost | Failure mode                                                                                | Decision                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Backend worker or host `child_process`                       | Shares host identity, environment, filesystem, and process namespace                                    | Low              | One escaping command compromises the control plane; inherited environment leaks credentials | Rejected                                                      |
| Ordinary or hardened runc beside the worker                  | Namespaces and cgroups, but shares the host kernel and is commonly misconfigured with mounts or sockets | Low to medium    | A local proof can be mistaken for hostile-code isolation                                    | Allowed only as `RUNC_LOCAL_PROOF`; never production evidence |
| Fresh rootless OCI sandbox with a gVisor/runsc-class runtime | User-space syscall boundary plus namespaces, cgroups, read-only layers, and no network                  | Medium           | Platform capability or cleanup ambiguity must fail closed                                   | Selected bounded candidate (`RUNSC`), pending platform proof  |
| MicroVM/Kata/Firecracker per attempt                         | Stronger kernel boundary                                                                                | High for MVP     | Boot, image, scheduling, and observability complexity delays the first alpha                | Deferred; evolution target when triggers are met              |
| Hosted third-party build service                             | Transfers isolation operations                                                                          | Medium to high   | Tenant, data residency, egress, retention, and vendor contract become new trust boundaries  | Deferred; requires a separate ADR                             |

### Dependency acquisition

| Option                                                                                                                                                | Reproducibility and risk                                                                   | Cost                                 | Decision           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------ | ------------------ |
| `npm install` from the public internet inside an execution                                                                                            | Mutable resolution, lifecycle-script execution, DNS/IP egress, and supply-chain drift      | Low setup, unacceptable runtime risk | Rejected           |
| Vendor dependency sources or `node_modules` into every generated workspace                                                                            | Avoids network but duplicates mutable material and expands writable scope                  | Medium                               | Rejected           |
| Trusted acquisition job resolves an exact lock with scripts disabled, scans/licenses/SBOMs it, then publishes an immutable read-only dependency image | Separates supply-chain privilege from untrusted execution and permits exact digest binding | Medium                               | Selected candidate |

This is platform-managed dependency acquisition. The acquisition job is
control-plane infrastructure, not an EMP-ENG tool. It
may reach only the platform-controlled registry proxy/cache under a separately
approved policy. It receives no tenant content. Generated execution receives
only the accepted immutable bundle and has no install command, registry token,
package-manager cache, or network.

### Template shape

| Option                                      | Benefit                                                                                       | Cost/risk                                                                               | Decision           |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------ |
| Fixed Vite React/TypeScript client-only SPA | Small static output, familiar editing model, no server runtime, no router dependency required | Template conventions are intentionally restrictive                                      | Selected candidate |
| SSR or full-stack React framework           | Routing and server features                                                                   | Introduces server code, secrets, backend surfaces, and deployment semantics outside MVP | Rejected           |
| Bespoke renderer/compiler                   | Minimal external packages                                                                     | Creates proprietary tooling and a larger long-term maintenance burden                   | Rejected           |

## Decision

### 1. Domain and dependency boundaries

The topology is:

`EMP-DES -> exact GATE-02 -> deterministic orchestrator -> EMP-ENG -> policy-bound ToolGateway -> isolated SandboxManager`.

`EngineerContextManifestV1` is the orchestrator/agent context and is not a
sandbox execution request. The sandbox boundary accepts only the closed
`SandboxExecutionManifestV1` wire contract. Application code depends on a
`SandboxExecutionPort`; the platform adapter owns OCI/runsc details. No domain
or application policy imports Docker, containerd, Kubernetes, gVisor, a package
manager, or a hosted builder SDK.

The canonical sibling contract uses schema
`docs/contracts/schemas/sandbox-execution.v1.schema.json` with schema version
`1.0` and these wire kinds:

- `aico.sandbox-execution-request`;
- `aico.sandbox-execution-receipt`;
- `aico.sandbox-termination-request`; and
- `aico.sandbox-termination-receipt`.

The execution request binds exact template, dependency bundle, sandbox profile,
command profile, source snapshot, task plan, GATE-02 approved brief/design
versions, company/run/stage/attempt/causal identifiers, a parameter-bound ALLOW,
limits, and expiry. References use immutable `sha256:<64 lowercase hex>`
digests. Callers cannot supply image names, shell text, argv, environment,
network, mounts, credentials, or host paths.

### 2. Selected sandbox profile candidate

Each authorized attempt receives one fresh rootless OCI sandbox:

- runtime class `RUNSC`; AICO-004 freezes this class and its configuration as
  the selected candidate while proof child #17 later establishes bounded
  executable behavior on a target platform;
- no host namespace, privileged mode, device, control socket, host mount, or
  added Linux capability; `no_new_privileges` and a restrictive seccomp/runtime
  profile remain mandatory even with runsc;
- a read-only root filesystem, template archive, toolchain, and dependency
  bundle;
- one newly created tenant/run/attempt-bound writable source projection at
  `/workspace/src`, a bounded tmpfs at `/tmp`, and no other writable mount;
- an empty credential projection and a constructed minimal non-secret
  environment; the backend worker's `process.env` is never inherited;
- a network namespace with no interface for external egress and no DNS
  resolver; both DNS and direct-IP attempts are denied;
- cgroup-enforced wall time, CPU, memory, PID, writable bytes, file count, and
  output limits from the accepted sandbox profile; and
- exact exec descriptors resolved by the command profile, with no shell,
  string concatenation, caller arguments, `PATH` lookup, or extra command.

The five closed ordered command identifiers are:

1. `FORMAT_CHECK`
2. `LINT`
3. `TYPECHECK`
4. `TEST`
5. `PRODUCTION_BUILD`

Their executable digests, working directories, argument arrays, and per-command
limits belong to the immutable command profile. Numeric alpha values are owned
by DEC-012/AICO-008; this ADR requires every value to be positive, finite,
present, policy-bound, and no greater than the accepted profile.

`RUNC_LOCAL_PROOF` may be used for deterministic local contract tests. It must
be labeled non-production in every receipt and cannot satisfy platform
isolation, proof child #17, AT-009, or MVP-CAP-007. This honest limitation does
not prevent #16 from freezing and obtaining owner acceptance for the selected
candidate decision.

### 3. Fixed template candidate

The candidate is `aico-fixed-react-ts@1.0.0-candidate.1`:

- Vite, React, and TypeScript; client-only static output in `dist/`;
- at most five routes, all responsive and represented by a fixed typed route
  registry;
- exactly one primary flow;
- typed mock/local data fixtures only, with no runtime fetch, WebSocket, server,
  authentication, payment, email, deployment, analytics, or service worker;
- explicit loading, empty, error, and success states;
- semantic HTML, keyboard operation, visible focus, labels, contrast tokens,
  reduced-motion behavior, and a documented accessibility baseline;
- a persistent visible warning: `Prototype only - not a live production
system.`;
- editable `src/**` and `public/assets/**`; immutable package, lock, TypeScript,
  Vite, scripts, and dependency paths; and
- the exact five-command pipeline above. Formatting and lint checks may use
  fixed dependency-free Node scripts; a generated agent cannot change them.

The machine-readable Design Definition of Ready is closed, rather than leaving
"five routes" open to interpretation. A route is one URL pattern; a screen is
the full-page view selected by that pattern; a state is a non-navigational
render branch and does not consume another route. The exact ordered inventory
is `/start`, `/input`, `/options`, `/summary`, and `/complete`. The one primary
flow introduces the prototype, captures a local-only choice, compares typed
fixture options, reviews the selection, and completes or restarts without
remote persistence. The manifest fixes compact and wide responsive ranges,
navigation behavior, layout constraints, token roles/scales, all four data
states, interaction semantics, a basic automated accessibility smoke baseline
without a conformance claim, and the non-dismissible warning required on every
route and state.

There is deliberately no routing, state-management, CSS framework, test
framework, component library, network client, or telemetry package in the
candidate package set. Adding one is a new manifest version and requires the
same acceptance process.

There is no runtime dependency installation. Package resolution and lifecycle
scripts are unavailable inside generated execution.

The machine-readable decision candidate is
`docs/architecture/manifests/template-dependencies-v1.json`. It records the
exact direct package set, complete lock resolution, and observed immutable Node
base image digests. AICO-004 itself owns the canonical template directory/archive,
reproducible lockfile, CycloneDX SBOM, package/license-text evidence, dependency
image candidate, and their provenance/digests under
`docs/architecture/artifacts/aico-004/`. Each resolved package entry must bind
its exact version, SRI, SPDX identifier, license-text digest, runtime/dev class,
optional flag, lifecycle declarations, and native-code declaration. These
artifacts are decision evidence, not work deferred to AICO-047. A validator in
accepted mode must reject a missing digest, incomplete package fact, or Pending
acceptance field.

The resolved inventory has 182 exact lock entries. Its materialized AICO-004
license authority records, for every entry, the exact version and SRI, SPDX
license and license-text digest/path/source, runtime or dev class, optional and
linux/amd64 applicability, denied lifecycle declarations, and native kind and
platforms. Of those entries, 160 apply to the selected linux/amd64 target and 22
are retained as non-target optional resolution facts. The CycloneDX SBOM
contains the same 182-component closure. The manifest binds both authorities by
digest; it does not treat the shorter tuple projection as sufficient evidence.

### 4. Boundary invariants

| Boundary               | Required fail-closed behavior                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authorization and gate | Authenticate first; reject missing/expired/non-ALLOW policy, wrong role/stage, stale or non-exact GATE-02, changed task parameters, or canceled/terminal run before workspace creation      |
| Tenant                 | Every reference and fetched row belongs to the authenticated company; tenant mismatch is denied without exposing victim identifiers                                                         |
| Replay                 | Idempotency is company/run/attempt/request-digest scoped; same key with a different digest is denied; a terminal receipt may replay only after current authority validation                 |
| Workspace              | Unique, empty, attempt-bound workspace; reject reuse, pre-existing content, path escape, device, hardlink, symlink, junction, or mount crossing                                             |
| Filesystem             | Normalize and resolve beneath allowed roots for every operation; immutable layers stay read-only; output collection rejects links and special files                                         |
| Process                | Exact command profile only; no shell, caller argv, interpreter flag injection, process escape, daemonization, or PID-tree orphan                                                            |
| Network                | No DNS and no direct-IP egress during execution; acquisition is a separate trusted workflow                                                                                                 |
| Credential             | No secret mount, token, ambient cloud identity, backend environment, Docker socket, SSH agent, or registry configuration                                                                    |
| Resource               | Absent, invalid, exceeded, or unenforceable wall/CPU/memory/PID/storage/file/output limit denies or terminates the attempt                                                                  |
| Output                 | Only regular files beneath `dist/`; bounded count/bytes/path length; no links, devices, secrets, or unapproved executable/server artifacts; canonical manifest and content digests required |
| Timeout/cancel         | Cancellation is monotonic; stop admission, signal the entire tree, escalate after bounded grace, revoke workspace, and reconcile before any terminal claim                                  |
| Failure/unknown        | Adapter loss, runtime ambiguity, incomplete evidence, or unproven termination produces the `UNKNOWN` unknown outcome; it never becomes success and is not automatically retried             |
| Cleanup                | Workspace and sandbox are quarantined until tree termination and mount release are proven; cleanup failure is redacted, audited, and requires reconciliation                                |

No workspace is created and no sandbox is launched until all bindings validate.
No output is published until all five commands succeed, output validation and
digesting succeed, cancellation remains false, and cleanup/termination reaches
a proven state.

### 5. Outcomes, receipts, and audit

Execution outcomes are `SUCCEEDED`, `FAILED`, `CANCELED`, and `UNKNOWN`.
Policy denial uses the existing RuntimeFailure envelope and does not fabricate an
execution receipt. The wider orchestrator may expose `DENIED` as a run result,
but it is not evidence that a sandbox was started.

Termination outcomes are `TERMINATED`, `ALREADY_TERMINAL`, `NOT_FOUND`, and
`UNKNOWN`. An execution success cannot coexist with a cancellation accepted
before commit, an unknown process tree, a failed cleanup, a nonzero command,
missing command evidence, or invalid output integrity.

Receipts are tagged as `EXECUTION`, nested `COMMAND`, or `TERMINATION` and bind:

- company, run, stage, attempt, idempotency, request, parent, correlation, and
  causation identifiers;
- exact request, policy, GATE-02, template, dependency, sandbox, command, source,
  task, and limit digests;
- ordered command outcome, exit classification, start/end/duration, truncation,
  and bounded redacted stdout/stderr evidence;
- runtime class, immutable image/platform identity, resource observations, and
  cancellation/termination evidence; and
- canonical source/output manifests, per-file content digests, aggregate digest,
  redaction summary, cleanup status, and reconciliation status.

Persist receipt, sanitized audit event, output pointer, and outbox continuation
atomically where the application transaction requires them. Object storage
publication is content-addressed and conditional; a duplicate must compare
digests rather than overwrite. Raw logs, environment, source content, or secret
matches are never copied into an audit event. Evidence caps and retention come
from accepted policy.

The closed reason-code vocabulary reuses `APPROVAL_MISSING`, `STALE_VERSION`,
`TENANT_MISMATCH`, `INVALID_CONTEXT`, `ROLE_FORBIDDEN`,
`RESOURCE_OUT_OF_SCOPE`, `ENVIRONMENT_UNSAFE`, and `BUDGET_UNAVAILABLE`, plus
schema-defined `SANDBOX_*` reasons. Unknown reason codes and unknown enum values
default to denial/`UNKNOWN`; consumers must not infer success.

### 6. Threat and proof contract

The closed AICO-004 threat cases are:

`A4-T-BUILD-01`, `A4-T-TEMPLATE-01`, `A4-T-DEPENDENCY-01`,
`A4-T-GATE-01`, `A4-T-TENANT-01`, `A4-T-HOST-01`,
`A4-T-WORKSPACE-01`, `A4-T-FS-LINK-01`, `A4-T-COMMAND-01`,
`A4-T-COMMAND-BINDING-01`, `A4-T-EGRESS-DNS-01`,
`A4-T-EGRESS-IP-01`, `A4-T-CREDENTIAL-01`, `A4-T-CPU-01`,
`A4-T-MEMORY-PID-01`, `A4-T-STORAGE-01`, `A4-T-OUTPUT-01`,
`A4-T-TIMEOUT-01`, `A4-T-CANCEL-01`, `A4-T-REPLAY-01`,
`A4-T-OUTPUT-INTEGRITY-01`, and `A4-T-REDACTION-CLEANUP-01`.

The evidence plan must use a two-company fixture and deterministic faults for
wrong tenant, stale approval, link/path escape, command substitution, DNS and
direct-IP egress, credential probing, every resource limit, cancel/timeout race,
lost adapter/restart, duplicate/replay, output tampering, redaction, and cleanup
ambiguity. A source-level mutation registry must disable real controls and make
the targeted proof fail. Synthetic observation-only mutations do not count.
The threat-test document owns the exact nine-column evidence matrix and twelve
mutation entries. QA/Security must accept the exact final decision/evidence-plan
SHA; proof child #17 owns the later executable outcomes.

### 7. Approval and DEC-010 reconciliation

DEC-010 stays OPEN. Proposed package or image metadata is not owner acceptance.
Before this ADR can move to Accepted or AICO-004 can be Done:

1. AICO-004 produces and validates the canonical template files/archive,
   reproducible lockfile, complete CycloneDX SBOM and license-text evidence,
   dependency image candidate/provenance, and semantic SHA in this decision
   package.
2. Engineering and Design accept the exact template/package/license semantic
   SHA, Design DoR, and documented fixed-template limitations.
3. Architecture, Security, and Platform accept the exact sandbox/acquisition
   profile SHA, selected RUNSC configuration, immutable image digest, explicit
   local hardened-runc limitation, non-goals, and rollback. Target execution
   proof is not a #16 acceptance prerequisite.
4. Validators pass in accepted mode with no null/Pending artifact or approval.
5. QA/Security accepts the exact final decision/evidence-plan SHA. The closed
   executable threat and mutation suite remains owned by proof child #17.

A later version or any changed byte in a semantic input invalidates acceptance;
it never inherits approval by version-name similarity.

## Consequences

### Positive

- Untrusted execution is credential-free, network-free, ephemeral, and outside
  the backend worker's process and filesystem boundary.
- Dependency privilege is isolated from generated execution.
- Exact manifests make policy, replay, audit, evidence, and rollback comparable.
- The small template/package surface reduces alpha variability and supply-chain
  review cost.
- `SandboxExecutionPort` keeps a microVM or hosted adapter possible without
  changing orchestration semantics.

### Negative and trade-offs

- A runsc-capable platform, immutable image pipeline, SBOM/license review, and
  reconciliation controller add operational work before the first execution.
- No runtime install or network means dependency changes are slower and require
  a reviewed bundle release.
- A five-route client-only template cannot demonstrate backend integrations or
  production behavior.
- gVisor is stronger than ordinary runc but is still a shared-kernel platform
  decision with compatibility and performance costs; it is not a microVM.
- `UNKNOWN` and quarantine can reduce availability, but guessing terminal state
  would violate the safety boundary.

## Rollback and evolution

Every execution binds a complete immutable manifest set. Rollback changes the
active admission pointer to a previously accepted set; it does not mutate an
artifact or re-label a rejected receipt. In-flight attempts continue only with
their already accepted digests unless Security revokes that set, in which case
they are canceled and reconciled. New admissions fail closed while no accepted
set is active.

The seams are the execution port, acquisition publisher, sandbox profile,
command profile, template archive, dependency image, and receipt schema. Schema
v1 remains readable after a v2 release. Writers are single-version; readers may
support a bounded transition. Unknown versions are denied. Roll forward rather
than deleting evidence; retain version/digest mappings for audit readability.

Trigger a replacement ADR when any of these occurs:

- target-platform runsc incompatibility or an unresolved escape/security issue;
- untrusted native compilation, server execution, customer-provided packages,
  or controlled egress becomes a product requirement;
- workload density, cold start, or quarantine rate breaches accepted SLOs;
- tenant/risk policy requires a separate kernel or hosted regional boundary; or
- the fixed template can no longer express the accepted alpha prototype scope.

MicroVM/Kata/Firecracker and hosted-build adapters are the intended evolution
options. Neither may weaken the closed request/receipt contract.

## Current evidence and gaps

As of 2026-08-13:

- the canonical lock, 182-entry/160-applicable license and package-fact
  authority, 182-component CycloneDX SBOM, template file manifest,
  deterministic template archive, and strict sandbox design decision manifest
  are materialized and digest-bound by AICO-004;
- the Node base image index and linux/amd64 manifest digests were inspected;
- the linux/amd64 dependency-image candidate is materialized as OCI manifest
  `sha256:31e1ca77e173d680b72ef7236dd7ee2a8e023531441d47d4d022e41350bca3c1`
  with reproducible-build inputs and provenance. The complete proposed artifact
  set is bound by semantic SHA
  `b341788c7a5787b2e707996cc521ebf59e3cc8638482b7562335b590952feec7`;
  human owner acceptance remains separate from materialization;
- no accepted numeric profile, production adapter, output collector,
  termination reconciler, or end-to-end execution evidence exists in this
  child; target RUNSC proof is an explicit downstream #17 gap, not a #16
  acceptance blocker;
- local Docker/runc cannot establish the selected runtime boundary; and
- Engineering/Design, Architecture/Security/Platform, and QA/Security evidence
  remains Pending.

Therefore this package is readable decision input only. It must not be cited as
production sandbox proof, AT-009 completion, MVP-CAP-007 completion, or
permission to execute generated code.

## Traceability

| Architecture ID | Decision/evidence obligation                                                                           | PRD/SRS/AT trace                              | State                                          |
| --------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------- |
| A4-ADR-01       | Option matrices and bounded selection                                                                  | SRS-TD-003–004, DEC-010                       | Candidate documented                           |
| A4-BOUNDARY-01  | Workspace/process/fs/network/credential/resource/output/timeout/cancel/unknown/tenant/cleanup boundary | PRD-FR-035–038; SRS-FR-048–053, 058           | Candidate documented; executable proof Pending |
| A4-TEMPLATE-01  | Fixed client-only template, Design DoR, contextual warning, and rollback                               | PRD-FR-034–035, 039, 041; SRS-FR-048, 054–057 | Template/archive/Design DoR materialized       |
| A4-DEPS-01      | Exact dependency, integrity, license-text, lock/SBOM/acquisition/image contract                        | PRD-FR-037; SRS-FR-052–053; SRS-NFR-025–026   | Complete AICO-004 candidate set materialized   |
| A4-OUTPUT-01    | Closed request/receipt/output manifests and integrity                                                  | SRS-FR-054–058; SRS-NFR-011                   | Contract candidate; executable proof Pending   |
| A4-TERM-01      | Cancel/tree termination/unknown/reconciliation                                                         | SRS-FR-051, 057–058; SRS-NFR-011              | Contract candidate; executable proof Pending   |
| A4-THREAT-01    | Closed threat/mutation plan                                                                            | AT-009; SRS-NFR-025–026                       | Plan sibling Pending exact-final-SHA evidence  |
| A4-ROLLBACK-01  | Version rollback, readability, evolution, later ownership                                              | SRS-TD-003–004                                | Documented; operational proof Pending          |
| A4-ACCEPT-01    | Validators and attributable exact-SHA owner acceptance                                                 | DEC-010; AT-009                               | Pending                                        |

PRD-FR-040 preview is intentionally excluded from A4-TEMPLATE-01 and remains a
downstream capability.

## Non-goals

This decision child does not implement a production module, endpoint, database
schema, sandbox adapter, runtime provisioner, GATE-02, Designer or Engineer
agent, package installation, arbitrary shell/network access, preview service,
backend/auth/payment/email/deployment behavior, repository write, or gVisor
platform. It does not select final alpha numeric limits, certify package
licenses as legal advice, make unvalidated npm/OCI observations permanent
evidence, or claim AT-009 or MVP capability completion. PRD-FR-040 preview is
explicitly downstream.

## Later issue ownership

- AICO-008 owns alpha numeric qualification, budget, attachment, and capacity
  policy.
- AICO-010 owns control-plane infrastructure/configuration; AICO-031 owns the
  production contextual policy decision.
- AICO-004 owns the decision-grade canonical template, lockfile, allowlist,
  CycloneDX SBOM, license-text evidence, dependency image candidate, and exact
  owner-acceptance package. AICO-047 later productizes and publishes that
  accepted set. AICO-047 cannot unblock AICO-004; any semantic change during
  productization creates a new version and returns through acceptance.
- AICO-048 and AICO-049 later productize ephemeral workspace lifecycle and
  tenant/filesystem confinement. Neither can unblock or retroactively supply
  AICO-004 decision acceptance.
- AICO-050 and AICO-051 own policy-bound file tools and the bounded command
  runner.
- AICO-052 owns executable egress and credential denial.
- AICO-053 and AICO-054 own the approved Engineer task plan, source snapshot,
  file manifest, and lineage.
- AICO-055 and AICO-056 own pipeline execution plus bounded redacted evidence.
- AICO-057 owns isolated preview publication and is not part of build execution.
- AICO-083 owns sandbox/egress/credential/preview isolation tests; AICO-084 owns
  restart/duplicate/cancel/retry/budget resilience tests.

## Acceptance record

No acceptance is recorded in this ADR. The required owner comments must name the
role, decision, exact semantic SHA, manifest/image digests, date, limitations,
and disputed IDs. Until those records exist and validators confirm an identical
package, the status remains Proposed.
