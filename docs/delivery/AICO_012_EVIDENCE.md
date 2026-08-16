# AICO-012 Invite-Only Authentication Evidence

**Parent issue:** `duckvhuynh/aicompanyos#12`  
**Backend issue:** `duckvhuynh/aico-backend#40`  
**Evidence date:** 2026-08-16  
**Canonical command:** `npm run verify:ci`

**Hosted PR SHA:** `278dfb9285b275c0344d2847daa460df941ce29d`  
**Hosted `verify`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31947165750  
**Hosted `prove`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31947165760  
**Hosted `validate`:** https://github.com/duckvhuynh/aico-backend/actions/runs/31947165753

DEP-07 is implemented as operator-provisioned invite accounts. Optional email
delivery remains deferred.

## Scope

- Valid invite redeem creates a stable `founder:{email}` identity.
- Public registration and the retired `dev-token` helper return non-disclosing `404`.
- One founder cannot create a second company.
- Sign-out, expiry, and revocation deny API and signed-resource access.
- Control-plane responses use `Cache-Control: no-store`.

## Acceptance reconciliation

| ID             | Parent criterion                                                                                                                 | Evidence                                                                                                                                                                                                                             | Result |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| A12-INVITE-01  | Valid invite/auth creates stable founder identity; public registration unavailable; one account cannot acquire a second company. | `POST /auth/invites` + `POST /auth/session`; `POST /auth/register` and `/auth/dev-token` 404; second `POST /companies` 409 in `test/smoke.mjs`. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/31947165750 | Pass   |
| A12-SESSION-01 | Sign-out, expiry, and revocation remove API/signed-resource access without leaking cached tenant content.                        | Session rows + JWT `sid`; `POST /auth/sign-out`; expired invite/session cases in smoke; `signedResourceAccessAllowed`; `NoStoreInterceptor`. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/31947165750    | Pass   |
| A12-TEST-01    | Tests cover valid/invalid/revoked/expired sessions, protected endpoints, and non-disclosing failures.                            | `test/auth.session.contract.spec.ts` and `test/smoke.mjs`. Hosted `verify`: https://github.com/duckvhuynh/aico-backend/actions/runs/31947165750                                                                                      | Pass   |
| A12-SCOPE-01   | No AICO-013+ expansion.                                                                                                          | No profile snapshot, UI, email, or IdP changes. No 23rd gate.                                                                                                                                                                        | Pass   |

## Non-goals kept

- AICO-013 run snapshot semantics
- AICO-014 founder UI
- Production identity provider and transactional email
- AICO-092 cohort-1 invites
