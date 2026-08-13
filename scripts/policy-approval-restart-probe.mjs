import pg from 'pg';

const databaseUrl = process.env.AICO_PROOF_DATABASE_URL;
const schema = process.env.AICO_PROOF_SCHEMA;
const companyId = process.env.AICO_PROOF_COMPANY_ID;
const runId = process.env.AICO_PROOF_RUN_ID;
const mode = process.env.AICO_PROOF_MODE ?? 'inspect';
if (!databaseUrl || !schema || !companyId || !runId) {
  throw new Error('AICO-006 restart probe environment is incomplete.');
}
if (!/^aico006_[a-z0-9_]{8,48}$/.test(schema)) {
  throw new Error('Invalid AICO-006 proof schema.');
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query(`SET search_path TO "${schema}", public`);
  if (mode === 'hold-precommit') {
    await client.query('BEGIN');
    await client.query(
      `UPDATE runs SET state='DESIGNING', stage='DESIGN', row_version=row_version+1
        WHERE company_id=$1 AND id=$2`,
      [companyId, runId],
    );
    process.stdout.write(
      `${JSON.stringify({ process_id: process.pid, state: 'PRECOMMIT_HELD' })}\n`,
    );
    await client.query('SELECT pg_sleep(30)');
    throw new Error('Precommit hold was not terminated by the proof runner.');
  }
  const result = await client.query(
    `SELECT r.state, r.stage, r.row_version,
            g.status AS gate_status,
            count(DISTINCT d.id)::integer AS decisions,
            count(DISTINCT c.id)::integer AS continuations,
            count(DISTINCT e.id)::integer AS events
       FROM runs r
       JOIN gate_instances g ON g.company_id = r.company_id AND g.run_id = r.id
       LEFT JOIN founder_gate_decisions d
         ON d.company_id = r.company_id AND d.run_id = r.id
       LEFT JOIN continuation_intents c
         ON c.company_id = r.company_id AND c.run_id = r.id
       LEFT JOIN domain_events e
         ON e.company_id = r.company_id AND e.run_id = r.id
      WHERE r.company_id = $1 AND r.id = $2
      GROUP BY r.state, r.stage, r.row_version, g.status`,
    [companyId, runId],
  );
  if (result.rows.length !== 1) throw new Error('Restart probe could not reconstruct the run.');
  process.stdout.write(`${JSON.stringify({ process_id: process.pid, ...result.rows[0] })}\n`);
} finally {
  await client.end();
}
