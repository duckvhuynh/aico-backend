import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DurableHumanWaitSpike1723435400000 implements MigrationInterface {
  name = 'DurableHumanWaitSpike1723435400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX runs_company_id_workflow_version_uq
        ON runs(company_id, id, workflow_version);
      CREATE UNIQUE INDEX artifact_versions_company_run_id_uq
        ON artifact_versions(company_id, run_id, id);
      CREATE UNIQUE INDEX events_company_run_id_uq
        ON events(company_id, run_id, id);

      CREATE TABLE human_waits (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL,
        run_id uuid NOT NULL,
        task_id uuid,
        workflow_version text NOT NULL CHECK (char_length(workflow_version) > 0),
        wait_kind text NOT NULL CHECK (wait_kind IN (
          'CLARIFICATION', 'BRIEF_APPROVAL', 'DESIGN_APPROVAL',
          'FINAL_APPROVAL', 'RECOVERY_DECISION'
        )),
        wait_version integer NOT NULL CHECK (wait_version > 0),
        request_id uuid NOT NULL,
        request_version integer NOT NULL CHECK (request_version > 0),
        expected_run_state text NOT NULL CHECK (expected_run_state IN (
          'DRAFT', 'QUALIFYING', 'AWAITING_FOUNDER_INPUT', 'AWAITING_BRIEF_APPROVAL',
          'DESIGNING', 'AWAITING_DESIGN_APPROVAL', 'BUILDING', 'REVIEWING', 'REWORKING',
          'AWAITING_FINAL_APPROVAL', 'BLOCKED', 'FAILED', 'CANCELED', 'COMPLETED'
        )),
        expected_run_row_version integer NOT NULL CHECK (expected_run_row_version > 0),
        resume_run_state text NOT NULL CHECK (resume_run_state IN (
          'DRAFT', 'QUALIFYING', 'AWAITING_FOUNDER_INPUT', 'AWAITING_BRIEF_APPROVAL',
          'DESIGNING', 'AWAITING_DESIGN_APPROVAL', 'BUILDING', 'REVIEWING', 'REWORKING',
          'AWAITING_FINAL_APPROVAL', 'BLOCKED', 'FAILED', 'CANCELED', 'COMPLETED'
        )),
        context_snapshot_id uuid NOT NULL,
        artifact_version_id uuid,
        response_schema_id text NOT NULL CHECK (char_length(response_schema_id) > 0),
        response_schema_version text NOT NULL CHECK (char_length(response_schema_version) > 0),
        reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb
          CHECK (jsonb_typeof(reason_codes) = 'array'),
        status text NOT NULL DEFAULT 'OPEN'
          CHECK (status IN ('OPEN', 'RESOLVED', 'CANCELED', 'EXPIRED')),
        expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        resolved_at timestamptz,
        resolved_by_command_id uuid,
        resolved_by_event_id uuid,
        continuation_task_id uuid,
        UNIQUE (company_id, id),
        UNIQUE (company_id, run_id, id),
        UNIQUE (
          company_id, run_id, id, request_id, request_version, context_snapshot_id,
          response_schema_id, response_schema_version
        ),
        FOREIGN KEY (company_id, run_id, workflow_version)
          REFERENCES runs(company_id, id, workflow_version),
        FOREIGN KEY (company_id, context_snapshot_id)
          REFERENCES context_snapshots(company_id, id),
        FOREIGN KEY (company_id, run_id, task_id)
          REFERENCES tasks(company_id, run_id, id),
        FOREIGN KEY (company_id, run_id, artifact_version_id)
          REFERENCES artifact_versions(company_id, run_id, id),
        FOREIGN KEY (company_id, run_id, resolved_by_event_id)
          REFERENCES events(company_id, run_id, id),
        FOREIGN KEY (company_id, run_id, continuation_task_id)
          REFERENCES tasks(company_id, run_id, id),
        CHECK (expires_at IS NULL OR expires_at > created_at),
        CHECK (
          (status = 'OPEN' AND resolved_at IS NULL AND resolved_by_command_id IS NULL
            AND resolved_by_event_id IS NULL AND continuation_task_id IS NULL)
          OR
          (status = 'RESOLVED' AND resolved_at IS NOT NULL AND resolved_by_command_id IS NOT NULL
            AND resolved_by_event_id IS NOT NULL AND continuation_task_id IS NOT NULL)
          OR
          (status IN ('CANCELED', 'EXPIRED') AND resolved_at IS NOT NULL
            AND continuation_task_id IS NULL)
        )
      );

      CREATE UNIQUE INDEX human_waits_one_open_per_run
        ON human_waits(run_id)
        WHERE status = 'OPEN';
      CREATE INDEX human_waits_company_run_status_idx
        ON human_waits(company_id, run_id, status, created_at, id);

      CREATE TABLE clarification_answer_versions (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL,
        run_id uuid NOT NULL,
        wait_id uuid NOT NULL,
        version integer NOT NULL DEFAULT 1 CHECK (version = 1),
        request_id uuid NOT NULL,
        request_version integer NOT NULL CHECK (request_version > 0),
        source_context_snapshot_id uuid NOT NULL,
        response_schema_id text NOT NULL CHECK (char_length(response_schema_id) > 0),
        response_schema_version text NOT NULL CHECK (char_length(response_schema_version) > 0),
        content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
        content_digest text NOT NULL CHECK (char_length(content_digest) = 64),
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (wait_id),
        UNIQUE (company_id, id),
        FOREIGN KEY (
          company_id, run_id, wait_id, request_id, request_version, source_context_snapshot_id,
          response_schema_id, response_schema_version
        ) REFERENCES human_waits(
          company_id, run_id, id, request_id, request_version, context_snapshot_id,
          response_schema_id, response_schema_version
        ),
        FOREIGN KEY (company_id, created_by) REFERENCES companies(id, founder_id)
      );

      CREATE INDEX clarification_answers_company_run_idx
        ON clarification_answer_versions(company_id, run_id, created_at, id);

      CREATE TABLE context_snapshot_answers (
        company_id uuid NOT NULL,
        context_snapshot_id uuid NOT NULL,
        answer_version_id uuid NOT NULL,
        ordinal integer NOT NULL CHECK (ordinal >= 0),
        PRIMARY KEY (company_id, context_snapshot_id, answer_version_id),
        UNIQUE (company_id, context_snapshot_id, ordinal),
        FOREIGN KEY (company_id, context_snapshot_id)
          REFERENCES context_snapshots(company_id, id),
        FOREIGN KEY (company_id, answer_version_id)
          REFERENCES clarification_answer_versions(company_id, id)
      );

      CREATE TABLE local_event_projections (
        consumer_name text NOT NULL,
        event_id uuid NOT NULL,
        projection_key text NOT NULL,
        result_digest text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (consumer_name, event_id),
        UNIQUE (consumer_name, projection_key),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      );

      CREATE TABLE model_invocation_effects (
        effect_key text PRIMARY KEY CHECK (char_length(effect_key) = 64),
        company_id uuid NOT NULL,
        run_id uuid NOT NULL,
        task_id uuid NOT NULL,
        attempt_id uuid NOT NULL,
        provider text NOT NULL,
        status text NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'UNKNOWN')),
        invocation_count integer NOT NULL DEFAULT 0 CHECK (invocation_count BETWEEN 0 AND 1),
        output_digest text,
        usage jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        UNIQUE (company_id, run_id, task_id),
        UNIQUE (attempt_id),
        FOREIGN KEY (company_id, run_id, task_id)
          REFERENCES tasks(company_id, run_id, id),
        FOREIGN KEY (company_id, attempt_id)
          REFERENCES task_attempts(company_id, id),
        CHECK (
          (status = 'RUNNING' AND completed_at IS NULL AND output_digest IS NULL)
          OR (status = 'SUCCEEDED' AND completed_at IS NOT NULL AND output_digest IS NOT NULL)
          OR (status = 'UNKNOWN' AND completed_at IS NOT NULL)
        )
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM human_waits)
          OR EXISTS (SELECT 1 FROM clarification_answer_versions)
          OR EXISTS (SELECT 1 FROM context_snapshot_answers)
          OR EXISTS (SELECT 1 FROM local_event_projections)
          OR EXISTS (SELECT 1 FROM model_invocation_effects)
        THEN
          RAISE EXCEPTION 'durable wait schema contains data; deploy a forward migration instead of schema-down rollback';
        END IF;
      END $$;
      DROP TABLE IF EXISTS model_invocation_effects;
      DROP TABLE IF EXISTS local_event_projections;
      DROP TABLE IF EXISTS context_snapshot_answers;
      DROP TABLE IF EXISTS clarification_answer_versions;
      DROP TABLE IF EXISTS human_waits;
      DROP INDEX IF EXISTS events_company_run_id_uq;
      DROP INDEX IF EXISTS artifact_versions_company_run_id_uq;
      DROP INDEX IF EXISTS runs_company_id_workflow_version_uq;
    `);
  }
}
