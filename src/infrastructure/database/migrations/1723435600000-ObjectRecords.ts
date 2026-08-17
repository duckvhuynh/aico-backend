import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ObjectRecords1723435600000 implements MigrationInterface {
  name = 'ObjectRecords1723435600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE object_records (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL REFERENCES companies(id),
        purpose text NOT NULL CHECK (purpose IN ('quality-fixture')),
        object_key text NOT NULL,
        checksum_sha256 text NOT NULL CHECK (char_length(checksum_sha256) = 64),
        size_bytes integer NOT NULL CHECK (size_bytes >= 0),
        version integer NOT NULL DEFAULT 1 CHECK (version > 0),
        lifecycle_state text NOT NULL DEFAULT 'READY'
          CHECK (lifecycle_state IN ('STAGED', 'READY', 'DELETED')),
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        UNIQUE (company_id, id),
        UNIQUE (company_id, object_key),
        CHECK (
          (lifecycle_state = 'DELETED' AND deleted_at IS NOT NULL)
          OR (lifecycle_state <> 'DELETED' AND deleted_at IS NULL)
        )
      );

      CREATE INDEX object_records_company_state_idx
        ON object_records(company_id, lifecycle_state, created_at, id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM object_records) THEN
          RAISE EXCEPTION 'object_records contains data; deploy a forward migration instead of schema-down rollback';
        END IF;
      END $$;
      DROP TABLE IF EXISTS object_records;
    `);
  }
}
