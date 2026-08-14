import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { A7_CONTROL_MUTATIONS, A7_THREAT_CASES } from './aico-007-spike/contracts';
import { A7_SOURCE_CONTROL_MUTATIONS } from './aico-007-spike/fail-closed-control-mutations';

const occurrences = (source: string, search: string): number => source.split(search).length - 1;

describe('AICO-007 source-level control mutation registry', () => {
  test('maps exactly twelve accepted mutations to actual proof controls', () => {
    expect(A7_SOURCE_CONTROL_MUTATIONS.map(({ id }) => id)).toEqual(A7_CONTROL_MUTATIONS);
    expect(new Set(A7_SOURCE_CONTROL_MUTATIONS.map(({ control }) => control)).size).toBe(12);
  });

  test.each(A7_SOURCE_CONTROL_MUTATIONS)(
    '$id applies exactly once and names only closed threat cases',
    (mutation) => {
      const source = readFileSync(resolve(mutation.target), 'utf8').replaceAll('\r\n', '\n');
      expect(occurrences(source, mutation.search)).toBe(1);
      expect(mutation.replacement).not.toBe(mutation.search);
      expect(mutation.intendedCases.length).toBeGreaterThan(0);
      expect(mutation.intendedCases.every((id) => A7_THREAT_CASES.includes(id))).toBe(true);
      expect(`${mutation.id}:${mutation.control}`).not.toMatch(/FAILPOINT|EXCEPTION|THROW/i);
    },
  );
});
