import { createHash } from 'node:crypto';
import { DomainError } from '../../common/domain/domain-error';
import {
  ATTACHMENT_ALLOWED_MEDIA_TYPES,
  ATTACHMENT_PER_FILE_MAX_BYTES,
  ATTACHMENT_POLICY,
  DENIED_FILENAME_EXTENSIONS,
  type AttachmentMediaType,
} from './attachment-policy';

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface AttachmentIngestInput {
  declaredMediaType: string;
  filename: string;
  contentSha256: string;
  body: Buffer;
}

export interface AttachmentValidationSuccess {
  mediaType: AttachmentMediaType;
  checksumSha256: string;
  safeFilename: string;
  sizeBytes: number;
}

function fail(code: string, rule: string, field = 'file'): never {
  throw new DomainError({
    status: 422,
    code,
    title: 'The attachment could not be accepted',
    detail: 'The file failed a required safety or type check and was not stored.',
    errors: [{ field, rule }],
    remediation: ['replace_attachment'],
  });
}

export function sanitizeAttachmentFilename(filename: string): string {
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    fail('attachment_validation_failed', 'safe_filename', 'filename');
  }
  const trimmed = filename.trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    fail('attachment_validation_failed', 'safe_filename', 'filename');
  }
  if (
    trimmed.length > 200 ||
    [...trimmed].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    fail('attachment_validation_failed', 'safe_filename', 'filename');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(trimmed)) {
    fail('attachment_validation_failed', 'safe_filename', 'filename');
  }
  const extension = trimmed.includes('.') ? trimmed.split('.').pop()!.toLowerCase() : '';
  if ((DENIED_FILENAME_EXTENSIONS as readonly string[]).includes(extension)) {
    fail('attachment_unsafe', 'executable_filename', 'filename');
  }
  return trimmed;
}

export function detectMediaType(body: Buffer): AttachmentMediaType | 'unknown' {
  if (body.length >= 8 && body.subarray(0, 8).equals(PNG_SIG)) {
    return 'image/png';
  }
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    body.length >= 12 &&
    body.subarray(0, 4).toString('ascii') === 'RIFF' &&
    body.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (body.length >= 5 && body.subarray(0, 5).toString('ascii') === '%PDF-') {
    return 'application/pdf';
  }
  if (body.includes(0) || !isMostlyText(body)) {
    return 'unknown';
  }
  return 'text/plain';
}

function isMostlyText(body: Buffer): boolean {
  try {
    const text = body.toString('utf8');
    return Buffer.from(text, 'utf8').equals(body);
  } catch {
    return false;
  }
}

function deniedClass(body: Buffer, detected: string): string | null {
  const ascii = body.subarray(0, Math.min(body.length, 4096)).toString('latin1');
  if (body.length >= 2 && body[0] === 0x4d && body[1] === 0x5a) {
    return 'executable';
  }
  if (body.length >= 4 && body.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    return 'executable';
  }
  if (body.length >= 4 && ascii.startsWith('PK\u0003\u0004')) {
    return 'archive';
  }
  if (ascii.startsWith('#!')) {
    return 'script';
  }
  if (/<!DOCTYPE html|<html[\s>]|<script[\s>]/i.test(ascii)) {
    return 'html';
  }
  if (/<svg[\s>]/i.test(ascii)) {
    return 'svg';
  }
  if (detected === 'application/pdf' && /\/Encrypt(?:\s|\/|>>)/.test(ascii)) {
    return 'encrypted_pdf';
  }
  if (detected === 'application/pdf' && /\/EmbeddedFile(?:\s|\/|>>)/.test(ascii)) {
    return 'embedded_file';
  }
  if (
    detected === 'application/pdf' &&
    /\/(?:JavaScript|JS|RichMedia|Launch)(?:\s|\/|>>)/.test(ascii)
  ) {
    return 'active_content';
  }
  if (detected === 'application/pdf' && ascii.includes('<html')) {
    return 'polyglot';
  }
  if (body.includes(Buffer.from(EICAR))) {
    return 'malware';
  }
  return null;
}

function pngPixels(body: Buffer): number {
  if (body.length < 24) {
    return Number.POSITIVE_INFINITY;
  }
  return body.readUInt32BE(16) * body.readUInt32BE(20);
}

function jpegPixels(body: Buffer): number {
  let offset = 2;
  while (offset + 9 < body.length) {
    if (body[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = body[offset + 1];
    const size = body.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return body.readUInt16BE(offset + 5) * body.readUInt16BE(offset + 7);
    }
    offset += 2 + size;
  }
  return Number.POSITIVE_INFINITY;
}

function webpPixels(body: Buffer): number {
  if (body.length < 30) {
    return Number.POSITIVE_INFINITY;
  }
  const chunk = body.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X') {
    const width = 1 + body[24] + (body[25] << 8) + (body[26] << 16);
    const height = 1 + body[27] + (body[28] << 8) + (body[29] << 16);
    return width * height;
  }
  return 1;
}

function pdfPageCount(body: Buffer): number {
  const text = body.toString('latin1');
  const pages = text.match(/\/Type\s*\/Page(?!s)/g);
  return pages?.length ?? 1;
}

export function validateAttachmentIngest(
  input: AttachmentIngestInput,
): AttachmentValidationSuccess {
  if (!(ATTACHMENT_ALLOWED_MEDIA_TYPES as readonly string[]).includes(input.declaredMediaType)) {
    fail('attachment_type_unsupported', 'declared_type_allowlisted', 'declared_media_type');
  }
  const declared = input.declaredMediaType as AttachmentMediaType;
  const safeFilename = sanitizeAttachmentFilename(input.filename);
  if (input.body.length === 0) {
    fail('attachment_validation_failed', 'byte_limit');
  }
  if (input.body.length > ATTACHMENT_PER_FILE_MAX_BYTES[declared]) {
    fail('attachment_too_large', 'byte_limit');
  }
  const checksumSha256 = createHash('sha256').update(input.body).digest('hex');
  if (checksumSha256 !== input.contentSha256.toLowerCase()) {
    fail('attachment_validation_failed', 'sha256_verified', 'content_sha256');
  }
  let detected = detectMediaType(input.body);
  if (declared === 'text/markdown' && detected === 'text/plain') {
    detected = 'text/markdown';
  }
  if (detected === 'unknown') {
    fail('attachment_unsafe', 'unknown_type');
  }
  if (!(ATTACHMENT_ALLOWED_MEDIA_TYPES as readonly string[]).includes(detected)) {
    fail('attachment_type_unsupported', 'detected_type_allowlisted');
  }
  if (detected !== declared) {
    fail('attachment_validation_failed', 'declared_matches_detected', 'declared_media_type');
  }
  const denied = deniedClass(input.body, detected);
  if (denied === 'malware') {
    fail('attachment_unsafe', 'malware_scan_clean');
  }
  if (denied) {
    fail('attachment_unsafe', denied);
  }
  if (detected === 'application/pdf' && pdfPageCount(input.body) > ATTACHMENT_POLICY.pdfPagesMax) {
    fail('attachment_pdf_too_long', 'parser_limits_enforced');
  }
  if (detected === 'image/png' && pngPixels(input.body) > ATTACHMENT_POLICY.imagePixelsMax) {
    fail('attachment_image_too_large', 'parser_limits_enforced');
  }
  if (detected === 'image/jpeg' && jpegPixels(input.body) > ATTACHMENT_POLICY.imagePixelsMax) {
    fail('attachment_image_too_large', 'parser_limits_enforced');
  }
  if (detected === 'image/webp' && webpPixels(input.body) > ATTACHMENT_POLICY.imagePixelsMax) {
    fail('attachment_image_too_large', 'parser_limits_enforced');
  }
  return {
    mediaType: declared,
    checksumSha256,
    safeFilename,
    sizeBytes: input.body.length,
  };
}
