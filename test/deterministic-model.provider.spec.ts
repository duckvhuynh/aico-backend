import { DeterministicModelProvider } from '../src/modules/orchestration/deterministic-model.provider';

describe('DeterministicModelProvider', () => {
  it('creates a typed, zero-cost product brief fixture', async () => {
    const provider = new DeterministicModelProvider();
    const result = await provider.invoke({
      task_type: 'CREATE_PRODUCT_BRIEF',
      attempt_id: '019c0000-0000-7000-8000-000000000020',
      context: {
        company: { purpose: 'Help consultants', target_customer: 'Consultants' },
        goal: {
          problem: 'Proposal drafting is slow',
          target_user: 'Consultants',
          desired_outcome: 'Faster proposals',
          primary_flow: 'Draft and review',
          must_haves: [{ id: 'MH-001', text: 'Draft a proposal' }],
          non_goals: ['Payments'],
        },
      },
    });

    expect(result.output_schema_version).toBe('product-brief-v1');
    expect(result.provider).toBe('deterministic');
    expect(result.usage.cost_minor).toBe('0');
    expect(result.content.acceptance_criteria).toEqual([
      { id: 'AC-001', criterion: 'Draft a proposal' },
    ]);
  });
});
