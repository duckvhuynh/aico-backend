import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { run } from './process-utils.mjs';

const project = process.env.AICO_VERIFY_PROJECT;
if (!project) throw new Error('AICO_VERIFY_PROJECT is required.');
const baseUrl = process.env.AICO_BASE_URL;
if (!baseUrl) throw new Error('AICO_BASE_URL is required.');

const composeArgs = ['compose', '-p', project];
const compose = (...args) => run('docker', [...composeArgs, ...args]);
const query = (sql) =>
  run(
    'docker',
    [...composeArgs, 'exec', '-T', 'postgres', 'psql', '-U', 'aico', '-d', 'aico', '-Atc', sql],
    { capture: true },
  ).stdout.trim();
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

async function call(path, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, options);
      const body = await response.json();
      return { response, body };
    } catch (error) {
      lastError = error;
      await delay(200);
    }
  }
  throw lastError;
}

function spike(command, value = {}, options = {}) {
  const args = [
    ...composeArgs,
    'run',
    '--rm',
    '-e',
    `AICO_SPIKE_COMMAND=${command}`,
    '-e',
    `AICO_SPIKE_INPUT_BASE64=${encode(value)}`,
    '-e',
    `WORKER_ID=${options.workerId ?? `spike-${command}-${randomUUID()}`}`,
  ];
  for (const [key, entry] of Object.entries(options.environment ?? {})) {
    args.push('-e', `${key}=${entry}`);
  }
  args.push('worker', 'node', 'dist/durable-wait-spike.js');
  const result = run('docker', args, { capture: true, allowFailure: options.allowFailure });
  const output = (result.status === 0 ? result.stdout : result.stderr).trim().split(/\r?\n/).at(-1);
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error(`Could not parse ${command} output: ${result.stdout}\n${result.stderr}`);
  }
  return { status: result.status, ...parsed };
}

function spikeAsync(command, value = {}, options = {}) {
  const args = [
    ...composeArgs,
    'run',
    '--rm',
    '-e',
    `AICO_SPIKE_COMMAND=${command}`,
    '-e',
    `AICO_SPIKE_INPUT_BASE64=${encode(value)}`,
    '-e',
    `WORKER_ID=${options.workerId ?? `spike-${command}-${randomUUID()}`}`,
  ];
  for (const [key, entry] of Object.entries(options.environment ?? {})) {
    args.push('-e', `${key}=${entry}`);
  }
  args.push('worker', 'node', 'dist/durable-wait-spike.js');
  const child = spawn('docker', args, { cwd: process.cwd(), env: process.env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));
  return {
    completion: new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (status) => {
        const output = (status === 0 ? stdout : stderr).trim().split(/\r?\n/).at(-1);
        try {
          resolve({ status, ...JSON.parse(output) });
        } catch {
          reject(new Error(`Could not parse async ${command} output: ${stdout}\n${stderr}`));
        }
      });
    }),
  };
}

async function createRun(label) {
  const token = await call('/auth/dev-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: `a2-${label.slice(0, 12)}-${randomUUID().slice(0, 8)}@example.test`,
      display_name: `AICO-002 ${label}`,
    }),
  });
  assert(token.response.status === 201, `token failed: ${JSON.stringify(token.body)}`);
  const auth = { Authorization: `Bearer ${token.body.access_token}` };
  const company = await call('/companies', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    body: JSON.stringify({
      name: `AICO-002 ${label}`,
      profile: {
        purpose: 'Prove durable founder supervision semantics.',
        target_customer: 'Founder durability fixture',
        constraints: ['Architecture spike', 'No paid services'],
        normalized_limits: { max_screens: 5, primary_flows: 1, data_mode: 'mock_or_local' },
        sensitive_data_warning_acknowledged: true,
      },
    }),
  });
  assert(company.response.status === 201, `company failed: ${JSON.stringify(company.body)}`);
  const initiative = await call('/initiatives', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    body: JSON.stringify({ type: 'PROTOTYPE', title: `AICO-002 ${label}` }),
  });
  assert(
    initiative.response.status === 201,
    `initiative failed: ${JSON.stringify(initiative.body)}`,
  );
  const goal = await call(`/initiatives/${initiative.body.data.id}/goals`, {
    method: 'POST',
    headers: {
      ...auth,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      'if-match': initiative.response.headers.get('etag'),
    },
    body: JSON.stringify({
      schema_version: 1,
      goal: {
        target_user: 'Founder',
        problem: 'A process restart must not lose a founder wait.',
        desired_outcome: 'Resume exactly once from persisted state.',
        primary_flow: 'Persist wait, restart, answer, resume',
        must_haves: [{ id: 'MH-001', text: 'Survive replacement-process restart' }],
        non_goals: ['Production clarification UI', 'External action'],
        visual_direction: 'Not applicable to architecture spike',
        constraints: {
          max_screens: 5,
          primary_flows: 1,
          client_only: true,
          data_mode: 'mock_or_local',
        },
        reference_ids: [],
      },
      attachment_ids: [],
      start_run: true,
    }),
  });
  assert(goal.response.status === 201, `goal failed: ${JSON.stringify(goal.body)}`);
  const runId = goal.body.data.run.id;
  const tasks = await call(`/runs/${runId}/tasks`, { headers: auth });
  return {
    actorId: token.body.founder_id,
    companyId: company.body.data.id,
    runId,
    taskId: tasks.body.data[0].id,
    auth,
  };
}

async function apiSnapshot(fixture) {
  const runResult = await call(`/runs/${fixture.runId}`, { headers: fixture.auth });
  const events = await call(`/runs/${fixture.runId}/events`, { headers: fixture.auth });
  assert(runResult.response.ok, `run read failed: ${JSON.stringify(runResult.body)}`);
  assert(events.response.ok, `events read failed: ${JSON.stringify(events.body)}`);
  return {
    run: runResult.body.data,
    etag: runResult.response.headers.get('etag'),
    events: events.body.data,
  };
}

compose('up', '-d', '--wait', 'api');

const evidence = {
  schema_version: 1,
  revision:
    process.env.GITHUB_SHA ?? run('git', ['rev-parse', 'HEAD'], { capture: true }).stdout.trim(),
  matrix: {},
  processes: {},
  timings: {},
};

const rollback = await createRun('transaction-rollback');
const rollbackAttempt = spike(
  'open',
  {
    ...rollback,
    correlationId: randomUUID(),
    expectedRunVersion: 1,
    injectRollback: true,
  },
  { allowFailure: true },
);
assert(rollbackAttempt.status !== 0, 'A2-TX-01 injected rollback unexpectedly committed');
const rollbackState = spike('inspect', rollback).result;
assert(rollbackState.run_state === 'DRAFT', 'A2-TX-01 changed run state');
assert(rollbackState.counts.waits === 0, 'A2-TX-01 left a wait row');
assert(rollbackState.counts.events === 1, 'A2-TX-01 left a partial event');
assert(rollbackState.counts.outbox === 1, 'A2-TX-01 left a partial outbox record');
evidence.matrix['A2-TX-01'] = 'passed';

const recovery = await createRun('restart-recovery');
const beforeApi = await apiSnapshot(recovery);
const opened = spike('open', {
  ...recovery,
  correlationId: randomUUID(),
  expectedRunVersion: 1,
});
assert(opened.ok, 'A2-WAIT-01 open failed');
const waiting = spike('inspect', recovery);
assert(waiting.result.run_state === 'AWAITING_FOUNDER_INPUT', 'run did not enter wait');
assert(waiting.result.task_state === 'AWAITING_INPUT', 'task did not enter wait');
assert(waiting.result.lease_token === null, 'wait retained a lease token');
assert(waiting.result.lease_owner === null, 'wait retained a lease owner');
assert(waiting.result.wait_status === 'OPEN', 'wait is not OPEN');
assert(waiting.result.wait_kind === 'CLARIFICATION', 'wait kind drifted');
assert(waiting.result.wait_version === 1, 'wait version drifted');
assert(waiting.result.request_version === 1, 'request version drifted');
assert(
  waiting.result.wait_workflow_version === 'prototype-run/v1' &&
    waiting.result.wait_workflow_version === waiting.result.workflow_version,
  'wait workflow version is not exact',
);
assert(
  waiting.result.expected_run_state === 'AWAITING_FOUNDER_INPUT' &&
    waiting.result.expected_run_row_version === waiting.result.row_version,
  'wait expected state/version drifted',
);
assert(
  waiting.result.wait_context_snapshot_id === waiting.result.context_snapshot_id,
  'wait context reference drifted',
);
assert(
  waiting.result.response_schema_id === 'durable-wait-response' &&
    waiting.result.response_schema_version === '1.0',
  'wait response schema drifted',
);
assert(waiting.result.expires_at !== null, 'wait expiry metadata is missing');
assert(
  waiting.result.counts.waits === 1 &&
    waiting.result.counts.events === 2 &&
    waiting.result.counts.outbox === 2,
  'committed wait transaction row counts drifted',
);
evidence.processes.open = opened.process;
evidence.matrix['A2-WAIT-01'] = 'passed';
evidence.matrix['A2-TX-02'] = 'passed';

const originalApiContainer = run('docker', [...composeArgs, 'ps', '-q', 'api'], {
  capture: true,
}).stdout.trim();
const originalApiPid = run('docker', ['inspect', '-f', '{{.State.Pid}}', originalApiContainer], {
  capture: true,
}).stdout.trim();
const stopStartedAt = Date.now();
compose('stop', 'api');
compose('up', '-d', '--wait', '--force-recreate', 'api');
const replacementContainer = run('docker', [...composeArgs, 'ps', '-q', 'api'], {
  capture: true,
}).stdout.trim();
const replacementPid = run('docker', ['inspect', '-f', '{{.State.Pid}}', replacementContainer], {
  capture: true,
}).stdout.trim();
const afterApi = await apiSnapshot(recovery);
const recoveryMilliseconds = Date.now() - stopStartedAt;
assert(afterApi.run.state === 'AWAITING_FOUNDER_INPUT', 'replacement API lost wait state');
assert(afterApi.run.version === waiting.result.row_version, 'replacement API changed run version');
assert(afterApi.etag === `\"${waiting.result.row_version}\"`, 'replacement API ETag drifted');
assert(afterApi.run.summary.pending_decisions === 1, 'pending wait was not projected');
assert(replacementContainer !== originalApiContainer, 'API container identity was not replaced');
assert(
  afterApi.events.filter((event) => event.type === 'founder_input_requested').length === 1,
  'replacement API history did not reconstruct one wait request',
);
assert(recoveryMilliseconds < 15 * 60 * 1000, 'replacement recovery exceeded 15 minutes');
evidence.processes.original_api = { container: originalApiContainer, pid: originalApiPid };
evidence.processes.replacement_api = { container: replacementContainer, pid: replacementPid };
evidence.timings.recovery_milliseconds = recoveryMilliseconds;
evidence.matrix['A2-RECOVERY-01'] = 'passed';

const wrongVersion = spike(
  'answer',
  {
    actorId: recovery.actorId,
    companyId: recovery.companyId,
    runId: recovery.runId,
    waitId: opened.result.wait_id,
    requestId: opened.result.request_id,
    requestVersion: 2,
    workflowVersion: opened.result.workflow_version,
    expectedRunVersion: opened.result.run_version,
    schemaId: 'durable-wait-response',
    schemaVersion: '1.0',
    content: { decision: 'CONTINUE', note: 'Exact persisted response' },
    idempotencyKey: randomUUID(),
    correlationId: randomUUID(),
  },
  { allowFailure: true },
);
assert(wrongVersion.status !== 0, 'wrong request version was accepted');
const afterWrong = spike('inspect', recovery).result;
assert(
  afterWrong.wait_status === 'OPEN' && afterWrong.counts.answers === 0,
  'wrong version mutated wait',
);

const answerKey = randomUUID();
const answerInput = {
  actorId: recovery.actorId,
  companyId: recovery.companyId,
  runId: recovery.runId,
  waitId: opened.result.wait_id,
  requestId: opened.result.request_id,
  requestVersion: opened.result.request_version,
  workflowVersion: opened.result.workflow_version,
  expectedRunVersion: opened.result.run_version,
  schemaId: 'durable-wait-response',
  schemaVersion: '1.0',
  content: { decision: 'CONTINUE', note: 'Exact persisted response' },
  idempotencyKey: answerKey,
  correlationId: randomUUID(),
};
const answered = spike('answer', answerInput);
const replayed = spike('answer', { ...answerInput, correlationId: randomUUID() });
assert(answered.result.replayed === false, 'first answer was reported as replay');
assert(replayed.result.replayed === true, 'same answer was not replayed');
assert(
  [
    'wait_id',
    'wait_version',
    'answer_version_id',
    'continuation_task_id',
    'event_id',
    'context_snapshot_id',
    'run_version',
    'workflow_version',
    'committed_at',
  ].every((key) => answered.result.body[key] === replayed.result.body[key]),
  'replay did not return stable committed identifiers and timestamp',
);
const changedBody = spike(
  'answer',
  { ...answerInput, content: { decision: 'CONTINUE', note: 'Changed body' } },
  { allowFailure: true },
);
assert(changedBody.error.code === 'idempotency_key_reused', 'changed replay body was not rejected');
const secondKey = spike(
  'answer',
  { ...answerInput, idempotencyKey: randomUUID() },
  { allowFailure: true },
);
assert(secondKey.status !== 0, 'second answer key created another transition');
const resumed = spike('inspect', recovery).result;
assert(resumed.wait_status === 'RESOLVED', 'valid answer did not resolve wait');
assert(
  resumed.run_state === 'DRAFT' && resumed.task_state === 'READY',
  'continuation not scheduled',
);
assert(resumed.counts.answers === 1, 'more than one immutable answer exists');
assert(
  resumed.counts.events === 3 && resumed.counts.outbox === 3,
  'resume event/outbox count drifted',
);
assert(
  resumed.counts.attempts === 0 && resumed.counts.artifacts === 0,
  'resume performed product work',
);
assert(
  resumed.counts.model_effects === 0 &&
    resumed.counts.provider_invocations === 0 &&
    resumed.counts.budget_reserved === 0 &&
    resumed.counts.budget_consumed === 0,
  'resume replay created a model or budget/cost effect',
);
assert(
  resumed.context_snapshot_id === answered.result.body.context_snapshot_id &&
    resumed.context_snapshot_id !== opened.result.context_snapshot_id,
  'resume did not create a new immutable context snapshot',
);
evidence.processes.answer = answered.process;
assert(
  evidence.processes.open.worker_id !== evidence.processes.answer.worker_id,
  'wait and resume did not use distinct process identities',
);
const resumedApi = await apiSnapshot(recovery);
assert(
  resumedApi.run.state === 'DRAFT' && resumedApi.run.summary.pending_decisions === 0,
  'founder-visible run projection did not converge after resume',
);
assert(resumedApi.etag === '"3"', 'founder-visible ETag did not advance after resume');
assert(
  resumedApi.events.filter((event) => event.type === 'founder_input_resolved').length === 1,
  'founder-visible history does not contain one resolved transition',
);
evidence.matrix['A2-RESUME-01'] = 'passed';

const concurrent = await createRun('concurrent-answer');
const concurrentWait = spike('open', {
  ...concurrent,
  correlationId: randomUUID(),
  expectedRunVersion: 1,
});
const concurrentBase = {
  actorId: concurrent.actorId,
  companyId: concurrent.companyId,
  runId: concurrent.runId,
  waitId: concurrentWait.result.wait_id,
  requestId: concurrentWait.result.request_id,
  requestVersion: 1,
  workflowVersion: concurrentWait.result.workflow_version,
  expectedRunVersion: concurrentWait.result.run_version,
  schemaId: 'durable-wait-response',
  schemaVersion: '1.0',
  content: { decision: 'CONTINUE', note: 'Concurrent exact response' },
};
const concurrentA = spikeAsync('answer', {
  ...concurrentBase,
  idempotencyKey: randomUUID(),
  correlationId: randomUUID(),
});
const concurrentB = spikeAsync('answer', {
  ...concurrentBase,
  idempotencyKey: randomUUID(),
  correlationId: randomUUID(),
});
const concurrentResults = await Promise.all([concurrentA.completion, concurrentB.completion]);
assert(
  concurrentResults.filter((entry) => entry.status === 0).length === 1,
  `concurrent response race did not have one winner: ${JSON.stringify(concurrentResults)}`,
);
const afterConcurrent = spike('inspect', concurrent).result;
assert(
  afterConcurrent.counts.answers === 1 &&
    afterConcurrent.counts.events === 3 &&
    afterConcurrent.counts.outbox === 3 &&
    afterConcurrent.task_state === 'READY',
  'concurrent response race created more than one logical continuation',
);
assert(
  afterConcurrent.counts.model_effects === 0 &&
    afterConcurrent.counts.provider_invocations === 0 &&
    afterConcurrent.counts.budget_consumed === 0,
  'concurrent response race created a cost effect',
);
evidence.matrix['A2-RESUME-02'] = 'passed';

const effectEventId = answered.result.body.event_id;
const crashedPublisher = spike('publish-once', {
  eventId: effectEventId,
  stopAfterConsumerCommit: true,
});
assert(crashedPublisher.result.published === true, 'consumer crash fixture did not claim event');
const afterConsumerCommit = spike('event-effect', { eventId: effectEventId }).result;
assert(
  afterConsumerCommit.receipts === 1 && afterConsumerCommit.effects === 1,
  'effect did not commit',
);
assert(afterConsumerCommit.published_at === null, 'publisher ack committed during crash fixture');
query(
  `UPDATE outbox_messages SET lease_expires_at = now() - interval '1 second' WHERE event_id = '${effectEventId}';`,
);
const redelivery = spike('publish-once', { eventId: effectEventId });
assert(redelivery.result.published === true, 'redelivery did not run');
const afterRedelivery = spike('event-effect', { eventId: effectEventId }).result;
assert(afterRedelivery.attempts === 2, 'outbox was not attempted twice');
assert(
  afterRedelivery.receipts === 1 && afterRedelivery.effects === 1,
  'duplicate logical effect escaped',
);
assert(afterRedelivery.published_at !== null, 'redelivery was not acknowledged');
evidence.matrix['A2-EVENT-01'] = 'passed';

const sequence = spike('append-concurrent-events', {
  companyId: recovery.companyId,
  runId: recovery.runId,
  actorId: 'durability-sequence-probe/v1',
  correlationId: randomUUID(),
  count: 8,
}).result;
assert(sequence.sequences.length === 8, 'concurrent event count drifted');
assert(
  sequence.sequences.every(
    (entry, index) => index === 0 || entry === sequence.sequences[index - 1] + 1,
  ),
  `concurrent sequence was not contiguous: ${sequence.sequences.join(',')}`,
);
evidence.matrix['A2-SEQ-01'] = 'passed';

const canceled = await createRun('canceled-run');
const canceledWait = spike('open', {
  ...canceled,
  correlationId: randomUUID(),
  expectedRunVersion: 1,
});
spike('cancel-fixture', {
  companyId: canceled.companyId,
  runId: canceled.runId,
  actorId: canceled.actorId,
  correlationId: randomUUID(),
});
const canceledAnswer = spike(
  'answer',
  {
    actorId: canceled.actorId,
    companyId: canceled.companyId,
    runId: canceled.runId,
    waitId: canceledWait.result.wait_id,
    requestId: canceledWait.result.request_id,
    requestVersion: 1,
    workflowVersion: canceledWait.result.workflow_version,
    expectedRunVersion: canceledWait.result.run_version,
    schemaId: 'durable-wait-response',
    schemaVersion: '1.0',
    content: { decision: 'CONTINUE', note: 'Must not resurrect canceled run' },
    idempotencyKey: randomUUID(),
    correlationId: randomUUID(),
  },
  { allowFailure: true },
);
assert(canceledAnswer.status !== 0, 'canceled wait resumed');
const canceledClaim = spike('worker-once', { runId: canceled.runId });
assert(canceledClaim.result.processed === false, 'worker claimed canceled run');
evidence.matrix['A2-CANCEL-01'] = 'passed';

const initialClaim = await createRun('initial-claim');
const initialClaimA = spikeAsync(
  'worker-once',
  { runId: initialClaim.runId },
  {
    workerId: 'initial-claim-worker-a',
  },
);
const initialClaimB = spikeAsync(
  'worker-once',
  { runId: initialClaim.runId },
  {
    workerId: 'initial-claim-worker-b',
  },
);
const initialClaimResults = await Promise.all([initialClaimA.completion, initialClaimB.completion]);
assert(
  initialClaimResults.filter((entry) => entry.result?.processed === true).length === 1,
  `simultaneous initial claim did not have one winner: ${JSON.stringify(initialClaimResults)}`,
);
const afterInitialClaim = spike('inspect', initialClaim).result;
assert(
  afterInitialClaim.counts.attempts === 1 &&
    afterInitialClaim.counts.artifacts === 1 &&
    afterInitialClaim.counts.model_effects === 1 &&
    afterInitialClaim.counts.provider_invocations === 1,
  `simultaneous initial claim created duplicate attempts or effects: ${JSON.stringify({ initialClaimResults, afterInitialClaim })}`,
);
evidence.matrix['A2-CLAIM-01'] = 'passed';

const lease = await createRun('lease-fence');
const workerA = spikeAsync(
  'worker-once',
  { runId: lease.runId },
  {
    workerId: 'lease-worker-a',
    environment: {
      WORKER_LEASE_SECONDS: '5',
      DETERMINISTIC_MODEL_DELAY_MS: '8000',
      DETERMINISTIC_MODEL_FAIL: 'true',
    },
  },
);
let firstClaim;
for (let attempt = 0; attempt < 40; attempt += 1) {
  const raw = query(
    `SELECT state || '|' || COALESCE(lease_owner, '') || '|' || COALESCE(lease_token::text, '') || '|' || attempt_count FROM tasks WHERE id = '${lease.taskId}';`,
  );
  if (raw.startsWith('RUNNING|lease-worker-a|')) {
    firstClaim = raw.split('|');
    break;
  }
  await delay(250);
}
assert(firstClaim, 'lease worker A did not atomically claim task');
const runningAttemptCount = Number(
  query(
    `SELECT count(*) FROM task_attempts WHERE task_id = '${lease.taskId}' AND status = 'RUNNING';`,
  ),
);
assert(runningAttemptCount === 1, 'running lease did not have exactly one atomic attempt');
query(
  `UPDATE tasks SET lease_expires_at = now() - interval '1 second' WHERE id = '${lease.taskId}';`,
);
const workerB = spike('worker-once', { runId: lease.runId }, { workerId: 'lease-worker-b' });
assert(workerB.result.processed === true, 'replacement worker did not reclaim expired lease');
const lateFailure = await workerA.completion;
assert(
  lateFailure.status === 0 && lateFailure.result.processed === true,
  'stale worker probe failed',
);
const fenced = spike('inspect', lease).result;
assert(fenced.run_state === 'BLOCKED', 'unknown model outcome did not block the run');
assert(fenced.task_state === 'BLOCKED', 'unknown model outcome did not block the task');
assert(
  fenced.counts.attempts === 2 &&
    fenced.counts.artifacts === 0 &&
    fenced.counts.model_effects === 1 &&
    fenced.counts.provider_invocations === 1 &&
    fenced.counts.budget_consumed === 0,
  'lease race invoked or charged the provider more than once',
);
const attemptStatuses = query(
  `SELECT string_agg(status || ':' || COALESCE(result_class, ''), ',' ORDER BY attempt_number) FROM task_attempts WHERE task_id = '${lease.taskId}';`,
);
assert(
  attemptStatuses === 'ABANDONED:LEASE_EXPIRED,ABANDONED:UNKNOWN_EXTERNAL_OUTCOME',
  `unexpected attempt fencing evidence: ${attemptStatuses}`,
);
evidence.processes.lease_worker_a = lateFailure.process;
evidence.processes.lease_worker_b = workerB.process;
evidence.matrix['A2-LEASE-01'] = 'passed';

process.env.AICO_WORKFLOW_VERSION = 'prototype-run/v2';
compose('up', '-d', '--wait', '--force-recreate', 'api');
const versionTwo = await createRun('version-two');
const versionTwoApi = await apiSnapshot(versionTwo);
const pinned = await apiSnapshot(recovery);
assert(
  pinned.run.workflow_version === 'prototype-run/v1' &&
    versionTwoApi.run.workflow_version === 'prototype-run/v2',
  'existing run followed changed default version',
);
process.env.AICO_WORKFLOW_VERSION = 'prototype-run/v1';
compose('up', '-d', '--wait', '--force-recreate', 'api');
evidence.matrix['A2-VERSION-01'] = 'passed';
evidence.matrix['A2-MIGRATE-01'] = 'passed';
evidence.matrix['A2-VERIFY-01'] = 'passed';

const orderedBefore = beforeApi.events.map((event) => event.run_sequence);
const orderedAfter = afterApi.events.map((event) => event.run_sequence);
evidence.snapshots = {
  before_wait: { state: beforeApi.run.state, etag: beforeApi.etag, sequences: orderedBefore },
  after_restart: { state: afterApi.run.state, etag: afterApi.etag, sequences: orderedAfter },
  after_resume: {
    state: resumed.run_state,
    wait_status: resumed.wait_status,
    run_version: resumed.row_version,
    counts: resumed.counts,
  },
  founder_visible_after_resume: {
    state: resumedApi.run.state,
    etag: resumedApi.etag,
    sequences: resumedApi.events.map((event) => event.run_sequence),
  },
  duplicate_effect: afterRedelivery,
  lease_fence: { state: fenced.run_state, attempts: attemptStatuses },
};
console.log(JSON.stringify({ status: 'passed', evidence }, null, 2));
