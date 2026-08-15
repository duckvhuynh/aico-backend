# AICO-009 Verification Evidence

**Parent issue:** `duckvhuynh/aicompanyos#9`  
**Backend issues:** `duckvhuynh/aico-backend#4`, `duckvhuynh/aico-backend#31`
**Evidence date:** 2026-08-16
**Canonical command:** `npm run verify:ci`

## Acceptance reconciliation

| Parent acceptance criterion                                                                                               | Evidence                                                                                                                                                                                                                                                                                                                       | Result                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| One documented foreground command matches required CI checks; no developer-managed server/background process is required. | `scripts/verify-ci.mjs` is called locally and by the single GitHub Actions `verify` job. It owns a uniquely named disposable Compose project and removes its containers/volumes in `finally`.                                                                                                                                  | Pass                                                     |
| Pull requests block on lint/static/type, unit/contract, migration, and production-build failures.                         | The verifier exits non-zero on any gate and `npm run verify:fail-closed` probes all named gates. GitHub Actions reports the combined `verify` status. Repository-level required-check enforcement cannot be configured on the current private GitHub plan; the API returns HTTP 403 requiring GitHub Pro or public visibility. | Verifier pass; repository enforcement externally blocked |
| Deterministic model/build/storage fixtures run without paid external calls and a deliberate failure proves each gate.     | Deterministic PM unit test, local Docker image build, tenant-scoped MinIO fixture, 22-gate command-level fail-closed harness, and HTTP smoke test all run without paid services.                                                                                                                                               | Pass                                                     |

## Gate manifest

The committed manifest in `scripts/verification-gates.mjs` covers 22 logical gates:

1. clean lockfile install;
2. parent-issue PR governance;
3. architecture and accepted-decision validation;
4. provider-decision evidence and exact-SHA binding;
5. fail-closed proof integrity;
6. formatting;
7. lint/static analysis;
8. TypeScript type checking;
9. unit and contract tests;
10. production build;
11. dependency audit;
12. Compose configuration;
13. API/worker/migration image builds;
14. sandbox proof;
15. preview-isolation proof;
16. isolated PostgreSQL and MinIO health;
17. one-shot object-store initialization;
18. migration apply, latest revert, and forward reapply;
19. exact-version policy-approval proof;
20. tenant-keyed object put/head/get/checksum and cross-tenant denial;
21. durable workflow resilience; and
22. full API/worker HTTP smoke verification.

The separate Node runtime preflight runs before the canonical verifier and has its own bounded proof;
it is intentionally not duplicated as a logical gate in this manifest.

`scripts/verification-gates.mjs` is the single command-spec source consumed by both the canonical
verifier and the negative proof. Its `before` specs also bind the nonlogical API/worker startup
helpers for workflow-resilience and HTTP smoke without counting them as additional gates.

## Fail-closed negative proof

`npm run verify:fail-closed` no longer asks the canonical runner to exit at a synthetic
`--probe-failure` branch. It invokes the exact canonical command or package wrapper for each logical
gate with one bounded fault, and requires
all 22 commands to return non-zero for the intended fault. The command-level proof covers invalid
lockfile input, missing delivery traceability, an in-memory architecture-document mutation, an
invalid provider-decision evidence SHA binding, a harness unexpected-success self-test, malformed
format/lint/type/build/test fixtures, a missing audit lockfile, invalid Compose/build inputs, dirty
exact-SHA proofs, missing Compose services,
absent fixture prerequisites, an invalid object-store endpoint, and unreachable HTTP input.
The audit fault runs the exact shared `npm audit --audit-level=high` invocation from an isolated
directory without a lockfile; it does not add proof-only audit flags.

Every child command has a 30-second timeout except the exact full `npm test` wrapper, which has a
90-second bound, and all captured output is bounded. Temporary fixtures and the dirty-worktree
sentinel are removed in `finally`, and a uniquely named Compose project is brought down with volumes
and orphans removed. The harness checks that its execution order exactly matches the shared unique
22-entry command manifest. Each negative probe must also match a fault-specific output fingerprint;
an unrelated engine, executable, or tool failure cannot count as the intended gate kill. Cleanup is
verified with project-label queries for zero containers, volumes, and networks.

## Candidate verification status

Current focused Candidate evidence:

- `npm run verify:fail-closed` rejects all 22 bounded command-level gate faults;
- every negative result matches its intended fault fingerprint;
- setup, source sentinels, disposable Compose resources, volumes, and temporary files are subject to
  verified cleanup; and
- syntax, formatting, diff-whitespace, and residue checks pass for this Candidate slice.

A new full `npm run verify:ci` result is pending integration verification. This Candidate does not
reuse the duration or detailed counts of an earlier canonical run as evidence for the current tree.

## Known external limitation

The authenticated repository APIs for branch protection and repository rulesets both return:

> Upgrade to GitHub Pro or make this repository public to enable this feature.

Consequently, this work does not claim server-side required-check enforcement. Until repository protection is available, the enforced delivery procedure is: do not merge an AICO backend pull request unless the `verify` workflow is green and the parent/child acceptance evidence has been reconciled. This limitation remains explicit evidence on the parent issue rather than a silently waived control.
