import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { A5_SCENARIO_IDS, DEFAULT_A5_PROOF_CONTROLS } from './aico-005-spike/contracts';
import { A5_SOURCE_CONTROL_MUTATIONS } from './aico-005-spike/fail-closed-control-mutations';

const occurrences = (source: string, search: string): number => source.split(search).length - 1;

describe('AICO-005 provider-runtime source-control mutation registry', () => {
  test('maps exactly thirty accepted mutations to thirty executable proof controls', () => {
    const expectedIds = Array.from(
      { length: 30 },
      (_, index) => `A5-M-${String(index + 1).padStart(2, '0')}`,
    );
    expect(A5_SOURCE_CONTROL_MUTATIONS.map(({ id }) => id)).toEqual(expectedIds);
    expect(A5_SOURCE_CONTROL_MUTATIONS.map(({ control }) => control)).toEqual(
      Object.keys(DEFAULT_A5_PROOF_CONTROLS),
    );
    expect(new Set(A5_SOURCE_CONTROL_MUTATIONS.map(({ control }) => control)).size).toBe(30);
  });

  test.each(A5_SOURCE_CONTROL_MUTATIONS)(
    '$id applies exactly once and names only closed scenarios',
    (mutation) => {
      const source = readFileSync(resolve(mutation.target), 'utf8').replaceAll('\r\n', '\n');
      expect(occurrences(source, mutation.search)).toBe(1);
      expect(mutation.target).toBe('test/aico-005-spike/contracts.ts');
      expect(mutation.search).toBe(`  ${String(mutation.control)}: true,`);
      expect(mutation.replacement).not.toBe(mutation.search);
      expect(mutation.replacement).toBe(
        `  ${String(mutation.control)}: false, // MUTANT ${mutation.id}: accepted control removed.`,
      );
      expect(mutation.intendedScenarios.length).toBeGreaterThan(0);
      expect(
        mutation.intendedScenarios.every((id) =>
          A5_SCENARIO_IDS.some((candidate) => candidate === id),
        ),
      ).toBe(true);
      expect(`${mutation.search}\n${mutation.replacement}`).not.toMatch(
        /FAILPOINT|EXCEPTION|THROW|COMPILE/i,
      );
    },
  );
});
