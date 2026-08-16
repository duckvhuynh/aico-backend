# AICO-010 Environment Encryption Settings

**Parent:** `duckvhuynh/aicompanyos#10`  
**Child:** `duckvhuynh/aico-backend#34`  
**Evidence date:** 2026-08-16  
**Status:** Documented startup settings; this file does not claim production is provisioned

This record satisfies AICO-010's requirement that transport and storage encryption settings are
documented for environments. It does not accept ADR-004, provision managed keys, or complete
SRS-NFR-008 restore drills.

## Settings by environment

| Setting                   | `local` / `test` / CI                                | `staging` / `production`                                                      |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_SSL`            | `false`; PostgreSQL stays on the Compose network     | `true`; startup fails closed otherwise                                        |
| `OBJECT_STORAGE_ENDPOINT` | `http://` MinIO/fixture endpoint                     | `https://` required; startup fails closed otherwise                           |
| Database at rest          | Disposable local volume; not a production claim      | Platform-managed encrypted volume/key controls                                |
| Object storage at rest    | Local MinIO volume; not a production claim           | Private bucket with platform-managed server-side encryption                   |
| Application TLS           | Loopback HTTP for the control API                    | TLS at the edge; service-to-service identity/mTLS is a later operations issue |
| Secret delivery           | Ignored `.env` copied from `.env.example` names only | Platform secret manager; values never logged                                  |

Startup validation is `assertConfiguration` in `src/config/validation.ts`. Missing keys are named.
`JWT_SECRET`, object-store keys, and database-url passwords are redacted from the diagnostic text.

Worker liveness remains a process heartbeat with durable leases as ownership authority. The worker
does not expose HTTP `/health/*` in this slice.

## Non-claims

- No production credential, region, or key identifier is selected here.
- Backup encryption, PITR, and restore evidence remain AICO-078 / SRS-NFR-008.
- Tenant isolation tests remain AICO-003/AICO-015; this file only documents transport/storage
  encryption settings used by the control-plane bootstrap.
