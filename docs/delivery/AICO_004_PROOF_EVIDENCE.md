# AICO-004 Sandbox Proof Evidence

## Status and authority

- Parent: [aicompanyos#4](https://github.com/duckvhuynh/aicompanyos/issues/4)
- Decision child: [aico-backend#16](https://github.com/duckvhuynh/aico-backend/issues/16), Closed/Done
- Proof child: [aico-backend#17](https://github.com/duckvhuynh/aico-backend/issues/17), implementation candidate
- Architecture authority: accepted ADR-009 and the frozen AICO-004 decision bundle merged at
  `9695d033e420b0046097667a9b1eeeba749f1c1e`
- Proof status: candidate until clean exact-SHA hosted CI and attributable human QA/Security
  acceptance both pass

This package proves only the bounded internal/test-only `runc` reference behavior required by
proof child #17. It does not implement a production Sandbox Manager, public API, database
execution model, worker rollout, GATE-02, employee model invocation, or preview.

## One foreground command

```text
npm run prove:sandbox
```

The command fails closed on a dirty worktree unless
`AICO_ALLOW_DIRTY_SANDBOX_PROOF=true` is explicitly set for local development evidence. A clean
run records `git rev-parse HEAD`, executes the real 22-case Docker matrix, then executes 12
isolated source-control mutations. `npm run verify:ci` includes the same `sandbox-proof` gate.

## Frozen decision bundle

The proof rebuilds the accepted dependency image as an OCI archive with rewritten timestamps,
verifies manifest digest
`sha256:352c7508e8f0f8fd27c4556012a54be061c3df880846e874fc4238d7e7259f0c`,
loads that exact manifest, and binds:

- template archive
  `sha256:be46961ef94b58ab5b0d383f7d27fafb639f2682ca22c559b22256d26e3f2166`;
- package lock
  `sha256:22e0e8531a72cc2848ef14b2d73ecae6a5046f9ace5791c566d74fa24186eb99`;
- accepted design manifest
  `sha256:7bb45f0355e41164e6a3dd8abfa7e18196834609fcc3f6b8761140b3085c0198`;
- the decision-frozen SBOM, license authority, file manifest, Dockerfile, and provenance checked by
  `npm run verify:sandbox-architecture:accepted`.

The guest has network mode `none`, UID/GID `1000:1000`, a read-only root, all capabilities
dropped, `no-new-privileges`, finite CPU/memory/PID/tmpfs/output/time limits, no host bind mount,
no Docker socket, and a closed literal environment. It receives registered Node command vectors,
not a shell or caller-provided executable.

## Threat evidence registry

| Evidence group                   | Stable cases                                                                                                  | Executable proof                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reproducible approved build      | `A4-T-BUILD-01`, `A4-T-TEMPLATE-01`, `A4-T-DEPENDENCY-01`                                                     | Two fresh workspaces produce the same normalized output manifest digest; tampered frozen inputs start zero                                                  |
| Gate, tenant, workspace          | `A4-T-GATE-01`, `A4-T-TENANT-01`, `A4-T-HOST-01`, `A4-T-WORKSPACE-01`                                         | Invalid authority is preflight-denied; started probes cannot create promotable foreign/host output                                                          |
| Filesystem and command           | `A4-T-FS-LINK-01`, `A4-T-COMMAND-01`, `A4-T-COMMAND-BINDING-01`, `A4-T-OUTPUT-INTEGRITY-01`                   | Link/special output is rejected; raw/changed command bindings never reach Docker                                                                            |
| Egress and credentials           | `A4-T-EGRESS-DNS-01`, `A4-T-EGRESS-IP-01`, `A4-T-CREDENTIAL-01`                                               | DNS/IP probes record zero receiver hits; closed guest scan records zero credential findings                                                                 |
| Limits and termination           | `A4-T-CPU-01`, `A4-T-MEMORY-PID-01`, `A4-T-STORAGE-01`, `A4-T-OUTPUT-01`, `A4-T-TIMEOUT-01`, `A4-T-CANCEL-01` | Inspected cgroup/runtime limits, bounded pipe capture, whole-container kill, no promotion                                                                   |
| Replay, ambiguity, observability | `A4-T-REPLAY-01`, `A4-T-REDACTION-CLEANUP-01`                                                                 | A distinct process replays one persisted receipt with zero start; unknown workload is reconciled/removed without replacement; canary and residue scans pass |

The integration test asserts registry equality with all 22 accepted IDs; omitted, renamed, or
skipped entries fail the suite.

## Source-level fail-closed mutations

| Mutation  | Disabled control                             | Intended failing case       |
| --------- | -------------------------------------------- | --------------------------- |
| `A4-M-01` | exact GATE-02/cancellation revalidation      | `A4-T-GATE-01`              |
| `A4-M-02` | same-company tenant authority                | `A4-T-TENANT-01`            |
| `A4-M-03` | link/output containment                      | `A4-T-FS-LINK-01`           |
| `A4-M-04` | frozen template/dependency/lock binding      | `A4-T-TEMPLATE-01`          |
| `A4-M-05` | closed command/parameter binding             | `A4-T-COMMAND-01`           |
| `A4-M-06` | network-none isolation                       | `A4-T-EGRESS-DNS-01`        |
| `A4-M-07` | credential-free closed guest environment     | `A4-T-CREDENTIAL-01`        |
| `A4-M-08` | finite runtime limit enforcement             | `A4-T-CPU-01`               |
| `A4-M-09` | timeout terminal classification              | `A4-T-TIMEOUT-01`           |
| `A4-M-10` | exact output manifest/checksum binding       | `A4-T-OUTPUT-INTEGRITY-01`  |
| `A4-M-11` | idempotent replay/no-second-workload control | `A4-T-REPLAY-01`            |
| `A4-M-12` | evidence canary scan                         | `A4-T-REDACTION-CLEANUP-01` |

Each transform is applied exactly once in an isolated repository copy. The unmutated real Docker
matrix must first pass all 22 cases. Every mutant then must fail its named case, select exactly one
failing Jest test, and leave zero survivors, skips, exception-injection mutants, or unrelated
failures.

## Required merge evidence

The merge gate remains pending until all of the following identify the same clean final SHA:

- `npm run prove:sandbox`: 22/22 cases and 12/12 killed mutations;
- canonical `npm run verify:ci`, including the registered fail-closed gate probe;
- hosted Backend CI success;
- attributable human QA/Security approval with disputed IDs and conditions stated explicitly;
- issue #17 criterion-level reconciliation and checked boxes only after the above evidence passes.

## Explicit limitations

`DEVELOPMENT_ONLY_RUNC` does not prove gVisor/runsc syscall isolation, a rootless container daemon,
kernel-escape resistance, production workload identity, production dependency proxy/cache policy,
production object staging, preview isolation, multi-host scheduling, or production rollout. Those
remain owned by AICO-047 through AICO-057 and release adversarial work AICO-083/AICO-084. This
evidence does not complete AT-009 or MVP-CAP-007.
