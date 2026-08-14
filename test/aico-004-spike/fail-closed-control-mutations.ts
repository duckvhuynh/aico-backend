import type { A4ThreatCase } from './contracts';

export interface A4SourceControlMutation {
  id: `A4-M-${string}`;
  control: string;
  target: string;
  intendedCase: A4ThreatCase;
  search: string;
  replacement: string;
}

export const A4_SOURCE_CONTROL_MUTATIONS: readonly A4SourceControlMutation[] = [
  {
    id: 'A4-M-01',
    control: 'exact GATE-02 and cancellation revalidation',
    target: 'test/aico-004-spike/proof-service.ts',
    intendedCase: 'A4-T-GATE-01',
    search: 'const ENFORCE_GATE_AND_CANCEL = true;',
    replacement: 'const ENFORCE_GATE_AND_CANCEL = false;',
  },
  {
    id: 'A4-M-02',
    control: 'same-company tenant authority',
    target: 'test/aico-004-spike/proof-service.ts',
    intendedCase: 'A4-T-TENANT-01',
    search: 'const ENFORCE_TENANT_AUTHORITY = true;',
    replacement: 'const ENFORCE_TENANT_AUTHORITY = false;',
  },
  {
    id: 'A4-M-03',
    control: 'no-follow link and output containment',
    target: 'test/aico-004-spike/proof-service.ts',
    intendedCase: 'A4-T-FS-LINK-01',
    search: 'const ENFORCE_LINK_OUTPUT_INTEGRITY = true;',
    replacement: 'const ENFORCE_LINK_OUTPUT_INTEGRITY = false;',
  },
  {
    id: 'A4-M-04',
    control: 'frozen template, dependency, and lock digest binding',
    target: 'test/aico-004-spike/proof-service.ts',
    intendedCase: 'A4-T-TEMPLATE-01',
    search: 'const ENFORCE_BUNDLE_BINDING = true;',
    replacement: 'const ENFORCE_BUNDLE_BINDING = false;',
  },
  {
    id: 'A4-M-05',
    control: 'closed command ID and parameter digest binding',
    target: 'test/aico-004-spike/proof-service.ts',
    intendedCase: 'A4-T-COMMAND-01',
    search: 'const ENFORCE_COMMAND_BINDING = true;',
    replacement: 'const ENFORCE_COMMAND_BINDING = false;',
  },
  {
    id: 'A4-M-06',
    control: 'network-none guest isolation',
    target: 'test/aico-004-spike/docker-adapter.ts',
    intendedCase: 'A4-T-EGRESS-DNS-01',
    search: 'const ENFORCE_NETWORK_ISOLATION = true;',
    replacement: 'const ENFORCE_NETWORK_ISOLATION = false;',
  },
  {
    id: 'A4-M-07',
    control: 'closed credential-free guest environment',
    target: 'test/aico-004-spike/docker-adapter.ts',
    intendedCase: 'A4-T-CREDENTIAL-01',
    search: 'const ENFORCE_CLOSED_GUEST_ENVIRONMENT = true;',
    replacement: 'const ENFORCE_CLOSED_GUEST_ENVIRONMENT = false;',
  },
  {
    id: 'A4-M-08',
    control: 'finite cgroup PID and resource accounting',
    target: 'test/aico-004-spike/docker-adapter.ts',
    intendedCase: 'A4-T-CPU-01',
    search: 'const ENFORCE_RUNTIME_LIMITS = true;',
    replacement: 'const ENFORCE_RUNTIME_LIMITS = false;',
  },
  {
    id: 'A4-M-09',
    control: 'hard deadline classification and whole-container kill',
    target: 'test/aico-004-spike/docker-adapter.ts',
    intendedCase: 'A4-T-TIMEOUT-01',
    search: 'const ENFORCE_TIMEOUT_CLASSIFICATION = true;',
    replacement: 'const ENFORCE_TIMEOUT_CLASSIFICATION = false;',
  },
  {
    id: 'A4-M-10',
    control: 'exact final output manifest and checksum binding',
    target: 'test/aico-004-spike/proof-service.ts',
    intendedCase: 'A4-T-OUTPUT-INTEGRITY-01',
    search: 'const ENFORCE_FINAL_OUTPUT_BINDING = true;',
    replacement: 'const ENFORCE_FINAL_OUTPUT_BINDING = false;',
  },
  {
    id: 'A4-M-11',
    control: 'logical invocation idempotency and no second workload',
    target: 'test/aico-004-spike/proof-service.ts',
    intendedCase: 'A4-T-REPLAY-01',
    search: 'const ENFORCE_IDEMPOTENCY = true;',
    replacement: 'const ENFORCE_IDEMPOTENCY = false;',
  },
  {
    id: 'A4-M-12',
    control: 'bounded evidence canary scan',
    target: 'test/aico-004-spike/proof-service.ts',
    intendedCase: 'A4-T-REDACTION-CLEANUP-01',
    search: 'const ENFORCE_CANARY_SCAN = true;',
    replacement: 'const ENFORCE_CANARY_SCAN = false;',
  },
];
