import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TENANT_TABLES = [
  'runs',
  'tasks',
  'events',
  'initiatives',
  'goal_versions',
  'goal_version_attachments',
  'attachment_retrieval_grants',
  'object_records',
  'artifacts',
  'artifact_versions',
  'task_attempts',
  'model_invocation_effects',
  'context_snapshots',
  'company_profile_versions',
  'companies',
  'human_waits',
  'budget_ledgers',
];

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

describe('AICO-015 unscoped helper contract', () => {
  const sources = walk(join(__dirname, '../src'));

  it('does not expose ordinary unscoped data helpers', () => {
    for (const path of sources) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/\bbypassTenant\b/);
      expect(source).not.toMatch(/\bfindById\s*\(/);
    }
  });

  it('binds company_id or founder_id on ordinary tenant SQL', () => {
    const violations: string[] = [];
    for (const path of sources) {
      const source = readFileSync(path, 'utf8');
      const blocks = source.match(/`[\s\S]*?`/g) ?? [];
      for (const block of blocks) {
        if (block.includes('SKIP LOCKED')) {
          continue;
        }
        const normalized = block.replace(/\s+/g, ' ');
        for (const table of TENANT_TABLES) {
          if (!new RegExp(`\\b${table}\\b`, 'i').test(normalized)) {
            continue;
          }
          if (!/\bWHERE\b/i.test(normalized) && !/\bSET\b/i.test(normalized)) {
            continue;
          }
          if (!/\bcompany_id\b/i.test(normalized) && !/\bfounder_id\b/i.test(normalized)) {
            violations.push(`${path}: ${table} query missing tenant predicate`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
