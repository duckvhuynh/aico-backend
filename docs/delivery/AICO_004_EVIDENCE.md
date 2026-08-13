# AICO-004 Decision Evidence and Traceability

**Status:** Proposed package; human decision and proof evidence pending

**Parent:** `duckvhuynh/aicompanyos#4`

**Decision child:** `duckvhuynh/aico-backend#16`
**Proof child:** `duckvhuynh/aico-backend#17`

## 1. Product outcome and scope

AICO-004 selects and will prove, across decision child #16 and proof child #17, a bounded trust claim: an immutable, responsive, client-only
React/TypeScript template with at most five routes and mock/local data can build reproducibly in
an isolated attempt workspace, while host/cross-workspace access, credentials, unrestricted
egress, arbitrary commands, and resource/output escapes fail closed.

Trace: G-01/G-05; MVP-CAP-007; SRS TD-003–004; PRD-FR-034–039; SRS-FR-048–058;
SRS-NFR-011/025/026; partial enabling evidence for AT-009; DEC-010.

## 2. Evidence map

| Evidence ID      | Decision-child authority                                                                           | Current reusable evidence                                             | Missing completion evidence                                                                  | Later owner           |
| ---------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------- |
| `A4-ADR-01`      | Compare sandbox, dependency-acquisition, and template choices; select bounded MVP approach.        | Proposed ADR-001/004 and accepted port-oriented modular architecture. | Accepted ADR-009 with exact human evidence.                                                  | AICO-004/#16          |
| `A4-BOUNDARY-01` | Workspace/process/filesystem/network/credential/resource/output/termination and cleanup contract.  | AICO-003 tenant contract; AICO-006 deny-by-default policy.            | Executable confinement proof and production adapter.                                         | #17; AICO-048–052     |
| `A4-TEMPLATE-01` | Fixed ≤5-route responsive client-only template and rollback contract.                              | Product scope and SRS boundaries.                                     | Accepted exact files, interaction states, accessibility/warning, package and image manifest. | #16; AICO-047         |
| `A4-DEPS-01`     | Exact package, integrity, license, lockfile, SBOM, acquisition, and no-runtime-install policy.     | Control-plane lockfile patterns only.                                 | Accepted dependency bundle and production acquisition service.                               | #16; AICO-047/052     |
| `A4-OUTPUT-01`   | Exact source/build result, blocking check, checksum, staging, bounded log, and redaction contract. | Artifact/event/outbox and AEO patterns.                               | Test-only proof, then production source/build/evidence services.                             | #17; AICO-054–056     |
| `A4-TERM-01`     | Finite limits, timeout/cancel/kill-tree, cleanup, duplicate/restart, and UNKNOWN reconciliation.   | AICO-002 durability and lease-fencing patterns.                       | Sandbox process evidence and production runner.                                              | #17; AICO-051/084     |
| `A4-THREAT-01`   | Closed two-company positive/negative matrix and zero-effect invariants.                            | AICO-003 and AICO-006 adversarial patterns.                           | All proof-child cases and real mutations.                                                    | #17; AICO-083/085     |
| `A4-ROLLBACK-01` | Immutable publication, version targeting, old-run readability, and no silent fallback.             | Registry/manifest contract patterns.                                  | Accepted version registry plus production migration/rollback.                                | #16; AICO-022/079     |
| `A4-AEO-01-12`   | Causal, privacy, reproduction, evidence, and readiness gates.                                      | Accepted global AEO contract.                                         | AICO-004 proof and production telemetry/evidence.                                            | #16/#17; AICO-056/072 |
| `A4-TRACE-01`    | Exact requirements, evidence, gaps, non-goals, and later ownership.                                | This package.                                                         | Product and Project review on exact semantic SHA.                                            | #16                   |
| `A4-VERIFY-01`   | Strict architecture validator and deterministic structural mutation probes.                        | Validator implementation in this branch.                              | Hosted exact-SHA success.                                                                    | #16                   |
| `A4-ACCEPT-01`   | Separate Engineering/Design and Architecture/Security/Platform exact-SHA decisions.                | Design DoR acceptance on parent #4.                                   | Decision comments on PR; then QA/Security approval for proof child #17.                      | Human owners          |

## 3. Present-versus-required truth

Present:

- PostgreSQL tenant/task/attempt/policy/tool/event/outbox foundations.
- AICO-002 idempotency, restart, lease fencing, and unknown-outcome patterns.
- AICO-003 tenant, object, non-disclosure, and redaction boundaries.
- AICO-006 action-time, deny-by-default, exact-version policy contract.
- Docker/CI disposable-project patterns and deterministic paid-service-free fixtures.

Not present:

- Production Sandbox Manager, generated workspace, command runner, or capability-partitioned
  Engineer worker.
- Production template registry, dependency acquisition/cache, rootless/gVisor platform,
  sandbox execution persistence, or staging/promoter roles.
- Public API/UI, GATE-02 service, Designer/Engineer model execution, preview, or end-to-end build.
- Executable proof child #17 results, exact-final-SHA QA/Security acceptance, AT-009 completion,
  or MVP-CAP-007 completion.

The normal API/worker Compose environment carries database, JWT, and object-storage credentials;
it must never be the generated-code guest. Current local `runc` can prove development controls but
not rootless/gVisor or production kernel-isolation claims.

## 4. Human decision gates

Before decision child #16 can be Done:

1. Proposed-mode validator and all structural mutation probes pass on a clean semantic SHA.
2. Hosted canonical CI passes on that same SHA.
3. Engineering/Design approves the exact template, route/state model, package versions,
   integrity, licenses, warning/accessibility behavior, and rollback target.
4. Architecture/Security/Platform separately approves sandbox technology, dependency acquisition,
   no-fallback boundary, threat plan, evidence limits, and downstream ownership.
5. A metadata-only accepted-status commit passes accepted validation and hosted CI; any semantic
   change requires both decisions again.

Decision acceptance unblocks proof child #17. It does not check any parent AICO-004 acceptance box
by itself except through later criterion-level reconciliation.

## 5. Non-goals retained at decision acceptance

No production module/API/schema migration/sandbox adapter, production gVisor rollout, GATE-02
implementation, Designer/Engineer work, arbitrary shell/network/packages, generated backend/auth/
payment/email/deployment, repository write, preview, final numeric budget selection, AT-009 pass,
or MVP-CAP-007 completion is claimed.
