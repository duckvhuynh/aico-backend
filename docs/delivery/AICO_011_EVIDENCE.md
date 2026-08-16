# AICO-011 Founder/Company/Initiative/Goal Domain Schema Evidence

**Parent issue:** `duckvhuynh/aicompanyos#11`  
**Backend issue:** `duckvhuynh/aico-backend#38`  
**Evidence date:** 2026-08-16  
**Canonical command:** `npm run verify:ci`

**Hosted PR SHA:** `c1b14efbe5dbda4324a5f533c777fc96c79d47bf`  
**Hosted `verify`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31943292640  
**Hosted `prove`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31943292648  
**Hosted `validate`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31943292649

This slice reuses the existing control-plane tables from
`src/infrastructure/database/migrations/1723435200000-InitialControlPlane.ts`.
It does not add a fourth migration or a 23rd frozen verification gate.

## Scope

- Persist founder, one company, immutable profile versions, one active Prototype
  Initiative, Goal Versions, reference IDs, and Context Snapshots.
- Deterministic factories create two isolated companies with current and prior
  profile/goal versions and no sensitive fixture data.
- Invalid tenant relations, duplicate versions, and a second active initiative
  fail transactionally with no leaked rows.

## Acceptance reconciliation

| ID             | Parent criterion                                                                                                                            | Evidence                                                                                                                                                                                                                                                          | Result |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A11-MIGRATE-01 | Migrations implement stable IDs, tenant relations, immutable version uniqueness, timestamps/statuses, and one-active-initiative constraint. | Existing initial migration plus `scripts/aico-011-domain-fixture.mjs` schema assertions inside the canonical `migrations` gate. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/31943292640                                              | Pass   |
| A11-FACTORY-01 | Factories create two isolated companies plus current/prior profile and goal versions without sensitive fixture data.                        | `test/aico-011-domain/company-goal.factory.ts`, `test/aico-011-domain/company-goal.factory.contract.spec.ts`, and SQL factory seed in `scripts/aico-011-domain-fixture.mjs`. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/31943292640 | Pass   |
| A11-TX-01      | Invalid tenant relation, duplicate version, or second active initiative fails transactionally.                                              | PL/pgSQL negative proofs in `scripts/aico-011-domain-fixture.mjs` assert SQLSTATE 23503/23505 and unchanged row counts. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/31943292640                                                      | Pass   |
| A11-SCOPE-01   | No AICO-012+ expansion.                                                                                                                     | Diff is factory, contract tests, migration-fixture proof, and this record. Auth/API/command modules are unchanged.                                                                                                                                                | Pass   |

## Non-goals kept

- Invite-only authentication (AICO-012)
- Company profile HTTP API and run snapshot semantics (AICO-013)
- Tenant enforcement harness (AICO-015)
- Initiative/goal command surface (AICO-016)
- Historical `aico-backend#1` remains partial evidence only
