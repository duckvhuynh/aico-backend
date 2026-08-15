# AICO-008 Alpha Operating Policy Evidence

- **Parent:** `duckvhuynh/aicompanyos#8`
- **Child:** `duckvhuynh/aico-backend#29`
- **Status:** Candidate; owner acceptance Pending
- **Policy:** `docs/policies/alpha-operating-policy-v1.json`
- **Decision record:** `docs/policies/alpha-operating-policy-v1.md`
- **Schema:** `docs/contracts/schemas/alpha-operating-policy.v1.schema.json`
- **Command:** `node scripts/verify-aico-008-alpha-policy.mjs`
- **Review by:** 2026-11-20

## Criterion map

| Criterion        | Candidate evidence                                                                                                                                                 | Remaining completion gate                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `A8-QUAL-01`     | Closed eligible-category and denial registries; exact one-persona/one-flow/five-route/client/mock/template limits; immutable narrowing behavior                    | AICO-019 production implementation and Product/Design acceptance                    |
| `A8-ATTACH-01`   | Closed media allowlist, count/per-type/aggregate/page/pixel limits, required validation registry, denied classes, fail-closed quarantine/rejection rule            | AICO-017 implementation, AICO-082 release adversarial evidence, Security acceptance |
| `A8-QA-01`       | Blocking/advisory/affected-plus-regression registries; two viewports; critical/serious accessibility boundary; missing required evidence is blocked                | AICO-060/AICO-064 implementation and QA acceptance                                  |
| `A8-BUDGET-01`   | Exact model token/cost/time/invocation, sandbox compute/storage/file/output, retry/repair/rework values                                                            | AICO-033/AICO-051 implementation and measured AICO-086 evidence                     |
| `A8-CAPACITY-01` | Five-founder cohort, one run/company, global 2 run/1 build/2 invocation ceilings, exact 2x test targets                                                            | AICO-080 launch-environment capacity proof                                          |
| `A8-META-01`     | Strict entry schema requires stable ID/key, typed value/unit, owner roles, rationale, reason, review date; semantic validator requires exact closed registries     | Product/Design/QA/Security owner review of exact Candidate SHA                      |
| `A8-STOP-01`     | Exact pre-effect deny, eligible cancellation/fencing, unknown reconciliation/no replay, invalid-config fail-closed, persisted founder state, no fabricated success | AICO-033/AICO-051/AICO-064 implementation evidence                                  |
| `A8-VALIDATE-01` | AJV schema validation, exact-value/registry comparison, cross-field invariants, and deliberate failure probes in one foreground command                            | Hosted exact-Candidate run                                                          |
| `A8-ACCEPT-01`   | Candidate/Accepted evidence-state coherence is enforced; current fields remain Pending/null                                                                        | Attributable owner decision and metadata-only reconciliation                        |

## Closed verification registry

The canonical command must run a successful baseline plus these deliberate invalid mutations:

1. `schema-extra-property`;
2. `missing-owner`;
3. `unbounded-value`;
4. `unknown-configuration-key`;
5. `duplicate-id`;
6. `unknown-reason-code`;
7. `screen-limit-weakened`;
8. `unsafe-media-allowed`;
9. `security-check-advisory`;
10. `rework-limit-weakened`;
11. `capacity-factor-mismatch`;
12. `run-cost-unbounded`;
13. `external-provider-enabled`;
14. `accepted-without-evidence`; and
15. `missing-downstream-owner`.

The expected probe set is compared by equality. A missing, duplicate, skipped, unexpectedly passing, or unrelated-failure probe fails the command. The command performs no network/provider/storage/sandbox effect and uses no production credential or paid service.

## Candidate evidence fields

| Field                               | Value                |
| ----------------------------------- | -------------------- |
| Candidate semantic SHA              | Pending clean commit |
| Hosted workflow URL                 | Pending              |
| Hosted workflow SHA/result          | Pending              |
| Product/Design/QA/Security decision | Pending              |
| Accepted by/date/evidence           | Pending              |
| Disputed IDs                        | None                 |

## Scope boundary

Passing structural and fail-closed validation proves that the policy package is closed, bounded, owned, reason-coded, versioned, and internally coherent. It does not prove production enforcement, external provider quality or cost, attachment safety, sandbox capacity, tenant isolation, founder usability, alpha economics, or release readiness. Those claims remain with the downstream AICO issues recorded in the policy.
