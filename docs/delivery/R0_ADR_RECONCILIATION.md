# R0 ADR-001 / ADR-004 Reconciliation

**Parent gate:** `duckvhuynh/aicompanyos#95`  
**Backend issue:** `duckvhuynh/aico-backend#36`  
**Evidence date:** 2026-08-16  
**Canonical command:** `npm run verify:ci`

## Decision

ADR-001 and ADR-004 were written as `Proposed` umbrella records while Sprint 0 selected
the same architecture through later accepted ADRs and parent issues. R0 forbids a
relevant ADR remaining merely `Proposed`. This slice reconciles status without changing
runtime behavior, the 22-gate freeze list, or AICO-011+ product scope.

| ADR     | R0 status                                                                      | Boundary                                                                                          |
| ------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| ADR-001 | Accepted as MVP control-plane decomposition                                    | No identity-provider, production-sandbox-vendor, preview-CDN, or final retention/economic choice. |
| ADR-004 | Accepted for local/CI process topology (`api` / `worker` / `migrate`, Compose) | Production topology remains a target pattern; no vendor, region, or credential is provisioned.    |

Downstream accepted records remain authoritative for their TD:

| TD     | Accepted record | Parent        |
| ------ | --------------- | ------------- |
| TD-001 | ADR-006         | AICO-002 `#2` |
| TD-002 | ADR-007         | AICO-003 `#3` |
| TD-003 | ADR-009         | AICO-004 `#4` |
| TD-004 | ADR-009         | AICO-004 `#4` |
| TD-005 | ADR-011         | AICO-005 `#5` |
| TD-006 | ADR-006/007     | AICO-002/003  |
| TD-007 | ADR-008         | AICO-006 `#6` |
| TD-008 | ADR-010         | AICO-007 `#7` |
| TD-009 | ADR-007         | AICO-003 `#3` |
| TD-010 | AICO-008 policy | AICO-008 `#8` |

## Non-goals kept

- Historical `aico-backend#1` remains partial evidence only (DEC-003).
- No 23rd frozen verification gate.
- No AICO-011+ schema or invite-only authentication.
- No production environment is claimed.
