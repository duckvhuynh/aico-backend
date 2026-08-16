import { proveAico011DomainSchema } from './aico-011-domain-fixture.mjs';
import { run } from './process-utils.mjs';

const project = process.env.AICO_VERIFY_PROJECT;
if (!project) throw new Error('AICO_VERIFY_PROJECT is required.');

const compose = (...args) => run('docker', ['compose', '-p', project, ...args]);
const query = (sql) =>
  run(
    'docker',
    [
      'compose',
      '-p',
      project,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'aico',
      '-d',
      'aico',
      '-Atc',
      sql,
    ],
    { capture: true },
  ).stdout.trim();

compose('run', '--rm', 'migrate');
if (query('SELECT count(*) FROM aico_migrations;') !== '4') {
  throw new Error('Expected all four migrations after clean apply.');
}
if (
  query(`
    SELECT
      to_regclass('public.human_waits') IS NOT NULL
      AND to_regclass('public.clarification_answer_versions') IS NOT NULL
      AND to_regclass('public.context_snapshot_answers') IS NOT NULL
      AND to_regclass('public.local_event_projections') IS NOT NULL
      AND to_regclass('public.model_invocation_effects') IS NOT NULL
      AND to_regclass('public.founder_invites') IS NOT NULL
      AND to_regclass('public.founder_sessions') IS NOT NULL;
  `) !== 't'
) {
  throw new Error('Durable wait or invite/session schema was not created by migration apply.');
}

proveAico011DomainSchema(query);

compose('run', '--rm', 'migrate', 'npm', 'run', 'migration:revert:prod');
if (query('SELECT count(*) FROM aico_migrations;') !== '3') {
  throw new Error('Expected three migrations after reverting the latest migration.');
}
if (
  query(`
    SELECT
      to_regclass('public.founder_invites') IS NULL
      AND to_regclass('public.founder_sessions') IS NULL
      AND to_regclass('public.human_waits') IS NOT NULL
      AND to_regclass('public.task_edges') IS NOT NULL;
  `) !== 't'
) {
  throw new Error('Invite/session schema was not removed by migration revert.');
}

query(`
  INSERT INTO founders (id, auth_subject, display_name)
  VALUES ('019c1000-0000-7000-8000-000000000001', 'migration:fixture', 'Migration Fixture');
  INSERT INTO companies (id, founder_id, name)
  VALUES (
    '019c1000-0000-7000-8000-000000000002',
    '019c1000-0000-7000-8000-000000000001',
    'Migration Fixture Company'
  );
  INSERT INTO company_profile_versions
    (id, company_id, version, purpose, target_customer, normalized_limits,
     sensitive_data_warning_acknowledged, created_by)
  VALUES (
    '019c1000-0000-7000-8000-000000000003',
    '019c1000-0000-7000-8000-000000000002',
    1,
    'Prove migration compatibility with pre-existing history.',
    'Migration verification',
    '{}',
    true,
    '019c1000-0000-7000-8000-000000000001'
  );
  UPDATE companies
  SET current_profile_version_id = '019c1000-0000-7000-8000-000000000003'
  WHERE id = '019c1000-0000-7000-8000-000000000002';
  INSERT INTO initiatives (id, company_id, type, title, status)
  VALUES (
    '019c1000-0000-7000-8000-000000000004',
    '019c1000-0000-7000-8000-000000000002',
    'PROTOTYPE',
    'Pre-existing initiative',
    'ACTIVE'
  );
  INSERT INTO goal_versions
    (id, company_id, initiative_id, version, schema_version, structured_goal, created_by)
  VALUES (
    '019c1000-0000-7000-8000-000000000005',
    '019c1000-0000-7000-8000-000000000002',
    '019c1000-0000-7000-8000-000000000004',
    1,
    1,
    '{}',
    '019c1000-0000-7000-8000-000000000001'
  );
  UPDATE initiatives
  SET current_goal_version_id = '019c1000-0000-7000-8000-000000000005'
  WHERE id = '019c1000-0000-7000-8000-000000000004';
  INSERT INTO context_snapshots
    (id, company_id, company_profile_version_id, goal_version_id)
  VALUES (
    '019c1000-0000-7000-8000-000000000006',
    '019c1000-0000-7000-8000-000000000002',
    '019c1000-0000-7000-8000-000000000003',
    '019c1000-0000-7000-8000-000000000005'
  );
  INSERT INTO runs
    (id, company_id, initiative_id, context_snapshot_id, state, stage,
     workflow_version, policy_version)
  VALUES (
    '019c1000-0000-7000-8000-000000000007',
    '019c1000-0000-7000-8000-000000000002',
    '019c1000-0000-7000-8000-000000000004',
    '019c1000-0000-7000-8000-000000000006',
    'DRAFT',
    'INTAKE',
    'prototype-run/v1',
    'mvp-v1'
  );
  INSERT INTO run_event_counters (company_id, run_id, next_sequence)
  VALUES (
    '019c1000-0000-7000-8000-000000000002',
    '019c1000-0000-7000-8000-000000000007',
    2
  );
  INSERT INTO events
    (id, type, company_id, run_id, run_sequence, actor_type, actor_id,
     correlation_id, payload)
  VALUES (
    '019c1000-0000-7000-8000-000000000008',
    'migration_fixture_created',
    '019c1000-0000-7000-8000-000000000002',
    '019c1000-0000-7000-8000-000000000007',
    1,
    'SYSTEM',
    'migration-fixture/v1',
    '019c1000-0000-7000-8000-000000000009',
    '{}'
  );
`);

compose('run', '--rm', 'migrate');
if (query('SELECT count(*) FROM aico_migrations;') !== '4') {
  throw new Error('Expected all four migrations after forward reapply.');
}
if (
  query(`
    SELECT
      to_regclass('public.human_waits') IS NOT NULL
      AND to_regclass('public.founder_invites') IS NOT NULL
      AND to_regclass('public.founder_sessions') IS NOT NULL;
  `) !== 't'
) {
  throw new Error('Invite/session schema was not restored by forward reapply.');
}
if (
  query(`
    SELECT workflow_version || '|' || (
      SELECT run_sequence::text FROM events
      WHERE id = '019c1000-0000-7000-8000-000000000008'
    )
    FROM runs
    WHERE id = '019c1000-0000-7000-8000-000000000007';
  `) !== 'prototype-run/v1|1'
) {
  throw new Error('Forward reapply did not preserve pre-existing run history and workflow pin.');
}

query(`
  INSERT INTO founder_invites
    (id, email, display_name, token_hash, status, expires_at, session_ttl_seconds)
  VALUES (
    '019c1200-0000-7000-8000-000000000001',
    'migration.invite@example.test',
    'Migration Invite',
    repeat('a', 64),
    'PENDING',
    now() + interval '1 day',
    900
  );
`);
const blockedRevert = run(
  'docker',
  ['compose', '-p', project, 'run', '--rm', 'migrate', 'npm', 'run', 'migration:revert:prod'],
  { capture: true, allowFailure: true },
);
if (blockedRevert.status === 0) {
  throw new Error('Schema-down rollback did not fail closed after invite data existed.');
}
if (
  query('SELECT count(*) FROM aico_migrations;') !== '4' ||
  query("SELECT to_regclass('public.founder_invites') IS NOT NULL;") !== 't'
) {
  throw new Error('Failed schema-down rollback did not preserve forward schema and data.');
}

console.log(
  'Migration fixture passed: clean apply, AICO-011 domain factory/invariants, AICO-012 invite/session schema, pre-use revert, populated-history reapply, workflow pin, and fail-closed post-use rollback.',
);
