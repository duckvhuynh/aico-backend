import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RuntimeEdgesAndTools1723435300000 implements MigrationInterface {
  name = 'RuntimeEdgesAndTools1723435300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE task_edges (
        company_id uuid NOT NULL,
        run_id uuid NOT NULL,
        from_task_id uuid NOT NULL,
        to_task_id uuid NOT NULL,
        edge_type text NOT NULL CHECK (edge_type IN ('REQUIRES', 'REWORK_OF')),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (run_id, from_task_id, to_task_id, edge_type),
        CHECK (from_task_id <> to_task_id),
        FOREIGN KEY (company_id, run_id, from_task_id) REFERENCES tasks(company_id, run_id, id),
        FOREIGN KEY (company_id, run_id, to_task_id) REFERENCES tasks(company_id, run_id, id)
      );

      CREATE TABLE tool_invocations (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL,
        run_id uuid NOT NULL,
        task_id uuid NOT NULL,
        attempt_id uuid NOT NULL,
        policy_decision_id uuid NOT NULL,
        tool_key text NOT NULL,
        tool_version text NOT NULL,
        request_digest text NOT NULL,
        status text NOT NULL CHECK (status IN ('REQUESTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN')),
        bounded_result_ref text,
        started_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        UNIQUE (company_id, id),
        FOREIGN KEY (company_id, run_id, task_id) REFERENCES tasks(company_id, run_id, id),
        FOREIGN KEY (company_id, attempt_id) REFERENCES task_attempts(company_id, id),
        FOREIGN KEY (company_id, policy_decision_id) REFERENCES policy_decisions(company_id, id)
      );

      CREATE INDEX tasks_expired_lease_idx ON tasks(lease_expires_at, id)
        WHERE state = 'RUNNING';
      CREATE INDEX tool_invocations_attempt_idx ON tool_invocations(company_id, attempt_id, started_at);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS tool_invocations;
      DROP TABLE IF EXISTS task_edges;
    `);
  }
}
