import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/domain/domain-error';
import type { CreateGoalDto } from './dto/create-goal.dto';
import {
  evaluateGoalQualification,
  publicGoalQualification,
  type GoalQualification,
} from './goal-qualification';

@Injectable()
export class GoalScopePolicy {
  evaluate(dto: CreateGoalDto): GoalQualification {
    this.assertCommand(dto);
    return evaluateGoalQualification(dto.goal);
  }

  assertSupported(dto: CreateGoalDto): void {
    const qualification = this.evaluate(dto);
    if (qualification.result === 'out_of_scope') {
      throw this.toOutOfScopeError(qualification);
    }
  }

  toOutOfScopeError(qualification: GoalQualification): DomainError {
    return new DomainError({
      status: 422,
      code: 'goal_out_of_scope',
      title: 'The goal exceeds the Prototype Initiative boundary',
      detail: qualification.explanation,
      errors: [
        ...qualification.findings.map((finding) => ({
          rule: finding.rule,
          field: finding.field,
          capability: finding.capability,
          reason_code: finding.reason_code,
        })),
        { qualification: publicGoalQualification(qualification) },
      ],
      remediation: ['narrow_goal', 'submit_new_goal_version'],
    });
  }

  private assertCommand(dto: CreateGoalDto): void {
    const violations: Array<Record<string, unknown>> = [];
    if (!dto.start_run) {
      violations.push({ rule: 'first_slice_requires_start_run', field: 'start_run' });
    }
    if (new Set(dto.goal.must_haves.map((item) => item.id)).size !== dto.goal.must_haves.length) {
      violations.push({ rule: 'unique_must_have_ids', field: 'goal.must_haves' });
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
