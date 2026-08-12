import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialControlPlane1723435200000 implements MigrationInterface {
  name = 'InitialControlPlane1723435200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE founders (
        id uuid PRIMARY KEY,
        auth_subject text NOT NULL UNIQUE,
        display_name text NOT NULL,
        status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE companies (
        id uuid PRIMARY KEY,
        founder_id uuid NOT NULL UNIQUE REFERENCES founders(id),
        name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
        status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETING', 'DELETED')),
        current_profile_version_id uuid,
        row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (id, founder_id)
      );

      CREATE TABLE company_profile_versions (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL REFERENCES companies(id),
        version integer NOT NULL CHECK (version > 0),
        purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 10 AND 1000),
        target_customer text NOT NULL CHECK (char_length(target_customer) BETWEEN 3 AND 500),
        constraints jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(constraints) = 'array'),
        normalized_limits jsonb NOT NULL CHECK (jsonb_typeof(normalized_limits) = 'object'),
        sensitive_data_warning_acknowledged boolean NOT NULL,
        created_by uuid NOT NULL REFERENCES founders(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (company_id, version),
        UNIQUE (company_id, id)
      );

      ALTER TABLE companies
        ADD CONSTRAINT companies_current_profile_fk
        FOREIGN KEY (id, current_profile_version_id)
        REFERENCES company_profile_versions(company_id, id)
        DEFERRABLE INITIALLY DEFERRED;

      CREATE TABLE initiatives (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL REFERENCES companies(id),
        type text NOT NULL CHECK (type = 'PROTOTYPE'),
        title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),
        status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'COMPLETED', 'FAILED', 'CANCELED')),
        current_goal_version_id uuid,
        row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (company_id, id)
      );

      CREATE UNIQUE INDEX initiatives_one_active_prototype
        ON initiatives(company_id)
        WHERE type = 'PROTOTYPE' AND status IN ('DRAFT', 'ACTIVE');

      CREATE TABLE goal_versions (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL REFERENCES companies(id),
        initiative_id uuid NOT NULL,
        version integer NOT NULL CHECK (version > 0),
        schema_version integer NOT NULL DEFAULT 1 CHECK (schema_version = 1),
        structured_goal jsonb NOT NULL CHECK (jsonb_typeof(structured_goal) = 'object'),
        attachment_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachment_ids) = 'array'),
        created_by uuid NOT NULL REFERENCES founders(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (initiative_id, version),
        UNIQUE (company_id, id),
        FOREIGN KEY (company_id, initiative_id) REFERENCES initiatives(company_id, id)
      );

      ALTER TABLE initiatives
        ADD CONSTRAINT initiatives_current_goal_fk
        FOREIGN KEY (company_id, current_goal_version_id)
        REFERENCES goal_versions(company_id, id)
        DEFERRABLE INITIALLY DEFERRED;

      CREATE TABLE context_snapshots (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL REFERENCES companies(id),
        company_profile_version_id uuid NOT NULL,
        goal_version_id uuid NOT NULL,
        answer_version_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(answer_version_ids) = 'array'),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (company_id, id),
        FOREIGN KEY (company_id, company_profile_version_id)
          REFERENCES company_profile_versions(company_id, id),
        FOREIGN KEY (company_id, goal_version_id)
          REFERENCES goal_versions(company_id, id)
      );

      CREATE TABLE runs (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL REFERENCES companies(id),
        initiative_id uuid NOT NULL,
        context_snapshot_id uuid NOT NULL,
        state text NOT NULL CHECK (state IN (
          'DRAFT', 'QUALIFYING', 'AWAITING_FOUNDER_INPUT', 'AWAITING_BRIEF_APPROVAL',
          'DESIGNING', 'AWAITING_DESIGN_APPROVAL', 'BUILDING', 'REVIEWING', 'REWORKING',
          'AWAITING_FINAL_APPROVAL', 'BLOCKED', 'FAILED', 'CANCELED', 'COMPLETED'
        )),
        stage text NOT NULL CHECK (stage IN ('INTAKE', 'PRODUCT', 'DESIGN', 'BUILD', 'QA', 'FINAL', 'TERMINAL')),
        row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
        workflow_version text NOT NULL,
        policy_version text NOT NULL,
        blocking_reason_code text,
        failure_reason_code text,
        cancellation_requested_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (company_id, id),
        FOREIGN KEY (company_id, initiative_id) REFERENCES initiatives(company_id, id),
        FOREIGN KEY (company_id, context_snapshot_id) REFERENCES context_snapshots(company_id, id)
      );

      CREATE INDEX runs_company_updated_idx ON runs(company_id, updated_at DESC, id DESC);
      CREATE INDEX runs_company_state_idx ON runs(company_id, state, updated_at DESC);

      CREATE TABLE run_event_counters (
        company_id uuid NOT NULL,
        run_id uuid NOT NULL,
        next_sequence bigint NOT NULL CHECK (next_sequence > 0),
        PRIMARY KEY (run_id),
        FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id)
      );

      CREATE TABLE employee_definitions (
        id uuid PRIMARY KEY,
        employee_key text NOT NULL CHECK (employee_key IN ('EMP-PM', 'EMP-DES', 'EMP-ENG', 'EMP-QA')),
        version integer NOT NULL CHECK (version > 0),
        role text NOT NULL,
        instruction_version text NOT NULL,
        output_schema_version text NOT NULL,
        rubric_version text NOT NULL,
        tool_grants jsonb NOT NULL DEFAULT '[]'::jsonb,
        memory_scope jsonb NOT NULL DEFAULT '[]'::jsonb,
        status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (employee_key, version)
      );

      INSERT INTO employee_definitions
        (id, employee_key, version, role, instruction_version, output_schema_version, rubric_version, tool_grants, memory_scope)
      VALUES
        ('019c0000-0000-7000-8000-000000000001', 'EMP-PM', 1, 'Product Manager', 'pm-v1', 'product-brief-v1', 'pm-v1', '[]', '["company_profile", "goal", "clarification_answers"]'),
        ('019c0000-0000-7000-8000-000000000002', 'EMP-DES', 1, 'Designer', 'designer-v1', 'design-spec-v1', 'design-v1', '[]', '["company_profile", "approved_product_brief"]'),
        ('019c0000-0000-7000-8000-000000000003', 'EMP-ENG', 1, 'Engineer', 'engineer-v1', 'source-snapshot-v1', 'build-v1', '["workspace_files", "allowlisted_commands"]', '["approved_product_brief", "approved_design_spec"]'),
        ('019c0000-0000-7000-8000-000000000004', 'EMP-QA', 1, 'Reviewer/QA', 'qa-v1', 'qa-report-v1', 'qa-v1', '["read_build_evidence", "allowed_checks"]', '["approved_requirements", "build_evidence"]');

      CREATE TABLE tasks (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL REFERENCES companies(id),
        run_id uuid NOT NULL,
        type text NOT NULL,
        owner_employee_definition_id uuid REFERENCES employee_definitions(id),
        state text NOT NULL CHECK (state IN ('QUEUED', 'READY', 'RUNNING', 'AWAITING_INPUT', 'RETRY_WAIT', 'SUCCEEDED', 'BLOCKED', 'FAILED', 'CANCELED')),
        priority integer NOT NULL DEFAULT 0,
        input_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
        attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
        lease_owner text,
        lease_token uuid,
        lease_expires_at timestamptz,
        available_at timestamptz NOT NULL DEFAULT now(),
        blocker_code text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        UNIQUE (company_id, run_id, id),
        FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id)
      );

      CREATE INDEX tasks_claim_idx
        ON tasks(state, available_at, priority DESC, created_at, id)
        WHERE state IN ('QUEUED', 'READY', 'RETRY_WAIT');
      CREATE INDEX tasks_run_state_idx ON tasks(company_id, run_id, state, created_at, id);

      CREATE TABLE task_attempts (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL,
        run_id uuid NOT NULL,
        task_id uuid NOT NULL,
        attempt_number integer NOT NULL CHECK (attempt_number > 0),
        idempotency_key uuid NOT NULL,
        input_manifest jsonb NOT NULL,
        runtime_manifest jsonb NOT NULL,
        status text NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'ABANDONED')),
        result_class text,
        output_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
        usage jsonb NOT NULL DEFAULT '{}'::jsonb,
        started_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        UNIQUE (task_id, attempt_number),
        UNIQUE (company_id, id),
        UNIQUE (idempotency_key),
        FOREIGN KEY (company_id, run_id, task_id) REFERENCES tasks(company_id, run_id, id)
      );

      CREATE TABLE artifacts (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL,
        run_id uuid NOT NULL,
        type text NOT NULL,
        logical_key text NOT NULL,
        current_version_id uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (company_id, run_id, type, logical_key),
        UNIQUE (company_id, id),
        FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id)
      );

      CREATE TABLE artifact_versions (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL,
        run_id uuid NOT NULL,
        artifact_id uuid NOT NULL,
        version integer NOT NULL CHECK (version > 0),
        schema_version text NOT NULL,
        content jsonb NOT NULL,
        checksum text NOT NULL CHECK (char_length(checksum) = 64),
        size_bytes integer NOT NULL CHECK (size_bytes >= 0),
        creator_type text NOT NULL,
        creator_version text NOT NULL,
        lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
        lifecycle_state text NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (lifecycle_state IN ('PUBLISHED', 'PENDING_APPROVAL', 'APPROVED', 'REVISION_REQUESTED', 'SUPERSEDED')),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (artifact_id, version),
        UNIQUE (company_id, id),
        FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id),
        FOREIGN KEY (company_id, artifact_id) REFERENCES artifacts(company_id, id)
      );

      ALTER TABLE artifacts
        ADD CONSTRAINT artifacts_current_version_fk
        FOREIGN KEY (company_id, current_version_id)
        REFERENCES artifact_versions(company_id, id)
        DEFERRABLE INITIALLY DEFERRED;

      CREATE TABLE approvals (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL,
        run_id uuid NOT NULL,
        gate text NOT NULL,
        artifact_version_id uuid NOT NULL,
        actor_id uuid NOT NULL REFERENCES founders(id),
        decision text NOT NULL CHECK (decision IN ('APPROVE', 'REQUEST_REVISION')),
        feedback text,
        idempotency_key uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (company_id, id),
        UNIQUE (actor_id, idempotency_key),
        FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id),
        FOREIGN KEY (company_id, artifact_version_id) REFERENCES artifact_versions(company_id, id)
      );

      CREATE TABLE policy_decisions (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL,
        run_id uuid NOT NULL,
        task_id uuid,
        attempt_id uuid,
        actor_type text NOT NULL,
        actor_id text NOT NULL,
        action text NOT NULL,
        resource_digest text NOT NULL,
        context_digest text NOT NULL,
        policy_version text NOT NULL,
        result text NOT NULL CHECK (result IN ('ALLOW', 'DENY')),
        reason_code text NOT NULL,
        expires_at timestamptz,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (company_id, id),
        FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id)
      );

      CREATE TABLE budget_ledgers (
        company_id uuid NOT NULL,
        run_id uuid NOT NULL,
        category text NOT NULL,
        hard_limit bigint NOT NULL CHECK (hard_limit >= 0),
        reserved bigint NOT NULL DEFAULT 0 CHECK (reserved >= 0),
        consumed bigint NOT NULL DEFAULT 0 CHECK (consumed >= 0),
        row_version integer NOT NULL DEFAULT 1,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (run_id, category),
        CHECK (reserved + consumed <= hard_limit),
        FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id)
      );

      CREATE TABLE events (
        id uuid PRIMARY KEY,
        schema_version integer NOT NULL DEFAULT 1,
        type text NOT NULL,
        company_id uuid NOT NULL REFERENCES companies(id),
        run_id uuid,
        run_sequence bigint,
        actor_type text NOT NULL,
        actor_id text NOT NULL,
        actor_version text,
        correlation_id uuid NOT NULL,
        causation_id uuid,
        audience text NOT NULL DEFAULT 'FOUNDER',
        data_classification text NOT NULL DEFAULT 'INTERNAL',
        payload jsonb NOT NULL,
        occurred_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (run_id, run_sequence),
        FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id),
        CHECK ((run_id IS NULL AND run_sequence IS NULL) OR (run_id IS NOT NULL AND run_sequence IS NOT NULL))
      );

      CREATE INDEX events_run_order_idx ON events(company_id, run_id, run_sequence);
      CREATE INDEX events_run_type_idx ON events(company_id, run_id, type, run_sequence);

      CREATE TABLE outbox_messages (
        id uuid PRIMARY KEY,
        event_id uuid NOT NULL UNIQUE REFERENCES events(id),
        topic text NOT NULL,
        envelope jsonb NOT NULL,
        available_at timestamptz NOT NULL DEFAULT now(),
        lease_owner text,
        lease_token uuid,
        lease_expires_at timestamptz,
        published_at timestamptz,
        attempts integer NOT NULL DEFAULT 0,
        last_error_class text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX outbox_claim_idx ON outbox_messages(available_at, id)
        WHERE published_at IS NULL;

      CREATE TABLE inbox_receipts (
        consumer_name text NOT NULL,
        event_id uuid NOT NULL REFERENCES events(id),
        received_at timestamptz NOT NULL DEFAULT now(),
        processed_at timestamptz,
        result_digest text,
        PRIMARY KEY (consumer_name, event_id)
      );

      CREATE TABLE idempotency_records (
        id uuid PRIMARY KEY,
        actor_id uuid NOT NULL REFERENCES founders(id),
        operation text NOT NULL,
        idempotency_key uuid NOT NULL,
        request_digest text NOT NULL,
        state text NOT NULL CHECK (state IN ('PROCESSING', 'COMPLETED')),
        response_status integer,
        response_body jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
        UNIQUE (actor_id, operation, idempotency_key)
      );

      CREATE INDEX idempotency_expiry_idx ON idempotency_records(expires_at);

      CREATE TABLE objects (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL REFERENCES companies(id),
        purpose text NOT NULL,
        storage_key text NOT NULL UNIQUE,
        media_type text NOT NULL,
        size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
        checksum text NOT NULL CHECK (char_length(checksum) = 64),
        scan_state text NOT NULL CHECK (scan_state IN ('PENDING', 'CLEAN', 'REJECTED')),
        state text NOT NULL CHECK (state IN ('PENDING', 'AVAILABLE', 'QUARANTINED', 'DELETED')),
        expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (company_id, id)
      );

      CREATE INDEX objects_retention_idx ON objects(company_id, state, expires_at);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS objects;
      DROP TABLE IF EXISTS idempotency_records;
      DROP TABLE IF EXISTS inbox_receipts;
      DROP TABLE IF EXISTS outbox_messages;
      DROP TABLE IF EXISTS events;
      DROP TABLE IF EXISTS budget_ledgers;
      DROP TABLE IF EXISTS policy_decisions;
      DROP TABLE IF EXISTS approvals;
      ALTER TABLE IF EXISTS artifacts DROP CONSTRAINT IF EXISTS artifacts_current_version_fk;
      DROP TABLE IF EXISTS artifact_versions;
      DROP TABLE IF EXISTS artifacts;
      DROP TABLE IF EXISTS task_attempts;
      DROP TABLE IF EXISTS tasks;
      DROP TABLE IF EXISTS employee_definitions;
      DROP TABLE IF EXISTS run_event_counters;
      DROP TABLE IF EXISTS runs;
      DROP TABLE IF EXISTS context_snapshots;
      ALTER TABLE IF EXISTS initiatives DROP CONSTRAINT IF EXISTS initiatives_current_goal_fk;
      DROP TABLE IF EXISTS goal_versions;
      DROP TABLE IF EXISTS initiatives;
      ALTER TABLE IF EXISTS companies DROP CONSTRAINT IF EXISTS companies_current_profile_fk;
      DROP TABLE IF EXISTS company_profile_versions;
      DROP TABLE IF EXISTS companies;
      DROP TABLE IF EXISTS founders;
    `);
  }
}
