import type { StructuredGoalDto } from '../../src/modules/initiatives/dto/create-goal.dto';

const ID_PREFIX = '019c1100-0000-7000-8000-';
const SENSITIVE_FIXTURE =
  /password|secret|api[_-]?key|bearer\s+[a-z0-9._-]+|authorization:|ssn|@gmail\.|sk-|AKIA/iu;

export const AICO011_COMPANY_LABELS = ['north', 'south'] as const;

export type Aico011CompanyLabel = (typeof AICO011_COMPANY_LABELS)[number];

export interface Aico011FounderFixture {
  id: string;
  authSubject: string;
  displayName: string;
  status: 'ACTIVE';
}

export interface Aico011ProfileVersionFixture {
  id: string;
  version: 1 | 2;
  purpose: string;
  targetCustomer: string;
  constraints: string[];
  normalizedLimits: {
    max_screens: number;
    primary_flows: number;
    data_mode: 'mock_or_local';
  };
  sensitiveDataWarningAcknowledged: true;
}

export interface Aico011GoalVersionFixture {
  id: string;
  version: 1 | 2;
  schemaVersion: 1;
  structuredGoal: StructuredGoalDto;
  attachmentIds: [];
}

export interface Aico011CompanyFixture {
  label: Aico011CompanyLabel;
  founder: Aico011FounderFixture;
  company: {
    id: string;
    name: string;
    status: 'ACTIVE';
    currentProfileVersionId: string;
  };
  profileVersions: [Aico011ProfileVersionFixture, Aico011ProfileVersionFixture];
  initiative: {
    id: string;
    type: 'PROTOTYPE';
    title: string;
    status: 'ACTIVE';
    currentGoalVersionId: string;
  };
  goalVersions: [Aico011GoalVersionFixture, Aico011GoalVersionFixture];
  contextSnapshot: {
    id: string;
    companyProfileVersionId: string;
    goalVersionId: string;
    answerVersionIds: [];
  };
}

const SUFFIXES: Record<
  Aico011CompanyLabel,
  {
    founder: string;
    company: string;
    profileV1: string;
    profileV2: string;
    initiative: string;
    goalV1: string;
    goalV2: string;
    snapshot: string;
  }
> = {
  north: {
    founder: '000000000101',
    company: '000000000102',
    profileV1: '000000000103',
    profileV2: '000000000104',
    initiative: '000000000105',
    goalV1: '000000000106',
    goalV2: '000000000107',
    snapshot: '000000000108',
  },
  south: {
    founder: '000000000201',
    company: '000000000202',
    profileV1: '000000000203',
    profileV2: '000000000204',
    initiative: '000000000205',
    goalV1: '000000000206',
    goalV2: '000000000207',
    snapshot: '000000000208',
  },
};

function fixtureId(suffix: string): string {
  return `${ID_PREFIX}${suffix}`;
}

function structuredGoal(label: Aico011CompanyLabel, version: 1 | 2): StructuredGoalDto {
  const generation = version === 1 ? 'prior' : 'current';
  return {
    target_user: `${label} fixture operators`,
    problem: `The ${label} fixture ${generation} goal needs a bounded review workspace.`,
    desired_outcome: `Review one ${label} ${generation} proposal draft from mock data.`,
    primary_flow: `Create, review, and mark the ${label} ${generation} draft ready`,
    must_haves: [
      {
        id: 'MH-001',
        text: `Create a ${label} ${generation} proposal from structured mock data`,
      },
    ],
    non_goals: ['Payments', 'Production deployment', 'Customer identity'],
    visual_direction: 'Calm editorial workspace with mock records only',
    constraints: {
      max_screens: 5,
      primary_flows: 1,
      client_only: true,
      data_mode: 'mock_or_local',
    },
    reference_ids: [],
  };
}

function profileVersion(
  id: string,
  label: Aico011CompanyLabel,
  version: 1 | 2,
): Aico011ProfileVersionFixture {
  const generation = version === 1 ? 'prior' : 'current';
  return {
    id,
    version,
    purpose: `Help the ${label} fixture company prepare ${generation} client proposals.`,
    targetCustomer: `${label} fixture operators serving mock accounts`,
    constraints: ['No customer PII', 'Mock or local data only'],
    normalizedLimits: {
      max_screens: 5,
      primary_flows: 1,
      data_mode: 'mock_or_local',
    },
    sensitiveDataWarningAcknowledged: true,
  };
}

export function createIsolatedCompanyFixture(label: Aico011CompanyLabel): Aico011CompanyFixture {
  const suffix = SUFFIXES[label];
  const profileV1 = profileVersion(fixtureId(suffix.profileV1), label, 1);
  const profileV2 = profileVersion(fixtureId(suffix.profileV2), label, 2);
  const goalV1: Aico011GoalVersionFixture = {
    id: fixtureId(suffix.goalV1),
    version: 1,
    schemaVersion: 1,
    structuredGoal: structuredGoal(label, 1),
    attachmentIds: [],
  };
  const goalV2: Aico011GoalVersionFixture = {
    id: fixtureId(suffix.goalV2),
    version: 2,
    schemaVersion: 1,
    structuredGoal: structuredGoal(label, 2),
    attachmentIds: [],
  };
  return {
    label,
    founder: {
      id: fixtureId(suffix.founder),
      authSubject: `fixture:aico-011:${label}:founder`,
      displayName: `${label} fixture founder`,
      status: 'ACTIVE',
    },
    company: {
      id: fixtureId(suffix.company),
      name: `${label} fixture company`,
      status: 'ACTIVE',
      currentProfileVersionId: profileV2.id,
    },
    profileVersions: [profileV1, profileV2],
    initiative: {
      id: fixtureId(suffix.initiative),
      type: 'PROTOTYPE',
      title: `${label} fixture prototype`,
      status: 'ACTIVE',
      currentGoalVersionId: goalV2.id,
    },
    goalVersions: [goalV1, goalV2],
    contextSnapshot: {
      id: fixtureId(suffix.snapshot),
      companyProfileVersionId: profileV2.id,
      goalVersionId: goalV2.id,
      answerVersionIds: [],
    },
  };
}

export function createTwoIsolatedCompanyFixtures(): [Aico011CompanyFixture, Aico011CompanyFixture] {
  return [createIsolatedCompanyFixture('north'), createIsolatedCompanyFixture('south')];
}

export function listAico011FixtureIds(): string[] {
  return createTwoIsolatedCompanyFixtures().flatMap((fixture) => [
    fixture.founder.id,
    fixture.company.id,
    ...fixture.profileVersions.map((profile) => profile.id),
    fixture.initiative.id,
    ...fixture.goalVersions.map((goal) => goal.id),
    fixture.contextSnapshot.id,
  ]);
}

export function assertNoSensitiveFixtureData(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (SENSITIVE_FIXTURE.test(serialized)) {
    throw new Error('AICO-011 factory payload contains sensitive or production-like data.');
  }
}
