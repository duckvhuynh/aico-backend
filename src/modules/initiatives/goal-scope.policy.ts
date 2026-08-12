import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/domain/domain-error';
import type { CreateGoalDto } from './dto/create-goal.dto';

@Injectable()
export class GoalScopePolicy {
  assertSupported(dto: CreateGoalDto): void {
    const violations: Array<Record<string, unknown>> = [];
    if (!dto.start_run) {
      violations.push({ rule: 'first_slice_requires_start_run', field: 'start_run' });
    }
    if (dto.goal.constraints.max_screens > 5) {
      violations.push({ rule: 'max_five_screens', field: 'goal.constraints.max_screens' });
    }
    if (dto.goal.constraints.primary_flows !== 1) {
      violations.push({ rule: 'one_primary_flow', field: 'goal.constraints.primary_flows' });
    }
    if (!dto.goal.constraints.client_only) {
      violations.push({ rule: 'client_only', field: 'goal.constraints.client_only' });
    }
    if (dto.goal.constraints.data_mode !== 'mock_or_local') {
      violations.push({ rule: 'mock_or_local_data', field: 'goal.constraints.data_mode' });
    }
    if (new Set(dto.goal.must_haves.map((item) => item.id)).size !== dto.goal.must_haves.length) {
      violations.push({ rule: 'unique_must_have_ids', field: 'goal.must_haves' });
    }
    if (dto.attachment_ids.length > 0) {
      violations.push({
        rule: 'attachments_not_enabled_in_foundation_slice',
        field: 'attachment_ids',
      });
    }

    if (violations.length > 0) {
      throw new DomainError({
        status: 422,
        code: 'goal_out_of_scope',
        title: 'The goal exceeds the Prototype Initiative boundary',
        detail: 'Submit a new goal version that fits the bounded client-side prototype scope.',
        errors: violations,
        remediation: ['narrow_goal', 'submit_new_goal_version'],
      });
    }
  }
}
