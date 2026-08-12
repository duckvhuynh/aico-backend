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
if (query('SELECT count(*) FROM aico_migrations;') !== '2') {
  throw new Error('Expected both migrations after clean apply.');
}

compose('run', '--rm', 'migrate', 'npm', 'run', 'migration:revert:prod');
if (query('SELECT count(*) FROM aico_migrations;') !== '1') {
  throw new Error('Expected one migration after reverting the latest migration.');
}
if (query("SELECT to_regclass('public.task_edges') IS NULL;") !== 't') {
  throw new Error('Latest runtime schema was not removed by migration revert.');
}

compose('run', '--rm', 'migrate');
if (query('SELECT count(*) FROM aico_migrations;') !== '2') {
  throw new Error('Expected both migrations after forward reapply.');
}
if (query("SELECT to_regclass('public.task_edges') IS NOT NULL;") !== 't') {
  throw new Error('Runtime schema was not restored by forward reapply.');
}

console.log('Migration fixture passed: clean apply, latest revert, and forward reapply.');
