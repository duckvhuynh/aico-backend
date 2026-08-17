import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ATTACHMENT_ALLOWED_MEDIA_TYPES,
  ATTACHMENT_PER_FILE_MAX_BYTES,
  ATTACHMENT_POLICY,
} from '../src/modules/attachments/attachment-policy';

interface PolicyEntry {
  id: string;
  value: unknown;
}

describe('AICO-017 attachment policy contract', () => {
  const policy = JSON.parse(
    readFileSync(join(__dirname, '../docs/policies/alpha-operating-policy-v1.json'), 'utf8'),
  ) as { attachments: { entries: PolicyEntry[] } };

  function entry(id: string): PolicyEntry {
    const found = policy.attachments.entries.find((item) => item.id === id);
    if (!found) {
      throw new Error(`missing policy entry ${id}`);
    }
    return found;
  }

  it('freezes allowlist, counts, and byte ceilings from AICO-008', () => {
    expect(entry('A8V-ATTACH-TYPES').value).toEqual([...ATTACHMENT_ALLOWED_MEDIA_TYPES]);
    expect(entry('A8V-ATTACH-COUNT').value).toBe(ATTACHMENT_POLICY.maxCount);
    expect(entry('A8V-ATTACH-PER-FILE').value).toEqual(ATTACHMENT_PER_FILE_MAX_BYTES);
    expect(entry('A8V-ATTACH-AGGREGATE').value).toBe(ATTACHMENT_POLICY.aggregateMaxBytes);
    expect(entry('A8V-ATTACH-PDF-PAGES').value).toBe(ATTACHMENT_POLICY.pdfPagesMax);
    expect(entry('A8V-ATTACH-IMAGE-PIXELS').value).toBe(ATTACHMENT_POLICY.imagePixelsMax);
  });
});
