# AICO-016 Prototype Initiative and Goal Version Evidence

**Parent issue:** `duckvhuynh/aicompanyos#16`  
**Backend issue:** `duckvhuynh/aico-backend#46`  
**Evidence date:** 2026-08-17  
**Canonical command:** `npm run verify:ci`

**Hosted PR SHA:** `a861cfeff485509ccfbca606b16c892a9a46f342`  
**Hosted `verify`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31999520441  
**Hosted `prove`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31999520496  
**Hosted `validate`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31999520412

One company may have one non-terminal Prototype Initiative. Goal submissions
create immutable founder-authored versions; later changes insert a new version
and freeze it into a new run context.

## Scope

- Structured goal schema: target user, problem, desired outcome, primary flow,
  must-haves, non-goals, visual direction, constraints, and reference IDs.
- `POST /initiatives` enforces one-active and idempotency. `POST /initiatives/{id}/goals`
  requires `If-Match` and `Idempotency-Key`, rejects unknown/over-length fields,
  and does not silently narrow out-of-scope goals.
- `GET /runs/{id}` returns the frozen Goal Version from the run's context snapshot.

## Acceptance reconciliation

| ID               | Parent criterion                                                                                                                           | Evidence                                                                                                                                                                                    | Result |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A16-SCHEMA-01    | Goal schema captures target user, problem, outcome, primary flow, must-haves, non-goals, visual direction, constraints, and reference IDs. | `CreateGoalDto`, `canonicalStructuredGoal`, DTO contract tests, smoke round-trip on `GET /runs`. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/31999520441       | Pass   |
| A16-TX-01        | One-company/one-active, required limits, expected version, ownership, and idempotency are transactional.                                   | Smoke 409 second initiative, 412 If-Match, 409 key reuse, replay, 015 foreign goal write. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/31999520441              | Pass   |
| A16-IMMUTABLE-01 | Submitted version is never edited/silently truncated; changes create a new founder-authored version.                                       | Over-length/unknown-field 400, 422 `goal_out_of_scope`, v1 frozen after v2, no `UPDATE goal_versions`. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/31999520441 | Pass   |
| A16-BOUND-01     | No AICO-017+ attachment/UI/qualification-status expansion; no 23rd frozen verification gate.                                               | Attachments still rejected by `GoalScopePolicy`. Gates remain the frozen 22. Hosted `prove`: https://github.com/duckvhuynh/aico-backend/actions/runs/31999520496                            | Pass   |

## Non-goals kept

- AICO-017 attachment ingestion
- AICO-018 founder UI
- AICO-019 qualification status records
- A 23rd frozen verification gate
