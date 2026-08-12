# AICO-009 Verification Evidence

**Parent issue:** `duckvhuynh/aicompanyos#9`  
**Backend issue:** `duckvhuynh/aico-backend#4`  
**Evidence date:** 2026-08-12  
**Canonical command:** `npm run verify:ci`

## Acceptance reconciliation

| Parent acceptance criterion                                                                                               | Evidence                                                                                                                                                                                                                                                                                                                       | Result                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| One documented foreground command matches required CI checks; no developer-managed server/background process is required. | `scripts/verify-ci.mjs` is called locally and by the single GitHub Actions `verify` job. It owns a uniquely named disposable Compose project and removes its containers/volumes in `finally`.                                                                                                                                  | Pass                                                     |
| Pull requests block on lint/static/type, unit/contract, migration, and production-build failures.                         | The verifier exits non-zero on any gate and `npm run verify:fail-closed` probes all named gates. GitHub Actions reports the combined `verify` status. Repository-level required-check enforcement cannot be configured on the current private GitHub plan; the API returns HTTP 403 requiring GitHub Pro or public visibility. | Verifier pass; repository enforcement externally blocked |
| Deterministic model/build/storage fixtures run without paid external calls and a deliberate failure proves each gate.     | Deterministic PM unit test, local Docker image build, tenant-scoped MinIO fixture, 16-gate fail-closed harness, and HTTP smoke test all run without paid services.                                                                                                                                                             | Pass                                                     |

## Gate manifest

The committed manifest in `scripts/verification-gates.mjs` covers:

1. clean lockfile install;
2. parent-issue PR governance;
3. fail-closed probes;
4. formatting;
5. lint/static analysis;
6. TypeScript type checking;
7. unit and contract tests;
8. production build;
9. dependency audit;
10. Compose configuration;
11. API/worker/migration image builds;
12. isolated PostgreSQL and MinIO health;
13. one-shot object-store initialization;
14. migration apply, latest revert, and forward reapply;
15. tenant-keyed object put/head/get/checksum and cross-tenant denial; and
16. full API/worker HTTP smoke verification.

## Local evidence

The final local run completed in 174.3 seconds with:

- clean `npm ci` and zero audit vulnerabilities;
- 4 suites, 11 tests, 0 failures;
- valid and invalid versioned Goal DTO contract cases;
- all 16 injected gate failures rejected;
- two migrations applied, the latest reverted, and both reapplied;
- `task_edges` removed on revert and restored on reapply;
- deterministic MinIO tenant put/head/get/checksum and cross-tenant denial;
- HTTP smoke result `status: passed`; and
- all disposable verification containers, networks, and volumes removed.

The pre-existing developer Compose project remained healthy and was not modified or removed.

## Known external limitation

The authenticated repository APIs for branch protection and repository rulesets both return:

> Upgrade to GitHub Pro or make this repository public to enable this feature.

Consequently, this work does not claim server-side required-check enforcement. Until repository protection is available, the enforced delivery procedure is: do not merge an AICO backend pull request unless the `verify` workflow is green and the parent/child acceptance evidence has been reconciled. This limitation remains explicit evidence on the parent issue rather than a silently waived control.
