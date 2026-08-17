import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { newId } from '../../common/domain/identifiers';
import { type CompanyScope, tenantResourceNotFound } from '../../common/tenant/company-scope';
import { buildObjectKey } from '../../common/tenant/object-key';
import { OBJECT_STORE, type ObjectStorePort } from './object-store';

interface ObjectRecordRow {
  id: string;
  object_key: string;
  checksum_sha256: string;
  size_bytes: number;
  lifecycle_state: 'STAGED' | 'READY' | 'DELETED';
}

@Injectable()
export class ObjectAccessService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(OBJECT_STORE) private readonly store: ObjectStorePort,
  ) {}

  get adapterCalls(): readonly { operation: string; key: string }[] {
    return this.store.calls;
  }

  async put(
    scope: CompanyScope,
    body: Buffer,
  ): Promise<{ objectId: string; objectKey: string; checksumSha256: string }> {
    const objectId = newId();
    const checksumSha256 = createHash('sha256').update(body).digest('hex');
    const objectKey = buildObjectKey({
      companyId: scope.companyId,
      purpose: 'quality-fixture',
      objectId,
      version: 1,
    });
    await this.dataSource.query(
      `
        INSERT INTO object_records
          (id, company_id, purpose, object_key, checksum_sha256, size_bytes, version, lifecycle_state)
        VALUES ($1, $2, 'quality-fixture', $3, $4, $5, 1, 'READY')
      `,
      [objectId, scope.companyId, objectKey, checksumSha256, body.length],
    );
    await this.store.put(objectKey, body, {
      company_id: scope.companyId,
      object_id: objectId,
    });
    return { objectId, objectKey, checksumSha256 };
  }

  async get(scope: CompanyScope, objectId: string): Promise<Buffer> {
    const record = await this.loadOwnRecord(scope, objectId);
    return this.store.get(record.object_key);
  }

  async head(scope: CompanyScope, objectId: string): Promise<{ contentLength: number }> {
    const record = await this.loadOwnRecord(scope, objectId);
    return this.store.head(record.object_key);
  }

  async delete(scope: CompanyScope, objectId: string): Promise<void> {
    const record = await this.loadOwnRecord(scope, objectId);
    await this.store.delete(record.object_key);
    await this.dataSource.query(
      `
        UPDATE object_records
        SET lifecycle_state = 'DELETED', deleted_at = now()
        WHERE company_id = $1 AND id = $2 AND lifecycle_state = 'READY'
      `,
      [scope.companyId, objectId],
    );
  }

  private async loadOwnRecord(scope: CompanyScope, objectId: string): Promise<ObjectRecordRow> {
    const rows = await this.dataSource.query<ObjectRecordRow[]>(
      `
        SELECT id, object_key, checksum_sha256, size_bytes, lifecycle_state
        FROM object_records
        WHERE company_id = $1 AND id = $2 AND lifecycle_state = 'READY'
      `,
      [scope.companyId, objectId],
    );
    if (!rows[0]) {
      throw tenantResourceNotFound();
    }
    return rows[0];
  }
}
