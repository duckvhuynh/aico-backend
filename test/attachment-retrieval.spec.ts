import { DomainError } from '../src/common/domain/domain-error';
import { requireCompanyScope } from '../src/common/tenant/company-scope';
import { AttachmentRetrievalService } from '../src/modules/attachments/attachment-retrieval.service';
import { MemoryObjectStore } from '../src/modules/objects/object-store';
import type { RequestActor } from '../src/common/http/request-context';

const companyA = '019c1700-0000-7000-8000-00000000000a';
const companyB = '019c1700-0000-7000-8000-00000000000b';
const runA = '019c1700-0000-7000-8000-0000000000aa';
const objectA = '019c1700-0000-7000-8000-0000000000ab';
const objectKey = `companies/${companyA}/attachment/${objectA}/1`;

function actor(companyId: string): RequestActor {
  return {
    id: '019c1700-0000-7000-8000-000000000001',
    authSubject: 'founder:a@example.test',
    companyId,
    sessionId: '019c1700-0000-7000-8000-000000000002',
  };
}

describe('AICO-017 frozen attachment retrieval', () => {
  it('denies foreign, unlinked, and expired reads before the object adapter', async () => {
    const store = new MemoryObjectStore();
    await store.put(objectKey, Buffer.from('tenant-a-attachment-body'), {
      company_id: companyA,
      object_id: objectA,
    });
    store.calls.length = 0;
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO attachment_retrieval_grants')) {
          return [];
        }
        if (sql.includes('FROM runs r')) {
          return [];
        }
        return [];
      }),
    };
    const service = new AttachmentRetrievalService(dataSource as never, store);
    const before = store.calls.length;
    await expect(service.retrieveForRun(actor(companyB), runA, objectA)).rejects.toMatchObject({
      status: 404,
      code: 'resource_not_found',
    });
    await expect(service.retrieveForRun(actor(companyA), runA, objectA)).rejects.toMatchObject({
      status: 404,
      code: 'resource_not_found',
    });
    expect(store.calls.length).toBe(before);
    expect(dataSource.query.mock.calls.some((call) => String(call[0]).includes('store.get'))).toBe(
      false,
    );
  });

  it('returns bytes only after a company-scoped linked grant', async () => {
    const store = new MemoryObjectStore();
    const body = Buffer.from('linked-attachment-body');
    await store.put(objectKey, body, { company_id: companyA, object_id: objectA });
    store.calls.length = 0;
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM runs r')) {
          return [
            {
              object_id: objectA,
              object_key: objectKey,
              detected_media_type: 'text/plain',
              original_filename: 'notes.txt',
              scan_state: 'CLEAN',
              lifecycle_state: 'READY',
              expires_at: null,
            },
          ];
        }
        return [];
      }),
    };
    const service = new AttachmentRetrievalService(dataSource as never, store);
    const result = await service.retrieveForRun(actor(companyA), runA, objectA);
    expect(result.body).toEqual(body);
    expect(store.calls).toEqual([{ operation: 'get', key: objectKey }]);
    expect(requireCompanyScope(companyA).companyId).toBe(companyA);
  });

  it('does not call the adapter for an expired linked object', async () => {
    const store = new MemoryObjectStore();
    await store.put(objectKey, Buffer.from('expired'), {
      company_id: companyA,
      object_id: objectA,
    });
    store.calls.length = 0;
    const dataSource = {
      query: jest.fn(async () => [
        {
          object_id: objectA,
          object_key: objectKey,
          detected_media_type: 'text/plain',
          original_filename: 'notes.txt',
          scan_state: 'CLEAN',
          lifecycle_state: 'READY',
          expires_at: new Date(Date.now() - 60_000),
        },
      ]),
    };
    const service = new AttachmentRetrievalService(dataSource as never, store);
    await expect(service.retrieveForRun(actor(companyA), runA, objectA)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(store.calls).toEqual([]);
  });
});
