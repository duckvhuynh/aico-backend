import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/domain/domain-error';
import type { CompanyProfileDto } from './dto/company-profile.dto';

@Injectable()
export class CompanyProfilePolicy {
  assertCreate(name: string, profile: CompanyProfileDto): void {
    this.assertName(name);
    this.assertProfile(profile);
  }

  assertProfile(profile: CompanyProfileDto): void {
    if (!profile.sensitive_data_warning_acknowledged) {
      throw new DomainError({
        status: 422,
        code: 'unsupported_sensitive_data',
        title: 'Sensitive-data warning was not acknowledged',
        detail:
          'Acknowledge that the company profile must not include real customer or other sensitive data.',
        errors: [{ field: 'sensitive_data_warning_acknowledged', rule: 'must_acknowledge' }],
        remediation: ['acknowledge_sensitive_data_warning'],
      });
    }

    const violations: Array<Record<string, unknown>> = [];
    if (profile.purpose.trim().length < 10 || profile.purpose.trim().length > 1000) {
      violations.push({ field: 'purpose', rule: 'purpose_length' });
    }
    if (profile.target_customer.trim().length < 3 || profile.target_customer.trim().length > 500) {
      violations.push({ field: 'target_customer', rule: 'target_customer_length' });
    }
    if (
      !Array.isArray(profile.constraints) ||
      profile.constraints.length < 1 ||
      profile.constraints.length > 20 ||
      profile.constraints.some((item) => item.trim().length === 0 || item.trim().length > 200)
    ) {
      violations.push({ field: 'constraints', rule: 'durable_constraints_required' });
    }
    if (profile.normalized_limits.max_screens < 1 || profile.normalized_limits.max_screens > 5) {
      violations.push({
        field: 'normalized_limits.max_screens',
        rule: 'max_five_screens',
      });
    }
    if (profile.normalized_limits.primary_flows !== 1) {
      violations.push({
        field: 'normalized_limits.primary_flows',
        rule: 'one_primary_flow',
      });
    }
    if (profile.normalized_limits.data_mode !== 'mock_or_local') {
      violations.push({
        field: 'normalized_limits.data_mode',
        rule: 'mock_or_local_data',
      });
    }
    if (violations.length > 0) {
      throw new DomainError({
        status: 422,
        code: 'domain_rule_violated',
        title: 'The company profile is outside the MVP boundary',
        detail:
          'Submit name, purpose, target customer, durable constraints, and normalized limits that fit the bounded prototype.',
        errors: violations,
        remediation: ['correct_company_profile'],
      });
    }
  }

  private assertName(name: string): void {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      throw new DomainError({
        status: 422,
        code: 'domain_rule_violated',
        title: 'The company profile is outside the MVP boundary',
        detail: 'Submit a company name between 2 and 120 characters.',
        errors: [{ field: 'name', rule: 'company_name_length' }],
        remediation: ['correct_company_profile'],
      });
    }
  }
}
