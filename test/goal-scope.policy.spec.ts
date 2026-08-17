import { DomainError } from '../src/common/domain/domain-error';
import type { CreateGoalDto } from '../src/modules/initiatives/dto/create-goal.dto';
import { GoalScopePolicy } from '../src/modules/initiatives/goal-scope.policy';

const validGoal = (): CreateGoalDto => ({
  schema_version: 1,
  start_run: true,
  attachment_ids: [],
  goal: {
    target_user: 'Independent consultants',
    problem: 'Creating a reviewable client proposal takes too long.',
    desired_outcome: 'Prepare and review a proposal prototype.',
    primary_flow: 'Create, review, and mark ready',
    must_haves: [{ id: 'MH-001', text: 'Create a proposal from mock data' }],
    non_goals: ['Payments', 'Production deployment'],
    visual_direction: 'Calm editorial workspace',
    constraints: {
      max_screens: 5,
      primary_flows: 1,
      client_only: true,
      data_mode: 'mock_or_local',
    },
    reference_ids: [],
  },
});

describe('GoalScopePolicy', () => {
  const policy = new GoalScopePolicy();

  it('accepts the bounded MVP goal', () => {
    expect(() => policy.assertSupported(validGoal())).not.toThrow();
  });

  it('rejects server-side scope without silently narrowing it', () => {
    const goal = validGoal();
    const submitted = structuredClone(goal);
    goal.goal.constraints.client_only = false;
    try {
      policy.assertSupported(goal);
      throw new Error('Expected goal scope policy to reject server-side scope');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('goal_out_of_scope');
      expect(goal.goal.constraints.client_only).toBe(false);
      expect(submitted.goal.constraints.client_only).toBe(true);
    }
  });

  it('rejects duplicate stable requirement IDs', () => {
    const goal = validGoal();
    goal.goal.must_haves.push({ id: 'MH-001', text: 'Duplicate identifier' });
    expect(() => policy.assertSupported(goal)).toThrow(DomainError);
  });
});
