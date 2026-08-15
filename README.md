# AI Company OS Backend

NestJS control plane and durable worker for the first governed Prototype Initiative slice.

The implemented slice takes a local founder from Company/Profile creation through a bounded Goal, immutable Context Snapshot, Run, Product Manager Task, deterministic Product Brief, and the `AWAITING_BRIEF_APPROVAL` gate. PostgreSQL is authoritative for state, leases, ordered events, idempotency, budgets, and the transactional outbox. MinIO supplies the local S3-compatible storage boundary.

This repository is a backend foundation, not the full 16-week MVP. The parent delivery backlog remains authoritative for later approval, Designer, Engineer sandbox, QA/rework, preview, and export capabilities.

## Delivery governance

Every backend change must trace to an approved parent issue in the [AI Company OS delivery backlog](https://github.com/duckvhuynh/aicompanyos/blob/main/docs/delivery/BACKLOG.md) and [GitHub Project 2](https://github.com/users/duckvhuynh/projects/2). The parent [MVP scope](https://github.com/duckvhuynh/aicompanyos/blob/main/docs/product/MVP_SCOPE.md), [PRD](https://github.com/duckvhuynh/aicompanyos/blob/main/docs/product/PRD.md), and [SRS](https://github.com/duckvhuynh/aicompanyos/blob/main/docs/product/SRS.md) are the product authority.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before starting work. Backend pull requests are automatically rejected when they do not reference a parent issue in the form `duckvhuynh/aicompanyos#<number>` and complete the required traceability, acceptance-evidence, and MVP-scope sections.

## Architecture

- one NestJS codebase with separate `api`, `worker`, and one-shot `migrate` processes;
- PostgreSQL-backed task leasing using `FOR UPDATE SKIP LOCKED`;
- version-pinned, typed EMP-PM/DES/ENG/QA contracts rather than agent chat;
- transactionally coupled state, event, and outbox writes;
- server-derived founder/company scope with non-disclosing cross-tenant denials;
- deterministic zero-cost model provider for local and CI reproducibility;
- TypeORM only at the infrastructure boundary; migrations never use `synchronize`;
- API versioning at `/api/v1`, RFC 9457-style problems, command idempotency, and ETags.

Start with [001-system-architecture.md](docs/architecture/001-system-architecture.md), then read the [agent runtime contract](docs/contracts/AGENT_RUNTIME.md), [API/data contract](docs/contracts/API_AND_DATA.md), and [AEO observability/evaluation contract](docs/contracts/OBSERVABILITY_AND_EVALUATION.md).

## Run locally with Docker

Prerequisites: Docker Desktop with Compose v2+.

```bash
docker compose up --build -d
docker compose ps
npm run test:smoke
docker compose logs api worker
```

The API is available at `http://localhost:3000/api/v1`. MinIO's local console is at `http://localhost:9001`.

Stop the services without deleting data:

```bash
docker compose stop
```

To remove only this Compose project's containers and named development volumes:

```bash
docker compose down --volumes
```

## Develop without containerizing Node

Start only dependencies, copy `.env.example` to `.env`, run migrations, and start the two NestJS processes in separate terminals:

```bash
docker compose up -d postgres minio minio-init
npm install
npm run migration:run
npm run start:dev
npm run start:worker
```

`AUTH_MODE=development` is rejected unless `APP_ENV` is `local` or `test`. The public `POST /api/v1/auth/dev-token` helper is therefore not a production authentication design.

## Verify

```bash
npm run verify
npm run verify:ci
```

`npm run verify` is the fast source gate. `npm run verify:ci` is the canonical AICO-009 foreground verifier used locally and by GitHub Actions. It performs a clean lockfile install, governance validation, source/type/unit/contract/build checks, dependency audit, Compose validation, migration apply/revert/reapply, a tenant-scoped S3-compatible storage fixture, Docker image builds, and the HTTP smoke path. It owns a uniquely named disposable Compose project and removes only that project's containers and volumes in a `finally` cleanup.

`npm run verify:alpha-policy` validates the [AICO-008 alpha operating policy](docs/policies/alpha-operating-policy-v1.md), its strict machine-readable configuration, and the closed deliberate-failure registry without using a paid or external service.

The smoke test verifies readiness, authentication, company creation, identical-command replay, initiative/run creation, durable worker completion, ordered events, and a cross-tenant negative read. Run `npm run verify:fail-closed` to prove that the verifier rejects an injected failure at every named gate without changing tracked files.

## GitHub traceability

Architecture and implementation commits use parent issue references in the form `duckvhuynh/aicompanyos#<issue>`. The current foundation primarily implements or advances AICO-002/#2, AICO-003/#3, AICO-005/#5, AICO-006/#6, AICO-009/#9, AICO-010/#10, AICO-011/#11, AICO-013/#13, AICO-015/#15, AICO-016/#16, and AICO-022–025/#22–25.
