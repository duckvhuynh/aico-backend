# AICO-015 Tenant Scope and Isolation Harness Evidence

**Parent issue:** `duckvhuynh/aicompanyos#15`  
**Backend issue:** `duckvhuynh/aico-backend#44`  
**Evidence date:** 2026-08-17  
**Canonical command:** `npm run verify:ci`

**Hosted PR SHA:** `65620a432b0fd76f62df1465ff717c95a79c5216`  
**Hosted `verify`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31993472889  
**Hosted `prove`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31993472905  
**Hosted `validate`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31993472882

Company scope is derived from authenticated identity. Two-company
list/read/write/delete/object attempts return the same non-disclosing denial as
an absent resource and leave the owner graph unchanged.

## Scope

- Request and service access cannot authorize from a client tenant ID, header,
  or object key. Ordinary helpers require `CompanyScope`.
- HTTP smoke covers two-company list/read/write/delete. Object access denies
  before the adapter in `ObjectAccessService` and `scripts/storage-fixture.mjs`.
- The reusable protocol lives in `docs/delivery/TENANT_ISOLATION_HARNESS.md` and
  `test/isolation-harness.mjs`.

## Acceptance reconciliation

| ID             | Parent criterion                                                                                          | Evidence                                                                                                                                                                              | Result |
| -------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A15-SCOPE-01   | Request/service access cannot authorize from client tenant ID alone; no ordinary unscoped data helper.    | `CompanyScope`, JWT payload without `company_id`, DTO `forbidNonWhitelisted`, unscoped SQL scan. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/31993472889 | Pass   |
| A15-ISOLATE-01 | Two-company list/read/write/delete/object tests return non-disclosing denial with no foreign mutation.    | `test/smoke.mjs`, `test/object-access.spec.ts`, `scripts/storage-fixture.mjs`. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/31993472889                   | Pass   |
| A15-HARNESS-01 | Reusable isolation harness is documented for later artifact, model-context, preview, sandbox, and export. | `docs/delivery/TENANT_ISOLATION_HARNESS.md` and `test/isolation-harness.mjs`. Hosted `validate`: https://github.com/duckvhuynh/aico-backend/actions/runs/31993472882                  | Pass   |
| A15-BOUND-01   | No AICO-016+ expansion; no 23rd frozen verification gate.                                                 | No new initiative/goal commands, attachments, or UI. Gates remain the frozen 22. Hosted `prove`: https://github.com/duckvhuynh/aico-backend/actions/runs/31993472905                  | Pass   |

## Non-goals kept

- AICO-016 initiative/goal command redesign
- AICO-017 attachment ingestion
- AICO-018 founder UI
- PostgreSQL RLS, signed object URLs, preview/sandbox/export isolation
