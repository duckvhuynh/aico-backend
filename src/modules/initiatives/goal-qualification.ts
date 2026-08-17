import {
  GOAL_REASON_CODE_ORDER,
  GOAL_REASON_CODES,
  QUALIFICATION_POLICY,
  QUALIFICATION_POLICY_VERSION,
  type GoalReasonCode,
} from './policy/qualification-policy';

export interface QualificationGoalInput {
  target_user: string;
  problem: string;
  desired_outcome: string;
  primary_flow: string;
  must_haves: Array<{ id: string; text: string }>;
  non_goals: string[];
  visual_direction: string;
  constraints: {
    max_screens: number;
    primary_flows: number;
    client_only: boolean;
    data_mode: string;
  };
  reference_ids: string[];
}

export type QualificationResult = 'qualified' | 'needs_clarification' | 'out_of_scope';

export interface ClarificationQuestion {
  id: string;
  code: string;
  prompt: string;
}

export interface QualificationFinding {
  reason_code: GoalReasonCode;
  rule: string;
  field?: string;
  capability?: string;
}

export interface GoalQualification {
  result: QualificationResult;
  reason_codes: GoalReasonCode[];
  explanation: string;
  proposal: string | null;
  clarification_questions: ClarificationQuestion[];
  screen_estimate: number;
  policy_version: string;
  findings: QualificationFinding[];
}

export function publicGoalQualification(
  qualification: GoalQualification,
): Omit<GoalQualification, 'findings'> {
  return {
    result: qualification.result,
    reason_codes: [...qualification.reason_codes],
    explanation: qualification.explanation,
    proposal: qualification.proposal,
    clarification_questions: qualification.clarification_questions.map((question) => ({
      ...question,
    })),
    screen_estimate: qualification.screen_estimate,
    policy_version: qualification.policy_version,
  };
}

const MISSING_TARGET_USER = /^(tbd|n\/a|na|unknown|todo|users?|people|someone|tbc)$/i;
const VAGUE_TEXT = /^(tbd|n\/a|na|unknown|todo|tbc|not sure)\b/i;
const WORD_NUMBER: Record<string, number> = {
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const DENIED_CAPABILITY_PATTERNS: Array<{
  capability: (typeof QUALIFICATION_POLICY.deniedCapabilities)[number];
  reason_code: GoalReasonCode;
  rule: string;
  patterns: RegExp[];
}> = [
  {
    capability: 'production_deployment',
    reason_code: 'GOAL_CAPABILITY_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [
      /\bproduction deploy(?:ment|ing)?\b/i,
      /\bdeploy(?:ing|ed)? (?:the )?(?:prototype|app|application) to production\b/i,
      /\bdeploy to (?:aws|gcp|azure|vercel|netlify|kubernetes)\b/i,
      /\bproduction hosting\b/i,
    ],
  },
  {
    capability: 'generated_backend',
    reason_code: 'GOAL_REQUIRES_BACKEND',
    rule: 'denied_capability',
    patterns: [
      /\bgenerated backend\b/i,
      /\bbackend rest api\b/i,
      /\brest api server\b/i,
      /\bgraphql server\b/i,
      /\bexpress server\b/i,
      /\bnestjs backend\b/i,
      /\bproduction service\b/i,
    ],
  },
  {
    capability: 'production_database',
    reason_code: 'GOAL_REQUIRES_BACKEND',
    rule: 'denied_capability',
    patterns: [
      /\bproduction database\b/i,
      /\bpostgres(?:ql)? production\b/i,
      /\bconnect to (?:the )?(?:company|production) database\b/i,
    ],
  },
  {
    capability: 'real_authentication',
    reason_code: 'GOAL_CAPABILITY_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [
      /\breal (?:user )?authentication\b/i,
      /\bproduction (?:login|authentication)\b/i,
      /\boauth(?:2)? login\b/i,
      /\bsingle sign[- ]on\b/i,
    ],
  },
  {
    capability: 'real_payment',
    reason_code: 'GOAL_CAPABILITY_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [
      /\bstripe\b/i,
      /\bpaypal\b/i,
      /\breal payments?\b/i,
      /\bprocess(?:ing)? payments?\b/i,
      /\bpayment processing\b/i,
      /\bcharge (?:a |the )?credit cards?\b/i,
      /\bcheckout with (?:real )?cards?\b/i,
    ],
  },
  {
    capability: 'email_delivery',
    reason_code: 'GOAL_CAPABILITY_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [/\bsend(?:s|ing)? (?:transactional )?emails?\b/i, /\bemail delivery\b/i],
  },
  {
    capability: 'third_party_business_api',
    reason_code: 'GOAL_CAPABILITY_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [
      /\bsalesforce\b/i,
      /\bhubspot\b/i,
      /\bthird[- ]party (?:business )?api\b/i,
      /\bexternal crm api\b/i,
    ],
  },
  {
    capability: 'sensitive_data',
    reason_code: 'GOAL_CAPABILITY_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [
      /\bssn\b/i,
      /\bsocial security numbers?\b/i,
      /\breal customer (?:pii|data)\b/i,
      /\bcredit card numbers?\b/i,
      /\bpassport numbers?\b/i,
      /\bmedical records?\b/i,
      /\bphi\b/i,
    ],
  },
  {
    capability: 'native_mobile',
    reason_code: 'GOAL_PLATFORM_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [
      /\bios app\b/i,
      /\bandroid app\b/i,
      /\breact native\b/i,
      /\bnative mobile\b/i,
      /\bswift(?:ui)? app\b/i,
    ],
  },
  {
    capability: 'native_desktop',
    reason_code: 'GOAL_PLATFORM_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [/\belectron\b/i, /\bnative desktop\b/i, /\bdesktop app\b/i],
  },
  {
    capability: 'browser_extension',
    reason_code: 'GOAL_PLATFORM_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [/\bbrowser extension\b/i, /\bchrome extension\b/i],
  },
  {
    capability: 'multi_user_collaboration',
    reason_code: 'GOAL_CAPABILITY_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [
      /\breal[- ]time collaboration\b/i,
      /\bmulti[- ]user editing\b/i,
      /\bconcurrent users collaborating\b/i,
    ],
  },
  {
    capability: 'multiple_primary_flows',
    reason_code: 'GOAL_TOO_MANY_FLOWS',
    rule: 'denied_capability',
    patterns: [
      /\b(?:two|2|three|3|multiple) (?:primary )?(?:user )?flows\b/i,
      /\bsecond (?:primary )?user flow\b/i,
    ],
  },
  {
    capability: 'multiple_concurrent_initiatives',
    reason_code: 'GOAL_CAPABILITY_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [/\btwo initiatives at once\b/i, /\bconcurrent initiatives\b/i],
  },
  {
    capability: 'custom_employees',
    reason_code: 'GOAL_CAPABILITY_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [
      /\bcustom employees?\b/i,
      /\bcustom agent role\b/i,
      /\bwrite a new employee definition\b/i,
    ],
  },
  {
    capability: 'arbitrary_shell',
    reason_code: 'GOAL_CAPABILITY_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [/\barbitrary shell\b/i, /\bunrestricted shell\b/i, /\brun bash\b/i],
  },
  {
    capability: 'unrestricted_network',
    reason_code: 'GOAL_CAPABILITY_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [/\bunrestricted network\b/i, /\bopen internet access from the sandbox\b/i],
  },
  {
    capability: 'external_business_action',
    reason_code: 'GOAL_CAPABILITY_UNSUPPORTED',
    rule: 'denied_capability',
    patterns: [
      /\bsend a wire\b/i,
      /\bcharge the customer in production\b/i,
      /\bmutate production systems\b/i,
    ],
  },
];

function requestedText(goal: QualificationGoalInput): string {
  return [
    goal.target_user,
    goal.problem,
    goal.desired_outcome,
    goal.primary_flow,
    goal.visual_direction,
    ...goal.must_haves.map((item) => item.text),
  ].join('\n');
}

function screenEstimateFromText(text: string): number {
  const matches = text.matchAll(
    /\b(?:(\d{1,2})|(six|seven|eight|nine|ten|eleven|twelve))[-\s]+(?:screen|route|page)s?\b/gi,
  );
  let highest = 0;
  for (const match of matches) {
    const numeric = match[1] ? Number.parseInt(match[1], 10) : WORD_NUMBER[match[2].toLowerCase()];
    if (Number.isFinite(numeric) && numeric > highest) {
      highest = numeric;
    }
  }
  return highest;
}

function personaCountFromText(text: string): number {
  if (
    /\b(?:two|2|three|3|multiple) (?:primary )?personas\b/i.test(text) ||
    /\band also (?:for )?(?:admins?|customers?|operators?) as (?:a )?primary\b/i.test(text) ||
    /\bfor both [^.\n]+ and [^.\n]+ as primary users\b/i.test(text)
  ) {
    return 2;
  }
  return 1;
}

function uniqueReasonCodes(findings: QualificationFinding[]): GoalReasonCode[] {
  const present = new Set(findings.map((finding) => finding.reason_code));
  return GOAL_REASON_CODE_ORDER.filter((code) => present.has(code));
}

function explanationFor(codes: GoalReasonCode[], result: QualificationResult): string {
  if (result === 'qualified') {
    return 'This goal fits the private-alpha prototype boundary: one primary persona, one primary flow, five screens or fewer, a client-only React prototype, and local mock data.';
  }
  const messages = codes.map((code) => GOAL_REASON_CODES[code].founder_message);
  if (result === 'out_of_scope') {
    return `${messages.join(' ')} The submitted goal was not changed.`;
  }
  return messages.join(' ');
}

function proposalFor(codes: GoalReasonCode[], findings: QualificationFinding[]): string | null {
  const actions = [...new Set(codes.map((code) => GOAL_REASON_CODES[code].next_action))];
  const capabilities = [
    ...new Set(
      findings
        .map((finding) => finding.capability)
        .filter((capability): capability is string => Boolean(capability)),
    ),
  ];
  const capabilityClause =
    capabilities.length > 0
      ? ` Remove ${capabilities.join(', ')} from the requested behavior.`
      : '';
  return `Keep one primary persona, one primary flow, and five screens or fewer using local mock data.${capabilityClause} ${actions.join(' ')}`;
}

export function evaluateGoalQualification(goal: QualificationGoalInput): GoalQualification {
  const text = requestedText(goal);
  const findings: QualificationFinding[] = [];
  const screenEstimate = Math.max(goal.constraints.max_screens, screenEstimateFromText(text));

  if (
    /\bgeneral[- ]purpose coding\b/i.test(text) ||
    /\bunrestricted agent\b/i.test(text) ||
    /\bcustom coding sandbox\b/i.test(text)
  ) {
    findings.push({
      reason_code: 'GOAL_CATEGORY_UNSUPPORTED',
      rule: 'allowed_categories',
      field: 'goal',
    });
  }
  if (personaCountFromText(text) > QUALIFICATION_POLICY.maxPersonas) {
    findings.push({
      reason_code: 'GOAL_TOO_MANY_PERSONAS',
      rule: 'one_primary_persona',
      field: 'goal.target_user',
    });
  }
  if (goal.constraints.primary_flows !== QUALIFICATION_POLICY.maxFlows) {
    findings.push({
      reason_code: 'GOAL_TOO_MANY_FLOWS',
      rule: 'one_primary_flow',
      field: 'goal.constraints.primary_flows',
    });
  }
  if (goal.constraints.max_screens > QUALIFICATION_POLICY.maxScreens) {
    findings.push({
      reason_code: 'GOAL_TOO_MANY_SCREENS',
      rule: 'max_five_screens',
      field: 'goal.constraints.max_screens',
    });
  } else if (screenEstimateFromText(text) > QUALIFICATION_POLICY.maxScreens) {
    findings.push({
      reason_code: 'GOAL_TOO_MANY_SCREENS',
      rule: 'max_five_screens',
      field: 'goal.primary_flow',
    });
  }
  if (!goal.constraints.client_only) {
    findings.push({
      reason_code: 'GOAL_REQUIRES_BACKEND',
      rule: 'client_only',
      field: 'goal.constraints.client_only',
    });
  }
  if (goal.constraints.data_mode !== QUALIFICATION_POLICY.dataMode) {
    findings.push({
      reason_code: 'GOAL_REQUIRES_REAL_DATA',
      rule: 'mock_or_local_data',
      field: 'goal.constraints.data_mode',
    });
  }
  if (/\b(?:rails|django|laravel|flutter|swiftui)\b/i.test(text) && !/\breact\b/i.test(text)) {
    findings.push({
      reason_code: 'GOAL_TEMPLATE_UNAVAILABLE',
      rule: 'fixed_react_template',
      field: 'goal',
    });
  }

  for (const entry of DENIED_CAPABILITY_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(text))) {
      findings.push({
        reason_code: entry.reason_code,
        rule: entry.rule,
        capability: entry.capability,
      });
    }
  }

  const outOfScopeCodes = uniqueReasonCodes(findings);
  if (outOfScopeCodes.length > 0) {
    return {
      result: 'out_of_scope',
      reason_codes: outOfScopeCodes,
      explanation: explanationFor(outOfScopeCodes, 'out_of_scope'),
      proposal: proposalFor(outOfScopeCodes, findings),
      clarification_questions: [],
      screen_estimate: screenEstimate,
      policy_version: QUALIFICATION_POLICY_VERSION,
      findings,
    };
  }

  const questions: ClarificationQuestion[] = [];
  if (MISSING_TARGET_USER.test(goal.target_user.trim())) {
    questions.push({
      id: 'Q1',
      code: 'missing_target_user',
      prompt: 'Who is the single primary user of this prototype?',
    });
  }
  if (goal.problem.trim().length < 20 || VAGUE_TEXT.test(goal.problem.trim())) {
    questions.push({
      id: `Q${questions.length + 1}`,
      code: 'vague_problem',
      prompt: 'What specific problem should this five-screen prototype solve for that user?',
    });
  }
  if (goal.desired_outcome.trim().length < 20 || VAGUE_TEXT.test(goal.desired_outcome.trim())) {
    questions.push({
      id: `Q${questions.length + 1}`,
      code: 'vague_outcome',
      prompt: 'What should that user have accomplished at the end of the primary flow?',
    });
  }
  if (goal.primary_flow.trim().length < 12 || VAGUE_TEXT.test(goal.primary_flow.trim())) {
    questions.push({
      id: `Q${questions.length + 1}`,
      code: 'vague_flow',
      prompt: 'What is the single primary flow, from first action to done?',
    });
  }
  if (goal.must_haves.length === 0) {
    questions.push({
      id: `Q${questions.length + 1}`,
      code: 'missing_must_have',
      prompt: 'Which must-have belongs in this prototype versus a later version?',
    });
  }

  const boundedQuestions = questions.slice(0, QUALIFICATION_POLICY.maxClarificationQuestions);
  if (boundedQuestions.length > 0) {
    return {
      result: 'needs_clarification',
      reason_codes: ['GOAL_NEEDS_CLARIFICATION'],
      explanation: explanationFor(['GOAL_NEEDS_CLARIFICATION'], 'needs_clarification'),
      proposal: null,
      clarification_questions: boundedQuestions,
      screen_estimate: screenEstimate,
      policy_version: QUALIFICATION_POLICY_VERSION,
      findings: [
        {
          reason_code: 'GOAL_NEEDS_CLARIFICATION',
          rule: 'clarification_required',
          field: boundedQuestions[0].code === 'missing_target_user' ? 'goal.target_user' : 'goal',
        },
      ],
    };
  }

  return {
    result: 'qualified',
    reason_codes: [],
    explanation: explanationFor([], 'qualified'),
    proposal: null,
    clarification_questions: [],
    screen_estimate: screenEstimate,
    policy_version: QUALIFICATION_POLICY_VERSION,
    findings: [],
  };
}
