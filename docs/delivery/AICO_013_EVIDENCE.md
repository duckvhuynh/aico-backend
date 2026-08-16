# AICO-013 Versioned Company Profile and Run Snapshot Evidence

**Parent issue:** `duckvhuynh/aicompanyos#13`  
**Backend issue:** `duckvhuynh/aico-backend#42`  
**Evidence date:** 2026-08-16  
**Canonical command:** `npm run verify:ci`

**Hosted PR SHA:** `6f5848d78c9c833d377edd4bd706d6f13313479e`  
**Hosted `verify`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31952323518  
**Hosted `prove`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31952323558  
**Hosted `validate`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31952323448

Create and update keep one company profile as immutable versions. An active run
keeps the exact profile frozen in its context snapshot.

## Scope

- Create/update validate name, purpose, target customer, durable constraints,
  normalized limits, and sensitive-data warning acknowledgement.
- `PATCH /companies/current/profile` requires `If-Match`, inserts an immutable
  version, and atomically advances `companies.current_profile_version_id`.
- `GET /runs/{id}` returns the frozen profile from the run's context snapshot.
- Later profile edits apply only to a new explicit run/context.

## Acceptance reconciliation

| ID              | Parent criterion                                                                                                     | Evidence                                                                                                                                                                                              | Result |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A13-VALIDATE-01 | Create/update validates name, purpose, target customer, durable constraints, normalized limits, and acknowledgement. | DTO contract tests, `CompanyProfilePolicy`, and smoke create/update negatives in `test/smoke.mjs`. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/31952323518               | Pass   |
| A13-VERSION-01  | Update uses expected version, creates immutable version, and atomically advances the current pointer.                | Missing/stale `If-Match` return `412`; successful PATCH returns version 2. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/31952323518                                       | Pass   |
| A13-SNAPSHOT-01 | An active run retains its frozen profile; later changes apply only to a new explicit run/context.                    | Smoke asserts run 1 frozen profile after PATCH, then a second `start_run` snapshot uses the new current profile. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/31952323518 | Pass   |
| A13-SCOPE-01    | No AICO-014+ expansion.                                                                                              | No UI, tenant harness, or new initiative/goal commands. No 23rd gate.                                                                                                                                 | Pass   |

## Non-goals kept

- AICO-014 founder UI
- AICO-015 tenant-enforcement harness
- AICO-016 new initiative/goal command surface
- Qualification, attachments, production IdP, and email
