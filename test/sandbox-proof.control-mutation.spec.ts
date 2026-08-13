import { A4_THREAT_CASES } from './aico-004-spike/contracts';
import { A4_SOURCE_CONTROL_MUTATIONS } from './aico-004-spike/fail-closed-control-mutations';

describe('AICO-004 source control mutation registry', () => {
  it('binds exactly 12 unique non-exception mutations to accepted threat cases', () => {
    expect(A4_SOURCE_CONTROL_MUTATIONS).toHaveLength(12);
    expect(new Set(A4_SOURCE_CONTROL_MUTATIONS.map((mutation) => mutation.id)).size).toBe(12);
    expect(A4_SOURCE_CONTROL_MUTATIONS.map((mutation) => mutation.id)).toEqual(
      Array.from({ length: 12 }, (_, index) => `A4-M-${String(index + 1).padStart(2, '0')}`),
    );
    for (const mutation of A4_SOURCE_CONTROL_MUTATIONS) {
      expect(A4_THREAT_CASES).toContain(mutation.intendedCase);
      expect(mutation.target).toMatch(/^test\/aico-004-spike\/.+\.ts$/);
      expect(mutation.search).not.toEqual(mutation.replacement);
      expect(`${mutation.search}\n${mutation.replacement}`).not.toMatch(
        /throw|failpoint|injected exception/i,
      );
    }
  });
});
