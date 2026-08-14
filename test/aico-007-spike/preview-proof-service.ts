import {
  createPrivateKey,
  createPublicKey,
  sign as ed25519Sign,
  verify as ed25519Verify,
  type KeyObject,
} from 'node:crypto';

import {
  GENERATED_RESPONSE_HEADERS,
  MUTATION_CONTROL,
  UNIFORM_DENIAL,
  bodyDigest,
  canonicalDigest,
  canonicalJson,
  canonicalRequestDigest,
  clone,
  defaultProofControls,
  emptyLedger,
  isSafeManifestPath,
  normalizedManifestDigest,
  type A7ControlMutation,
  type AccessGrantClaims,
  type AccessReceipt,
  type AccessRequest,
  type BuildAuthority,
  type CacheRecord,
  type CausalMeta,
  type CleanupReceipt,
  type CleanupRequest,
  type CompanyAuthority,
  type ExchangeReceipt,
  type ExchangeRequest,
  type ExchangeResult,
  type GrantAuthority,
  type GrantIssueReceipt,
  type GrantIssueRequest,
  type GrantIssueResult,
  type LedgerEntry,
  type ObjectRecord,
  type OperationOutcome,
  type PreviewAuthority,
  type PreviewProofState,
  type ProofControls,
  type ProofFaults,
  type ProofHooks,
  type ProofOperation,
  type ProofReason,
  type ProofReceipt,
  type PublicationReceipt,
  type PublicationRequest,
  type ReconciliationReceipt,
  type ReconciliationRequest,
  type RedactionProfileBinding,
  type RevocationReceipt,
  type RevocationRequest,
  type SessionAuthority,
  type Sha256,
  type SideEffectLedger,
  type SignedAccessGrant,
  type StoredOperationReceipt,
  type ToolInvocationConsumption,
  type ToolInvocationIntent,
} from './contracts';
import { AICO007_FIXTURE_DIGESTS, previewObjectKey, sourceObjectKey } from './fixture';

export interface PreviewProofClock {
  now(): string;
}

export interface PreviewSigningMaterial {
  keyId: string;
  keyVersion: 1;
  privateKeyPem: string;
  publicKeyPem: string;
}

export interface PreviewProofServiceOptions {
  controls?: ProofControls;
  faults?: ProofFaults;
  hooks?: ProofHooks;
  ledger?: SideEffectLedger;
}

export interface BrowserControlProfile {
  originAndHostIsolation: boolean;
  cookieAttributes: string;
  allowPersistentStorage: boolean;
  allowServiceWorker: boolean;
  isolateOpener: boolean;
  allowChildFrames: boolean;
  responseHeaders: Readonly<Record<string, string>>;
}

type OperationRequest =
  | PublicationRequest
  | GrantIssueRequest
  | ExchangeRequest
  | AccessRequest
  | RevocationRequest
  | CleanupRequest
  | ReconciliationRequest;

type BuildBindingSource = Pick<
  BuildAuthority,
  | 'runId'
  | 'taskId'
  | 'attemptId'
  | 'buildId'
  | 'buildVersion'
  | 'buildResultReceiptId'
  | 'buildResultReceiptVersion'
  | 'buildResultReceiptDigest'
  | 'artifactId'
  | 'artifactVersionId'
  | 'artifactVersion'
  | 'artifactChecksum'
  | 'outputManifestId'
  | 'outputManifestVersion'
  | 'outputManifestDigest'
  | 'aggregateDigest'
>;

interface VerifiedBuildCopy {
  source: ObjectRecord;
  destinationKey: string;
}

interface ReceiptBaseInput {
  operation: ProofReceipt['operation'];
  request: OperationRequest;
  outcome: OperationOutcome;
  reason: ProofReason;
  replayed?: boolean;
  currentAuthorityRead: boolean;
  effectStarted: boolean;
  toolConsumption?: ToolInvocationConsumption | null;
  redactionProfile?: RedactionProfileBinding;
  detail?: unknown;
}

class ProofDenied extends Error {
  public constructor(
    public readonly reason: ProofReason,
    public readonly currentAuthorityRead: boolean,
  ) {
    super(reason);
  }
}

class ProofConflict extends Error {
  public constructor(public readonly reason: ProofReason = 'IDEMPOTENCY_CONFLICT') {
    super(reason);
  }
}

export class PreviewProofService {
  public readonly ledger: SideEffectLedger;
  public readonly controls: ProofControls;
  public readonly faults: ProofFaults;

  private readonly companies = new Map<string, CompanyAuthority>();
  private readonly builds = new Map<string, BuildAuthority>();
  private readonly previews = new Map<string, PreviewAuthority>();
  private readonly grants = new Map<string, GrantAuthority>();
  private readonly sessions = new Map<string, SessionAuthority>();
  private readonly objects = new Map<string, ObjectRecord>();
  private readonly cache = new Map<string, CacheRecord>();
  private readonly intents = new Map<string, ToolInvocationIntent>();
  private readonly operationReceipts = new Map<string, StoredOperationReceipt>();
  private readonly retiredHosts = new Set<string>();
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private sequence = 0;

  public constructor(
    initialState: PreviewProofState,
    private readonly clock: PreviewProofClock,
    private readonly signing: PreviewSigningMaterial,
    private readonly defaultRedactionProfile: RedactionProfileBinding,
    private readonly options: PreviewProofServiceOptions = {},
  ) {
    this.controls = clone(options.controls ?? defaultProofControls());
    this.faults = { ...(options.faults ?? {}) };
    this.ledger = options.ledger ?? emptyLedger();
    this.privateKey = createPrivateKey(signing.privateKeyPem);
    this.publicKey = createPublicKey(signing.publicKeyPem);
    this.importState(initialState);
  }

  public registerToolInvocationIntent(intent: ToolInvocationIntent): void {
    if (
      !hasExactKeys(intent, [
        'id',
        'decisionId',
        'decisionDigest',
        'logicalInvocationKey',
        'requestDigest',
        'action',
        'parametersDigest',
        'resourceDigest',
        'maximumUses',
        'used',
        'expiresAt',
      ]) ||
      intent.maximumUses !== 1 ||
      intent.used !== 0
    ) {
      throw new ProofDenied('INVOCATION_INVALID', false);
    }
    const existing = this.intents.get(intent.id);
    if (existing !== undefined && canonicalDigest(existing) !== canonicalDigest(intent)) {
      throw new ProofConflict();
    }
    this.intents.set(intent.id, clone(intent));
  }

  public withMutation(mutation: A7ControlMutation): PreviewProofService {
    const controls = clone(this.controls);
    controls[MUTATION_CONTROL[mutation]] = false;
    return new PreviewProofService(
      this.exportState(),
      this.clock,
      this.signing,
      this.defaultRedactionProfile,
      { ...this.options, controls, faults: clone(this.faults), ledger: emptyLedger() },
    );
  }

  /** Browser adapters consume this snapshot so source mutants weaken live probes, not only metadata. */
  public browserControlProfile(): BrowserControlProfile {
    return {
      originAndHostIsolation: this.controls.originAndHostIsolation,
      cookieAttributes: this.controls.cookieIsolation
        ? 'Secure; HttpOnly; SameSite=Strict; Path=/'
        : 'Path=/',
      allowPersistentStorage: !this.controls.storageAndWorkerIsolation,
      allowServiceWorker: !this.controls.storageAndWorkerIsolation,
      isolateOpener: this.controls.openerNavigationAndFrameIsolation,
      allowChildFrames: !this.controls.openerNavigationAndFrameIsolation,
      responseHeaders: this.responseHeaders(),
    };
  }

  public publish(request: PublicationRequest): PublicationReceipt {
    this.assertRequestDigest(request);
    this.ledger.publicationAttempts += 1;
    let company: CompanyAuthority | null = null;
    let preview: PreviewAuthority | null = null;
    let consumption: ToolInvocationConsumption | null = null;
    try {
      company = this.readCompanyBySubject(request.actorSubject, 'PUBLISH', request);
      const replay = this.replay<PublicationReceipt>(
        request.logicalIdempotencyKey,
        request.requestDigest,
      );
      if (replay !== null) return replay;
      const build = this.readBuild(request.build.buildId, request);
      preview = this.readPreview(request.preview.previewId, request);
      this.assertCompanyScope(company, build.companyId, preview.companyId);
      this.assertPublicationBindings(request, build, preview);
      const verifiedCopy = this.validateBuildCopy(build, preview);
      consumption = this.consumeIntent(request.toolInvocation, 'preview.publish/v1', request);
      this.options.hooks?.beforeEffect?.('PUBLISH');
      const stagedKeys = this.copyVerifiedBuild(verifiedCopy, preview);
      if (this.faults.publicationUnknownAfterCopy) {
        preview.state = 'UNKNOWN';
        preview.rowVersion += 1;
        this.previews.set(preview.previewId, preview);
        this.ledger.unknownOutcomes += 1;
        const receipt = this.publicationReceipt(request, {
          outcome: 'UNKNOWN',
          reason: 'UNKNOWN_EXTERNAL_OUTCOME',
          currentAuthorityRead: true,
          effectStarted: true,
          toolConsumption: consumption,
          preview,
        });
        this.store(request.logicalIdempotencyKey, request.requestDigest, receipt);
        this.record(
          'PUBLISH',
          'UNKNOWN',
          'UNKNOWN_EXTERNAL_OUTCOME',
          request,
          company.companyId,
          'PREVIEW',
          preview.previewId,
        );
        return receipt;
      }
      for (const key of stagedKeys) {
        const object = this.objects.get(key);
        if (object !== undefined) object.state = 'AVAILABLE';
      }
      preview.state = 'AVAILABLE';
      preview.rowVersion += 1;
      preview.bindingSha256 = this.previewBinding(preview);
      this.previews.set(preview.previewId, preview);
      this.ledger.publicationsActivated += 1;
      this.ledger.businessEvents += 1;
      this.ledger.outboxMessages += 1;
      this.options.hooks?.afterEffect?.('PUBLISH');
      const receipt = this.publicationReceipt(request, {
        outcome: 'SUCCEEDED',
        reason: 'PUBLISHED',
        currentAuthorityRead: true,
        effectStarted: true,
        toolConsumption: consumption,
        preview,
      });
      this.store(request.logicalIdempotencyKey, request.requestDigest, receipt);
      this.record(
        'PUBLISH',
        'SUCCEEDED',
        'PUBLISHED',
        request,
        company.companyId,
        'PREVIEW',
        preview.previewId,
      );
      return receipt;
    } catch (error) {
      return this.handlePublicationError(request, error, company, preview, consumption);
    }
  }

  public issueGrant(request: GrantIssueRequest): GrantIssueResult {
    this.assertRequestDigest(request);
    this.ledger.grantIssueAttempts += 1;
    let company: CompanyAuthority | null = null;
    let preview: PreviewAuthority | null = null;
    let consumption: ToolInvocationConsumption | null = null;
    try {
      company = this.readCompanyBySubject(request.actorSubject, 'GRANT_ISSUE', request);
      const replay = this.replay<GrantIssueReceipt>(
        request.logicalIdempotencyKey,
        request.requestDigest,
      );
      if (replay !== null) {
        const storedGrant = [...this.grants.values()].find(
          (candidate) => candidate.publicGrantId === replay.publicGrantId,
        );
        const signedGrant =
          storedGrant === undefined ? null : this.signGrant(storedGrant, request.nonce);
        if (
          signedGrant === null ||
          replay.capabilityDigest === null ||
          canonicalDigest(signedGrant.compact) !== replay.capabilityDigest
        ) {
          throw new ProofDenied('AUTHORITY_STALE', true);
        }
        return { receipt: replay, grant: signedGrant };
      }
      preview = this.readPreview(request.previewId, request);
      const build = this.readBuild(preview.buildId, request);
      this.assertCompanyScope(company, preview.companyId, build.companyId);
      this.assertPreviewAvailable(preview);
      if (
        request.previewVersion !== preview.previewVersion ||
        request.expiresAt > preview.expiresAt
      ) {
        throw new ProofDenied('BINDING_MISMATCH', true);
      }
      if (
        [...this.grants.values()].some((stored) => stored.publicGrantId === request.publicGrantId)
      ) {
        throw new ProofConflict();
      }
      const grant = this.createGrantAuthority(request, preview, build, company);
      consumption = this.consumeIntent(request.toolInvocation, 'preview.grant.issue/v1', request);
      this.options.hooks?.beforeEffect?.('GRANT_ISSUE');
      this.grants.set(grant.grantId, grant);
      const signedGrant = this.signGrant(grant, request.nonce);
      this.ledger.grantsIssued += 1;
      this.ledger.businessEvents += 1;
      this.ledger.outboxMessages += 1;
      this.options.hooks?.afterEffect?.('GRANT_ISSUE');
      const receipt = this.grantReceipt(request, {
        outcome: 'SUCCEEDED',
        reason: 'GRANT_ISSUED',
        currentAuthorityRead: true,
        effectStarted: true,
        toolConsumption: consumption,
        publicGrantId: grant.publicGrantId,
        bindingSha256: grant.bindingSha256,
        capabilityDigest: canonicalDigest(signedGrant.compact),
      });
      this.store(request.logicalIdempotencyKey, request.requestDigest, receipt);
      this.record(
        'GRANT_ISSUE',
        'SUCCEEDED',
        'GRANT_ISSUED',
        request,
        company.companyId,
        'GRANT',
        grant.grantId,
      );
      return { receipt, grant: signedGrant };
    } catch (error) {
      const classified = this.classify(error);
      const receipt = this.grantReceipt(request, {
        ...classified,
        effectStarted: consumption !== null,
        toolConsumption: consumption,
        publicGrantId: null,
        bindingSha256: null,
        capabilityDigest: null,
      });
      this.storeIfStable(request.logicalIdempotencyKey, request.requestDigest, receipt);
      this.record(
        'GRANT_ISSUE',
        classified.outcome,
        classified.reason,
        request,
        company?.companyId ?? null,
        'NONE',
        null,
      );
      return { receipt, grant: null };
    }
  }

  public exchange(request: ExchangeRequest): ExchangeResult {
    this.assertRequestDigest(request);
    this.ledger.exchangeAttempts += 1;
    let grant: GrantAuthority | null = null;
    let companyId: string | null = null;
    try {
      if (
        request.contentType !== 'application/octet-stream' ||
        (this.controls.originAndHostIsolation &&
          (request.fetchSite !== 'same-origin' || request.origin !== `https://${request.host}`))
      ) {
        throw new ProofDenied('CREDENTIAL_INVALID', false);
      }
      const parsed = this.verifyGrant(request.capability);
      this.authorityRead('EXCHANGE', request, null);
      grant =
        [...this.grants.values()].find(
          (candidate) => candidate.publicGrantId === parsed.claims.opaque_grant_ref,
        ) ?? null;
      if (grant === null) throw new ProofDenied('RESOURCE_NOT_FOUND', false);
      companyId = grant.companyId;
      const preview = this.readPreview(grant.previewId, request);
      const build = this.readBuild(preview.buildId, request);
      const company = this.readCompany(grant.companyId, request, 'EXCHANGE');
      const replay = this.replay<ExchangeReceipt>(
        request.logicalIdempotencyKey,
        request.requestDigest,
      );
      if (replay !== null) {
        const storedSession =
          replay.sessionId === null ? undefined : this.sessions.get(replay.sessionId);
        const presentation = storedSession === undefined ? null : this.signSession(storedSession);
        if (
          (replay.outcome === 'SUCCEEDED' && presentation === null) ||
          (presentation !== null &&
            storedSession?.presentationDigest !== canonicalDigest(presentation))
        ) {
          throw new ProofDenied('AUTHORITY_STALE', true);
        }
        return { receipt: replay, sessionPresentation: presentation };
      }
      this.assertCompanyScope(company, grant.companyId, preview.companyId, build.companyId);
      this.assertExchangeBindings(request, parsed.claims, grant, preview, build);
      this.options.hooks?.beforeNonceConsume?.();
      const currentGrant = this.grants.get(grant.grantId);
      if (currentGrant === undefined) throw new ProofDenied('RESOURCE_NOT_FOUND', true);
      grant = currentGrant;
      if (grant.consumedAt !== null && this.controls.expiryRevocationAndNonce) {
        throw new ProofDenied('CREDENTIAL_REPLAYED', true);
      }
      grant.consumedAt = this.clock.now();
      this.grants.set(grant.grantId, grant);
      this.ledger.noncesConsumed += 1;
      this.options.hooks?.afterNonceConsume?.();
      if (this.faults.exchangeUnknownAfterNonce) {
        this.ledger.unknownOutcomes += 1;
        const receipt = this.exchangeReceipt(request, {
          outcome: 'UNKNOWN',
          reason: 'UNKNOWN_EXTERNAL_OUTCOME',
          currentAuthorityRead: true,
          effectStarted: true,
          sessionId: null,
          cookieAttributes: null,
          redirectPath: null,
          redactionProfile: grant.redactionProfile,
        });
        this.store(request.logicalIdempotencyKey, request.requestDigest, receipt);
        this.record(
          'EXCHANGE',
          'UNKNOWN',
          'UNKNOWN_EXTERNAL_OUTCOME',
          request,
          grant.companyId,
          'GRANT',
          grant.grantId,
        );
        return { receipt, sessionPresentation: null };
      }
      const session = this.createSession(grant);
      const presentation = this.signSession(session);
      session.presentationDigest = canonicalDigest(presentation);
      this.sessions.set(session.sessionId, session);
      this.ledger.sessionsCreated += 1;
      this.ledger.cookiesIssued += 1;
      this.ledger.redirectsIssued += 1;
      const receipt = this.exchangeReceipt(request, {
        outcome: 'SUCCEEDED',
        reason: 'GRANT_EXCHANGED',
        currentAuthorityRead: true,
        effectStarted: true,
        sessionId: session.sessionId,
        cookieAttributes: this.browserControlProfile().cookieAttributes,
        redirectPath: '/',
        redactionProfile: grant.redactionProfile,
      });
      this.store(request.logicalIdempotencyKey, request.requestDigest, receipt);
      this.record(
        'EXCHANGE',
        'SUCCEEDED',
        'GRANT_EXCHANGED',
        request,
        grant.companyId,
        'SESSION',
        session.sessionId,
      );
      return { receipt, sessionPresentation: presentation };
    } catch (error) {
      const classified = this.classify(error);
      const receipt = this.exchangeReceipt(request, {
        ...classified,
        effectStarted: false,
        sessionId: null,
        cookieAttributes: null,
        redirectPath: null,
        redactionProfile: grant?.redactionProfile,
      });
      this.storeIfStable(request.logicalIdempotencyKey, request.requestDigest, receipt);
      this.record(
        'EXCHANGE',
        classified.outcome,
        classified.reason,
        request,
        companyId,
        'NONE',
        null,
      );
      return { receipt, sessionPresentation: null };
    }
  }

  public access(request: AccessRequest): AccessReceipt {
    this.assertRequestDigest(request);
    this.ledger.accessAttempts += 1;
    let session: SessionAuthority | null = null;
    let cacheResult: AccessReceipt['cacheResult'] = 'NOT_CHECKED';
    try {
      this.assertRequestSurface(request);
      session = this.verifySessionPresentation(request.cookiePresentation);
      const preview = this.previews.get(session.previewId);
      if (preview === undefined) throw new ProofDenied('RESOURCE_NOT_FOUND', false);
      const normalizedPath = this.normalizeAccessPath(request, preview);
      const entry = this.readBuild(preview.buildId, request).entries.find(
        (candidate) => candidate.path === normalizedPath,
      );
      if (entry === undefined) throw new ProofDenied('PATH_NOT_ALLOWED', true);
      const cacheKey = this.cacheKey(preview, entry);
      let cached = this.controls.authorizeBeforeCache ? undefined : this.cache.get(cacheKey);
      if (!this.controls.authorizeBeforeCache) {
        this.ledger.cacheLookups += 1;
        cacheResult = cached === undefined ? 'MISS' : 'HIT';
      }
      const company = this.readCompany(session.companyId, request, 'ACCESS');
      const currentPreview = this.readPreview(session.previewId, request);
      const build = this.readBuild(currentPreview.buildId, request);
      this.assertContentAuthority(request, session, company, currentPreview, build);
      this.ledger.contentAuthorizations += 1;
      if (this.controls.authorizeBeforeCache) {
        this.ledger.cacheLookups += 1;
        cached = this.cache.get(cacheKey);
        cacheResult = cached === undefined ? 'MISS' : 'HIT';
      }
      let body: Buffer;
      if (cached !== undefined) {
        this.ledger.cacheHits += 1;
        body = Buffer.from(cached.body);
        if (this.faults.corruptCacheOnRead) body = Buffer.concat([body, Buffer.from('corrupt')]);
        if (
          (this.controls.buildAndServeIntegrity &&
            (bodyDigest(body) !== entry.contentSha256 ||
              cached.contentSha256 !== entry.contentSha256)) ||
          (this.controls.scriptAndMimeIntegrity && cached.mediaType !== entry.mediaType)
        ) {
          this.quarantine(currentPreview, request);
          throw new ProofDenied('CACHE_INTEGRITY_FAILED', true);
        }
      } else {
        const object = this.objects.get(
          previewObjectKey(currentPreview.previewId, currentPreview.previewVersion, entry.path),
        );
        if (object === undefined || object.state !== 'AVAILABLE') {
          throw new ProofDenied('RESOURCE_NOT_FOUND', true);
        }
        this.ledger.objectReads += 1;
        body = Buffer.from(object.body);
        if (this.faults.corruptObjectOnRead) body = Buffer.concat([body, Buffer.from('corrupt')]);
        if (
          (this.controls.buildAndServeIntegrity &&
            (bodyDigest(body) !== entry.contentSha256 ||
              object.contentSha256 !== entry.contentSha256 ||
              object.objectVersionId !== entry.objectVersionId)) ||
          (this.controls.scriptAndMimeIntegrity && object.mediaType !== entry.mediaType)
        ) {
          this.quarantine(currentPreview, request);
          throw new ProofDenied('INTEGRITY_FAILED', true);
        }
        this.cache.set(cacheKey, {
          key: cacheKey,
          contentSha256: entry.contentSha256,
          mediaType: entry.mediaType,
          body: Buffer.from(body),
        });
        this.ledger.cacheWrites += 1;
      }
      const responseBody = request.method === 'HEAD' ? Buffer.alloc(0) : body;
      this.ledger.generatedBytesServed += responseBody.byteLength;
      if (session.companyId !== currentPreview.companyId) {
        this.ledger.foreignBytesServed += responseBody.byteLength;
      }
      const receipt = this.accessReceipt(request, {
        outcome: 'ALLOWED',
        reason: 'ACCESS_ALLOWED',
        currentAuthorityRead: true,
        response: {
          status: 200,
          code: 'ok',
          headers: this.responseHeaders(),
          mediaType: entry.mediaType,
          contentLength: body.byteLength,
          body: responseBody,
        },
        cacheResult,
        normalizedPathDigest: canonicalDigest(normalizedPath),
        redactionProfile: currentPreview.redactionProfile,
      });
      this.record(
        'ACCESS',
        'ALLOWED',
        'ACCESS_ALLOWED',
        request,
        currentPreview.companyId,
        'OBJECT',
        entry.objectVersionId,
      );
      return receipt;
    } catch (error) {
      const classified = this.classify(error);
      const disclosedBody = this.controls.cleanupDisclosureRedactionAndEvidence
        ? Buffer.alloc(0)
        : Buffer.from(classified.reason, 'utf8');
      const receipt = this.accessReceipt(request, {
        ...classified,
        response: {
          status: this.controls.cleanupDisclosureRedactionAndEvidence ? UNIFORM_DENIAL.status : 403,
          code: UNIFORM_DENIAL.code,
          headers: this.controls.cleanupDisclosureRedactionAndEvidence
            ? this.responseHeaders()
            : { ...this.responseHeaders(), 'x-aico-internal-denial': classified.reason },
          mediaType: null,
          contentLength: disclosedBody.byteLength,
          body: disclosedBody,
        },
        cacheResult,
        normalizedPathDigest: null,
      });
      this.record(
        'ACCESS',
        'DENIED',
        classified.reason,
        request,
        session?.companyId ?? null,
        'NONE',
        null,
      );
      return receipt;
    }
  }

  public revoke(request: RevocationRequest): RevocationReceipt {
    this.assertRequestDigest(request);
    this.ledger.revocationAttempts += 1;
    let company: CompanyAuthority | null = null;
    let preview: PreviewAuthority | null = null;
    let consumption: ToolInvocationConsumption | null = null;
    try {
      company = this.readCompanyBySubject(request.actorSubject, 'REVOKE', request);
      const replay = this.replay<RevocationReceipt>(
        request.logicalIdempotencyKey,
        request.requestDigest,
      );
      if (replay !== null) return replay;
      preview = this.readPreview(request.previewId, request);
      this.assertCompanyScope(company, preview.companyId);
      if (
        request.previewVersion !== preview.previewVersion ||
        (this.controls.expiryRevocationAndNonce &&
          request.expectedEpoch !== preview.revocationEpoch)
      ) {
        throw new ProofConflict('BINDING_MISMATCH');
      }
      this.options.hooks?.beforeRevocationCommit?.();
      preview = this.readPreview(request.previewId, request);
      this.assertCompanyScope(company, preview.companyId);
      if (
        request.previewVersion !== preview.previewVersion ||
        (this.controls.expiryRevocationAndNonce &&
          request.expectedEpoch !== preview.revocationEpoch)
      ) {
        throw new ProofConflict('BINDING_MISMATCH');
      }
      consumption = this.consumeIntent(request.toolInvocation, 'preview.revoke/v1', request);
      const previousEpoch = preview.revocationEpoch;
      preview.revocationEpoch += 1;
      preview.state = request.reason === 'EXPIRED' ? 'EXPIRED' : 'REVOKED';
      preview.rowVersion += 1;
      this.previews.set(preview.previewId, preview);
      for (const session of this.sessions.values()) {
        if (session.previewId === preview.previewId) session.revoked = true;
      }
      this.ledger.revocations += 1;
      this.ledger.businessEvents += 1;
      this.ledger.outboxMessages += 1;
      this.options.hooks?.afterRevocationCommit?.();
      if (this.faults.revocationUnknownAfterEpoch) {
        this.ledger.unknownOutcomes += 1;
        const receipt = this.revocationReceipt(request, {
          outcome: 'UNKNOWN',
          reason: 'UNKNOWN_EXTERNAL_OUTCOME',
          currentAuthorityRead: true,
          effectStarted: true,
          toolConsumption: consumption,
          previousEpoch,
          currentEpoch: preview.revocationEpoch,
          state: preview.state,
          redactionProfile: preview.redactionProfile,
        });
        this.store(request.logicalIdempotencyKey, request.requestDigest, receipt);
        this.record(
          'REVOKE',
          'UNKNOWN',
          'UNKNOWN_EXTERNAL_OUTCOME',
          request,
          company.companyId,
          'PREVIEW',
          preview.previewId,
        );
        return receipt;
      }
      const receipt = this.revocationReceipt(request, {
        outcome: 'SUCCEEDED',
        reason: 'REVOKED',
        currentAuthorityRead: true,
        effectStarted: true,
        toolConsumption: consumption,
        previousEpoch,
        currentEpoch: preview.revocationEpoch,
        state: preview.state,
        redactionProfile: preview.redactionProfile,
      });
      this.store(request.logicalIdempotencyKey, request.requestDigest, receipt);
      this.record(
        'REVOKE',
        'SUCCEEDED',
        'REVOKED',
        request,
        company.companyId,
        'PREVIEW',
        preview.previewId,
      );
      return receipt;
    } catch (error) {
      const classified = this.classify(error);
      const receipt = this.revocationReceipt(request, {
        ...classified,
        effectStarted: consumption !== null,
        toolConsumption: consumption,
        previousEpoch: null,
        currentEpoch: preview?.revocationEpoch ?? null,
        state: preview?.state ?? null,
        redactionProfile: preview?.redactionProfile,
      });
      this.storeIfStable(request.logicalIdempotencyKey, request.requestDigest, receipt);
      this.record(
        'REVOKE',
        classified.outcome,
        classified.reason,
        request,
        company?.companyId ?? null,
        preview === null ? 'NONE' : 'PREVIEW',
        preview?.previewId ?? null,
      );
      return receipt;
    }
  }

  public inspectRevocation(request: ReconciliationRequest): ReconciliationReceipt {
    if (request.target !== 'REVOCATION' || request.stateChanging) {
      return this.reconciliationDenied(request, 'BINDING_MISMATCH');
    }
    return this.reconcile(request);
  }

  public cleanup(request: CleanupRequest): CleanupReceipt {
    this.assertRequestDigest(request);
    this.ledger.cleanupAttempts += 1;
    let preview: PreviewAuthority | null = null;
    let company: CompanyAuthority | null = null;
    let consumption: ToolInvocationConsumption | null = null;
    try {
      company = this.readCompanyBySubject(request.actorSubject, 'CLEANUP', request);
      const replay = this.replay<CleanupReceipt>(
        request.logicalIdempotencyKey,
        request.requestDigest,
      );
      if (replay !== null) return replay;
      preview = this.readPreview(request.previewId, request);
      this.assertCompanyScope(company, preview.companyId);
      if (
        request.previewVersion !== preview.previewVersion ||
        request.expectedEpoch !== preview.revocationEpoch ||
        !['REVOKED', 'EXPIRED', 'QUARANTINED', 'UNKNOWN', 'DELETE_PENDING'].includes(preview.state)
      ) {
        throw new ProofDenied('BINDING_MISMATCH', true);
      }
      consumption = this.consumeIntent(request.toolInvocation, 'preview.cleanup/v1', request);
      preview.state = 'DELETE_PENDING';
      preview.rowVersion += 1;
      this.previews.set(preview.previewId, preview);
      const activePreview = preview;
      const cacheKeys = [...this.cache.keys()].filter((key) =>
        key.includes(activePreview.publicPreviewId),
      );
      const objectKeys = [...this.objects.entries()]
        .filter(([, object]) => object.previewId === activePreview.previewId)
        .map(([key]) => key);
      let deletedObjects = 0;
      let purgedCacheEntries = 0;
      for (const key of cacheKeys) {
        if (this.faults.cleanupPartial && purgedCacheEntries > 0) break;
        if (this.cache.delete(key)) purgedCacheEntries += 1;
      }
      for (const key of objectKeys) {
        if (this.faults.cleanupPartial && deletedObjects > 0) break;
        const object = this.objects.get(key);
        if (object !== undefined) object.state = 'DELETED';
        if (this.objects.delete(key)) deletedObjects += 1;
      }
      this.ledger.cachePurges += purgedCacheEntries;
      this.ledger.objectsDeleted += deletedObjects;
      const remainingObjects = [...this.objects.values()].filter(
        (object) => object.previewId === activePreview.previewId,
      ).length;
      const complete =
        !this.faults.cleanupUnknown &&
        !this.faults.cleanupPartial &&
        remainingObjects === 0 &&
        ![...this.cache.keys()].some((key) => key.includes(activePreview.publicPreviewId));
      if (complete || !this.controls.cleanupDisclosureRedactionAndEvidence) {
        preview.state = 'PURGED';
        this.retiredHosts.add(preview.host);
      } else {
        preview.state = 'UNKNOWN';
        this.ledger.unknownOutcomes += 1;
      }
      preview.rowVersion += 1;
      this.previews.set(preview.previewId, preview);
      const receipt = this.cleanupReceipt(request, {
        outcome: complete ? 'SUCCEEDED' : 'UNKNOWN',
        reason: complete ? 'CLEANUP_COMPLETE' : 'CLEANUP_INCOMPLETE',
        currentAuthorityRead: true,
        effectStarted: true,
        toolConsumption: consumption,
        state: preview.state,
        deletedObjects,
        purgedCacheEntries,
        remainingObjects,
        hostTombstoned: this.retiredHosts.has(preview.host),
        redactionProfile: preview.redactionProfile,
      });
      this.store(request.logicalIdempotencyKey, request.requestDigest, receipt);
      this.ledger.businessEvents += 1;
      this.ledger.outboxMessages += 1;
      this.record(
        'CLEANUP',
        receipt.outcome,
        receipt.reason,
        request,
        company.companyId,
        'PREVIEW',
        preview.previewId,
      );
      return receipt;
    } catch (error) {
      const classified = this.classify(error);
      const receipt = this.cleanupReceipt(request, {
        ...classified,
        effectStarted: consumption !== null,
        toolConsumption: consumption,
        state: preview?.state ?? null,
        deletedObjects: 0,
        purgedCacheEntries: 0,
        remainingObjects: 0,
        hostTombstoned: preview === null ? false : this.retiredHosts.has(preview.host),
        redactionProfile: preview?.redactionProfile,
      });
      this.storeIfStable(request.logicalIdempotencyKey, request.requestDigest, receipt);
      this.record(
        'CLEANUP',
        classified.outcome,
        classified.reason,
        request,
        company?.companyId ?? null,
        preview === null ? 'NONE' : 'PREVIEW',
        preview?.previewId ?? null,
      );
      return receipt;
    }
  }

  public reconcile(request: ReconciliationRequest): ReconciliationReceipt {
    this.assertRequestDigest(request);
    this.ledger.reconciliations += 1;
    let consumption: ToolInvocationConsumption | null = null;
    try {
      const replay = this.replay<ReconciliationReceipt>(
        request.logicalIdempotencyKey,
        request.requestDigest,
      );
      if (replay !== null) return replay;
      const original = this.operationReceipts.get(request.originalLogicalKey);
      if (original === undefined || original.requestDigest !== request.originalRequestDigest) {
        throw new ProofDenied('RESOURCE_NOT_FOUND', true);
      }
      const targetOperation: Readonly<
        Record<ReconciliationRequest['target'], ProofReceipt['operation']>
      > = {
        PUBLICATION: 'PUBLISH',
        GRANT_ISSUE: 'GRANT_ISSUE',
        EXCHANGE: 'EXCHANGE',
        REVOCATION: 'REVOKE',
        CLEANUP: 'CLEANUP',
      };
      if (original.receipt.operation !== targetOperation[request.target]) {
        throw new ProofDenied('BINDING_MISMATCH', true);
      }
      this.authorityRead('RECONCILE', request, null);
      let revocationConfirmed = false;
      if (
        request.target === 'REVOCATION' &&
        original.receipt.operation === 'REVOKE' &&
        original.receipt.outcome === 'UNKNOWN' &&
        (original.receipt as RevocationReceipt).currentEpoch !== null
      ) {
        const revocationReceipt = original.receipt as RevocationReceipt;
        const currentPreview = this.previews.get(revocationReceipt.previewId);
        revocationConfirmed =
          currentPreview !== undefined &&
          currentPreview.revocationEpoch >= (revocationReceipt.currentEpoch as number) &&
          (currentPreview.state === 'REVOKED' || currentPreview.state === 'EXPIRED');
      }
      consumption = this.consumeIntent(request.toolInvocation, 'preview.reconcile/v1', request);
      const stillUnknown =
        original.receipt.outcome === 'UNKNOWN' &&
        this.controls.cleanupDisclosureRedactionAndEvidence &&
        !revocationConfirmed;
      const receipt = this.reconciliationReceipt(request, {
        outcome: stillUnknown ? 'UNKNOWN' : 'SUCCEEDED',
        reason: stillUnknown ? 'UNKNOWN_EXTERNAL_OUTCOME' : 'RECONCILED',
        currentAuthorityRead: true,
        effectStarted: true,
        toolConsumption: consumption,
        target: request.target,
        resolvedReceiptDigest: stillUnknown ? null : canonicalDigest(original.receipt),
      });
      this.store(request.logicalIdempotencyKey, request.requestDigest, receipt);
      this.record('RECONCILE', receipt.outcome, receipt.reason, request, null, 'NONE', null);
      return receipt;
    } catch (error) {
      const classified = this.classify(error);
      const receipt = this.reconciliationReceipt(request, {
        ...classified,
        effectStarted: consumption !== null,
        toolConsumption: consumption,
        target: request.target,
        resolvedReceiptDigest: null,
      });
      this.storeIfStable(request.logicalIdempotencyKey, request.requestDigest, receipt);
      this.record('RECONCILE', classified.outcome, classified.reason, request, null, 'NONE', null);
      return receipt;
    }
  }

  public exportState(): PreviewProofState {
    const entries = <T>(map: Map<string, T>): Array<readonly [string, T]> =>
      [...map.entries()].map(([key, value]) => [key, clone(value)] as const);
    return {
      companies: entries(this.companies),
      builds: entries(this.builds),
      previews: entries(this.previews),
      grants: entries(this.grants),
      sessions: entries(this.sessions),
      objects: entries(this.objects),
      cache: entries(this.cache),
      intents: entries(this.intents),
      operationReceipts: entries(this.operationReceipts),
      retiredHosts: [...this.retiredHosts],
    };
  }

  public importState(state: PreviewProofState): void {
    const load = <T>(target: Map<string, T>, values: ReadonlyArray<readonly [string, T]>): void => {
      target.clear();
      for (const [key, value] of values) target.set(key, clone(value));
    };
    load(this.companies, state.companies);
    load(this.builds, state.builds);
    load(this.previews, state.previews);
    load(this.grants, state.grants);
    load(this.sessions, state.sessions);
    load(this.objects, state.objects);
    load(this.cache, state.cache);
    load(this.intents, state.intents);
    load(this.operationReceipts, state.operationReceipts);
    this.retiredHosts.clear();
    for (const host of state.retiredHosts) this.retiredHosts.add(host);
  }

  public mutateAuthority(
    kind: 'company' | 'build' | 'preview' | 'grant' | 'session',
    id: string,
    mutate: (value: Record<string, unknown>) => void,
  ): void {
    const maps: Record<typeof kind, Map<string, unknown>> = {
      company: this.companies,
      build: this.builds,
      preview: this.previews,
      grant: this.grants,
      session: this.sessions,
    };
    const current = maps[kind].get(id);
    if (current === undefined) throw new Error(`Unknown ${kind}: ${id}`);
    const next = clone(current) as Record<string, unknown>;
    mutate(next);
    maps[kind].set(id, next);
  }

  public mutateObject(key: string, mutate: (object: ObjectRecord) => void): void {
    const current = this.objects.get(key);
    if (current === undefined) throw new Error(`Unknown object: ${key}`);
    const next = clone(current);
    mutate(next);
    this.objects.set(key, next);
  }

  public recordExternalObservation(
    kind: 'controlReceiverHits' | 'externalReceiverHits',
    count = 1,
  ): void {
    if (!Number.isSafeInteger(count) || count < 0)
      throw new TypeError('count must be non-negative');
    this.ledger[kind] += count;
  }

  public assertEvidenceSafe(evidence: unknown, canaries: readonly string[]): void {
    const serialized = canonicalJson(evidence);
    if (
      this.controls.cleanupDisclosureRedactionAndEvidence &&
      (this.faults.redactionFailure ||
        canaries.some((canary) => serialized.includes(canary)) ||
        /-----BEGIN (?:PRIVATE KEY|CERTIFICATE)-----|__Host-aico_preview=|AICO-PREVIEW-GRANT\+JWT/.test(
          serialized,
        ))
    ) {
      this.ledger.redactionDrops += 1;
      throw new ProofDenied('REDACTION_FAILED', false);
    }
  }

  private assertPublicationBindings(
    request: PublicationRequest,
    build: BuildAuthority,
    preview: PreviewAuthority,
  ): void {
    if (
      this.controls.currentAuthorityAndExactBindings &&
      (canonicalDigest(request.build) !== canonicalDigest(build) ||
        canonicalDigest(request.preview) !== canonicalDigest(preview) ||
        this.previewBinding(preview) !== preview.bindingSha256 ||
        this.buildTuple(preview) !== this.buildTuple(build) ||
        preview.headerProfileDigest !== AICO007_FIXTURE_DIGESTS.headerProfileDigest ||
        preview.cacheProfileDigest !== AICO007_FIXTURE_DIGESTS.cacheProfileDigest ||
        canonicalDigest(preview.redactionProfile) !== canonicalDigest(this.defaultRedactionProfile))
    ) {
      throw new ProofDenied('BINDING_MISMATCH', true);
    }
    if (preview.state !== 'PREPARED') throw new ProofDenied('PUBLICATION_NOT_AVAILABLE', true);
    if (this.controls.originAndHostIsolation) {
      if (this.retiredHosts.has(preview.host)) throw new ProofDenied('BINDING_MISMATCH', true);
      const sameHost = [...this.previews.values()].filter(
        (candidate) => candidate.previewId !== preview.previewId && candidate.host === preview.host,
      );
      if (sameHost.length > 0) throw new ProofDenied('BINDING_MISMATCH', true);
    }
    if (
      this.controls.buildAndServeIntegrity &&
      (build.buildResult !== 'SUCCEEDED' || build.canceled || build.quarantined)
    ) {
      throw new ProofDenied('BUILD_NOT_SUCCESSFUL', true);
    }
    this.assertBuildManifest(build);
  }

  private assertBuildManifest(build: BuildAuthority): void {
    if (!this.controls.buildAndServeIntegrity && !this.controls.scriptAndMimeIntegrity) return;
    if (
      build.entries.length === 0 ||
      (this.controls.buildAndServeIntegrity &&
        normalizedManifestDigest(build.entries) !== build.outputManifestDigest) ||
      (this.controls.buildAndServeIntegrity &&
        canonicalDigest(build.entries.map((entry) => entry.contentSha256)) !==
          build.aggregateDigest) ||
      build.entries.some(
        (entry) =>
          (this.controls.buildAndServeIntegrity &&
            (!isSafeManifestPath(entry.path) ||
              entry.path.startsWith('__aico/') ||
              entry.path.endsWith('.map') ||
              entry.bytes <= 0)) ||
          (this.controls.scriptAndMimeIntegrity && !ALLOWED_MEDIA_TYPES.has(entry.mediaType)),
      ) ||
      (this.controls.buildAndServeIntegrity &&
        new Set(build.entries.map((entry) => entry.path.toLowerCase())).size !==
          build.entries.length)
    ) {
      throw new ProofDenied('INTEGRITY_FAILED', true);
    }
  }

  private validateBuildCopy(
    build: BuildAuthority,
    preview: PreviewAuthority,
  ): readonly VerifiedBuildCopy[] {
    const verified: VerifiedBuildCopy[] = [];
    for (const entry of build.entries) {
      const source = this.objects.get(sourceObjectKey(build.buildId, entry.path));
      if (
        source === undefined ||
        source.state !== 'AVAILABLE' ||
        (this.controls.buildAndServeIntegrity &&
          (source.body.byteLength !== entry.bytes ||
            bodyDigest(source.body) !== entry.contentSha256 ||
            source.objectVersionId !== entry.objectVersionId)) ||
        (this.controls.scriptAndMimeIntegrity && source.mediaType !== entry.mediaType)
      ) {
        throw new ProofDenied('INTEGRITY_FAILED', true);
      }
      const destinationKey = previewObjectKey(
        preview.previewId,
        preview.previewVersion,
        entry.path,
      );
      if (this.objects.has(destinationKey)) throw new ProofConflict('BINDING_MISMATCH');
      verified.push({ source: clone(source), destinationKey });
    }
    return verified;
  }

  private copyVerifiedBuild(
    verified: readonly VerifiedBuildCopy[],
    preview: PreviewAuthority,
  ): string[] {
    const keys: string[] = [];
    for (const copy of verified) {
      this.objects.set(copy.destinationKey, {
        ...clone(copy.source),
        previewId: preview.previewId,
        previewVersion: preview.previewVersion,
        state: 'STAGING',
      });
      keys.push(copy.destinationKey);
      this.ledger.objectsCopied += 1;
    }
    return keys;
  }

  private createGrantAuthority(
    request: GrantIssueRequest,
    preview: PreviewAuthority,
    build: BuildAuthority,
    company: CompanyAuthority,
  ): GrantAuthority {
    const base: Omit<GrantAuthority, 'bindingSha256'> = {
      companyId: company.companyId,
      grantId: deterministicId(`${request.requestId}:grant`),
      publicGrantId: request.publicGrantId,
      issuanceRequestId: request.requestId,
      issuanceRequestDigest: request.requestDigest,
      logicalIdempotencyKey: request.logicalIdempotencyKey,
      invocationIntentId: request.toolInvocation.id,
      policyDecisionId: request.toolInvocation.decisionId,
      previewId: preview.previewId,
      previewVersion: preview.previewVersion,
      publicPreviewId: preview.publicPreviewId,
      host: preview.host,
      environment: preview.environment,
      audience: 'PREVIEW_VIEWER',
      runId: build.runId,
      taskId: build.taskId,
      attemptId: build.attemptId,
      buildId: build.buildId,
      buildVersion: build.buildVersion,
      buildResultReceiptId: build.buildResultReceiptId,
      buildResultReceiptVersion: build.buildResultReceiptVersion,
      buildResultReceiptDigest: build.buildResultReceiptDigest,
      artifactId: build.artifactId,
      artifactVersionId: build.artifactVersionId,
      artifactVersion: build.artifactVersion,
      artifactChecksum: build.artifactChecksum,
      outputManifestId: build.outputManifestId,
      outputManifestVersion: build.outputManifestVersion,
      outputManifestDigest: build.outputManifestDigest,
      aggregateDigest: build.aggregateDigest,
      previewRevocationEpoch: preview.revocationEpoch,
      grantRevocationEpoch: 1,
      policyVersion: preview.policyVersion,
      keyVersion: preview.keyVersion,
      nonceDigest: canonicalDigest(request.nonce),
      issuedAt: this.clock.now(),
      notBefore: this.clock.now(),
      expiresAt: request.expiresAt,
      consumedAt: null,
      redactionProfile: clone(preview.redactionProfile),
      meta: childMeta(request.meta, 'GRANT_ISSUE', `${request.requestId}:grant-authority`),
    };
    return { ...base, bindingSha256: this.grantBinding(base) };
  }

  private signGrant(grant: GrantAuthority, nonce: string): SignedAccessGrant {
    const protectedHeader: SignedAccessGrant['protectedHeader'] = {
      typ: 'AICO-PREVIEW-GRANT+JWT',
      alg: 'EdDSA',
      kid: this.signing.keyId,
    };
    const claims: AccessGrantClaims = {
      audience: 'PREVIEW_VIEWER',
      opaque_grant_ref: grant.publicGrantId,
      nonce,
      issued_at: grant.issuedAt,
      not_before: grant.notBefore,
      expires_at: grant.expiresAt,
      origin_hostname: grant.host,
      environment: grant.environment,
      binding_sha256: grant.bindingSha256,
    };
    const encodedHeader = encode(canonicalJson(protectedHeader));
    const encodedClaims = encode(canonicalJson(claims));
    const signingInput = `${encodedHeader}.${encodedClaims}`;
    const signature = ed25519Sign(null, Buffer.from(signingInput), this.privateKey).toString(
      'base64url',
    );
    return { protectedHeader, claims, compact: `${signingInput}.${signature}` };
  }

  private verifyGrant(compact: string): SignedAccessGrant {
    const parts = compact.split('.');
    if (parts.length !== 3) throw new ProofDenied('CREDENTIAL_INVALID', false);
    try {
      const protectedHeader = JSON.parse(decode(parts[0])) as SignedAccessGrant['protectedHeader'];
      const claims = JSON.parse(decode(parts[1])) as AccessGrantClaims;
      if (
        this.controls.currentAuthorityAndExactBindings &&
        (canonicalDigest(protectedHeader) !==
          canonicalDigest({
            typ: 'AICO-PREVIEW-GRANT+JWT',
            alg: 'EdDSA',
            kid: this.signing.keyId,
          }) ||
          !hasExactKeys(claims, [
            'audience',
            'opaque_grant_ref',
            'nonce',
            'issued_at',
            'not_before',
            'expires_at',
            'origin_hostname',
            'environment',
            'binding_sha256',
          ]))
      ) {
        throw new ProofDenied('CREDENTIAL_INVALID', false);
      }
      if (
        !ed25519Verify(
          null,
          Buffer.from(`${parts[0]}.${parts[1]}`),
          this.publicKey,
          Buffer.from(parts[2], 'base64url'),
        )
      ) {
        throw new ProofDenied('CREDENTIAL_INVALID', false);
      }
      return { protectedHeader, claims, compact };
    } catch (error) {
      if (error instanceof ProofDenied) throw error;
      throw new ProofDenied('CREDENTIAL_INVALID', false);
    }
  }

  private assertExchangeBindings(
    request: ExchangeRequest,
    claims: AccessGrantClaims,
    grant: GrantAuthority,
    preview: PreviewAuthority,
    build: BuildAuthority,
  ): void {
    if (
      this.controls.originAndHostIsolation &&
      (request.host !== claims.origin_hostname ||
        request.environment !== claims.environment ||
        grant.host !== claims.origin_hostname ||
        grant.environment !== claims.environment ||
        preview.host !== claims.origin_hostname ||
        preview.environment !== claims.environment)
    ) {
      throw new ProofDenied('BINDING_MISMATCH', true);
    }
    if (this.controls.currentAuthorityAndExactBindings) {
      if (
        claims.audience !== 'PREVIEW_VIEWER' ||
        claims.binding_sha256 !== grant.bindingSha256 ||
        this.grantBinding(grant) !== grant.bindingSha256 ||
        grant.publicPreviewId !== preview.publicPreviewId ||
        grant.previewVersion !== preview.previewVersion ||
        this.buildTuple(grant) !== this.buildTuple(preview) ||
        this.buildTuple(grant) !== this.buildTuple(build) ||
        grant.nonceDigest !== canonicalDigest(claims.nonce) ||
        grant.policyVersion !== preview.policyVersion ||
        grant.keyVersion !== preview.keyVersion
      ) {
        throw new ProofDenied('BINDING_MISMATCH', true);
      }
    }
    this.assertPreviewAvailable(preview);
    if (
      this.controls.expiryRevocationAndNonce &&
      (grant.previewRevocationEpoch !== preview.revocationEpoch ||
        Date.parse(this.clock.now()) < Date.parse(grant.notBefore) ||
        Date.parse(this.clock.now()) >= Date.parse(grant.expiresAt))
    ) {
      throw new ProofDenied('CREDENTIAL_EXPIRED', true);
    }
  }

  private createSession(grant: GrantAuthority): SessionAuthority {
    const base: Omit<SessionAuthority, 'bindingSha256'> = {
      sessionId: deterministicId(`${grant.grantId}:session`),
      presentationDigest: canonicalDigest('pending-presentation'),
      grantId: grant.grantId,
      companyId: grant.companyId,
      previewId: grant.previewId,
      previewVersion: grant.previewVersion,
      publicPreviewId: grant.publicPreviewId,
      host: grant.host,
      environment: grant.environment,
      grantBindingSha256: grant.bindingSha256,
      runId: grant.runId,
      taskId: grant.taskId,
      attemptId: grant.attemptId,
      buildId: grant.buildId,
      buildVersion: grant.buildVersion,
      buildResultReceiptId: grant.buildResultReceiptId,
      buildResultReceiptVersion: grant.buildResultReceiptVersion,
      buildResultReceiptDigest: grant.buildResultReceiptDigest,
      artifactId: grant.artifactId,
      artifactVersionId: grant.artifactVersionId,
      artifactVersion: grant.artifactVersion,
      artifactChecksum: grant.artifactChecksum,
      outputManifestId: grant.outputManifestId,
      outputManifestVersion: grant.outputManifestVersion,
      outputManifestDigest: grant.outputManifestDigest,
      aggregateDigest: grant.aggregateDigest,
      previewRevocationEpoch: grant.previewRevocationEpoch,
      grantRevocationEpoch: grant.grantRevocationEpoch,
      policyVersion: grant.policyVersion,
      keyVersion: grant.keyVersion,
      expiresAt: grant.expiresAt,
      revoked: false,
      redactionProfile: clone(grant.redactionProfile),
    };
    return { ...base, bindingSha256: this.sessionBinding(base) };
  }

  private signSession(session: SessionAuthority): string {
    const payload = encode(session.sessionId);
    const signature = ed25519Sign(null, Buffer.from(payload), this.privateKey).toString(
      'base64url',
    );
    return `${payload}.${signature}`;
  }

  private verifySessionPresentation(presentation: string | null): SessionAuthority {
    if (presentation === null) throw new ProofDenied('CREDENTIAL_INVALID', false);
    const parts = presentation.split('.');
    if (parts.length !== 2) throw new ProofDenied('CREDENTIAL_INVALID', false);
    if (
      !ed25519Verify(
        null,
        Buffer.from(parts[0]),
        this.publicKey,
        Buffer.from(parts[1], 'base64url'),
      )
    ) {
      throw new ProofDenied('CREDENTIAL_INVALID', false);
    }
    try {
      const sessionId = decode(parts[0]);
      const session = this.sessions.get(sessionId);
      if (session === undefined || session.presentationDigest !== canonicalDigest(presentation)) {
        throw new ProofDenied('CREDENTIAL_INVALID', false);
      }
      return clone(session);
    } catch (error) {
      if (error instanceof ProofDenied) throw error;
      throw new ProofDenied('CREDENTIAL_INVALID', false);
    }
  }

  private assertContentAuthority(
    request: AccessRequest,
    session: SessionAuthority,
    company: CompanyAuthority,
    preview: PreviewAuthority,
    build: BuildAuthority,
  ): void {
    if (
      this.controls.originAndHostIsolation &&
      (session.host !== request.host || session.environment !== request.environment)
    ) {
      throw new ProofDenied('BINDING_MISMATCH', true);
    }
    if (this.controls.currentAuthorityAndExactBindings) {
      if (
        company.status !== 'ACTIVE' ||
        session.companyId !== company.companyId ||
        preview.companyId !== company.companyId ||
        build.companyId !== company.companyId ||
        session.previewId !== preview.previewId ||
        session.previewVersion !== preview.previewVersion ||
        session.publicPreviewId !== preview.publicPreviewId ||
        session.host !== preview.host ||
        session.environment !== preview.environment ||
        session.keyVersion !== preview.keyVersion ||
        this.buildTuple(session) !== this.buildTuple(preview) ||
        this.buildTuple(session) !== this.buildTuple(build) ||
        (this.controls.expiryRevocationAndNonce &&
          session.previewRevocationEpoch !== preview.revocationEpoch) ||
        session.policyVersion !== preview.policyVersion ||
        canonicalDigest(session.redactionProfile) !== canonicalDigest(preview.redactionProfile) ||
        this.sessionBinding(session) !== session.bindingSha256 ||
        preview.buildId !== build.buildId ||
        preview.buildVersion !== build.buildVersion ||
        preview.buildResultReceiptDigest !== build.buildResultReceiptDigest ||
        preview.artifactVersionId !== build.artifactVersionId ||
        preview.artifactChecksum !== build.artifactChecksum ||
        preview.outputManifestDigest !== build.outputManifestDigest ||
        this.previewBinding(preview) !== preview.bindingSha256 ||
        preview.headerProfileDigest !== canonicalDigest(GENERATED_RESPONSE_HEADERS) ||
        preview.cacheProfileDigest !== AICO007_FIXTURE_DIGESTS.cacheProfileDigest
      ) {
        throw new ProofDenied('BINDING_MISMATCH', true);
      }
      const grant = this.grants.get(session.grantId);
      if (
        grant === undefined ||
        grant.companyId !== company.companyId ||
        grant.companyId !== session.companyId ||
        grant.companyId !== preview.companyId ||
        grant.companyId !== build.companyId ||
        grant.previewId !== session.previewId ||
        grant.previewId !== preview.previewId ||
        grant.previewVersion !== session.previewVersion ||
        grant.previewVersion !== preview.previewVersion ||
        grant.publicPreviewId !== session.publicPreviewId ||
        grant.publicPreviewId !== preview.publicPreviewId ||
        grant.host !== session.host ||
        grant.host !== preview.host ||
        grant.environment !== session.environment ||
        grant.environment !== preview.environment ||
        this.buildTuple(grant) !== this.buildTuple(session) ||
        this.buildTuple(grant) !== this.buildTuple(preview) ||
        this.buildTuple(grant) !== this.buildTuple(build) ||
        (this.controls.expiryRevocationAndNonce &&
          (grant.previewRevocationEpoch !== session.previewRevocationEpoch ||
            grant.previewRevocationEpoch !== preview.revocationEpoch ||
            grant.grantRevocationEpoch !== session.grantRevocationEpoch)) ||
        grant.policyVersion !== session.policyVersion ||
        grant.policyVersion !== preview.policyVersion ||
        grant.keyVersion !== session.keyVersion ||
        grant.keyVersion !== preview.keyVersion ||
        canonicalDigest(grant.redactionProfile) !== canonicalDigest(session.redactionProfile) ||
        canonicalDigest(grant.redactionProfile) !== canonicalDigest(preview.redactionProfile) ||
        session.grantBindingSha256 !== grant.bindingSha256 ||
        this.grantBinding(grant) !== grant.bindingSha256
      ) {
        throw new ProofDenied('BINDING_MISMATCH', true);
      }
    }
    if (
      this.controls.expiryRevocationAndNonce &&
      (session.revoked ||
        Date.parse(this.clock.now()) >= Date.parse(session.expiresAt) ||
        preview.state !== 'AVAILABLE' ||
        Date.parse(this.clock.now()) >= Date.parse(preview.expiresAt))
    ) {
      throw new ProofDenied('PUBLICATION_NOT_AVAILABLE', true);
    }
  }

  private assertPreviewAvailable(preview: PreviewAuthority): void {
    if (
      this.controls.expiryRevocationAndNonce &&
      (preview.state !== 'AVAILABLE' ||
        Date.parse(this.clock.now()) >= Date.parse(preview.expiresAt))
    ) {
      throw new ProofDenied('PUBLICATION_NOT_AVAILABLE', true);
    }
  }

  private assertRequestSurface(request: AccessRequest): void {
    if (!this.controls.methodPathAndReferrerSafety) return;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      throw new ProofDenied('METHOD_NOT_ALLOWED', false);
    }
    if (
      request.range !== null ||
      request.ifNoneMatch !== null ||
      request.path.startsWith('/__aico')
    ) {
      throw new ProofDenied('PATH_NOT_ALLOWED', false);
    }
  }

  private normalizeAccessPath(request: AccessRequest, preview: PreviewAuthority): string {
    let path: string;
    try {
      path = decodeURIComponent(request.path.split('?')[0] ?? '');
    } catch {
      throw new ProofDenied('PATH_NOT_ALLOWED', false);
    }
    if (path === '/') return this.readBuild(preview.buildId, request).entryDocument;
    const relative = path.replace(/^\//, '');
    if (!isSafeManifestPath(relative)) throw new ProofDenied('PATH_NOT_ALLOWED', false);
    const build = this.readBuild(preview.buildId, request);
    if (build.entries.some((entry) => entry.path === relative)) return relative;
    if (request.navigation && !relative.includes('.')) return build.entryDocument;
    throw new ProofDenied('PATH_NOT_ALLOWED', false);
  }

  private cacheKey(preview: PreviewAuthority, entry: BuildAuthority['entries'][number]): string {
    if (!this.controls.authorizeBeforeCache) {
      return canonicalJson({ cacheClass: 'unsafe-shared-preview-body' });
    }
    return canonicalJson({
      environment: preview.environment,
      publicPreviewId: preview.publicPreviewId,
      previewId: preview.previewId,
      previewVersion: preview.previewVersion,
      outputManifestDigest: preview.outputManifestDigest,
      normalizedPath: entry.path,
      objectVersionId: entry.objectVersionId,
      contentSha256: entry.contentSha256,
      headerProfileDigest: preview.headerProfileDigest,
    });
  }

  private consumeIntent(
    supplied: ToolInvocationIntent,
    action: ToolInvocationIntent['action'],
    request: OperationRequest,
  ): ToolInvocationConsumption {
    const stored = this.intents.get(supplied.id);
    if (
      stored === undefined ||
      stored.action !== action ||
      stored.maximumUses !== 1 ||
      stored.requestDigest !== request.requestDigest ||
      stored.logicalInvocationKey !==
        ('logicalIdempotencyKey' in request ? request.logicalIdempotencyKey : '') ||
      (this.controls.currentAuthorityAndExactBindings &&
        canonicalDigest(stored) !== canonicalDigest(supplied)) ||
      Date.parse(this.clock.now()) >= Date.parse(stored.expiresAt)
    ) {
      throw new ProofDenied('INVOCATION_INVALID', true);
    }
    if (stored.used !== 0) throw new ProofDenied('INVOCATION_ALREADY_CONSUMED', true);
    stored.used = 1;
    this.intents.set(stored.id, stored);
    this.ledger.toolIntentsConsumed += 1;
    return {
      intentId: stored.id,
      consumptionId: deterministicId(`${stored.id}:consumption:1`),
      logicalInvocationKey: stored.logicalInvocationKey,
      requestDigest: stored.requestDigest,
      useOrdinal: 1,
      consumedAt: this.clock.now(),
    };
  }

  private readCompanyBySubject(
    subject: string,
    operation: ProofOperation,
    request: OperationRequest,
  ): CompanyAuthority {
    this.authorityRead(operation, request, null);
    const company = [...this.companies.values()].find(
      (candidate) => candidate.founderSubject === subject && candidate.status === 'ACTIVE',
    );
    if (company === undefined) throw new ProofDenied('AUTHENTICATION_REQUIRED', true);
    return clone(company);
  }

  private readCompany(
    companyId: string,
    request: OperationRequest,
    operation: ProofOperation,
  ): CompanyAuthority {
    this.authorityRead(operation, request, null);
    const company = this.companies.get(companyId);
    if (company === undefined || company.status !== 'ACTIVE') {
      throw new ProofDenied('RESOURCE_NOT_FOUND', true);
    }
    return clone(company);
  }

  private readBuild(buildId: string, request: OperationRequest): BuildAuthority {
    this.authorityRead(operationOf(request), request, null);
    const build = this.builds.get(buildId);
    if (build === undefined) throw new ProofDenied('RESOURCE_NOT_FOUND', true);
    return clone(build);
  }

  private readPreview(previewId: string, request: OperationRequest): PreviewAuthority {
    this.authorityRead(operationOf(request), request, null);
    const preview = this.previews.get(previewId);
    if (preview === undefined) throw new ProofDenied('RESOURCE_NOT_FOUND', true);
    return clone(preview);
  }

  private authorityRead(
    operation: ProofOperation,
    request: OperationRequest,
    rowVersion: number | null,
  ): void {
    this.options.hooks?.beforeAuthorityRead?.(operation);
    this.ledger.authorityReads += 1;
    if (this.faults.authorityUnavailable && this.controls.currentAuthorityAndExactBindings) {
      throw new ProofDenied('AUTHORITY_UNAVAILABLE', false);
    }
    this.options.hooks?.afterAuthorityRead?.(operation, rowVersion);
    this.record('AUTHORITY_READ', 'ALLOWED', 'ACCESS_ALLOWED', request, null, 'NONE', null);
  }

  private assertCompanyScope(company: CompanyAuthority, ...companyIds: string[]): void {
    if (
      this.controls.currentAuthorityAndExactBindings &&
      companyIds.some((companyId) => companyId !== company.companyId)
    ) {
      throw new ProofDenied('TENANT_MISMATCH', true);
    }
  }

  private assertRequestDigest(request: OperationRequest): void {
    if (
      this.controls.currentAuthorityAndExactBindings &&
      canonicalRequestDigest(request as OperationRequest & Record<string, unknown>) !==
        request.requestDigest
    ) {
      throw new ProofConflict('BINDING_MISMATCH');
    }
  }

  private replay<T extends ProofReceipt>(logicalKey: string, requestDigest: Sha256): T | null {
    const stored = this.operationReceipts.get(logicalKey);
    if (stored === undefined) return null;
    if (stored.requestDigest !== requestDigest) throw new ProofConflict();
    return { ...(clone(stored.receipt) as T), replayed: true };
  }

  private store(logicalKey: string, requestDigest: Sha256, receipt: ProofReceipt): void {
    this.operationReceipts.set(logicalKey, { requestDigest, receipt: clone(receipt) });
  }

  private storeIfStable(logicalKey: string, requestDigest: Sha256, receipt: ProofReceipt): void {
    if (receipt.outcome !== 'CONFLICT' && !this.operationReceipts.has(logicalKey)) {
      this.store(logicalKey, requestDigest, receipt);
    }
  }

  private classify(error: unknown): {
    outcome: OperationOutcome;
    reason: ProofReason;
    currentAuthorityRead: boolean;
  } {
    if (error instanceof ProofConflict) {
      this.ledger.conflicts += 1;
      return { outcome: 'CONFLICT', reason: error.reason, currentAuthorityRead: true };
    }
    if (error instanceof ProofDenied) {
      this.ledger.denials += 1;
      return {
        outcome: 'DENIED',
        reason: error.reason,
        currentAuthorityRead: error.currentAuthorityRead,
      };
    }
    throw error;
  }

  private receiptBase(input: ReceiptBaseInput): ProofReceipt {
    const meta = childMeta(input.request.meta, input.operation, input.request.requestId);
    const redactionProfile = clone(this.defaultRedactionProfile);
    return {
      schemaVersion: 1,
      receiptId: deterministicId(`${input.request.requestId}:${input.operation}:receipt`),
      operation: input.operation,
      requestId: input.request.requestId,
      requestDigest: input.request.requestDigest,
      outcome: input.outcome,
      reason: input.reason,
      replayed: input.replayed ?? false,
      currentAuthorityRead: input.currentAuthorityRead,
      effectStarted: input.effectStarted,
      toolConsumption: clone(input.toolConsumption ?? null),
      redactionProfile,
      meta,
      occurredAt: this.clock.now(),
      detailDigest: canonicalDigest({
        operation: input.operation,
        outcome: input.outcome,
        reason: input.reason,
        requestDigest: input.request.requestDigest,
        detail: input.detail ?? null,
      }),
    };
  }

  private publicationReceipt(
    request: PublicationRequest,
    input: Omit<ReceiptBaseInput, 'operation' | 'request'> & { preview: PreviewAuthority | null },
  ): PublicationReceipt {
    return {
      ...this.receiptBase({ ...input, operation: 'PUBLISH', request }),
      operation: 'PUBLISH',
      previewId: input.preview?.previewId ?? null,
      host: input.preview?.host ?? null,
      state: input.preview?.state ?? null,
    };
  }

  private grantReceipt(
    request: GrantIssueRequest,
    input: Omit<ReceiptBaseInput, 'operation' | 'request'> & {
      publicGrantId: string | null;
      bindingSha256: Sha256 | null;
      capabilityDigest: Sha256 | null;
    },
  ): GrantIssueReceipt {
    return {
      ...this.receiptBase({ ...input, operation: 'GRANT_ISSUE', request }),
      operation: 'GRANT_ISSUE',
      publicGrantId: input.publicGrantId,
      bindingSha256: input.bindingSha256,
      capabilityDigest: input.capabilityDigest,
    };
  }

  private exchangeReceipt(
    request: ExchangeRequest,
    input: Omit<ReceiptBaseInput, 'operation' | 'request'> & {
      sessionId: string | null;
      cookieAttributes: string | null;
      redirectPath: '/' | null;
    },
  ): ExchangeReceipt {
    return {
      ...this.receiptBase({ ...input, operation: 'EXCHANGE', request }),
      operation: 'EXCHANGE',
      sessionId: input.sessionId,
      cookieAttributes: input.cookieAttributes,
      redirectPath: input.redirectPath,
    };
  }

  private accessReceipt(
    request: AccessRequest,
    input: Omit<ReceiptBaseInput, 'operation' | 'request' | 'effectStarted'> & {
      response: AccessReceipt['response'];
      cacheResult: AccessReceipt['cacheResult'];
      normalizedPathDigest: Sha256 | null;
    },
  ): AccessReceipt {
    return {
      ...this.receiptBase({ ...input, operation: 'ACCESS', request, effectStarted: false }),
      operation: 'ACCESS',
      response: clone(input.response),
      cacheResult: input.cacheResult,
      normalizedPathDigest: input.normalizedPathDigest,
    };
  }

  private revocationReceipt(
    request: RevocationRequest,
    input: Omit<ReceiptBaseInput, 'operation' | 'request'> & {
      previousEpoch: number | null;
      currentEpoch: number | null;
      state: PreviewAuthority['state'] | null;
    },
  ): RevocationReceipt {
    return {
      ...this.receiptBase({ ...input, operation: 'REVOKE', request }),
      operation: 'REVOKE',
      previewId: request.previewId,
      previousEpoch: input.previousEpoch,
      currentEpoch: input.currentEpoch,
      state: input.state,
    };
  }

  private cleanupReceipt(
    request: CleanupRequest,
    input: Omit<ReceiptBaseInput, 'operation' | 'request'> & {
      state: PreviewAuthority['state'] | null;
      deletedObjects: number;
      purgedCacheEntries: number;
      remainingObjects: number;
      hostTombstoned: boolean;
    },
  ): CleanupReceipt {
    return {
      ...this.receiptBase({ ...input, operation: 'CLEANUP', request }),
      operation: 'CLEANUP',
      state: input.state,
      deletedObjects: input.deletedObjects,
      purgedCacheEntries: input.purgedCacheEntries,
      remainingObjects: input.remainingObjects,
      hostTombstoned: input.hostTombstoned,
    };
  }

  private reconciliationReceipt(
    request: ReconciliationRequest,
    input: Omit<ReceiptBaseInput, 'operation' | 'request'> & {
      target: ReconciliationRequest['target'];
      resolvedReceiptDigest: Sha256 | null;
    },
  ): ReconciliationReceipt {
    return {
      ...this.receiptBase({ ...input, operation: 'RECONCILE', request }),
      operation: 'RECONCILE',
      target: input.target,
      resolvedReceiptDigest: input.resolvedReceiptDigest,
    };
  }

  private reconciliationDenied(
    request: ReconciliationRequest,
    reason: ProofReason,
  ): ReconciliationReceipt {
    this.ledger.denials += 1;
    return this.reconciliationReceipt(request, {
      outcome: 'DENIED',
      reason,
      currentAuthorityRead: false,
      effectStarted: false,
      target: request.target,
      resolvedReceiptDigest: null,
    });
  }

  private handlePublicationError(
    request: PublicationRequest,
    error: unknown,
    company: CompanyAuthority | null,
    preview: PreviewAuthority | null,
    consumption: ToolInvocationConsumption | null,
  ): PublicationReceipt {
    const classified = this.classify(error);
    const receipt = this.publicationReceipt(request, {
      ...classified,
      effectStarted: consumption !== null,
      toolConsumption: consumption,
      preview,
      redactionProfile: preview?.redactionProfile,
    });
    this.storeIfStable(request.logicalIdempotencyKey, request.requestDigest, receipt);
    this.record(
      'PUBLISH',
      classified.outcome,
      classified.reason,
      request,
      company?.companyId ?? null,
      'NONE',
      null,
    );
    return receipt;
  }

  private record(
    operation: ProofOperation,
    result: OperationOutcome,
    reason: ProofReason,
    request: OperationRequest,
    companyId: string | null,
    resourceClass: LedgerEntry['resourceClass'],
    resourceId: string | null,
  ): void {
    const entry: LedgerEntry = {
      sequence: ++this.sequence,
      operation,
      result,
      reason,
      requestDigest: request.requestDigest,
      companyId,
      resourceClass,
      resourceIdDigest: resourceId === null ? null : canonicalDigest(resourceId),
      meta: childMeta(request.meta, operation, `${request.requestId}:ledger:${this.sequence}`),
      redactionProfile: clone(this.defaultRedactionProfile),
      occurredAt: this.clock.now(),
    };
    this.ledger.entries.push(entry);
  }

  private responseHeaders(): Readonly<Record<string, string>> {
    if (this.controls.exactCspAndTargetDenial) return GENERATED_RESPONSE_HEADERS;
    return Object.freeze(
      Object.fromEntries(
        Object.entries(GENERATED_RESPONSE_HEADERS).filter(
          ([name]) => name !== 'content-security-policy',
        ),
      ),
    );
  }

  private previewBinding(preview: PreviewAuthority): Sha256 {
    return canonicalDigest({
      domain: 'aico.preview-binding/v1',
      companyId: preview.companyId,
      previewId: preview.previewId,
      previewVersion: preview.previewVersion,
      publicPreviewId: preview.publicPreviewId,
      host: preview.host,
      environment: preview.environment,
      runId: preview.runId,
      taskId: preview.taskId,
      attemptId: preview.attemptId,
      buildId: preview.buildId,
      buildVersion: preview.buildVersion,
      buildResultReceiptId: preview.buildResultReceiptId,
      buildResultReceiptVersion: preview.buildResultReceiptVersion,
      buildResultReceiptDigest: preview.buildResultReceiptDigest,
      artifactId: preview.artifactId,
      artifactVersionId: preview.artifactVersionId,
      artifactVersion: preview.artifactVersion,
      artifactChecksum: preview.artifactChecksum,
      outputManifestId: preview.outputManifestId,
      outputManifestVersion: preview.outputManifestVersion,
      outputManifestDigest: preview.outputManifestDigest,
      aggregateDigest: preview.aggregateDigest,
      policyVersion: preview.policyVersion,
      keyVersion: preview.keyVersion,
      headerProfileDigest: preview.headerProfileDigest,
      cacheProfileDigest: preview.cacheProfileDigest,
      redactionProfile: preview.redactionProfile,
    });
  }

  private grantBinding(grant: Omit<GrantAuthority, 'bindingSha256'> | GrantAuthority): Sha256 {
    return canonicalDigest({
      domain: 'aico.preview-grant-binding/v1',
      ...grant,
      bindingSha256: undefined,
      consumedAt: undefined,
    });
  }

  private buildTuple(value: BuildBindingSource): Sha256 {
    return canonicalDigest({
      domain: 'aico.successful-build-binding/v1',
      runId: value.runId,
      taskId: value.taskId,
      attemptId: value.attemptId,
      buildId: value.buildId,
      buildVersion: value.buildVersion,
      buildResultReceiptId: value.buildResultReceiptId,
      buildResultReceiptVersion: value.buildResultReceiptVersion,
      buildResultReceiptDigest: value.buildResultReceiptDigest,
      artifactId: value.artifactId,
      artifactVersionId: value.artifactVersionId,
      artifactVersion: value.artifactVersion,
      artifactChecksum: value.artifactChecksum,
      outputManifestId: value.outputManifestId,
      outputManifestVersion: value.outputManifestVersion,
      outputManifestDigest: value.outputManifestDigest,
      aggregateDigest: value.aggregateDigest,
    });
  }

  private sessionBinding(
    session: Omit<SessionAuthority, 'bindingSha256'> | SessionAuthority,
  ): Sha256 {
    return canonicalDigest({
      domain: 'aico.preview-session-binding/v1',
      ...session,
      bindingSha256: undefined,
      presentationDigest: undefined,
      revoked: undefined,
    });
  }

  private quarantine(preview: PreviewAuthority, request: AccessRequest): void {
    preview.state = 'QUARANTINED';
    preview.revocationEpoch += 1;
    preview.rowVersion += 1;
    this.previews.set(preview.previewId, preview);
    this.ledger.businessEvents += 1;
    this.ledger.outboxMessages += 1;
    this.record(
      'SECURITY_SIGNAL',
      'DENIED',
      'INTEGRITY_FAILED',
      request,
      preview.companyId,
      'PREVIEW',
      preview.previewId,
    );
  }
}

const ALLOWED_MEDIA_TYPES = new Set([
  'text/html; charset=utf-8',
  'text/css; charset=utf-8',
  'text/javascript; charset=utf-8',
  'application/json; charset=utf-8',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'font/woff2',
]);

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return canonicalJson(actual) === canonicalJson(expected);
}

function deterministicId(label: string): string {
  const hex = canonicalDigest(label).slice(7, 39);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function childMeta(parent: CausalMeta, operation: string, label: string): CausalMeta {
  return {
    messageId: deterministicId(`${label}:message`),
    correlationId: parent.correlationId,
    causationId: parent.messageId,
    traceId: parent.traceId,
    spanId: canonicalDigest({ label, operation, kind: 'span' }).slice(7, 23),
    parentSpanId: parent.spanId,
    operationAttemptId: deterministicId(`${label}:attempt`),
  };
}

function operationOf(request: OperationRequest): ProofOperation {
  if ('build' in request && 'preview' in request) return 'PUBLISH';
  if ('publicGrantId' in request) return 'GRANT_ISSUE';
  if ('capability' in request) return 'EXCHANGE';
  if ('cookiePresentation' in request) return 'ACCESS';
  if ('reason' in request && 'expectedEpoch' in request) return 'REVOKE';
  if ('expectedEpoch' in request) return 'CLEANUP';
  return 'RECONCILE';
}
