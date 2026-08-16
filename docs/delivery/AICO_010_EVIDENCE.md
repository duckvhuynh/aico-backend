# AICO-010 Control Plane Bootstrap Evidence

**Parent issue:** `duckvhuynh/aicompanyos#10`  
**Backend issue:** `duckvhuynh/aico-backend#34`  
**Evidence date:** 2026-08-16  
**Canonical command:** `npm run verify:ci`

Draft PR https://github.com/duckvhuynh/aico-backend/pull/35 carries the parent/child
traceability body required by `scripts/check-pr-governance.mjs`.

## Scope

This slice reuses the existing NestJS API/worker/migrate skeleton, PostgreSQL, and MinIO fixture as
spike evidence. It closes only the remaining AICO-010 gaps: fail-closed configuration without secret
disclosure, liveness distinct from dependency readiness, documented encryption settings, and
fresh-environment migrate/object-fixture proof already owned by the canonical verifier.

It does not add AICO-011+ domain schema, invite-only authentication, an external provider, or a 23rd
frozen verification gate.

## Acceptance reconciliation

| Parent acceptance criterion                                                                                                       | Evidence                                                                                                                                                                                                                                                                                                                        | Result                  |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Fresh setup validates config, migrates isolated storage, runs tests/build, and exposes health separate from dependency readiness. | `assertConfiguration` runs before Nest listens. `GET /api/v1/health/live` performs no store I/O. `GET /api/v1/health/ready` fails when database, migrations, or object store are unavailable. `test/health.checks.spec.ts` and `test/smoke.mjs` cover the distinction. Isolated migrate/tests/build remain `npm run verify:ci`. | Pending hosted `verify` |
| Missing configuration fails safely without secret values; transport/storage encryption settings are documented for environments.  | `test/config.validation.spec.ts` proves missing/short secrets fail without echoing values. Deployed `APP_ENV` requires `DATABASE_SSL=true` and an `https` object endpoint. Settings: `docs/delivery/AICO_010_ENVIRONMENT_ENCRYPTION.md`.                                                                                        | Pending hosted `verify` |
| Initial migration/rollback and tenant-scoped object fixture pass CI.                                                              | Canonical gates 18 and 20 already apply/revert/reapply migrations and run tenant-keyed object put/head/get/checksum plus cross-tenant denial. This slice does not duplicate those gates.                                                                                                                                        | Pending hosted `verify` |

## Non-goals kept

- Historical `aico-backend#1` remains partial evidence only (DEC-003).
- ADR-004 stays `Proposed`.
- R0 is not claimed by this child alone.
