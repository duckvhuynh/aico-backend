import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGoalDto } from '../src/modules/initiatives/dto/create-goal.dto';

const validGoal = {
  schema_version: 1,
  goal: {
    target_user: 'Independent consultants',
    problem: 'Discovery notes take too long to turn into proposals.',
    desired_outcome: 'Prepare a concise proposal draft for review.',
    primary_flow: 'Create and review a proposal',
    must_haves: [{ id: 'MH-001', text: 'Create a proposal from structured mock data' }],
    non_goals: ['Payments'],
    visual_direction: 'Calm editorial workspace',
    constraints: {
      max_screens: 5,
      primary_flows: 1,
      client_only: true,
      data_mode: 'mock_or_local',
    },
    reference_ids: [],
  },
  attachment_ids: [],
  start_run: true,
};

describe('CreateGoalDto contract', () => {
  it('accepts the versioned bounded MVP envelope', async () => {
    const errors = await validate(plainToInstance(CreateGoalDto, validGoal));
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['unknown schema version', { ...validGoal, schema_version: 2 }],
    [
      'more than five screens',
      {
        ...validGoal,
        goal: { ...validGoal.goal, constraints: { ...validGoal.goal.constraints, max_screens: 6 } },
      },
    ],
    [
      'a second primary flow',
      {
        ...validGoal,
        goal: {
          ...validGoal.goal,
          constraints: { ...validGoal.goal.constraints, primary_flows: 2 },
        },
      },
    ],
  ])('rejects %s', async (_name, payload) => {
    const errors = await validate(plainToInstance(CreateGoalDto, payload));
    expect(errors.length).toBeGreaterThan(0);
  });
});
