# Contributing to the AI Company OS Backend

Backend delivery is governed by the parent `duckvhuynh/aicompanyos` product and delivery baseline. This repository implements that plan; it does not create a parallel roadmap.

## Source-of-truth order

Use these sources in order when resolving scope or acceptance questions:

1. [`MVP_SCOPE.md`](https://github.com/duckvhuynh/aicompanyos/blob/main/docs/product/MVP_SCOPE.md) defines the MVP boundary and exclusions.
2. [`PRD.md`](https://github.com/duckvhuynh/aicompanyos/blob/main/docs/product/PRD.md) defines product behavior and launch gates.
3. [`SRS.md`](https://github.com/duckvhuynh/aicompanyos/blob/main/docs/product/SRS.md) defines system requirements and verification obligations.
4. [`BACKLOG.md`](https://github.com/duckvhuynh/aicompanyos/blob/main/docs/delivery/BACKLOG.md), the [sprint plan](https://github.com/duckvhuynh/aicompanyos/blob/main/docs/delivery/SPRINT_PLAN.md), and [roadmap](https://github.com/duckvhuynh/aicompanyos/blob/main/docs/delivery/ROADMAP.md) define authorized sequencing.
5. [GitHub Project 2](https://github.com/users/duckvhuynh/projects/2) and its issues are the live execution record.
6. This repository's ADRs and contracts refine implementation details without widening the parent scope.

When sources conflict, stop implementation and reconcile the higher-authority source first. Do not silently reinterpret an MVP exclusion or acceptance criterion.

## Before starting a change

Every feature, refactor, schema change, dependency upgrade, or operational change must have:

- one parent `aicompanyos` issue that exists in the delivery backlog and GitHub Project;
- relevant PRD, SRS, AICO, or backend architecture/contract identifiers;
- acceptance criteria that can be demonstrated;
- dependencies and sprint/release-gate placement already represented by the parent plan.

If the work is not planned, update and approve the parent plan and issue before writing implementation code. Incidental bug fixes may use a backend issue, but still reference the parent quality, security, or operations issue that authorizes the work.

## Branches, commits, and pull requests

- Prefer branches such as `agent/aico-009-ci-governance` or `feat/aico-022-task-leases`.
- Include `Refs duckvhuynh/aicompanyos#<number>` in commit messages.
- Use cross-repository `Closes` only when that commit fully satisfies the parent issue's acceptance criteria. Otherwise use `Refs`.
- Close a local backend issue when it is the implementation record for the change.
- Complete every section of the pull request template. CI validates the parent issue, product or architecture references, acceptance evidence, and MVP scope check.
- Keep migrations forward-only and include rollback or reconciliation notes for externally visible side effects.

## Definition of done

A backend change is done only when:

- the implementation stays within the cited parent issue and MVP scope;
- requirement and architecture references are recorded in the PR;
- relevant unit, integration, migration, and Docker smoke checks pass;
- security, tenant isolation, policy, observability, and replay implications are addressed where applicable;
- documentation and contracts change with behavior;
- GitHub Project status reflects the actual delivery state.

Do not mark an issue Done merely because code was written. The cited acceptance evidence must be available in the PR or linked CI run.
