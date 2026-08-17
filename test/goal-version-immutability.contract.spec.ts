import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      return walk(path);
    }
    return path.endsWith('.ts') ? [path] : [];
  });
}

describe('AICO-016 goal version immutability contract', () => {
  const sources = walk(join(__dirname, '../src')).filter(
    (path) => !path.includes(`${join('infrastructure', 'database', 'migrations')}`),
  );

  it('does not update or delete goal_versions in application code', () => {
    const violations: string[] = [];
    for (const path of sources) {
      const source = readFileSync(path, 'utf8');
      if (/\bUPDATE\s+goal_versions\b/i.test(source)) {
        violations.push(`${path}: UPDATE goal_versions`);
      }
      if (/\bDELETE\s+FROM\s+goal_versions\b/i.test(source)) {
        violations.push(`${path}: DELETE FROM goal_versions`);
      }
    }
    expect(violations).toEqual([]);
  });
});
