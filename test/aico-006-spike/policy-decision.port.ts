import type { PolicyDecisionV1, Rfc3339Utc } from './contracts';

export const POLICY_DECISION_PORT = Symbol('PolicyDecisionPort');

export interface PolicyEvaluationClock {
  now(): Rfc3339Utc;
}

export interface PolicyDecisionPort {
  evaluate(input: unknown): PolicyDecisionV1;
}
