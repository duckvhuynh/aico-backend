export const QUALIFICATION_POLICY_VERSION = '1.0.0';

export const QUALIFICATION_POLICY = {
  policyVersion: QUALIFICATION_POLICY_VERSION,
  allowedCategories: [
    'crud_workspace',
    'dashboard_reporting',
    'intake_onboarding',
    'catalog_directory',
    'planning_scheduling',
    'content_library',
  ],
  maxPersonas: 1,
  maxFlows: 1,
  maxScreens: 5,
  platform: 'responsive_browser',
  template: 'react_typescript_template_v1',
  clientOnly: true,
  dataMode: 'mock_or_local',
  deniedCapabilities: [
    'production_deployment',
    'generated_backend',
    'production_database',
    'real_authentication',
    'real_payment',
    'email_delivery',
    'third_party_business_api',
    'sensitive_data',
    'native_mobile',
    'native_desktop',
    'browser_extension',
    'multi_user_collaboration',
    'multiple_primary_flows',
    'multiple_concurrent_initiatives',
    'custom_employees',
    'arbitrary_shell',
    'unrestricted_network',
    'external_business_action',
  ],
  maxClarificationQuestions: 5,
} as const;

export const GOAL_REASON_CODE_ORDER = [
  'GOAL_CATEGORY_UNSUPPORTED',
  'GOAL_TOO_MANY_PERSONAS',
  'GOAL_TOO_MANY_FLOWS',
  'GOAL_TOO_MANY_SCREENS',
  'GOAL_PLATFORM_UNSUPPORTED',
  'GOAL_TEMPLATE_UNAVAILABLE',
  'GOAL_REQUIRES_BACKEND',
  'GOAL_REQUIRES_REAL_DATA',
  'GOAL_CAPABILITY_UNSUPPORTED',
  'GOAL_NEEDS_CLARIFICATION',
] as const;

export type GoalReasonCode = (typeof GOAL_REASON_CODE_ORDER)[number];

export const GOAL_REASON_CODES: Record<
  GoalReasonCode,
  { founder_message: string; next_action: string }
> = {
  GOAL_CATEGORY_UNSUPPORTED: {
    founder_message: 'This prototype category is not enabled for the private alpha.',
    next_action: 'Choose an eligible category or submit a new, narrower goal version.',
  },
  GOAL_TOO_MANY_PERSONAS: {
    founder_message: 'The goal contains more than one primary persona.',
    next_action: 'Choose one primary persona and submit a new goal version.',
  },
  GOAL_TOO_MANY_FLOWS: {
    founder_message: 'The goal contains more than one primary user flow.',
    next_action: 'Choose one flow to prototype and submit a new goal version.',
  },
  GOAL_TOO_MANY_SCREENS: {
    founder_message: 'The proposed flow needs more than five screens or routes.',
    next_action: 'Narrow the flow to five screens or fewer and submit a new goal version.',
  },
  GOAL_PLATFORM_UNSUPPORTED: {
    founder_message: 'The requested output is not a responsive browser prototype.',
    next_action: 'Reframe the goal as a responsive web flow or cancel this initiative.',
  },
  GOAL_TEMPLATE_UNAVAILABLE: {
    founder_message: 'The requested stack does not fit the fixed private-alpha template.',
    next_action: 'Accept the fixed React and TypeScript template or narrow the goal.',
  },
  GOAL_REQUIRES_BACKEND: {
    founder_message: 'The requested behavior requires a generated backend or production service.',
    next_action: 'Replace it with a client-side mock interaction and submit a new goal version.',
  },
  GOAL_REQUIRES_REAL_DATA: {
    founder_message: 'The requested behavior requires real, sensitive, or external data.',
    next_action: 'Use safe local mock data and submit a new goal version.',
  },
  GOAL_CAPABILITY_UNSUPPORTED: {
    founder_message: 'The goal requests a capability outside the private-alpha boundary.',
    next_action:
      'Review the cited limitation, remove that capability, and submit a new goal version.',
  },
  GOAL_NEEDS_CLARIFICATION: {
    founder_message: 'The goal is missing information required to qualify the primary flow.',
    next_action: 'Answer the bounded clarification questions or cancel the initiative.',
  },
};
