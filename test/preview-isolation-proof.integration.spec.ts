import {
  A7_THREAT_CASES,
  GENERATED_RESPONSE_HEADERS,
  bodyDigest,
  canonicalDigest,
  canonicalRequestDigest,
  type A7ThreatCase,
  type AccessReceipt,
  type BuildAuthority,
  type CleanupRequest,
  type ExchangeRequest,
  type GrantIssueResult,
  type GrantIssueRequest,
  type PublicationRequest,
  type Sha256,
  type SideEffectLedger,
  type ToolInvocationIntent,
} from './aico-007-spike/contracts';
import {
  AICO007_BOOTSTRAP_CSP,
  AICO007_GENERATED_CSP,
  AICO007_SECURITY_HEADERS,
  createBrowserHttpAdapter,
  runBrowserHttpBoundaryProbes,
  startLoopbackBrowserHttpServer,
} from './aico-007-spike/browser-http-adapter';
import {
  AICO007_CANARIES,
  AICO007_EXPIRES_AT,
  AICO007_FIXTURE_DIGESTS,
  createPreviewProofFixture,
  fixtureUuid,
  previewObjectKey,
  sourceObjectKey,
  type PreviewProofFixture,
} from './aico-007-spike/fixture';
import {
  PreviewProofService,
  type PreviewProofServiceOptions,
} from './aico-007-spike/preview-proof-service';
import {
  REAL_BROWSER_EXPECTED_PROBES,
  runRealBrowserHarness,
  type RealBrowserHarnessCounts,
  type RealBrowserHarnessDigests,
  type RealBrowserOriginClass,
  type RealBrowserProbeObservation,
} from './aico-007-spike/real-browser-harness';

jest.setTimeout(120_000);

const enabled = process.env.AICO_REQUIRE_PREVIEW_PROOF === 'true';
const describeProof = enabled ? describe : describe.skip;
const onlyCase = process.env.AICO007_ONLY_CASE as A7ThreatCase | undefined;

interface ProofContext {
  fixture: PreviewProofFixture;
  service: PreviewProofService;
}

interface PublishedSession extends ProofContext {
  publicationRequest: PublicationRequest;
  sessionPresentation: string;
  sessionId: string;
}

interface IssuedGrantContext extends ProofContext {
  publicationRequest: PublicationRequest;
  grantRequest: GrantIssueRequest;
  grantResult: GrantIssueResult;
}

interface SafeFileHashResult {
  pathClass: string;
  expectedDigest: string;
  actualDigest: string;
  matched: boolean;
}

interface SafeCleanupResult {
  resultClass: string;
  objectsRemaining: number;
  cacheEntriesRemaining: number;
  retiredHosts: number;
}

interface SafeCaseEvidence {
  caseId: A7ThreatCase;
  resultClass: 'PASSED';
  reasonClass: string;
  ledgerDigest: Sha256;
  sideEffectTotals: {
    authorityReads: number;
    objectReads: number;
    cacheLookups: number;
    generatedBytesServed: number;
    foreignBytesServed: number;
    businessEvents: number;
    outboxMessages: number;
    providerCalls: number;
    toolCalls: number;
    sandboxCalls: number;
    costEffects: number;
    redactionDrops: number;
  };
  cleanupResult: SafeCleanupResult | null;
  fileHashResults: readonly SafeFileHashResult[];
}

interface SafeRealBrowserEvidence {
  kind: 'COMPLETED';
  trustMode: 'DISPOSABLE_CA_SPKI';
  counts: RealBrowserHarnessCounts;
  probeSummary: readonly RealBrowserProbeObservation[];
  originClasses: readonly RealBrowserOriginClass[];
  digests: RealBrowserHarnessDigests;
  freshProfileRemoved: true;
}

interface EvidenceCollector {
  services: PreviewProofService[];
  browserLedgerDigests: Sha256[];
  cleanupResult: SafeCleanupResult | null;
  fileHashResults: SafeFileHashResult[];
}

interface CaseProver {
  reasonClass: string;
  run(caseId: A7ThreatCase): number | Promise<number>;
}

let activeEvidence: EvidenceCollector | null = null;

describeProof('AICO-007 bounded preview-isolation architecture proof', () => {
  test('proves the exact closed 39-case registry with bounded effects', async () => {
    if (onlyCase !== undefined && !A7_THREAT_CASES.includes(onlyCase)) {
      throw new Error(`Unknown AICO007_ONLY_CASE: ${onlyCase}`);
    }
    const selected: readonly A7ThreatCase[] = onlyCase === undefined ? A7_THREAT_CASES : [onlyCase];
    const passed = new Set<A7ThreatCase>();
    const caseEvidence: SafeCaseEvidence[] = [];

    expect(Object.keys(CASE_PROVERS)).toEqual([...A7_THREAT_CASES]);

    for (const caseId of selected) {
      try {
        caseEvidence.push(await proveCase(caseId));
        passed.add(caseId);
      } catch (error) {
        throw new Error(`${caseId} failed`, { cause: error });
      }
    }

    expect([...passed]).toEqual([...selected]);
    if (onlyCase === undefined) expect([...passed]).toEqual([...A7_THREAT_CASES]);
    const realBrowserEvidence = onlyCase === undefined ? await proveRealBrowserBoundary() : null;
    process.stdout.write(
      `${JSON.stringify({
        evidenceSchema: 'aico-007-integration-proof/v1',
        claimClass: 'ARCHITECTURE_TEST_ONLY',
        repositorySha: process.env.AICO_PREVIEW_PROOF_REPOSITORY_SHA ?? 'UNCOMMITTED',
        dirtyDevelopmentEvidence: process.env.AICO_PREVIEW_PROOF_DIRTY_DEVELOPMENT === 'true',
        selectedCases: selected,
        passedCases: passed.size,
        caseRegistryDigest: canonicalDigest(A7_THREAT_CASES),
        caseEvidence,
        realBrowserEvidence,
        inputDigests: {
          fixtureAggregate: AICO007_FIXTURE_DIGESTS.aggregateDigest,
          headerProfile: AICO007_FIXTURE_DIGESTS.headerProfileDigest,
          cacheProfile: AICO007_FIXTURE_DIGESTS.cacheProfileDigest,
          redactionProfile: AICO007_FIXTURE_DIGESTS.redactionProfileDigest,
        },
        browserBoundaryProbes: 14,
        paidExternalServices: 0,
        productionCredentials: 0,
      })}\n`,
    );
  });
});

async function proveCase(caseId: A7ThreatCase): Promise<SafeCaseEvidence> {
  const prover: CaseProver | undefined = CASE_PROVERS[caseId];
  if (prover === undefined) throw new Error(`No exhaustive dispatch for ${caseId}`);
  const collector: EvidenceCollector = {
    services: [],
    browserLedgerDigests: [],
    cleanupResult: null,
    fileHashResults: [],
  };
  activeEvidence = collector;
  try {
    const vectorCount = await prover.run(caseId);
    if (!Number.isSafeInteger(vectorCount) || vectorCount <= 0) {
      throw new Error(`No-op threat prover for ${caseId}`);
    }
    return safeCaseEvidence(caseId, prover.reasonClass, collector);
  } finally {
    activeEvidence = null;
  }
}

function createContext(
  caseId: A7ThreatCase,
  options: PreviewProofServiceOptions = {},
): ProofContext {
  const fixture = createPreviewProofFixture(caseId);
  const context = {
    fixture,
    service: new PreviewProofService(
      fixture.state,
      fixture.clock,
      fixture.signing,
      fixture.redactionProfile,
      options,
    ),
  };
  activeEvidence?.services.push(context.service);
  return context;
}

function trackService(service: PreviewProofService): PreviewProofService {
  activeEvidence?.services.push(service);
  return service;
}

function recordFileHash(pathClass: string, expectedDigest: string, actualDigest: string): void {
  activeEvidence?.fileHashResults.push({
    pathClass,
    expectedDigest,
    actualDigest,
    matched: expectedDigest === actualDigest,
  });
}

function recordBrowserEvidence(value: unknown): void {
  activeEvidence?.browserLedgerDigests.push(canonicalDigest(value));
}

function recordCleanup(result: SafeCleanupResult): void {
  if (activeEvidence !== null) activeEvidence.cleanupResult = result;
}

function safeCaseEvidence(
  caseId: A7ThreatCase,
  reasonClass: string,
  collector: EvidenceCollector,
): SafeCaseEvidence {
  const sum = (field: keyof SideEffectLedger): number =>
    collector.services.reduce((total, service) => {
      const value = service.ledger[field];
      return total + (typeof value === 'number' ? value : 0);
    }, 0);
  return {
    caseId,
    resultClass: 'PASSED',
    reasonClass,
    ledgerDigest: canonicalDigest({
      ledgers: collector.services.map((service) => service.ledger),
      browserLedgerDigests: collector.browserLedgerDigests,
      cleanupResult: collector.cleanupResult,
      fileHashResults: collector.fileHashResults,
    }),
    sideEffectTotals: {
      authorityReads: sum('authorityReads'),
      objectReads: sum('objectReads'),
      cacheLookups: sum('cacheLookups'),
      generatedBytesServed: sum('generatedBytesServed'),
      foreignBytesServed: sum('foreignBytesServed'),
      businessEvents: sum('businessEvents'),
      outboxMessages: sum('outboxMessages'),
      providerCalls: 0,
      toolCalls: sum('toolIntentsConsumed'),
      sandboxCalls: 0,
      costEffects: sum('costEffects'),
      redactionDrops: sum('redactionDrops'),
    },
    cleanupResult: collector.cleanupResult,
    fileHashResults: collector.fileHashResults,
  };
}

function effectSnapshot(service: PreviewProofService): {
  publicationsActivated: number;
  objectsCopied: number;
  grantsIssued: number;
  sessionsCreated: number;
  noncesConsumed: number;
  cacheLookups: number;
  cacheWrites: number;
  objectReads: number;
  generatedBytesServed: number;
  foreignBytesServed: number;
  revocations: number;
  objectsDeleted: number;
  cachePurges: number;
  businessEvents: number;
  outboxMessages: number;
  toolIntentsConsumed: number;
  costEffects: number;
} {
  const ledger = service.ledger;
  return {
    publicationsActivated: ledger.publicationsActivated,
    objectsCopied: ledger.objectsCopied,
    grantsIssued: ledger.grantsIssued,
    sessionsCreated: ledger.sessionsCreated,
    noncesConsumed: ledger.noncesConsumed,
    cacheLookups: ledger.cacheLookups,
    cacheWrites: ledger.cacheWrites,
    objectReads: ledger.objectReads,
    generatedBytesServed: ledger.generatedBytesServed,
    foreignBytesServed: ledger.foreignBytesServed,
    revocations: ledger.revocations,
    objectsDeleted: ledger.objectsDeleted,
    cachePurges: ledger.cachePurges,
    businessEvents: ledger.businessEvents,
    outboxMessages: ledger.outboxMessages,
    toolIntentsConsumed: ledger.toolIntentsConsumed,
    costEffects: ledger.costEffects,
  };
}

function registerIntent(service: PreviewProofService, intent: ToolInvocationIntent | null): void {
  if (intent !== null) service.registerToolInvocationIntent(intent);
}

function distinctGrantRequest(
  fixture: PreviewProofFixture,
  company: PreviewProofFixture['companies']['a'],
  caseId: A7ThreatCase,
  label: string,
): GrantIssueRequest {
  const base = fixture.requests.grant(company, caseId);
  const logicalIdempotencyKey = `aico007:${caseId}:${label}:grant`;
  const toolInvocation: ToolInvocationIntent = {
    ...base.toolInvocation,
    id: fixtureUuid(`${caseId}:${label}:intent`),
    decisionId: fixtureUuid(`${caseId}:${label}:decision`),
    logicalInvocationKey: logicalIdempotencyKey,
    used: 0,
  };
  const provisional: GrantIssueRequest = {
    ...base,
    requestId: fixtureUuid(`${caseId}:${label}:request`),
    logicalIdempotencyKey,
    publicGrantId: `pg_${canonicalDigest(`${caseId}:${label}:public-grant`).slice(7, 39)}`,
    nonce: canonicalDigest(`${caseId}:${label}:nonce`).slice(7, 50),
    toolInvocation,
  };
  const requestDigest = canonicalRequestDigest({ ...provisional });
  return {
    ...provisional,
    requestDigest,
    toolInvocation: { ...toolInvocation, requestDigest },
  };
}

function distinctPublicationRequest(
  fixture: PreviewProofFixture,
  company: PreviewProofFixture['companies']['a'],
  caseId: A7ThreatCase,
  label: string,
): PublicationRequest {
  const base = fixture.requests.publication(company, caseId);
  const logicalIdempotencyKey = `aico007:${caseId}:${label}:publication`;
  const toolInvocation: ToolInvocationIntent = {
    ...base.toolInvocation,
    id: fixtureUuid(`${caseId}:${label}:publication:intent`),
    decisionId: fixtureUuid(`${caseId}:${label}:publication:decision`),
    logicalInvocationKey: logicalIdempotencyKey,
    used: 0,
  };
  const provisional: PublicationRequest = {
    ...base,
    requestId: fixtureUuid(`${caseId}:${label}:publication:request`),
    logicalIdempotencyKey,
    toolInvocation,
  };
  const requestDigest = canonicalRequestDigest({ ...provisional });
  return {
    ...provisional,
    requestDigest,
    toolInvocation: { ...toolInvocation, requestDigest },
  };
}

function distinctCleanupRequest(
  fixture: PreviewProofFixture,
  company: PreviewProofFixture['companies']['a'],
  caseId: A7ThreatCase,
  label: string,
  expectedEpoch: number,
): CleanupRequest {
  const base = fixture.requests.cleanup(company, caseId);
  const logicalIdempotencyKey = `aico007:${caseId}:${label}:cleanup`;
  const toolInvocation: ToolInvocationIntent = {
    ...base.toolInvocation,
    id: fixtureUuid(`${caseId}:${label}:cleanup:intent`),
    decisionId: fixtureUuid(`${caseId}:${label}:cleanup:decision`),
    logicalInvocationKey: logicalIdempotencyKey,
    used: 0,
  };
  const provisional: CleanupRequest = {
    ...base,
    requestId: fixtureUuid(`${caseId}:${label}:cleanup:request`),
    logicalIdempotencyKey,
    expectedEpoch,
    toolInvocation,
  };
  const requestDigest = canonicalRequestDigest({ ...provisional });
  return {
    ...provisional,
    requestDigest,
    toolInvocation: { ...toolInvocation, requestDigest },
  };
}

function distinctExchangeRequest(
  fixture: PreviewProofFixture,
  company: PreviewProofFixture['companies']['a'],
  result: GrantIssueResult,
  caseId: A7ThreatCase,
  label: string,
): ExchangeRequest {
  const base = fixture.requests.exchange(company, result, caseId);
  const provisional: ExchangeRequest = {
    ...base,
    requestId: fixtureUuid(`${caseId}:${label}:exchange:request`),
    logicalIdempotencyKey: `aico007:${caseId}:${label}:exchange`,
  };
  return { ...provisional, requestDigest: canonicalRequestDigest({ ...provisional }) };
}

function publishCompany(
  context: ProofContext,
  caseId: A7ThreatCase,
  company: PreviewProofFixture['companies']['a'],
): PublicationRequest {
  const request = context.fixture.requests.publication(company, caseId);
  registerIntent(context.service, request.toolInvocation);
  const receipt = context.service.publish(request);
  expect(receipt.outcome).toBe('SUCCEEDED');
  expect(receipt.reason).toBe('PUBLISHED');
  expect(receipt.state).toBe('AVAILABLE');
  return request;
}

function createPublishedSession(
  caseId: A7ThreatCase,
  options: PreviewProofServiceOptions = {},
): PublishedSession {
  const context = createContext(caseId, options);
  const company = context.fixture.companies.a;
  const publicationRequest = publishCompany(context, caseId, company);
  const grantRequest = context.fixture.requests.grant(company, caseId);
  registerIntent(context.service, grantRequest.toolInvocation);
  const grant = context.service.issueGrant(grantRequest);
  expect(grant.receipt.outcome).toBe('SUCCEEDED');
  expect(grant.grant).not.toBeNull();
  expect(Object.keys(grant.grant?.protectedHeader ?? {}).sort()).toEqual(['alg', 'kid', 'typ']);
  expect(Object.keys(grant.grant?.claims ?? {}).sort()).toEqual(
    [
      'audience',
      'binding_sha256',
      'environment',
      'expires_at',
      'issued_at',
      'nonce',
      'not_before',
      'opaque_grant_ref',
      'origin_hostname',
    ].sort(),
  );
  const exchangeRequest = context.fixture.requests.exchange(company, grant, caseId);
  const exchange = context.service.exchange(exchangeRequest);
  expect(exchange.receipt.outcome).toBe('SUCCEEDED');
  expect(exchange.receipt.cookieAttributes).toBe('Secure; HttpOnly; SameSite=Strict; Path=/');
  expect(exchange.sessionPresentation).not.toBeNull();
  expect(exchange.receipt.sessionId).not.toBeNull();
  return {
    ...context,
    publicationRequest,
    sessionPresentation: exchange.sessionPresentation as string,
    sessionId: exchange.receipt.sessionId as string,
  };
}

function createIssuedGrantContext(caseId: A7ThreatCase): IssuedGrantContext {
  const context = createContext(caseId);
  const company = context.fixture.companies.a;
  const publicationRequest = publishCompany(context, caseId, company);
  const grantRequest = context.fixture.requests.grant(company, caseId);
  registerIntent(context.service, grantRequest.toolInvocation);
  const grantResult = context.service.issueGrant(grantRequest);
  expect(grantResult.receipt.outcome).toBe('SUCCEEDED');
  expect(grantResult.grant).not.toBeNull();
  return { ...context, publicationRequest, grantRequest, grantResult };
}

async function provePositive(caseId: A7ThreatCase): Promise<number> {
  const context = createPublishedSession(caseId);
  const company = context.fixture.companies.a;
  for (const [entryIndex, entry] of company.build.entries.entries()) {
    const path = entry.path === company.build.entryDocument ? '/' : `/${entry.path}`;
    const get = context.service.access(
      context.fixture.requests.access(company, context.sessionPresentation, caseId, {
        method: 'GET',
        path,
      }),
    );
    expect(get.outcome).toBe('ALLOWED');
    expect(get.response.status).toBe(200);
    expect(get.response.mediaType).toBe(entry.mediaType);
    expect(get.response.contentLength).toBe(entry.bytes);
    expect(bodyDigest(get.response.body)).toBe(entry.contentSha256);
    recordFileHash(
      `MANIFEST_ENTRY_${entryIndex + 1}`,
      entry.contentSha256,
      bodyDigest(get.response.body),
    );
    expect(get.response.headers).toEqual(GENERATED_RESPONSE_HEADERS);
    const head = context.service.access(
      context.fixture.requests.access(company, context.sessionPresentation, caseId, {
        method: 'HEAD',
        path,
      }),
    );
    expect(head.outcome).toBe('ALLOWED');
    expect(head.response.contentLength).toBe(entry.bytes);
    expect(head.response.body).toHaveLength(0);
  }

  const adapter = createBrowserHttpAdapter({
    canonicalHost: company.preview.host,
    authorize: (input) => {
      const receipt = context.service.access(
        context.fixture.requests.access(company, input.sessionPresentation, caseId, {
          method: input.method,
          path: input.normalizedPath,
          navigation: input.fetchDestination === 'document',
        }),
      );
      return receipt.outcome === 'ALLOWED'
        ? { allowed: true }
        : { allowed: false, reasonClass: receipt.reason };
    },
    exchange: () => ({
      allowed: true,
      sessionPresentation: context.sessionPresentation,
      redirectPath: '/',
    }),
  });
  const server = await startLoopbackBrowserHttpServer(adapter);
  try {
    const bootstrap = await server.request({
      method: 'GET',
      target: '/__aico/bootstrap',
      headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Dest': 'document' },
    });
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.headers['Content-Security-Policy']).toBe(AICO007_BOOTSTRAP_CSP);
    const exchange = await server.request({
      method: 'POST',
      target: '/__aico/exchange',
      headers: {
        Origin: `https://${company.preview.host}`,
        'Sec-Fetch-Site': 'same-origin',
        'Content-Type': 'application/octet-stream',
      },
      body: 'bounded-capability',
    });
    expect(exchange.status).toBe(303);
    const cookie = exchange.headers['Set-Cookie'];
    expect(cookie).toBeDefined();
    const presentation = cookie?.match(/^__Host-aico_preview=([^;]+)/)?.[1];
    expect(presentation).toBe(context.sessionPresentation);
    const document = await server.request({
      method: 'GET',
      target: '/index.html',
      headers: { Cookie: `__Host-aico_preview=${presentation ?? ''}` },
    });
    expect(document.status).toBe(200);
    expect(document.headers['Content-Security-Policy']).toBe(AICO007_GENERATED_CSP);
    const head = await server.request({
      method: 'HEAD',
      target: '/index.html',
      headers: { Cookie: `__Host-aico_preview=${presentation ?? ''}` },
    });
    expect(head.status).toBe(200);
    expect(head.body).toHaveLength(0);
  } finally {
    await server.close();
  }
  expect(context.service.ledger.foreignBytesServed).toBe(0);
  expect(context.service.ledger.controlReceiverHits).toBe(0);
  expect(context.service.ledger.externalReceiverHits).toBe(0);
  expect(context.service.ledger.costEffects).toBe(0);
  return company.build.entries.length * 2 + 4;
}

async function proveBrowserCase(caseId: A7ThreatCase): Promise<number> {
  const host = 'a7-proof.aico-preview.test';
  const adapter = createBrowserHttpAdapter({ canonicalHost: host });
  const results = await runBrowserHttpBoundaryProbes(adapter);
  const matching = results.filter((result) => result.caseIds.includes(caseId));
  for (const result of matching) expect(result.passed).toBe(true);
  let customVectors = 0;

  if (caseId === 'A7-T-ORIGIN-SITE-01' || caseId === 'A7-T-HOST-TLS-01') {
    const wrongHost = await adapter.handle({
      method: 'GET',
      target: '/__aico/bootstrap',
      headers: { Host: 'unknown.preview.invalid' },
    });
    const exactHost = await adapter.handle({
      method: 'GET',
      target: '/__aico/bootstrap',
      headers: { Host: host },
    });
    expect(wrongHost.status).toBe(404);
    expect(wrongHost.body).toHaveLength(0);
    expect(exactHost.headers['Strict-Transport-Security']).toBe(
      AICO007_SECURITY_HEADERS['Strict-Transport-Security'],
    );
    expect(host.endsWith('.aico-preview.test')).toBe(true);
    expect(host).not.toContain('control');
    customVectors += 1;
  }
  if (caseId === 'A7-T-FRAME-CHILD-01' || caseId === 'A7-T-SCRIPT-01') {
    const unavailable = await adapter.handle({
      method: 'GET',
      target: '/index.html',
      headers: { Host: host },
    });
    expect(unavailable.headers['Content-Security-Policy']).toBe(AICO007_GENERATED_CSP);
    customVectors += 1;
  }
  expect(matching.length + customVectors).toBeGreaterThan(0);
  const browserEvidence = adapter.snapshotEvidence();
  expect(browserEvidence.totals.privateControlEffects).toBe(0);
  recordBrowserEvidence({ caseId, matching, browserEvidence });
  return matching.length + customVectors;
}

async function proveRealBrowserBoundary(): Promise<SafeRealBrowserEvidence> {
  const capability = 'aico007-real-browser-capability-once';
  const sessionPresentation = 'aico007-real-browser-session-once';
  let capabilityConsumed = false;
  const adapter = createBrowserHttpAdapter({
    canonicalHost: 'a7-proof.aico-preview.test',
    exchange: (input) => {
      if (capabilityConsumed || input.capability !== capability) {
        return { allowed: false, reasonClass: 'CAPABILITY_DENIED' };
      }
      capabilityConsumed = true;
      return {
        allowed: true,
        sessionPresentation,
        maxAgeSeconds: 60,
        redirectPath: '/',
      };
    },
    authorize: (input) =>
      input.sessionPresentation === sessionPresentation
        ? { allowed: true }
        : { allowed: false, reasonClass: 'SESSION_DENIED' },
  });
  const result = await runRealBrowserHarness({ adapter, capability });
  if (result.kind !== 'COMPLETED') {
    throw new Error(`Real browser proof blocked: ${result.blocker}`);
  }
  expect(result.kind).toBe('COMPLETED');
  expect(capabilityConsumed).toBe(true);
  expect(result.probes).toHaveLength(14);
  expect(result.probes).toEqual(REAL_BROWSER_EXPECTED_PROBES);
  expect(result.counts.pageRecords).toBe(14);
  expect(result.counts.invalidPageRecords).toBe(0);
  expect(result.counts.privateControlEffects).toBe(0);
  expect(result.counts.controlSiteRequests).toBe(0);
  expect(result.originClasses).toEqual(['PREVIEW_TEST_SITE', 'CONTROL_TEST_SITE']);
  expect(result.freshProfileRemoved).toBe(true);
  return {
    kind: result.kind,
    trustMode: result.trustMode,
    counts: result.counts,
    probeSummary: result.probes,
    originClasses: result.originClasses,
    digests: result.digests,
    freshProfileRemoved: result.freshProfileRemoved,
  };
}

function proveBuildState(caseId: A7ThreatCase): number {
  const vectors: ReadonlyArray<{
    stateClass: string;
    mutate(build: Record<string, unknown>): void;
  }> = [
    { stateClass: 'PENDING', mutate: (build) => (build.buildResult = 'PENDING') },
    { stateClass: 'RUNNING', mutate: (build) => (build.buildResult = 'RUNNING') },
    { stateClass: 'FAILED', mutate: (build) => (build.buildResult = 'FAILED') },
    { stateClass: 'CANCELED', mutate: (build) => (build.canceled = true) },
    { stateClass: 'TIMED_OUT', mutate: (build) => (build.buildResult = 'TIMED_OUT') },
    { stateClass: 'BLOCKED', mutate: (build) => (build.buildResult = 'BLOCKED') },
    { stateClass: 'UNKNOWN', mutate: (build) => (build.buildResult = 'UNKNOWN') },
    { stateClass: 'SUPERSEDED', mutate: (build) => (build.buildResult = 'SUPERSEDED') },
    { stateClass: 'PARTIAL_PROMOTION', mutate: (build) => (build.quarantined = true) },
    { stateClass: 'FAILED_BLOCKING_CHECK', mutate: (build) => (build.canceled = true) },
  ];
  for (const vector of vectors) {
    const context = createContext(caseId);
    const company = context.fixture.companies.a;
    const requestBuild = structuredClone(company.build) as BuildAuthority & Record<string, unknown>;
    vector.mutate(requestBuild);
    context.service.mutateAuthority('build', company.build.buildId, (build) =>
      vector.mutate(build),
    );
    const before = effectSnapshot(context.service);
    const request = context.fixture.requests.publication(company, caseId, {
      build: requestBuild,
    });
    registerIntent(context.service, request.toolInvocation);
    const receipt = context.service.publish(request);
    const after = effectSnapshot(context.service);
    expect(receipt.outcome).toBe('DENIED');
    expect(receipt.reason).toBe('BUILD_NOT_SUCCESSFUL');
    expect(after.publicationsActivated - before.publicationsActivated).toBe(0);
    expect(after.objectsCopied - before.objectsCopied).toBe(0);
    expect(after.grantsIssued - before.grantsIssued).toBe(0);
    expect(after.cacheWrites - before.cacheWrites).toBe(0);
    expect(after.businessEvents - before.businessEvents).toBe(0);
    expect(after.outboxMessages - before.outboxMessages).toBe(0);
    expect(after.toolIntentsConsumed - before.toolIntentsConsumed).toBe(0);
    expect(vector.stateClass.length).toBeGreaterThan(0);
  }
  return vectors.length;
}

function provePublicationIntegrity(caseId: A7ThreatCase): number {
  const vectors: ReadonlyArray<{
    vectorClass: string;
    apply(context: ProofContext, requestBuild: BuildAuthority): void;
  }> = [
    {
      vectorClass: 'BODY_TAMPER',
      apply: (context, build): void => {
        const entry = build.entries[0];
        expect(entry).toBeDefined();
        context.service.mutateObject(
          sourceObjectKey(build.buildId, entry?.path ?? ''),
          (object) => {
            object.body = Buffer.concat([object.body, Buffer.from('tamper')]);
            recordFileHash(
              'MUTATED_SOURCE_ENTRY_1',
              entry?.contentSha256 ?? canonicalDigest('missing-expected'),
              bodyDigest(object.body),
            );
          },
        );
      },
    },
    {
      vectorClass: 'PER_FILE_DIGEST',
      apply: (_context, build): void => {
        const entries = structuredClone(build.entries);
        if (entries[0] !== undefined) entries[0].contentSha256 = canonicalDigest('wrong-content');
        build.entries = entries;
      },
    },
    {
      vectorClass: 'SIZE',
      apply: (_context, build): void => {
        const entries = structuredClone(build.entries);
        if (entries[0] !== undefined) entries[0].bytes += 1;
        build.entries = entries;
      },
    },
    {
      vectorClass: 'MEDIA_TYPE',
      apply: (_context, build): void => {
        const entries = structuredClone(build.entries);
        if (entries[0] !== undefined) entries[0].mediaType = 'application/x-unsafe';
        build.entries = entries;
      },
    },
    {
      vectorClass: 'UNSAFE_PATH',
      apply: (_context, build): void => {
        const entries = structuredClone(build.entries);
        if (entries[0] !== undefined) entries[0].path = '../escape.html';
        build.entries = entries;
      },
    },
    {
      vectorClass: 'AGGREGATE_DIGEST',
      apply: (_context, build) => (build.aggregateDigest = canonicalDigest('wrong-aggregate')),
    },
    {
      vectorClass: 'MANIFEST_DIGEST',
      apply: (_context, build) => (build.outputManifestDigest = canonicalDigest('wrong-manifest')),
    },
    {
      vectorClass: 'ARTIFACT_CHECKSUM',
      apply: (_context, build) => (build.artifactChecksum = canonicalDigest('wrong-artifact')),
    },
    {
      vectorClass: 'OWNER',
      apply: (context, build) =>
        (build.companyId = context.fixture.companies.b.authority.companyId),
    },
    {
      vectorClass: 'MIXED_TENANT_BYTES',
      apply: (context, build): void => {
        const entry = build.entries[0];
        const foreign = context.service
          .exportState()
          .objects.find(
            ([, object]) =>
              object.previewId === context.fixture.companies.b.build.buildId &&
              object.path === entry?.path,
          )?.[1];
        expect(foreign).toBeDefined();
        context.service.mutateObject(
          sourceObjectKey(build.buildId, entry?.path ?? ''),
          (object) => {
            object.body = Buffer.from(foreign?.body ?? Buffer.alloc(0));
          },
        );
      },
    },
    {
      vectorClass: 'OBJECT_VERSION',
      apply: (context, build): void => {
        const entry = build.entries[0];
        context.service.mutateObject(
          sourceObjectKey(build.buildId, entry?.path ?? ''),
          (object) => {
            object.objectVersionId = fixtureUuid(`${caseId}:wrong-object-version`);
          },
        );
      },
    },
    {
      vectorClass: 'QUARANTINED_SOURCE',
      apply: (context, build): void => {
        const entry = build.entries[0];
        context.service.mutateObject(
          sourceObjectKey(build.buildId, entry?.path ?? ''),
          (object) => {
            object.state = 'QUARANTINED';
          },
        );
      },
    },
  ];
  for (const vector of vectors) {
    const context = createContext(caseId);
    const company = context.fixture.companies.a;
    const requestBuild = structuredClone(company.build);
    vector.apply(context, requestBuild);
    context.service.mutateAuthority('build', company.build.buildId, (build) => {
      Object.assign(build, structuredClone(requestBuild));
    });
    const before = effectSnapshot(context.service);
    const request = context.fixture.requests.publication(company, caseId, { build: requestBuild });
    registerIntent(context.service, request.toolInvocation);
    const receipt = context.service.publish(request);
    const after = effectSnapshot(context.service);
    expect(['DENIED', 'CONFLICT']).toContain(receipt.outcome);
    expect(['INTEGRITY_FAILED', 'BINDING_MISMATCH', 'TENANT_MISMATCH']).toContain(receipt.reason);
    expect(after.publicationsActivated - before.publicationsActivated).toBe(0);
    expect(after.objectsCopied - before.objectsCopied).toBe(0);
    expect(after.cacheWrites - before.cacheWrites).toBe(0);
    expect(after.businessEvents - before.businessEvents).toBe(0);
    expect(vector.vectorClass.length).toBeGreaterThan(0);
  }
  return vectors.length;
}

function proveServeIntegrity(caseId: A7ThreatCase): number {
  const coldBody = createPublishedSession(caseId);
  coldBody.service.faults.corruptObjectOnRead = true;
  const coldBefore = effectSnapshot(coldBody.service);
  assertServeIntegrityDenied(
    coldBody.service.access(
      coldBody.fixture.requests.access(
        coldBody.fixture.companies.a,
        coldBody.sessionPresentation,
        caseId,
      ),
    ),
    coldBody.service,
    coldBefore,
  );

  const truncated = createPublishedSession(caseId);
  const entry = truncated.fixture.companies.a.build.entries[0];
  expect(entry).toBeDefined();
  truncated.service.mutateObject(
    previewObjectKey(
      truncated.fixture.companies.a.preview.previewId,
      truncated.fixture.companies.a.preview.previewVersion,
      entry?.path ?? '',
    ),
    (object) => {
      object.body = object.body.subarray(0, Math.max(0, object.body.byteLength - 1));
      recordFileHash(
        'TRUNCATED_OBJECT_ENTRY_1',
        entry?.contentSha256 ?? canonicalDigest('missing-expected'),
        bodyDigest(object.body),
      );
    },
  );
  const truncatedBefore = effectSnapshot(truncated.service);
  const truncatedReceipt = truncated.service.access(
    truncated.fixture.requests.access(
      truncated.fixture.companies.a,
      truncated.sessionPresentation,
      caseId,
    ),
  );
  assertServeIntegrityDenied(truncatedReceipt, truncated.service, truncatedBefore);

  const metadata = createPublishedSession(caseId);
  const metadataEntry = metadata.fixture.companies.a.build.entries[0];
  metadata.service.mutateObject(
    previewObjectKey(
      metadata.fixture.companies.a.preview.previewId,
      metadata.fixture.companies.a.preview.previewVersion,
      metadataEntry?.path ?? '',
    ),
    (object) => {
      object.objectVersionId = fixtureUuid(`${caseId}:serve-wrong-version`);
      object.mediaType = 'application/x-unsafe';
    },
  );
  const metadataBefore = effectSnapshot(metadata.service);
  const metadataReceipt = metadata.service.access(
    metadata.fixture.requests.access(
      metadata.fixture.companies.a,
      metadata.sessionPresentation,
      caseId,
    ),
  );
  assertServeIntegrityDenied(metadataReceipt, metadata.service, metadataBefore);

  const warm = createPublishedSession(caseId);
  expect(allowAccess(warm, caseId).cacheResult).toBe('MISS');
  warm.service.faults.corruptCacheOnRead = true;
  const warmBefore = effectSnapshot(warm.service);
  const warmReceipt = warm.service.access(
    warm.fixture.requests.access(warm.fixture.companies.a, warm.sessionPresentation, caseId),
  );
  assertServeIntegrityDenied(warmReceipt, warm.service, warmBefore);

  const head = createPublishedSession(caseId);
  head.service.faults.corruptObjectOnRead = true;
  const headBefore = effectSnapshot(head.service);
  const headReceipt = head.service.access(
    head.fixture.requests.access(head.fixture.companies.a, head.sessionPresentation, caseId, {
      method: 'HEAD',
    }),
  );
  assertServeIntegrityDenied(headReceipt, head.service, headBefore);
  return 5;
}

function assertServeIntegrityDenied(
  receipt: AccessReceipt,
  service: PreviewProofService,
  before: ReturnType<typeof effectSnapshot>,
): void {
  const after = effectSnapshot(service);
  expect(receipt.outcome).toBe('DENIED');
  expect(['INTEGRITY_FAILED', 'CACHE_INTEGRITY_FAILED']).toContain(receipt.reason);
  expect(receipt.response.body).toHaveLength(0);
  expect(after.generatedBytesServed - before.generatedBytesServed).toBe(0);
  expect(after.foreignBytesServed - before.foreignBytesServed).toBe(0);
}

function proveAccessBinding(caseId: A7ThreatCase): number {
  const browserVectors: ReadonlyArray<{
    vectorClass: string;
    mutate(header: Record<string, unknown>, claims: Record<string, unknown>, parts: string[]): void;
  }> = [
    { vectorClass: 'HEADER_TYP', mutate: (header) => (header.typ = 'WRONG') },
    { vectorClass: 'HEADER_ALG', mutate: (header) => (header.alg = 'none') },
    { vectorClass: 'HEADER_KID', mutate: (header) => (header.kid = 'unknown-key') },
    { vectorClass: 'HEADER_EXTRA', mutate: (header) => (header.jku = 'blocked') },
    { vectorClass: 'AUDIENCE', mutate: (_header, claims) => (claims.audience = 'OTHER') },
    {
      vectorClass: 'GRANT_REFERENCE',
      mutate: (_header, claims) => (claims.opaque_grant_ref = 'unknown-grant'),
    },
    { vectorClass: 'NONCE', mutate: (_header, claims) => (claims.nonce = 'wrong-nonce') },
    { vectorClass: 'ISSUED_AT', mutate: (_header, claims) => delete claims.issued_at },
    { vectorClass: 'NOT_BEFORE', mutate: (_header, claims) => delete claims.not_before },
    { vectorClass: 'EXPIRY', mutate: (_header, claims) => delete claims.expires_at },
    {
      vectorClass: 'HOST',
      mutate: (_header, claims) => (claims.origin_hostname = 'wrong.invalid'),
    },
    {
      vectorClass: 'ENVIRONMENT',
      mutate: (_header, claims) => (claims.environment = 'PRODUCTION'),
    },
    {
      vectorClass: 'BINDING_DIGEST',
      mutate: (_header, claims) => (claims.binding_sha256 = canonicalDigest('wrong-binding')),
    },
    { vectorClass: 'CLAIMS_EXTRA', mutate: (_header, claims) => (claims.company_id = 'forbidden') },
    { vectorClass: 'SIGNATURE', mutate: (_header, _claims, parts) => (parts[2] = 'invalid') },
  ];
  for (const vector of browserVectors) {
    const context = createIssuedGrantContext(caseId);
    const compact = context.grantResult.grant?.compact;
    expect(compact).toBeDefined();
    const parts = compact?.split('.') ?? [];
    expect(parts).toHaveLength(3);
    const header = JSON.parse(Buffer.from(parts[0] ?? '', 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    const claims = JSON.parse(Buffer.from(parts[1] ?? '', 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    vector.mutate(header, claims, parts);
    if (vector.vectorClass !== 'SIGNATURE') {
      parts[0] = Buffer.from(JSON.stringify(header)).toString('base64url');
      parts[1] = Buffer.from(JSON.stringify(claims)).toString('base64url');
    }
    const before = effectSnapshot(context.service);
    const exchange = context.service.exchange(
      context.fixture.requests.exchange(context.fixture.companies.a, context.grantResult, caseId, {
        capability: parts.join('.'),
      }),
    );
    const after = effectSnapshot(context.service);
    expect(exchange.receipt.outcome).toBe('DENIED');
    expect(exchange.sessionPresentation).toBeNull();
    expect(after.sessionsCreated - before.sessionsCreated).toBe(0);
    expect(after.noncesConsumed - before.noncesConsumed).toBe(0);
  }

  const previewVectors: ReadonlyArray<{
    vectorClass: string;
    mutate(value: Record<string, unknown>, context: PublishedSession): void;
  }> = [
    {
      vectorClass: 'PREVIEW_ID',
      mutate: (preview) => (preview.previewId = fixtureUuid('wrong-preview')),
    },
    {
      vectorClass: 'PUBLIC_PREVIEW_ID',
      mutate: (preview) => (preview.publicPreviewId = 'pp_opaque_wrong_preview'),
    },
    {
      vectorClass: 'HOST',
      mutate: (preview) => (preview.host = 'opaque-other.aico-preview.test'),
    },
    { vectorClass: 'ENVIRONMENT', mutate: (preview) => (preview.environment = 'STAGING') },
    { vectorClass: 'RUN_ID', mutate: (preview) => (preview.runId = fixtureUuid('wrong-run')) },
    { vectorClass: 'TASK_ID', mutate: (preview) => (preview.taskId = fixtureUuid('wrong-task')) },
    {
      vectorClass: 'ATTEMPT_ID',
      mutate: (preview) => (preview.attemptId = fixtureUuid('wrong-attempt')),
    },
    {
      vectorClass: 'BUILD_VERSION',
      mutate: (preview) => (preview.buildVersion = Number(preview.buildVersion) + 1),
    },
    {
      vectorClass: 'TENANT',
      mutate: (preview, context) =>
        (preview.companyId = context.fixture.companies.b.authority.companyId),
    },
    {
      vectorClass: 'PREVIEW_VERSION',
      mutate: (preview) => (preview.previewVersion = Number(preview.previewVersion) + 1),
    },
    {
      vectorClass: 'BUILD_ID',
      mutate: (preview) => (preview.buildId = fixtureUuid('wrong-build')),
    },
    {
      vectorClass: 'BUILD_RECEIPT_ID',
      mutate: (preview) =>
        (preview.buildResultReceiptId = fixtureUuid('wrong-build-result-receipt')),
    },
    {
      vectorClass: 'BUILD_RECEIPT_VERSION',
      mutate: (preview) => (preview.buildResultReceiptVersion = 'wrong-version'),
    },
    {
      vectorClass: 'BUILD_RECEIPT',
      mutate: (preview) => (preview.buildResultReceiptDigest = canonicalDigest('wrong-receipt')),
    },
    {
      vectorClass: 'ARTIFACT_ID',
      mutate: (preview) => (preview.artifactId = fixtureUuid('wrong-artifact')),
    },
    {
      vectorClass: 'ARTIFACT_VERSION_ID',
      mutate: (preview) => (preview.artifactVersionId = fixtureUuid('wrong-artifact-version')),
    },
    {
      vectorClass: 'ARTIFACT_VERSION',
      mutate: (preview) => (preview.artifactVersion = Number(preview.artifactVersion) + 1),
    },
    {
      vectorClass: 'ARTIFACT',
      mutate: (preview) => (preview.artifactChecksum = canonicalDigest('wrong-artifact')),
    },
    {
      vectorClass: 'MANIFEST_ID',
      mutate: (preview) => (preview.outputManifestId = fixtureUuid('wrong-manifest')),
    },
    {
      vectorClass: 'MANIFEST_VERSION',
      mutate: (preview) => (preview.outputManifestVersion = 'wrong-version'),
    },
    {
      vectorClass: 'MANIFEST',
      mutate: (preview) => (preview.outputManifestDigest = canonicalDigest('wrong-manifest')),
    },
    {
      vectorClass: 'AGGREGATE',
      mutate: (preview) => (preview.aggregateDigest = canonicalDigest('wrong-aggregate')),
    },
    {
      vectorClass: 'EPOCH',
      mutate: (preview) => (preview.revocationEpoch = Number(preview.revocationEpoch) + 1),
    },
    {
      vectorClass: 'KEY_VERSION',
      mutate: (preview) => (preview.keyVersion = Number(preview.keyVersion) + 1),
    },
    { vectorClass: 'POLICY', mutate: (preview) => (preview.policyVersion = 'wrong-policy') },
    {
      vectorClass: 'HEADER_PROFILE',
      mutate: (preview) => (preview.headerProfileDigest = canonicalDigest('wrong-header')),
    },
    {
      vectorClass: 'CACHE_PROFILE',
      mutate: (preview) => (preview.cacheProfileDigest = canonicalDigest('wrong-cache')),
    },
    {
      vectorClass: 'REDACTION_PROFILE',
      mutate: (preview): void => {
        const profile = preview.redactionProfile as Record<string, unknown>;
        preview.redactionProfile = { ...profile, version: 'wrong-redaction' };
      },
    },
    {
      vectorClass: 'PREVIEW_BINDING_DIGEST',
      mutate: (preview) => (preview.bindingSha256 = canonicalDigest('wrong-preview-binding')),
    },
  ];
  for (const vector of previewVectors) {
    const context = createPublishedSession(caseId);
    context.service.mutateAuthority(
      'preview',
      context.fixture.companies.a.preview.previewId,
      (preview) => vector.mutate(preview, context),
    );
    expectDeniedAccess(context, caseId);
  }

  const perFile = createPublishedSession(caseId);
  perFile.service.mutateAuthority('build', perFile.fixture.companies.a.build.buildId, (build) => {
    const entries = structuredClone(build.entries) as Array<Record<string, unknown>>;
    if (entries[0] !== undefined) entries[0].contentSha256 = canonicalDigest('wrong-per-file');
    build.entries = entries;
  });
  expectDeniedAccess(perFile, caseId);

  const grant = createPublishedSession(caseId);
  const grantId = grant.service.exportState().grants[0]?.[0];
  expect(grantId).toBeDefined();
  grant.service.mutateAuthority('grant', grantId ?? '', (authority) => {
    authority.buildVersion = Number(authority.buildVersion) + 1;
  });
  expectDeniedAccess(grant, caseId);

  const absentPath = createPublishedSession(caseId);
  const pathReceipt = absentPath.service.access(
    absentPath.fixture.requests.access(
      absentPath.fixture.companies.a,
      absentPath.sessionPresentation,
      caseId,
      { path: '/not-in-manifest.bin', navigation: false },
    ),
  );
  expect(pathReceipt.outcome).toBe('DENIED');
  expect(pathReceipt.response.body).toHaveLength(0);
  return browserVectors.length + previewVectors.length + 3;
}

function proveAuthoritySource(caseId: A7ThreatCase): number {
  const sourceClasses = [
    'MODEL',
    'COMPLETION',
    'PROMPT',
    'TRANSCRIPT',
    'AGENT_MEMORY',
    'WORKER_MEMORY',
    'SESSION_UI',
    'BROWSER_DOM',
    'BROWSER_STORAGE',
    'LOG',
    'METRIC',
    'EVENT_OUTBOX',
    'RECEIPT',
    'CACHED_PROJECTION',
    'PRIOR_ALLOW',
  ] as const;
  for (const sourceClass of sourceClasses) {
    const context = createContext(caseId);
    const company = context.fixture.companies.a;
    publishCompany(context, caseId, company);
    const base = context.fixture.requests.grant(company, caseId);
    const suppliedIntent = {
      ...base.toolInvocation,
      decisionDigest: canonicalDigest({ sourceClass }),
    };
    const provisional = { ...base, toolInvocation: suppliedIntent };
    const requestDigest = canonicalRequestDigest(provisional);
    const request: GrantIssueRequest = {
      ...base,
      requestDigest,
      toolInvocation: { ...suppliedIntent, requestDigest },
    };
    context.service.registerToolInvocationIntent({
      ...request.toolInvocation,
      decisionDigest: canonicalDigest({ sourceClass: 'POSTGRES_CURRENT_POLICY' }),
    });
    const before = effectSnapshot(context.service);
    const result = context.service.issueGrant(request);
    const after = effectSnapshot(context.service);
    expect(result.receipt.outcome).toBe('DENIED');
    expect(result.receipt.reason).toBe('INVOCATION_INVALID');
    expect(result.grant).toBeNull();
    expect(after.grantsIssued - before.grantsIssued).toBe(0);
    expect(after.toolIntentsConsumed - before.toolIntentsConsumed).toBe(0);
    expect(after.businessEvents - before.businessEvents).toBe(0);
    expect(after.outboxMessages - before.outboxMessages).toBe(0);
  }

  const publication = createContext(caseId, { faults: { authorityUnavailable: true } });
  const publicationRequest = publication.fixture.requests.publication(
    publication.fixture.companies.a,
    caseId,
  );
  registerIntent(publication.service, publicationRequest.toolInvocation);
  expect(publication.service.publish(publicationRequest).reason).toBe('AUTHORITY_UNAVAILABLE');
  expect(publication.service.ledger.toolIntentsConsumed).toBe(0);

  const grant = createContext(caseId);
  publishCompany(grant, caseId, grant.fixture.companies.a);
  grant.service.faults.authorityUnavailable = true;
  const grantRequest = grant.fixture.requests.grant(grant.fixture.companies.a, caseId);
  registerIntent(grant.service, grantRequest.toolInvocation);
  expect(grant.service.issueGrant(grantRequest).receipt.reason).toBe('AUTHORITY_UNAVAILABLE');

  const access = createPublishedSession(caseId);
  access.service.faults.authorityUnavailable = true;
  expectDeniedAccess(access, caseId);

  const revocation = createPublishedSession(caseId);
  revocation.service.faults.authorityUnavailable = true;
  const revocationRequest = revocation.fixture.requests.revoke(
    revocation.fixture.companies.a,
    caseId,
  );
  registerIntent(revocation.service, revocationRequest.toolInvocation);
  expect(revocation.service.revoke(revocationRequest).reason).toBe('AUTHORITY_UNAVAILABLE');

  const cleanup = createPublishedSession(caseId);
  revoke(cleanup, caseId);
  cleanup.service.faults.authorityUnavailable = true;
  const cleanupRequest = cleanup.fixture.requests.cleanup(cleanup.fixture.companies.a, caseId);
  registerIntent(cleanup.service, cleanupRequest.toolInvocation);
  expect(cleanup.service.cleanup(cleanupRequest).reason).toBe('AUTHORITY_UNAVAILABLE');

  const reconciliation = createContext(caseId, {
    faults: { publicationUnknownAfterCopy: true },
  });
  const unknownRequest = reconciliation.fixture.requests.publication(
    reconciliation.fixture.companies.a,
    caseId,
  );
  registerIntent(reconciliation.service, unknownRequest.toolInvocation);
  expect(reconciliation.service.publish(unknownRequest).outcome).toBe('UNKNOWN');
  reconciliation.service.faults.authorityUnavailable = true;
  const inspect = reconciliation.fixture.requests.reconcile(unknownRequest, 'PUBLICATION', caseId);
  registerIntent(reconciliation.service, inspect.toolInvocation);
  expect(reconciliation.service.reconcile(inspect).reason).toBe('AUTHORITY_UNAVAILABLE');
  return sourceClasses.length + 6;
}

function proveForeignTenant(caseId: A7ThreatCase): number {
  const context = createPublishedSession(caseId);
  context.service.mutateAuthority('session', context.sessionId, (session) => {
    session.companyId = context.fixture.companies.b.authority.companyId;
  });
  const before = effectSnapshot(context.service);
  const foreign = context.service.access(
    context.fixture.requests.access(
      context.fixture.companies.a,
      context.sessionPresentation,
      caseId,
    ),
  );
  const absent = context.service.access(
    context.fixture.requests.access(context.fixture.companies.a, null, caseId),
  );
  expect(foreign.outcome).toBe('DENIED');
  expect(canonicalDigest(foreign.response)).toBe(canonicalDigest(absent.response));
  const after = effectSnapshot(context.service);
  expect(after.objectReads - before.objectReads).toBe(0);
  expect(after.cacheLookups - before.cacheLookups).toBe(0);
  expect(after.generatedBytesServed - before.generatedBytesServed).toBe(0);
  expect(context.service.ledger.foreignBytesServed).toBe(0);
  return 2;
}

function proveForeignPreview(caseId: A7ThreatCase): number {
  const context = createPublishedSession(caseId);
  const foreign = context.fixture.companies.b;
  publishCompany(context, caseId, foreign);
  context.service.mutateAuthority('session', context.sessionId, (session) => {
    session.previewId = foreign.preview.previewId;
    session.previewVersion = foreign.preview.previewVersion;
    session.publicPreviewId = foreign.preview.publicPreviewId;
  });
  const foreignReceipt = context.service.access(
    context.fixture.requests.access(
      context.fixture.companies.a,
      context.sessionPresentation,
      caseId,
    ),
  );
  const absent = context.service.access(
    context.fixture.requests.access(context.fixture.companies.a, null, caseId),
  );
  expect(foreignReceipt.outcome).toBe('DENIED');
  expect(canonicalDigest(foreignReceipt.response)).toBe(canonicalDigest(absent.response));
  expect(context.service.ledger.foreignBytesServed).toBe(0);
  return 2;
}

function proveExpiry(caseId: A7ThreatCase): number {
  const boundary = createPublishedSession(caseId);
  boundary.fixture.clock.set(new Date(Date.parse(AICO007_EXPIRES_AT) - 1).toISOString());
  expect(allowAccess(boundary, caseId).outcome).toBe('ALLOWED');
  boundary.fixture.clock.set(AICO007_EXPIRES_AT);
  const before = effectSnapshot(boundary.service);
  expectDeniedAccess(boundary, caseId);
  const after = effectSnapshot(boundary.service);
  expect(after.cacheLookups - before.cacheLookups).toBe(0);
  expect(after.objectReads - before.objectReads).toBe(0);
  const session = boundary.service.exportState().sessions[0]?.[1];
  const grant = boundary.service.exportState().grants[0]?.[1];
  expect(Date.parse(session?.expiresAt ?? '')).toBeLessThanOrEqual(
    Date.parse(grant?.expiresAt ?? ''),
  );
  expect(Date.parse(session?.expiresAt ?? '')).toBeLessThanOrEqual(
    Date.parse(boundary.fixture.companies.a.preview.expiresAt),
  );

  const quarantined = createPublishedSession(caseId);
  quarantined.service.mutateAuthority(
    'preview',
    quarantined.fixture.companies.a.preview.previewId,
    (preview) => (preview.state = 'QUARANTINED'),
  );
  expectDeniedAccess(quarantined, caseId);

  const killed = createPublishedSession(caseId);
  killed.service.mutateAuthority(
    'preview',
    killed.fixture.companies.a.preview.previewId,
    (preview) => (preview.state = 'REVOKED'),
  );
  expectDeniedAccess(killed, caseId);

  const staleKey = createPublishedSession(caseId);
  staleKey.service.mutateAuthority(
    'preview',
    staleKey.fixture.companies.a.preview.previewId,
    (preview) => (preview.keyVersion = Number(preview.keyVersion) + 1),
  );
  expectDeniedAccess(staleKey, caseId);
  return 5;
}

function revoke(context: PublishedSession, caseId: A7ThreatCase): void {
  const request = context.fixture.requests.revoke(context.fixture.companies.a, caseId);
  registerIntent(context.service, request.toolInvocation);
  const receipt = context.service.revoke(request);
  expect(receipt.outcome).toBe('SUCCEEDED');
  expect(receipt.state).toBe('REVOKED');
}

function proveRevocation(caseId: A7ThreatCase): number {
  const context = createPublishedSession(caseId);
  expect(allowAccess(context, caseId).outcome).toBe('ALLOWED');
  const company = context.fixture.companies.a;
  const pendingGrantRequest = distinctGrantRequest(
    context.fixture,
    company,
    caseId,
    'revocation-pending',
  );
  registerIntent(context.service, pendingGrantRequest.toolInvocation);
  const pendingGrant = context.service.issueGrant(pendingGrantRequest);
  expect(pendingGrant.receipt.outcome).toBe('SUCCEEDED');

  const revocationRequest = context.fixture.requests.revoke(company, caseId);
  registerIntent(context.service, revocationRequest.toolInvocation);
  const beforeRevocation = effectSnapshot(context.service);
  const revocation = context.service.revoke(revocationRequest);
  expect(revocation.outcome).toBe('SUCCEEDED');
  expect(revocation.state).toBe('REVOKED');
  expect(context.service.revoke(revocationRequest).replayed).toBe(true);
  expect(context.service.ledger.revocations - beforeRevocation.revocations).toBe(1);

  const beforeDenied = effectSnapshot(context.service);
  for (const method of ['GET', 'HEAD'] as const) {
    const denied = context.service.access(
      context.fixture.requests.access(company, context.sessionPresentation, caseId, { method }),
    );
    expect(denied.outcome).toBe('DENIED');
    expect(denied.cacheResult).toBe('NOT_CHECKED');
    expect(denied.response.body).toHaveLength(0);
  }
  const afterDenied = effectSnapshot(context.service);
  expect(afterDenied.cacheLookups - beforeDenied.cacheLookups).toBe(0);
  expect(afterDenied.objectReads - beforeDenied.objectReads).toBe(0);

  const exchange = context.service.exchange(
    context.fixture.requests.exchange(company, pendingGrant, caseId, {
      requestId: fixtureUuid(`${caseId}:revocation:post-commit-exchange`),
      logicalIdempotencyKey: `aico007:${caseId}:revocation:post-commit-exchange`,
    }),
  );
  expect(exchange.receipt.outcome).toBe('DENIED');
  expect(exchange.sessionPresentation).toBeNull();

  const inspection = context.fixture.requests.reconcile(revocationRequest, 'REVOCATION', caseId);
  registerIntent(context.service, inspection.toolInvocation);
  const inspected = context.service.inspectRevocation(inspection);
  expect(inspected.outcome).toBe('SUCCEEDED');
  expect(inspected.resolvedReceiptDigest).not.toBeNull();

  let barrierContext: PublishedSession | null = null;
  const barrierResults: {
    beforeCommitAccess?: AccessReceipt;
    afterCommitAccess?: AccessReceipt;
    afterCommitExchange?: ReturnType<PreviewProofService['exchange']>;
  } = {};
  let pendingExchangeRequest: ExchangeRequest | null = null;
  const barrier = createPublishedSession(caseId, {
    hooks: {
      beforeRevocationCommit: (): void => {
        if (barrierContext === null) throw new Error('Revocation barrier was not initialized');
        barrierResults.beforeCommitAccess = barrierContext.service.access(
          barrierContext.fixture.requests.access(
            barrierContext.fixture.companies.a,
            barrierContext.sessionPresentation,
            caseId,
          ),
        );
      },
      afterRevocationCommit: (): void => {
        if (barrierContext === null || pendingExchangeRequest === null) {
          throw new Error('Post-revocation barrier was not initialized');
        }
        barrierResults.afterCommitAccess = barrierContext.service.access(
          barrierContext.fixture.requests.access(
            barrierContext.fixture.companies.a,
            barrierContext.sessionPresentation,
            caseId,
          ),
        );
        barrierResults.afterCommitExchange =
          barrierContext.service.exchange(pendingExchangeRequest);
      },
    },
  });
  barrierContext = barrier;
  const barrierPendingRequest = distinctGrantRequest(
    barrier.fixture,
    barrier.fixture.companies.a,
    caseId,
    'revocation-barrier-pending',
  );
  registerIntent(barrier.service, barrierPendingRequest.toolInvocation);
  const barrierPendingGrant = barrier.service.issueGrant(barrierPendingRequest);
  expect(barrierPendingGrant.receipt.outcome).toBe('SUCCEEDED');
  pendingExchangeRequest = distinctExchangeRequest(
    barrier.fixture,
    barrier.fixture.companies.a,
    barrierPendingGrant,
    caseId,
    'revocation-barrier-pending',
  );
  const barrierRevocation = barrier.fixture.requests.revoke(barrier.fixture.companies.a, caseId);
  registerIntent(barrier.service, barrierRevocation.toolInvocation);
  const barrierBefore = effectSnapshot(barrier.service);
  expect(barrier.service.revoke(barrierRevocation).outcome).toBe('SUCCEEDED');
  const barrierAfter = effectSnapshot(barrier.service);
  const beforeCommitAccess = barrierResults.beforeCommitAccess;
  const afterCommitAccess = barrierResults.afterCommitAccess;
  const afterCommitExchange = barrierResults.afterCommitExchange;
  if (
    beforeCommitAccess === undefined ||
    afterCommitAccess === undefined ||
    afterCommitExchange === undefined
  ) {
    throw new Error('Revocation barrier did not execute every boundary');
  }
  expect(beforeCommitAccess.outcome).toBe('ALLOWED');
  expect(beforeCommitAccess.response.body.byteLength).toBeGreaterThan(0);
  expect(afterCommitAccess.outcome).toBe('DENIED');
  expect(afterCommitAccess.response.body).toHaveLength(0);
  expect(afterCommitExchange.receipt.outcome).toBe('DENIED');
  expect(afterCommitExchange.sessionPresentation).toBeNull();
  expect(barrierAfter.revocations - barrierBefore.revocations).toBe(1);
  expect(barrierAfter.sessionsCreated - barrierBefore.sessionsCreated).toBe(0);
  expect(barrier.service.ledger.generatedBytesServed).toBe(
    beforeCommitAccess.response.contentLength,
  );
  return 9;
}

function proveReplay(caseId: A7ThreatCase): number {
  const context = createIssuedGrantContext(caseId);
  const company = context.fixture.companies.a;
  const grant = context.grantResult;
  const firstRequest = context.fixture.requests.exchange(company, grant, caseId);
  const first = context.service.exchange(firstRequest);
  expect(first.receipt.outcome).toBe('SUCCEEDED');
  const afterFirst = effectSnapshot(context.service);
  const lostResponseRetry = context.service.exchange(firstRequest);
  expect(lostResponseRetry.receipt.replayed).toBe(true);
  expect(lostResponseRetry.sessionPresentation).toBe(first.sessionPresentation);
  expect(effectSnapshot(context.service).sessionsCreated).toBe(afterFirst.sessionsCreated);
  const secondRequest = context.fixture.requests.exchange(company, grant, caseId, {
    requestId: fixtureUuid(`${caseId}:replay:second-request`),
    logicalIdempotencyKey: `aico007:${caseId}:replay:second-logical-key`,
  });
  const second = context.service.exchange(secondRequest);
  expect(second.receipt.outcome).toBe('DENIED');
  expect(second.receipt.reason).toBe('CREDENTIAL_REPLAYED');
  expect(context.service.ledger.sessionsCreated).toBe(1);

  const otherHostRequest = context.fixture.requests.exchange(company, grant, caseId, {
    requestId: fixtureUuid(`${caseId}:replay:other-host-request`),
    logicalIdempotencyKey: `aico007:${caseId}:replay:other-host-logical`,
    host: context.fixture.companies.b.preview.host,
    environment: context.fixture.companies.b.preview.environment,
    origin: `https://${context.fixture.companies.b.preview.host}`,
  });
  expect(context.service.exchange(otherHostRequest).receipt.outcome).toBe('DENIED');

  const expired = createIssuedGrantContext(caseId);
  expired.fixture.clock.set(AICO007_EXPIRES_AT);
  const expiredResult = expired.service.exchange(
    expired.fixture.requests.exchange(expired.fixture.companies.a, expired.grantResult, caseId),
  );
  expect(expiredResult.receipt.outcome).toBe('DENIED');
  expect(expiredResult.sessionPresentation).toBeNull();

  const revoked = createIssuedGrantContext(caseId);
  const revocationRequest = revoked.fixture.requests.revoke(revoked.fixture.companies.a, caseId);
  registerIntent(revoked.service, revocationRequest.toolInvocation);
  expect(revoked.service.revoke(revocationRequest).outcome).toBe('SUCCEEDED');
  expect(
    revoked.service.exchange(
      revoked.fixture.requests.exchange(revoked.fixture.companies.a, revoked.grantResult, caseId),
    ).receipt.outcome,
  ).toBe('DENIED');

  const staleKey = createIssuedGrantContext(caseId);
  staleKey.service.mutateAuthority(
    'preview',
    staleKey.fixture.companies.a.preview.previewId,
    (preview) => (preview.keyVersion = Number(preview.keyVersion) + 1),
  );
  expect(
    staleKey.service.exchange(
      staleKey.fixture.requests.exchange(
        staleKey.fixture.companies.a,
        staleKey.grantResult,
        caseId,
      ),
    ).receipt.outcome,
  ).toBe('DENIED');

  const unknown = createContext(caseId, { faults: { exchangeUnknownAfterNonce: true } });
  publishCompany(unknown, caseId, unknown.fixture.companies.a);
  const unknownGrantRequest = unknown.fixture.requests.grant(unknown.fixture.companies.a, caseId);
  registerIntent(unknown.service, unknownGrantRequest.toolInvocation);
  const unknownGrant = unknown.service.issueGrant(unknownGrantRequest);
  const unknownRequest = unknown.fixture.requests.exchange(
    unknown.fixture.companies.a,
    unknownGrant,
    caseId,
  );
  const ambiguous = unknown.service.exchange(unknownRequest);
  expect(ambiguous.receipt.outcome).toBe('UNKNOWN');
  expect(ambiguous.sessionPresentation).toBeNull();
  expect(unknown.service.exchange(unknownRequest).receipt.replayed).toBe(true);
  expect(unknown.service.ledger.sessionsCreated).toBe(0);

  let racing: IssuedGrantContext | null = null;
  const raceResults: { competing?: ReturnType<PreviewProofService['exchange']> } = {};
  let competingRequest: ExchangeRequest | null = null;
  let enteredBarrier = false;
  const racingContext = createContext(caseId, {
    hooks: {
      beforeNonceConsume: (): void => {
        if (enteredBarrier) return;
        enteredBarrier = true;
        if (racing === null || competingRequest === null) {
          throw new Error('Exchange race was not initialized');
        }
        raceResults.competing = racing.service.exchange(competingRequest);
      },
    },
  });
  const racingPublication = publishCompany(
    racingContext,
    caseId,
    racingContext.fixture.companies.a,
  );
  const racingGrantRequest = racingContext.fixture.requests.grant(
    racingContext.fixture.companies.a,
    caseId,
  );
  registerIntent(racingContext.service, racingGrantRequest.toolInvocation);
  const racingGrant = racingContext.service.issueGrant(racingGrantRequest);
  expect(racingGrant.receipt.outcome).toBe('SUCCEEDED');
  racing = {
    ...racingContext,
    publicationRequest: racingPublication,
    grantRequest: racingGrantRequest,
    grantResult: racingGrant,
  };
  const firstRacingRequest = distinctExchangeRequest(
    racing.fixture,
    racing.fixture.companies.a,
    racing.grantResult,
    caseId,
    'race-first',
  );
  competingRequest = distinctExchangeRequest(
    racing.fixture,
    racing.fixture.companies.a,
    racing.grantResult,
    caseId,
    'race-competing',
  );
  const firstRacingResult = racing.service.exchange(firstRacingRequest);
  expect(enteredBarrier).toBe(true);
  const competingResult = raceResults.competing;
  if (competingResult === undefined) throw new Error('Competing exchange did not run');
  const raceOutcomes = [firstRacingResult.receipt.outcome, competingResult.receipt.outcome];
  expect(raceOutcomes.filter((outcome) => outcome === 'SUCCEEDED')).toHaveLength(1);
  expect(raceOutcomes.filter((outcome) => outcome === 'DENIED')).toHaveLength(1);
  expect(racing.service.ledger.noncesConsumed).toBe(1);
  expect(racing.service.ledger.sessionsCreated).toBe(1);
  expect(racing.service.ledger.cookiesIssued).toBe(1);
  return 10;
}

function proveCacheAuthorizationOrder(caseId: A7ThreatCase): number {
  const context = createPublishedSession(caseId);
  const first = allowAccess(context, caseId);
  expect(first.cacheResult).toBe('MISS');
  expect(first.response.headers).toEqual(GENERATED_RESPONSE_HEADERS);
  const second = allowAccess(context, caseId);
  expect(second.cacheResult).toBe('HIT');

  const noCookieBefore = effectSnapshot(context.service);
  const noCookie = context.service.access(
    context.fixture.requests.access(context.fixture.companies.a, null, caseId),
  );
  expect(noCookie.outcome).toBe('DENIED');
  expect(noCookie.cacheResult).toBe('NOT_CHECKED');
  expect(noCookie.response.headers).toEqual(GENERATED_RESPONSE_HEADERS);
  expect(effectSnapshot(context.service).cacheLookups - noCookieBefore.cacheLookups).toBe(0);

  for (const override of [{ range: 'bytes=0-1' }, { ifNoneMatch: 'opaque-validator' }]) {
    const before = effectSnapshot(context.service);
    const denied = context.service.access(
      context.fixture.requests.access(
        context.fixture.companies.a,
        context.sessionPresentation,
        caseId,
        override,
      ),
    );
    expect(denied.outcome).toBe('DENIED');
    expect(denied.cacheResult).toBe('NOT_CHECKED');
    expect(effectSnapshot(context.service).cacheLookups - before.cacheLookups).toBe(0);
  }

  revoke(context, caseId);
  const denied = context.service.access(
    context.fixture.requests.access(
      context.fixture.companies.a,
      context.sessionPresentation,
      caseId,
    ),
  );
  expect(denied.outcome).toBe('DENIED');
  expect(denied.cacheResult).toBe('NOT_CHECKED');
  expect(denied.response.headers).toEqual(GENERATED_RESPONSE_HEADERS);
  return 7;
}

function proveCacheKey(caseId: A7ThreatCase): number {
  const context = createPublishedSession(caseId);
  const foreign = context.fixture.companies.b;
  publishCompany(context, caseId, foreign);
  const foreignGrantRequest = context.fixture.requests.grant(foreign, caseId);
  registerIntent(context.service, foreignGrantRequest.toolInvocation);
  const foreignGrant = context.service.issueGrant(foreignGrantRequest);
  const foreignExchange = context.service.exchange(
    context.fixture.requests.exchange(foreign, foreignGrant, caseId),
  );
  expect(foreignExchange.sessionPresentation).not.toBeNull();
  const a = allowAccess(context, caseId);
  expect(a.cacheResult).toBe('MISS');
  const cacheState = context.service.exportState();
  const originalCache = cacheState.cache[0];
  expect(originalCache).toBeDefined();
  const parsedKey = JSON.parse(originalCache?.[0] ?? '{}') as Record<string, unknown>;
  expect(Object.keys(parsedKey).sort()).toEqual(
    [
      'contentSha256',
      'environment',
      'headerProfileDigest',
      'normalizedPath',
      'objectVersionId',
      'outputManifestDigest',
      'previewId',
      'previewVersion',
      'publicPreviewId',
    ].sort(),
  );
  const b = context.service.access(
    context.fixture.requests.access(foreign, foreignExchange.sessionPresentation, caseId),
  );
  expect(b.outcome).toBe('ALLOWED');
  expect(b.cacheResult).toBe('MISS');
  expect(Buffer.from(b.response.body).toString('utf8')).toContain('Beta Bakery');
  expect(context.service.exportState().cache).toHaveLength(2);

  const queryVariant = context.service.access(
    context.fixture.requests.access(
      context.fixture.companies.a,
      context.sessionPresentation,
      caseId,
      { path: '/?ignored=not-authority' },
    ),
  );
  expect(queryVariant.outcome).toBe('ALLOWED');
  expect(queryVariant.cacheResult).toBe('HIT');

  const keyFields = [
    'environment',
    'publicPreviewId',
    'previewId',
    'previewVersion',
    'outputManifestDigest',
    'normalizedPath',
    'objectVersionId',
    'contentSha256',
    'headerProfileDigest',
  ] as const;
  for (const field of keyFields) {
    const isolated = createPublishedSession(caseId);
    allowAccess(isolated, caseId);
    const state = isolated.service.exportState();
    const cached = state.cache[0];
    expect(cached).toBeDefined();
    const keyObject = JSON.parse(cached?.[0] ?? '{}') as Record<string, unknown>;
    keyObject[field] = `${String(keyObject[field])}:mutated`;
    const mutatedKey = JSON.stringify(
      Object.fromEntries(
        Object.entries(keyObject).sort(([left], [right]) => left.localeCompare(right)),
      ),
    );
    const mutatedState = {
      ...state,
      cache: [[mutatedKey, { ...structuredClone(cached?.[1]), key: mutatedKey }] as const],
    };
    const replacement = trackService(
      new PreviewProofService(
        mutatedState,
        isolated.fixture.clock,
        isolated.fixture.signing,
        isolated.fixture.redactionProfile,
      ),
    );
    const access = replacement.access(
      isolated.fixture.requests.access(
        isolated.fixture.companies.a,
        isolated.sessionPresentation,
        caseId,
      ),
    );
    expect(access.outcome).toBe('ALLOWED');
    expect(access.cacheResult).toBe('MISS');
  }

  const poisoned = createPublishedSession(caseId);
  allowAccess(poisoned, caseId);
  const poisonedState = poisoned.service.exportState();
  const poisonedCache = poisonedState.cache[0];
  expect(poisonedCache).toBeDefined();
  const replacement = trackService(
    new PreviewProofService(
      {
        ...poisonedState,
        cache: poisonedState.cache.map(([key, value]) => [
          key,
          { ...value, body: Buffer.concat([value.body, Buffer.from('poison')]) },
        ]),
      },
      poisoned.fixture.clock,
      poisoned.fixture.signing,
      poisoned.fixture.redactionProfile,
    ),
  );
  const poisonedBefore = effectSnapshot(replacement);
  const poisonReceipt = replacement.access(
    poisoned.fixture.requests.access(
      poisoned.fixture.companies.a,
      poisoned.sessionPresentation,
      caseId,
    ),
  );
  expect(poisonReceipt.outcome).toBe('DENIED');
  expect(poisonReceipt.response.body).toHaveLength(0);
  expect(
    effectSnapshot(replacement).generatedBytesServed - poisonedBefore.generatedBytesServed,
  ).toBe(0);
  return keyFields.length + 5;
}

function proveHistory(caseId: A7ThreatCase): number {
  const historyVectors = [
    { vectorClass: 'RELOAD', navigation: true, restart: false },
    { vectorClass: 'BACK_FORWARD', navigation: true, restart: false },
    { vectorClass: 'PRERENDER', navigation: true, restart: false },
    { vectorClass: 'PREFETCH', navigation: false, restart: false },
    { vectorClass: 'DUPLICATE_TAB', navigation: true, restart: false },
    { vectorClass: 'BROWSER_RESTART', navigation: true, restart: true },
    { vectorClass: 'SESSION_RESTORE', navigation: true, restart: true },
    { vectorClass: 'SAVED_CLEAN_URL', navigation: true, restart: true },
  ] as const;
  const lifecycleVectors = ['EXPIRED', 'REVOKED'] as const;
  for (const lifecycle of lifecycleVectors) {
    for (const vector of historyVectors) {
      const context = createPublishedSession(caseId);
      allowAccess(context, caseId);
      if (lifecycle === 'EXPIRED') context.fixture.clock.set(AICO007_EXPIRES_AT);
      else revoke(context, caseId);
      const service = vector.restart
        ? trackService(
            new PreviewProofService(
              context.service.exportState(),
              context.fixture.clock,
              context.fixture.signing,
              context.fixture.redactionProfile,
            ),
          )
        : context.service;
      const before = effectSnapshot(service);
      const reopened = service.access(
        context.fixture.requests.access(
          context.fixture.companies.a,
          context.sessionPresentation,
          caseId,
          { navigation: vector.navigation },
        ),
      );
      const after = effectSnapshot(service);
      expect(reopened.outcome).toBe('DENIED');
      expect(reopened.cacheResult).toBe('NOT_CHECKED');
      expect(reopened.response.body).toHaveLength(0);
      expect(after.cacheLookups - before.cacheLookups).toBe(0);
      expect(after.objectReads - before.objectReads).toBe(0);
      expect(after.generatedBytesServed - before.generatedBytesServed).toBe(0);
      expect(vector.vectorClass.length).toBeGreaterThan(0);
    }
  }
  return historyVectors.length * lifecycleVectors.length;
}

function proveCleanup(caseId: A7ThreatCase): number {
  const success = createPublishedSession(caseId);
  const companyA = success.fixture.companies.a;
  const companyB = success.fixture.companies.b;
  allowAccess(success, caseId);
  publishCompany(success, caseId, companyB);
  const bGrantRequest = success.fixture.requests.grant(companyB, caseId);
  registerIntent(success.service, bGrantRequest.toolInvocation);
  const bGrant = success.service.issueGrant(bGrantRequest);
  expect(bGrant.receipt.outcome).toBe('SUCCEEDED');
  const bExchange = success.service.exchange(
    success.fixture.requests.exchange(companyB, bGrant, caseId),
  );
  expect(bExchange.sessionPresentation).not.toBeNull();
  const bAccess = success.service.access(
    success.fixture.requests.access(companyB, bExchange.sessionPresentation, caseId),
  );
  expect(bAccess.outcome).toBe('ALLOWED');
  const companyBBefore = canonicalDigest(
    success.service
      .exportState()
      .objects.filter(([, object]) => object.companyId === companyB.authority.companyId),
  );

  revoke(success, caseId);
  const successRequest = success.fixture.requests.cleanup(companyA, caseId);
  registerIntent(success.service, successRequest.toolInvocation);
  const beforeSuccess = effectSnapshot(success.service);
  const successReceipt = success.service.cleanup(successRequest);
  expect(successReceipt.outcome).toBe('SUCCEEDED');
  expect(successReceipt.state).toBe('PURGED');
  expect(successReceipt.remainingObjects).toBe(0);
  expect(successReceipt.hostTombstoned).toBe(true);
  const afterSuccess = effectSnapshot(success.service);
  expect(afterSuccess.objectsDeleted - beforeSuccess.objectsDeleted).toBe(
    companyA.build.entries.length,
  );
  expect(afterSuccess.cachePurges - beforeSuccess.cachePurges).toBe(1);
  const beforeReplay = effectSnapshot(success.service);
  const replay = success.service.cleanup(successRequest);
  expect(replay.replayed).toBe(true);
  expect(effectSnapshot(success.service)).toEqual(beforeReplay);
  const companyBAfter = canonicalDigest(
    success.service
      .exportState()
      .objects.filter(([, object]) => object.companyId === companyB.authority.companyId),
  );
  expect(companyBAfter).toBe(companyBBefore);
  expectDeniedAccess(success, caseId);

  const rebuiltCompany = { ...companyA, preview: success.fixture.rebuildA };
  expect(rebuiltCompany.preview.host).not.toBe(companyA.preview.host);
  const rebuildRequest = distinctPublicationRequest(
    success.fixture,
    rebuiltCompany,
    caseId,
    'rebuild-after-cleanup',
  );
  registerIntent(success.service, rebuildRequest.toolInvocation);
  const rebuildReceipt = success.service.publish(rebuildRequest);
  expect(rebuildReceipt.outcome).toBe('SUCCEEDED');
  expect(rebuildReceipt.state).toBe('AVAILABLE');
  expect(success.service.exportState().retiredHosts).toContain(companyA.preview.host);

  const partial = createPublishedSession(caseId);
  allowAccess(partial, caseId);
  revoke(partial, caseId);
  partial.service.faults.cleanupPartial = true;
  const partialRequest = partial.fixture.requests.cleanup(partial.fixture.companies.a, caseId);
  registerIntent(partial.service, partialRequest.toolInvocation);
  const partialReceipt = partial.service.cleanup(partialRequest);
  expect(partialReceipt.outcome).toBe('UNKNOWN');
  expect(partialReceipt.state).toBe('UNKNOWN');
  expect(partialReceipt.remainingObjects).toBeGreaterThan(0);
  expect(partialReceipt.hostTombstoned).toBe(false);
  expectDeniedAccess(partial, caseId);
  const partialBeforeReplay = effectSnapshot(partial.service);
  expect(partial.service.cleanup(partialRequest).replayed).toBe(true);
  expect(effectSnapshot(partial.service)).toEqual(partialBeforeReplay);
  partial.service.faults.cleanupPartial = false;
  const partialRetry = distinctCleanupRequest(
    partial.fixture,
    partial.fixture.companies.a,
    caseId,
    'partial-retry',
    partial.fixture.companies.a.preview.revocationEpoch + 1,
  );
  registerIntent(partial.service, partialRetry.toolInvocation);
  const partialResolved = partial.service.cleanup(partialRetry);
  expect(partialResolved.outcome).toBe('SUCCEEDED');
  expect(partialResolved.state).toBe('PURGED');
  expect(partialResolved.hostTombstoned).toBe(true);

  const crashed = createPublishedSession(caseId);
  allowAccess(crashed, caseId);
  revoke(crashed, caseId);
  crashed.service.faults.cleanupUnknown = true;
  const crashRequest = crashed.fixture.requests.cleanup(crashed.fixture.companies.a, caseId);
  registerIntent(crashed.service, crashRequest.toolInvocation);
  const crashReceipt = crashed.service.cleanup(crashRequest);
  expect(crashReceipt.outcome).toBe('UNKNOWN');
  expect(crashReceipt.state).toBe('UNKNOWN');
  expect(crashReceipt.remainingObjects).toBe(0);
  expect(crashReceipt.hostTombstoned).toBe(false);
  const replacement = trackService(
    new PreviewProofService(
      crashed.service.exportState(),
      crashed.fixture.clock,
      crashed.fixture.signing,
      crashed.fixture.redactionProfile,
    ),
  );
  const crashRetry = distinctCleanupRequest(
    crashed.fixture,
    crashed.fixture.companies.a,
    caseId,
    'crash-retry',
    crashed.fixture.companies.a.preview.revocationEpoch + 1,
  );
  registerIntent(replacement, crashRetry.toolInvocation);
  const crashResolved = replacement.cleanup(crashRetry);
  expect(crashResolved.outcome).toBe('SUCCEEDED');
  expect(crashResolved.state).toBe('PURGED');
  expect(crashResolved.hostTombstoned).toBe(true);
  const oldHostBefore = effectSnapshot(replacement);
  const oldHost = replacement.access(
    crashed.fixture.requests.access(
      crashed.fixture.companies.a,
      crashed.sessionPresentation,
      caseId,
    ),
  );
  expect(oldHost.outcome).toBe('DENIED');
  expect(oldHost.cacheResult).toBe('NOT_CHECKED');
  expect(effectSnapshot(replacement).objectReads).toBe(oldHostBefore.objectReads);

  const state = success.service.exportState();
  recordCleanup({
    resultClass: successReceipt.outcome,
    objectsRemaining: successReceipt.remainingObjects,
    cacheEntriesRemaining: state.cache.filter(([key]) =>
      key.includes(companyA.preview.publicPreviewId),
    ).length,
    retiredHosts: state.retiredHosts.length,
  });
  return 11;
}

function proveUnknownOutcome(caseId: A7ThreatCase): number {
  const publication = createContext(caseId, {
    faults: { publicationUnknownAfterCopy: true },
  });
  const publicationRequest = publication.fixture.requests.publication(
    publication.fixture.companies.a,
    caseId,
  );
  registerIntent(publication.service, publicationRequest.toolInvocation);
  const publicationBefore = effectSnapshot(publication.service);
  const publicationUnknown = publication.service.publish(publicationRequest);
  expect(publicationUnknown.outcome).toBe('UNKNOWN');
  expect(publicationUnknown.state).toBe('UNKNOWN');
  expect(effectSnapshot(publication.service).publicationsActivated).toBe(
    publicationBefore.publicationsActivated,
  );
  const publicationReplacement = trackService(
    new PreviewProofService(
      publication.service.exportState(),
      publication.fixture.clock,
      publication.fixture.signing,
      publication.fixture.redactionProfile,
    ),
  );
  const publicationReconcile = publication.fixture.requests.reconcile(
    publicationRequest,
    'PUBLICATION',
    caseId,
  );
  registerIntent(publicationReplacement, publicationReconcile.toolInvocation);
  assertUnknownReconciliation(publicationReplacement.reconcile(publicationReconcile));

  const exchange = createContext(caseId, { faults: { exchangeUnknownAfterNonce: true } });
  publishCompany(exchange, caseId, exchange.fixture.companies.a);
  const grantRequest = exchange.fixture.requests.grant(exchange.fixture.companies.a, caseId);
  registerIntent(exchange.service, grantRequest.toolInvocation);
  const grant = exchange.service.issueGrant(grantRequest);
  const exchangeRequest = exchange.fixture.requests.exchange(
    exchange.fixture.companies.a,
    grant,
    caseId,
  );
  const exchangeBefore = effectSnapshot(exchange.service);
  const exchangeUnknown = exchange.service.exchange(exchangeRequest);
  expect(exchangeUnknown.receipt.outcome).toBe('UNKNOWN');
  expect(exchangeUnknown.sessionPresentation).toBeNull();
  expect(effectSnapshot(exchange.service).noncesConsumed - exchangeBefore.noncesConsumed).toBe(1);
  expect(effectSnapshot(exchange.service).sessionsCreated - exchangeBefore.sessionsCreated).toBe(0);
  const exchangeReplacement = trackService(
    new PreviewProofService(
      exchange.service.exportState(),
      exchange.fixture.clock,
      exchange.fixture.signing,
      exchange.fixture.redactionProfile,
    ),
  );
  const retriedExchange = exchangeReplacement.exchange(exchangeRequest);
  expect(retriedExchange.receipt.outcome).toBe('UNKNOWN');
  expect(retriedExchange.receipt.replayed).toBe(true);
  expect(retriedExchange.sessionPresentation).toBeNull();
  const exchangeReconcile = exchange.fixture.requests.reconcile(
    exchangeRequest,
    'EXCHANGE',
    caseId,
  );
  registerIntent(exchangeReplacement, exchangeReconcile.toolInvocation);
  assertUnknownReconciliation(exchangeReplacement.reconcile(exchangeReconcile));
  const replacementGrantRequest = distinctGrantRequest(
    exchange.fixture,
    exchange.fixture.companies.a,
    caseId,
    'replacement-after-unknown-exchange',
  );
  registerIntent(exchangeReplacement, replacementGrantRequest.toolInvocation);
  const replacementGrant = exchangeReplacement.issueGrant(replacementGrantRequest);
  expect(replacementGrant.receipt.outcome).toBe('SUCCEEDED');
  const replacementExchange = exchangeReplacement.exchange(
    distinctExchangeRequest(
      exchange.fixture,
      exchange.fixture.companies.a,
      replacementGrant,
      caseId,
      'replacement-after-unknown-exchange',
    ),
  );
  expect(replacementExchange.receipt.outcome).toBe('SUCCEEDED');

  const revocation = createPublishedSession(caseId, {
    faults: { revocationUnknownAfterEpoch: true },
  });
  const revocationRequest = revocation.fixture.requests.revoke(
    revocation.fixture.companies.a,
    caseId,
  );
  registerIntent(revocation.service, revocationRequest.toolInvocation);
  const revocationBefore = effectSnapshot(revocation.service);
  const revocationUnknown = revocation.service.revoke(revocationRequest);
  expect(revocationUnknown.outcome).toBe('UNKNOWN');
  expect(revocationUnknown.reason).toBe('UNKNOWN_EXTERNAL_OUTCOME');
  expect(revocationUnknown.state).toBe('REVOKED');
  expect(revocationUnknown.currentEpoch).toBe((revocationUnknown.previousEpoch ?? 0) + 1);
  const revocationAfter = effectSnapshot(revocation.service);
  expect(revocationAfter.revocations - revocationBefore.revocations).toBe(1);
  const revocationReplay = revocation.service.revoke(revocationRequest);
  expect(revocationReplay.outcome).toBe('UNKNOWN');
  expect(revocationReplay.replayed).toBe(true);
  expect(effectSnapshot(revocation.service).revocations).toBe(revocationAfter.revocations);
  const postUnknownBefore = effectSnapshot(revocation.service);
  expectDeniedAccess(revocation, caseId);
  expect(effectSnapshot(revocation.service).cacheLookups).toBe(postUnknownBefore.cacheLookups);
  expect(effectSnapshot(revocation.service).objectReads).toBe(postUnknownBefore.objectReads);
  const revocationReplacement = trackService(
    new PreviewProofService(
      revocation.service.exportState(),
      revocation.fixture.clock,
      revocation.fixture.signing,
      revocation.fixture.redactionProfile,
    ),
  );
  const mismatchedInspection = revocation.fixture.requests.reconcile(
    revocationRequest,
    'EXCHANGE',
    caseId,
  );
  registerIntent(revocationReplacement, mismatchedInspection.toolInvocation);
  const beforeMismatchedInspection = effectSnapshot(revocationReplacement);
  const mismatched = revocationReplacement.reconcile(mismatchedInspection);
  expect(mismatched.outcome).toBe('DENIED');
  expect(mismatched.reason).toBe('BINDING_MISMATCH');
  expect(effectSnapshot(revocationReplacement).toolIntentsConsumed).toBe(
    beforeMismatchedInspection.toolIntentsConsumed,
  );
  const revocationInspection = revocation.fixture.requests.reconcile(
    revocationRequest,
    'REVOCATION',
    caseId,
  );
  registerIntent(revocationReplacement, revocationInspection.toolInvocation);
  const resolvedRevocation = revocationReplacement.inspectRevocation(revocationInspection);
  expect(resolvedRevocation.outcome).toBe('SUCCEEDED');
  expect(resolvedRevocation.reason).toBe('RECONCILED');
  expect(resolvedRevocation.resolvedReceiptDigest).not.toBeNull();

  const deletion = createPublishedSession(caseId);
  allowAccess(deletion, caseId);
  revoke(deletion, caseId);
  deletion.service.faults.cleanupUnknown = true;
  const deletionRequest = deletion.fixture.requests.cleanup(deletion.fixture.companies.a, caseId);
  registerIntent(deletion.service, deletionRequest.toolInvocation);
  const deletionUnknown = deletion.service.cleanup(deletionRequest);
  expect(deletionUnknown.outcome).toBe('UNKNOWN');
  expect(deletionUnknown.state).toBe('UNKNOWN');
  expect(deletionUnknown.hostTombstoned).toBe(false);
  expectDeniedAccess(deletion, caseId);
  const deletionReplacement = trackService(
    new PreviewProofService(
      deletion.service.exportState(),
      deletion.fixture.clock,
      deletion.fixture.signing,
      deletion.fixture.redactionProfile,
    ),
  );
  const deletionReconcile = deletion.fixture.requests.reconcile(deletionRequest, 'CLEANUP', caseId);
  registerIntent(deletionReplacement, deletionReconcile.toolInvocation);
  assertUnknownReconciliation(deletionReplacement.reconcile(deletionReconcile));
  const deletionRetry = distinctCleanupRequest(
    deletion.fixture,
    deletion.fixture.companies.a,
    caseId,
    'delete-unknown-retry',
    deletion.fixture.companies.a.preview.revocationEpoch + 1,
  );
  registerIntent(deletionReplacement, deletionRetry.toolInvocation);
  const deletionResolved = deletionReplacement.cleanup(deletionRetry);
  expect(deletionResolved.outcome).toBe('SUCCEEDED');
  expect(deletionResolved.hostTombstoned).toBe(true);
  return 14;
}

function assertUnknownReconciliation(receipt: ReturnType<PreviewProofService['reconcile']>): void {
  expect(receipt.outcome).toBe('UNKNOWN');
  expect(receipt.reason).toBe('UNKNOWN_EXTERNAL_OUTCOME');
  expect(receipt.resolvedReceiptDigest).toBeNull();
}

function proveUnsafeEvidenceRejected(caseId: A7ThreatCase, canary: string): number {
  const context = createContext(caseId);
  expect(() =>
    context.service.assertEvidenceSafe(
      { schemaVersion: 1, safeClass: 'DENIAL', prohibitedValue: canary },
      Object.values(AICO007_CANARIES),
    ),
  ).toThrow();
  expect(context.service.ledger.costEffects).toBe(0);
  return 1;
}

function proveUniformDisclosure(caseId: A7ThreatCase): number {
  const denials: AccessReceipt[] = [];
  const absent = createPublishedSession(caseId);
  for (const method of ['GET', 'HEAD'] as const) {
    denials.push(
      absent.service.access(
        absent.fixture.requests.access(absent.fixture.companies.a, null, caseId, { method }),
      ),
    );
  }

  const foreign = createPublishedSession(caseId);
  for (const method of ['GET', 'HEAD'] as const) {
    denials.push(
      foreign.service.access(
        foreign.fixture.requests.access(
          foreign.fixture.companies.b,
          foreign.sessionPresentation,
          caseId,
          { method },
        ),
      ),
    );
  }

  const expired = createPublishedSession(caseId);
  expired.fixture.clock.set(AICO007_EXPIRES_AT);
  for (const method of ['GET', 'HEAD'] as const) {
    denials.push(
      expired.service.access(
        expired.fixture.requests.access(
          expired.fixture.companies.a,
          expired.sessionPresentation,
          caseId,
          { method },
        ),
      ),
    );
  }

  const revoked = createPublishedSession(caseId);
  revoke(revoked, caseId);
  for (const method of ['GET', 'HEAD'] as const) {
    denials.push(
      revoked.service.access(
        revoked.fixture.requests.access(
          revoked.fixture.companies.a,
          revoked.sessionPresentation,
          caseId,
          { method },
        ),
      ),
    );
  }

  const malformed = createPublishedSession(caseId);
  for (const method of ['GET', 'HEAD'] as const) {
    denials.push(
      malformed.service.access(
        malformed.fixture.requests.access(
          malformed.fixture.companies.a,
          `${malformed.sessionPresentation}.tampered`,
          caseId,
          { method },
        ),
      ),
    );
  }

  const unsupported = createPublishedSession(caseId);
  for (const method of ['POST', 'OPTIONS'] as const) {
    denials.push(
      unsupported.service.access(
        unsupported.fixture.requests.access(
          unsupported.fixture.companies.a,
          unsupported.sessionPresentation,
          caseId,
          { method },
        ),
      ),
    );
  }

  const unknownHost = createPublishedSession(caseId);
  for (const method of ['GET', 'HEAD'] as const) {
    denials.push(
      unknownHost.service.access(
        unknownHost.fixture.requests.access(
          unknownHost.fixture.companies.a,
          unknownHost.sessionPresentation,
          caseId,
          { method, host: 'opaque.preview.invalid' },
        ),
      ),
    );
  }

  const missingPath = createPublishedSession(caseId);
  for (const method of ['GET', 'HEAD'] as const) {
    denials.push(
      missingPath.service.access(
        missingPath.fixture.requests.access(
          missingPath.fixture.companies.a,
          missingPath.sessionPresentation,
          caseId,
          { method, path: '/opaque-missing-resource', navigation: false },
        ),
      ),
    );
  }

  const inactive = createPublishedSession(caseId);
  inactive.service.mutateAuthority(
    'preview',
    inactive.fixture.companies.a.preview.previewId,
    (preview) => (preview.state = 'QUARANTINED'),
  );
  for (const method of ['GET', 'HEAD'] as const) {
    denials.push(
      inactive.service.access(
        inactive.fixture.requests.access(
          inactive.fixture.companies.a,
          inactive.sessionPresentation,
          caseId,
          { method },
        ),
      ),
    );
  }

  const baselineDigest = canonicalDigest(denials[0]?.response);
  const denialVectorClasses = [
    'ABSENT_GET',
    'ABSENT_HEAD',
    'FOREIGN_GET',
    'FOREIGN_HEAD',
    'EXPIRED_GET',
    'EXPIRED_HEAD',
    'REVOKED_GET',
    'REVOKED_HEAD',
    'TAMPERED_GET',
    'TAMPERED_HEAD',
    'UNSUPPORTED_POST',
    'UNSUPPORTED_OPTIONS',
    'UNKNOWN_HOST_GET',
    'UNKNOWN_HOST_HEAD',
    'MISSING_PATH_GET',
    'MISSING_PATH_HEAD',
    'INACTIVE_GET',
    'INACTIVE_HEAD',
  ] as const;
  expect(denials).toHaveLength(denialVectorClasses.length);
  const unexpectedAllow = denials.findIndex((receipt) => receipt.outcome !== 'DENIED');
  if (unexpectedAllow >= 0) {
    throw new Error(`Disclosure vector was not denied: ${denialVectorClasses[unexpectedAllow]}`);
  }
  for (const receipt of denials) {
    expect(receipt.outcome).toBe('DENIED');
    expect(receipt.response.status).toBe(404);
    expect(receipt.response.code).toBe('resource_not_found');
    expect(receipt.response.contentLength).toBe(0);
    expect(receipt.response.body).toHaveLength(0);
    expect(receipt.response.headers).toEqual(GENERATED_RESPONSE_HEADERS);
    expect(receipt.cacheResult).toBe('NOT_CHECKED');
    expect(canonicalDigest(receipt.response)).toBe(baselineDigest);
  }
  for (const service of [
    absent.service,
    foreign.service,
    expired.service,
    revoked.service,
    malformed.service,
    unsupported.service,
    unknownHost.service,
    missingPath.service,
    inactive.service,
  ]) {
    expect(service.ledger.generatedBytesServed).toBe(0);
    expect(service.ledger.foreignBytesServed).toBe(0);
    expect(service.ledger.cacheLookups).toBe(0);
    expect(service.ledger.objectReads).toBe(0);
  }

  const exchangeDenials = [
    createIssuedGrantContext(caseId),
    createIssuedGrantContext(caseId),
    createIssuedGrantContext(caseId),
  ];
  exchangeDenials[0]?.fixture.clock.set(AICO007_EXPIRES_AT);
  const revokedExchange = exchangeDenials[1];
  expect(revokedExchange).toBeDefined();
  if (revokedExchange !== undefined) {
    const request = revokedExchange.fixture.requests.revoke(
      revokedExchange.fixture.companies.a,
      caseId,
    );
    registerIntent(revokedExchange.service, request.toolInvocation);
    expect(revokedExchange.service.revoke(request).outcome).toBe('SUCCEEDED');
  }
  const exchangeResults = exchangeDenials.map((context, index) => {
    expect(context).toBeDefined();
    const override =
      index === 2 ? { capability: `${context?.grantResult.grant?.compact ?? ''}.tampered` } : {};
    return context?.service.exchange(
      context.fixture.requests.exchange(
        context.fixture.companies.a,
        context.grantResult,
        caseId,
        override,
      ),
    );
  });
  for (const result of exchangeResults) {
    expect(result?.receipt.outcome).toBe('DENIED');
    expect(result?.sessionPresentation).toBeNull();
  }
  return denials.length + exchangeResults.length;
}

function proveRedactionFailure(caseId: A7ThreatCase): number {
  const context = createContext(caseId, { faults: { redactionFailure: true } });
  expect(() =>
    context.service.assertEvidenceSafe(
      { schemaVersion: 1, safeClass: 'SUCCESS', count: 1 },
      Object.values(AICO007_CANARIES),
    ),
  ).toThrow();
  expect(context.service.ledger.redactionDrops).toBe(1);
  return 1;
}

function allowAccess(
  context: PublishedSession,
  caseId: A7ThreatCase,
): ReturnType<PreviewProofService['access']> {
  const receipt = context.service.access(
    context.fixture.requests.access(
      context.fixture.companies.a,
      context.sessionPresentation,
      caseId,
    ),
  );
  expect(receipt.outcome).toBe('ALLOWED');
  expect(receipt.response.status).toBe(200);
  return receipt;
}

function expectDeniedAccess(context: PublishedSession, caseId: A7ThreatCase): void {
  const beforeBytes = context.service.ledger.generatedBytesServed;
  const receipt = context.service.access(
    context.fixture.requests.access(
      context.fixture.companies.a,
      context.sessionPresentation,
      caseId,
    ),
  );
  expect(receipt.outcome).toBe('DENIED');
  expect(receipt.response.status).toBe(404);
  expect(receipt.response.body).toHaveLength(0);
  expect(context.service.ledger.generatedBytesServed).toBe(beforeBytes);
  expect(context.service.ledger.costEffects).toBe(0);
}

const browserProver = (reasonClass: string): CaseProver => ({
  reasonClass,
  run: proveBrowserCase,
});

const CASE_PROVERS = {
  'A7-T-POSITIVE-01': { reasonClass: 'EXACT_PREVIEW_FLOW', run: provePositive },
  'A7-T-ORIGIN-SITE-01': browserProver('ORIGIN_SITE_ISOLATED'),
  'A7-T-HOST-TLS-01': browserProver('HOST_TLS_ENFORCED'),
  'A7-T-CONTROL-REQUEST-01': browserProver('CONTROL_REQUEST_BLOCKED'),
  'A7-T-COOKIE-01': browserProver('COOKIE_ISOLATED'),
  'A7-T-COOKIE-STORAGE-01': browserProver('COOKIE_STORAGE_ISOLATED'),
  'A7-T-STORAGE-01': browserProver('STORAGE_ISOLATED'),
  'A7-T-SERVICE-WORKER-01': browserProver('WORKER_DISABLED'),
  'A7-T-OPENER-NAV-01': browserProver('OPENER_SEVERED'),
  'A7-T-NAVIGATION-01': browserProver('NAVIGATION_CONTAINED'),
  'A7-T-FRAME-ANCESTOR-01': browserProver('ANCESTOR_FRAMING_DENIED'),
  'A7-T-FRAME-CHILD-01': browserProver('CHILD_FRAMING_DENIED'),
  'A7-T-SCRIPT-TARGET-01': browserProver('SCRIPT_TARGET_CLOSED'),
  'A7-T-CONNECT-01': browserProver('CONNECT_TARGET_CLOSED'),
  'A7-T-FORM-01': browserProver('FORM_TARGET_CLOSED'),
  'A7-T-SCRIPT-01': browserProver('SCRIPT_POLICY_ENFORCED'),
  'A7-T-REFERRER-01': browserProver('REFERRER_SUPPRESSED'),
  'A7-T-MIME-01': browserProver('MIME_NOSNIFF_ENFORCED'),
  'A7-T-DOWNLOAD-01': browserProver('DOWNLOAD_DENIED'),
  'A7-T-PATH-01': browserProver('METHOD_PATH_CLOSED'),
  'A7-T-BUILD-STATE-01': {
    reasonClass: 'NON_SUCCESS_BUILD_DENIED',
    run: proveBuildState,
  },
  'A7-T-INTEGRITY-01': {
    reasonClass: 'PUBLICATION_INTEGRITY_DENIED',
    run: provePublicationIntegrity,
  },
  'A7-T-SERVE-INTEGRITY-01': {
    reasonClass: 'SERVE_INTEGRITY_DENIED',
    run: proveServeIntegrity,
  },
  'A7-T-ACCESS-BINDING-01': {
    reasonClass: 'EXACT_BINDING_DENIED',
    run: proveAccessBinding,
  },
  'A7-T-AUTHORITY-SOURCE-01': {
    reasonClass: 'UNTRUSTED_AUTHORITY_DENIED',
    run: proveAuthoritySource,
  },
  'A7-T-FOREIGN-01': {
    reasonClass: 'FOREIGN_TENANT_DENIED',
    run: proveForeignTenant,
  },
  'A7-T-FOREIGN-PREVIEW-01': {
    reasonClass: 'FOREIGN_PREVIEW_DENIED',
    run: proveForeignPreview,
  },
  'A7-T-EXPIRY-REVOCATION-01': {
    reasonClass: 'EXPIRY_BOUNDARY_DENIED',
    run: proveExpiry,
  },
  'A7-T-REVOCATION-01': {
    reasonClass: 'REVOCATION_BARRIER_DENIED',
    run: proveRevocation,
  },
  'A7-T-REPLAY-01': {
    reasonClass: 'NONCE_REPLAY_DENIED',
    run: proveReplay,
  },
  'A7-T-CACHE-01': {
    reasonClass: 'AUTHORIZATION_BEFORE_CACHE',
    run: proveCacheAuthorizationOrder,
  },
  'A7-T-CACHE-KEY-01': {
    reasonClass: 'IMMUTABLE_CACHE_KEY',
    run: proveCacheKey,
  },
  'A7-T-HISTORY-01': {
    reasonClass: 'HISTORY_REAUTH_DENIED',
    run: proveHistory,
  },
  'A7-T-CLEANUP-01': {
    reasonClass: 'CLEANUP_SCOPED_AND_IDEMPOTENT',
    run: proveCleanup,
  },
  'A7-T-UNKNOWN-OUTCOME-01': {
    reasonClass: 'UNKNOWN_REMAINS_BLOCKED',
    run: proveUnknownOutcome,
  },
  'A7-T-LOG-01': {
    reasonClass: 'UNSAFE_LOG_DROPPED',
    run: (caseId: A7ThreatCase): number =>
      proveUnsafeEvidenceRejected(caseId, AICO007_CANARIES.controlCookie),
  },
  'A7-T-DISCLOSURE-01': {
    reasonClass: 'UNIFORM_DENIAL',
    run: proveUniformDisclosure,
  },
  'A7-T-REDACTION-01': {
    reasonClass: 'REDACTION_FAIL_CLOSED',
    run: proveRedactionFailure,
  },
  'A7-T-EVIDENCE-01': {
    reasonClass: 'UNSAFE_EVIDENCE_REJECTED',
    run: (caseId: A7ThreatCase): number =>
      proveUnsafeEvidenceRejected(caseId, AICO007_CANARIES.credential),
  },
} satisfies Record<A7ThreatCase, CaseProver>;
