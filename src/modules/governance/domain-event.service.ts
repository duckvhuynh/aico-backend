import { Injectable } from '@nestjs/common';
import type { QueryRunner } from 'typeorm';
import { newId } from '../../common/domain/identifiers';

export interface AppendEventOptions {
  companyId: string;
  runId?: string;
  type: string;
  actorType: string;
  actorId: string;
  actorVersion?: string;
  correlationId: string;
  causationId?: string;
  audience?: string;
  dataClassification?: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class DomainEventService {
  async append(runner: QueryRunner, options: AppendEventOptions): Promise<string> {
    const eventId = newId();
    let sequence: number | null = null;
    if (options.runId) {
      const rows = (await runner.query(
        `
          SELECT next_sequence AS sequence
          FROM run_event_counters
          WHERE run_id = $1 AND company_id = $2
          FOR UPDATE
        `,
        [options.runId, options.companyId],
      )) as Array<{ sequence: string }>;
      sequence = Number.parseInt(rows[0].sequence, 10);
      await runner.query(
        `UPDATE run_event_counters SET next_sequence = next_sequence + 1 WHERE run_id = $1 AND company_id = $2`,
        [options.runId, options.companyId],
      );
    }

    const occurredAt = new Date().toISOString();
    const envelope = {
      event_id: eventId,
      schema_version: 1,
      type: options.type,
      company_id: options.companyId,
      run_id: options.runId ?? null,
      run_sequence: sequence,
      actor: {
        type: options.actorType,
        id: options.actorId,
        version: options.actorVersion ?? null,
      },
      occurred_at: occurredAt,
      correlation_id: options.correlationId,
      causation_id: options.causationId ?? null,
      audience: options.audience ?? 'FOUNDER',
      data_classification: options.dataClassification ?? 'INTERNAL',
      payload: options.payload,
    };

    await runner.query(
      `
        INSERT INTO events
          (id, schema_version, type, company_id, run_id, run_sequence, actor_type, actor_id,
           actor_version, correlation_id, causation_id, audience, data_classification, payload, occurred_at)
        VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `,
      [
        eventId,
        options.type,
        options.companyId,
        options.runId ?? null,
        sequence,
        options.actorType,
        options.actorId,
        options.actorVersion ?? null,
        options.correlationId,
        options.causationId ?? null,
        envelope.audience,
        envelope.data_classification,
        JSON.stringify(options.payload),
        occurredAt,
      ],
    );
    await runner.query(
      `INSERT INTO outbox_messages (id, event_id, topic, envelope) VALUES ($1, $2, $3, $4)`,
      [newId(), eventId, `aico.${options.type}`, JSON.stringify(envelope)],
    );
    return eventId;
  }
}
