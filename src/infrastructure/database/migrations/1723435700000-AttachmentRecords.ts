import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AttachmentRecords1723435700000 implements MigrationInterface {
  name = 'AttachmentRecords1723435700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE object_records DROP CONSTRAINT object_records_purpose_check;
      ALTER TABLE object_records
        ADD CONSTRAINT object_records_purpose_check
        CHECK (purpose IN ('quality-fixture', 'attachment'));
      ALTER TABLE object_records
        ADD COLUMN declared_media_type text,
        ADD COLUMN detected_media_type text,
        ADD COLUMN original_filename text,
        ADD COLUMN scan_state text NOT NULL DEFAULT 'CLEAN'
          CHECK (scan_state IN ('PENDING', 'CLEAN', 'REJECTED', 'QUARANTINED')),
        ADD COLUMN scan_reason_code text,
        ADD COLUMN expires_at timestamptz;
      ALTER TABLE object_records
        ADD CONSTRAINT object_records_attachment_metadata_check
        CHECK (
          purpose <> 'attachment'
          OR (
            declared_media_type IS NOT NULL
            AND detected_media_type IS NOT NULL
            AND original_filename IS NOT NULL
          )
        );

      CREATE TABLE goal_version_attachments (
        company_id uuid NOT NULL,
        goal_version_id uuid NOT NULL,
        object_id uuid NOT NULL,
        ordinal integer NOT NULL CHECK (ordinal >= 0),
        PRIMARY KEY (company_id, goal_version_id, ordinal),
        UNIQUE (company_id, goal_version_id, object_id),
        FOREIGN KEY (company_id, goal_version_id)
          REFERENCES goal_versions(company_id, id),
        FOREIGN KEY (company_id, object_id)
          REFERENCES object_records(company_id, id)
      );

      CREATE TABLE attachment_retrieval_grants (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL REFERENCES companies(id),
        object_id uuid NOT NULL,
        run_id uuid NOT NULL,
        expires_at timestamptz NOT NULL,
        consumed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (company_id, id),
        FOREIGN KEY (company_id, object_id) REFERENCES object_records(company_id, id),
        FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id)
      );

      CREATE INDEX attachment_grants_expiry_idx
        ON attachment_retrieval_grants(company_id, expires_at, id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM object_records WHERE company_id IS NOT NULL AND purpose = 'attachment')
           OR EXISTS (SELECT 1 FROM goal_version_attachments WHERE company_id IS NOT NULL)
           OR EXISTS (SELECT 1 FROM attachment_retrieval_grants WHERE company_id IS NOT NULL) THEN
          RAISE EXCEPTION 'attachment records exist; deploy a forward migration instead of schema-down rollback';
        END IF;
      END $$;
      DROP TABLE IF EXISTS attachment_retrieval_grants;
      DROP TABLE IF EXISTS goal_version_attachments;
      ALTER TABLE object_records
        DROP CONSTRAINT IF EXISTS object_records_attachment_metadata_check;
      ALTER TABLE object_records
        DROP COLUMN IF EXISTS declared_media_type,
        DROP COLUMN IF EXISTS detected_media_type,
        DROP COLUMN IF EXISTS original_filename,
        DROP COLUMN IF EXISTS scan_state,
        DROP COLUMN IF EXISTS scan_reason_code,
        DROP COLUMN IF EXISTS expires_at;
      ALTER TABLE object_records DROP CONSTRAINT object_records_purpose_check;
      ALTER TABLE object_records
        ADD CONSTRAINT object_records_purpose_check
        CHECK (purpose IN ('quality-fixture'));
    `);
  }
}
