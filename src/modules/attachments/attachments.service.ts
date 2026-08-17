import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type QueryRunner } from 'typeorm';
import { DomainError } from '../../common/domain/domain-error';
import { newId } from '../../common/domain/identifiers';
import type { RequestActor } from '../../common/http/request-context';
import { companyScopeFromActor, tenantResourceNotFound } from '../../common/tenant/company-scope';
import { buildObjectKey } from '../../common/tenant/object-key';
import { CommandExecutor, type CommandResult } from '../governance/command-executor.service';
import { DomainEventService } from '../governance/domain-event.service';
import { OBJECT_STORE, type ObjectStorePort } from '../objects/object-store';
import { ATTACHMENT_POLICY } from './attachment-policy';
import { validateAttachmentIngest, type AttachmentValidationSuccess } from './attachment-validator';
import type { CreateAttachmentDto } from './dto/create-attachment.dto';

interface ObjectRecordRow {
  id: string;
  purpose: string;
  lifecycle_state: string;
  scan_state: string;
  size_bytes: number;
  expires_at: Date | null;
  declared_media_type: string | null;
  detected_media_type: string | null;
  checksum_sha256: string;
  original_filename: string | null;
}

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(OBJECT_STORE) private readonly store: ObjectStorePort,
    private readonly commands: CommandExecutor,
    private readonly events: DomainEventService,
  ) {}

  get adapterCalls(): readonly { operation: string; key: string }[] {
    return this.store.calls;
  }

  async ingest(
    actor: RequestActor,
    idempotencyKey: string,
    correlationId: string,
    dto: CreateAttachmentDto,
  ): Promise<CommandResult<Record<string, unknown>>> {
    if (!actor.companyId) {
      throw tenantResourceNotFound();
    }
    const companyId = companyScopeFromActor(actor).companyId;
    const body = this.decodeBody(dto.content_base64);
    let validated: AttachmentValidationSuccess;
    try {
      validated = validateAttachmentIngest({
        declaredMediaType: dto.declared_media_type,
        filename: dto.filename,
        contentSha256: dto.content_sha256,
        body,
      });
    } catch (error: unknown) {
      if (error instanceof DomainError && error.status === 422) {
        await this.auditRejection(companyId, actor, correlationId, error, dto, body.length);
      }
      throw error;
    }

    return this.commands.run({
      actorId: actor.id,
      operation: 'attachments.ingest',
      idempotencyKey,
      request: {
        declared_media_type: dto.declared_media_type,
        filename: validated.safeFilename,
        content_sha256: validated.checksumSha256,
      },
      execute: async (runner) => {
        const objectId = newId();
        const objectKey = buildObjectKey({
          companyId,
          purpose: 'attachment',
          objectId,
          version: 1,
        });
        await runner.query(
          `
            INSERT INTO object_records
              (id, company_id, purpose, object_key, checksum_sha256, size_bytes, version,
               lifecycle_state, declared_media_type, detected_media_type, original_filename,
               scan_state)
            VALUES ($1, $2, 'attachment', $3, $4, $5, 1, 'READY', $6, $6, $7, 'CLEAN')
          `,
          [
            objectId,
            companyId,
            objectKey,
            validated.checksumSha256,
            validated.sizeBytes,
            validated.mediaType,
            validated.safeFilename,
          ],
        );
        await this.store.put(objectKey, body, {
          company_id: companyId,
          object_id: objectId,
        });
        await this.events.append(runner, {
          companyId,
          type: 'attachment_ingested',
          actorType: 'FOUNDER',
          actorId: actor.id,
          correlationId,
          payload: {
            attachment_id: objectId,
            media_type: validated.mediaType,
            size_bytes: validated.sizeBytes,
            checksum_sha256: validated.checksumSha256,
            scan_state: 'CLEAN',
          },
        });
        return {
          status: 201,
          body: this.metadataResponse({
            id: objectId,
            declared_media_type: validated.mediaType,
            detected_media_type: validated.mediaType,
            checksum_sha256: validated.checksumSha256,
            size_bytes: validated.sizeBytes,
            original_filename: validated.safeFilename,
            scan_state: 'CLEAN',
            expires_at: null,
          }),
        };
      },
    });
  }

  async getMetadata(actor: RequestActor, attachmentId: string): Promise<Record<string, unknown>> {
    const companyId = companyScopeFromActor(actor).companyId;
    const rows = await this.dataSource.query<ObjectRecordRow[]>(
      `
        SELECT id, purpose, lifecycle_state, scan_state, size_bytes, expires_at,
               declared_media_type, detected_media_type, checksum_sha256, original_filename
        FROM object_records
        WHERE company_id = $1 AND id = $2 AND purpose = 'attachment'
          AND lifecycle_state = 'READY' AND scan_state = 'CLEAN'
          AND (expires_at IS NULL OR expires_at > now())
      `,
      [companyId, attachmentId],
    );
    const row = rows[0];
    if (!row) {
      throw tenantResourceNotFound();
    }
    return this.metadataResponse(row);
  }

  async bindToGoalVersion(
    runner: QueryRunner,
    companyId: string,
    goalVersionId: string,
    attachmentIds: string[],
  ): Promise<void> {
    if (attachmentIds.length === 0) {
      return;
    }
    if (attachmentIds.length > ATTACHMENT_POLICY.maxCount) {
      throw new DomainError({
        status: 422,
        code: 'attachment_count_exceeded',
        title: 'Too many attachments',
        detail: 'A goal version can reference at most five validated attachments.',
        errors: [{ field: 'attachment_ids', rule: 'count_limit' }],
        remediation: ['remove_extra_attachments'],
      });
    }
    if (new Set(attachmentIds).size !== attachmentIds.length) {
      throw new DomainError({
        status: 422,
        code: 'attachment_validation_failed',
        title: 'The attachment could not be accepted',
        detail: 'Attachment references must be unique, validated, and in the current company.',
        errors: [{ field: 'attachment_ids', rule: 'unique' }],
        remediation: ['replace_attachment'],
      });
    }

    const rows = (await runner.query(
      `
        SELECT id, purpose, lifecycle_state, scan_state, size_bytes, expires_at,
               declared_media_type, detected_media_type, checksum_sha256, original_filename
        FROM object_records
        WHERE company_id = $1 AND id = ANY($2::uuid[])
        FOR UPDATE
      `,
      [companyId, attachmentIds],
    )) as ObjectRecordRow[];
    if (rows.length !== attachmentIds.length) {
      throw tenantResourceNotFound();
    }

    let aggregate = 0;
    for (const [ordinal, attachmentId] of attachmentIds.entries()) {
      const row = rows.find((entry) => entry.id === attachmentId);
      if (!row) {
        throw tenantResourceNotFound();
      }
      this.assertLinkable(row);
      aggregate += Number(row.size_bytes);
      if (aggregate > ATTACHMENT_POLICY.aggregateMaxBytes) {
        throw new DomainError({
          status: 422,
          code: 'attachment_total_exceeded',
          title: 'Attachments exceed the aggregate size limit',
          detail: 'The combined attachments exceed the twenty MiB run limit.',
          errors: [{ field: 'attachment_ids', rule: 'aggregate_byte_limit' }],
          remediation: ['remove_extra_attachments'],
        });
      }
      await runner.query(
        `
          INSERT INTO goal_version_attachments
            (company_id, goal_version_id, object_id, ordinal)
          VALUES ($1, $2, $3, $4)
        `,
        [companyId, goalVersionId, attachmentId, ordinal],
      );
    }
  }

  private assertLinkable(row: ObjectRecordRow): void {
    const expired = row.expires_at !== null && new Date(row.expires_at).getTime() <= Date.now();
    if (
      row.purpose !== 'attachment' ||
      row.lifecycle_state !== 'READY' ||
      row.scan_state !== 'CLEAN' ||
      expired
    ) {
      throw new DomainError({
        status: 422,
        code: 'attachment_validation_failed',
        title: 'The attachment could not be accepted',
        detail: 'Unvalidated, rejected, or expired attachment references cannot be linked.',
        errors: [{ field: 'attachment_ids', rule: 'validated_ready_unexpired' }],
        remediation: ['replace_attachment'],
      });
    }
  }

  private metadataResponse(row: {
    id: string;
    declared_media_type: string | null;
    detected_media_type: string | null;
    checksum_sha256: string;
    size_bytes: number;
    original_filename: string | null;
    scan_state: string;
    expires_at: Date | null;
  }): Record<string, unknown> {
    return {
      id: row.id,
      media_type: row.detected_media_type ?? row.declared_media_type,
      size_bytes: Number(row.size_bytes),
      checksum_sha256: row.checksum_sha256,
      scan_state: row.scan_state,
      filename: row.original_filename,
      expires_at: row.expires_at,
    };
  }

  private decodeBody(value: string): Buffer {
    if (value.length % 4 !== 0) {
      throw new DomainError({
        status: 400,
        code: 'validation_failed',
        title: 'Request validation failed',
        detail: 'One or more request fields are invalid.',
        errors: [{ field: 'content_base64', rule: 'base64' }],
        remediation: ['correct_request_fields'],
      });
    }
    const body = Buffer.from(value, 'base64');
    const encoded = body.toString('base64').replace(/=+$/, '');
    const provided = value.replace(/=+$/, '');
    if (encoded !== provided) {
      throw new DomainError({
        status: 400,
        code: 'validation_failed',
        title: 'Request validation failed',
        detail: 'One or more request fields are invalid.',
        errors: [{ field: 'content_base64', rule: 'base64' }],
        remediation: ['correct_request_fields'],
      });
    }
    return body;
  }

  private async auditRejection(
    companyId: string,
    actor: RequestActor,
    correlationId: string,
    error: DomainError,
    dto: CreateAttachmentDto,
    sizeBytes: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const runner = manager.queryRunner;
      if (!runner) {
        throw new Error('Transactional query runner is unavailable');
      }
      await this.events.append(runner, {
        companyId,
        type: 'attachment_rejected',
        actorType: 'FOUNDER',
        actorId: actor.id,
        correlationId,
        payload: {
          reason_code: error.code,
          declared_media_type: dto.declared_media_type,
          size_bytes: sizeBytes,
        },
      });
    });
  }
}
