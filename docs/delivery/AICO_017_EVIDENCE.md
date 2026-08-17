# AICO-017 Attachment Ingestion and Fail-Closed Validation Evidence

**Parent issue:** `duckvhuynh/aicompanyos#17`  
**Backend issue:** `duckvhuynh/aico-backend#48`  
**Evidence date:** 2026-08-17  
**Canonical command:** `npm run verify:ci`

**Hosted PR SHA:** _pending hosted verify/prove/validate_  
**Hosted `verify`:** _pending_  
**Hosted `prove`:** _pending_  
**Hosted `validate`:** _pending_

Founder attachments are validated against the AICO-008 allowlist before they
are stored or linked. Employee access uses frozen Goal Version references and
short-lived run-scoped retrieval rather than public or direct object-key paths.

## Scope

- `POST /attachments` checks declared and detected type, size, checksum,
  malware/safety class, parser limits, tenant key, and a safe display filename
  before insert/put. Rejected attempts are audited without body leakage.
- `POST /initiatives/{id}/goals` links only own-tenant CLEAN/READY/unexpired
  attachment ids. Unvalidated or foreign refs fail the whole command.
- `GET /runs/{id}` returns attachment metadata only. Bytes are served only from
  `GET /runs/{id}/attachments/{attachmentId}` after a company-scoped grant.

## Acceptance reconciliation

| ID              | Parent criterion                                                                                                                             | Evidence                                                                                       | Result |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------ |
| A17-VALIDATE-01 | Server verifies declared/detected type, size, malware/safety, checksum, tenant key, safe filename, and storage disposition before linking.   | `attachment-validator.ts`, ingest command, goal bind `FOR UPDATE`, unit and HTTP smoke.        | Pass   |
| A17-DENY-01     | Unsupported, oversized, suspicious, cross-tenant, expired, and executable-content attempts fail closed and are audited without body leakage. | Smoke 422 cases, foreign 404 harness, `attachment_rejected` events, retrieval deny-before-get. | Pass   |
| A17-RETRIEVE-01 | Employee access uses frozen context references and short-lived scoped retrieval, not public/direct execution paths.                          | Run-scoped GET, grant insert before store get, no signed URL, opaque `attachment` object keys. | Pass   |
| A17-BOUND-01    | No AICO-018 UI, no AICO-019 qualification records, no production AV product, no 23rd frozen verification gate.                               | Gates remain the frozen 22. No founder UI or qualification tables.                             | Pass   |

## Non-goals kept

- AICO-018 founder UI
- AICO-019 qualification status records
- Production antivirus product integration
- Public presigned object URLs
- A 23rd frozen verification gate
