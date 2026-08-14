import { v5 as uuidv5 } from 'uuid';

import {
  ACCEPTED_DEPENDENCY_BUNDLE_DIGEST,
  ACCEPTED_TEMPLATE_ARCHIVE_DIGEST,
} from '../aico-004-spike/fixture';

import {
  GENERATED_RESPONSE_HEADERS,
  bodyDigest,
  canonicalDigest,
  canonicalRequestDigest,
  clone,
  normalizedManifestDigest,
  type A7ThreatCase,
  type AccessRequest,
  type BuildAuthority,
  type CausalMeta,
  type CleanupRequest,
  type CompanyAuthority,
  type Environment,
  type ExchangeRequest,
  type GrantIssueRequest,
  type GrantIssueResult,
  type ManifestEntry,
  type ObjectRecord,
  type PreviewAuthority,
  type PreviewProofState,
  type PublicationRequest,
  type ReconciliationRequest,
  type RedactionProfileBinding,
  type RevocationRequest,
  type Sha256,
  type ToolInvocationIntent,
} from './contracts';

export const AICO007_FIXTURE_NAMESPACE = '2374a138-c825-5af7-94d4-2c08fd38ae07';
export const AICO007_FIXTURE_TIME = '2026-08-14T04:00:00.000Z';
export const AICO007_EXPIRES_AT = '2026-08-14T04:30:00.000Z';
export const AICO007_REDACTION_PROFILE_VERSION = 'aico007-redaction/v1';
export const AICO007_POLICY_VERSION = 'aico007-preview-policy/v1';

const AICO007_CACHE_PROFILE = Object.freeze({
  browser: 'private, no-store, no-transform',
  cdn: 'no-store',
  surrogate: 'no-store',
  vary: 'none-authority-before-cache',
});

export const TEST_ED25519_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIDoRzhUlBXGGyMp/P19Grw/y3AEiCL2Jmey/ofCxE84g
-----END PRIVATE KEY-----`;

export const TEST_ED25519_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA1arAhxWyJe6v+lWPZJ5QkujVzSqdPSRYErDmvv79Ifg=
-----END PUBLIC KEY-----`;

export const AICO007_CANARIES = Object.freeze({
  controlCookie: 'AICO007_CONTROL_COOKIE_CANARY_932fb6',
  controlStorage: 'AICO007_CONTROL_STORAGE_CANARY_7c6d82',
  companyA: 'AICO007_COMPANY_A_CANARY_b40fd9',
  companyB: 'AICO007_COMPANY_B_CANARY_a391c2',
  capability: 'AICO007_CAPABILITY_CANARY_00fe17',
  credential: 'AICO007_CREDENTIAL_CANARY_1956dd',
  model: 'AICO007_MODEL_CANARY_502cab',
  prompt: 'AICO007_PROMPT_CANARY_c9eb30',
});

export function fixtureUuid(label: string): string {
  return uuidv5(`aico-007:${label}`, AICO007_FIXTURE_NAMESPACE);
}

export function fixtureDigest(label: string): Sha256 {
  return canonicalDigest({ contract: 'aico-007-proof-fixture/v1', label });
}

export class FrozenPreviewClock {
  private instant: string;

  public constructor(instant: string = AICO007_FIXTURE_TIME) {
    this.instant = normalizeInstant(instant);
  }

  public now(): string {
    return this.instant;
  }

  public set(instant: string): void {
    this.instant = normalizeInstant(instant);
  }

  public advance(milliseconds: number): string {
    if (!Number.isSafeInteger(milliseconds))
      throw new TypeError('milliseconds must be a safe integer');
    this.instant = new Date(Date.parse(this.instant) + milliseconds).toISOString();
    return this.instant;
  }
}

export interface PreviewFixtureCompany {
  label: 'A' | 'B';
  authority: CompanyAuthority;
  build: BuildAuthority;
  preview: PreviewAuthority;
}

export interface PreviewFixtureRequests {
  publication(
    company: PreviewFixtureCompany,
    caseId?: A7ThreatCase,
    overrides?: Partial<PublicationRequest>,
  ): PublicationRequest;
  grant(
    company: PreviewFixtureCompany,
    caseId?: A7ThreatCase,
    overrides?: Partial<GrantIssueRequest>,
  ): GrantIssueRequest;
  exchange(
    company: PreviewFixtureCompany,
    result: GrantIssueResult,
    caseId?: A7ThreatCase,
    overrides?: Partial<ExchangeRequest>,
  ): ExchangeRequest;
  access(
    company: PreviewFixtureCompany,
    sessionPresentation: string | null,
    caseId?: A7ThreatCase,
    overrides?: Partial<AccessRequest>,
  ): AccessRequest;
  revoke(
    company: PreviewFixtureCompany,
    caseId?: A7ThreatCase,
    overrides?: Partial<RevocationRequest>,
  ): RevocationRequest;
  cleanup(
    company: PreviewFixtureCompany,
    caseId?: A7ThreatCase,
    overrides?: Partial<CleanupRequest>,
  ): CleanupRequest;
  reconcile(
    original:
      | PublicationRequest
      | GrantIssueRequest
      | ExchangeRequest
      | RevocationRequest
      | CleanupRequest,
    target: ReconciliationRequest['target'],
    caseId?: A7ThreatCase,
    stateChanging?: boolean,
  ): ReconciliationRequest;
}

export interface PreviewProofFixture {
  clock: FrozenPreviewClock;
  state: PreviewProofState;
  companies: { a: PreviewFixtureCompany; b: PreviewFixtureCompany };
  rebuildA: PreviewAuthority;
  redactionProfile: RedactionProfileBinding;
  signing: {
    keyId: string;
    keyVersion: 1;
    privateKeyPem: string;
    publicKeyPem: string;
  };
  requests: PreviewFixtureRequests;
}

export function createPreviewProofFixture(label = 'canonical'): PreviewProofFixture {
  const clock = new FrozenPreviewClock();
  const redactionProfile: RedactionProfileBinding = {
    id: fixtureUuid(`${label}:redaction-profile`),
    version: AICO007_REDACTION_PROFILE_VERSION,
    digest: fixtureDigest(`${label}:redaction-profile:v1`),
  };
  const a = companyFixture(label, 'A', 'TEST', redactionProfile);
  const b = companyFixture(label, 'B', 'STAGING', redactionProfile);
  const rebuildA = previewAuthority(
    label,
    'A-rebuild',
    'TEST',
    a.authority.companyId,
    a.build,
    redactionProfile,
    2,
  );
  const sourceObjects = [
    ...sourceObjectEntries(a.build, 'A'),
    ...sourceObjectEntries(b.build, 'B'),
  ];
  const state: PreviewProofState = {
    companies: [
      [a.authority.companyId, clone(a.authority)],
      [b.authority.companyId, clone(b.authority)],
    ],
    builds: [
      [a.build.buildId, clone(a.build)],
      [b.build.buildId, clone(b.build)],
    ],
    previews: [
      [a.preview.previewId, clone(a.preview)],
      [b.preview.previewId, clone(b.preview)],
      [rebuildA.previewId, clone(rebuildA)],
    ],
    grants: [],
    sessions: [],
    objects: sourceObjects,
    cache: [],
    intents: [],
    operationReceipts: [],
    retiredHosts: [],
  };

  return {
    clock,
    state,
    companies: { a, b },
    rebuildA,
    redactionProfile,
    signing: {
      keyId: 'aico007-test-ed25519-key',
      keyVersion: 1,
      privateKeyPem: TEST_ED25519_PRIVATE_KEY_PEM,
      publicKeyPem: TEST_ED25519_PUBLIC_KEY_PEM,
    },
    requests: requestFactories(label),
  };
}

function companyFixture(
  fixtureLabel: string,
  companyLabel: 'A' | 'B',
  environment: Environment,
  redactionProfile: RedactionProfileBinding,
): PreviewFixtureCompany {
  const companyId = fixtureUuid(`${fixtureLabel}:company:${companyLabel}`);
  const authority: CompanyAuthority = {
    companyId,
    founderSubject: `fixture:${fixtureLabel}:founder:${companyLabel}`,
    status: 'ACTIVE',
    membershipVersion: 1,
  };
  const build = buildAuthority(fixtureLabel, companyLabel, companyId);
  return {
    label: companyLabel,
    authority,
    build,
    preview: previewAuthority(
      fixtureLabel,
      companyLabel,
      environment,
      companyId,
      build,
      redactionProfile,
      1,
    ),
  };
}

function buildAuthority(
  fixtureLabel: string,
  companyLabel: 'A' | 'B',
  companyId: string,
): BuildAuthority {
  const bodies = staticBodies(companyLabel);
  const entries: ManifestEntry[] = Object.entries(bodies).map(([path, body], index) => ({
    path,
    mediaType: mediaType(path),
    bytes: body.byteLength,
    contentSha256: bodyDigest(body),
    objectVersionId: fixtureUuid(`${fixtureLabel}:${companyLabel}:source-object:${index + 1}`),
  }));
  const outputManifestDigest = normalizedManifestDigest(entries);
  return {
    companyId,
    runId: fixtureUuid(`${fixtureLabel}:${companyLabel}:run`),
    taskId: fixtureUuid(`${fixtureLabel}:${companyLabel}:task`),
    attemptId: fixtureUuid(`${fixtureLabel}:${companyLabel}:attempt`),
    buildId: fixtureUuid(`${fixtureLabel}:${companyLabel}:build`),
    buildVersion: 1,
    buildResultReceiptId: fixtureUuid(`${fixtureLabel}:${companyLabel}:build-result-receipt`),
    buildResultReceiptVersion: 'aico.sandbox-execution-receipt/1.0',
    buildResultReceiptDigest: fixtureDigest(`${fixtureLabel}:${companyLabel}:build-result-receipt`),
    buildResult: 'SUCCEEDED',
    artifactId: fixtureUuid(`${fixtureLabel}:${companyLabel}:artifact`),
    artifactVersionId: fixtureUuid(`${fixtureLabel}:${companyLabel}:artifact-version:1`),
    artifactVersion: 1,
    artifactChecksum: fixtureDigest(`${fixtureLabel}:${companyLabel}:artifact:v1`),
    outputManifestId: fixtureUuid(`${fixtureLabel}:${companyLabel}:output-manifest`),
    outputManifestVersion: 'aico.sandbox-output-manifest/1.0',
    outputManifestDigest,
    aggregateDigest: canonicalDigest(entries.map((entry) => entry.contentSha256)),
    entryDocument: 'index.html',
    entries,
    canceled: false,
    quarantined: false,
    rowVersion: 1,
  };
}

function previewAuthority(
  fixtureLabel: string,
  previewLabel: string,
  environment: Environment,
  companyId: string,
  build: BuildAuthority,
  redactionProfile: RedactionProfileBinding,
  previewVersion: number,
): PreviewAuthority {
  const previewId = fixtureUuid(`${fixtureLabel}:${previewLabel}:preview`);
  const publicIdentity = canonicalDigest({ fixtureLabel, previewLabel }).slice(7, 39);
  const base: Omit<PreviewAuthority, 'bindingSha256'> = {
    companyId,
    previewId,
    previewVersion,
    publicPreviewId: `pp_${canonicalDigest({ previewId }).slice(7, 39)}`,
    publicIdentity,
    host: `${publicIdentity}.${environment.toLowerCase().replace('_', '-')}.proof.preview.test`,
    environment,
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
    state: 'PREPARED',
    availableFrom: AICO007_FIXTURE_TIME,
    expiresAt: AICO007_EXPIRES_AT,
    revocationEpoch: 1,
    policyVersion: AICO007_POLICY_VERSION,
    keyVersion: 1,
    headerProfileDigest: AICO007_FIXTURE_DIGESTS.headerProfileDigest,
    cacheProfileDigest: AICO007_FIXTURE_DIGESTS.cacheProfileDigest,
    redactionProfile,
    rowVersion: 1,
  };
  return { ...base, bindingSha256: previewBinding(base) };
}

function previewBinding(preview: Omit<PreviewAuthority, 'bindingSha256'>): Sha256 {
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

function sourceObjectEntries(
  build: BuildAuthority,
  companyLabel: 'A' | 'B',
): Array<readonly [string, ObjectRecord]> {
  const bodies = staticBodies(companyLabel);
  return build.entries.map((entry) => [
    sourceObjectKey(build.buildId, entry.path),
    {
      companyId: build.companyId,
      previewId: build.buildId,
      previewVersion: build.buildVersion,
      path: entry.path,
      mediaType: entry.mediaType,
      objectVersionId: entry.objectVersionId,
      contentSha256: entry.contentSha256,
      body: Buffer.from(bodies[entry.path] ?? Buffer.alloc(0)),
      state: 'AVAILABLE',
    },
  ]);
}

export function sourceObjectKey(buildId: string, path: string): string {
  return `source:${buildId}:${path}`;
}

export function previewObjectKey(previewId: string, previewVersion: number, path: string): string {
  return `preview:${previewId}:${previewVersion}:${path}`;
}

function staticBodies(companyLabel: 'A' | 'B'): Readonly<Record<string, Buffer>> {
  const name = companyLabel === 'A' ? 'Acme Alpha' : 'Beta Bakery';
  return Object.freeze({
    'index.html': Buffer.from(
      `<!doctype html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/app.js"></script></head><body><main><h1>${name}</h1><p>Prototype only - not a live production system.</p><div id="app"></div></main></body></html>`,
      'utf8',
    ),
    'assets/app.css': Buffer.from('body{font-family:system-ui;color:#111;background:#fff}', 'utf8'),
    'assets/app.js': Buffer.from(
      `document.querySelector('#app').textContent='${companyLabel} fixture ready';`,
      'utf8',
    ),
    'assets/data.json': Buffer.from(
      JSON.stringify({ company: companyLabel, kind: 'fixture' }),
      'utf8',
    ),
  });
}

function mediaType(path: string): string {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  throw new Error(`Unsupported fixture media type for ${path}`);
}

const canonicalCompanyABuild = buildAuthority('canonical', 'A', fixtureUuid('canonical:company:A'));

/** Stable cross-proof digest chain serialized by the AICO-007 proof manifest. */
export const AICO007_FIXTURE_DIGESTS = Object.freeze({
  templateArchiveDigest: ACCEPTED_TEMPLATE_ARCHIVE_DIGEST as Sha256,
  dependencyBundleDigest: ACCEPTED_DEPENDENCY_BUNDLE_DIGEST as Sha256,
  // AICO-004's accepted proof fixture does not assign a distinct source-snapshot digest.
  sourceSnapshotDigest: null,
  buildResultReceiptDigest: canonicalCompanyABuild.buildResultReceiptDigest,
  outputManifestDigest: canonicalCompanyABuild.outputManifestDigest,
  aggregateDigest: canonicalCompanyABuild.aggregateDigest,
  headerProfileDigest: canonicalDigest(GENERATED_RESPONSE_HEADERS),
  cacheProfileDigest: canonicalDigest(AICO007_CACHE_PROFILE),
  redactionProfileDigest: fixtureDigest('canonical:redaction-profile:v1'),
});

function requestFactories(fixtureLabel: string): PreviewFixtureRequests {
  const makeMeta = (label: string): CausalMeta => ({
    messageId: fixtureUuid(`${fixtureLabel}:${label}:message`),
    correlationId: fixtureUuid(`${fixtureLabel}:${label}:correlation`),
    causationId: fixtureUuid(`${fixtureLabel}:${label}:causation`),
    traceId: canonicalDigest({ fixtureLabel, label, kind: 'trace' }).slice(7, 39),
    spanId: canonicalDigest({ fixtureLabel, label, kind: 'span' }).slice(7, 23),
    parentSpanId: canonicalDigest({ fixtureLabel, label, kind: 'parent-span' }).slice(7, 23),
    operationAttemptId: fixtureUuid(`${fixtureLabel}:${label}:operation-attempt`),
  });
  const intent = (
    label: string,
    action: ToolInvocationIntent['action'],
    logicalInvocationKey: string,
    expiresAt: string,
  ): ToolInvocationIntent => ({
    id: fixtureUuid(`${fixtureLabel}:${label}:intent`),
    decisionId: fixtureUuid(`${fixtureLabel}:${label}:decision`),
    decisionDigest: fixtureDigest(`${fixtureLabel}:${label}:decision`),
    logicalInvocationKey,
    requestDigest: fixtureDigest('pending-request'),
    action,
    parametersDigest: fixtureDigest(`${fixtureLabel}:${label}:parameters`),
    resourceDigest: fixtureDigest(`${fixtureLabel}:${label}:resource`),
    maximumUses: 1,
    used: 0,
    expiresAt,
  });
  const finalize = <
    T extends { requestDigest: Sha256; toolInvocation?: ToolInvocationIntent | null },
  >(
    request: T,
  ): T => {
    const digest = canonicalRequestDigest(request as T & Record<string, unknown>);
    return {
      ...request,
      requestDigest: digest,
      ...(request.toolInvocation === undefined || request.toolInvocation === null
        ? {}
        : { toolInvocation: { ...request.toolInvocation, requestDigest: digest } }),
    };
  };
  return {
    publication(company, caseId = 'A7-T-POSITIVE-01', overrides = {}): PublicationRequest {
      const label = `${company.label}:publish:${caseId}`;
      const logicalIdempotencyKey = `aico007:${label}:logical-key`;
      return finalize({
        schemaVersion: 1,
        caseId,
        requestId: fixtureUuid(`${fixtureLabel}:${label}:request`),
        logicalIdempotencyKey,
        requestDigest: fixtureDigest('pending-request'),
        actorSubject: company.authority.founderSubject,
        build: clone(company.build),
        preview: clone(company.preview),
        toolInvocation: intent(
          label,
          'preview.publish/v1',
          logicalIdempotencyKey,
          AICO007_EXPIRES_AT,
        ),
        meta: makeMeta(label),
        ...overrides,
      });
    },
    grant(company, caseId = 'A7-T-POSITIVE-01', overrides = {}): GrantIssueRequest {
      const label = `${company.label}:grant:${caseId}`;
      const logicalIdempotencyKey = `aico007:${label}:logical-key`;
      return finalize({
        schemaVersion: 1,
        caseId,
        requestId: fixtureUuid(`${fixtureLabel}:${label}:request`),
        logicalIdempotencyKey,
        requestDigest: fixtureDigest('pending-request'),
        actorSubject: company.authority.founderSubject,
        previewId: company.preview.previewId,
        previewVersion: company.preview.previewVersion,
        publicGrantId: `pg_${canonicalDigest({ fixtureLabel, label }).slice(7, 39)}`,
        nonce: canonicalDigest({ fixtureLabel, label, kind: 'nonce' }).slice(7, 50),
        expiresAt: AICO007_EXPIRES_AT,
        toolInvocation: intent(
          label,
          'preview.grant.issue/v1',
          logicalIdempotencyKey,
          AICO007_EXPIRES_AT,
        ),
        meta: makeMeta(label),
        ...overrides,
      });
    },
    exchange(company, result, caseId = 'A7-T-POSITIVE-01', overrides = {}): ExchangeRequest {
      const label = `${company.label}:exchange:${caseId}`;
      return finalize({
        schemaVersion: 1,
        caseId,
        requestId: fixtureUuid(`${fixtureLabel}:${label}:request`),
        logicalIdempotencyKey: `aico007:${label}:logical-key`,
        requestDigest: fixtureDigest('pending-request'),
        host: company.preview.host,
        environment: company.preview.environment,
        origin: `https://${company.preview.host}`,
        contentType: 'application/octet-stream',
        fetchSite: 'same-origin',
        capability: result.grant?.compact ?? 'invalid-capability',
        meta: makeMeta(label),
        ...overrides,
      });
    },
    access(
      company,
      sessionPresentation,
      caseId = 'A7-T-POSITIVE-01',
      overrides = {},
    ): AccessRequest {
      const label = `${company.label}:access:${caseId}:${overrides.method ?? 'GET'}:${overrides.path ?? '/'}`;
      const request = {
        schemaVersion: 1 as const,
        caseId,
        requestId: fixtureUuid(`${fixtureLabel}:${label}:request`),
        requestDigest: fixtureDigest('pending-request'),
        host: company.preview.host,
        environment: company.preview.environment,
        method: 'GET' as const,
        path: '/',
        navigation: true,
        cookiePresentation: sessionPresentation,
        range: null,
        ifNoneMatch: null,
        meta: makeMeta(label),
        ...overrides,
      };
      return { ...request, requestDigest: canonicalRequestDigest(request) };
    },
    revoke(company, caseId = 'A7-T-REVOCATION-01', overrides = {}): RevocationRequest {
      const label = `${company.label}:revoke:${caseId}`;
      const logicalIdempotencyKey = `aico007:${label}:logical-key`;
      return finalize({
        schemaVersion: 1,
        caseId,
        requestId: fixtureUuid(`${fixtureLabel}:${label}:request`),
        logicalIdempotencyKey,
        requestDigest: fixtureDigest('pending-request'),
        actorSubject: company.authority.founderSubject,
        previewId: company.preview.previewId,
        previewVersion: company.preview.previewVersion,
        expectedEpoch: company.preview.revocationEpoch,
        reason: 'FOUNDER_REVOKED',
        toolInvocation: intent(
          label,
          'preview.revoke/v1',
          logicalIdempotencyKey,
          AICO007_EXPIRES_AT,
        ),
        meta: makeMeta(label),
        ...overrides,
      });
    },
    cleanup(company, caseId = 'A7-T-CLEANUP-01', overrides = {}): CleanupRequest {
      const label = `${company.label}:cleanup:${caseId}`;
      const logicalIdempotencyKey = `aico007:${label}:logical-key`;
      return finalize({
        schemaVersion: 1,
        caseId,
        requestId: fixtureUuid(`${fixtureLabel}:${label}:request`),
        logicalIdempotencyKey,
        requestDigest: fixtureDigest('pending-request'),
        actorSubject: company.authority.founderSubject,
        previewId: company.preview.previewId,
        previewVersion: company.preview.previewVersion,
        expectedEpoch: company.preview.revocationEpoch + 1,
        toolInvocation: intent(
          label,
          'preview.cleanup/v1',
          logicalIdempotencyKey,
          AICO007_EXPIRES_AT,
        ),
        meta: makeMeta(label),
        ...overrides,
      });
    },
    reconcile(
      original,
      target,
      caseId = 'A7-T-UNKNOWN-OUTCOME-01',
      stateChanging = false,
    ): ReconciliationRequest {
      const originalKeyDigest = canonicalDigest(original.logicalIdempotencyKey).slice(7, 19);
      const label = `reconcile:${target}:${caseId}:${stateChanging ? 'effect' : 'inspect'}:${originalKeyDigest}`;
      const logicalIdempotencyKey = `aico007:${label}:logical-key`;
      return finalize({
        schemaVersion: 1,
        caseId,
        requestId: fixtureUuid(`${fixtureLabel}:${label}:request`),
        logicalIdempotencyKey,
        requestDigest: fixtureDigest('pending-request'),
        target,
        originalLogicalKey: original.logicalIdempotencyKey,
        originalRequestDigest: original.requestDigest,
        stateChanging,
        toolInvocation: intent(
          label,
          'preview.reconcile/v1',
          logicalIdempotencyKey,
          AICO007_EXPIRES_AT,
        ),
        meta: makeMeta(label),
      });
    },
  };
}

function normalizeInstant(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new TypeError(`Invalid instant: ${value}`);
  return new Date(milliseconds).toISOString();
}
