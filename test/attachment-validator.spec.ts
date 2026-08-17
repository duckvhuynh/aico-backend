import { createHash } from 'node:crypto';
import { DomainError } from '../src/common/domain/domain-error';
import { ATTACHMENT_POLICY } from '../src/modules/attachments/attachment-policy';
import {
  validateAttachmentIngest,
  type AttachmentValidationSuccess,
} from '../src/modules/attachments/attachment-validator';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function sha(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

function ingest(
  body: Buffer,
  declared: string,
  filename = 'notes.txt',
): AttachmentValidationSuccess {
  return validateAttachmentIngest({
    declaredMediaType: declared,
    filename,
    contentSha256: sha(body),
    body,
  });
}

describe('attachment ingest validator', () => {
  it('accepts allowlisted plain text', () => {
    const body = Buffer.from('reference notes for the prototype');
    expect(ingest(body, 'text/plain', 'notes.txt')).toMatchObject({
      mediaType: 'text/plain',
      sizeBytes: body.length,
      safeFilename: 'notes.txt',
    });
  });

  it('accepts a one-pixel PNG', () => {
    expect(ingest(PNG_1X1, 'image/png', 'mark.png').mediaType).toBe('image/png');
  });

  it('rejects unsupported declared types', () => {
    try {
      ingest(Buffer.from('nope'), 'application/zip', 'archive.zip');
      throw new Error('expected unsupported type');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('attachment_type_unsupported');
    }
  });

  it('rejects oversized text without storing a reason body', () => {
    const body = Buffer.alloc(ATTACHMENT_POLICY.perFileMaxBytes['text/plain'] + 1, 0x61);
    try {
      ingest(body, 'text/plain');
      throw new Error('expected oversized rejection');
    } catch (error: unknown) {
      expect((error as DomainError).code).toBe('attachment_too_large');
      expect(JSON.stringify(error)).not.toContain(body.toString('utf8').slice(0, 32));
    }
  });

  it('rejects a spoofed PNG declared as text', () => {
    expect(() => ingest(PNG_1X1, 'text/plain', 'notes.txt')).toThrow(DomainError);
  });

  it('rejects EICAR, executables, HTML, archives, and traversal names', () => {
    const cases: Array<[Buffer, string, string, string]> = [
      [
        Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'),
        'text/plain',
        'notes.txt',
        'attachment_unsafe',
      ],
      [Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]), 'text/plain', 'notes.txt', 'attachment_unsafe'],
      [
        Buffer.from('<!DOCTYPE html><html><script></script></html>'),
        'text/plain',
        'notes.txt',
        'attachment_unsafe',
      ],
      [
        Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
        'text/plain',
        'notes.txt',
        'attachment_unsafe',
      ],
      [
        Buffer.from('%PDF-1.4\n/Encrypt 1 0 R\n'),
        'application/pdf',
        'brief.pdf',
        'attachment_unsafe',
      ],
      [Buffer.from('safe notes'), 'text/plain', '../evil.exe', 'attachment_validation_failed'],
    ];
    for (const [body, declared, filename, code] of cases) {
      try {
        ingest(body, declared, filename);
        throw new Error(`expected ${filename} to fail`);
      } catch (error: unknown) {
        expect((error as DomainError).code).toBe(code);
        expect(JSON.stringify(error)).not.toContain(body.toString('latin1').slice(0, 12));
      }
    }
  });

  it('rejects a checksum mismatch', () => {
    expect(() =>
      validateAttachmentIngest({
        declaredMediaType: 'text/plain',
        filename: 'notes.txt',
        contentSha256: 'a'.repeat(64),
        body: Buffer.from('notes'),
      }),
    ).toThrow(DomainError);
  });
});
