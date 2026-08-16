# AICO-005 Provider and Employee Runtime Decision Evidence

**Status:** Accepted decision package; no external provider activation or production runtime is claimed
**Candidate semantic SHA:** `12d5c86e2c70ccb4409b9a732ef9e143f05ec26c`
**Architecture/AI evidence:** https://github.com/duckvhuynh/aico-backend/pull/32#issuecomment-5306136593
**Product + Legal/Security evidence:** https://github.com/duckvhuynh/aico-backend/pull/32#issuecomment-5306136806
**Proposed-mode hosted verification:** https://github.com/duckvhuynh/aico-backend/actions/runs/31903220678
**Proposed-mode hosted verification SHA:** `12d5c86e2c70ccb4409b9a732ef9e143f05ec26c`
**Accepted metadata SHA:** Pending
**Accepted-mode hosted verification:** Pending
**Accepted-mode hosted verification SHA:** Pending
**Accepted-mode verification artifact digest:** Pending
**Decision date:** 2026-08-16
**Disputed IDs:** None
**Product trace SHA:** `28d2bc0ecd9e5676a4e87f1bf5e81c602a1a0714`

The frozen `AICO_005_PRODUCT_TRACE.json` manifest binds that private Product repository commit to the
exact `MVP_SCOPE.md`, `PRD.md`, and `SRS.md` Git blob identities verified on 2026-08-15. Candidate
owner acceptance covers this trace manifest; a later Product revision requires a new Candidate.

**Parent:** [`duckvhuynh/aicompanyos#5`](https://github.com/duckvhuynh/aicompanyos/issues/5)
**Definition of Ready:**
[`issuecomment-5300317644`](https://github.com/duckvhuynh/aicompanyos/issues/5#issuecomment-5300317644)
**Historical decision child:**
[`duckvhuynh/aico-backend#25`](https://github.com/duckvhuynh/aico-backend/issues/25), completed
**Historical proof child:**
[`duckvhuynh/aico-backend#26`](https://github.com/duckvhuynh/aico-backend/issues/26), completed
**Governing change child:**
[`duckvhuynh/aico-backend#31`](https://github.com/duckvhuynh/aico-backend/issues/31)

No comment, SHA, run, artifact, account setting, provider, model, configuration, or owner decision is
invented by this file. Candidate, Proposed-run, and owner fields must bind the same reviewed semantic
revision. Accepted-run fields bind the later Accepted metadata SHA under the explicit masked metadata
allowlist. Separate role decisions may be authored by the same repository owner, but they must be
distinct comments that state the lane being exercised and cite the exact Candidate SHA.
This fresh Candidate cycle is governed by backend issue #31. Backend issue #25 and proof child #26
remain completed historical evidence; they are not represented as open or blocked. The runtime,
package, and CI semantic change must still receive fresh owner decisions and exact-SHA hosted proof.

The post-Candidate masked metadata allowlist is exact: ADR-011's `**Status:**`,
`**Architecture/AI evidence:**`, and `**Product + Legal/Security evidence:**` header values; and this
file's header values for `**Status:**`, `**Candidate semantic SHA:**`,
`**Architecture/AI evidence:**`, `**Product + Legal/Security evidence:**`,
`**Proposed-mode hosted verification:**`, `**Proposed-mode hosted verification SHA:**`,
`**Accepted metadata SHA:**`, `**Accepted-mode hosted verification:**`,
`**Accepted-mode hosted verification SHA:**`, `**Accepted-mode verification artifact digest:**`,
and `**Decision date:**`. `**Disputed IDs:**` is frozen to `None`; no other line or file may differ
from the Candidate under decision acceptance.

## 1. Proposed outcome and evidence semantics

The package proposes the smallest credible AICO-005 boundary:

- `DETERMINISTIC_FIXTURE` is the only R0-enabled provider, only in local/test/CI execution;
- `OPENAI_RESPONSES_DIRECT` is one `CONDITIONAL_DISABLED` external candidate, with no exact model,
  account, region, retention setting, price catalog, or production credential activated;
- the fixed-role Employee Runtime owns context assembly, budget reservation, provider invocation,
  independent validation, one bounded repair, failure/retry scheduling, cancellation, version
  targeting, and commit fencing;
- provider adapters receive a closed least-privilege DTO and normalize one network call into a
  closed result; SDK types, retries, fallback, credentials, and provider error bodies stay inside
  the adapter boundary; and
- candidate output and proposed tools have zero authority until independent validation and the
  authoritative application transaction accept them.

The evidence levels are deliberately distinct:

- **Specified**: ADR-011, the provider runtime contract/schema, and this map state the proposed
  controls and ownership.
- **Structurally verified**: Proposed-mode validators and fail-closed document/schema mutations pass
  on one clean exact SHA. This is not provider execution or human acceptance.
- **Selected**: Architecture/AI and separate Product + Legal/Security decisions accept that exact
  semantic SHA; a metadata-only revision binds their permanent URLs and accepted-mode CI passes.
- **Proved**: child #26 executes every deterministic fixture/mutation case with exact-final-SHA
  hosted evidence and attributable QA/Security approval.
- **Implemented**: AICO-030/032/033 and related platform work ship the production definition,
  runtime/adapter, ledger, telemetry, and rollout controls.
- **External-activated**: a later exact provider/model/account/content-use/spend manifest is accepted
  and production configuration passes fail-closed validation.
- **Release-qualified**: downstream R7 tenant/redaction, resilience, evaluation, dogfood, and
  disclosure evidence passes on the same candidate lineage.

This file may establish only the first two levels until the Pending owner fields are replaced. Even
an accepted AICO-005 decision and green child #26 prove no external provider call or production
fitness.

## 2. Binding fail-closed summary

These exact decision constraints are stable validator and reviewer anchors:

- contract v1 permits exact provider/adapter pairs `DETERMINISTIC_FIXTURE` /
  `DETERMINISTIC_FIXTURE` and `OPENAI_RESPONSES_DIRECT` / `DIRECT_PROVIDER`; only the deterministic
  pair is structurally invocable or targetable, while the external pair has no allowed environments;
- training use prohibited; no opt-in training or consent surface in MVP
- no automatic cross-provider fallback
- provider SDK retries are disabled
- no worker sleeps
- post-dispatch timeout is UNKNOWN
- repair cap is 1
- separate invocation and reservation
- repair and failed invocation IDs differ, and repair/original reservation-ID sets are disjoint;
- dispatch phase is exactly `NOT_DISPATCHED`, `DISPATCHED`, or `UNCERTAIN`;
- `SUCCEEDED` requires independent validation `PASSED`, a safe non-dropped outcome, `REPORTED` and
  accepted provider/model resolution, and no `UNACCEPTED_DRIFT`;
- every typed version reference has its exact required kind; wrong-kind lookalikes deny dispatch;
- missing usage or cost is `UNAVAILABLE`, never zero or an invented estimate;
- redaction outcome is exactly `PASS`, `REDACTED`, or `DROPPED`;
- raw prompts and hidden reasoning are prohibited
- rollback and kill never rewrite historical lineage

Missing, unknown, expired, mismatched, drifted, unsupported, or unaccepted configuration denies
dispatch. A production environment selecting the deterministic fixture is invalid. An external
credential without the exact accepted activation-manifest digest is a configuration failure, not
implicit authorization.

## 3. Parent AICO-005 acceptance map

| Parent criterion                                                                                                                                                    | Proposed binding evidence                                                                                                                                                                                 | Present verdict                                                                                                                                        | Completion rule                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interface separates domain envelopes from provider types and includes timeout/cancel, schemas, model/config versions, usage/cost, latency, and classified failures. | [`ADR-011`](../architecture/011-model-provider-employee-runtime-selection.md), [`MODEL_PROVIDER_RUNTIME.md`](../contracts/MODEL_PROVIDER_RUNTIME.md), its strict schema, and `A5-PORT-01`/`A5-RESULT-01`. | **Proposed, not accepted or implemented.** ADR-002/005 and `AGENT_RUNTIME.md` provide foundations; the new companion refines the least-privilege seam. | Proposed-mode exact-SHA verification, two owner decisions, metadata-only Accepted status, then child #26 proof. Production implementation remains AICO-032/033.                                                                                   |
| Deterministic fixture supports success, malformed output, timeout, rate limit, cancellation, and safety/redaction result.                                           | Child #26 case registry and `A5-PROOF-01`; this decision fixes required semantics but includes no passing result.                                                                                         | **Not met.** A planned matrix or fixture source is not executed evidence.                                                                              | Decision accepted first; then every closed case and control mutation executes without skip/waiver/survivor on one exact final SHA in local and hosted CI.                                                                                         |
| Provider terms/configuration prevent unapproved training use and secrets never enter prompts/logs.                                                                  | ADR-011 content-use activation manifest, `A5-TERMS-01`, `A5-SECRET-01`, and exact training/secret prohibitions.                                                                                           | **Proposed fixture-only boundary.** No external provider/model/account is approved.                                                                    | Product + Legal/Security accepts the decision boundary now; later external activation requires a successor decision/schema plus separately attributable exact-manifest acceptance. Child #26 proves deterministic secret/redaction controls only. |

Parent AICO-005 remains In progress until both backend children merge, all three parent checkboxes are
reconciled to permanent evidence, and parent-level acceptance is attributable. Neither decision
acceptance nor proof completion may claim the full cited PRD/SRS requirements complete.

## 4. Decision-child acceptance map

| Child criterion                   | Proposed package evidence                                                                                                                                                                                                                                                                                                                                             | Current truth                                                                        | Missing completion evidence / owner                                                                                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `A5-ADR-01`                       | ADR-011 compares deterministic/local, direct OpenAI, direct Anthropic, paid Gemini, and aggregator/router using dated first-party sources. It enables the fixture only and selects direct OpenAI Responses as conditional disabled.                                                                                                                                   | Options, trade-offs, prerequisites, rejection and evolution triggers are specified.  | Clean semantic SHA, Proposed-mode hosted result, Architecture/AI acceptance, separate Product + Legal/Security acceptance, metadata-only Accepted status, accepted-mode hosted result.                                          |
| `A5-PORT-01`                      | ADR-011 and provider contract separate `EmployeeExecutionRequest`, allowlisted/redacted `ContextManifest`, least-privilege `ProviderInvocationRequest`, provider-neutral result, and validated domain output.                                                                                                                                                         | Contract source can be structurally checked; no production port/adapter exists.      | Child #26 fixture proves boundaries; AICO-032 implements modules/adapters and prevents SDK type leakage.                                                                                                                        |
| `A5-RESULT-01`                    | Closed `SUCCEEDED`/`FAILED`/`CANCELED`/`UNKNOWN` result includes candidate/proposed tools without authority, exact provider request/model/config/schema lineage, usage/cost/latency, finish/safety/redaction, dispatch certainty, and failure/retry guidance. Success requires passed independent validation, safe/non-dropped output, and accepted model resolution. | Semantics are proposed; a provider result is never authoritative state.              | Strict schema/fixture and result-combination mutations in #26; production mapping and reconciliation in AICO-032/033/077.                                                                                                       |
| `A5-VALIDATE-01` / `A5-REPAIR-01` | Provider structured output is defense in depth; strict schema plus semantic/lineage validation precedes any authority. R0 repair has a different invocation ID and disjoint reservation IDs, uses only safe diagnostics, and has a cap of one.                                                                                                                        | Decision contract only; cross-field disjointness still needs executable proof.       | #26 malformed/semantic/tool-authority/repair/budget mutations, including reused-ID/reservation rejection; AICO-032/033 production validator and ledger.                                                                         |
| `A5-FAILURE-01`                   | ADR/contract distinguish pre-dispatch transient, rate limit, validation, refusal/safety, cancellation, post-dispatch unknown, policy, budget, integrity, and terminal provider failure. Runtime persists retry scheduling; SDK retry/fallback and worker sleep are banned; late results are lease/cancel fenced.                                                      | Failure table and invariants are specified.                                          | #26 exact case/mutation results; AICO-027/032/033/084 production restart/race/reconciliation evidence.                                                                                                                          |
| `A5-META-01` / `A5-SECRET-01`     | Bounded allowlisted IDs/versions/digests/status/usage/cost/latency/safety evidence, exact reference kinds, `UNAVAILABLE` accounting, `PASS`/`REDACTED`/`DROPPED` redaction, and an explicit prohibited-content list.                                                                                                                                                  | Redaction contract exists; no external content has been processed.                   | #26 seeded canary and evidence-bundle scan; AICO-076/077/082 production retention, telemetry, and adversarial evidence.                                                                                                         |
| `A5-VERSION-01`                   | Attempts pin immutable provider configuration; requested/resolved drift is classified; new-attempt targeting, rollout, kill, rollback, and circuit behavior preserve history and never silently switch.                                                                                                                                                               | Architecture specified, no production registry/rollout implementation.               | #26 deterministic targeting/kill/rollback/drift mutations; AICO-079 production migration/rollback drill.                                                                                                                        |
| `A5-TERMS-01`                     | Fixture-only R0, training prohibition, external-content ban, exact activation manifest, production fail-closed configuration, and no founder picker/BYOK/custom prompt/router/fallback.                                                                                                                                                                               | No external provider is authorized; all exact external fields remain absent/Pending. | Separate Product + Legal/Security decision on this semantic SHA; later successor decision/schema and exact-manifest acceptance before any external founder-content call.                                                        |
| `A5-TRACE-01`                     | This map traces parent/child criteria, ADR-002/AEO/Agent Runtime reuse, gaps, gates, and downstream AICO-008/030/032/033/076/077/079/082/086/087/090 ownership.                                                                                                                                                                                                       | Trace exists and expressly keeps downstream work open.                               | Validator consistency, permanent decisions, child reconciliation, then parent Delivery reconciliation.                                                                                                                          |
| `A5-ACCEPT-01`                    | Proposed/Accepted status markers, exact Pending owner/run/SHA/digest fields, structural validation, fail-closed mutations, non-cyclic semantic/Accepted-metadata SHA binding, masked metadata-only reconciliation, and semantic-change invalidation are explicit.                                                                                                     | **Pending.** Agent review and document authorship confer no owner acceptance.        | Proposed-mode run on the Candidate; two permanent role-bound owner decisions; distinct Accepted metadata SHA and successful retained artifact; `npm run verify:provider-architecture:reconciled`; issue/Project reconciliation. |

No unchecked criterion may be inferred from an adjacent green test. Every checked criterion must link
the exact evidence and owner appropriate to its evidence level.

## 5. Evidence inventory

| Evidence ID      | Evidence source and expected result                                                                                                                                                                                           | Authority / limitation                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `A5-ADR-01`      | `docs/architecture/011-model-provider-employee-runtime-selection.md`                                                                                                                                                          | Provider/runtime decision only; no external activation, implementation, quality, or release claim.                                       |
| `A5-PORT-01`     | ADR-011 plus `docs/contracts/MODEL_PROVIDER_RUNTIME.md` and strict schema                                                                                                                                                     | Defines dependency direction and least-privilege provider DTO; provider SDK types remain adapter-private.                                |
| `A5-RESULT-01`   | Provider contract/schema closed unions and invariant table                                                                                                                                                                    | Candidate output/tool proposals have no authority; malformed/unknown combinations deny.                                                  |
| `A5-VALIDATE-01` | ADR, contract, runtime validator requirements                                                                                                                                                                                 | Independent strict and semantic validation precedes artifact/task/tool/state authority.                                                  |
| `A5-REPAIR-01`   | ADR, contract, proof registry                                                                                                                                                                                                 | Exactly one safe-diagnostic schema repair with different invocation and disjoint reservation IDs; #26 proves the semantic invariant.     |
| `A5-FAILURE-01`  | ADR failure table and contract failure union                                                                                                                                                                                  | Dispatch certainty, cancellation, late fencing, unknown outcome, runtime-owned retries, no SDK retry/sleep/fallback.                     |
| `A5-META-01`     | ADR accounting/evidence allowlist and contract evidence projection                                                                                                                                                            | Exact versions and bounded usage/cost/latency/safety are attributable; telemetry remains non-authoritative.                              |
| `A5-SECRET-01`   | ADR prohibited-content list and proof canary scan                                                                                                                                                                             | No raw prompts/completions, credentials, tenant bodies, provider errors, transcripts, or hidden reasoning in evidence surfaces.          |
| `A5-VERSION-01`  | ADR targeting/rollout/kill/rollback section and proof cases                                                                                                                                                                   | Immutable attempt lineage; aliases/drift classified; kill/rollback only affects eligible current/new work.                               |
| `A5-TERMS-01`    | ADR external activation gate and later exact manifest                                                                                                                                                                         | Only fixture execution is authorized in v1; external use requires a successor decision/schema after all manifest fields and owners pass. |
| `A5-TRACE-01`    | This file                                                                                                                                                                                                                     | Maps authority, current truth, retained gaps, downstream owners, and prohibited claims.                                                  |
| `A5-VERIFY-01`   | `npm run verify:provider-architecture`                                                                                                                                                                                        | Proposed-mode structural validator and document/schema fail-closed mutations on the exact clean SHA; no paid service.                    |
| `A5-ACCEPT-01`   | Two owner comments, Candidate/Proposed run binding, distinct Accepted metadata SHA, successful accepted-mode run and `.aico-evidence/aico-005-provider-decision.json`, then `npm run verify:provider-architecture:reconciled` | All are Pending until real permanent evidence exists; masked metadata is the only permitted difference from the Candidate.               |
| `A5-PROOF-01`    | Backend proof child #26                                                                                                                                                                                                       | Required deterministic executable matrix; no result is claimed by the decision package.                                                  |

## 6. Provider comparison evidence

The comparison was reviewed on 2026-08-15. First-party pages are cited because data and operational
terms can change. A later activation decision must archive or digest the exact applicable contract,
account settings, pricing, model, and feature evidence rather than assuming these pages are static.

| Candidate                 | Capability/data evidence considered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Decision consequence                                                                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic fixture     | Repository-owned, no external processor, network, paid account, production credential, or retention surface.                                                                                                                                                                                                                                                                                                                                                                                                                  | Only enabled R0 provider; deterministic proof only; invalid in deployed production.                                                                                                                                                   |
| Direct OpenAI Responses   | [Responses API](https://platform.openai.com/docs/api-reference/responses) supports structured response formats and status/usage metadata. [Data controls](https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint) say API data is not used for training by default while documenting abuse-monitoring/application-state retention and eligibility-dependent controls. The [official Node SDK](https://github.com/openai/openai-node#retries) documents automatic retries unless disabled. | Smallest direct external candidate, but `CONDITIONAL_DISABLED`; exact model/snapshot, `store`/stateful features, account control, region, terms, pricing, quotas, evaluations, and `maxRetries: 0` require later manifest acceptance. |
| Direct Anthropic          | [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) provide schema-constrained JSON/tool inputs. [Commercial API retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data) documents standard deletion within 30 days plus exceptions/ZDR agreement. The [official TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) exposes retry configuration and currently defaults retries.                               | Credible substitution candidate, not a second MVP adapter. Requires its own exact account/model/terms/evaluation manifest; cannot be silently substituted.                                                                            |
| Paid Gemini Developer API | [Structured output](https://ai.google.dev/gemini-api/docs/structured-output) supports JSON schemas. [Paid-service/ZDR guidance](https://ai.google.dev/gemini-api/docs/zdr) documents no product improvement from paid prompts/responses and feature/configuration-specific retention behavior. [Pricing](https://ai.google.dev/gemini-api/docs/pricing) and billing are model/project dependent.                                                                                                                              | Credible substitution candidate only through a paid project and a separately accepted exact manifest; free/unpaid handling is excluded for founder content.                                                                           |
| Aggregator/router         | [OpenRouter routing](https://openrouter.ai/docs/guides/routing/provider-selection) documents default load balancing/fallback behavior and routing controls. [Provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging/) confirms downstream providers retain their own data policies.                                                                                                                                                                                                                     | Rejected for MVP because an extra processor and dynamic resolution/fallback expand privacy, lineage, cost, and failure surfaces. Reconsider only with hard pinning, fallback off, and full provider-resolution evidence.              |

The comparison does not rank model intelligence. Representative quality, safety, latency, and cost
evaluation belongs to AICO-086 after an exact manifest and implementation exist.

## 7. Exact external activation manifest — currently absent

The external activation manifest is intentionally not created or accepted here. Contract v1 cannot
activate it; its required fields are frozen for a successor decision/schema:

| Manifest area      | Exact fields required before activation                                                                                                                                                                                                        | Current value                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Identity/access    | Provider legal entity; API/endpoint family; exact model/snapshot; provider configuration, adapter/API and schema/tool versions/digests; redacted account/project/workspace reference; access owner/role; credential source/rotation reference. | Pending; no account or credential accepted. |
| Data/training      | Training/product-improvement disabled evidence; retention/deletion; abuse/safety logging; ZDR/MAM/equivalent eligibility/status; stateful storage, files, caching, background/search/tool settings; verification time and evidence digest.     | Pending; training remains prohibited.       |
| Legal/location     | Terms/DPA/privacy/subprocessor versions; allowed/prohibited data classes and fields; region/residency/cross-border path; incident/escalation owner; founder disclosure version.                                                                | Pending.                                    |
| Runtime behavior   | Structured-output schema subset; tool mode; provider-side fallback off; SDK retry off; request identity; hard deadline/abort behavior; unknown-outcome reconciliation; returned revision/fingerprint behavior.                                 | Pending; fixture semantics only.            |
| Spend/capacity     | Pricing-catalog version/currency; token/cost limits per invocation/run; account spend cap; quota/rate-limit evidence; actual/estimated/unavailable accounting rule; finance/cost owner.                                                        | Pending; no spend authorized.               |
| Evaluation/rollout | Version-pinned fixture set; accepted quality/safety/latency/cost thresholds and result; drift detection; rollout cohort; circuit/kill triggers; rollback target; historical-read/migration compatibility.                                      | Pending.                                    |
| Acceptance         | Manifest digest; exact implementation semantic SHA; Architecture/AI confirmation; Product + Legal/Security acceptance; effective/expiry/review date; disputes/conditions.                                                                      | Pending.                                    |

Every field is mandatory unless the accepted manifest gives an explicit `NOT_APPLICABLE` reason and
owner. Unknown does not mean none. Expiry or any behavior-affecting change returns the target to
disabled until reaccepted.

## 8. Reused foundations and retained gaps

| Existing artifact                          | Reusable truth                                                                                                                                                                                                    | Why it does not complete AICO-005                                                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-002                                    | Fixed four-role runtime, PostgreSQL authority, immutable task attempts, provider-neutral port, independent validation, budgets, cancellation, retries, unknown-outcome block, and no tool authority from a model. | It did not compare/choose provider candidates, close the least-privilege DTO/result semantics, or make the content-use decision.                                  |
| ADR-005                                    | Immutable registry/manifests, requested/resolved provider identity, reproducibility grades, safe telemetry/accounting, and honest replay/reconciliation vocabulary.                                               | It is a shared foundation, not the AICO-005 provider/terms/repair/adapter selection or executable proof.                                                          |
| `AGENT_RUNTIME.md`                         | Domain attempt/context/output and initial model port/result/failure vocabulary.                                                                                                                                   | Its broad initial request/result examples require the stricter companion provider contract and must not be mistaken for a production adapter implementation.      |
| Existing deterministic provider tests      | A local fixture concept can produce predictable employee output without a paid provider.                                                                                                                          | Existing tests do not prove the closed AICO-005 matrix, one repair reservation, unknown outcome, secret scans, immutable target drift, or rollback/kill controls. |
| AICO-002 durability proof                  | Persisted retries/waits, lease fencing, process replacement, ordered events, and no blind unknown replay are feasible.                                                                                            | It does not invoke or normalize the AICO-005 port/result or account for provider-specific outcomes.                                                               |
| AICO-003/AICO-006 security/policy evidence | Tenant-bound authority, redacted denial evidence, and action-time policy controls are specified/proved in their bounded scopes.                                                                                   | They do not prove provider-context minimization, external terms, model-result validation, repair, or provider evidence redaction.                                 |

The current repository has no production Employee Runtime adapter, external provider credential,
provider invocation/repair/ledger persistence, accepted numeric budgets, external account controls,
quality result, production telemetry/alerts, or provider rollout/rollback drill. Those gaps stay open.

## 9. Failure and proof expectations

Historical proof child #26 used one foreground paid-service-free command and emitted one bounded
canonical result manifest. The current Candidate must rerun that command on the exact reviewed SHA.
At minimum it proves:

1. success with exact domain/provider/result separation, independent strict/semantic validation
   `PASSED`, safe/non-dropped output, `REPORTED` and accepted model resolution, and exact reference
   kinds;
2. malformed/unknown-field/semantic-invalid outputs create no artifact, task success, tool call,
   event claiming success, downstream dispatch, or other authoritative state effect;
3. one safe-diagnostic repair uses a different invocation ID and reservation IDs disjoint from the
   original set; reused identity/reservation mutations fail, and the cap prevents a second repair;
4. pre-dispatch transient, rate limit/hint clamp, refusal/safety, cancellation-before/after dispatch,
   post-dispatch timeout/unknown, terminal provider/configuration, and malformed adapter result map
   exactly to the closed failure semantics;
5. SDK retry, adapter retry, worker sleep, provider/model fallback, late-result commit, and stale-lease
   commit control-removal mutations are killed by their intended cases;
6. reported/estimated/unavailable token and cost data (with missing values exactly `UNAVAILABLE`,
   never zero), integer micros/currency, latency, provider request/resolved-model/config/schema/
   redaction/safety metadata, `PASS`/`REDACTED`/`DROPPED` receipts, reservation reconciliation, and
   bounded evidence are exact;
7. seeded credentials, raw prompt/completion fragments, source/attachment/tenant canaries, provider
   error bodies, arbitrary transcripts, and hidden-reasoning canaries are absent from every evidence
   surface and retained bundle;
8. immutable target selection, alias/resolved drift, pause/kill, rollback for eligible new attempts,
   in-progress/historical lineage, and no silent failover behave as specified; and
9. only exact key `DETERMINISTIC_FIXTURE` is callable; the disabled `OPENAI_RESPONSES_DIRECT`
   candidate and every other external configuration/credential are rejected, no network/provider/
   spend occurs, and cleanup leaves no secret or durable production-like residue.

The case registry and mutation registry must be closed and compared by equality. Missing cases,
skips, waivers, duplicate IDs, unexpected cases, surviving mutations, unrelated failures, or an
unclean repository make the proof fail. A compile error does not count as killing a semantic mutation.

## 10. Decision, proof, and merge gates

### Gate 0 — `A5-READY-0 PROPOSED`

1. ADR, evidence map, provider contract/schema, case registry, validator, and document/schema
   mutations agree on the final semantic package.
2. `npm run verify:provider-architecture` passes from a clean exact 40-hex SHA without paid services,
   credentials, external calls, skips, or waivers.
3. The Proposed status and all Pending owner fields remain honest.

### Gate 1 — `A5-READY-1 SELECTED`

1. The Candidate semantic SHA identifies the clean Proposed commit. Its permanent Proposed-mode
   hosted verification SHA equals the Candidate SHA, and that run succeeds before owner decisions.
2. An identifiable Architecture/AI decision accepts the exact Candidate semantic SHA, dependency
   direction, failure/repair/accounting/version semantics, conditional candidate, and limitations.
3. A separate identifiable Product + Legal/Security decision accepts the same SHA's fixture-only
   boundary, training prohibition, exact later activation manifest, retention/disclosure/spend gates,
   and non-goals.
4. A first metadata-only revision changes ADR status to `Accepted for AICO-005`, records the
   Candidate/Proposed-run binding and permanent owner URLs/date, confirms frozen `Disputed IDs: None`,
   and changes no semantic contract/control. This distinct commit is the Accepted metadata SHA.
5. Hosted accepted-mode CI runs on the Accepted metadata SHA with conclusion `success`. A final
   evidence-only reconciliation records that SHA, the permanent run URL, the identical Accepted-mode
   hosted verification SHA, and the `self_digest` shaped `sha256:<64hex>` from retained artifact
   `.aico-evidence/aico-005-provider-decision.json`.
6. The validator requires Candidate and Accepted metadata SHAs to be distinct ancestors and masks
   only the explicit ADR/evidence status and evidence fields. Contract, schema, examples, AEO audit,
   validators, package integration, and CI integration remain byte-identical to the Candidate. Human/
   PR governance verifies that each cited GitHub run is attributable to its recorded SHA and
   concluded successfully.
7. `npm run verify:provider-architecture:reconciled` passes on the final evidence-only revision.
   Historical decision child #25 and proof child #26 remain Done; governing change child #31 records
   the fresh Candidate acceptance and reconciliation evidence.

Any semantic change after the two owner decisions invalidates both decisions. The accepted and final
reconciliation commits may alter only the explicit masked ADR/evidence metadata fields. They cannot
silently change provider, model, DTO, result, repair, failure, redaction, targeting, terms, non-goal,
contract, schema, example, audit, validator, package, or CI semantics.

### Gate 2 — `A5-READY-2 PROVED`

1. The workflow implemented by historical proof child #26 executes the full deterministic case and
   fail-closed mutation registries on the current exact final SHA with zero external effects and
   unconditional cleanup.
2. Local and hosted manifests agree on SHA, result, case/mutation equality, usage/cost/effect counts,
   prohibited-content scan, clean tree, and canonical digest.
3. An attributable QA/Security owner accepts that exact final proof SHA and permanent hosted artifact.
4. Historical child #26 remains Done; governing change child #31 records the current rerun, and
   parent #5 reconciles only its bounded R0 criteria.

Gate 2 proves an internal architecture fixture. It does not enable OpenAI or any other external
provider, prove external quality/terms/capacity, implement production runtime/ledger, or qualify alpha.

### Gates 3–4 — production and release evidence

- `A5-READY-3 IMPLEMENTED/EXTERNAL-ELIGIBLE`: AICO-008/030/032/033/076/077/079 deliver accepted
  numeric limits, definitions/runtime/ledger, retention/telemetry, and safe targeting/rollback; an
  exact external activation manifest and successor provider decision/schema are separately accepted
  before founder content can be sent.
- `A5-READY-4 RELEASE-QUALIFIED`: AICO-082/086/087/090 and applicable release scenarios prove tenant/
  redaction controls, representative quality/cost, consecutive golden behavior, and accurate founder
  disclosure on one immutable candidate lineage.

## 11. Downstream ownership

| Owner    | Required downstream responsibility                                                                                                                                                   | Boundary that cannot be weakened                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| AICO-008 | Set attributable alpha concurrency, per-call/run token/cost/time limits, quotas, and contingency.                                                                                    | No unknown/unlimited default and no external activation merely because access exists.                                            |
| AICO-030 | Publish immutable four-role employee definitions, provider requirements, context/memory field allowlists, and rollout targets.                                                       | No custom employee/prompt/provider picker or arbitrary transcript/cross-tenant memory.                                           |
| AICO-032 | Implement Employee Runtime, context minimization, provider port/adapters, result normalization, independent validators, one repair, cancellation, reconciliation, and fenced commit. | Provider SDK/domain separation, closed results, one network call per invocation, and no output/tool authority before validation. |
| AICO-033 | Implement atomic reservations/reconciliation for primary, retry, repair, and unknown outcomes with hard limits.                                                                      | No dispatch before reservation; missing usage/cost is not zero; unknown reservations need reconciliation.                        |
| AICO-076 | Accept and implement relational/object/log/provider retention and deletion policy.                                                                                                   | External provider retention/settings must match the exact accepted manifest and founder disclosure.                              |
| AICO-077 | Implement bounded redacted logs/traces/metrics/events, provider/budget alerts, reconciliation, and incident evidence.                                                                | Telemetry is non-authoritative; prohibited content and high-cardinality metric labels remain banned.                             |
| AICO-079 | Implement exact target resolution, drift detection, rollout/pause/kill/circuit/rollback, migration, and historical readability.                                                      | No mutable `latest`, silent fallback, or historical rewrite.                                                                     |
| AICO-082 | Execute cross-tenant/model-context, attachment, prompt/content, credential, log/analytics, and export-secret adversarial tests.                                                      | R0 canaries do not substitute for production release evidence.                                                                   |
| AICO-086 | Evaluate ten approved non-sensitive exact-version goal fixtures for quality, safety, latency, cost, intervention, and failure.                                                       | No external model/quality selection without representative evidence and accepted thresholds.                                     |
| AICO-087 | Complete three consecutive exact-candidate no-repair golden runs.                                                                                                                    | Any operator mutation or candidate change resets the lineage/streak.                                                             |
| AICO-090 | Publish accepted prototype/model/data-use/retention/recovery/support limitations and disclosure.                                                                                     | Founder communication must match actual provider/configuration/retention and cannot imply production readiness.                  |

The required downstream ID anchor is AICO-008/030/032/033/076/077/079/082/086/087/090.

## 12. Owner decision fields — all Pending

The Architecture/AI decision must state:

- role exercised and accountable owner identity;
- exact 40-hex Candidate semantic SHA and successful Proposed-mode hosted run whose recorded SHA
  equals that Candidate;
- acceptance/rejection of `DETERMINISTIC_FIXTURE` as the only enabled R0 target;
- acceptance/rejection of `OPENAI_RESPONSES_DIRECT` as conditional disabled with no exact model;
- port/DTO/result dependency direction, validation and zero-authority rule;
- repair cap, failure/unknown/cancel/retry scheduling, SDK retry/sleep/fallback bans;
- accounting/redaction, targeting/kill/rollback/history, implementation gaps and non-goals;
- conditions only when already satisfied by the exact Candidate, and explicit confirmation that no
  disputed ID remains.

The separate Product + Legal/Security decision must state:

- role exercised and accountable owner identity;
- the same exact Candidate semantic SHA and successful Proposed-mode hosted run/SHA;
- fixture-only execution and ban on external founder/customer/sensitive/secret content now;
- training prohibition/no opt-in, later exact provider/model/account/retention/deletion/data-location/
  subprocessors/disclosure/spend/evaluation manifest, and production configuration denial;
- no founder provider/model picker, BYOK, custom prompt, router, or automatic fallback;
- acceptance of retained downstream ownership, evidence levels, limitations and non-goals;
- conditions only when already satisfied by the exact Candidate, and explicit confirmation that no
  disputed ID remains.

Any dispute or requested semantic condition blocks acceptance. Record it outside the mutable
acceptance fields, resolve it through a new Proposed Candidate semantic SHA, rerun Proposed-mode CI,
and obtain both fresh owner decisions. An accepted package always retains `**Disputed IDs:** None`.

Approval comments cannot contain a production credential, prompt/completion, provider account secret,
founder/customer content, or hidden reasoning. A generic “looks good,” agent output, reaction, PR merge,
or same-SHA CI result is not a substitute for the two explicit lane decisions.

## 13. Explicit non-goals and prohibited claims

The AICO-005 decision package does not:

- implement a production Employee Runtime, context assembler, provider adapter, model invocation
  persistence, budget ledger, telemetry, registry, migration, API, worker, or founder UI;
- activate OpenAI, Anthropic, Gemini, OpenRouter, or any exact external model/configuration/account;
- create or use a production credential, accept exact provider terms/account controls, authorize
  spending, or send founder/customer/production/sensitive/secret content externally;
- allow opt-in training, founder provider/model choice, BYOK, custom prompts, arbitrary memory,
  aggregator/router, provider/tool autonomy, automatic fallback, or unbounded retries/repairs;
- prove provider/model quality, safety fitness, SLA, availability, latency, capacity, cost threshold,
  region, retention/deletion execution, tenant isolation, incident response, production rollback, or
  historical migration;
- store or expose raw prompts/completions, source/attachment/tenant bodies, provider error bodies,
  credentials, arbitrary transcripts, or hidden reasoning;
- complete AICO-008/030/032/033/076/077/079/082/086/087/090, MVP-CAP-011, full PRD/SRS acceptance,
  external alpha, R2/R6/R7, or the SRS definition of done; or
- treat documentation, agent review, structural validation, deterministic proof, green CI, or issue
  status as attributable human acceptance, production implementation, or release evidence.

Every later claim must name its evidence level, exact SHA/candidate/manifest digest, permanent result
URL, accountable owner, and remaining gaps. Missing or ambiguous evidence stays Pending/blocked and
never defaults to success.
