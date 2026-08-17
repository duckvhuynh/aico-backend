# AICO-018 Current Prototype Initiative Read Evidence

**Parent issue:** `duckvhuynh/aicompanyos#18`  
**Backend issue:** `duckvhuynh/aico-backend#50`  
**Evidence date:** 2026-08-17  
**Canonical command:** `npm run verify:ci`

**Hosted PR SHA:** pending  
**Hosted `verify`:** pending  
**Hosted `prove`:** pending  
**Hosted `validate`:** pending

Founders can resume the non-terminal Prototype Initiative after refresh or a
`409 active_initiative_exists` without inferring identity from the conflict body.

## Scope

- `GET /api/v1/initiatives/current` returns the company-scoped DRAFT/ACTIVE Prototype
  Initiative and its `row_version` ETag.
- Missing and foreign reads, including client tenant headers, use the same
  non-disclosing `404 resource_not_found`.
- No qualification-status records and no 23rd verification gate.

## Acceptance reconciliation

| ID           | Parent criterion                                                                | Evidence                                      | Result  |
| ------------ | ------------------------------------------------------------------------------- | --------------------------------------------- | ------- |
| A18-READ-01  | Authenticated founder can read their current non-terminal Prototype Initiative. | `InitiativesController.getCurrent`, smoke GET | Pending |
| A18-READ-02  | Missing/foreign reads match absent 404. No client tenant header authority.      | Smoke foreign GET with `x-company-id`         | Pending |
| A18-BOUND-01 | No qualification result persistence, no founder UI in this repo, no 23rd gate.  | Additive GET only                             | Pending |

## Non-goals kept

- AICO-019 qualification status records
- Founder UI (owned by `aico-web#3`)
- A 23rd frozen verification gate
