import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GOAL_REASON_CODES,
  QUALIFICATION_POLICY,
} from '../src/modules/initiatives/policy/qualification-policy';

interface PolicyEntry {
  id: string;
  value: unknown;
  reason_code: string;
}

interface ReasonCode {
  code: string;
  founder_message: string;
  next_action: string;
}

describe('AICO-019 qualification policy contract', () => {
  const policy = JSON.parse(
    readFileSync(join(__dirname, '../docs/policies/alpha-operating-policy-v1.json'), 'utf8'),
  ) as {
    policy_version: string;
    qualification: { entries: PolicyEntry[] };
    reason_codes: ReasonCode[];
  };

  function entry(id: string): PolicyEntry {
    const found = policy.qualification.entries.find((item) => item.id === id);
    if (!found) {
      throw new Error(`missing policy entry ${id}`);
    }
    return found;
  }

  it('freezes qualification limits and denied capabilities from AICO-008', () => {
    expect(policy.policy_version).toBe(QUALIFICATION_POLICY.policyVersion);
    expect(entry('A8V-QUAL-CATEGORIES').value).toEqual([...QUALIFICATION_POLICY.allowedCategories]);
    expect(entry('A8V-QUAL-PERSONAS').value).toBe(QUALIFICATION_POLICY.maxPersonas);
    expect(entry('A8V-QUAL-FLOWS').value).toBe(QUALIFICATION_POLICY.maxFlows);
    expect(entry('A8V-QUAL-ROUTES').value).toBe(QUALIFICATION_POLICY.maxScreens);
    expect(entry('A8V-QUAL-PLATFORM').value).toBe(QUALIFICATION_POLICY.platform);
    expect(entry('A8V-QUAL-TEMPLATE').value).toBe(QUALIFICATION_POLICY.template);
    expect(entry('A8V-QUAL-CLIENT-ONLY').value).toBe(QUALIFICATION_POLICY.clientOnly);
    expect(entry('A8V-QUAL-DENIED').value).toEqual([...QUALIFICATION_POLICY.deniedCapabilities]);
    expect(entry('A8V-QUAL-QUESTIONS').value).toBe(QUALIFICATION_POLICY.maxClarificationQuestions);
  });

  it('uses the accepted founder messages and next actions for goal reason codes', () => {
    for (const [code, copy] of Object.entries(GOAL_REASON_CODES)) {
      const found = policy.reason_codes.find((item) => item.code === code);
      expect(found).toEqual({
        code,
        founder_message: copy.founder_message,
        next_action: copy.next_action,
      });
    }
  });
});
