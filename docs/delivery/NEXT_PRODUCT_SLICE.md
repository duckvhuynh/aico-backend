# Next Product Slice: Close the Backend Quality and CI Baseline

**Status:** Recommended  
**Owner:** Product + Backend/DevEx  
**Last updated:** 2026-08-12  
**Confidence:** 95%  
**Time horizon:** Immediate R0 iteration  
**Founder-facing behavior:** None; hold new feature work until this foundation gate is accepted

## 1. Recommendation

Complete **AICO-009 — Establish repository quality and CI baseline** as the smallest dependency-unblocked backend slice.

> Give the delivery team one reproducible, zero-paid-dependency verification path that blocks integration when formatting/static analysis, types, unit/contracts, migrations, deterministic fixtures, or the production build fail.

AICO-009 has no declared parent dependency. It is the next valid backend iteration even though the current code already contains substantial CI and smoke-test evidence: the issue remains `Open` / `Inbox`, and its full acceptance criteria have not been reconciled. The work should close only the remaining gaps and prove the gates; it must not add founder workflow behavior.

The next founder-facing candidate is a Product Brief read/pending-decision projection under AICO-034, but only after R0 and the explicit AICO-023/AICO-024/AICO-025 prerequisites are formally complete. It is not authorized by this slice.

## 2. Parent issue and requirement IDs

### Chosen parent

- **AICO-009:** `duckvhuynh/aicompanyos#9` — Establish repository quality and CI baseline  
  <https://github.com/duckvhuynh/aicompanyos/issues/9>
- Goal: `G-04` — Operate reliably without human operators.
- Epic/sprint/gate: `E0` / `S0` / `R0`.
- Priority/size/area: `P0` / `3` / `DevEx`.
- Declared dependencies: none.

### Product and system requirements

- SRS verification strategy section 12.1: schema/contract, unit, integration, end-to-end, deterministic evaluation fixtures, security, resilience, accessibility/browser, and operational evidence layers.
- `SRS-NFR-023`: migrations preserve readable historical runs and exact approval/artifact lineage.
- `SRS-NFR-024`: version targeting and kill/rollback do not mutate historical runs.
- R0 quality criterion: CI runs lint/static checks, unit/contract tests, production build, and migration checks; external provider/build fixtures are deterministic.
- Supporting product guardrails: approval integrity, tenant isolation, no fabricated success, bounded execution, immutable history, and no MVP scope expansion.

This slice establishes the verification baseline for those requirements. It does not claim to complete later migration/rollout drills owned by AICO-078/AICO-079/AICO-089.

### Live state observed on 2026-08-12

- Parent AICO-009 is `Open` / `Inbox` in GitHub Project 2.
- Backend issue `duckvhuynh/aico-backend#2`, which references AICO-009, is `Open` / `In review` with linked PR 3.
- The repository has exact dependency pins, `npm ci`, formatting/lint/unit/build checks, Docker Compose smoke, migrations, deterministic PM fixture, dependency audit, and traceability validation.
- Two recent pull-request CI runs succeeded; an earlier push run failed, demonstrating that workflow checks execute, but not yet proving every required gate independently fails closed.
- The current documented `npm run verify` covers format check, lint, unit tests, and production build, but it does not match all CI jobs: migration/Docker smoke, dependency audit, Compose validation, and governance run separately.
- Read-only branch-protection inspection returned HTTP 403: the private repository requires GitHub Pro or public visibility for that protection API. Therefore automated “PRs block on required checks” is not yet verified and is an explicit acceptance blocker, not an assumed pass.

This plan makes no GitHub mutation.

## 3. User and business outcome

### Problem

The backend can reach `AWAITING_BRIEF_APPROVAL`, but the repository does not yet have one documented local command that reproduces every required CI gate. More importantly, successful workflow runs do not by themselves prove that pull requests are unable to merge when a required check fails. Continuing product work before closing this gap increases the risk of schema, governance, and build regressions entering every later governed stage.

### Outcome

An engineer can run one foreground command from a clean checkout and receive the same pass/fail result as required CI without paid model, storage, or build services. Reviewers can see which gate failed, reproduce it locally, and confirm that pull requests cannot integrate while any required gate is red.

This is product-complete as a foundation outcome: it protects all subsequent founder value from unverifiable or non-reproducible backend changes. It intentionally delivers no new founder feature.

### Iteration success signal

A clean-checkout verification succeeds; an isolated deliberate failure of every required gate makes both local verification and CI fail at that gate; the pull request cannot merge while any required status is failing; and the full path uses deterministic, zero-cost fixtures.

## 4. In scope

### 4.1 One canonical verification entry point

- Provide one documented foreground command, such as `npm run verify:ci`, that orchestrates all required checks and exits with a single non-zero status on any failure.
- The developer must not manually start or manage an API, worker, database, object store, or cleanup process in another terminal.
- The command must run from a fresh checkout with documented Node/npm and Docker prerequisites, use the lockfile, own its temporary resources, and clean them up on success or failure.
- Local and CI implementations must share the same scripts/check manifest so their gate definitions cannot silently drift.

### 4.2 Required blocking gates

- Dependency installation from the committed lockfile with exact supported runtime versions.
- Formatting check.
- ESLint/static analysis with zero warnings.
- TypeScript type check. If the production build supplies this gate, document and prove that relationship; otherwise add an explicit type-check step.
- Unit and contract tests.
- Migration test against isolated empty storage, including applying all committed migrations and validating rollback/forward behavior appropriate to the current schema baseline.
- Production build for API and worker entry points.
- Dependency audit at the approved severity threshold.
- Docker Compose configuration validation and deterministic environment health/smoke test.
- Repository governance/traceability validation for pull requests.

### 4.3 Deterministic fixtures

- Model fixtures must use the local deterministic provider and make no paid or public network call.
- Storage/migration fixtures must use isolated disposable local containers or equivalent test doubles with no shared developer/tenant data.
- Build/config fixtures must be version-pinned and repeatable.
- Fixtures must have bounded timeouts and safe cleanup; a hang or unavailable dependency fails accurately rather than passing or waiting indefinitely.

### 4.4 Fail-closed proof

- Add or document a safe test method that deliberately causes each gate to fail independently and proves the canonical command returns non-zero at the correct gate.
- Demonstrate at minimum formatting, lint/static, type/build, unit/contract, migration, deterministic smoke/storage, dependency/configuration, and governance failures.
- Restore the fixture after each deliberate failure; no broken test artifact is committed as a workaround.
- Record evidence in the implementation PR/issue so completion is reproducible rather than asserted.

### 4.5 Pull-request enforcement

- Configure the supported repository mechanism so all required CI statuses block integration into `main`.
- If the current private-repository plan cannot provide enforceable required checks, Product/Delivery must choose one of: upgrade the GitHub plan, make the repository public after an explicit security review, or adopt another technically enforceable protected integration path.
- A written “do not merge” policy is useful but does not satisfy the automated blocking acceptance criterion.
- The enforcement decision must be resolved before AICO-009 is marked done.

## 5. Out of scope

- Product Brief read APIs, pending-decision projections, founder approvals, Designer tasks, artifact revisions, build/preview, QA, export, or analytics features.
- Closing or claiming completion of AICO-010 or later foundation/runtime issues because their code partially exists.
- Paid external model calls, hosted object storage, external build farms, or production credentials in tests.
- Full historical restore, production rollout/kill, model/template rollback, and operational drills assigned to later AICO issues.
- UI accessibility/browser matrices or generated preview viewport tests.
- Changing the MVP value unit, employee team, three approval gates, five-screen/one-flow limit, or client-only mock/local-data boundary.
- Mutating GitHub issues, Project fields, PRs, repository visibility, plan/billing, or branch/ruleset settings as part of this product-plan document.

## 6. Acceptance criteria

### AC-01 — One foreground command matches CI

Given a fresh checkout with documented prerequisites, one command runs every required gate without the developer manually starting another process. The same shared scripts or check manifest are invoked by CI, and both paths return the same pass/fail outcome for the same revision.

### AC-02 — Runtime and dependencies are reproducible

Node/npm versions and package dependencies are pinned or bounded according to the approved support policy; CI installs from the lockfile without rewriting it; an unexpected lockfile or runtime mismatch fails with a clear reason.

### AC-03 — Static and build failures block

Formatting, lint/static, type, and production-build failures each return non-zero locally and produce a failing required CI status. Warnings cannot silently pass a zero-warning gate.

### AC-04 — Unit and contract failures block

All unit/contract tests run deterministically and fail the canonical command/CI when one assertion is deliberately broken. No test requires a paid service, public internet, or manually running server.

### AC-05 — Migrations are verified in isolation

CI applies every migration to an isolated empty database and verifies the current rollback/forward contract without `synchronize` or manual repair. Failure, incompatible history, or schema drift fails closed and preserves diagnostic evidence without secrets.

### AC-06 — Deterministic environment smoke is reproducible

The API, worker, database, and local object-store fixture start under orchestration, become healthy within bounded time, run the deterministic smoke path, and clean up on success or failure. The test makes no paid provider call and uses no persistent developer data.

### AC-07 — Governance failures block pull requests

A pull request missing the required parent `duckvhuynh/aicompanyos#N` reference or required traceability/evidence/scope sections fails the governance status. The failure cannot be bypassed by changing unrelated prose or by a push-only path.

### AC-08 — Every gate has deliberate failure evidence

The implementation record links one safe deliberate-failure result for each required gate. Evidence identifies the failing revision/gate and proves the overall check was non-zero; a generic failed workflow is insufficient.

### AC-09 — Pull requests cannot integrate while red

Repository enforcement requires all named statuses for `main`. A test pull request with one deliberately failing required check cannot merge. The read-only GitHub-plan limitation is resolved through an explicitly approved enforceable mechanism before this criterion passes.

### AC-10 — No false product or release claim

AICO-009 completion is recorded only after AC-01–AC-09 pass. It means the repository quality baseline is trustworthy; it does not mean R0, the PM vertical slice's parent issues, R1/R2/R3, or private alpha are complete.

## 7. Edge cases

| Edge case                                                      | Required behavior                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Local command passes while a CI-only check fails               | Treat as command/CI drift and fail AICO-009 acceptance.                                                                         |
| CI passes because a job was skipped by event/path condition    | Required status remains non-successful or enforcement rejects integration; skipped cannot masquerade as pass.                   |
| Docker service becomes healthy but migration/smoke later fails | Overall command fails and cleanup still runs.                                                                                   |
| Cleanup receives cancellation or test failure                  | Only resources created for this verification run are removed; shared developer data is untouched.                               |
| Migration passes only on an already-migrated database          | Empty-database test exposes the failure; cached/shared state is prohibited.                                                     |
| Worker/model fixture tries a public or paid provider           | Deny/fail before invocation; deterministic adapter is mandatory.                                                                |
| Dependency audit service/network is unavailable                | Report an accurate infrastructure failure; do not fabricate a clean audit. Define retry policy separately from a security pass. |
| One test hangs                                                 | Bounded job/step timeout fails with actionable diagnostics and cleanup.                                                         |
| Deliberate failure contaminates a later gate                   | Use isolated reversible fixtures; prove each gate independently.                                                                |
| Branch-protection API remains unavailable on the current plan  | AC-09 stays blocked; manual convention is not accepted as automated enforcement.                                                |
| A pull request comes from a fork or automation actor           | Required statuses and least-privilege permissions still apply; secrets are not exposed to untrusted workflows.                  |
| Concurrent CI runs share resource names                        | Use run-scoped projects/volumes/ports or isolation so results cannot affect each other.                                         |

## 8. Analytics and evaluation implications

### Analytics

- No product funnel, approval, run, cost, or founder event changes in this slice.
- CI duration, pass/fail, flake rate, and gate failure class are delivery-health measures, not product metrics and must not be counted toward M-01–M-10.
- Test logs and artifacts must exclude prompts, completions, artifact bodies, credentials, authorization headers, signed URLs, and tenant content.
- Run/task/actor IDs must not become metric labels; synthetic fixture identifiers stay clearly classified.

### Evaluation

- The canonical verification path becomes the minimum evidence producer for later backend slices.
- Deterministic model/storage/build fixtures prove reproducibility and control behavior, not real-provider output quality or alpha readiness.
- Deliberate-failure tests evaluate the gates themselves: a passing test suite is insufficient if the suite cannot detect a known fault.
- Migration evidence under this slice establishes a baseline only; historical lineage, restore, rollout, kill, and rollback remain later verification obligations.
- Future PRs must link the exact checks relevant to their requirements rather than citing AICO-009 as blanket product correctness.

## 9. Deferred alternatives and why they are not next

| Alternative                                        | Parent issue(s)   | Decision                                            | Why not next                                                                                                                                                         |
| -------------------------------------------------- | ----------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product-to-delivery traceability baseline          | AICO-001          | Product/Delivery workstream, not this backend slice | Also dependency-free and still Open/Inbox. It should be closed by its accountable cross-functional owners; AICO-009 must not claim it.                               |
| Expand control-plane foundation                    | AICO-010          | Defer                                               | Explicitly depends on AICO-002, AICO-003, and AICO-009.                                                                                                              |
| Add more PM/runtime behavior                       | AICO-022–AICO-033 | Defer                                               | The authoritative architecture, tenant, policy, runtime, and budget dependency chain remains open. Existing code is partial evidence, not permission to skip status. |
| Product Brief read/pending-decision projection     | AICO-034          | Conditional post-R0 candidate                       | Explicit dependencies AICO-023, AICO-024, and AICO-025 remain `Open` / `Inbox`; implement only after they and the applicable release gates are formally complete.    |
| Exact-version GATE-01 approval                     | AICO-041          | Defer                                               | Depends on AICO-006, AICO-031, and AICO-039. None is formally complete.                                                                                              |
| Designer handoff                                   | AICO-043–AICO-044 | Defer                                               | Depends on the structured runtime, Product Brief validation, and exact approval service. Starting it now would bypass the core product guardrail.                    |
| Secure build/preview                               | AICO-047–AICO-058 | Reject as next                                      | Requires approved Design input plus sandbox/template/preview decisions and R3.                                                                                       |
| Broaden MVP scope to find independent feature work | None              | Reject                                              | It would widen Product v0.1 and hide the dependency problem rather than solve it.                                                                                    |

## 10. Exit and next decision

This slice exits when AC-01–AC-10 have linked, reproducible evidence and AICO-009 can be accepted without qualification. The GitHub enforcement blocker must be resolved; “CI runs” is not equivalent to “CI blocks integration.”

After exit:

1. Continue the remaining R0 issues in their declared dependency order and reconcile existing backend evidence criterion by criterion.
2. Do not select a new founder-facing backend slice until its parent dependencies and release gate are formally satisfied.
3. Treat the Product Brief read projection under AICO-034 as a conditional future candidate only after AICO-023/AICO-024/AICO-025 and the applicable R0–R2 prerequisites are done.

The current `AWAITING_BRIEF_APPROVAL` smoke result remains valuable evidence. It is not authority to bypass the Project dependency graph.
