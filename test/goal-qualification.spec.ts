import {
  evaluateGoalQualification,
  publicGoalQualification,
} from '../src/modules/initiatives/goal-qualification';
import { goalQualificationFixtures } from './fixtures/goal-qualification.fixtures';

describe('evaluateGoalQualification', () => {
  it('qualifies the valid in-scope boundary without mutating the submitted goal', () => {
    const goal = goalQualificationFixtures.validBoundary;
    const submitted = structuredClone(goal);
    const qualification = evaluateGoalQualification(goal);
    expect(qualification.result).toBe('qualified');
    expect(qualification.reason_codes).toEqual([]);
    expect(qualification.proposal).toBeNull();
    expect(qualification.clarification_questions).toEqual([]);
    expect(qualification.screen_estimate).toBe(5);
    expect(qualification.policy_version).toBe('1.0.0');
    expect(qualification.explanation).toContain('one primary persona');
    expect(goal).toEqual(submitted);
  });

  it('rejects a generated backend request with a proposal and without mutating the goal', () => {
    const goal = goalQualificationFixtures.backend;
    const submitted = structuredClone(goal);
    const qualification = evaluateGoalQualification(goal);
    expect(qualification.result).toBe('out_of_scope');
    expect(qualification.reason_codes).toEqual(['GOAL_REQUIRES_BACKEND']);
    expect(qualification.explanation).toContain('generated backend');
    expect(qualification.proposal).toContain('client-side mock');
    expect(qualification.proposal).toContain('submit a new goal version');
    expect(qualification.clarification_questions).toEqual([]);
    expect(goal).toEqual(submitted);
    expect(publicGoalQualification(qualification)).not.toHaveProperty('findings');
  });

  it('rejects a payment request as an unsupported capability', () => {
    const goal = goalQualificationFixtures.payment;
    const submitted = structuredClone(goal);
    const qualification = evaluateGoalQualification(goal);
    expect(qualification.result).toBe('out_of_scope');
    expect(qualification.reason_codes).toEqual(['GOAL_CAPABILITY_UNSUPPORTED']);
    expect(qualification.findings.some((finding) => finding.capability === 'real_payment')).toBe(
      true,
    );
    expect(qualification.proposal).toContain('real_payment');
    expect(goal).toEqual(submitted);
  });

  it('rejects production deployment without editing the submitted goal', () => {
    const goal = goalQualificationFixtures.deployment;
    const submitted = structuredClone(goal);
    const qualification = evaluateGoalQualification(goal);
    expect(qualification.result).toBe('out_of_scope');
    expect(qualification.reason_codes).toEqual(['GOAL_CAPABILITY_UNSUPPORTED']);
    expect(
      qualification.findings.some((finding) => finding.capability === 'production_deployment'),
    ).toBe(true);
    expect(qualification.proposal).toContain('production_deployment');
    expect(goal).toEqual(submitted);
  });

  it('rejects multiple primary flows', () => {
    const goal = goalQualificationFixtures.multipleFlow;
    const submitted = structuredClone(goal);
    const qualification = evaluateGoalQualification(goal);
    expect(qualification.result).toBe('out_of_scope');
    expect(qualification.reason_codes).toEqual(['GOAL_TOO_MANY_FLOWS']);
    expect(qualification.explanation).toContain('more than one primary user flow');
    expect(goal.constraints.primary_flows).toBe(2);
    expect(goal).toEqual(submitted);
  });

  it('rejects a six-screen constraint', () => {
    const goal = goalQualificationFixtures.sixScreen;
    const submitted = structuredClone(goal);
    const qualification = evaluateGoalQualification(goal);
    expect(qualification.result).toBe('out_of_scope');
    expect(qualification.reason_codes).toEqual(['GOAL_TOO_MANY_SCREENS']);
    expect(qualification.screen_estimate).toBe(6);
    expect(qualification.proposal).toContain('five screens or fewer');
    expect(goal.constraints.max_screens).toBe(6);
    expect(goal).toEqual(submitted);
  });

  it('rejects sensitive data without treating non-goals as requested behavior', () => {
    const goal = goalQualificationFixtures.sensitiveData;
    const submitted = structuredClone(goal);
    const qualification = evaluateGoalQualification(goal);
    expect(qualification.result).toBe('out_of_scope');
    expect(qualification.reason_codes).toEqual(['GOAL_CAPABILITY_UNSUPPORTED']);
    expect(qualification.findings.some((finding) => finding.capability === 'sensitive_data')).toBe(
      true,
    );
    expect(goal.non_goals).toEqual(submitted.non_goals);
    expect(goal).toEqual(submitted);
  });

  it('pauses missing target user with at most five clarification questions', () => {
    const goal = goalQualificationFixtures.missingTargetUser;
    const submitted = structuredClone(goal);
    const qualification = evaluateGoalQualification(goal);
    expect(qualification.result).toBe('needs_clarification');
    expect(qualification.reason_codes).toEqual(['GOAL_NEEDS_CLARIFICATION']);
    expect(qualification.proposal).toBeNull();
    expect(qualification.clarification_questions.length).toBeGreaterThan(0);
    expect(qualification.clarification_questions.length).toBeLessThanOrEqual(5);
    expect(qualification.clarification_questions[0]).toEqual({
      id: 'Q1',
      code: 'missing_target_user',
      prompt: 'Who is the single primary user of this prototype?',
    });
    expect(goal.target_user).toBe('TBD');
    expect(goal).toEqual(submitted);
  });

  it('does not treat excluded non-goals as requested out-of-scope capabilities', () => {
    const goal = goalQualificationFixtures.validBoundary;
    expect(goal.non_goals).toEqual(['Payments', 'Production deployment']);
    expect(evaluateGoalQualification(goal).result).toBe('qualified');
  });
});
