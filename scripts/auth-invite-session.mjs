export async function authenticateInvitedFounder(call, identity) {
  const invite = await call('/auth/invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: identity.email,
      display_name: identity.display_name,
      invite_ttl_seconds: identity.invite_ttl_seconds,
      session_ttl_seconds: identity.session_ttl_seconds,
    }),
  });
  if (invite.response.status !== 201) {
    throw new Error(`invite issue failed: ${JSON.stringify(invite.body)}`);
  }
  const session = await call('/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invite_token: invite.body.data.invite_token }),
  });
  if (session.response.status !== 201) {
    throw new Error(`invite redeem failed: ${JSON.stringify(session.body)}`);
  }
  return {
    invite,
    session,
    founder_id: session.body.data.founder_id,
    session_id: session.body.data.session_id,
    auth: { Authorization: `Bearer ${session.body.data.access_token}` },
  };
}
