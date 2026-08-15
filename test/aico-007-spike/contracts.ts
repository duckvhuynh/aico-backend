import { createHash } from 'node:crypto';

export const A7_THREAT_CASES = [
  'A7-T-POSITIVE-01',
  'A7-T-ORIGIN-SITE-01',
  'A7-T-HOST-TLS-01',
  'A7-T-CONTROL-REQUEST-01',
  'A7-T-COOKIE-01',
  'A7-T-COOKIE-STORAGE-01',
  'A7-T-STORAGE-01',
  'A7-T-SERVICE-WORKER-01',
  'A7-T-OPENER-NAV-01',
  'A7-T-NAVIGATION-01',
  'A7-T-FRAME-ANCESTOR-01',
  'A7-T-FRAME-CHILD-01',
  'A7-T-SCRIPT-TARGET-01',
  'A7-T-CONNECT-01',
  'A7-T-FORM-01',
  'A7-T-SCRIPT-01',
  'A7-T-REFERRER-01',
  'A7-T-MIME-01',
  'A7-T-DOWNLOAD-01',
  'A7-T-PATH-01',
  'A7-T-BUILD-STATE-01',
  'A7-T-INTEGRITY-01',
  'A7-T-SERVE-INTEGRITY-01',
  'A7-T-ACCESS-BINDING-01',
  'A7-T-AUTHORITY-SOURCE-01',
  'A7-T-FOREIGN-01',
  'A7-T-FOREIGN-PREVIEW-01',
  'A7-T-EXPIRY-REVOCATION-01',
  'A7-T-REVOCATION-01',
  'A7-T-REPLAY-01',
  'A7-T-CACHE-01',
  'A7-T-CACHE-KEY-01',
  'A7-T-HISTORY-01',
  'A7-T-CLEANUP-01',
  'A7-T-UNKNOWN-OUTCOME-01',
  'A7-T-LOG-01',
  'A7-T-DISCLOSURE-01',
  'A7-T-REDACTION-01',
  'A7-T-EVIDENCE-01',
] as const;

export type A7ThreatCase = (typeof A7_THREAT_CASES)[number];

export const A7_CONTROL_MUTATIONS = [
  'A7-M-01',
  'A7-M-02',
  'A7-M-03',
  'A7-M-04',
  'A7-M-05',
  'A7-M-06',
  'A7-M-07',
  'A7-M-08',
  'A7-M-09',
  'A7-M-10',
  'A7-M-11',
  'A7-M-12',
] as const;

export type A7ControlMutation = (typeof A7_CONTROL_MUTATIONS)[number];

export type Sha256 = `sha256:${string}`;
export type Environment = 'LOCAL_PROOF' | 'TEST' | 'STAGING' | 'PRODUCTION';
export type PreviewState =
  | 'PREPARED'
  | 'STAGING'
  | 'AVAILABLE'
  | 'REVOKED'
  | 'EXPIRED'
  | 'DELETE_PENDING'
  | 'PURGED'
  | 'QUARANTINED'
  | 'UNKNOWN';
export type OperationOutcome =
  | 'SUCCEEDED'
  | 'ALLOWED'
  | 'DENIED'
  | 'CONFLICT'
  | 'FAILED'
  | 'UNKNOWN';

export const GENERATED_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; media-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-scripts allow-same-origin";

export const GENERATED_RESPONSE_HEADERS = Object.freeze({
  'cache-control': 'private, no-store, no-transform',
  'cdn-cache-control': 'no-store',
  'content-security-policy': GENERATED_CSP,
  'cross-origin-embedder-policy': 'require-corp',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  expires: '0',
  'origin-agent-cluster': '?1',
  'permissions-policy':
    'accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-create=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), storage-access=(), usb=(), web-share=(), xr-spatial-tracking=()',
  pragma: 'no-cache',
  'referrer-policy': 'no-referrer',
  'surrogate-control': 'no-store',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-permitted-cross-domain-policies': 'none',
});

export const UNIFORM_DENIAL = Object.freeze({
  status: 404 as const,
  code: 'resource_not_found' as const,
  body: Buffer.alloc(0),
  headers: GENERATED_RESPONSE_HEADERS,
});

export interface CausalMeta {
  messageId: string;
  correlationId: string;
  causationId: string;
  traceId: string;
  spanId: string;
  parentSpanId: string;
  operationAttemptId: string;
}

export interface RedactionProfileBinding {
  id: string;
  version: string;
  digest: Sha256;
}

export interface ToolInvocationIntent {
  id: string;
  decisionId: string;
  decisionDigest: Sha256;
  logicalInvocationKey: string;
  requestDigest: Sha256;
  action:
    | 'preview.publish/v1'
    | 'preview.grant.issue/v1'
    | 'preview.revoke/v1'
    | 'preview.cleanup/v1'
    | 'preview.reconcile/v1';
  parametersDigest: Sha256;
  resourceDigest: Sha256;
  maximumUses: 1;
  used: 0 | 1;
  expiresAt: string;
}

export interface ToolInvocationConsumption {
  intentId: string;
  consumptionId: string;
  logicalInvocationKey: string;
  requestDigest: Sha256;
  useOrdinal: 1;
  consumedAt: string;
}

export interface ManifestEntry {
  path: string;
  mediaType: string;
  bytes: number;
  contentSha256: Sha256;
  objectVersionId: string;
}

export interface BuildAuthority {
  companyId: string;
  runId: string;
  taskId: string;
  attemptId: string;
  buildId: string;
  buildVersion: number;
  buildResultReceiptId: string;
  buildResultReceiptVersion: string;
  buildResultReceiptDigest: Sha256;
  buildResult: 'SUCCEEDED' | 'FAILED';
  artifactId: string;
  artifactVersionId: string;
  artifactVersion: number;
  artifactChecksum: Sha256;
  outputManifestId: string;
  outputManifestVersion: string;
  outputManifestDigest: Sha256;
  aggregateDigest: Sha256;
  entryDocument: string;
  entries: readonly ManifestEntry[];
  canceled: boolean;
  quarantined: boolean;
  rowVersion: number;
}

export interface CompanyAuthority {
  companyId: string;
  founderSubject: string;
  status: 'ACTIVE' | 'DELETING' | 'DELETED';
  membershipVersion: number;
}

export interface PreviewAuthority {
  companyId: string;
  previewId: string;
  previewVersion: number;
  publicPreviewId: string;
  publicIdentity: string;
  host: string;
  environment: Environment;
  runId: string;
  taskId: string;
  attemptId: string;
  buildId: string;
  buildVersion: number;
  buildResultReceiptId: string;
  buildResultReceiptVersion: string;
  buildResultReceiptDigest: Sha256;
  artifactId: string;
  artifactVersionId: string;
  artifactVersion: number;
  artifactChecksum: Sha256;
  outputManifestId: string;
  outputManifestVersion: string;
  outputManifestDigest: Sha256;
  aggregateDigest: Sha256;
  state: PreviewState;
  availableFrom: string;
  expiresAt: string;
  revocationEpoch: number;
  policyVersion: string;
  keyVersion: number;
  headerProfileDigest: Sha256;
  cacheProfileDigest: Sha256;
  redactionProfile: RedactionProfileBinding;
  bindingSha256: Sha256;
  rowVersion: number;
}

export interface GrantAuthority {
  companyId: string;
  grantId: string;
  publicGrantId: string;
  issuanceRequestId: string;
  issuanceRequestDigest: Sha256;
  logicalIdempotencyKey: string;
  invocationIntentId: string;
  policyDecisionId: string;
  previewId: string;
  previewVersion: number;
  publicPreviewId: string;
  host: string;
  environment: Environment;
  audience: 'PREVIEW_VIEWER';
  runId: string;
  taskId: string;
  attemptId: string;
  buildId: string;
  buildVersion: number;
  buildResultReceiptId: string;
  buildResultReceiptVersion: string;
  buildResultReceiptDigest: Sha256;
  artifactId: string;
  artifactVersionId: string;
  artifactVersion: number;
  artifactChecksum: Sha256;
  outputManifestId: string;
  outputManifestVersion: string;
  outputManifestDigest: Sha256;
  aggregateDigest: Sha256;
  previewRevocationEpoch: number;
  grantRevocationEpoch: number;
  policyVersion: string;
  keyVersion: number;
  nonceDigest: Sha256;
  issuedAt: string;
  notBefore: string;
  expiresAt: string;
  consumedAt: string | null;
  bindingSha256: Sha256;
  redactionProfile: RedactionProfileBinding;
  meta: CausalMeta;
}

export interface SessionAuthority {
  sessionId: string;
  presentationDigest: Sha256;
  grantId: string;
  companyId: string;
  previewId: string;
  previewVersion: number;
  publicPreviewId: string;
  host: string;
  environment: Environment;
  bindingSha256: Sha256;
  grantBindingSha256: Sha256;
  runId: string;
  taskId: string;
  attemptId: string;
  buildId: string;
  buildVersion: number;
  buildResultReceiptId: string;
  buildResultReceiptVersion: string;
  buildResultReceiptDigest: Sha256;
  artifactId: string;
  artifactVersionId: string;
  artifactVersion: number;
  artifactChecksum: Sha256;
  outputManifestId: string;
  outputManifestVersion: string;
  outputManifestDigest: Sha256;
  aggregateDigest: Sha256;
  previewRevocationEpoch: number;
  grantRevocationEpoch: number;
  policyVersion: string;
  keyVersion: number;
  expiresAt: string;
  revoked: boolean;
  redactionProfile: RedactionProfileBinding;
}

export interface ObjectRecord {
  companyId: string;
  previewId: string;
  previewVersion: number;
  path: string;
  mediaType: string;
  objectVersionId: string;
  contentSha256: Sha256;
  body: Buffer;
  state: 'STAGING' | 'AVAILABLE' | 'DELETED' | 'QUARANTINED';
}

export interface CacheRecord {
  key: string;
  contentSha256: Sha256;
  mediaType: string;
  body: Buffer;
}

export interface PreviewProofState {
  companies: ReadonlyArray<readonly [string, CompanyAuthority]>;
  builds: ReadonlyArray<readonly [string, BuildAuthority]>;
  previews: ReadonlyArray<readonly [string, PreviewAuthority]>;
  grants: ReadonlyArray<readonly [string, GrantAuthority]>;
  sessions: ReadonlyArray<readonly [string, SessionAuthority]>;
  objects: ReadonlyArray<readonly [string, ObjectRecord]>;
  cache: ReadonlyArray<readonly [string, CacheRecord]>;
  intents: ReadonlyArray<readonly [string, ToolInvocationIntent]>;
  operationReceipts: ReadonlyArray<readonly [string, StoredOperationReceipt]>;
  retiredHosts: readonly string[];
}

export interface StoredOperationReceipt {
  requestDigest: Sha256;
  receipt: ProofReceipt;
}

export type ProofOperation =
  | 'AUTHORITY_READ'
  | 'PUBLISH'
  | 'GRANT_ISSUE'
  | 'EXCHANGE'
  | 'ACCESS'
  | 'REVOKE'
  | 'CLEANUP'
  | 'RECONCILE'
  | 'SECURITY_SIGNAL';

export interface LedgerEntry {
  sequence: number;
  operation: ProofOperation;
  result: OperationOutcome;
  reason: ProofReason;
  requestDigest: Sha256;
  companyId: string | null;
  resourceClass: 'NONE' | 'BUILD' | 'PREVIEW' | 'GRANT' | 'SESSION' | 'OBJECT';
  resourceIdDigest: Sha256 | null;
  meta: CausalMeta;
  redactionProfile: RedactionProfileBinding;
  occurredAt: string;
}

export interface SideEffectCounters {
  authorityReads: number;
  toolIntentsConsumed: number;
  publicationAttempts: number;
  publicationsActivated: number;
  objectsCopied: number;
  grantIssueAttempts: number;
  grantsIssued: number;
  exchangeAttempts: number;
  noncesConsumed: number;
  sessionsCreated: number;
  accessAttempts: number;
  contentAuthorizations: number;
  cacheLookups: number;
  cacheHits: number;
  cacheWrites: number;
  objectReads: number;
  generatedBytesServed: number;
  foreignBytesServed: number;
  revocationAttempts: number;
  revocations: number;
  cleanupAttempts: number;
  cachePurges: number;
  objectsDeleted: number;
  reconciliations: number;
  controlReceiverHits: number;
  externalReceiverHits: number;
  redirectsIssued: number;
  cookiesIssued: number;
  denials: number;
  conflicts: number;
  unknownOutcomes: number;
  redactionDrops: number;
  businessEvents: number;
  outboxMessages: number;
  costEffects: number;
}

export interface SideEffectLedger extends SideEffectCounters {
  entries: LedgerEntry[];
}

export const emptyLedger = (): SideEffectLedger => ({
  authorityReads: 0,
  toolIntentsConsumed: 0,
  publicationAttempts: 0,
  publicationsActivated: 0,
  objectsCopied: 0,
  grantIssueAttempts: 0,
  grantsIssued: 0,
  exchangeAttempts: 0,
  noncesConsumed: 0,
  sessionsCreated: 0,
  accessAttempts: 0,
  contentAuthorizations: 0,
  cacheLookups: 0,
  cacheHits: 0,
  cacheWrites: 0,
  objectReads: 0,
  generatedBytesServed: 0,
  foreignBytesServed: 0,
  revocationAttempts: 0,
  revocations: 0,
  cleanupAttempts: 0,
  cachePurges: 0,
  objectsDeleted: 0,
  reconciliations: 0,
  controlReceiverHits: 0,
  externalReceiverHits: 0,
  redirectsIssued: 0,
  cookiesIssued: 0,
  denials: 0,
  conflicts: 0,
  unknownOutcomes: 0,
  redactionDrops: 0,
  businessEvents: 0,
  outboxMessages: 0,
  costEffects: 0,
  entries: [],
});

export interface ProofControls {
  originAndHostIsolation: boolean;
  cookieIsolation: boolean;
  storageAndWorkerIsolation: boolean;
  openerNavigationAndFrameIsolation: boolean;
  exactCspAndTargetDenial: boolean;
  scriptAndMimeIntegrity: boolean;
  currentAuthorityAndExactBindings: boolean;
  buildAndServeIntegrity: boolean;
  authorizeBeforeCache: boolean;
  expiryRevocationAndNonce: boolean;
  methodPathAndReferrerSafety: boolean;
  cleanupDisclosureRedactionAndEvidence: boolean;
}

export const defaultProofControls = (): ProofControls => ({
  originAndHostIsolation: true,
  cookieIsolation: true,
  storageAndWorkerIsolation: true,
  openerNavigationAndFrameIsolation: true,
  exactCspAndTargetDenial: true,
  scriptAndMimeIntegrity: true,
  currentAuthorityAndExactBindings: true,
  buildAndServeIntegrity: true,
  authorizeBeforeCache: true,
  expiryRevocationAndNonce: true,
  methodPathAndReferrerSafety: true,
  cleanupDisclosureRedactionAndEvidence: true,
});

export const MUTATION_CONTROL: Readonly<Record<A7ControlMutation, keyof ProofControls>> = {
  'A7-M-01': 'originAndHostIsolation',
  'A7-M-02': 'cookieIsolation',
  'A7-M-03': 'storageAndWorkerIsolation',
  'A7-M-04': 'openerNavigationAndFrameIsolation',
  'A7-M-05': 'exactCspAndTargetDenial',
  'A7-M-06': 'scriptAndMimeIntegrity',
  'A7-M-07': 'currentAuthorityAndExactBindings',
  'A7-M-08': 'buildAndServeIntegrity',
  'A7-M-09': 'authorizeBeforeCache',
  'A7-M-10': 'expiryRevocationAndNonce',
  'A7-M-11': 'methodPathAndReferrerSafety',
  'A7-M-12': 'cleanupDisclosureRedactionAndEvidence',
};

export interface ProofFaults {
  authorityUnavailable?: boolean;
  publicationUnknownAfterCopy?: boolean;
  exchangeUnknownAfterNonce?: boolean;
  revocationUnknownAfterEpoch?: boolean;
  corruptObjectOnRead?: boolean;
  corruptCacheOnRead?: boolean;
  cleanupPartial?: boolean;
  cleanupUnknown?: boolean;
  redactionFailure?: boolean;
}

export interface ProofHooks {
  beforeAuthorityRead?(operation: ProofOperation): void;
  afterAuthorityRead?(operation: ProofOperation, rowVersion: number | null): void;
  beforeEffect?(operation: ProofOperation): void;
  afterEffect?(operation: ProofOperation): void;
  beforeNonceConsume?(): void;
  afterNonceConsume?(): void;
  beforeRevocationCommit?(): void;
  afterRevocationCommit?(): void;
}

export interface PublicationRequest {
  schemaVersion: 1;
  caseId: A7ThreatCase;
  requestId: string;
  logicalIdempotencyKey: string;
  requestDigest: Sha256;
  actorSubject: string;
  build: BuildAuthority;
  preview: PreviewAuthority;
  toolInvocation: ToolInvocationIntent;
  meta: CausalMeta;
}

export interface GrantIssueRequest {
  schemaVersion: 1;
  caseId: A7ThreatCase;
  requestId: string;
  logicalIdempotencyKey: string;
  requestDigest: Sha256;
  actorSubject: string;
  previewId: string;
  previewVersion: number;
  publicGrantId: string;
  nonce: string;
  expiresAt: string;
  toolInvocation: ToolInvocationIntent;
  meta: CausalMeta;
}

export interface AccessGrantClaims {
  audience: 'PREVIEW_VIEWER';
  opaque_grant_ref: string;
  nonce: string;
  issued_at: string;
  not_before: string;
  expires_at: string;
  origin_hostname: string;
  environment: Environment;
  binding_sha256: Sha256;
}

export interface SignedAccessGrant {
  protectedHeader: {
    typ: 'AICO-PREVIEW-GRANT+JWT';
    alg: 'EdDSA';
    kid: string;
  };
  claims: AccessGrantClaims;
  compact: string;
}

export interface ExchangeRequest {
  schemaVersion: 1;
  caseId: A7ThreatCase;
  requestId: string;
  logicalIdempotencyKey: string;
  requestDigest: Sha256;
  host: string;
  environment: Environment;
  origin: string;
  contentType: 'application/octet-stream';
  fetchSite: 'same-origin' | 'cross-site';
  capability: string;
  meta: CausalMeta;
}

export interface AccessRequest {
  schemaVersion: 1;
  caseId: A7ThreatCase;
  requestId: string;
  requestDigest: Sha256;
  host: string;
  environment: Environment;
  method: 'GET' | 'HEAD' | 'POST' | 'OPTIONS';
  path: string;
  navigation: boolean;
  cookiePresentation: string | null;
  range: string | null;
  ifNoneMatch: string | null;
  meta: CausalMeta;
}

export interface RevocationRequest {
  schemaVersion: 1;
  caseId: A7ThreatCase;
  requestId: string;
  logicalIdempotencyKey: string;
  requestDigest: Sha256;
  actorSubject: string;
  previewId: string;
  previewVersion: number;
  expectedEpoch: number;
  reason: 'FOUNDER_REVOKED' | 'EXPIRED' | 'INTEGRITY_FAILED' | 'SECURITY_RESPONSE';
  toolInvocation: ToolInvocationIntent;
  meta: CausalMeta;
}

export interface CleanupRequest {
  schemaVersion: 1;
  caseId: A7ThreatCase;
  requestId: string;
  logicalIdempotencyKey: string;
  requestDigest: Sha256;
  actorSubject: string;
  previewId: string;
  previewVersion: number;
  expectedEpoch: number;
  toolInvocation: ToolInvocationIntent;
  meta: CausalMeta;
}

export interface ReconciliationRequest {
  schemaVersion: 1;
  caseId: A7ThreatCase;
  requestId: string;
  logicalIdempotencyKey: string;
  requestDigest: Sha256;
  target: 'PUBLICATION' | 'GRANT_ISSUE' | 'EXCHANGE' | 'REVOCATION' | 'CLEANUP';
  originalLogicalKey: string;
  originalRequestDigest: Sha256;
  stateChanging: boolean;
  toolInvocation: ToolInvocationIntent;
  meta: CausalMeta;
}

export type ProofReason =
  | 'PUBLISHED'
  | 'GRANT_ISSUED'
  | 'GRANT_EXCHANGED'
  | 'ACCESS_ALLOWED'
  | 'REVOKED'
  | 'CLEANUP_COMPLETE'
  | 'RECONCILED'
  | 'RESOURCE_NOT_FOUND'
  | 'AUTHENTICATION_REQUIRED'
  | 'TENANT_MISMATCH'
  | 'BINDING_MISMATCH'
  | 'BUILD_NOT_SUCCESSFUL'
  | 'INTEGRITY_FAILED'
  | 'AUTHORITY_UNAVAILABLE'
  | 'AUTHORITY_STALE'
  | 'POLICY_DENIED'
  | 'INVOCATION_INVALID'
  | 'INVOCATION_ALREADY_CONSUMED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'CREDENTIAL_INVALID'
  | 'CREDENTIAL_EXPIRED'
  | 'CREDENTIAL_REPLAYED'
  | 'PUBLICATION_NOT_AVAILABLE'
  | 'METHOD_NOT_ALLOWED'
  | 'PATH_NOT_ALLOWED'
  | 'CACHE_INTEGRITY_FAILED'
  | 'UNKNOWN_EXTERNAL_OUTCOME'
  | 'CLEANUP_INCOMPLETE'
  | 'REDACTION_FAILED';

export interface ProofReceipt {
  schemaVersion: 1;
  receiptId: string;
  operation: Exclude<ProofOperation, 'AUTHORITY_READ' | 'SECURITY_SIGNAL'>;
  requestId: string;
  requestDigest: Sha256;
  outcome: OperationOutcome;
  reason: ProofReason;
  replayed: boolean;
  currentAuthorityRead: boolean;
  effectStarted: boolean;
  toolConsumption: ToolInvocationConsumption | null;
  redactionProfile: RedactionProfileBinding;
  meta: CausalMeta;
  occurredAt: string;
  detailDigest: Sha256;
}

export interface PublicationReceipt extends ProofReceipt {
  operation: 'PUBLISH';
  previewId: string | null;
  host: string | null;
  state: PreviewState | null;
}

export interface GrantIssueReceipt extends ProofReceipt {
  operation: 'GRANT_ISSUE';
  publicGrantId: string | null;
  bindingSha256: Sha256 | null;
  capabilityDigest: Sha256 | null;
}

export interface GrantIssueResult {
  receipt: GrantIssueReceipt;
  grant: SignedAccessGrant | null;
}

export interface ExchangeReceipt extends ProofReceipt {
  operation: 'EXCHANGE';
  sessionId: string | null;
  cookieAttributes: string | null;
  redirectPath: '/' | null;
}

export interface ExchangeResult {
  receipt: ExchangeReceipt;
  sessionPresentation: string | null;
}

export interface AccessReceipt extends ProofReceipt {
  operation: 'ACCESS';
  response: {
    status: number;
    code: 'ok' | 'resource_not_found';
    headers: Readonly<Record<string, string>>;
    mediaType: string | null;
    contentLength: number;
    body: Buffer;
  };
  cacheResult: 'NOT_CHECKED' | 'MISS' | 'HIT';
  normalizedPathDigest: Sha256 | null;
}

export interface RevocationReceipt extends ProofReceipt {
  operation: 'REVOKE';
  previewId: string;
  previousEpoch: number | null;
  currentEpoch: number | null;
  state: PreviewState | null;
}

export interface CleanupReceipt extends ProofReceipt {
  operation: 'CLEANUP';
  state: PreviewState | null;
  deletedObjects: number;
  purgedCacheEntries: number;
  remainingObjects: number;
  hostTombstoned: boolean;
}

export interface ReconciliationReceipt extends ProofReceipt {
  operation: 'RECONCILE';
  target: ReconciliationRequest['target'];
  resolvedReceiptDigest: Sha256 | null;
}

function stable(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return { $bufferSha256: sha256(value) };
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalDigest(value: unknown): Sha256 {
  return `sha256:${sha256(canonicalJson(value))}`;
}

export function bodyDigest(value: Buffer): Sha256 {
  return `sha256:${sha256(value)}`;
}

export function canonicalRequestDigest(
  request: Record<string, unknown> & { toolInvocation?: ToolInvocationIntent | null },
): Sha256 {
  const toolInvocation = request.toolInvocation;
  return canonicalDigest({
    ...request,
    caseId: undefined,
    requestDigest: undefined,
    toolInvocation:
      toolInvocation === undefined || toolInvocation === null
        ? toolInvocation
        : { ...toolInvocation, requestDigest: undefined, used: undefined },
  });
}

export function normalizedManifestDigest(entries: readonly ManifestEntry[]): Sha256 {
  return canonicalDigest(
    [...entries]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(({ path, mediaType, bytes, contentSha256, objectVersionId }) => ({
        path,
        mediaType,
        bytes,
        contentSha256,
        objectVersionId,
      })),
  );
}

export function isSafeManifestPath(path: string): boolean {
  if (path.length === 0 || path.length > 240 || path.includes('\\') || path.includes('\0')) {
    return false;
  }
  if (path.startsWith('/') || path.startsWith('.') || path.includes('//')) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
