import type { QualificationGoalInput } from '../../src/modules/initiatives/goal-qualification';

export const validBoundaryGoal = (): QualificationGoalInput => ({
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
});

function withMustHave(text: string): QualificationGoalInput {
  const goal = validBoundaryGoal();
  goal.must_haves = [{ id: 'MH-001', text }];
  return goal;
}

function multipleFlowGoal(): QualificationGoalInput {
  const goal = validBoundaryGoal();
  goal.constraints.primary_flows = 2;
  goal.primary_flow = 'Create proposals and also run a second primary user flow for billing';
  return goal;
}

function sixScreenGoal(): QualificationGoalInput {
  const goal = validBoundaryGoal();
  goal.constraints.max_screens = 6;
  return goal;
}

function missingTargetUserGoal(): QualificationGoalInput {
  const goal = validBoundaryGoal();
  goal.target_user = 'TBD';
  return goal;
}

export const goalQualificationFixtures = {
  backend: withMustHave('Add a generated backend REST API for proposals'),
  payment: withMustHave('Process real Stripe payments for each accepted proposal'),
  deployment: withMustHave('Deploy the prototype to production on Vercel'),
  multipleFlow: multipleFlowGoal(),
  sixScreen: sixScreenGoal(),
  sensitiveData: withMustHave('Load real customer Social Security numbers from the production CRM'),
  missingTargetUser: missingTargetUserGoal(),
  validBoundary: validBoundaryGoal(),
};
