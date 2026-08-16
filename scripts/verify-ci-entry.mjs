import { assertSupportedNodeRuntime } from './node-runtime-contract.mjs';

assertSupportedNodeRuntime();
await import('./prove-node-runtime-preflight.mjs');
await import('./verify-ci.mjs');
