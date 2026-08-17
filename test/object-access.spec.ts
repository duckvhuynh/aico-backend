import { DomainError } from '../src/common/domain/domain-error';
import { companyScopeFromActor, requireCompanyScope } from '../src/common/tenant/company-scope';
import {
  authorizeObjectAccess,
  buildObjectKey,
  parseObjectKey,
} from '../src/common/tenant/object-key';
import { ObjectAccessService } from '../src/modules/objects/object-access.service';
import { MemoryObjectStore } from '../src/modules/objects/object-store';
import type { RequestActor } from '../src/common/http/request-context';

const companyA = '019c1500-0000-7000-8000-00000000000a';
const companyB = '019c1500-0000-7000-8000-00000000000b';
const objectA = '019c1500-0000-7000-8000-0000000000aa';

function actor(companyId: string | null): RequestActor {
  return {
    id: '019c1500-0000-7000-8000-000000000001',
    authSubject: 'founder:a@example.test',
    companyId,
    sessionId: '019c1500-0000-7000-8000-000000000002',
  };
}

describe('AICO-015 company scope and object access', () => {
  it('derives scope from identity and rejects a missing tenant', () => {
    expect(companyScopeFromActor(actor(companyA))).toEqual({ companyId: companyA });
    expect(() => requireCompanyScope(undefined)).toThrow(DomainError);
    expect(() => companyScopeFromActor(actor(null)).companyId).toThrow(DomainError);
  });

  it('builds opaque tenant keys and denies a client-supplied foreign key', () => {
    const key = buildObjectKey({
      companyId: companyA,
      purpose: 'quality-fixture',
      objectId: objectA,
      version: 1,
    });
    expect(key).toBe(`companies/${companyA}/quality-fixture/${objectA}/1`);
    expect(parseObjectKey(key)?.companyId).toBe(companyA);
    expect(authorizeObjectAccess(companyB, key)).toBe(false);
    expect(authorizeObjectAccess(companyA, `client-supplied/${companyA}/secret.txt`)).toBe(false);
    expect(
      buildObjectKey({
        companyId: companyA,
        purpose: 'attachment',
        objectId: objectA,
        version: 1,
      }),
    ).toBe(`companies/${companyA}/attachment/${objectA}/1`);
  });

  it('does not call the object adapter for foreign get/head/delete', async () => {
    const store = new MemoryObjectStore();
    const records = new Map<string, Record<string, unknown>>();
    const dataSource = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => {
        const asText = (value: unknown): string => (typeof value === 'string' ? value : '');
        const first = asText(params[0]);
        const second = asText(params[1]);
        if (sql.includes('INSERT INTO object_records')) {
          records.set(`${second}:${first}`, {
            id: params[0],
            object_key: params[2],
            checksum_sha256: params[3],
            size_bytes: params[4],
            lifecycle_state: 'READY',
          });
          return [];
        }
        if (sql.includes('FROM object_records')) {
          const row = records.get(`${first}:${second}`);
          return row ? [row] : [];
        }
        if (sql.includes('UPDATE object_records')) {
          records.delete(`${first}:${second}`);
          return [];
        }
        return [];
      }),
    };
    const service = new ObjectAccessService(dataSource as never, store);
    const body = Buffer.from('tenant-a-object-body');
    const created = await service.put(requireCompanyScope(companyA), body);
    expect(store.calls).toEqual([{ operation: 'put', key: created.objectKey }]);

    const before = store.calls.length;
    await expect(
      service.get(requireCompanyScope(companyB), created.objectId),
    ).rejects.toMatchObject({
      status: 404,
      code: 'resource_not_found',
    });
    await expect(
      service.head(requireCompanyScope(companyB), created.objectId),
    ).rejects.toMatchObject({
      status: 404,
      code: 'resource_not_found',
    });
    await expect(
      service.delete(requireCompanyScope(companyB), created.objectId),
    ).rejects.toMatchObject({
      status: 404,
      code: 'resource_not_found',
    });
    expect(store.calls.length).toBe(before);
    await expect(service.get(requireCompanyScope(companyA), created.objectId)).resolves.toEqual(
      body,
    );
  });
});
