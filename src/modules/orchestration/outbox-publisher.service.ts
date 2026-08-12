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

  async publishOnce(): Promise<boolean> {
    const message = await this.claim();
    if (!message) {
      return false;
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
          INSERT INTO inbox_receipts
            (consumer_name, event_id, processed_at, result_digest)
          VALUES ('local-event-projection/v1', $1, now(), $2)
          ON CONFLICT (consumer_name, event_id) DO NOTHING
        `,
        [message.event_id, canonicalDigest(message.envelope)],
      );
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

  private async claim(): Promise<OutboxRow | null> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<Array<Omit<OutboxRow, 'lease_token'>>>(
        `
          SELECT id, event_id, envelope
          FROM outbox_messages
          WHERE published_at IS NULL
            AND available_at <= now()
            AND (lease_expires_at IS NULL OR lease_expires_at < now())
          ORDER BY available_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `,
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
