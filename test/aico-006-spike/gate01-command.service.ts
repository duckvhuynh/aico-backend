import { canonicalDigest, isUuid, newId } from '../../src/common/domain/identifiers';
import {
  approvalReferencesDigest,
  contractDigest,
  decisionBusinessDigest,
  policyInputDigest,
  type ActorType,
  type AllowBindingV1,
  type DecisionCommandV1,
  type DecisionReceiptV1,
  type DenyPolicyDecisionV1,
  type DenyReasonCode,
  type PolicyDecisionV1,
  type PolicyInputV1,
  type Rfc3339Utc,
} from './contracts';
import type { PolicyDecisionPort, PolicyEvaluationClock } from './policy-decision.port';
import {
  Gate01ProofError,
  PostgresDecisionUnitOfWork,
  type DecisionWorkContext,
  type FounderAuthorityInput,
} from './postgres-decision-unit-of-work';

export interface Gate01CommandRequest {
  authority: FounderAuthorityInput;
  idempotencyKey: string;
  correlationId: string;
  ifMatch: number;
  command: DecisionCommandV1;
}

export interface RedactedDenialRequest {
  request: Gate01CommandRequest;
  actorType: Exclude<ActorType, 'FOUNDER'>;
  actorVersion: string;
  reasonCode: DenyReasonCode;
  resourceClass: string;
  suppliedReference: string;
}

interface Gate01StateRow {
  run_id: string;
  state: string;
  stage: PolicyInputV1['run']['stage'];
  run_row_version: number;
  workflow_version: string;
  targeting_version_id: string;
  employee_definition_version: string;
  environment_digest: string;
  budget_digest: string;
  parameter_digest: string;
  operator_kill_version: number;
  cancellation_requested_at: Date | string | null;
  gate_instance_id: string;
  gate_status: PolicyInputV1['gate'] extends infer T
    ? T extends null
      ? never
      : T extends { gate_instance_status: infer S }
        ? S
        : never
    : never;
  gate_row_version: number;
  artifact_id: string;
  artifact_version_id: string;
  artifact_version: number;
  artifact_checksum: string;
  content_digest: string;
  policy_version_id: string;
  policy_version: string;
  policy_digest: string;
  targeting_status: PolicyInputV1['policy']['targeting_state'];
  targeted_workflow_version: string;
  targeted_employee_definition_version: string;
  targeted_environment_digest: string;
  targeted_budget_digest: string;
}

interface RunTargetRow {
  targeting_version_id: string;
}

interface Gate01DeniedOutcome {
  outcome: 'DENY';
  reasonCode: string;
  policyDecisionId: string;
  eventId: string;
}

interface Gate01AllowedOutcome {
  outcome: 'ALLOW';
  receipt: DecisionReceiptV1;
}

type Gate01Outcome = Gate01DeniedOutcome | Gate01AllowedOutcome;

export class Gate01CommandService {
  constructor(
    private readonly unitOfWork: PostgresDecisionUnitOfWork,
    private readonly policyDecision: PolicyDecisionPort,
    private readonly clock: PolicyEvaluationClock,
  ) {}

  async execute(request: Gate01CommandRequest): Promise<DecisionReceiptV1> {
    this.assertCommandEnvelope(request);
    if (request.ifMatch !== request.command.expected.run_row_version) {
      throw new Gate01ProofError('PRECONDITION_FAILED', 412);
    }
    const requestDigest = decisionBusinessDigest(request.command, request.ifMatch);
    const result = await this.unitOfWork.execute<Gate01Outcome>(
      request.authority,
      {
        idempotencyKey: request.idempotencyKey,
        requestDigest,
        correlationId: request.correlationId,
      },
      async (context) => this.decide(context, request),
    );
    if (result.body.outcome === 'DENY') {
      throw new Gate01DeniedError(
        result.body.reasonCode,
        result.body.policyDecisionId,
        result.body.eventId,
      );
    }
    return { ...result.body.receipt, replayed: result.replayed };
  }

  async executeRedactedDenial(input: RedactedDenialRequest): Promise<never> {
    this.assertCommandEnvelope(input.request);
    const requestDigest = decisionBusinessDigest(input.request.command, input.request.ifMatch);
    const result = await this.unitOfWork.execute<Gate01Outcome>(
      input.request.authority,
      {
        idempotencyKey: input.request.idempotencyKey,
        requestDigest,
        correlationId: input.request.correlationId,
      },
      async (context) => {
        const targets = (await context.runner.query(
          `SELECT p.id, p.policy_version_id, p.policy_version, p.policy_digest
           FROM policy_targets t
           JOIN policy_targeting_versions p
             ON p.company_id=t.company_id AND p.id=t.active_targeting_version_id
           WHERE t.company_id=$1 AND t.target_key='GATE-01'
           FOR UPDATE OF t,p`,
          [context.authority.companyId],
        )) as Array<{
          id: string;
          policy_version_id: string;
          policy_version: string;
          policy_digest: string;
        }>;
        const target = targets[0];
        if (!target) throw new Gate01ProofError('AUTHORITY_FORBIDDEN', 403);
        const decidedAt = this.clock.now();
        const decisionId = newId();
        const decision: DenyPolicyDecisionV1 = {
          meta: {
            schema_version: 1,
            message_id: decisionId,
            correlation_id: context.correlationId,
            causation_id: input.request.command.command_id,
            occurred_at: decidedAt,
          },
          policy_decision_schema: 'policy-decision/v1',
          policy_decision_id: decisionId,
          policy_request_id: newId(),
          policy_input_digest: requestDigest,
          policy_version_id: target.policy_version_id,
          policy_version: target.policy_version,
          policy_digest: target.policy_digest,
          policy_targeting_version_id: target.id,
          effect: 'DENY',
          reason_code: input.reasonCode,
          binding: {
            actor_type: input.actorType,
            actor_version: input.actorVersion,
            company_id: context.authority.companyId,
            action_class: 'DECIDE_GATE_01',
            resource_class: input.resourceClass,
            supplied_reference_digest: canonicalDigest({
              company_id: context.authority.companyId,
              supplied_reference: input.suppliedReference,
            }),
          },
          issued_at: decidedAt,
          expires_at: null,
          maximum_uses: 0,
        };
        await this.insertPolicyDecision(context, input.request, decision);
        const eventId = await this.appendCompanyPolicyEvent(context, input.request, decision);
        return {
          status: 403,
          body: {
            outcome: 'DENY',
            reasonCode: decision.reason_code,
            policyDecisionId: decision.policy_decision_id,
            eventId,
          },
        };
      },
    );
    if (result.body.outcome !== 'DENY') {
      throw new Gate01ProofError('INVALID_CONTEXT', 400);
    }
    throw new Gate01DeniedError(
      result.body.reasonCode,
      result.body.policyDecisionId,
      result.body.eventId,
    );
  }

  private async decide(
    context: DecisionWorkContext,
    request: Gate01CommandRequest,
  ): Promise<{ status: number; body: Gate01Outcome }> {
    const state = await this.lockGate01State(context, request);
    const evaluationTime = this.clock.now();
    const policyInput = this.buildPolicyInput(context, request, state, evaluationTime);
    let policyDecision = this.policyDecision.evaluate(policyInput);

    if (policyDecision.effect === 'ALLOW' && !this.matchesExactGate01(request, state)) {
      policyDecision = this.policyDecision.evaluate({
        ...policyInput,
        resource: {
          ...policyInput.resource,
          version:
            request.command.expected.gate_instance_row_version === state.gate_row_version
              ? state.gate_row_version + 1
              : request.command.expected.gate_instance_row_version,
        },
        gate: {
          ...policyInput.gate!,
          gate_instance_row_version: state.gate_row_version,
        },
      });
    }

    if (
      policyDecision.effect === 'ALLOW' &&
      !this.matchesCompleteAllowBinding(policyDecision, policyInput, context.requestDigest)
    ) {
      policyDecision = this.invalidAllowDenial(policyDecision, state);
    }

    if (
      policyDecision.effect === 'ALLOW' &&
      Date.parse(policyDecision.expires_at) <= Date.parse(this.clock.now())
    ) {
      policyDecision = this.expiredDenial(policyDecision, state);
    }

    await this.insertPolicyDecision(context, request, policyDecision);
    await context.failpoint('AFTER_POLICY_DECISION');
    const policyEventId = await this.appendEvent(
      context,
      request.command.run_id,
      'policy.decided',
      policyDecision.policy_decision_id,
      request.command.command_id,
      {
        policy_decision_id: policyDecision.policy_decision_id,
        result: policyDecision.effect,
        reason_code: policyDecision.reason_code,
      },
      'AFTER_POLICY_EVENT',
      'AFTER_POLICY_OUTBOX',
    );

    if (policyDecision.effect === 'DENY') {
      return {
        status: 403,
        body: {
          outcome: 'DENY',
          reasonCode: policyDecision.reason_code,
          policyDecisionId: policyDecision.policy_decision_id,
          eventId: policyEventId,
        },
      };
    }
    if (!this.matchesExactGate01(request, state)) {
      throw new Gate01ProofError('INVALID_CONTEXT', 400);
    }
    const decidedAt = policyDecision.issued_at;
    const decisionRecordId = newId();
    await context.runner.query(
      `INSERT INTO founder_gate_decisions (
        id, company_id, run_id, gate_instance_id, artifact_id,
        artifact_version_id, policy_decision_id, founder_id, command_id,
        decision, feedback, feedback_digest, feedback_classification,
        approval_references_digest, decided_at, correlation_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        decisionRecordId,
        context.authority.companyId,
        state.run_id,
        state.gate_instance_id,
        state.artifact_id,
        state.artifact_version_id,
        policyDecision.policy_decision_id,
        context.authority.founderId,
        request.command.command_id,
        request.command.decision.type,
        request.command.decision.feedback?.trim() ?? null,
        request.command.decision.feedback === null
          ? null
          : canonicalDigest({
              classification: 'CONFIDENTIAL_FOUNDER_INPUT',
              value: request.command.decision.feedback.trim(),
            }),
        request.command.decision.feedback === null ? null : 'CONFIDENTIAL_FOUNDER_INPUT',
        approvalReferencesDigest(policyInput.approval_references),
        decidedAt,
        context.correlationId,
      ],
    );
    await context.failpoint('AFTER_FOUNDER_DECISION');

    const approve = request.command.decision.type === 'APPROVE';
    const gateStatus = approve ? 'APPROVED' : 'REVISION_REQUESTED';
    const resultingRunState = approve ? 'DESIGNING' : 'QUALIFYING';
    const resultingRunStage = approve ? 'DESIGN' : 'PRODUCT';
    const continuationKind = approve ? 'START_DESIGN_FROM_BRIEF' : 'REVISE_PRODUCT_BRIEF';
    const updatedGates = (await context.runner.query(
      `WITH updated AS (
         UPDATE gate_instances
         SET status = $1, row_version = row_version + 1, decided_at = $2
         WHERE company_id = $3 AND run_id = $4 AND id = $5
           AND status = 'PENDING' AND row_version = $6
         RETURNING row_version
       ) SELECT row_version FROM updated`,
      [
        gateStatus,
        decidedAt,
        context.authority.companyId,
        state.run_id,
        state.gate_instance_id,
        state.gate_row_version,
      ],
    )) as Array<{ row_version: number }>;
    if (updatedGates[0]?.row_version === undefined) {
      throw new Gate01ProofError('INVALID_CONTEXT', 409);
    }
    const updatedRuns = (await context.runner.query(
      `WITH updated AS (
         UPDATE runs
         SET state = $1, stage = $2, row_version = row_version + 1,
             updated_at = $3
         WHERE company_id = $4 AND id = $5
           AND state = 'AWAITING_BRIEF_APPROVAL' AND stage = 'PRODUCT'
           AND row_version = $6 AND cancellation_requested_at IS NULL
         RETURNING row_version
       ) SELECT row_version FROM updated`,
      [
        resultingRunState,
        resultingRunStage,
        decidedAt,
        context.authority.companyId,
        state.run_id,
        state.run_row_version,
      ],
    )) as Array<{ row_version: number }>;
    const resultingRunRowVersion = updatedRuns[0]?.row_version;
    if (resultingRunRowVersion === undefined) {
      throw new Gate01ProofError('INVALID_CONTEXT', 409);
    }
    await context.failpoint('AFTER_GATE_TRANSITION');

    let bindingId: string | null = null;
    if (approve) {
      bindingId = newId();
      await context.runner.query(
        `INSERT INTO approved_artifact_bindings (
          id, company_id, run_id, gate_instance_id, artifact_id,
          artifact_version_id, decision_record_id, policy_decision_id,
          checksum, bound_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          bindingId,
          context.authority.companyId,
          state.run_id,
          state.gate_instance_id,
          state.artifact_id,
          state.artifact_version_id,
          decisionRecordId,
          policyDecision.policy_decision_id,
          state.artifact_checksum,
          decidedAt,
        ],
      );
      await context.failpoint('AFTER_APPROVED_BINDING');
    }

    const continuationIntentId = newId();
    await context.runner.query(
      `INSERT INTO continuation_intents (
        id, company_id, run_id, decision_record_id, policy_decision_id,
        kind, logical_key, source_artifact_version_id, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        continuationIntentId,
        context.authority.companyId,
        state.run_id,
        decisionRecordId,
        policyDecision.policy_decision_id,
        continuationKind,
        `GATE-01:${state.gate_instance_id}:${request.command.decision.type}`,
        state.artifact_version_id,
        decidedAt,
      ],
    );
    await context.failpoint('AFTER_CONTINUATION');

    const approvalEventId = await this.appendEvent(
      context,
      state.run_id,
      'approval.decided',
      decisionRecordId,
      policyEventId,
      {
        decision_record_id: decisionRecordId,
        policy_decision_id: policyDecision.policy_decision_id,
        decision: request.command.decision.type,
        gate: 'GATE-01',
        gate_instance_id: state.gate_instance_id,
        artifact_version_id: state.artifact_version_id,
        resulting_run_state: resultingRunState,
        continuation_intent_id: continuationIntentId,
      },
      'AFTER_APPROVAL_EVENT',
      'AFTER_APPROVAL_OUTBOX',
    );

    return {
      status: 200,
      body: {
        outcome: 'ALLOW',
        receipt: {
          receipt_schema: 'founder-decision-receipt/v1',
          command_id: request.command.command_id,
          decision_record_id: decisionRecordId,
          policy_decision_id: policyDecision.policy_decision_id,
          event_id: approvalEventId,
          company_id: context.authority.companyId,
          run_id: state.run_id,
          gate: 'GATE-01',
          gate_instance_id: state.gate_instance_id,
          resulting_gate_instance_status: gateStatus,
          artifact_version_id: state.artifact_version_id,
          artifact_version: state.artifact_version,
          artifact_checksum: state.artifact_checksum,
          decision: request.command.decision.type,
          prior_run_state: 'AWAITING_BRIEF_APPROVAL',
          resulting_run_state: resultingRunState,
          resulting_run_stage: resultingRunStage,
          resulting_run_row_version: resultingRunRowVersion,
          approved_artifact_binding_id: bindingId,
          continuation: {
            kind: continuationKind,
            continuation_intent_id: continuationIntentId,
          },
          decided_at: decidedAt,
          correlation_id: context.correlationId,
          replayed: false,
        },
      },
    };
  }

  private async lockGate01State(
    context: DecisionWorkContext,
    request: Gate01CommandRequest,
  ): Promise<Gate01StateRow> {
    const runTargets = (await context.runner.query(
      `SELECT targeting_version_id FROM runs
       WHERE company_id = $1 AND id = $2`,
      [context.authority.companyId, request.command.run_id],
    )) as RunTargetRow[];
    const runTarget = runTargets[0];
    if (runTarget === undefined) {
      throw new Gate01ProofError('AUTHORITY_FORBIDDEN', 403);
    }
    await context.runner.query(
      `SELECT company_id FROM policy_targets
       WHERE company_id = $1 AND target_key = 'GATE-01' FOR UPDATE`,
      [context.authority.companyId],
    );
    await context.runner.query(
      `SELECT id FROM policy_targeting_versions
       WHERE company_id = $1 AND id = $2 FOR UPDATE`,
      [context.authority.companyId, runTarget.targeting_version_id],
    );
    await context.runner.query(`SELECT id FROM runs WHERE company_id = $1 AND id = $2 FOR UPDATE`, [
      context.authority.companyId,
      request.command.run_id,
    ]);
    await context.runner.query(
      `SELECT id FROM artifact_versions
       WHERE company_id = $1 AND run_id = $2 AND id = $3 FOR UPDATE`,
      [
        context.authority.companyId,
        request.command.run_id,
        request.command.expected.artifact_version_id,
      ],
    );
    await context.runner.query(
      `SELECT id FROM gate_instances
       WHERE company_id = $1 AND run_id = $2 AND id = $3 FOR UPDATE`,
      [
        context.authority.companyId,
        request.command.run_id,
        request.command.expected.gate_instance_id,
      ],
    );

    const rows = (await context.runner.query(
      `SELECT
        r.id AS run_id, r.state, r.stage, r.row_version AS run_row_version,
        r.workflow_version, r.targeting_version_id,
        r.employee_definition_version, r.environment_digest, r.budget_digest,
        r.parameter_digest, r.operator_kill_version, r.cancellation_requested_at,
        g.id AS gate_instance_id, g.status AS gate_status,
        g.row_version AS gate_row_version, g.artifact_id,
        g.artifact_version_id, g.artifact_version, g.artifact_checksum,
        av.content_digest, p.policy_version_id, p.policy_version,
        p.policy_digest, p.status AS targeting_status,
        p.workflow_version AS targeted_workflow_version,
        p.employee_definition_version AS targeted_employee_definition_version,
        p.environment_digest AS targeted_environment_digest,
        p.budget_digest AS targeted_budget_digest
       FROM runs r
       JOIN gate_instances g ON g.company_id = r.company_id AND g.run_id = r.id
       JOIN artifact_versions av ON av.company_id = g.company_id
         AND av.run_id = g.run_id AND av.artifact_id = g.artifact_id
         AND av.id = g.artifact_version_id
       JOIN policy_targeting_versions p ON p.company_id = r.company_id
         AND p.id = r.targeting_version_id
       WHERE r.company_id = $1 AND r.id = $2 AND g.id = $3`,
      [
        context.authority.companyId,
        request.command.run_id,
        request.command.expected.gate_instance_id,
      ],
    )) as Gate01StateRow[];
    const state = rows[0];
    if (state === undefined) {
      throw new Gate01ProofError('AUTHORITY_FORBIDDEN', 403);
    }
    return state;
  }

  private buildPolicyInput(
    context: DecisionWorkContext,
    request: Gate01CommandRequest,
    state: Gate01StateRow,
    now: Rfc3339Utc,
  ): PolicyInputV1 {
    const action =
      request.command.decision.type === 'APPROVE'
        ? 'gate.gate-01.approve/v1'
        : 'gate.gate-01.request-revision/v1';
    return {
      meta: {
        schema_version: 1,
        message_id: newId(),
        correlation_id: context.correlationId,
        causation_id: request.command.command_id,
        occurred_at: now,
      },
      policy_input_schema: 'policy-input/v1',
      policy_request_id: newId(),
      evaluation_time: now,
      policy: {
        version_id: state.policy_version_id,
        semantic_version: state.policy_version,
        digest: state.policy_digest,
        targeting_version_id: state.targeting_version_id,
        targeting_state: state.targeting_status,
      },
      actor: {
        type: 'FOUNDER',
        id: context.authority.founderId,
        version: String(context.authority.founderAuthorityVersion),
        authentication_context_id: context.authority.sessionId,
        authenticated_at: request.authority.authenticatedAt.toISOString(),
        authentication_strength: 'PROOF_SESSION',
        revocation_version: context.authority.sessionVersion,
      },
      company: {
        id: context.authority.companyId,
        status: 'ACTIVE',
        founder_id: context.authority.founderId,
      },
      run: {
        id: state.run_id,
        state: state.state,
        stage: state.stage,
        row_version: state.run_row_version,
        workflow_version: state.workflow_version,
        policy_version: state.policy_version,
        cancellation_requested_at:
          state.cancellation_requested_at === null
            ? null
            : new Date(state.cancellation_requested_at).toISOString(),
        operator_kill_version: state.operator_kill_version,
      },
      task: null,
      attempt: null,
      action: { key: action, parameters_digest: context.requestDigest },
      resource: {
        type: 'GATE_INSTANCE',
        id: request.command.expected.gate_instance_id,
        version: request.command.expected.gate_instance_row_version,
        company_id: context.authority.companyId,
        run_id: request.command.run_id,
        digest: canonicalDigest({
          gate: 'GATE-01',
          gate_instance_id: state.gate_instance_id,
          gate_instance_row_version: state.gate_row_version,
          artifact_id: state.artifact_id,
          artifact_version_id: state.artifact_version_id,
          artifact_version: state.artifact_version,
          artifact_checksum: state.artifact_checksum,
          content_digest: state.content_digest,
        }),
      },
      gate: {
        id: 'GATE-01',
        gate_instance_id: state.gate_instance_id,
        gate_instance_status: state.gate_status,
        gate_instance_row_version: state.gate_row_version,
        artifact_id: state.artifact_id,
        artifact_version_id: state.artifact_version_id,
        artifact_version: state.artifact_version,
        artifact_checksum: state.artifact_checksum,
      },
      approval_references: [],
      budget: {
        applicability: 'NOT_APPLICABLE',
        policy_version: state.policy_version,
        snapshot_digest: state.budget_digest,
      },
      environment: {
        application_version: 'aico-006-proof/v1',
        deployment_environment: 'TEST',
        provider: null,
        tool_key: null,
        tool_version: null,
        network_mode: null,
        digest: canonicalDigest({
          environment_digest: state.environment_digest,
          employee_definition_version: state.employee_definition_version,
        }),
      },
    };
  }

  private async insertPolicyDecision(
    context: DecisionWorkContext,
    request: Gate01CommandRequest,
    decision: PolicyDecisionV1,
  ): Promise<void> {
    const maximumUses = decision.effect === 'ALLOW' ? decision.binding.maximum_uses : 0;
    await context.runner.query(
      `INSERT INTO policy_decisions (
        id, decision_schema, result, reason_code, company_id, founder_id,
        session_id, command_id, action, run_id, gate_instance_id, artifact_id,
        artifact_version_id, policy_input_digest, policy_version,
        targeting_version_id, binding, issued_at, expires_at, maximum_uses,
        correlation_id
      ) VALUES ($1,'policy-decision/v1',$2,$3,$4,$5,$6,$7,'DECIDE_GATE_01',
        $8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19)`,
      [
        decision.policy_decision_id,
        decision.effect,
        decision.reason_code,
        context.authority.companyId,
        context.authority.founderId,
        context.authority.sessionId,
        request.command.command_id,
        decision.binding.run_id ?? null,
        decision.effect === 'ALLOW' ? decision.binding.gate_instance_id : null,
        decision.effect === 'ALLOW' ? request.command.expected.artifact_id : null,
        decision.effect === 'ALLOW' ? decision.binding.artifact_version_id : null,
        decision.policy_input_digest,
        decision.policy_version,
        decision.policy_targeting_version_id,
        JSON.stringify(decision.binding),
        decision.issued_at,
        decision.expires_at,
        maximumUses,
        context.correlationId,
      ],
    );
  }

  private expiredDenial(
    decision: Extract<PolicyDecisionV1, { effect: 'ALLOW' }>,
    state: Gate01StateRow,
  ): DenyPolicyDecisionV1 {
    return {
      meta: decision.meta,
      policy_decision_schema: decision.policy_decision_schema,
      policy_decision_id: decision.policy_decision_id,
      policy_request_id: decision.policy_request_id,
      policy_input_digest: decision.policy_input_digest,
      policy_version_id: decision.policy_version_id,
      policy_version: decision.policy_version,
      policy_digest: decision.policy_digest,
      policy_targeting_version_id: decision.policy_targeting_version_id,
      effect: 'DENY',
      reason_code: 'ALLOW_EXPIRED',
      binding: {
        actor_type: decision.binding.actor_type,
        actor_version: decision.binding.actor_version,
        company_id: decision.binding.company_id,
        action_class: decision.binding.action,
        resource_class: decision.binding.resource_type,
        supplied_reference_digest: canonicalDigest({
          run_id: state.run_id,
          gate_instance_id: state.gate_instance_id,
          artifact_version_id: state.artifact_version_id,
        }),
        run_id: state.run_id,
      },
      issued_at: decision.issued_at,
      expires_at: null,
      maximum_uses: 0,
    };
  }

  private invalidAllowDenial(
    decision: Extract<PolicyDecisionV1, { effect: 'ALLOW' }>,
    state: Gate01StateRow,
  ): DenyPolicyDecisionV1 {
    return {
      ...this.expiredDenial(decision, state),
      reason_code: 'INVALID_CONTEXT',
    };
  }

  private matchesCompleteAllowBinding(
    decision: Extract<PolicyDecisionV1, { effect: 'ALLOW' }>,
    input: PolicyInputV1,
    requestDigest: string,
  ): boolean {
    const expected: AllowBindingV1 = {
      actor_type: input.actor.type,
      actor_id: input.actor.id,
      actor_version: input.actor.version as string,
      company_id: input.company.id,
      run_id: input.run.id,
      task_id: null,
      attempt_id: null,
      action: input.action.key,
      parameters_digest: requestDigest,
      resource_type: input.resource.type,
      resource_id: input.resource.id,
      resource_version: input.resource.version,
      resource_digest: input.resource.digest,
      run_state: input.run.state,
      run_stage: input.run.stage,
      run_row_version: input.run.row_version,
      task_state: null,
      gate: input.gate?.id ?? null,
      gate_instance_id: input.gate?.gate_instance_id ?? null,
      gate_instance_row_version: input.gate?.gate_instance_row_version ?? null,
      artifact_version_id: input.gate?.artifact_version_id ?? null,
      approval_references_digest: approvalReferencesDigest(input.approval_references),
      budget_digest: input.budget.snapshot_digest,
      environment_digest: input.environment.digest,
      workflow_version: input.run.workflow_version,
      policy_targeting_version_id: input.policy.targeting_version_id,
      maximum_uses: 1,
    };
    return (
      decision.reason_code === 'ACTION_ALLOWED' &&
      decision.policy_input_digest === policyInputDigest(input) &&
      decision.policy_version_id === input.policy.version_id &&
      decision.policy_version === input.policy.semantic_version &&
      decision.policy_digest === input.policy.digest &&
      decision.policy_targeting_version_id === input.policy.targeting_version_id &&
      Date.parse(decision.expires_at) > Date.parse(decision.issued_at) &&
      contractDigest(decision.binding) === contractDigest(expected)
    );
  }

  private async appendEvent(
    context: DecisionWorkContext,
    runId: string,
    eventType: 'policy.decided' | 'approval.decided',
    aggregateId: string,
    causationId: string,
    payload: object,
    eventFailpoint: 'AFTER_POLICY_EVENT' | 'AFTER_APPROVAL_EVENT',
    outboxFailpoint: 'AFTER_POLICY_OUTBOX' | 'AFTER_APPROVAL_OUTBOX',
  ): Promise<string> {
    const counters = (await context.runner.query(
      `WITH allocated AS (
         INSERT INTO run_event_counters (company_id, run_id, next_sequence)
         VALUES ($1, $2, 2)
         ON CONFLICT (company_id, run_id) DO UPDATE
         SET next_sequence = run_event_counters.next_sequence + 1
         RETURNING next_sequence - 1 AS sequence
       ) SELECT sequence FROM allocated`,
      [context.authority.companyId, runId],
    )) as Array<{ sequence: string | number }>;
    const sequence = Number(counters[0]?.sequence);
    const eventId = newId();
    const occurredAt = this.clock.now();
    const eventPayload = { schema_version: 1, ...payload };
    await context.runner.query(
      `INSERT INTO domain_events (
        id, event_schema, event_type, company_id, run_id, run_sequence,
        aggregate_type, aggregate_id, actor_founder_id, correlation_id,
        causation_id, occurred_at, payload, payload_digest
      ) VALUES ($1,'domain-event/v1',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
      [
        eventId,
        eventType,
        context.authority.companyId,
        runId,
        sequence,
        eventType === 'policy.decided' ? 'PolicyDecision' : 'GateInstance',
        aggregateId,
        context.authority.founderId,
        context.correlationId,
        causationId,
        occurredAt,
        JSON.stringify(eventPayload),
        canonicalDigest(eventPayload),
      ],
    );
    await context.failpoint(eventFailpoint);
    const envelope = {
      schema_version: 1,
      event_id: eventId,
      event_type: eventType,
      company_id: context.authority.companyId,
      run_id: runId,
      run_sequence: sequence,
      correlation_id: context.correlationId,
      causation_id: causationId,
      occurred_at: occurredAt,
      payload: eventPayload,
    };
    await context.runner.query(
      `INSERT INTO outbox_messages (
        id, company_id, event_id, topic, envelope, envelope_digest, created_at
      ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
      [
        newId(),
        context.authority.companyId,
        eventId,
        eventType,
        JSON.stringify(envelope),
        canonicalDigest(envelope),
        occurredAt,
      ],
    );
    await context.failpoint(outboxFailpoint);
    return eventId;
  }

  private async appendCompanyPolicyEvent(
    context: DecisionWorkContext,
    request: Gate01CommandRequest,
    decision: DenyPolicyDecisionV1,
  ): Promise<string> {
    const eventId = newId();
    const occurredAt = this.clock.now();
    const payload = {
      schema_version: 1,
      policy_decision_id: decision.policy_decision_id,
      result: 'DENY',
      reason_code: decision.reason_code,
      action_class: decision.binding.action_class,
      resource_class: decision.binding.resource_class,
      supplied_reference_digest: decision.binding.supplied_reference_digest,
    };
    await context.runner.query(
      `INSERT INTO domain_events (
        id,event_schema,event_type,company_id,run_id,run_sequence,
        aggregate_type,aggregate_id,actor_founder_id,correlation_id,
        causation_id,occurred_at,payload,payload_digest
      ) VALUES ($1,'domain-event/v1','policy.decided',$2,NULL,NULL,
        'PolicyDecision',$3,$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        eventId,
        context.authority.companyId,
        decision.policy_decision_id,
        context.authority.founderId,
        context.correlationId,
        request.command.command_id,
        occurredAt,
        JSON.stringify(payload),
        canonicalDigest(payload),
      ],
    );
    const envelope = {
      schema_version: 1,
      event_id: eventId,
      event_type: 'policy.decided',
      company_id: context.authority.companyId,
      run_id: null,
      run_sequence: null,
      correlation_id: context.correlationId,
      causation_id: request.command.command_id,
      occurred_at: occurredAt,
      payload,
    };
    await context.runner.query(
      `INSERT INTO outbox_messages (
        id,company_id,event_id,topic,envelope,envelope_digest,created_at
      ) VALUES ($1,$2,$3,'policy.decided',$4::jsonb,$5,$6)`,
      [
        newId(),
        context.authority.companyId,
        eventId,
        JSON.stringify(envelope),
        canonicalDigest(envelope),
        occurredAt,
      ],
    );
    return eventId;
  }

  private matchesExactGate01(request: Gate01CommandRequest, state: Gate01StateRow): boolean {
    const expected = request.command.expected;
    return (
      request.ifMatch === expected.run_row_version &&
      expected.run_state === 'AWAITING_BRIEF_APPROVAL' &&
      expected.run_stage === 'PRODUCT' &&
      expected.gate === 'GATE-01' &&
      state.state === expected.run_state &&
      state.stage === expected.run_stage &&
      state.run_row_version === expected.run_row_version &&
      state.gate_instance_id === expected.gate_instance_id &&
      state.gate_status === 'PENDING' &&
      state.gate_row_version === expected.gate_instance_row_version &&
      state.artifact_id === expected.artifact_id &&
      state.artifact_version_id === expected.artifact_version_id &&
      state.artifact_version === expected.artifact_version &&
      state.artifact_checksum === expected.artifact_checksum &&
      state.targeted_workflow_version === state.workflow_version &&
      state.targeted_employee_definition_version === state.employee_definition_version &&
      state.targeted_environment_digest === state.environment_digest &&
      state.targeted_budget_digest === state.budget_digest &&
      state.cancellation_requested_at === null
    );
  }

  private assertCommandEnvelope(request: Gate01CommandRequest): void {
    if (
      request.command.command_schema !== 'founder-decision-command/v1' ||
      request.command.expected.gate !== 'GATE-01' ||
      !isUuid(request.idempotencyKey) ||
      !isUuid(request.correlationId) ||
      !isUuid(request.command.command_id) ||
      !isUuid(request.command.run_id) ||
      !Number.isSafeInteger(request.ifMatch) ||
      request.ifMatch <= 0 ||
      (request.command.decision.type === 'REQUEST_REVISION' &&
        request.command.decision.feedback.trim().length === 0)
    ) {
      throw new Gate01ProofError('INVALID_CONTEXT', 400);
    }
  }
}

export class Gate01DeniedError extends Error {
  constructor(
    public readonly reasonCode: string,
    public readonly policyDecisionId: string,
    public readonly eventId: string,
  ) {
    super(reasonCode);
    this.name = 'Gate01DeniedError';
  }
}
