import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { StructuredGoalDto } from '../../src/modules/initiatives/dto/create-goal.dto';
import {
  assertNoSensitiveFixtureData,
  createTwoIsolatedCompanyFixtures,
  listAico011FixtureIds,
} from './company-goal.factory';

const domainFixtureScript = readFileSync(
  join(__dirname, '..', '..', 'scripts', 'aico-011-domain-fixture.mjs'),
  'utf8',
);

describe('AICO-011 company/goal factory', () => {
  const fixtures = createTwoIsolatedCompanyFixtures();

  it('creates two isolated companies with current and prior profile and goal versions', () => {
    expect(fixtures).toHaveLength(2);
    expect(new Set(fixtures.map((fixture) => fixture.company.id)).size).toBe(2);
    expect(new Set(fixtures.map((fixture) => fixture.founder.id)).size).toBe(2);
    expect(new Set(fixtures.map((fixture) => fixture.founder.authSubject)).size).toBe(2);

    for (const fixture of fixtures) {
      expect(fixture.profileVersions.map((profile) => profile.version)).toEqual([1, 2]);
      expect(fixture.goalVersions.map((goal) => goal.version)).toEqual([1, 2]);
      expect(fixture.company.currentProfileVersionId).toBe(fixture.profileVersions[1].id);
      expect(fixture.initiative.currentGoalVersionId).toBe(fixture.goalVersions[1].id);
      expect(fixture.initiative.type).toBe('PROTOTYPE');
      expect(fixture.initiative.status).toBe('ACTIVE');
      expect(fixture.contextSnapshot.companyProfileVersionId).toBe(fixture.profileVersions[1].id);
      expect(fixture.contextSnapshot.goalVersionId).toBe(fixture.goalVersions[1].id);
      expect(fixture.goalVersions[1].structuredGoal.reference_ids).toEqual([]);
      expect(fixture.founder.authSubject).toBe(`fixture:aico-011:${fixture.label}:founder`);
    }
  });

  it('omits sensitive fixture data', () => {
    expect(() => assertNoSensitiveFixtureData(fixtures)).not.toThrow();
  });

  it('keeps structured goals inside the versioned intake envelope', async () => {
    for (const fixture of fixtures) {
      for (const goal of fixture.goalVersions) {
        const errors = await validate(plainToInstance(StructuredGoalDto, goal.structuredGoal));
        expect(errors).toHaveLength(0);
      }
    }
  });

  it('keeps SQL proof IDs aligned with the TypeScript factory', () => {
    for (const id of listAico011FixtureIds()) {
      expect(domainFixtureScript).toContain(id);
    }
  });
});
