import { randomUUID } from 'node:crypto';
import { authenticateInvitedFounder } from '../scripts/auth-invite-session.mjs';
import { assertEquivalentAbsence, assertNonDisclosingDenial } from './isolation-harness.mjs';

const baseUrl = process.env.AICO_BASE_URL ?? 'http://localhost:3000/api/v1';

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoTenantLeak(body, ...needles) {
  const serialized = JSON.stringify(body).toLowerCase();
  for (const needle of needles) {
    assert(!serialized.includes(needle.toLowerCase()), `auth failure leaked ${needle}`);
  }
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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

const publicRegistration = await call('/auth/register', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'public-register@example.test', password: 'not-a-real-secret' }),
});
assert(publicRegistration.response.status === 404, 'public registration was available');
assertNoTenantLeak(publicRegistration.body, 'public-register@example.test', 'not-a-real-secret');
assert(
  publicRegistration.response.headers.get('cache-control') === 'no-store',
  'auth error cached',
);

const removedDevToken = await call('/auth/dev-token', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'dev-token@example.test', display_name: 'Legacy Adapter' }),
});
assert(removedDevToken.response.status === 404, 'public dev-token registration was available');

const unauthenticated = await call('/companies/current');
assert(unauthenticated.response.status === 401, 'protected company route was public');
assertNoTenantLeak(unauthenticated.body, 'fixture company', 'founder:');

const invalidInvite = await call('/auth/session', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ invite_token: 'invalid-invite-token-value' }),
});
assert(invalidInvite.response.status === 401, 'invalid invite was accepted');
assertNoTenantLeak(invalidInvite.body, 'invalid-invite-token-value');

const expiredInvite = await call('/auth/invites', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: `expired-invite-${randomUUID()}@example.test`,
    display_name: 'Expired Invite',
    invite_ttl_seconds: 1,
  }),
});
assert(
  expiredInvite.response.status === 201,
  `expired invite issue failed: ${JSON.stringify(expiredInvite.body)}`,
);
await delay(1500);
const expiredRedeem = await call('/auth/session', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ invite_token: expiredInvite.body.data.invite_token }),
});
assert(expiredRedeem.response.status === 401, 'expired invite was redeemed');

const sessionIdentity = {
  email: `session-${randomUUID()}@example.test`,
  display_name: 'Session Founder',
  session_ttl_seconds: 1,
};
const shortSession = await authenticateInvitedFounder(call, sessionIdentity);
const expiredSessionProbe = await (async () => {
  await delay(1500);
  return call('/companies/current', { headers: shortSession.auth });
})();
assert(expiredSessionProbe.response.status === 401, 'expired session remained usable');
assertNoTenantLeak(expiredSessionProbe.body, sessionIdentity.email, 'Session Founder');

const revoked = await authenticateInvitedFounder(call, {
  email: `revoked-${randomUUID()}@example.test`,
  display_name: 'Revoked Founder',
});
const signOut = await call('/auth/sign-out', { method: 'POST', headers: revoked.auth });
assert(signOut.response.status === 204, `sign-out failed: ${signOut.response.status}`);
const afterSignOut = await call('/companies/current', { headers: revoked.auth });
assert(afterSignOut.response.status === 401, 'revoked session remained usable');
assertNoTenantLeak(afterSignOut.body, 'Revoked Founder');

const email = `founder-${randomUUID()}@example.test`;
const invited = await authenticateInvitedFounder(call, { email, display_name: 'Smoke Founder' });
const auth = invited.auth;
assert(
  invited.session.response.headers.get('cache-control') === 'no-store',
  'session response was cacheable',
);

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

const unacknowledged = await call('/companies', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
  body: JSON.stringify({
    ...companyPayload,
    profile: { ...companyPayload.profile, sensitive_data_warning_acknowledged: false },
  }),
});
assert(
  unacknowledged.response.status === 422,
  'unacknowledged sensitive-data warning was accepted',
);
assert(unacknowledged.body.code === 'unsupported_sensitive_data', 'sensitive-data code drifted');

const overLimit = await call('/companies', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
  body: JSON.stringify({
    ...companyPayload,
    profile: {
      ...companyPayload.profile,
      normalized_limits: { ...companyPayload.profile.normalized_limits, max_screens: 6 },
    },
  }),
});
assert(overLimit.response.status === 400, 'over-limit company profile was accepted');

const company = await call('/companies', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': companyKey },
  body: JSON.stringify(companyPayload),
});
assert(company.response.status === 201, `company create failed: ${JSON.stringify(company.body)}`);
assert(
  company.response.headers.get('cache-control') === 'no-store',
  'company response was cacheable',
);
const companyId = company.body.data.id;
const originalProfile = company.body.data.current_profile;

const missingEtag = await call('/companies/current/profile', {
  method: 'PATCH',
  headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
  body: JSON.stringify({
    ...companyPayload.profile,
    purpose: 'Help independent consultants prepare and review client proposals.',
  }),
});
assert(missingEtag.response.status === 412, 'profile update without If-Match was accepted');

const staleEtag = await call('/companies/current/profile', {
  method: 'PATCH',
  headers: {
    ...auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
    'if-match': '"99"',
  },
  body: JSON.stringify({
    ...companyPayload.profile,
    purpose: 'Help independent consultants prepare and review client proposals.',
  }),
});
assert(staleEtag.response.status === 412, 'stale profile If-Match was accepted');
assert(staleEtag.body.code === 'precondition_failed', 'stale ETag code drifted');

const secondCompany = await call('/companies', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
  body: JSON.stringify(companyPayload),
});
assert(secondCompany.response.status === 409, 'second company for one founder was accepted');

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
assert(initiative.response.headers.get('etag') === '"1"', 'initiative ETag was missing');

const secondInitiative = await call('/initiatives', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
  body: JSON.stringify({ type: 'PROTOTYPE', title: 'Second concurrent prototype' }),
});
assert(secondInitiative.response.status === 409, 'second active initiative was accepted');
assert(secondInitiative.body.code === 'active_initiative_exists', 'second initiative code drifted');

const goalEnvelope = {
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
};
const missingGoalEtag = await call(`/initiatives/${initiative.body.data.id}/goals`, {
  method: 'POST',
  headers: {
    ...auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
  },
  body: JSON.stringify(goalEnvelope),
});
assert(missingGoalEtag.response.status === 412, 'goal create without If-Match was accepted');
assert(missingGoalEtag.body.code === 'precondition_required', 'missing goal ETag code drifted');

const staleGoalEtag = await call(`/initiatives/${initiative.body.data.id}/goals`, {
  method: 'POST',
  headers: {
    ...auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
    'if-match': '"99"',
  },
  body: JSON.stringify(goalEnvelope),
});
assert(staleGoalEtag.response.status === 412, 'stale goal If-Match was accepted');
assert(staleGoalEtag.body.code === 'precondition_failed', 'stale goal ETag code drifted');

const extraGoalField = await call(`/initiatives/${initiative.body.data.id}/goals`, {
  method: 'POST',
  headers: {
    ...auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
    'if-match': initiative.response.headers.get('etag'),
  },
  body: JSON.stringify({
    ...goalEnvelope,
    goal: { ...goalEnvelope.goal, unexpected_field: 'drop-me' },
  }),
});
assert(extraGoalField.response.status === 400, 'unknown goal field was accepted');
assert(extraGoalField.body.code === 'validation_failed', 'unknown goal field code drifted');

const overLengthGoal = await call(`/initiatives/${initiative.body.data.id}/goals`, {
  method: 'POST',
  headers: {
    ...auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
    'if-match': initiative.response.headers.get('etag'),
  },
  body: JSON.stringify({
    ...goalEnvelope,
    goal: { ...goalEnvelope.goal, target_user: `x${'y'.repeat(300)}` },
  }),
});
assert(overLengthGoal.response.status === 400, 'over-length goal field was truncated or stored');
assert(overLengthGoal.body.code === 'validation_failed', 'over-length goal code drifted');

const outOfScopeGoal = await call(`/initiatives/${initiative.body.data.id}/goals`, {
  method: 'POST',
  headers: {
    ...auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
    'if-match': initiative.response.headers.get('etag'),
  },
  body: JSON.stringify({
    ...goalEnvelope,
    goal: {
      ...goalEnvelope.goal,
      constraints: { ...goalEnvelope.goal.constraints, client_only: false },
    },
  }),
});
assert(outOfScopeGoal.response.status === 422, 'out-of-scope goal was silently narrowed');
assert(outOfScopeGoal.body.code === 'goal_out_of_scope', 'out-of-scope goal code drifted');

const goalIdempotencyKey = randomUUID();
const goal = await call(`/initiatives/${initiative.body.data.id}/goals`, {
  method: 'POST',
  headers: {
    ...auth,
    'content-type': 'application/json',
    'idempotency-key': goalIdempotencyKey,
    'if-match': initiative.response.headers.get('etag'),
  },
  body: JSON.stringify(goalEnvelope),
});
assert(goal.response.status === 201, `goal/run failed: ${JSON.stringify(goal.body)}`);
assert(goal.body.data.goal_version.version === 1, 'first goal version was not 1');
assert(goal.body.data.goal_version.created_by === 'FOUNDER', 'goal was not founder-authored');
assert(goal.body.data.goal_version.created_at, 'goal version omitted created_at');
const runId = goal.body.data.run.id;

const replayGoal = await call(`/initiatives/${initiative.body.data.id}/goals`, {
  method: 'POST',
  headers: {
    ...auth,
    'content-type': 'application/json',
    'idempotency-key': goalIdempotencyKey,
    'if-match': initiative.response.headers.get('etag'),
  },
  body: JSON.stringify(goalEnvelope),
});
assert(
  replayGoal.response.status === 201,
  `goal replay failed: ${JSON.stringify(replayGoal.body)}`,
);
assert(replayGoal.body.meta.replayed === true, 'goal idempotent replay was not reported');
assert(
  replayGoal.body.data.goal_version.id === goal.body.data.goal_version.id,
  'goal replay created a different version',
);

const reusedGoalKey = await call(`/initiatives/${initiative.body.data.id}/goals`, {
  method: 'POST',
  headers: {
    ...auth,
    'content-type': 'application/json',
    'idempotency-key': goalIdempotencyKey,
    'if-match': initiative.response.headers.get('etag'),
  },
  body: JSON.stringify({
    ...goalEnvelope,
    goal: { ...goalEnvelope.goal, problem: 'A different body must not reuse the command key.' },
  }),
});
assert(reusedGoalKey.response.status === 409, 'goal idempotency key reuse was accepted');
assert(reusedGoalKey.body.code === 'idempotency_key_reused', 'goal key-reuse code drifted');

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
assert(
  run.body.data.context.company_profile_version_id === originalProfile.id,
  'run did not freeze the original company profile',
);
assert(
  run.body.data.context.company_profile.purpose === originalProfile.purpose,
  'frozen run profile drifted from the snapshot',
);
assert(run.body.data.context.goal.version === 1, 'run did not freeze goal version 1');
assert(
  run.body.data.context.goal.structured_goal.target_user === goalEnvelope.goal.target_user,
  'frozen goal dropped target_user',
);
assert(
  run.body.data.context.goal.structured_goal.problem === goalEnvelope.goal.problem,
  'run did not persist the submitted goal schema',
);
assert(
  run.body.data.context.goal.structured_goal.desired_outcome === goalEnvelope.goal.desired_outcome,
  'frozen goal dropped desired_outcome',
);
assert(
  run.body.data.context.goal.structured_goal.primary_flow === goalEnvelope.goal.primary_flow,
  'frozen goal dropped primary_flow',
);
assert(
  JSON.stringify(run.body.data.context.goal.structured_goal.must_haves) ===
    JSON.stringify(goalEnvelope.goal.must_haves),
  'frozen goal dropped must_haves',
);
assert(
  JSON.stringify(run.body.data.context.goal.structured_goal.non_goals) ===
    JSON.stringify(goalEnvelope.goal.non_goals),
  'frozen goal dropped non_goals',
);
assert(
  run.body.data.context.goal.structured_goal.visual_direction ===
    goalEnvelope.goal.visual_direction,
  'frozen goal dropped visual_direction',
);
assert(
  JSON.stringify(run.body.data.context.goal.structured_goal.constraints) ===
    JSON.stringify(goalEnvelope.goal.constraints),
  'frozen goal dropped constraints',
);
assert(
  JSON.stringify(run.body.data.context.goal.structured_goal.reference_ids) ===
    JSON.stringify(goalEnvelope.goal.reference_ids),
  'frozen goal dropped reference_ids',
);
assert(
  !Object.hasOwn(run.body.data.context.goal.structured_goal, 'unexpected_field'),
  'persisted goal kept an unknown field',
);

const updatedPurpose = 'Help independent consultants prepare and review client proposals.';
const profileUpdate = await call('/companies/current/profile', {
  method: 'PATCH',
  headers: {
    ...auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
    'if-match': company.response.headers.get('etag'),
  },
  body: JSON.stringify({
    ...companyPayload.profile,
    purpose: updatedPurpose,
  }),
});
assert(
  profileUpdate.response.status === 200,
  `profile update failed: ${JSON.stringify(profileUpdate.body)}`,
);
assert(profileUpdate.body.data.current_profile.version === 2, 'profile version did not advance');
assert(
  profileUpdate.body.data.current_profile.purpose === updatedPurpose,
  'current profile was not replaced',
);
assert(
  profileUpdate.body.data.current_profile.id !== originalProfile.id,
  'profile update mutated the frozen version row',
);

const currentAfterUpdate = await call('/companies/current', { headers: auth });
assert(
  currentAfterUpdate.body.data.current_profile.id === profileUpdate.body.data.current_profile.id,
  'current pointer did not advance atomically',
);

const frozenRun = await call(`/runs/${runId}`, { headers: auth });
assert(
  frozenRun.body.data.context.company_profile_version_id === originalProfile.id,
  'active run picked up a later company profile',
);
assert(
  frozenRun.body.data.context.company_profile.purpose === originalProfile.purpose,
  'active run lost its frozen company profile',
);
assert(
  frozenRun.body.data.context.goal.structured_goal.problem === goalEnvelope.goal.problem,
  'active run lost its frozen goal version',
);

const staleAfterGoal = await call(`/initiatives/${initiative.body.data.id}/goals`, {
  method: 'POST',
  headers: {
    ...auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
    'if-match': '"1"',
  },
  body: JSON.stringify(goalEnvelope),
});
assert(staleAfterGoal.response.status === 412, 'stale post-goal If-Match was accepted');

const secondGoalEnvelope = {
  ...goalEnvelope,
  goal: {
    ...goalEnvelope.goal,
    problem: 'A later founder-authored version restates the proposal review problem.',
  },
};
const secondGoal = await call(`/initiatives/${initiative.body.data.id}/goals`, {
  method: 'POST',
  headers: {
    ...auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
    'if-match': goal.response.headers.get('etag'),
  },
  body: JSON.stringify(secondGoalEnvelope),
});
assert(
  secondGoal.response.status === 201,
  `second explicit run failed: ${JSON.stringify(secondGoal.body)}`,
);
assert(secondGoal.body.data.goal_version.version === 2, 'second goal did not create version 2');
assert(
  secondGoal.body.data.goal_version.id !== goal.body.data.goal_version.id,
  'second goal mutated the submitted version row',
);
const firstRunAfterSecondGoal = await call(`/runs/${runId}`, { headers: auth });
assert(
  firstRunAfterSecondGoal.body.data.context.goal.version === 1,
  'later goal submission edited the frozen first version',
);
assert(
  firstRunAfterSecondGoal.body.data.context.goal.structured_goal.problem ===
    goalEnvelope.goal.problem,
  'later goal submission truncated or replaced version 1',
);
const secondRun = await call(`/runs/${secondGoal.body.data.run.id}`, { headers: auth });
assert(secondRun.body.data.context.goal.version === 2, 'second run did not freeze goal version 2');
assert(
  secondRun.body.data.context.goal.structured_goal.problem === secondGoalEnvelope.goal.problem,
  'second run did not persist the new founder-authored goal',
);
assert(
  secondRun.body.data.context.company_profile_version_id ===
    profileUpdate.body.data.current_profile.id,
  'new run did not snapshot the updated company profile',
);
assert(
  secondRun.body.data.context.company_profile.purpose === updatedPurpose,
  'new run snapshot did not include the updated profile',
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

const otherFounder = await authenticateInvitedFounder(call, {
  email: `other-${randomUUID()}@example.test`,
  display_name: 'Other Founder',
});
const otherCompany = await call('/companies', {
  method: 'POST',
  headers: {
    ...otherFounder.auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
  },
  body: JSON.stringify({
    name: 'Other Company',
    profile: companyPayload.profile,
  }),
});
assert(
  otherCompany.response.status === 201,
  `other company failed: ${JSON.stringify(otherCompany.body)}`,
);
assert(otherCompany.body.data.id !== companyId, 'two founders received the same company');
assert(
  otherCompany.body.data.name !== 'Smoke Company',
  'company current leaked a foreign name during create',
);

const otherCurrent = await call('/companies/current', { headers: otherFounder.auth });
assert(
  otherCurrent.body.data.id === otherCompany.body.data.id,
  'other founder did not read their company',
);
assert(
  !JSON.stringify(otherCurrent.body).includes('Smoke Company'),
  'company list leaked foreign content',
);

const clientTenantHeader = await call(`/runs/${runId}`, {
  headers: { ...otherFounder.auth, 'x-company-id': companyId, 'x-aico-company-id': companyId },
});
assertNonDisclosingDenial(
  clientTenantHeader,
  [email, 'Smoke Founder', 'Smoke Company', companyId, originalProfile.purpose],
  'client tenant header',
);

const clientTenantBody = await call('/companies', {
  method: 'POST',
  headers: {
    ...otherFounder.auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
  },
  body: JSON.stringify({
    company_id: companyId,
    name: 'Hijack Company',
    profile: companyPayload.profile,
  }),
});
assert(clientTenantBody.response.status === 400, 'client tenant body was accepted');
assertNoTenantLeak(clientTenantBody.body, 'Smoke Company', originalProfile.purpose);

const absentId = randomUUID();
const foreignNeedles = [
  email,
  'Smoke Founder',
  'Smoke Company',
  originalProfile.purpose,
  'Proposal workspace prototype',
];

const listTasks = await call(`/runs/${runId}/tasks`, { headers: otherFounder.auth });
const listEvents = await call(`/runs/${runId}/events`, { headers: otherFounder.auth });
const readRun = await call(`/runs/${runId}`, { headers: otherFounder.auth });
const writeGoal = await call(`/initiatives/${initiative.body.data.id}/goals`, {
  method: 'POST',
  headers: {
    ...otherFounder.auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
    'if-match': '"1"',
  },
  body: JSON.stringify(goalEnvelope),
});
const deleteRun = await call(`/runs/${runId}`, {
  method: 'DELETE',
  headers: otherFounder.auth,
});
const absentRun = await call(`/runs/${absentId}`, { headers: otherFounder.auth });
const absentDelete = await call(`/runs/${absentId}`, {
  method: 'DELETE',
  headers: otherFounder.auth,
});

assertNonDisclosingDenial(listTasks, foreignNeedles, 'foreign task list');
assertNonDisclosingDenial(listEvents, foreignNeedles, 'foreign event list');
assertNonDisclosingDenial(readRun, foreignNeedles, 'foreign run read');
assertNonDisclosingDenial(writeGoal, foreignNeedles, 'foreign goal write');
assertNonDisclosingDenial(deleteRun, foreignNeedles, 'foreign run delete');
assertEquivalentAbsence(readRun, absentRun, 'foreign vs absent read');
assertEquivalentAbsence(deleteRun, absentDelete, 'foreign vs absent delete');
assert(
  !Array.isArray(listTasks.body.data) || listTasks.body.data.length === 0,
  'foreign task list returned rows',
);

const ownerAfterAttack = await call(`/runs/${runId}`, { headers: auth });
assert(ownerAfterAttack.response.ok, 'owner run was mutated by a foreign write or delete');
assert(
  ownerAfterAttack.body.data.context.company_profile.purpose === originalProfile.purpose,
  'owner frozen profile changed after a foreign attempt',
);
assert(
  ownerAfterAttack.body.data.context.goal.structured_goal.problem === goalEnvelope.goal.problem,
  'owner frozen goal changed after a foreign attempt',
);

console.log(JSON.stringify({ status: 'passed', company_id: companyId, run_id: runId }));
