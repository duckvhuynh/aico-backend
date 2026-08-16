import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InviteSessionLifecycle1723435500000 implements MigrationInterface {
  name = 'InviteSessionLifecycle1723435500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE founder_invites (
        id uuid PRIMARY KEY,
        email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
        display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 100),
        token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
        status text NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING', 'REDEEMED', 'REVOKED', 'EXPIRED')),
        expires_at timestamptz NOT NULL,
        session_ttl_seconds integer NOT NULL DEFAULT 900
          CHECK (session_ttl_seconds BETWEEN 1 AND 900),
        redeemed_founder_id uuid REFERENCES founders(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (
          (status = 'REDEEMED' AND redeemed_founder_id IS NOT NULL)
          OR (status <> 'REDEEMED' AND redeemed_founder_id IS NULL)
        )
      );

      CREATE INDEX founder_invites_email_pending_idx
        ON founder_invites(email)
        WHERE status = 'PENDING';

      CREATE TABLE founder_sessions (
        id uuid PRIMARY KEY,
        founder_id uuid NOT NULL REFERENCES founders(id),
        status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (
          (status = 'ACTIVE' AND revoked_at IS NULL)
          OR (status = 'REVOKED' AND revoked_at IS NOT NULL)
        )
      );

      CREATE INDEX founder_sessions_founder_active_idx
        ON founder_sessions(founder_id, expires_at)
        WHERE status = 'ACTIVE';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM founder_invites)
          OR EXISTS (SELECT 1 FROM founder_sessions)
        THEN
          RAISE EXCEPTION 'invite/session schema contains data; deploy a forward migration instead of schema-down rollback';
        END IF;
      END $$;
      DROP TABLE IF EXISTS founder_sessions;
      DROP TABLE IF EXISTS founder_invites;
    `);
  }
}
