import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCompanyDto } from '../src/modules/companies/dto/create-company.dto';

const validCompany = {
  name: 'Northstar Studio',
  profile: {
    purpose: 'Help independent consultants prepare concise client proposals.',
    target_customer: 'Independent consultants serving small businesses',
    constraints: ['No customer PII', 'English only'],
    normalized_limits: { max_screens: 5, primary_flows: 1, data_mode: 'mock_or_local' },
    sensitive_data_warning_acknowledged: true,
  },
};

describe('CreateCompanyDto contract', () => {
  it('accepts the versioned company profile envelope', async () => {
    const errors = await validate(plainToInstance(CreateCompanyDto, validCompany));
    expect(errors).toHaveLength(0);
  });

  it.each([
    ['a short name', { ...validCompany, name: 'A' }],
    [
      'more than five screens',
      {
        ...validCompany,
        profile: {
          ...validCompany.profile,
          normalized_limits: { ...validCompany.profile.normalized_limits, max_screens: 6 },
        },
      },
    ],
    [
      'a second primary flow',
      {
        ...validCompany,
        profile: {
          ...validCompany.profile,
          normalized_limits: { ...validCompany.profile.normalized_limits, primary_flows: 2 },
        },
      },
    ],
    [
      'empty durable constraints',
      { ...validCompany, profile: { ...validCompany.profile, constraints: [] } },
    ],
  ])('rejects %s', async (_name, payload) => {
    const errors = await validate(plainToInstance(CreateCompanyDto, payload));
    expect(errors.length).toBeGreaterThan(0);
  });
});
