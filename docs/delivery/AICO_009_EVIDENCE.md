# AICO-009 Verification Evidence

**Parent issue:** `duckvhuynh/aicompanyos#9`  
**Backend issues:** `duckvhuynh/aico-backend#4`, `duckvhuynh/aico-backend#31`
**Evidence date:** 2026-08-16
**Canonical command:** `npm run verify:ci`

## Acceptance reconciliation

| Parent acceptance criterion                                                                                               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Result |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| One documented foreground command matches required CI checks; no developer-managed server/background process is required. | `scripts/verify-ci.mjs` is called locally and by the single GitHub Actions `verify` job. It owns a uniquely named disposable Compose project and removes its containers/volumes in `finally`.                                                                                                                                                                                                                                                                                                       | Pass   |
| Pull requests block on lint/static/type, unit/contract, migration, and production-build failures.                         | The verifier exits non-zero on any gate and `npm run verify:fail-closed` probes all named gates. Public `aico-backend` ruleset [`20905145`](https://github.com/duckvhuynh/aico-backend/rules/20905145) requires `verify`, `prove`, and `validate` on `refs/heads/main` with `strict_required_status_checks_policy=true`, empty `bypass_actors`, and `current_user_can_bypass=never`. Deliberate-red [PR #33](https://github.com/duckvhuynh/aico-backend/pull/33) was `BLOCKED` and closed unmerged. | Pass   |
| Deterministic model/build/storage fixtures run without paid external calls and a deliberate failure proves each gate.     | Deterministic PM unit test, local Docker image build, tenant-scoped MinIO fixture, 22-gate command-level fail-closed harness, and HTTP smoke test all run without paid services.                                                                                                                                                                                                                                                                                                                    | Pass   |

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

## Candidate and Accepted-mode verification status

Current focused evidence:

- Candidate semantic SHA `12d5c86e2c70ccb4409b9a732ef9e143f05ec26c` remains Proposed in that commit;
- `npm run verify:fail-closed` rejects all 22 bounded command-level gate faults;
- every negative result matches its intended fault fingerprint;
- setup, source sentinels, disposable Compose resources, volumes, and temporary files are subject to
  verified cleanup;
- syntax, formatting, diff-whitespace, and residue checks pass for this Candidate slice;
- owner Architecture/AI and Product + Legal/Security comments bind that Candidate SHA;
- Accepted metadata SHA `281971f6f974d4d733f828128342cddcfecbf184` received hosted Backend CI
  `verify` success on pull_request run
  https://github.com/duckvhuynh/aico-backend/actions/runs/31931914921 with artifact
  `aico-005-provider-decision-281971f6f974d4d733f828128342cddcfecbf184` (`decision_status`
  `ACCEPTED_TRANSITION`, `self_digest`
  `sha256:fcf5cf8ed393fb9779185ea72e38163a0528caf5494a092009df743fe10ed57d`); and
- this reconciliation revision must receive a new hosted `verify` / `prove` / `validate` trio
  before PR #32 may merge.

This file does not reuse duration or detailed counts of an earlier canonical run as evidence for a
later SHA.

## Repository required-check enforcement

DEC-005 is resolved on public `duckvhuynh/aico-backend`. Active ruleset
[`20905145`](https://github.com/duckvhuynh/aico-backend/rules/20905145) (`AICO-009 required
verification`) applies to `refs/heads/main` and requires exactly `verify`, `prove`, and `validate`.
Job names match: Backend CI → `verify`; AICO-005 Provider Runtime Proof → `prove`; AICO-008 Alpha
Operating Policy → `validate`. The ruleset also enforces `deletion` and `non_fast_forward`.

Deliberate-red [PR #33](https://github.com/duckvhuynh/aico-backend/pull/33) added an extra JSON
property `deliberate_red` to `docs/policies/alpha-operating-policy-v1.json`. `validate` failed
closed. `gh pr merge` was rejected with "the base branch policy prohibits the merge"
(`mergeStateStatus=BLOCKED` while git-mergeable). The PR was closed unmerged and the branch
deleted. Proof comment:
https://github.com/duckvhuynh/aico-backend/pull/33#issuecomment-5306163894

Honesty bound: PR #33 `verify` and `prove` also failed closed on PR-body governance wording, not
only the policy mutation. The merge-block proof is valid; this file does not claim those two jobs
isolated the AICO-008 policy fault.

Canonical local/CI command remains `npm run verify:ci` (foreground; disposable Compose; no
long-lived server).

## Residual risks

The following remain visible and are not silently waived:

- required-check contexts are unbound (`integration_id` is absent);
- workflow-path protection is not configured;
- `validate` coverage is not identical to `verify` coverage;
- a repository owner can later weaken or delete the ruleset.
