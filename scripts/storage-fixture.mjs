import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const companyA = '00000000-0000-7000-8000-000000000009';
const companyB = '00000000-0000-7000-8000-000000000010';
const payload = Buffer.from('aico-009-deterministic-storage-fixture-v1');
const checksum = createHash('sha256').update(payload).digest('hex');
const bucket = process.env.OBJECT_STORAGE_BUCKET ?? 'aico-local';
const key = `companies/${companyA}/quality-fixtures/storage-v1.txt`;

function requireTenantKey(companyId, objectKey) {
  if (!objectKey.startsWith(`companies/${companyId}/`)) {
    throw new Error('tenant_object_not_found');
  }
}

async function bodyBytes(body) {
  return Buffer.from(await body.transformToByteArray());
}

const client = new S3Client({
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
  region: process.env.OBJECT_STORAGE_REGION ?? 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY ?? 'aico',
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY ?? 'local-minio-secret',
  },
});

try {
  requireTenantKey(companyA, key);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: payload,
      ChecksumSHA256: createHash('sha256').update(payload).digest('base64'),
      Metadata: { company_id: companyA, fixture_version: 'storage-v1' },
    }),
  );
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  if (head.Metadata?.company_id !== companyA) throw new Error('Tenant metadata mismatch.');
  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const actualChecksum = createHash('sha256')
    .update(await bodyBytes(object.Body))
    .digest('hex');
  if (actualChecksum !== checksum) throw new Error('Object checksum mismatch.');

  let denied = false;
  try {
    requireTenantKey(companyB, key);
  } catch (error) {
    denied = error instanceof Error && error.message === 'tenant_object_not_found';
  }
  if (!denied) throw new Error('Cross-tenant key access was not denied.');
  console.log('Storage fixture passed: tenant put/head/get/checksum and cross-tenant denial.');
} finally {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
  client.destroy();
}
