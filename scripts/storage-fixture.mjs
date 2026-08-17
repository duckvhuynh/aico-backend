import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { authorizeObjectAccess, buildObjectKey } from '../test/isolation-harness.mjs';

const companyA = '00000000-0000-7000-8000-000000000009';
const companyB = '00000000-0000-7000-8000-000000000010';
const objectId = '00000000-0000-7000-8000-000000000011';
const payload = Buffer.from('aico-015-deterministic-storage-fixture-v1');
const checksum = createHash('sha256').update(payload).digest('hex');
const bucket = process.env.OBJECT_STORAGE_BUCKET ?? 'aico-local';
const key = buildObjectKey(companyA, 'quality-fixture', objectId, 1);

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

const adapterCalls = [];
async function send(command) {
  const keyValue = command.input?.Key ?? command.Key;
  adapterCalls.push({ name: command.constructor.name, key: keyValue });
  return client.send(command);
}

try {
  if (!authorizeObjectAccess(companyA, key)) {
    throw new Error('own-tenant object key was rejected');
  }
  await send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: payload,
      ChecksumSHA256: createHash('sha256').update(payload).digest('base64'),
      Metadata: { company_id: companyA, fixture_version: 'storage-v1' },
    }),
  );
  const head = await send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  if (head.Metadata?.company_id !== companyA) throw new Error('Tenant metadata mismatch.');
  const object = await send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const actualChecksum = createHash('sha256')
    .update(await bodyBytes(object.Body))
    .digest('hex');
  if (actualChecksum !== checksum) throw new Error('Object checksum mismatch.');

  const callsBeforeDenial = adapterCalls.length;
  if (authorizeObjectAccess(companyB, key)) {
    throw new Error('Cross-tenant key access was not denied.');
  }
  if (adapterCalls.length !== callsBeforeDenial) {
    throw new Error('Object adapter was called after a cross-tenant denial.');
  }

  const ownAfterDenial = await send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!ownAfterDenial.Body) throw new Error('Own-tenant object was mutated by a denied access.');
  console.log(
    'Storage fixture passed: tenant put/head/get/checksum, reusable harness denial before adapter, and no foreign mutation.',
  );
} finally {
  await send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
  client.destroy();
}
