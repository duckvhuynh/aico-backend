import 'reflect-metadata';

import { DataSource, type QueryRunner } from 'typeorm';

import { canonicalDigest, isUuid, newId } from '../../src/common/domain/identifiers';
import { assertProofSchemaName, setProofSearchPath } from './proof-schema';

export const GATE01_PROJECTION_CONSUMER = 'gate01-proof/v1';
export const CONSUMER_CRASH_EXIT_CODE = 86;

export type ConsumerQuarantineReason =
  | 'OUTBOX_NOT_FOUND'
  | 'ENVELOPE_DIGEST_MISMATCH'
  | 'EVENT_NOT_FOUND'
  | 'EVENT_SCHEMA_INVALID'
  | 'ENVELOPE_EVENT_MISMATCH'
  | 'PAYLOAD_DIGEST_MISMATCH'
  | 'PAYLOAD_SCHEMA_INVALID'
  | 'CAUSATION_INVALID'
  | 'SEQUENCE_REGRESSION'
  | 'INBOX_DIGEST_MISMATCH';

export interface ConsumerDelivery {
  outboxMessageId: string;
  deliveredEnvelope?: unknown;
}

export interface ConsumerProbeOptions {
  consumerKey?: string;
  observedAt?: string;
  crashAfterProjectionCommit?: boolean;
}

export type ConsumerProbeResult =
  | {
      outcome: 'APPLIED' | 'DEDUPED';
      consumerKey: string;
      outboxMessageId: string;
      eventId: string;
      runSequence: number | null;
      acknowledged: true;
    }
  | {
      outcome: 'DEFERRED';
      consumerKey: string;
      outboxMessageId: string;
      eventId: string;
      runSequence: number;
      expectedSequence: number;
      acknowledged: false;
      reason: 'SEQUENCE_GAP';
    }
  | {
      outcome: 'QUARANTINED';
      consumerKey: string;
      outboxMessageId: string;
      eventId: string | null;
      acknowledged: false;
      reason: ConsumerQuarantineReason;
    };

interface OutboxRow {
  id: string;
  company_id: string;
  event_id: string;
  topic: string;
  envelope: unknown;
  envelope_digest: string;
}

interface EventRow {
  id: string;
  event_schema: string;
  event_type: 'policy.decided' | 'approval.decided';
  company_id: string;
  run_id: string | null;
  run_sequence: string | number | null;
  aggregate_type: string;
  aggregate_id: string;
  correlation_id: string;
  causation_id: string;
  occurred_at: Date | string;
  payload: unknown;
  payload_digest: string;
}

interface ValidatedDelivery {
  outbox: OutboxRow;
  event: EventRow;
  payload: Record<string, unknown>;
}

interface OffsetRow {
  last_sequence: string | number;
}

interface InboxRow {
  event_digest: string;
}

interface PolicyEvidenceRow {
  id: string;
  command_id: string;
  decision_schema: string;
  result: string;
  reason_code: string;
  binding: unknown;
  expires_at: Date | string | null;
  maximum_uses: number;
  run_id: string | null;
  gate_instance_id: string | null;
  artifact_id: string | null;
  artifact_version_id: string | null;
}

interface ApprovalEvidenceRow {
  id: string;
  policy_decision_id: string;
  decision: 'APPROVE' | 'REQUEST_REVISION';
  gate_instance_id: string;
  artifact_version_id: string;
  continuation_id: string;
  continuation_kind: string;
  gate_status: string;
}

interface PriorEventRow {
  id: string;
  event_type: string;
  aggregate_id: string;
}

interface ApplyResult {
  outcome: 'APPLIED' | 'DEDUPED';
  delivery: ValidatedDelivery;
}

class ValidationFailure extends Error {
  constructor(public readonly reason: ConsumerQuarantineReason) {
    super(reason);
    this.name = 'ValidationFailure';
  }
}

export class ConsumerCrashAfterCommitError extends Error {
  constructor(
    public readonly outboxMessageId: string,
    public readonly eventId: string,
  ) {
    super('CONSUMER_CRASH_AFTER_PROJECTION_COMMIT');
    this.name = 'ConsumerCrashAfterCommitError';
  }
}

export class Gate01OutboxConsumerProbe {
  private readonly consumerKey: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly schemaName: string,
    consumerKey = GATE01_PROJECTION_CONSUMER,
  ) {
    assertProofSchemaName(schemaName);
    if (!/^[a-z0-9][a-z0-9./:_-]{2,127}$/i.test(consumerKey)) {
      throw new TypeError('consumerKey is invalid');
    }
    this.consumerKey = consumerKey;
  }

  async consume(
    delivery: ConsumerDelivery,
    options: Omit<ConsumerProbeOptions, 'consumerKey'> = {},
  ): Promise<ConsumerProbeResult> {
    const observedAt = normalizeInstant(options.observedAt ?? new Date().toISOString());
    const applied = await this.validateAndApply(delivery, observedAt);
    if (applied.outcome === 'DEFERRED' || applied.outcome === 'QUARANTINED') {
      return applied;
    }

    if (applied.outcome === 'APPLIED' && options.crashAfterProjectionCommit === true) {
      throw new ConsumerCrashAfterCommitError(
        applied.delivery.outbox.id,
        applied.delivery.event.id,
      );
    }

    await this.acknowledge(applied.delivery, observedAt);
    return {
      outcome: applied.outcome,
      consumerKey: this.consumerKey,
      outboxMessageId: applied.delivery.outbox.id,
      eventId: applied.delivery.event.id,
      runSequence:
        applied.delivery.event.run_sequence === null
          ? null
          : Number(applied.delivery.event.run_sequence),
      acknowledged: true,
    };
  }

  private async validateAndApply(
    candidate: ConsumerDelivery,
    observedAt: string,
  ): Promise<ApplyResult | Extract<ConsumerProbeResult, { outcome: 'DEFERRED' | 'QUARANTINED' }>> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction('READ COMMITTED');
    try {
      await setProofSearchPath(runner, this.schemaName);
      const outbox = await this.lockOutbox(runner, candidate.outboxMessageId);
      if (outbox === null) {
        const result = await this.quarantine(
          runner,
          candidate,
          null,
          'OUTBOX_NOT_FOUND',
          observedAt,
        );
        await runner.commitTransaction();
        return result;
      }

      let validated: ValidatedDelivery;
      try {
        validated = await this.validateDelivery(runner, candidate, outbox);
      } catch (error) {
        if (!(error instanceof ValidationFailure)) {
          throw error;
        }
        const result = await this.quarantine(runner, candidate, outbox, error.reason, observedAt);
        await runner.commitTransaction();
        return result;
      }

      const result =
        validated.event.run_id === null
          ? await this.applyCompanyScoped(runner, validated, observedAt)
          : await this.applyInOrder(runner, validated, observedAt);
      await runner.commitTransaction();
      return result;
    } catch (error) {
      if (runner.isTransactionActive) {
        await runner.rollbackTransaction();
      }
      throw error;
    } finally {
      await runner.release();
    }
  }

  private async lockOutbox(
    runner: QueryRunner,
    outboxMessageId: string,
  ): Promise<OutboxRow | null> {
    if (!isUuid(outboxMessageId)) {
      return null;
    }
    const rows = (await runner.query(
      `SELECT id, company_id, event_id, topic, envelope, envelope_digest
       FROM outbox_messages WHERE id = $1 FOR UPDATE`,
      [outboxMessageId],
    )) as OutboxRow[];
    return rows[0] ?? null;
  }

  private async validateDelivery(
    runner: QueryRunner,
    candidate: ConsumerDelivery,
    outbox: OutboxRow,
  ): Promise<ValidatedDelivery> {
    const storedEnvelopeDigest = safeDigest(outbox.envelope);
    const deliveredEnvelope =
      candidate.deliveredEnvelope === undefined ? outbox.envelope : candidate.deliveredEnvelope;
    if (
      storedEnvelopeDigest !== outbox.envelope_digest ||
      safeDigest(deliveredEnvelope) !== outbox.envelope_digest
    ) {
      throw new ValidationFailure('ENVELOPE_DIGEST_MISMATCH');
    }

    const events = (await runner.query(
      `SELECT id, event_schema, event_type, company_id, run_id, run_sequence,
              aggregate_type, aggregate_id, correlation_id, causation_id,
              occurred_at, payload, payload_digest
       FROM domain_events
       WHERE company_id = $1 AND id = $2`,
      [outbox.company_id, outbox.event_id],
    )) as EventRow[];
    const event = events[0];
    if (event === undefined) {
      throw new ValidationFailure('EVENT_NOT_FOUND');
    }
    const companyScoped = event.run_id === null && event.run_sequence === null;
    const runScoped =
      event.run_id !== null &&
      event.run_sequence !== null &&
      Number.isSafeInteger(Number(event.run_sequence)) &&
      Number(event.run_sequence) > 0;
    if (
      event.event_schema !== 'domain-event/v1' ||
      (!companyScoped && !runScoped) ||
      (companyScoped && event.event_type !== 'policy.decided') ||
      !['policy.decided', 'approval.decided'].includes(event.event_type)
    ) {
      throw new ValidationFailure('EVENT_SCHEMA_INVALID');
    }
    if (safeDigest(event.payload) !== event.payload_digest) {
      throw new ValidationFailure('PAYLOAD_DIGEST_MISMATCH');
    }

    const envelope = asRecord(deliveredEnvelope);
    const payload = asRecord(event.payload);
    if (
      envelope === null ||
      payload === null ||
      !hasExactKeys(envelope, [
        'schema_version',
        'event_id',
        'event_type',
        'company_id',
        'run_id',
        'run_sequence',
        'correlation_id',
        'causation_id',
        'occurred_at',
        'payload',
      ]) ||
      envelope.schema_version !== 1 ||
      envelope.event_id !== event.id ||
      envelope.event_type !== event.event_type ||
      envelope.company_id !== event.company_id ||
      envelope.run_id !== event.run_id ||
      (event.run_sequence === null
        ? envelope.run_sequence !== null
        : Number(envelope.run_sequence) !== Number(event.run_sequence)) ||
      envelope.correlation_id !== event.correlation_id ||
      envelope.causation_id !== event.causation_id ||
      !sameInstant(envelope.occurred_at, event.occurred_at) ||
      safeDigest(envelope.payload) !== event.payload_digest ||
      outbox.topic !== event.event_type
    ) {
      throw new ValidationFailure('ENVELOPE_EVENT_MISMATCH');
    }

    await this.validatePayloadAndCausation(runner, event, payload);
    return { outbox, event, payload };
  }

  private async validatePayloadAndCausation(
    runner: QueryRunner,
    event: EventRow,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (event.event_type === 'policy.decided') {
      const companyScoped = event.run_id === null;
      const expectedPayloadKeys = companyScoped
        ? [
            'schema_version',
            'policy_decision_id',
            'result',
            'reason_code',
            'action_class',
            'resource_class',
            'supplied_reference_digest',
          ]
        : ['schema_version', 'policy_decision_id', 'result', 'reason_code'];
      if (!hasExactKeys(payload, expectedPayloadKeys) || payload.schema_version !== 1) {
        throw new ValidationFailure('PAYLOAD_SCHEMA_INVALID');
      }
      const evidence = (await runner.query(
        `SELECT id, command_id, decision_schema, result, reason_code, binding,
                expires_at, maximum_uses, run_id, gate_instance_id,
                artifact_id, artifact_version_id
         FROM policy_decisions WHERE company_id = $1 AND id = $2`,
        [event.company_id, event.aggregate_id],
      )) as PolicyEvidenceRow[];
      const decision = evidence[0];
      if (
        event.aggregate_type !== 'PolicyDecision' ||
        decision === undefined ||
        decision.decision_schema !== 'policy-decision/v1' ||
        payload.policy_decision_id !== decision.id ||
        payload.result !== decision.result ||
        payload.reason_code !== decision.reason_code
      ) {
        throw new ValidationFailure('PAYLOAD_SCHEMA_INVALID');
      }
      if (event.causation_id !== decision.command_id) {
        throw new ValidationFailure('CAUSATION_INVALID');
      }
      if (companyScoped) {
        this.validateCompanyScopedDenial(event, payload, decision);
      }
      return;
    }

    if (
      !hasExactKeys(payload, [
        'schema_version',
        'decision_record_id',
        'policy_decision_id',
        'decision',
        'gate',
        'gate_instance_id',
        'artifact_version_id',
        'resulting_run_state',
        'continuation_intent_id',
      ]) ||
      payload.schema_version !== 1 ||
      payload.gate !== 'GATE-01'
    ) {
      throw new ValidationFailure('PAYLOAD_SCHEMA_INVALID');
    }
    const evidence = (await runner.query(
      `SELECT d.id, d.policy_decision_id, d.decision, d.gate_instance_id,
              d.artifact_version_id, c.id AS continuation_id,
              c.kind AS continuation_kind, g.status AS gate_status
       FROM founder_gate_decisions d
       JOIN continuation_intents c ON c.company_id = d.company_id
         AND c.decision_record_id = d.id
       JOIN gate_instances g ON g.company_id = d.company_id
         AND g.run_id = d.run_id AND g.id = d.gate_instance_id
       WHERE d.company_id = $1 AND d.id = $2`,
      [event.company_id, event.aggregate_id],
    )) as ApprovalEvidenceRow[];
    const decision = evidence[0];
    const expectedGateStatus = decision?.decision === 'APPROVE' ? 'APPROVED' : 'REVISION_REQUESTED';
    const expectedRunState = decision?.decision === 'APPROVE' ? 'DESIGNING' : 'QUALIFYING';
    const expectedContinuation =
      decision?.decision === 'APPROVE' ? 'START_DESIGN_FROM_BRIEF' : 'REVISE_PRODUCT_BRIEF';
    if (
      event.aggregate_type !== 'GateInstance' ||
      decision === undefined ||
      payload.decision_record_id !== decision.id ||
      payload.policy_decision_id !== decision.policy_decision_id ||
      payload.decision !== decision.decision ||
      payload.gate_instance_id !== decision.gate_instance_id ||
      payload.artifact_version_id !== decision.artifact_version_id ||
      payload.continuation_intent_id !== decision.continuation_id ||
      payload.resulting_run_state !== expectedRunState ||
      decision.continuation_kind !== expectedContinuation ||
      decision.gate_status !== expectedGateStatus
    ) {
      throw new ValidationFailure('PAYLOAD_SCHEMA_INVALID');
    }
    const priorEvents = (await runner.query(
      `SELECT id, event_type, aggregate_id FROM domain_events
       WHERE company_id = $1 AND run_id = $2 AND run_sequence = $3`,
      [event.company_id, event.run_id, Number(event.run_sequence) - 1],
    )) as PriorEventRow[];
    const prior = priorEvents[0];
    if (
      prior === undefined ||
      prior.id !== event.causation_id ||
      prior.event_type !== 'policy.decided' ||
      prior.aggregate_id !== decision.policy_decision_id
    ) {
      throw new ValidationFailure('CAUSATION_INVALID');
    }
  }

  private async applyInOrder(
    runner: QueryRunner,
    delivery: ValidatedDelivery,
    observedAt: string,
  ): Promise<ApplyResult | Extract<ConsumerProbeResult, { outcome: 'DEFERRED' | 'QUARANTINED' }>> {
    const { event, outbox, payload } = delivery;
    await runner.query(
      `INSERT INTO consumer_run_offsets (
        consumer_key, company_id, run_id, last_sequence, updated_at
      ) VALUES ($1,$2,$3,0,$4) ON CONFLICT DO NOTHING`,
      [this.consumerKey, event.company_id, event.run_id, observedAt],
    );
    const offsets = (await runner.query(
      `SELECT last_sequence FROM consumer_run_offsets
       WHERE consumer_key = $1 AND company_id = $2 AND run_id = $3
       FOR UPDATE`,
      [this.consumerKey, event.company_id, event.run_id],
    )) as OffsetRow[];
    const lastSequence = Number(offsets[0]?.last_sequence ?? 0);
    const runSequence = Number(event.run_sequence);
    const expectedSequence = lastSequence + 1;
    const inboxRows = (await runner.query(
      `SELECT event_digest FROM projection_inbox
       WHERE consumer_key = $1 AND event_id = $2`,
      [this.consumerKey, event.id],
    )) as InboxRow[];
    const inbox = inboxRows[0];
    if (inbox !== undefined) {
      if (inbox.event_digest !== event.payload_digest) {
        return this.quarantine(
          runner,
          { outboxMessageId: outbox.id, deliveredEnvelope: outbox.envelope },
          outbox,
          'INBOX_DIGEST_MISMATCH',
          observedAt,
          event,
        );
      }
      if (runSequence > lastSequence) {
        return this.quarantine(
          runner,
          { outboxMessageId: outbox.id, deliveredEnvelope: outbox.envelope },
          outbox,
          'SEQUENCE_REGRESSION',
          observedAt,
          event,
        );
      }
      return { outcome: 'DEDUPED', delivery };
    }
    if (runSequence > expectedSequence) {
      await runner.query(
        `INSERT INTO consumer_deferred_messages (
          consumer_key, outbox_message_id, event_id, company_id, run_id,
          run_sequence, reason_code, message_digest, observed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,'SEQUENCE_GAP',$7,$8)
        ON CONFLICT (consumer_key, outbox_message_id) DO NOTHING`,
        [
          this.consumerKey,
          outbox.id,
          event.id,
          event.company_id,
          event.run_id,
          runSequence,
          outbox.envelope_digest,
          observedAt,
        ],
      );
      return {
        outcome: 'DEFERRED',
        consumerKey: this.consumerKey,
        outboxMessageId: outbox.id,
        eventId: event.id,
        runSequence,
        expectedSequence,
        acknowledged: false,
        reason: 'SEQUENCE_GAP',
      };
    }
    if (runSequence < expectedSequence) {
      return this.quarantine(
        runner,
        { outboxMessageId: outbox.id, deliveredEnvelope: outbox.envelope },
        outbox,
        'SEQUENCE_REGRESSION',
        observedAt,
        event,
      );
    }

    await runner.query(
      `INSERT INTO projection_inbox (
        consumer_key, event_id, event_digest, received_at
      ) VALUES ($1,$2,$3,$4)`,
      [this.consumerKey, event.id, event.payload_digest, observedAt],
    );
    if (event.event_type === 'approval.decided') {
      const decision = payload.decision;
      const gateStatus = decision === 'APPROVE' ? 'APPROVED' : 'REVISION_REQUESTED';
      await runner.query(
        `INSERT INTO gate01_projection (
          company_id, run_id, last_sequence, gate_status,
          decision_record_id, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (company_id, run_id) DO UPDATE SET
          last_sequence = EXCLUDED.last_sequence,
          gate_status = EXCLUDED.gate_status,
          decision_record_id = EXCLUDED.decision_record_id,
          updated_at = EXCLUDED.updated_at
        WHERE gate01_projection.last_sequence < EXCLUDED.last_sequence`,
        [
          event.company_id,
          event.run_id,
          runSequence,
          gateStatus,
          payload.decision_record_id,
          observedAt,
        ],
      );
    }
    await runner.query(
      `UPDATE consumer_run_offsets SET last_sequence = $1, updated_at = $2
       WHERE consumer_key = $3 AND company_id = $4 AND run_id = $5
         AND last_sequence = $6`,
      [runSequence, observedAt, this.consumerKey, event.company_id, event.run_id, lastSequence],
    );
    await runner.query(
      `DELETE FROM consumer_deferred_messages
       WHERE consumer_key = $1 AND outbox_message_id = $2`,
      [this.consumerKey, outbox.id],
    );
    return { outcome: 'APPLIED', delivery };
  }

  private async applyCompanyScoped(
    runner: QueryRunner,
    delivery: ValidatedDelivery,
    observedAt: string,
  ): Promise<ApplyResult | Extract<ConsumerProbeResult, { outcome: 'QUARANTINED' }>> {
    const { event, outbox } = delivery;
    const inboxRows = (await runner.query(
      `SELECT event_digest FROM projection_inbox
       WHERE consumer_key = $1 AND event_id = $2`,
      [this.consumerKey, event.id],
    )) as InboxRow[];
    const inbox = inboxRows[0];
    if (inbox !== undefined) {
      if (inbox.event_digest !== event.payload_digest) {
        return this.quarantine(
          runner,
          { outboxMessageId: outbox.id, deliveredEnvelope: outbox.envelope },
          outbox,
          'INBOX_DIGEST_MISMATCH',
          observedAt,
          event,
        );
      }
      return { outcome: 'DEDUPED', delivery };
    }
    await runner.query(
      `INSERT INTO projection_inbox (
        consumer_key, event_id, event_digest, received_at
      ) VALUES ($1,$2,$3,$4)`,
      [this.consumerKey, event.id, event.payload_digest, observedAt],
    );
    return { outcome: 'APPLIED', delivery };
  }

  private validateCompanyScopedDenial(
    event: EventRow,
    payload: Record<string, unknown>,
    decision: PolicyEvidenceRow,
  ): void {
    const binding = asRecord(decision.binding);
    if (
      event.run_sequence !== null ||
      decision.result !== 'DENY' ||
      payload.result !== 'DENY' ||
      decision.maximum_uses !== 0 ||
      decision.expires_at !== null ||
      decision.run_id !== null ||
      decision.gate_instance_id !== null ||
      decision.artifact_id !== null ||
      decision.artifact_version_id !== null ||
      binding === null ||
      !hasExactKeys(binding, [
        'actor_type',
        'actor_version',
        'company_id',
        'action_class',
        'resource_class',
        'supplied_reference_digest',
      ]) ||
      binding.company_id !== event.company_id ||
      payload.action_class !== binding.action_class ||
      payload.resource_class !== binding.resource_class ||
      payload.supplied_reference_digest !== binding.supplied_reference_digest ||
      typeof binding.supplied_reference_digest !== 'string' ||
      !/^[0-9a-f]{64}$/.test(binding.supplied_reference_digest) ||
      'run_id' in binding ||
      'task_id' in binding ||
      'attempt_id' in binding
    ) {
      throw new ValidationFailure('PAYLOAD_SCHEMA_INVALID');
    }
  }

  private async quarantine(
    runner: QueryRunner,
    candidate: ConsumerDelivery,
    outbox: OutboxRow | null,
    reason: ConsumerQuarantineReason,
    observedAt: string,
    event?: EventRow,
  ): Promise<Extract<ConsumerProbeResult, { outcome: 'QUARANTINED' }>> {
    const claimedEventId = event?.id ?? claimedString(candidate.deliveredEnvelope, 'event_id');
    const suppliedMessageDigest = safeDigest({
      outbox_message_id: candidate.outboxMessageId,
      delivered_envelope:
        candidate.deliveredEnvelope === undefined
          ? { source: 'AUTHORITATIVE_OUTBOX' }
          : candidate.deliveredEnvelope,
    });
    await runner.query(
      `INSERT INTO consumer_quarantine (
        id, consumer_key, claimed_outbox_message_id, claimed_event_id,
        company_id, run_id, reason_code, supplied_message_digest, observed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (consumer_key, supplied_message_digest, reason_code) DO NOTHING`,
      [
        newId(),
        this.consumerKey,
        isUuid(candidate.outboxMessageId) ? candidate.outboxMessageId : null,
        claimedEventId,
        outbox?.company_id ?? null,
        event?.run_id ?? null,
        reason,
        suppliedMessageDigest,
        observedAt,
      ],
    );
    return {
      outcome: 'QUARANTINED',
      consumerKey: this.consumerKey,
      outboxMessageId: candidate.outboxMessageId,
      eventId: claimedEventId,
      acknowledged: false,
      reason,
    };
  }

  private async acknowledge(delivery: ValidatedDelivery, observedAt: string): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction('READ COMMITTED');
    try {
      await setProofSearchPath(runner, this.schemaName);
      await runner.query(
        `INSERT INTO consumer_outbox_acknowledgements (
          consumer_key, outbox_message_id, event_id, acknowledged_at
        ) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [this.consumerKey, delivery.outbox.id, delivery.event.id, observedAt],
      );
      await runner.query(
        `UPDATE outbox_messages SET published_at = COALESCE(published_at, $1)
         WHERE id = $2 AND event_id = $3`,
        [observedAt, delivery.outbox.id, delivery.event.id],
      );
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
}

export async function consumeOutboxMessage(
  dataSource: DataSource,
  schemaName: string,
  delivery: ConsumerDelivery,
  options: ConsumerProbeOptions = {},
): Promise<ConsumerProbeResult> {
  return new Gate01OutboxConsumerProbe(dataSource, schemaName, options.consumerKey).consume(
    delivery,
    options,
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function safeDigest(value: unknown): string {
  try {
    return canonicalDigest(value ?? { value: null });
  } catch {
    return canonicalDigest({ value: 'UNSERIALIZABLE' });
  }
}

function claimedString(value: unknown, key: string): string | null {
  const record = asRecord(value);
  const candidate = record?.[key];
  return typeof candidate === 'string' && isUuid(candidate) ? candidate : null;
}

function sameInstant(left: unknown, right: Date | string): boolean {
  if (typeof left !== 'string') {
    return false;
  }
  const leftEpoch = Date.parse(left);
  const rightEpoch = new Date(right).getTime();
  return Number.isFinite(leftEpoch) && leftEpoch === rightEpoch;
}

function normalizeInstant(value: string): string {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) {
    throw new TypeError('observedAt must be an RFC 3339 timestamp');
  }
  return new Date(epoch).toISOString();
}

async function runCli(): Promise<void> {
  const databaseUrl = process.env.AICO_PROOF_DATABASE_URL;
  const schemaName = process.env.AICO_PROOF_SCHEMA;
  const outboxMessageId = process.env.AICO_PROOF_OUTBOX_MESSAGE_ID;
  if (!databaseUrl || !schemaName || !outboxMessageId) {
    throw new Error(
      'AICO_PROOF_DATABASE_URL, AICO_PROOF_SCHEMA, and AICO_PROOF_OUTBOX_MESSAGE_ID are required',
    );
  }
  const deliveredEnvelopeText = process.env.AICO_PROOF_DELIVERED_ENVELOPE;
  const deliveredEnvelope =
    deliveredEnvelopeText === undefined
      ? undefined
      : (JSON.parse(deliveredEnvelopeText) as unknown);
  const dataSource = new DataSource({ type: 'postgres', url: databaseUrl });
  await dataSource.initialize();
  try {
    const result = await consumeOutboxMessage(
      dataSource,
      schemaName,
      { outboxMessageId, deliveredEnvelope },
      {
        consumerKey: process.env.AICO_PROOF_CONSUMER_KEY,
        observedAt: process.env.AICO_PROOF_CONSUMER_TIME,
        crashAfterProjectionCommit: process.env.AICO_PROOF_CRASH_AFTER_COMMIT === 'true',
      },
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await dataSource.destroy();
  }
}

if (require.main === module) {
  void runCli().catch((error: unknown) => {
    if (error instanceof ConsumerCrashAfterCommitError) {
      process.stderr.write('CONSUMER_CRASH_AFTER_PROJECTION_COMMIT\n');
      process.exitCode = CONSUMER_CRASH_EXIT_CODE;
      return;
    }
    const code = error instanceof Error ? error.name : 'ConsumerProbeError';
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
