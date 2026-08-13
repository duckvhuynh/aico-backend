import {
  DENY_REASON_CODES,
  RUN_STAGES,
  contractDigest,
  isAllowUsableAt,
  type PolicyInputV1,
  type Rfc3339Utc,
} from './aico-006-spike/contracts';
import { DeterministicPolicyDecisionService } from './aico-006-spike/deterministic-policy-decision.service';
import type { PolicyEvaluationClock } from './aico-006-spike/policy-decision.port';

const NOW = '2026-08-13T04:00:00.000Z' as Rfc3339Utc;
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);
const SHA_D = 'd'.repeat(64);

class FrozenClock implements PolicyEvaluationClock {
  constructor(private readonly instant: Rfc3339Utc) {}

  now(): Rfc3339Utc {
    return this.instant;
  }
}

function validGateInput(): PolicyInputV1 {
  return {
    meta: {
      schema_version: 1,
      message_id: '10000000-0000-4000-8000-000000000001',
      correlation_id: '10000000-0000-4000-8000-000000000002',
      causation_id: null,
      occurred_at: NOW,
    },
    policy_input_schema: 'policy-input/v1',
    policy_request_id: '10000000-0000-4000-8000-000000000003',
    evaluation_time: NOW,
    policy: {
      version_id: '20000000-0000-4000-8000-000000000001',
      semantic_version: '1.0.0',
      digest: SHA_A,
      targeting_version_id: '20000000-0000-4000-8000-000000000002',
      targeting_state: 'ACTIVE',
    },
    actor: {
      type: 'FOUNDER',
      id: '30000000-0000-4000-8000-000000000001',
      version: 'credential/v1:7',
      authentication_context_id: '30000000-0000-4000-8000-000000000002',
      authenticated_at: NOW,
      authentication_strength: 'session/v1',
      revocation_version: 1,
    },
    company: {
      id: '40000000-0000-4000-8000-000000000001',
      status: 'ACTIVE',
      founder_id: '30000000-0000-4000-8000-000000000001',
    },
    run: {
      id: '50000000-0000-4000-8000-000000000001',
      state: 'AWAITING_BRIEF_APPROVAL',
      stage: 'PRODUCT',
      row_version: 4,
      workflow_version: 'workflow/v1',
      policy_version: '1.0.0',
      cancellation_requested_at: null,
      operator_kill_version: 1,
    },
    task: null,
    attempt: null,
    action: {
      key: 'gate.gate-01.approve/v1',
      parameters_digest: SHA_B,
    },
    resource: {
      type: 'GATE_INSTANCE',
      id: '60000000-0000-4000-8000-000000000001',
      version: 2,
      company_id: '40000000-0000-4000-8000-000000000001',
      run_id: '50000000-0000-4000-8000-000000000001',
      digest: SHA_C,
    },
    gate: {
      id: 'GATE-01',
      gate_instance_id: '60000000-0000-4000-8000-000000000001',
      gate_instance_status: 'PENDING',
      gate_instance_row_version: 2,
      artifact_id: '70000000-0000-4000-8000-000000000001',
      artifact_version_id: '70000000-0000-4000-8000-000000000002',
      artifact_version: 3,
      artifact_checksum: SHA_D,
    },
    approval_references: [],
    budget: {
      applicability: 'NOT_APPLICABLE',
      policy_version: '1.0.0',
      snapshot_digest: contractDigest({ applicability: 'NOT_APPLICABLE' }),
    },
    environment: {
      application_version: 'proof/1',
      deployment_environment: 'TEST',
      provider: null,
      tool_key: null,
      tool_version: null,
      network_mode: null,
      digest: contractDigest({ environment: 'TEST', boundary: 'none' }),
    },
  };
}

function evaluator(allowTtlMs = 1_000): DeterministicPolicyDecisionService {
  return new DeterministicPolicyDecisionService(new FrozenClock(NOW), {
    supportedPolicyVersions: ['1.0.0'],
    allowTtlMs,
  });
}

describe('AICO-006 canonical policy contract spike', () => {
  it('freezes the accepted six-stage and fourteen-denial vocabularies', () => {
    expect(RUN_STAGES).toEqual(['INTAKE', 'PRODUCT', 'DESIGN', 'BUILD', 'QA', 'FINAL']);
    expect(DENY_REASON_CODES).toEqual([
      'ROLE_FORBIDDEN',
      'WRONG_STAGE',
      'APPROVAL_MISSING',
      'STALE_VERSION',
      'RESOURCE_OUT_OF_SCOPE',
      'BUDGET_UNAVAILABLE',
      'ENVIRONMENT_UNSAFE',
      'TENANT_MISMATCH',
      'INVALID_CONTEXT',
      'AUTHENTICATION_REQUIRED',
      'POLICY_VERSION_UNSUPPORTED',
      'ALLOW_EXPIRED',
      'RUN_CANCELED',
      'RUN_TERMINAL',
    ]);
  });

  it('returns a single-use, exact-binding ACTION_ALLOWED decision', () => {
    const input = validGateInput();
    const decision = evaluator().evaluate(input);

    expect(decision.effect).toBe('ALLOW');
    if (decision.effect !== 'ALLOW') {
      throw new Error(`unexpected denial: ${decision.reason_code}`);
    }
    expect(decision.reason_code).toBe('ACTION_ALLOWED');
    expect(decision.binding).toMatchObject({
      actor_id: input.actor.id,
      actor_version: input.actor.version,
      company_id: input.company.id,
      run_id: input.run.id,
      action: input.action.key,
      parameters_digest: input.action.parameters_digest,
      resource_id: input.resource.id,
      resource_version: input.resource.version,
      artifact_version_id: input.gate?.artifact_version_id,
      policy_targeting_version_id: input.policy.targeting_version_id,
      maximum_uses: 1,
    });
    expect(decision.issued_at).toBe(NOW);
    expect(decision.expires_at).toBe('2026-08-13T04:00:01.000Z');
  });

  it.each([
    ['unknown action', { action: { key: 'GATE.APPROVE', parameters_digest: SHA_B } }],
    ['unknown stage', { run: { ...validGateInput().run, stage: 'TERMINAL' } }],
    ['unknown top-level field', { untrusted_authority: true }],
  ])('fails closed for %s', (_label, mutation) => {
    const decision = evaluator().evaluate({
      ...validGateInput(),
      ...mutation,
    });

    expect(decision).toMatchObject({
      effect: 'DENY',
      reason_code: 'INVALID_CONTEXT',
      expires_at: null,
      maximum_uses: 0,
    });
  });

  it('denies a missing exact gate binding', () => {
    const decision = evaluator().evaluate({ ...validGateInput(), gate: null });

    expect(decision.effect).toBe('DENY');
    expect(decision.reason_code).toBe('WRONG_STAGE');
  });

  it('uses an exclusive expiry boundary without refreshing the decision', () => {
    const decision = evaluator(1_000).evaluate(validGateInput());

    expect(isAllowUsableAt(decision, '2026-08-13T04:00:00.999Z')).toBe(true);
    expect(isAllowUsableAt(decision, '2026-08-13T04:00:01.000Z')).toBe(false);
    expect(isAllowUsableAt(decision, '2026-08-13T04:00:01.001Z')).toBe(false);
    expect(decision.issued_at).toBe(NOW);
  });

  it('redacts malformed victim references from a zero-authority DENY', () => {
    const victimCanary = 'victim-run-do-not-disclose';
    const decision = evaluator().evaluate({
      ...validGateInput(),
      run: { ...validGateInput().run, id: victimCanary },
      resource: { ...validGateInput().resource, run_id: victimCanary },
      raw_secret: 'credential-canary-do-not-retain',
    });

    expect(decision).toMatchObject({
      effect: 'DENY',
      reason_code: 'INVALID_CONTEXT',
      binding: {
        actor_type: null,
        actor_version: null,
        company_id: null,
        action_class: 'UNKNOWN',
        resource_class: 'UNKNOWN',
        supplied_reference_digest: null,
      },
      expires_at: null,
      maximum_uses: 0,
    });
    expect(JSON.stringify(decision)).not.toContain(victimCanary);
    expect(JSON.stringify(decision)).not.toContain('credential-canary');
  });

  it('default-denies missing authentication and inactive targeting', () => {
    const input = validGateInput();
    expect(
      evaluator().evaluate({
        ...input,
        actor: { ...input.actor, authentication_context_id: null },
      }),
    ).toMatchObject({
      effect: 'DENY',
      reason_code: 'AUTHENTICATION_REQUIRED',
      expires_at: null,
      maximum_uses: 0,
    });
    expect(
      evaluator().evaluate({
        ...input,
        policy: { ...input.policy, targeting_state: 'DENY_ALL' },
      }),
    ).toMatchObject({
      effect: 'DENY',
      reason_code: 'POLICY_VERSION_UNSUPPORTED',
      expires_at: null,
      maximum_uses: 0,
    });
  });
});
