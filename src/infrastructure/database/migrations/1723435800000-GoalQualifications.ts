import type { MigrationInterface, QueryRunner } from 'typeorm';

export class GoalQualifications1723435800000 implements MigrationInterface {
  name = 'GoalQualifications1723435800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE goal_qualifications (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL REFERENCES companies(id),
        initiative_id uuid NOT NULL,
        goal_version_id uuid NOT NULL,
        run_id uuid,
        result text NOT NULL CHECK (result IN ('qualified', 'needs_clarification', 'out_of_scope')),
        reason_codes jsonb NOT NULL CHECK (jsonb_typeof(reason_codes) = 'array'),
        explanation text NOT NULL,
        proposal text,
        clarification_questions jsonb NOT NULL DEFAULT '[]'::jsonb
          CHECK (jsonb_typeof(clarification_questions) = 'array'),
        screen_estimate integer NOT NULL CHECK (screen_estimate >= 0),
        policy_version text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (company_id, id),
        UNIQUE (company_id, goal_version_id),
        FOREIGN KEY (company_id, initiative_id) REFERENCES initiatives(company_id, id),
        FOREIGN KEY (company_id, goal_version_id) REFERENCES goal_versions(company_id, id),
        FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id),
        CHECK (
          (result = 'out_of_scope' AND proposal IS NOT NULL AND char_length(proposal) > 0)
          OR (result <> 'out_of_scope' AND proposal IS NULL)
        ),
        CHECK (
          (result = 'needs_clarification'
            AND jsonb_array_length(clarification_questions) BETWEEN 1 AND 5)
          OR (result <> 'needs_clarification'
            AND jsonb_array_length(clarification_questions) = 0)
        )
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM goal_qualifications) THEN
          RAISE EXCEPTION 'goal qualifications exist; deploy a forward migration instead of schema-down rollback';
        END IF;
      END $$;
      DROP TABLE IF EXISTS goal_qualifications;
    `);
  }
}
