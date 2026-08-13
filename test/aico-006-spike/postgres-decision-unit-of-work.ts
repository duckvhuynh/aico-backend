import type { DataSource, QueryRunner } from 'typeorm';

import { newId } from '../../src/common/domain/identifiers';
import { assertProofSchemaName, setProofSearchPath } from './proof-schema';

export type Gate01Failpoint =
  | 'AFTER_AUTHORITY_LOCK'
  | 'AFTER_RECEIPT_LOCK'
  | 'BEFORE_RECEIPT_WRITE'
  | 'AFTER_RECEIPT_WRITE'
  | 'AFTER_COMMIT_BEFORE_RETURN'
  | 'AFTER_POLICY_DECISION'
  | 'AFTER_FOUNDER_DECISION'
  | 'AFTER_GATE_TRANSITION'
  | 'AFTER_APPROVED_BINDING'
  | 'AFTER_CONTINUATION'
  | 'AFTER_POLICY_EVENT'
  | 'AFTER_POLICY_OUTBOX'
  | 'AFTER_APPROVAL_EVENT'
  | 'AFTER_APPROVAL_OUTBOX';

export type Gate01FailpointHook = (stage: Gate01Failpoint) => void | Promise<void>;

export interface FounderAuthorityInput {
  sessionId: string;
  authSubject: string;
  companyId: string;
  authenticatedAt: Date;
}

export interface LockedFounderAuthority {
  sessionId: string;
  sessionVersion: number;
  founderId: string;
  founderAuthorityVersion: number;
  companyId: string;
  companyRowVersion: number;
}

export interface ReceiptScope {
  idempotencyKey: string;
  requestDigest: string;
  correlationId: string;
}

export interface DecisionWorkContext {
  runner: QueryRunner;
  authority: LockedFounderAuthority;
  correlationId: string;
  requestDigest: string;
  failpoint: Gate01FailpointHook;
}

export interface DecisionWorkResult<T extends object> {
  status: number;
  body: T;
}

export interface DecisionUnitOfWorkResult<T extends object> extends DecisionWorkResult<T> {
  replayed: boolean;
}

interface SessionRow {
  id: string;
  founder_id: string;
  auth_subject: string;
  status: string;
  expires_at: Date | string;
  database_now: Date | string;
  session_version: number;
}

interface FounderRow {
  id: string;
  auth_subject: string;
  status: string;
  authority_version: number;
}

interface CompanyRow {
  id: string;
  founder_id: string;
  current_founder_id: string;
  status: string;
  row_version: number;
}

interface ReceiptRow {
  request_digest: string;
  response_status: number;
  response_body: unknown;
}

export class Gate01ProofError extends Error {
  constructor(
    public readonly code:
      | 'AUTHENTICATION_REQUIRED'
      | 'AUTHORITY_FORBIDDEN'
      | 'IDEMPOTENCY_CONFLICT'
      | 'PRECONDITION_FAILED'
      | 'INVALID_CONTEXT',
    public readonly statusCode: 400 | 401 | 403 | 409 | 412,
  ) {
    super(code);
    this.name = 'Gate01ProofError';
  }
}

export class PostgresDecisionUnitOfWork {
  constructor(
    private readonly dataSource: DataSource,
    private readonly schemaName: string,
    private readonly onFailpoint: Gate01FailpointHook = () => undefined,
  ) {
    assertProofSchemaName(schemaName);
  }

  async execute<T extends object>(
    authorityInput: FounderAuthorityInput,
    receiptScope: ReceiptScope,
    work: (context: DecisionWorkContext) => Promise<DecisionWorkResult<T>>,
  ): Promise<DecisionUnitOfWorkResult<T>> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction('READ COMMITTED');

    let result: DecisionUnitOfWorkResult<T>;
    try {
      await setProofSearchPath(runner, this.schemaName);

      // This order is security-sensitive. Receipt existence is not queried until
      // current session, founder, and company authority have all passed and locked.
      const authority = await this.lockCurrentAuthority(runner, authorityInput);
      await this.onFailpoint('AFTER_AUTHORITY_LOCK');

      // The transaction-scoped lock closes the first-writer race without creating
      // a pre-authority receipt or a durable PROCESSING tombstone.
      await runner.query(
        `SELECT pg_advisory_xact_lock(
          hashtextextended($1, 0)
        )`,
        [
          `${authority.companyId}:${authority.founderId}:DECIDE_GATE_01:${receiptScope.idempotencyKey}`,
        ],
      );

      const replay = await this.lockReceipt(runner, authority, receiptScope);
      await this.onFailpoint('AFTER_RECEIPT_LOCK');
      if (replay !== null) {
        result = {
          status: replay.response_status,
          body: this.asReplay<T>(replay.response_body),
          replayed: true,
        };
      } else {
        const workResult = await work({
          runner,
          authority,
          correlationId: receiptScope.correlationId,
          requestDigest: receiptScope.requestDigest,
          failpoint: this.onFailpoint,
        });
        await this.onFailpoint('BEFORE_RECEIPT_WRITE');
        await runner.query(
          `INSERT INTO command_receipts (
            id, company_id, founder_id, session_id, operation,
            idempotency_key, request_digest, status, response_status,
            response_body, correlation_id, completed_at
          ) VALUES (
            $1, $2, $3, $4, 'DECIDE_GATE_01',
            $5, $6, 'COMPLETED', $7, $8::jsonb, $9, clock_timestamp()
          )`,
          [
            newId(),
            authority.companyId,
            authority.founderId,
            authority.sessionId,
            receiptScope.idempotencyKey,
            receiptScope.requestDigest,
            workResult.status,
            JSON.stringify(workResult.body),
            receiptScope.correlationId,
          ],
        );
        await this.onFailpoint('AFTER_RECEIPT_WRITE');
        result = { ...workResult, replayed: false };
      }

      await runner.commitTransaction();
    } catch (error) {
      if (runner.isTransactionActive) {
        await runner.rollbackTransaction();
      }
      throw error;
    } finally {
      await runner.release();
    }

    await this.onFailpoint('AFTER_COMMIT_BEFORE_RETURN');
    return result;
  }

  private async lockCurrentAuthority(
    runner: QueryRunner,
    input: FounderAuthorityInput,
  ): Promise<LockedFounderAuthority> {
    const sessions = (await runner.query(
      `SELECT id, founder_id, auth_subject, status, expires_at, session_version,
              clock_timestamp() AS database_now
       FROM founder_sessions
       WHERE id = $1
       FOR UPDATE`,
      [input.sessionId],
    )) as SessionRow[];
    const session = sessions[0];
    if (
      session === undefined ||
      session.auth_subject !== input.authSubject ||
      session.status !== 'ACTIVE' ||
      new Date(session.expires_at).getTime() <= new Date(session.database_now).getTime()
    ) {
      throw new Gate01ProofError('AUTHENTICATION_REQUIRED', 401);
    }

    const founders = (await runner.query(
      `SELECT id, auth_subject, status, authority_version
       FROM founders
       WHERE id = $1
       FOR UPDATE`,
      [session.founder_id],
    )) as FounderRow[];
    const founder = founders[0];
    if (
      founder === undefined ||
      founder.auth_subject !== input.authSubject ||
      founder.status !== 'ACTIVE'
    ) {
      throw new Gate01ProofError('AUTHORITY_FORBIDDEN', 403);
    }

    const companies = (await runner.query(
      `SELECT id, founder_id, current_founder_id, status, row_version
       FROM companies
       WHERE id = $1
       FOR UPDATE`,
      [input.companyId],
    )) as CompanyRow[];
    const company = companies[0];
    if (
      company === undefined ||
      company.current_founder_id !== founder.id ||
      company.status !== 'ACTIVE'
    ) {
      throw new Gate01ProofError('AUTHORITY_FORBIDDEN', 403);
    }

    return {
      sessionId: session.id,
      sessionVersion: session.session_version,
      founderId: founder.id,
      founderAuthorityVersion: founder.authority_version,
      companyId: company.id,
      companyRowVersion: company.row_version,
    };
  }

  private async lockReceipt(
    runner: QueryRunner,
    authority: LockedFounderAuthority,
    scope: ReceiptScope,
  ): Promise<ReceiptRow | null> {
    const rows = (await runner.query(
      `SELECT request_digest, response_status, response_body
       FROM command_receipts
       WHERE company_id = $1
         AND founder_id = $2
         AND operation = 'DECIDE_GATE_01'
         AND idempotency_key = $3
       FOR UPDATE`,
      [authority.companyId, authority.founderId, scope.idempotencyKey],
    )) as ReceiptRow[];
    const receipt = rows[0];
    if (receipt === undefined) {
      return null;
    }
    if (receipt.request_digest !== scope.requestDigest) {
      throw new Gate01ProofError('IDEMPOTENCY_CONFLICT', 409);
    }
    return receipt;
  }

  private asReplay<T extends object>(body: unknown): T {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new Gate01ProofError('INVALID_CONTEXT', 400);
    }
    return { ...body, replayed: true } as T;
  }
}
