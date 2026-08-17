# Tenant Isolation Harness

AICO-015 owns the reusable two-company isolation protocol for later artifact,
model-context, preview, sandbox, and export tests. Do not add a 23rd verification
gate; new surfaces import this harness from an existing gate (`unit-contract`,
`storage`, or `http-smoke`).

## Companies A and B

Create two invited founders, each with one company and disjoint marker values
(name, purpose, goal text, object body). Capture owner state before the attack.
Company B never receives a client-supplied `company_id`, `X-Company-Id`, object
key, or JWT tenant claim as authority. Scope is derived from the redeemed
session's founder row.

## HTTP protocol

Import `test/isolation-harness.mjs`:

1. Issue the foreign list, read, write, and delete against A's IDs using B's
   bearer token.
2. Repeat the same method against a random absent UUID.
3. Assert `assertNonDisclosingDenial` (`404` / `resource_not_found`, no foreign
   markers) and `assertEquivalentAbsence`.
4. Re-read A's resource as A and prove the before/after snapshot is unchanged.

Own-tenant action-class denials may return `403 action_denied` only after
ownership is proven. Cross-tenant attempts must not use `403`.

## Object protocol

1. Build keys only with `buildObjectKey` / `src/common/tenant/object-key.ts`.
2. Call `authorizeObjectAccess(companyId, objectKey)` before any adapter `send`.
3. Foreign HEAD/GET/DELETE must leave the adapter call ledger unchanged and must
   not mutate A's object.
4. `ObjectAccessService` loads `object_records` by `(company_id, id)` and only
   then calls the store. There is no ordinary `findById(id)` or raw-key getter.

## Later surfaces

| Surface       | Owning issue | How to extend the harness                                                    |
| ------------- | ------------ | ---------------------------------------------------------------------------- |
| Attachments   | AICO-017     | Foreign metadata/list/link/bytes deny before store I/O; same `404` as absent |
| Model context | AICO-031/032 | Foreign frozen refs must fail before provider invocation                     |
| Preview       | AICO-057     | Foreign preview handle is the same `404` as absent                           |
| Sandbox       | AICO-049     | Foreign workspace/object path denies before materialization                  |
| Export        | AICO-069–071 | Foreign export ID denies before package/object write                         |

Keep seeded foreign markers out of logs, events, and evidence bundles. AICO-082
owns the remaining adversarial completeness, RLS, and signed-access cases.
