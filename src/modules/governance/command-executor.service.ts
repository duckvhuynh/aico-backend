import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type QueryRunner } from 'typeorm';
import { canonicalDigest, newId } from '../../common/domain/identifiers';
import { DomainError } from '../../common/domain/domain-error';

interface IdempotencyRow {
  request_digest: string;
  state: 'PROCESSING' | 'COMPLETED';
  response_status: number | null;
  response_body: Record<string, unknown> | null;
}

export interface CommandResult<T extends Record<string, unknown>> {
  status: number;
  body: T;
  replayed: boolean;
}

export interface CommandOptions<T extends Record<string, unknown>> {
  actorId: string;
  operation: string;
  idempotencyKey: string;
  request: unknown;
  execute: (runner: QueryRunner) => Promise<{ status: number; body: T }>;
}

@Injectable()
export class CommandExecutor {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async run<T extends Record<string, unknown>>(
    options: CommandOptions<T>,
  ): Promise<CommandResult<T>> {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const runner = manager.queryRunner;
      if (!runner) {
        throw new Error('Transactional query runner is unavailable');
      }
      const requestDigest = canonicalDigest(options.request);
      await runner.query(
        `
          INSERT INTO idempotency_records
            (id, actor_id, operation, idempotency_key, request_digest, state)
          VALUES ($1, $2, $3, $4, $5, 'PROCESSING')
          ON CONFLICT (actor_id, operation, idempotency_key) DO NOTHING
        `,
        [newId(), options.actorId, options.operation, options.idempotencyKey, requestDigest],
      );
      const rows = (await runner.query(
        `
          SELECT request_digest, state, response_status, response_body
          FROM idempotency_records
          WHERE actor_id = $1 AND operation = $2 AND idempotency_key = $3
          FOR UPDATE
        `,
        [options.actorId, options.operation, options.idempotencyKey],
      )) as IdempotencyRow[];
      const record = rows[0];
      if (record.request_digest !== requestDigest) {
        throw new DomainError({
          status: 409,
          code: 'idempotency_key_reused',
          title: 'The idempotency key was already used',
          detail: 'Use a new Idempotency-Key for a different command body.',
          remediation: ['use_new_idempotency_key'],
        });
      }
      if (record.state === 'COMPLETED' && record.response_status && record.response_body) {
        return {
          status: record.response_status,
          body: record.response_body as T,
          replayed: true,
        };
      }

      const result = await options.execute(runner);
      await runner.query(
        `
          UPDATE idempotency_records
          SET state = 'COMPLETED', response_status = $4, response_body = $5, completed_at = now()
          WHERE actor_id = $1 AND operation = $2 AND idempotency_key = $3
        `,
        [
          options.actorId,
          options.operation,
          options.idempotencyKey,
          result.status,
          JSON.stringify(result.body),
        ],
      );
      return { ...result, replayed: false };
    });
  }
}
