import { createHash, randomUUID } from 'node:crypto';
import { authenticateInvitedFounder } from '../scripts/auth-invite-session.mjs';
import { assertEquivalentAbsence, assertNonDisclosingDenial } from './isolation-harness.mjs';

const baseUrl = process.env.AICO_BASE_URL ?? 'http://localhost:3000/api/v1';

async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  return { response, body };
}

async function callRaw(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { response, buffer };
}

function attachmentBody(bytes, declaredMediaType, filename) {
  return {
    declared_media_type: declaredMediaType,
    filename,
    content_sha256: createHash('sha256').update(bytes).digest('hex'),
    content_base64: Buffer.from(bytes).toString('base64'),
  };
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

const missingInitiative = await call('/initiatives/current', { headers: auth });
assert(missingInitiative.response.status === 404, 'current initiative existed before create');
assert(missingInitiative.body.code === 'resource_not_found', 'missing initiative code drifted');

const initiative = await call('/initiatives', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
  body: JSON.stringify({ type: 'PROTOTYPE', title: 'Proposal workspace prototype' }),
});
assert(initiative.response.status === 201, `initiative failed: ${JSON.stringify(initiative.body)}`);
assert(initiative.response.headers.get('etag') === '"1"', 'initiative ETag was missing');

const currentInitiative = await call('/initiatives/current', { headers: auth });
assert(
  currentInitiative.response.status === 200,
  `current initiative failed: ${JSON.stringify(currentInitiative.body)}`,
);
assert(currentInitiative.body.data.id === initiative.body.data.id, 'current initiative id drifted');
assert(currentInitiative.response.headers.get('etag') === '"1"', 'current initiative ETag drifted');
assert(currentInitiative.body.data.status === 'DRAFT', 'current initiative status drifted');

const secondInitiative = await call('/initiatives', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
  body: JSON.stringify({ type: 'PROTOTYPE', title: 'Second concurrent prototype' }),
});
assert(secondInitiative.response.status === 409, 'second active initiative was accepted');
assert(secondInitiative.body.code === 'active_initiative_exists', 'second initiative code drifted');

const currentAfterConflict = await call('/initiatives/current', { headers: auth });
assert(
  currentAfterConflict.body.data.id === initiative.body.data.id,
  'conflict recovery did not return the active initiative',
);

const notesBytes = Buffer.from('reference notes for the prototype');
const notesPayload = attachmentBody(notesBytes, 'text/plain', 'notes.txt');
const attachment = await call('/attachments', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
  body: JSON.stringify(notesPayload),
});
assert(
  attachment.response.status === 201,
  `attachment ingest failed: ${JSON.stringify(attachment.body)}`,
);
assert(attachment.body.data.scan_state === 'CLEAN', 'accepted attachment was not marked CLEAN');
assert(attachment.body.data.media_type === 'text/plain', 'accepted attachment dropped media type');
assert(
  !JSON.stringify(attachment.body).includes(notesPayload.content_base64),
  'attachment response leaked file body',
);
const attachmentId = attachment.body.data.id;
assert(
  !JSON.stringify(attachment.body).includes('companies/'),
  'attachment response leaked object key',
);

const attachmentReplayKey = randomUUID();
const firstIngest = await call('/attachments', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': attachmentReplayKey },
  body: JSON.stringify(notesPayload),
});
const replayIngest = await call('/attachments', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': attachmentReplayKey },
  body: JSON.stringify(notesPayload),
});
assert(replayIngest.body.meta.replayed === true, 'attachment replay was not reported');
assert(
  replayIngest.body.data.id === firstIngest.body.data.id,
  'attachment replay stored a second object',
);

const deniedCases = [
  [
    attachmentBody(Buffer.alloc(262145, 0x61), 'text/plain', 'notes.txt'),
    'attachment_too_large',
    'a'.repeat(40),
  ],
  [
    attachmentBody(
      Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),
      'text/plain',
      'notes.txt',
    ),
    'attachment_unsafe',
    'EICAR-STANDARD-ANTIVIRUS-TEST-FILE',
  ],
  [
    attachmentBody(
      Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]),
      'text/plain',
      'notes.txt',
    ),
    'attachment_unsafe',
    'MZ',
  ],
  [
    attachmentBody(
      Buffer.from('<!DOCTYPE html><html><script>alert(1)</script></html>'),
      'text/plain',
      'notes.txt',
    ),
    'attachment_unsafe',
    '<script>alert(1)</script>',
  ],
  [
    attachmentBody(
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]),
      'text/plain',
      'notes.txt',
    ),
    'attachment_unsafe',
    'PK',
  ],
  [
    attachmentBody(notesBytes, 'application/zip', 'archive.zip'),
    'attachment_type_unsupported',
    'archive.zip',
  ],
  [
    attachmentBody(notesBytes, 'text/plain', '../evil.exe'),
    'attachment_validation_failed',
    '../evil.exe',
  ],
  [
    attachmentBody(
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
      'text/plain',
      'notes.txt',
    ),
    'attachment_validation_failed',
    'iVBORw0KGgo',
  ],
];
for (const [payload, code, leak] of deniedCases) {
  const denied = await call('/attachments', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    body: JSON.stringify(payload),
  });
  assert(
    denied.response.status === 422,
    `denied attachment returned ${denied.response.status} for ${code}`,
  );
  assert(
    denied.body.code === code,
    `denied attachment code drifted for ${code}: ${denied.body.code}`,
  );
  const serialized = JSON.stringify(denied.body);
  assert(!serialized.includes(payload.content_base64), `denial leaked body for ${code}`);
  assert(!serialized.includes(leak), `denial leaked ${leak}`);
}

const metadata = await call(`/attachments/${attachmentId}`, { headers: auth });
assert(metadata.response.ok, `attachment metadata failed: ${JSON.stringify(metadata.body)}`);
assert(metadata.body.data.id === attachmentId, 'attachment metadata id drifted');
assert(!Object.hasOwn(metadata.body.data, 'body'), 'attachment metadata included a body');

const unvalidatedGoal = await call(`/initiatives/${initiative.body.data.id}/goals`, {
  method: 'POST',
  headers: {
    ...auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
    'if-match': initiative.response.headers.get('etag'),
  },
  body: JSON.stringify({
    schema_version: 1,
    start_run: true,
    attachment_ids: [randomUUID()],
    goal: {
      target_user: 'Independent consultants',
      problem: 'Turning discovery notes into a proposal is slow and inconsistent.',
      desired_outcome: 'Prepare and review a clear proposal draft.',
      primary_flow: 'Create proposal, review sections, mark ready',
      must_haves: [{ id: 'MH-001', text: 'Create a proposal from structured mock client data' }],
      non_goals: ['Payments'],
      visual_direction: 'Calm editorial workspace',
      constraints: {
        max_screens: 5,
        primary_flows: 1,
        client_only: true,
        data_mode: 'mock_or_local',
      },
      reference_ids: [],
    },
  }),
});
assert(
  unvalidatedGoal.response.status === 404,
  'unvalidated attachment id did not fail the goal command',
);
assert(unvalidatedGoal.body.code === 'resource_not_found', 'unvalidated attachment denial drifted');

const extraAttachments = await call(`/initiatives/${initiative.body.data.id}/goals`, {
  method: 'POST',
  headers: {
    ...auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
    'if-match': initiative.response.headers.get('etag'),
  },
  body: JSON.stringify({
    schema_version: 1,
    start_run: true,
    attachment_ids: Array.from({ length: 6 }, () => randomUUID()),
    goal: {
      target_user: 'Independent consultants',
      problem: 'Turning discovery notes into a proposal is slow and inconsistent.',
      desired_outcome: 'Prepare and review a clear proposal draft.',
      primary_flow: 'Create proposal, review sections, mark ready',
      must_haves: [{ id: 'MH-001', text: 'Create a proposal from structured mock client data' }],
      non_goals: ['Payments'],
      visual_direction: 'Calm editorial workspace',
      constraints: {
        max_screens: 5,
        primary_flows: 1,
        client_only: true,
        data_mode: 'mock_or_local',
      },
      reference_ids: [],
    },
  }),
});
assert(extraAttachments.response.status === 400, 'more than five attachment ids were accepted');

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
  attachment_ids: [attachmentId],
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
const persistedMustHaves = run.body.data.context.goal.structured_goal.must_haves;
const persistedConstraints = run.body.data.context.goal.structured_goal.constraints;
assert(
  persistedMustHaves.length === goalEnvelope.goal.must_haves.length,
  'frozen goal dropped must_haves',
);
for (const [index, item] of goalEnvelope.goal.must_haves.entries()) {
  assert(
    persistedMustHaves[index]?.id === item.id && persistedMustHaves[index]?.text === item.text,
    `frozen goal dropped must_haves[${index}]`,
  );
}
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
  Number(persistedConstraints.max_screens) === goalEnvelope.goal.constraints.max_screens &&
    Number(persistedConstraints.primary_flows) === goalEnvelope.goal.constraints.primary_flows &&
    persistedConstraints.client_only === goalEnvelope.goal.constraints.client_only &&
    persistedConstraints.data_mode === goalEnvelope.goal.constraints.data_mode,
  'frozen goal dropped constraints',
);
assert(
  JSON.stringify(run.body.data.context.goal.structured_goal.reference_ids) ===
    JSON.stringify(goalEnvelope.goal.reference_ids),
  'frozen goal dropped reference_ids',
);
assert(
  run.body.data.context.attachments?.[0]?.id === attachmentId,
  'run context dropped frozen attachment metadata',
);
assert(
  !JSON.stringify(run.body.data.context.attachments).includes(notesPayload.content_base64),
  'run context leaked attachment bytes',
);
assert(
  !Object.hasOwn(run.body.data.context.goal.structured_goal, 'unexpected_field'),
  'persisted goal kept an unknown field',
);

const retrieved = await callRaw(`/runs/${runId}/attachments/${attachmentId}`, { headers: auth });
assert(retrieved.response.ok, 'run-scoped attachment retrieval failed');
assert(
  retrieved.response.headers.get('content-type')?.startsWith('text/plain'),
  'run-scoped retrieval used a public execution content type',
);
assert(retrieved.buffer.equals(notesBytes), 'run-scoped retrieval returned different bytes');
assert(
  !retrieved.response.headers.get('location'),
  'run-scoped retrieval issued a public object location',
);

const retrievedAgain = await callRaw(`/runs/${runId}/attachments/${attachmentId}`, {
  headers: auth,
});
assert(retrievedAgain.response.ok, 'repeat run-scoped retrieval failed');
assert(retrievedAgain.buffer.equals(notesBytes), 'repeat retrieval returned different bytes');

const unlinkedRetrieval = await callRaw(`/runs/${runId}/attachments/${firstIngest.body.data.id}`, {
  headers: auth,
});
assert(unlinkedRetrieval.response.status === 404, 'unlinked attachment was retrievable');

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

const otherCurrentInitiative = await call('/initiatives/current', {
  headers: {
    ...otherFounder.auth,
    'x-company-id': companyId,
    'x-aico-company-id': companyId,
  },
});
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
const foreignAttachmentMeta = await call(`/attachments/${attachmentId}`, {
  headers: otherFounder.auth,
});
const foreignAttachmentBytes = await callRaw(`/runs/${runId}/attachments/${attachmentId}`, {
  headers: otherFounder.auth,
});
const foreignAttachmentWrite = await call(`/initiatives/${initiative.body.data.id}/goals`, {
  method: 'POST',
  headers: {
    ...otherFounder.auth,
    'content-type': 'application/json',
    'idempotency-key': randomUUID(),
    'if-match': '"1"',
  },
  body: JSON.stringify({ ...goalEnvelope, attachment_ids: [attachmentId] }),
});
const absentAttachment = await call(`/attachments/${absentId}`, { headers: otherFounder.auth });
const absentAttachmentBytes = await callRaw(`/runs/${absentId}/attachments/${absentId}`, {
  headers: otherFounder.auth,
});
const absentRun = await call(`/runs/${absentId}`, { headers: otherFounder.auth });
const absentDelete = await call(`/runs/${absentId}`, {
  method: 'DELETE',
  headers: otherFounder.auth,
});

assertNonDisclosingDenial(
  otherCurrentInitiative,
  foreignNeedles,
  'foreign current initiative',
);
assertNonDisclosingDenial(listTasks, foreignNeedles, 'foreign task list');
assertNonDisclosingDenial(listEvents, foreignNeedles, 'foreign event list');
assertNonDisclosingDenial(readRun, foreignNeedles, 'foreign run read');
assertNonDisclosingDenial(writeGoal, foreignNeedles, 'foreign goal write');
assertNonDisclosingDenial(deleteRun, foreignNeedles, 'foreign run delete');
assertNonDisclosingDenial(
  foreignAttachmentMeta,
  [...foreignNeedles, 'notes.txt'],
  'foreign attachment metadata',
);
assert(foreignAttachmentBytes.response.status === 404, 'foreign attachment bytes were disclosed');
assert(
  !foreignAttachmentBytes.buffer.toString('utf8').includes('reference notes'),
  'foreign bytes leaked body',
);
assertNonDisclosingDenial(
  foreignAttachmentWrite,
  [...foreignNeedles, 'notes.txt'],
  'foreign attachment link',
);
assertEquivalentAbsence(
  foreignAttachmentMeta,
  absentAttachment,
  'foreign vs absent attachment metadata',
);
assert(
  foreignAttachmentBytes.response.status === absentAttachmentBytes.response.status,
  'foreign vs absent attachment bytes status diverged',
);
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
