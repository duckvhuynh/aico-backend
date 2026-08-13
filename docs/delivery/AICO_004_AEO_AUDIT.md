# AICO-004 AEO, Reproduction, and Evidence Audit

**Status:** Proposed audit for AICO-004 owner acceptance

**Current readiness:** pre-A4-READY-0

**Parent:** `duckvhuynh/aicompanyos#4`

**Decision child:** `duckvhuynh/aico-backend#16`
**Proof child:** `duckvhuynh/aico-backend#17`

## 1. Verdict

AICO-004 currently has product authority and reusable platform patterns, but it has no accepted
template, dependency set, sandbox runtime, build manifest, executable denial proof, or release
qualification. Green control-plane CI is not sandbox evidence. This package may reach
`A4-READY-0` when its documents and structural validators pass; human exact-SHA decisions are
required for `A4-READY-1`, and the separate proof child is required for `A4-READY-2`.

Local Docker with hardened `runc` may prove contract behavior. It is not production isolation,
gVisor attestation, rootless-daemon evidence, or a waiver for AICO-047–056 and AICO-083/085.

## 2. Stable AEO gates

| Gate        | Binding requirement                                                                                                                                      | Current state               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `A4-AEO-01` | PostgreSQL and immutable object records remain authority; telemetry, logs, and guest output never authorize build success.                               | Global contract only        |
| `A4-AEO-02` | The template is an immutable registry object with exact archive, sorted file-manifest, route, constraint, and provenance digests.                        | Proposed                    |
| `A4-AEO-03` | Direct and transitive dependencies, licenses, package bytes, lockfile, acquisition path, SBOM, and approval are exact and auditable.                     | Proposed                    |
| `A4-AEO-04` | The sandbox profile records filesystem, process, egress, credential, resource, output, expiry, and termination policy; no limit is omitted or unlimited. | Proposed                    |
| `A4-AEO-05` | Build intent/result binds exact GATE-02 inputs, source, template, dependency, runtime, commands, checks, output, usage, and evidence.                    | Proposed                    |
| `A4-AEO-06` | Publication is immutable; targeting and rollback change selection only. `latest` and mutable tags are invalid.                                           | Proposed                    |
| `A4-AEO-07` | GATE-02 → intent → task → attempt → policy → workspace → command → source/build/evidence uses distinct causal identities.                                | Partial foundation          |
| `A4-AEO-08` | Logs/evidence are bounded, classified, audience-checked, and redacted; metrics use only low-cardinality cohorts.                                         | Contract only               |
| `A4-AEO-09` | Only the four safe reproduction modes are allowed; a rebuild is a newly authorized attempt.                                                              | Contract only               |
| `A4-AEO-10` | Offline synthetic fixtures reproduce normalized source/output evidence without internet, paid calls, or product mutation.                                | Proof child                 |
| `A4-AEO-11` | Strict validators and one-control-at-a-time real mutations prove every safety control fails closed.                                                      | Structural package proposed |
| `A4-AEO-12` | Acceptance uses immutable checksummed evidence bound to exact Product and Backend SHAs, with no skipped case or semantic waiver.                         | Human/proof gate            |

## 3. Immutable registry and manifest set

The future registry retains established kinds and adds `DEPENDENCY_SET`, `BUILD_RUNTIME`, and
`BUILD_PIPELINE`. Required objects are:

- `aico.prototype-template/v1`: registry identity, archive and sorted file-manifest digest,
  editable/protected paths, at most five routes, one-flow/client-only constraints, mock-data
  schema, prototype warning, responsive/accessibility contract, dependency/build/check refs,
  provenance, compatibility, and approval.
- `aico.dependency-set/v1`: every direct and transitive name/version, package integrity, license
  and license-text digest, runtime/dev class, lifecycle/native declaration, lockfile and SBOM
  digests, content-addressed acquisition provenance, scan result, and approval.
- `aico.build-runtime/v1`: OCI image digest and platform, Node/package-manager and binary
  digests, dependency layer, non-root identity, capabilities/syscall/mount/filesystem/network
  policy, closed environment-key allowlist, mandatory limits, termination grace, and expiry.
- `aico.build-execution/v1`: company/run/task/attempt/workspace and distinct causal IDs; exact
  approved Brief, Design, GATE-02, source, release/run manifest, template, dependency, runtime,
  sandbox, tool, check, redaction, command, budget, deadline, and expected-output refs.
- `aico.build-result/v1`: execution/input digest, blocking check records, exit/timing/resource
  evidence, output manifest, bounded log references, redaction result, security signals,
  usage/cost, termination disposition, and result digest. Missing checks or output mismatch are
  never success.
- `aico.aico-004-evidence-bundle/v1`: both repository SHAs, clean-tree assertion, hosted run,
  manifest roots, closed threat/mutation registries, result index, approvals, and bundle digest.

Digests use `sha256:<64 lowercase hex>`. JSON uses the repository's accepted canonicalization
contract; files and archives use raw-byte digests; file manifests use sorted POSIX relative paths
and forbid symlinks. OCI references use registry digests, never mutable tags.

## 4. Causal telemetry and privacy

The required lineage is:

```text
GATE-02 decision/event
  -> build intent
  -> task
  -> attempt/policy decision
  -> workspace
  -> command invocations
  -> source snapshot
  -> build result/output/evidence
```

Authorized logs and traces may carry high-cardinality causal IDs. Metrics may label only bounded
values such as role, operation, outcome, failure class, command/check key, template cohort,
sandbox-policy cohort, security-signal class, and termination reason.

Metrics must not label company, run, task, attempt, workspace, invocation, evidence, correlation,
or trace IDs; raw digests; paths; hosts; commands; URLs; error text; or tenant content. Command
evidence may retain relative filenames, exit codes, durations, assertion IDs, digests, and short
redacted excerpts. It must not retain host paths, environment dumps, raw output, credentials,
source bodies, package tokens, signed URLs, or hidden reasoning.

## 5. Safe reproduction modes

- `STATE_RECONSTRUCTION`: read-only state, manifest, event, and checksum validation. It cannot
  infer a success that was not committed.
- `OFFLINE_REPRODUCTION`: exact template/runtime/dependency layers, network denied, synthetic
  inputs, isolated output namespace, and no product mutation.
- `CONTROLLED_REEVALUATION`: a new evaluation identity against an immutable build; prior QA and
  founder decisions remain unchanged.
- `SIDE_EFFECT_RECONCILIATION`: separately authorized inspect/cancel/status operations only.
  Unknown external outcome stays blocked and is never blindly replayed.

A rebuild always receives a new attempt, policy decision, budget reservation, and manifest.

## 6. Deterministic proof and fail-closed standard

Proof child #17 must use two synthetic companies/workspaces, frozen IDs/clock, immutable inputs,
a prebuilt content-addressed dependency layer, no paid service, and generated-execution network
disabled. The success case runs in two fresh workspaces and produces equal normalized source and
output evidence digests. Denials prove their classification plus zero unauthorized effect and
complete cleanup.

The closed threat registry is defined in `AICO_004_THREAT_TEST_PLAN.md`. Each `A4-M-01` through
`A4-M-12` mutation must alter the real candidate once and be killed by its declared `A4-T-*`
case. Compilation failure, unrelated failure, empty mutation, exception injection, or a different
case failing does not count.

## 7. Cumulative readiness

| Level                          | Completion condition                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `A4-READY-0 AUDITABLE`         | ADR, contract/schema, candidate manifest, threat/AEO/evidence maps, stable IDs, strict validator, and structural mutation probes exist and pass.                                            |
| `A4-READY-1 SELECTED`          | TD-003/004 and DEC-010 are accepted on an exact semantic SHA by Engineering/Design and separately Architecture/Security/Platform; package, license, image, and policy manifests are frozen. |
| `A4-READY-2 PROVED`            | Exact-SHA hosted fixture passes every closed A4 threat and real mutation with no skip/survivor. This is the minimum for parent AICO-004 completion.                                         |
| `A4-READY-3 IMPLEMENTED`       | AICO-047–056 production surfaces pass contract/integration tests; preview remains incomplete.                                                                                               |
| `A4-READY-4 RELEASE-QUALIFIED` | AICO-083/085/086/089 and applicable R4/R7 release-candidate checks pass.                                                                                                                    |

## 8. Ownership and non-goals

- AICO-004 owns decision and bounded proof only.
- AICO-008 owns accepted numeric resource/budget limits.
- AICO-022/079 own registry/envelope implementation, targeting, migration, and rollback.
- AICO-047–052 own production template, workspace, filesystem, file tools, command runner,
  egress, credentials, and dependency acquisition.
- AICO-053–056 own Engineer planning, source snapshots, build execution, and evidence.
- AICO-007/057–058 own preview isolation and publication.
- AICO-083/085/086/089 own release adversarial, acceptance, evaluation, and operational proof.

This package does not authorize production deployment, generated backend/auth/payment/email/API
integrations, arbitrary packages, package-network access, repository writes, real data, preview,
final retention durations, or a claim that local Docker proves production sandbox security.
