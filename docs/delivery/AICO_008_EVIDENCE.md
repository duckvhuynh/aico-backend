# AICO-008 Alpha Operating Policy Evidence

- **Parent:** `duckvhuynh/aicompanyos#8`
- **Child:** `duckvhuynh/aico-backend#29`
- **Status:** Accepted on 2026-08-15; owner acceptance Pending at Candidate publication
- **Candidate semantic SHA:** `e6d064f89b332145fde888a254197a740041684d`
- **Owner decision:** [Accepted by `@duckvhuynh`](https://github.com/duckvhuynh/aico-backend/pull/30#issuecomment-5303040180)
- **Hosted exact-SHA validation:** [Passed](https://github.com/duckvhuynh/aico-backend/actions/runs/31893135845/job/95032289440)
- **Policy:** `docs/policies/alpha-operating-policy-v1.json`
- **Decision record:** `docs/policies/alpha-operating-policy-v1.md`
- **Schema:** `docs/contracts/schemas/alpha-operating-policy.v1.schema.json`
- **Command:** `node scripts/verify-aico-008-alpha-policy.mjs`
- **Review by:** 2026-11-20

## Criterion map

| Criterion        | Accepted evidence                                                                                                                                                  | Retained downstream gate                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `A8-QUAL-01`     | Closed eligible-category and denial registries; exact one-persona/one-flow/five-route/client/mock/template limits; immutable narrowing behavior                    | AICO-019 production implementation                               |
| `A8-ATTACH-01`   | Closed media allowlist, count/per-type/aggregate/page/pixel limits, required validation registry, denied classes, fail-closed quarantine/rejection rule            | AICO-017 implementation and AICO-082 adversarial evidence        |
| `A8-QA-01`       | Blocking/advisory/affected-plus-regression registries; two viewports; critical/serious accessibility boundary; missing required evidence is blocked                | AICO-060/AICO-064 implementation                                 |
| `A8-BUDGET-01`   | Exact model token/cost/time/invocation, sandbox compute/storage/file/output, retry/repair/rework values                                                            | AICO-033/AICO-051 implementation and measured AICO-086 evidence  |
| `A8-CAPACITY-01` | Five-founder cohort, one run/company, global 2 run/1 build/2 invocation ceilings, exact 2x test targets                                                            | AICO-080 launch-environment capacity proof                       |
| `A8-META-01`     | Strict entry schema, closed registries, and exact-SHA Product/Design/QA/Security owner acceptance                                                                  | Fresh review for any later semantic or validation-control change |
| `A8-STOP-01`     | Exact pre-effect deny, eligible cancellation/fencing, unknown reconciliation/no replay, invalid-config fail-closed, persisted founder state, no fabricated success | AICO-033/AICO-051/AICO-064 implementation evidence               |
| `A8-VALIDATE-01` | AJV schema validation, exact-value/registry comparison, cross-field invariants, 15 deliberate failure probes, and exact-SHA hosted validation                      | None for AICO-008                                                |
| `A8-ACCEPT-01`   | Attributable exact-SHA owner decision and metadata-only Accepted reconciliation                                                                                    | None for AICO-008                                                |

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

## Decision evidence fields

| Field                               | Value                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Candidate semantic SHA              | `e6d064f89b332145fde888a254197a740041684d`                                                                                |
| Hosted workflow URL                 | [AICO-008 Alpha Operating Policy](https://github.com/duckvhuynh/aico-backend/actions/runs/31893135845/job/95032289440)    |
| Hosted workflow SHA/result          | `e6d064f89b332145fde888a254197a740041684d` / Passed                                                                       |
| Product/Design/QA/Security decision | `ACCEPTED`                                                                                                                |
| Accepted by/date/evidence           | [`@duckvhuynh` / 2026-08-15 / PR #30 comment](https://github.com/duckvhuynh/aico-backend/pull/30#issuecomment-5303040180) |
| Disputed IDs                        | None                                                                                                                      |

## Scope boundary

Passing structural and fail-closed validation proves that the policy package is closed, bounded, owned, reason-coded, versioned, and internally coherent. It does not prove production enforcement, external provider quality or cost, attachment safety, sandbox capacity, tenant isolation, founder usability, alpha economics, or release readiness. Those claims remain with the downstream AICO issues recorded in the policy.
