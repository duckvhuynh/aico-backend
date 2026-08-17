# AICO-019 Qualification and Explicit Narrowing Evidence

**Parent issue:** `duckvhuynh/aicompanyos#19`  
**Backend issue:** `duckvhuynh/aico-backend#52`  
**Evidence date:** 2026-08-17  
**Canonical command:** `npm run verify:ci`

**Hosted PR SHA:** `be5f71335252ad33043bf7484c1d759056ce7e15`  
**Hosted `verify`:** https://github.com/duckvhuynh/aico-backend/actions/runs/32044023770  
**Hosted `prove`:** https://github.com/duckvhuynh/aico-backend/actions/runs/32044023766  
**Hosted `validate`:** https://github.com/duckvhuynh/aico-backend/actions/runs/32044023727

Founder-authored goals are qualified against the accepted AICO-008 policy before
build dispatch. Out-of-scope results include a narrowing proposal and never
mutate the submitted goal.

## Scope

- Deterministic evaluator enforces one persona, one flow, five screens,
  client-only React/mock data, and the denied-capability registry.
- `qualified` and `needs_clarification` persist on `goal_qualifications` and
  appear on POST goals and GET `/runs/{id}`.
- Out-of-scope returns `422 goal_out_of_scope` with machine reason codes, a
  founder explanation, and a proposal. Build work is not dispatched.
- Missing target user persists at most five clarification questions and does
  not create a product-brief task.
- No AICO-020 analytics events, no AICO-036 answer UI, and no 23rd gate.

## Acceptance reconciliation

| ID             | Parent criterion                                                                                                                  | Evidence                                                                                                                                                        | Result |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A19-RULE-01    | Deterministic rules enforce one persona/flow, ≤5 screens, client-only/mock data, and excluded capabilities before build.          | `evaluateGoalQualification`, `GoalScopePolicy`, smoke payment/backend 422. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/32044023770 | Pass   |
| A19-RESULT-01  | Each result includes machine reason codes and a founder explanation; out-of-scope includes a proposal and never mutates the goal. | Policy copy contract, 422 qualification object, GET run `qualification`. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/32044023770   | Pass   |
| A19-FIXTURE-01 | Fixtures cover backend/payment/deployment/multiple-flow/six-screen/sensitive-data/missing-target-user and valid boundaries.       | `test/goal-qualification.spec.ts` and HTTP smoke. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/32044023770                          | Pass   |

## Non-goals kept

- AICO-020 privacy-safe analytics events
- AICO-036/037 clarification task and founder-answer UI
- A 23rd frozen verification gate
