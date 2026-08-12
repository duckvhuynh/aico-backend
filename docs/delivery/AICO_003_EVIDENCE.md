# AICO-003 Tenant, Object Storage, and Retention Evidence

## Scope and authority

- Parent: [aicompanyos#3](https://github.com/duckvhuynh/aicompanyos/issues/3)
- Backend child: [aico-backend#10](https://github.com/duckvhuynh/aico-backend/issues/10)
- Product authority: SRS TD-002, SRS TD-006, SRS TD-009; SRS-FR-092; SRS-NFR-008-010 and SRS-NFR-013-016
- Delivery authority: Goal G-05, Epic E0, Sprint S0, Release Gate R0
- Open decision: DEC-013 and PRD-OQ-004 retain final per-type durations as a Product/Security decision due before external alpha on 2026-11-20.

This package selects architecture and release-blocking proof obligations. It does not ship a public object API, preview, export, backup service, company deletion flow, or final retention-duration policy.

## Parent acceptance map

| Parent acceptance criterion                                                                           | Binding evidence                                                    | Completion rule                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant key and authorization at every storage/retrieval boundary with non-disclosing denial           | ADR-007, `TENANT_DATA_BOUNDARIES.md`, A3-BOUNDARY-01, A3-DENY-01    | Every named boundary has a trusted tenant source, authorization point, ownership rule, denial contract, and audit/redaction behavior.            |
| Object key, signed access, encryption, checksum, retention/expiry/deletion, backup, and security hold | ADR-007, `TENANT_DATA_BOUNDARIES.md`, A3-OBJECT-01, A3-RETENTION-01 | The mechanism is selected without inventing DEC-013 duration values; lifecycle, failure, rollback, and later implementation owners are explicit. |
| Cross-row/object/model/preview/export threat plan and non-waivable launch checks                      | `AICO_003_THREAT_TEST_PLAN.md`, A3-THREAT-01                        | Stable adversarial cases identify expected zero-side-effect denials, evidence, owner, gate, and implementing AICO issue.                         |

## Evidence inventory

| Evidence ID     | Evidence or command                                                         | Current authority and expected result                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A3-ADR-01       | `docs/architecture/007-tenant-object-retention-selection.md`                | Compares viable approaches, selects the MVP boundary, reconciles existing ADR authority, and remains Proposed until an identifiable Architecture/Product/Security owner accepts it. |
| A3-BOUNDARY-01  | `docs/contracts/TENANT_DATA_BOUNDARIES.md`                                  | Normative matrix covers relational rows, objects, attachments, model context, sandbox, preview, export, logs, backups, deletion, and holds.                                         |
| A3-OBJECT-01    | ADR-007 and tenant-data contract                                            | Server-generated opaque tenant keys, immutable ownership metadata, checksums, encryption, signed-access constraints, expiry/revocation, lifecycle, and reconciliation are binding.  |
| A3-DENY-01      | Tenant-data contract and threat cases A3-T-ROW through A3-T-REPLAY          | Unknown/cross-tenant access is non-disclosing and creates no content disclosure, signed URL, mutation, provider/tool call, continuation, or cost effect.                            |
| A3-RETENTION-01 | ADR-007 retention, deletion, hold, backup, migration, and rollback sections | Versioned per-type policy mechanism is selected; final durations remain open; deletion and restore limitations fail closed.                                                         |
| A3-THREAT-01    | `docs/delivery/AICO_003_THREAT_TEST_PLAN.md`                                | Release-blocking negative matrix distinguishes executable evidence from later planned tests and prohibits waivers for tenant isolation.                                             |
| A3-AEO-01-12    | `docs/delivery/AICO_003_AEO_AUDIT.md`                                       | Privacy-safe causal evidence, low-cardinality telemetry, safe replay, signed-access containment, restore/deletion/hold truth, and evidence-derived readiness remain binding.        |
| A3-TRACE-01     | This file and `node scripts/validate-aico-003-architecture.mjs`             | Every child/parent criterion and cited requirement has an evidence artifact or an explicit later owner; required content fails closed.                                              |
| A3-VERIFY-01    | `npm run verify:ci`                                                         | The canonical foreground verifier must pass on the exact reviewed revision with deterministic local services and no paid provider calls.                                            |

## Reusable implementation evidence

The following repository state is useful evidence, but none of it independently completes AICO-003:

- Authenticated request context resolves the founder and company from server-side identity state rather than accepting a tenant header as authority.
- Tenant-owned database relations repeat `company_id`, expose composite uniqueness, and use composite tenant foreign keys on core run, task, event, artifact, and durability records.
- Tenant-scoped API reads return non-disclosing `resource_not_found` behavior for a foreign company in the deterministic HTTP smoke fixture.
- The local MinIO fixture writes a tenant-prefixed object with tenant metadata and a SHA-256 checksum, reads it back, and rejects a mismatched tenant through a fixture-local guard.
- ADR-003 documents intended repository scoping, proposed PostgreSQL row-level-security defense in depth, and an object-store port.
- ADR-004 documents intended object encryption, lifecycle, isolated preview, backup, and restore topology.

## Known implementation gaps and later owners

| Gap retained after this architecture decision                   | Required behavior now                                                                                                               | Implementation owner                   |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| No production object-storage module or authorization service    | Define the port and binding contract; do not present the fixture-local key guard as production enforcement.                         | AICO-010, AICO-017, AICO-039           |
| PostgreSQL RLS is not enabled                                   | Composite tenant keys and scoped queries remain mandatory; RLS is defense in depth only after role/migration tests exist.           | AICO-015, AICO-082                     |
| No public upload/download or signed-access flow                 | Specify server-side authorization, exact object version, bounded audience/operation/expiry, revocation, and non-disclosing failure. | AICO-017, AICO-039, AICO-057, AICO-071 |
| No isolated preview or export service                           | Preserve separate-origin, immutable-content, tenant, expiry, and revocation requirements.                                           | AICO-007, AICO-057, AICO-069-071       |
| No production deletion, hold, or backup reconciler              | Specify monotonic deletion state, hold precedence, restore reconciliation, orphan detection, and fail-closed evidence.              | AICO-076, AICO-078, AICO-082           |
| Final retention durations and provider retention terms are open | Support versioned per-type policies and retain minimum necessary content; make no duration or provider-deletion promise.            | DEC-013, AICO-076, AICO-090, AICO-091  |
| Full multi-tenant adversarial suite is not executable yet       | Record non-waivable stable cases and the exact future gate/owner.                                                                   | AICO-080, AICO-083, AICO-090           |

## Decision and merge gates

1. The ADR validator passes in Proposed mode before review.
2. An identifiable human Architecture and Product/Security owner accepts the decision and open-duration rule.
3. ADR status and permanent decision-evidence URL are updated without changing the accepted semantics.
4. The accepted-mode validator and canonical `npm run verify:ci` pass on the final clean SHA.
5. An identifiable QA/Security owner approves the exact final SHA and complete A3 evidence set.
6. Only then may backend #10 merge and become Done; parent #3 remains In review until all three parent criteria are reconciled.

Any semantic change after owner acceptance requires a new decision review. Any commit after QA/Security approval requires a fresh exact-SHA verification and approval.
