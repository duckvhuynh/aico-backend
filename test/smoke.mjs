import { randomUUID } from 'node:crypto';

const baseUrl = process.env.AICO_BASE_URL ?? 'http://localhost:3000/api/v1';

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const health = await call('/health/ready');
assert(health.response.ok, `readiness failed: ${JSON.stringify(health.body)}`);

const live = await call('/health/live');
assert(live.response.ok, `liveness failed: ${JSON.stringify(live.body)}`);
assert(live.body.status === 'ok', `liveness body unexpected: ${JSON.stringify(live.body)}`);
assert(!('checks' in live.body), 'liveness must not include dependency checks');
assert(
  !JSON.stringify(live.body).toLowerCase().includes('secret'),
  'liveness must not include secret material',
);

const email = `founder-${randomUUID()}@example.test`;
const tokenResult = await call('/auth/dev-token', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, display_name: 'Smoke Founder' }),
});
assert(
  tokenResult.response.status === 201,
  `dev token failed: ${JSON.stringify(tokenResult.body)}`,
);
const auth = { Authorization: `Bearer ${tokenResult.body.access_token}` };

const companyKey = randomUUID();
const companyPayload = {
  name: 'Smoke Company',
  profile: {
    purpose: 'Help independent consultants prepare concise client proposals.',
    target_customer: 'Independent consultants serving small businesses',
    constraints: ['No customer PII', 'English only'],
    normalized_limits: { max_screens: 5, primary_flows: 1, data_mode: 'mock_or_local' },
    sensitive_data_warning_acknowledged: true,
  },
};
const company = await call('/companies', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': companyKey },
  body: JSON.stringify(companyPayload),
});
assert(company.response.status === 201, `company create failed: ${JSON.stringify(company.body)}`);
const companyId = company.body.data.id;

const replay = await call('/companies', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': companyKey },
  body: JSON.stringify(companyPayload),
});
assert(replay.body.meta.replayed === true, 'idempotent replay was not reported');
assert(replay.body.data.id === companyId, 'idempotent replay returned a different resource');

const initiative = await call('/initiatives', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
  body: JSON.stringify({ type: 'PROTOTYPE', title: 'Proposal workspace prototype' }),
});
assert(initiative.response.status === 201, `initiative failed: ${JSON.stringify(initiative.body)}`);

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
      target_user: 'Independent consultants',
      problem: 'Turning discovery notes into a proposal is slow and inconsistent.',
      desired_outcome: 'Prepare and review a clear proposal draft.',
      primary_flow: 'Create proposal, review sections, mark ready',
      must_haves: [
        { id: 'MH-001', text: 'Create a proposal from structured mock client data' },
        { id: 'MH-002', text: 'Review scope, timeline, and price sections' },
      ],
      non_goals: ['Payment processing', 'Real customer data', 'Production deployment'],
      visual_direction: 'Calm editorial workspace with clear status hierarchy',
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
assert(goal.response.status === 201, `goal/run failed: ${JSON.stringify(goal.body)}`);
const runId = goal.body.data.run.id;

let run;
for (let attempt = 0; attempt < 40; attempt += 1) {
  run = await call(`/runs/${runId}`, { headers: auth });
  if (run.body.data?.state === 'AWAITING_BRIEF_APPROVAL') break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert(
  run?.body.data?.state === 'AWAITING_BRIEF_APPROVAL',
  `worker did not complete PM task: ${JSON.stringify(run?.body)}`,
);

const tasks = await call(`/runs/${runId}/tasks`, { headers: auth });
assert(
  tasks.body.data.some((task) => task.state === 'SUCCEEDED'),
  'no succeeded task found',
);
const events = await call(`/runs/${runId}/events`, { headers: auth });
assert(
  events.body.data.some((event) => event.type === 'run_created'),
  'run_created event missing',
);
assert(
  events.body.data.some((event) => event.type === 'product_brief_published'),
  'product brief event missing',
);

const otherToken = await call('/auth/dev-token', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: `other-${randomUUID()}@example.test`,
    display_name: 'Other Founder',
  }),
});
const crossTenant = await call(`/runs/${runId}`, {
  headers: { Authorization: `Bearer ${otherToken.body.access_token}` },
});
assert(crossTenant.response.status === 404, 'cross-tenant lookup did not fail closed');

console.log(JSON.stringify({ status: 'passed', company_id: companyId, run_id: runId }));
