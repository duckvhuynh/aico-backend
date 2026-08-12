import { Injectable } from '@nestjs/common';
import type { ModelInvocation, ModelProviderPort, ModelResult } from './model-provider.port';

@Injectable()
export class DeterministicModelProvider implements ModelProviderPort {
  async invoke(input: ModelInvocation): Promise<ModelResult> {
    if (input.task_type !== 'CREATE_PRODUCT_BRIEF') {
      throw new Error(`The deterministic provider does not support ${input.task_type}`);
    }
    const goal = input.context.goal as Record<string, unknown>;
    const company = input.context.company as Record<string, unknown>;
    return {
      output_schema_version: 'product-brief-v1',
      content: {
        problem: goal.problem,
        primary_persona: goal.target_user,
        outcome: goal.desired_outcome,
        assumptions: ['Founder-provided scope is accurate', 'Prototype uses mock or local data'],
        in_scope: goal.must_haves,
        out_of_scope: goal.non_goals,
        primary_flow: goal.primary_flow,
        acceptance_criteria: (goal.must_haves as Array<{ id: string; text: string }>).map(
          (item, index) => ({
            id: `AC-${String(index + 1).padStart(3, '0')}`,
            criterion: item.text,
          }),
        ),
        company_context: {
          purpose: company.purpose,
          target_customer: company.target_customer,
        },
        open_decisions: [],
      },
      provider: 'deterministic',
      model: 'fixture-product-manager',
      model_revision: '2026-08-12.1',
      usage: { input_tokens: 0, output_tokens: 0, cost_minor: '0' },
    };
  }
}
