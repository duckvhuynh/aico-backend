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

describe('AICO-017 attachment access contract', () => {
  const sources = walk(join(__dirname, '../src'));

  it('does not expose signed URLs or filename-derived object keys', () => {
    for (const path of sources) {
      const source = readFileSync(path, 'utf8');
      expect(source).not.toMatch(/getSignedUrl|presign|public-read/i);
      expect(source).not.toMatch(/buildObjectKey\([^)]*filename/i);
    }
  });
});
