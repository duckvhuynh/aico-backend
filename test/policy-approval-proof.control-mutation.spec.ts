import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SOURCE_CONTROL_MUTATIONS } from './aico-006-spike/fail-closed-control-mutations';

function occurrences(source: string, search: string): number {
  return source.split(search).length - 1;
}

describe('AICO-006 source-level control mutation manifest', () => {
  test('maps the exact fourteen accepted controls to real proof source', () => {
    expect(SOURCE_CONTROL_MUTATIONS).toHaveLength(14);
    expect(new Set(SOURCE_CONTROL_MUTATIONS.map(({ id }) => id)).size).toBe(14);
    expect(SOURCE_CONTROL_MUTATIONS.map(({ control }) => control)).toEqual([
      'founder/company ownership check',
      'exact Artifact Version/current-pointer check',
      'expected run state/row-version lock',
      'policy/workflow/employee version binding',
      'parameter, budget, environment, and expiry binding',
      'idempotency request-digest comparison',
      'decision plus canonical policy.decided/approval.decided event/outbox atomicity',
      'continuation uniqueness and source-decision validation',
      'terminal/canceled-state revalidation',
      'current authentication/Founder/Company authority before receipt replay',
      'tagged redacted DENY with no victim identifiers and maximum_uses=0',
      'SRS-FR-087 denial decision/policy.decided preservation',
      'adapter-call zero-effect assertion',
      'evidence redaction/canary scan',
    ]);
  });

  test.each(SOURCE_CONTROL_MUTATIONS)(
    '$id transform matches exactly once and names a real A6 case',
    (mutation) => {
      const source = readFileSync(resolve(mutation.target), 'utf8').replaceAll('\r\n', '\n');
      expect(occurrences(source, mutation.search)).toBe(1);
      expect(mutation.replacement).not.toBe(mutation.search);
      expect(mutation.intendedCase).toMatch(/^A6-T-[A-Z0-9-]+$/);
      expect(`${mutation.id}:${mutation.control}`).not.toMatch(
        /FAILPOINT|EXCEPTION|THROW|ROLLBACK/i,
      );
    },
  );
});
