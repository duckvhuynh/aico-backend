import { DomainError } from '../src/common/domain/domain-error';
import { CompanyProfilePolicy } from '../src/modules/companies/company-profile.policy';
import type { CompanyProfileDto } from '../src/modules/companies/dto/company-profile.dto';

const validProfile = (): CompanyProfileDto => ({
  purpose: 'Help independent consultants prepare concise client proposals.',
  target_customer: 'Independent consultants serving small businesses',
  constraints: ['No customer PII', 'English only'],
  normalized_limits: { max_screens: 5, primary_flows: 1, data_mode: 'mock_or_local' },
  sensitive_data_warning_acknowledged: true,
});

describe('CompanyProfilePolicy', () => {
  const policy = new CompanyProfilePolicy();

  it('accepts a bounded MVP company profile', () => {
    expect(() => policy.assertCreate('Northstar Studio', validProfile())).not.toThrow();
  });

  it('rejects an unacknowledged sensitive-data warning without creating a version', () => {
    const profile = validProfile();
    profile.sensitive_data_warning_acknowledged = false;
    try {
      policy.assertProfile(profile);
      throw new Error('Expected unacknowledged warning to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('unsupported_sensitive_data');
      expect((error as DomainError).status).toBe(422);
    }
  });

  it('rejects normalized limits outside the prototype boundary', () => {
    const profile = validProfile();
    profile.normalized_limits.max_screens = 6;
    try {
      policy.assertProfile(profile);
      throw new Error('Expected over-limit screens to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('domain_rule_violated');
    }
  });
});
