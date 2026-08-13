import { createHash } from 'node:crypto';

import type { DataSource, QueryRunner } from 'typeorm';

const PROOF_SCHEMA_PATTERN = /^aico006_[a-z0-9_]{8,48}$/;

export function assertProofSchemaName(schemaName: string): void {
  if (!PROOF_SCHEMA_PATTERN.test(schemaName)) {
    throw new Error('AICO-006 proof schema names must match aico006_[a-z0-9_]{8,48}');
  }
}

export function quoteProofSchema(schemaName: string): string {
  assertProofSchemaName(schemaName);
  return `"${schemaName}"`;
}

export function proofRuntimeRole(schemaName: string): string {
  assertProofSchemaName(schemaName);
  return `aico006_runtime_${createHash('sha256').update(schemaName).digest('hex').slice(0, 16)}`;
}

export async function setProofSearchPath(runner: QueryRunner, schemaName: string): Promise<void> {
  await runner.query(`SET LOCAL search_path TO ${quoteProofSchema(schemaName)}, public`);
}

export async function createProofSchema(dataSource: DataSource, schemaName: string): Promise<void> {
  const quotedSchema = quoteProofSchema(schemaName);
  const runtimeRole = proofRuntimeRole(schemaName);
  const quotedRuntimeRole = `"${runtimeRole}"`;
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction('READ COMMITTED');
  try {
    await runner.query(`CREATE SCHEMA ${quotedSchema}`);
    await runner.query(`CREATE ROLE ${quotedRuntimeRole} NOLOGIN`);
    await runner.query(`GRANT ${quotedRuntimeRole} TO CURRENT_USER`);
    await setProofSearchPath(runner, schemaName);
    await runner.query(PROOF_SCHEMA_SQL);
    await runner.query(`GRANT USAGE ON SCHEMA ${quotedSchema} TO ${quotedRuntimeRole}`);
    await runner.query(
      `GRANT SELECT ON ALL TABLES IN SCHEMA ${quotedSchema} TO ${quotedRuntimeRole}`,
    );
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

export async function dropProofSchema(dataSource: DataSource, schemaName: string): Promise<void> {
  const quotedSchema = quoteProofSchema(schemaName);
  const quotedRuntimeRole = `"${proofRuntimeRole(schemaName)}"`;
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    await runner.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
    await runner.query(`DROP ROLE IF EXISTS ${quotedRuntimeRole}`);
  } finally {
    await runner.release();
  }
}

export async function queryProofSchema<T extends object>(
  dataSource: DataSource,
  schemaName: string,
  sql: string,
  parameters: readonly unknown[] = [],
): Promise<T[]> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction('READ COMMITTED');
  try {
    await setProofSearchPath(runner, schemaName);
    const rows = (await runner.query(sql, [...parameters])) as T[];
    await runner.commitTransaction();
    return rows;
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

const PROOF_SCHEMA_SQL = `
CREATE TABLE founders (
  id uuid PRIMARY KEY,
  auth_subject text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
  authority_version integer NOT NULL DEFAULT 1 CHECK (authority_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE founder_sessions (
  id uuid PRIMARY KEY,
  founder_id uuid NOT NULL REFERENCES founders(id),
  auth_subject text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
  expires_at timestamptz NOT NULL,
  session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, founder_id),
  UNIQUE (id, auth_subject)
);

CREATE INDEX founder_sessions_authority_idx
  ON founder_sessions (auth_subject, id, status, expires_at);

CREATE TABLE companies (
  id uuid PRIMARY KEY,
  founder_id uuid NOT NULL REFERENCES founders(id),
  current_founder_id uuid NOT NULL REFERENCES founders(id),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, founder_id)
);

CREATE INDEX companies_founder_authority_idx
  ON companies (current_founder_id, id, status);

CREATE TABLE policy_targeting_versions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  target_key text NOT NULL,
  policy_version_id uuid NOT NULL,
  policy_version text NOT NULL,
  policy_digest text NOT NULL CHECK (policy_digest ~ '^[0-9a-f]{64}$'),
  workflow_version text NOT NULL,
  employee_definition_version text NOT NULL,
  environment_digest text NOT NULL CHECK (environment_digest ~ '^[0-9a-f]{64}$'),
  budget_digest text NOT NULL CHECK (budget_digest ~ '^[0-9a-f]{64}$'),
  parameter_digest text NOT NULL CHECK (parameter_digest ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED', 'DENY_ALL', 'ROLLED_BACK')),
  effective_at timestamptz NOT NULL,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, target_key, policy_version),
  CHECK (retired_at IS NULL OR retired_at > effective_at)
);

CREATE TABLE policy_targets (
  company_id uuid NOT NULL REFERENCES companies(id),
  target_key text NOT NULL,
  active_targeting_version_id uuid NOT NULL,
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  PRIMARY KEY (company_id, target_key),
  FOREIGN KEY (company_id, active_targeting_version_id)
    REFERENCES policy_targeting_versions(company_id, id)
);

CREATE TABLE runs (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  state text NOT NULL CHECK (state IN (
    'DRAFT', 'QUALIFYING', 'AWAITING_FOUNDER_INPUT',
    'AWAITING_BRIEF_APPROVAL', 'DESIGNING', 'AWAITING_DESIGN_APPROVAL',
    'BUILDING', 'REVIEWING', 'REWORKING', 'AWAITING_FINAL_APPROVAL',
    'BLOCKED', 'FAILED', 'CANCELED', 'COMPLETED'
  )),
  stage text NOT NULL CHECK (stage IN ('INTAKE', 'PRODUCT', 'DESIGN', 'BUILD', 'QA', 'FINAL')),
  row_version integer NOT NULL CHECK (row_version > 0),
  workflow_version text NOT NULL,
  targeting_version_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  employee_definition_version text NOT NULL,
  environment_digest text NOT NULL CHECK (environment_digest ~ '^[0-9a-f]{64}$'),
  budget_digest text NOT NULL CHECK (budget_digest ~ '^[0-9a-f]{64}$'),
  parameter_digest text NOT NULL CHECK (parameter_digest ~ '^[0-9a-f]{64}$'),
  operator_kill_version integer NOT NULL DEFAULT 1 CHECK (operator_kill_version > 0),
  cancellation_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, targeting_version_id)
    REFERENCES policy_targeting_versions(company_id, id)
);

CREATE INDEX runs_gate01_lookup_idx
  ON runs (company_id, id, state, stage, row_version);

CREATE TABLE artifacts (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  run_id uuid NOT NULL,
  artifact_type text NOT NULL CHECK (artifact_type = 'PRODUCT_BRIEF'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (company_id, run_id, id),
  UNIQUE (company_id, run_id, artifact_type),
  FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id)
);

CREATE TABLE artifact_versions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  run_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  artifact_schema text NOT NULL CHECK (artifact_schema = 'product-brief/v1'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, run_id, artifact_id, id),
  UNIQUE (company_id, artifact_id, version),
  FOREIGN KEY (company_id, run_id, artifact_id)
    REFERENCES artifacts(company_id, run_id, id)
);

CREATE TABLE gate_instances (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  run_id uuid NOT NULL,
  gate_key text NOT NULL CHECK (gate_key = 'GATE-01'),
  artifact_id uuid NOT NULL,
  artifact_version_id uuid NOT NULL,
  artifact_version integer NOT NULL CHECK (artifact_version > 0),
  artifact_checksum text NOT NULL CHECK (artifact_checksum ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REVISION_REQUESTED')),
  row_version integer NOT NULL CHECK (row_version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  decided_at timestamptz,
  UNIQUE (company_id, run_id, id),
  UNIQUE (company_id, run_id, gate_key, artifact_version_id),
  FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id),
  FOREIGN KEY (company_id, run_id, artifact_id, artifact_version_id)
    REFERENCES artifact_versions(company_id, run_id, artifact_id, id),
  CHECK (
    (status = 'PENDING' AND decided_at IS NULL)
    OR (status <> 'PENDING' AND decided_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX one_pending_gate01_per_run_idx
  ON gate_instances (company_id, run_id, gate_key)
  WHERE status = 'PENDING';

CREATE TABLE command_receipts (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  founder_id uuid NOT NULL,
  session_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation = 'DECIDE_GATE_01'),
  idempotency_key uuid NOT NULL,
  request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status = 'COMPLETED'),
  response_status integer NOT NULL CHECK (response_status BETWEEN 200 AND 499),
  response_body jsonb NOT NULL,
  correlation_id uuid NOT NULL,
  completed_at timestamptz NOT NULL,
  UNIQUE (company_id, founder_id, operation, idempotency_key),
  FOREIGN KEY (company_id, founder_id) REFERENCES companies(id, founder_id),
  FOREIGN KEY (session_id, founder_id) REFERENCES founder_sessions(id, founder_id)
);

CREATE INDEX command_receipts_authority_replay_idx
  ON command_receipts (company_id, founder_id, operation, idempotency_key);

CREATE TABLE policy_decisions (
  id uuid PRIMARY KEY,
  decision_schema text NOT NULL CHECK (decision_schema = 'policy-decision/v1'),
  result text NOT NULL CHECK (result IN ('ALLOW', 'DENY')),
  reason_code text NOT NULL CHECK (reason_code IN (
    'ACTION_ALLOWED', 'ROLE_FORBIDDEN', 'WRONG_STAGE', 'APPROVAL_MISSING',
    'STALE_VERSION', 'RESOURCE_OUT_OF_SCOPE', 'BUDGET_UNAVAILABLE',
    'ENVIRONMENT_UNSAFE', 'TENANT_MISMATCH', 'INVALID_CONTEXT',
    'AUTHENTICATION_REQUIRED', 'POLICY_VERSION_UNSUPPORTED', 'ALLOW_EXPIRED',
    'RUN_CANCELED', 'RUN_TERMINAL'
  )),
  company_id uuid NOT NULL REFERENCES companies(id),
  founder_id uuid NOT NULL REFERENCES founders(id),
  session_id uuid NOT NULL REFERENCES founder_sessions(id),
  command_id uuid NOT NULL,
  action text NOT NULL CHECK (action = 'DECIDE_GATE_01'),
  run_id uuid,
  gate_instance_id uuid,
  artifact_id uuid,
  artifact_version_id uuid,
  policy_input_digest text NOT NULL CHECK (policy_input_digest ~ '^[0-9a-f]{64}$'),
  policy_version text NOT NULL,
  targeting_version_id uuid,
  binding jsonb NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz,
  maximum_uses integer NOT NULL,
  correlation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, command_id),
  FOREIGN KEY (company_id, founder_id) REFERENCES companies(id, founder_id),
  FOREIGN KEY (session_id, founder_id)
    REFERENCES founder_sessions(id, founder_id),
  FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id),
  FOREIGN KEY (company_id, run_id, gate_instance_id)
    REFERENCES gate_instances(company_id, run_id, id),
  FOREIGN KEY (company_id, run_id, artifact_id, artifact_version_id)
    REFERENCES artifact_versions(company_id, run_id, artifact_id, id),
  FOREIGN KEY (company_id, targeting_version_id)
    REFERENCES policy_targeting_versions(company_id, id),
  CHECK (
    (
      result = 'ALLOW'
      AND reason_code = 'ACTION_ALLOWED'
      AND run_id IS NOT NULL
      AND gate_instance_id IS NOT NULL
      AND artifact_id IS NOT NULL
      AND artifact_version_id IS NOT NULL
      AND targeting_version_id IS NOT NULL
      AND expires_at > issued_at
      AND maximum_uses > 0
      AND jsonb_typeof(binding) = 'object'
    )
    OR
    (
      result = 'DENY'
      AND reason_code <> 'ACTION_ALLOWED'
      AND expires_at IS NULL
      AND maximum_uses = 0
      AND jsonb_typeof(binding) = 'object'
    )
  )
);

CREATE TABLE founder_gate_decisions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  run_id uuid NOT NULL,
  gate_instance_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  artifact_version_id uuid NOT NULL,
  policy_decision_id uuid NOT NULL,
  founder_id uuid NOT NULL,
  command_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('APPROVE', 'REQUEST_REVISION')),
  feedback text,
  feedback_digest text CHECK (feedback_digest IS NULL OR feedback_digest ~ '^[0-9a-f]{64}$'),
  feedback_classification text CHECK (
    feedback_classification IS NULL OR feedback_classification = 'CONFIDENTIAL_FOUNDER_INPUT'
  ),
  approval_references_digest text NOT NULL CHECK (approval_references_digest ~ '^[0-9a-f]{64}$'),
  decided_at timestamptz NOT NULL,
  correlation_id uuid NOT NULL,
  UNIQUE (company_id, id),
  UNIQUE (company_id, command_id),
  UNIQUE (company_id, run_id, gate_instance_id),
  FOREIGN KEY (company_id, run_id, gate_instance_id)
    REFERENCES gate_instances(company_id, run_id, id),
  FOREIGN KEY (company_id, policy_decision_id)
    REFERENCES policy_decisions(company_id, id),
  FOREIGN KEY (company_id, founder_id) REFERENCES companies(id, founder_id),
  CHECK (
    (decision = 'APPROVE' AND feedback IS NULL AND feedback_digest IS NULL AND feedback_classification IS NULL)
    OR
    (decision = 'REQUEST_REVISION' AND feedback IS NOT NULL AND feedback <> ''
      AND feedback_digest IS NOT NULL
      AND feedback_classification = 'CONFIDENTIAL_FOUNDER_INPUT')
  ),
  CHECK (
    (decision = 'APPROVE')
    OR (decision = 'REQUEST_REVISION' AND length(btrim(feedback)) BETWEEN 1 AND 4000)
  )
);

CREATE TABLE approved_artifact_bindings (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  run_id uuid NOT NULL,
  gate_instance_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  artifact_version_id uuid NOT NULL,
  decision_record_id uuid NOT NULL,
  policy_decision_id uuid NOT NULL,
  checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  bound_at timestamptz NOT NULL,
  UNIQUE (company_id, id),
  UNIQUE (company_id, run_id, gate_instance_id),
  UNIQUE (company_id, run_id, artifact_id, artifact_version_id),
  FOREIGN KEY (company_id, run_id, gate_instance_id)
    REFERENCES gate_instances(company_id, run_id, id),
  FOREIGN KEY (company_id, decision_record_id)
    REFERENCES founder_gate_decisions(company_id, id),
  FOREIGN KEY (company_id, policy_decision_id)
    REFERENCES policy_decisions(company_id, id),
  FOREIGN KEY (company_id, run_id, artifact_id, artifact_version_id)
    REFERENCES artifact_versions(company_id, run_id, artifact_id, id)
);

CREATE TABLE continuation_intents (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  run_id uuid NOT NULL,
  decision_record_id uuid NOT NULL,
  policy_decision_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('START_DESIGN_FROM_BRIEF', 'REVISE_PRODUCT_BRIEF')),
  logical_key text NOT NULL,
  source_artifact_version_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLAIMED', 'COMPLETED', 'QUARANTINED')),
  created_at timestamptz NOT NULL,
  UNIQUE (company_id, id),
  UNIQUE (company_id, run_id, logical_key),
  FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id),
  FOREIGN KEY (company_id, decision_record_id)
    REFERENCES founder_gate_decisions(company_id, id),
  FOREIGN KEY (company_id, policy_decision_id)
    REFERENCES policy_decisions(company_id, id),
  FOREIGN KEY (company_id, source_artifact_version_id)
    REFERENCES artifact_versions(company_id, id)
);

CREATE TABLE run_event_counters (
  company_id uuid NOT NULL,
  run_id uuid NOT NULL,
  next_sequence bigint NOT NULL CHECK (next_sequence > 0),
  PRIMARY KEY (company_id, run_id),
  FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id)
);

CREATE TABLE domain_events (
  id uuid PRIMARY KEY,
  event_schema text NOT NULL CHECK (event_schema = 'domain-event/v1'),
  event_type text NOT NULL CHECK (event_type IN ('policy.decided', 'approval.decided')),
  company_id uuid NOT NULL REFERENCES companies(id),
  run_id uuid,
  run_sequence bigint,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  actor_founder_id uuid NOT NULL REFERENCES founders(id),
  correlation_id uuid NOT NULL,
  causation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  payload_digest text NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  UNIQUE (company_id, id),
  UNIQUE (company_id, run_id, run_sequence),
  FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id),
  FOREIGN KEY (company_id, actor_founder_id)
    REFERENCES companies(id, founder_id),
  CHECK ((run_id IS NULL) = (run_sequence IS NULL))
);

CREATE INDEX domain_events_order_idx
  ON domain_events (company_id, run_id, run_sequence);

CREATE TABLE outbox_messages (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  event_id uuid NOT NULL,
  topic text NOT NULL,
  envelope jsonb NOT NULL,
  envelope_digest text NOT NULL CHECK (envelope_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  published_at timestamptz,
  UNIQUE (company_id, event_id),
  FOREIGN KEY (company_id, event_id) REFERENCES domain_events(company_id, id)
);

CREATE TABLE projection_inbox (
  consumer_key text NOT NULL,
  event_id uuid NOT NULL REFERENCES domain_events(id),
  event_digest text NOT NULL CHECK (event_digest ~ '^[0-9a-f]{64}$'),
  received_at timestamptz NOT NULL,
  PRIMARY KEY (consumer_key, event_id)
);

CREATE TABLE consumer_run_offsets (
  consumer_key text NOT NULL,
  company_id uuid NOT NULL,
  run_id uuid NOT NULL,
  last_sequence bigint NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (consumer_key, company_id, run_id),
  FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id)
);

CREATE TABLE consumer_deferred_messages (
  consumer_key text NOT NULL,
  outbox_message_id uuid NOT NULL REFERENCES outbox_messages(id),
  event_id uuid NOT NULL REFERENCES domain_events(id),
  company_id uuid NOT NULL,
  run_id uuid NOT NULL,
  run_sequence bigint NOT NULL CHECK (run_sequence > 0),
  reason_code text NOT NULL CHECK (reason_code = 'SEQUENCE_GAP'),
  message_digest text NOT NULL CHECK (message_digest ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz NOT NULL,
  PRIMARY KEY (consumer_key, outbox_message_id),
  UNIQUE (consumer_key, event_id),
  FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id)
);

CREATE TABLE consumer_quarantine (
  id uuid PRIMARY KEY,
  consumer_key text NOT NULL,
  claimed_outbox_message_id text,
  claimed_event_id text,
  company_id uuid,
  run_id uuid,
  reason_code text NOT NULL CHECK (reason_code IN (
    'OUTBOX_NOT_FOUND', 'ENVELOPE_DIGEST_MISMATCH', 'EVENT_NOT_FOUND',
    'EVENT_SCHEMA_INVALID', 'ENVELOPE_EVENT_MISMATCH',
    'PAYLOAD_DIGEST_MISMATCH', 'PAYLOAD_SCHEMA_INVALID',
    'CAUSATION_INVALID', 'SEQUENCE_REGRESSION', 'INBOX_DIGEST_MISMATCH'
  )),
  supplied_message_digest text NOT NULL CHECK (supplied_message_digest ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz NOT NULL,
  UNIQUE (consumer_key, supplied_message_digest, reason_code)
);

CREATE TABLE consumer_outbox_acknowledgements (
  consumer_key text NOT NULL,
  outbox_message_id uuid NOT NULL REFERENCES outbox_messages(id),
  event_id uuid NOT NULL REFERENCES domain_events(id),
  acknowledged_at timestamptz NOT NULL,
  PRIMARY KEY (consumer_key, outbox_message_id),
  UNIQUE (consumer_key, event_id)
);

CREATE TABLE gate01_projection (
  company_id uuid NOT NULL,
  run_id uuid NOT NULL,
  last_sequence bigint NOT NULL CHECK (last_sequence > 0),
  gate_status text NOT NULL CHECK (gate_status IN ('APPROVED', 'REVISION_REQUESTED')),
  decision_record_id uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (company_id, run_id),
  FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id),
  FOREIGN KEY (company_id, decision_record_id)
    REFERENCES founder_gate_decisions(company_id, id)
);

CREATE TABLE adapter_effect_ledger (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  run_id uuid NOT NULL,
  effect_kind text NOT NULL CHECK (effect_kind IN ('MODEL', 'TOOL', 'PROVIDER', 'EXTERNAL')),
  effect_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (company_id, effect_kind, effect_key),
  FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id)
);

CREATE TABLE budget_effect_ledger (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  run_id uuid NOT NULL,
  amount_micros bigint NOT NULL CHECK (amount_micros >= 0),
  effect_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (company_id, effect_key),
  FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id)
);

CREATE TABLE designer_execution_ledger (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  run_id uuid NOT NULL,
  continuation_intent_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (company_id, continuation_intent_id),
  FOREIGN KEY (company_id, run_id) REFERENCES runs(company_id, id),
  FOREIGN KEY (company_id, continuation_intent_id)
    REFERENCES continuation_intents(company_id, id)
);

CREATE FUNCTION reject_immutable_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AICO006_IMMUTABLE_RECORD:%', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER artifact_versions_immutable
  BEFORE UPDATE OR DELETE ON artifact_versions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER policy_targeting_versions_immutable
  BEFORE UPDATE OR DELETE ON policy_targeting_versions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER command_receipts_immutable
  BEFORE UPDATE OR DELETE ON command_receipts
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER policy_decisions_immutable
  BEFORE UPDATE OR DELETE ON policy_decisions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER founder_gate_decisions_immutable
  BEFORE UPDATE OR DELETE ON founder_gate_decisions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER approved_artifact_bindings_immutable
  BEFORE UPDATE OR DELETE ON approved_artifact_bindings
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER continuation_intents_domain_immutable
  BEFORE DELETE ON continuation_intents
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER domain_events_immutable
  BEFORE UPDATE OR DELETE ON domain_events
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER projection_inbox_immutable
  BEFORE UPDATE OR DELETE ON projection_inbox
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER consumer_quarantine_immutable
  BEFORE UPDATE OR DELETE ON consumer_quarantine
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
CREATE TRIGGER consumer_outbox_acknowledgements_immutable
  BEFORE UPDATE OR DELETE ON consumer_outbox_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_change();
`;
