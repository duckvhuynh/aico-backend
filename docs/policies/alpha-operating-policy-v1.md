# Alpha Operating Policy v1

- **Status:** Candidate for AICO-008 owner acceptance
- **Policy ID/version:** `alpha-operating-policy` / `1.0.0`
- **Parent:** `duckvhuynh/aicompanyos#8`
- **Implementation child:** `duckvhuynh/aico-backend#29`
- **Product baseline:** `duckvhuynh/aicompanyos@28d2bc0ecd9e5676a4e87f1bf5e81c602a1a0714`
- **Machine authority:** [`alpha-operating-policy-v1.json`](./alpha-operating-policy-v1.json)
- **Review by:** 2026-11-20

## 1. Decision and evidence boundary

This Candidate turns the AICO-008 qualification, attachment, QA, budget, and capacity questions into one immutable configuration package. Every behavior-changing value has a stable ID, configuration key, typed value and unit, accountable owner roles, rationale, founder-visible reason code, and pre-alpha review date.

The numbers are conservative safety and operating ceilings. They are not an accepted per-completed-run unit-economics target, an external-provider activation, a production capacity claim, or release evidence. `MVP-OQ-03` remains deferred until ten internal runs provide observed median and p95 cost. The deterministic fixture remains the only enabled R0 model target.

The JSON file is the canonical policy value registry. This Markdown record explains the decision and cannot override a value in JSON. A discrepancy fails validation.

## 2. Owners and change control

| Lane     | Accountable owner         | Acceptance scope                                                                                      |
| -------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| Product  | Duc Huynh (`@duckvhuynh`) | Eligible goals, founder wording, scope limits, run/cost/rework ceilings, cohort boundary              |
| Design   | Duc Huynh (`@duckvhuynh`) | Prototype categories, five-screen/template fit, responsive checks, QA presentation                    |
| QA       | Duc Huynh (`@duckvhuynh`) | Blocking/advisory rubric, regression set, deliberate invalid fixtures, capacity-test target           |
| Security | Duc Huynh (`@duckvhuynh`) | Attachment allowlist/limits, sandbox ceilings, secret/scope/egress blocking checks, fail-closed stops |
| Delivery | Duc Huynh (`@duckvhuynh`) | Policy version, review date, Project/evidence reconciliation, downstream ownership                    |

Any semantic change creates a new Candidate SHA and requires fresh Product/Design/QA/Security acceptance. Changing a value in place, using a mutable default, treating missing usage as zero, or relaxing a reason-coded denial without a new accepted policy version is prohibited.

## 3. Qualification policy — `A8-QUAL-01`

### Eligible alpha categories

The closed category registry is:

1. `crud_workspace` — a client-side create/read/update/delete workspace using local mock state;
2. `dashboard_reporting` — a mock dashboard or report with bounded filters and views;
3. `intake_onboarding` — a bounded form, wizard, or onboarding flow;
4. `catalog_directory` — a mock catalog, directory, search, or detail flow;
5. `planning_scheduling` — a local planning, scheduling, checklist, or board flow without real integration; and
6. `content_library` — a local content/library browsing and detail flow.

Qualification also requires exactly one primary persona, exactly one primary flow, no more than five responsive browser routes, `react_typescript_template_v1`, client-only behavior, and local/mock data. Up to five clarification questions may be requested only for blocking missing information.

The closed denial registry includes production deployment; generated backend/database; real authentication, payment, email, or third-party business APIs; sensitive or real data; native/mobile/desktop/extension output; multi-user collaboration; multiple primary flows or concurrent initiatives; custom employees; arbitrary shell or unrestricted network access; and external business actions.

An unsupported request returns `needs_clarification` or `out_of_scope` with a machine reason, founder explanation, and narrowing suggestion. It never edits, drops, or reinterprets the submitted Goal Version. The founder must author a new version.

## 4. Attachment policy — `A8-ATTACH-01`

| Boundary      | Candidate value                                                                           |
| ------------- | ----------------------------------------------------------------------------------------- |
| Allowed media | `text/plain`, `text/markdown`, `application/pdf`, `image/png`, `image/jpeg`, `image/webp` |
| Count         | 5 files per Goal Version                                                                  |
| Text/Markdown | 256 KiB per file                                                                          |
| PDF           | 10 MiB and 50 pages per file                                                              |
| PNG/JPEG/WebP | 5 MiB and 20 megapixels decoded per file                                                  |
| Aggregate     | 20 MiB per Goal Version                                                                   |

Before promotion or employee/tool use, the server must verify declared and detected media type, their match, byte limit, SHA-256, malware result, absence of active content, parser limits, and tenant ownership. Unknown, failed, unavailable, or contradictory validation quarantines or rejects the file; it never defaults to safe.

Archives, SVG, HTML, office documents, executables, scripts, encrypted/password-protected PDFs, polyglots, embedded files, active content, and unknown media types are denied. Original filenames never become object keys or authorization inputs. AICO-017 owns ingestion implementation and AICO-082 owns release-candidate adversarial verification.

## 5. QA policy — `A8-QA-01`

### Blocking

The following prevent final-ready state:

- any approved acceptance criterion is `fail` or `blocked`;
- criterion evidence is missing, dangling, or not reproducible;
- format, lint, typecheck, unit/route tests, or production build fails;
- scope or screen/state mapping violates approved artifacts;
- a secret, sensitive-content, tenant, policy, sandbox, or egress violation occurs;
- the primary flow or navigation is broken;
- an automated accessibility finding is `critical` or `serious`; or
- a required check did not execute. An absent check is `blocked`, never `pass`.

### Advisory

Minor/moderate accessibility findings, non-blocking visual polish, copy consistency, performance warnings, and maintainability observations remain visible but do not consume a rework cycle when all blocking evidence passes. This policy makes no formal accessibility conformance claim.

### Regression

After rework, QA reruns affected criteria/screens/states plus format, lint, typecheck, unit/route tests, production build, every previously passed blocking check, primary-flow navigation, 360 px and 1440 px responsive views, critical/serious accessibility smoke, and secret/scope/egress/prototype-label controls.

## 6. Hard budgets and stop behavior — `A8-BUDGET-01`, `A8-STOP-01`

### Model and run ceilings

| Limit                           |                                 Candidate value |
| ------------------------------- | ----------------------------------------------: |
| Input per invocation            |                                   32,768 tokens |
| Output per invocation           |                                    8,192 tokens |
| Input per run                   |                                  300,000 tokens |
| Output per run                  |                                   60,000 tokens |
| Cost reservation per invocation |                   USD 2.50 (`2,500,000` micros) |
| Cost per run                    |                 USD 15.00 (`15,000,000` micros) |
| Invocation wall time            |                                     120 seconds |
| Invocations per run             |                                              24 |
| System-active wall time per run | 5,400 seconds; persisted founder waits excluded |
| External provider enabled       |                                         `false` |

### Sandbox, file, and output ceilings

| Limit                       |                            Candidate value |
| --------------------------- | -----------------------------------------: |
| Command wall time           |                                300 seconds |
| Aggregate sandbox wall time |                      1,800 seconds per run |
| CPU                         |      2 cores and 2,400 CPU-seconds per run |
| Memory                      |                                      2 GiB |
| Process IDs                 |                                        128 |
| Writable workspace          |                    512 MiB and 5,000 files |
| Individual source file      |                                      1 MiB |
| Source snapshot             |         25 MiB, dependency caches excluded |
| Successful build output     |                                    100 MiB |
| Captured command output     |                          1 MiB per command |
| Redacted retained logs      |                             10 MiB per run |
| Total run storage           | 256 MiB, independent of retention duration |

### Retry, repair, and rework ceilings

- provider SDK retries: zero;
- automatic build-command retries: zero;
- automatic replay of an unknown outcome: zero;
- persisted transient retry: one per attempt;
- schema repair: one separate invocation and reservation;
- task attempts: three;
- automatic Engineer/QA rework cycles: two.

Before an effect, missing capacity or exhausted/unreservable budget denies dispatch. Eligible in-flight work is canceled and late results are fenced. A post-dispatch unknown outcome becomes `BLOCKED` for reconciliation and is not replayed automatically. An absent, invalid, or unenforceable limit makes configuration fail closed. The founder sees a persisted reason and safe next action; no event or UI may claim success without committed evidence.

## 7. Private-alpha capacity — `A8-CAPACITY-01`

| Boundary                          | Alpha ceiling |             Required 2x capacity test |
| --------------------------------- | ------------: | ------------------------------------: |
| Founder cohort                    |             5 |              Not a concurrency target |
| Active runs per company           |             1 | Invariant, not multiplied per company |
| Active runs globally              |             2 |                                     4 |
| Active sandbox builds globally    |             1 |                                     2 |
| Active model invocations globally |             2 |   4 deterministic fixture invocations |

Capacity admission queues or denies before a provider, sandbox, object, token, or cost effect. Capacity metrics never become permission to exceed per-company, tenant, approval, budget, or sandbox policy. AICO-080 owns measured launch-environment capacity evidence.

## 8. Completeness contract — `A8-META-01`, `A8-VALIDATE-01`

`npm run verify:alpha-policy` must pass as one foreground paid-service-free command. It validates:

- the strict JSON Schema and closed top-level shape;
- the exact qualification, attachment, QA, budget, capacity, reason-code, and downstream-owner registries;
- unique stable IDs and configuration keys;
- value/unit/owner/rationale/reason/review metadata for every entry;
- cross-field token, cost, time, storage, retry/rework, and 2x capacity invariants;
- Candidate/Accepted evidence-state coherence; and
- deliberate mutations for missing owners, unbounded values, unsafe media, weakened screen/rework limits, advisory security failures, external-provider activation, capacity mismatch, unknown keys/reasons, missing downstream ownership, and false acceptance.

Unknown, extra, missing, duplicate, unowned, unreasoned, unreviewed, unlimited, conflicting, or zero-by-absence policy values fail non-zero.

## 9. Downstream ownership and retained gaps

| Owner    | Retained implementation or verification                                        |
| -------- | ------------------------------------------------------------------------------ |
| AICO-017 | Safe attachment ingestion/retrieval and scan lifecycle                         |
| AICO-019 | Qualification and explicit narrowing rules                                     |
| AICO-033 | Atomic budget reservation, consumption, reconciliation, and hard-stop behavior |
| AICO-047 | Production fixed template/package allowlist                                    |
| AICO-051 | Bounded allowlisted command runner                                             |
| AICO-060 | Reviewer/QA definition, instructions, and rubric                               |
| AICO-064 | Two-cycle cap and affected-plus-regression reevaluation                        |
| AICO-072 | Analytics ingestion and token/cost/capacity reconciliation                     |
| AICO-080 | Launch-environment performance and 2x capacity proof                           |
| AICO-082 | Attachment, redaction, tenant, and export-secret adversarial tests             |
| AICO-086 | Ten version-pinned goal fixtures and observed cost/quality evidence            |
| AICO-091 | Requirement evidence matrix and R7 go/no-go                                    |

The policy package does not implement or complete those issues.

## 10. Acceptance gate — `A8-ACCEPT-01`

Current owner decision: **Pending**.

Before the Candidate can become `Accepted`:

1. the semantic package is committed at one clean exact 40-hex Candidate SHA;
2. hosted `AICO-008 Alpha Operating Policy` validation succeeds on that exact SHA;
3. an attributable Product/Design/QA/Security owner reviews the JSON, this record, all hard values, reason messages, retained gaps, and hosted result;
4. the owner posts `ACCEPTED` or `REQUEST_CHANGES`, exact Candidate SHA, identity, date, evidence URL, and disputed IDs on child #29 or its PR; and
5. a metadata-only revision records the decision without changing semantic values or validation controls.

Agent-authored text, a green check, issue assignment, reaction, PR merge, or generic approval is not owner acceptance. Any requested semantic change creates a new Candidate and invalidates the prior review.

## 11. Explicit non-goals

This Candidate does not activate an external provider/model/account; accept provider terms, retention, training, disclosure, region, or spend; send founder/customer/sensitive content; implement production qualification, attachments, evaluator, sandbox, ledger, capacity, UI, or analytics; decide data-retention duration; establish an economic target; open private alpha; or claim full PRD/SRS/R0/R7 completion.

**Disputed IDs:** None
