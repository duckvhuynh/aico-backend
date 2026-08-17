import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { newId } from '../../common/domain/identifiers';
import type { RequestActor } from '../../common/http/request-context';
import { companyScopeFromActor, tenantResourceNotFound } from '../../common/tenant/company-scope';
import { OBJECT_STORE, type ObjectStorePort } from '../objects/object-store';
import { ATTACHMENT_POLICY } from './attachment-policy';

interface LinkedAttachmentRow {
  object_id: string;
  object_key: string;
  detected_media_type: string;
  original_filename: string;
  scan_state: string;
  lifecycle_state: string;
  expires_at: Date | null;
}

@Injectable()
export class AttachmentRetrievalService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(OBJECT_STORE) private readonly store: ObjectStorePort,
  ) {}

  get adapterCalls(): readonly { operation: string; key: string }[] {
    return this.store.calls;
  }

  async retrieveForRun(
    actor: RequestActor,
    runId: string,
    attachmentId: string,
  ): Promise<{ body: Buffer; mediaType: string; filename: string }> {
    const companyId = companyScopeFromActor(actor).companyId;
    const linked = await this.dataSource.query<LinkedAttachmentRow[]>(
      `
        SELECT o.id AS object_id, o.object_key, o.detected_media_type, o.original_filename,
               o.scan_state, o.lifecycle_state, o.expires_at
        FROM runs r
        JOIN context_snapshots cs
          ON cs.id = r.context_snapshot_id AND cs.company_id = r.company_id
        JOIN goal_version_attachments gva
          ON gva.company_id = r.company_id
         AND gva.goal_version_id = cs.goal_version_id
         AND gva.object_id = $3
        JOIN object_records o
          ON o.company_id = r.company_id AND o.id = gva.object_id
        WHERE r.company_id = $1 AND r.id = $2
      `,
      [companyId, runId, attachmentId],
    );
    const row = linked[0];
    if (!row) {
      throw tenantResourceNotFound();
    }
    const expired = row.expires_at !== null && new Date(row.expires_at).getTime() <= Date.now();
    if (
      row.scan_state !== 'CLEAN' ||
      row.lifecycle_state !== 'READY' ||
      expired ||
      !row.object_key.startsWith(`companies/${companyId}/attachment/`)
    ) {
      throw tenantResourceNotFound();
    }

    const grantId = newId();
    const expiresAt = new Date(Date.now() + ATTACHMENT_POLICY.grantTtlSeconds * 1000);
    await this.dataSource.query(
      `
        INSERT INTO attachment_retrieval_grants
          (id, company_id, object_id, run_id, expires_at, consumed_at)
        VALUES ($1, $2, $3, $4, $5, now())
      `,
      [grantId, companyId, attachmentId, runId, expiresAt],
    );
    const body = await this.store.get(row.object_key);
    return {
      body,
      mediaType: row.detected_media_type,
      filename: row.original_filename,
    };
  }
}
