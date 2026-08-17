export const ATTACHMENT_ALLOWED_MEDIA_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type AttachmentMediaType = (typeof ATTACHMENT_ALLOWED_MEDIA_TYPES)[number];

export const ATTACHMENT_PER_FILE_MAX_BYTES: Record<AttachmentMediaType, number> = {
  'text/plain': 262144,
  'text/markdown': 262144,
  'application/pdf': 10485760,
  'image/png': 5242880,
  'image/jpeg': 5242880,
  'image/webp': 5242880,
};

export const ATTACHMENT_POLICY = {
  maxCount: 5,
  aggregateMaxBytes: 20971520,
  pdfPagesMax: 50,
  imagePixelsMax: 20_000_000,
  grantTtlSeconds: 60,
  perFileMaxBytes: ATTACHMENT_PER_FILE_MAX_BYTES,
  allowedMediaTypes: ATTACHMENT_ALLOWED_MEDIA_TYPES,
} as const;

export const DENIED_FILENAME_EXTENSIONS = [
  'exe',
  'bat',
  'cmd',
  'com',
  'dll',
  'html',
  'htm',
  'js',
  'mjs',
  'svg',
  'zip',
  'rar',
  '7z',
  'scr',
  'ps1',
  'sh',
] as const;
