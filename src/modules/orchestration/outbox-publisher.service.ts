import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { canonicalDigest, newId } from '../../common/domain/identifiers';

interface OutboxRow {
  id: string;
  event_id: string;
  envelope: Record<string, unknown>;
  lease_token: string;
}

export interface PublishOptions {
  eventId?: string;
  stopAfterConsumerCommit?: boolean;
}

function projectionPart(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

@Injectable()
export class OutboxPublisherService {
  private readonly workerId: string;
  private readonly leaseSeconds: number;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.workerId = config.getOrThrow<string>('worker.id');
    this.leaseSeconds = config.getOrThrow<number>('worker.leaseSeconds');
  }

  async publishOnce(options: PublishOptions = {}): Promise<boolean> {
    const message = await this.claim(options.eventId);
    if (!message) {
      return false;
    }
    await this.consume(message);
    if (options.stopAfterConsumerCommit) {
      return true;
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
          UPDATE outbox_messages
          SET published_at = now(), lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL
          WHERE id = $1 AND lease_token = $2 AND published_at IS NULL
        `,
        [message.id, message.lease_token],
      );
    });
    return true;
  }

  private async consume(message: OutboxRow): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const receipt = await manager.query<Array<{ event_id: string }>>(
        `
          INSERT INTO inbox_receipts
            (consumer_name, event_id, processed_at, result_digest)
          VALUES ('local-event-projection/v1', $1, now(), $2)
          ON CONFLICT (consumer_name, event_id) DO NOTHING
          RETURNING event_id
        `,
        [message.event_id, canonicalDigest(message.envelope)],
      );
      if (receipt.length === 0) {
        return;
      }
      const envelope = message.envelope;
      const projectionKey = [
        projectionPart(envelope.type, 'unknown'),
        projectionPart(envelope.run_id, 'company'),
        projectionPart(envelope.run_sequence ?? envelope.event_id, message.event_id),
      ].join(':');
      await manager.query(
        `
          INSERT INTO local_event_projections
            (consumer_name, event_id, projection_key, result_digest)
          VALUES ('local-event-projection/v1', $1, $2, $3)
        `,
        [message.event_id, projectionKey, canonicalDigest({ projectionKey, envelope })],
      );
    });
  }

  private async claim(eventId?: string): Promise<OutboxRow | null> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<Array<Omit<OutboxRow, 'lease_token'>>>(
        `
          SELECT id, event_id, envelope
          FROM outbox_messages
          WHERE published_at IS NULL
            AND available_at <= now()
            AND (lease_expires_at IS NULL OR lease_expires_at < now())
            AND ($1::uuid IS NULL OR event_id = $1)
          ORDER BY available_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `,
        [eventId ?? null],
      );
      const candidate = rows[0];
      if (!candidate) {
        return null;
      }
      const leaseToken = newId();
      await manager.query(
        `
          UPDATE outbox_messages
          SET lease_owner = $2, lease_token = $3,
              lease_expires_at = now() + ($4 * interval '1 second'), attempts = attempts + 1
          WHERE id = $1
        `,
        [candidate.id, this.workerId, leaseToken, this.leaseSeconds],
      );
      return { ...candidate, lease_token: leaseToken };
    });
  }
}
