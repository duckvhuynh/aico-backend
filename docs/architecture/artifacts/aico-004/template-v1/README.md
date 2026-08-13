# AI Company OS Prototype Template v1 Candidate

This is the decision-grade AICO-004 template candidate. It is client-only, uses typed local
fixtures, has exactly one primary flow and five hash routes, and renders a persistent
non-production warning. It does not contain a backend, authentication, payments, email,
analytics, deployment, runtime fetch, or external integration.

The committed lockfile and candidate dependency image are part of the AICO-004 decision package.
Generated execution must not install packages, modify protected configuration, receive a network
route, or run a raw command. AICO-047 may productize and publish an accepted derivative; it does
not supply the inputs needed to accept AICO-004.

Local decision checks:

```text
npm ci --ignore-scripts
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Passing these commands is template evidence, not production sandbox evidence or an accessibility
conformance claim.
