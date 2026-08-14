import { createHash } from 'node:crypto';
import {
  createServer,
  request as sendHttpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import { defaultProofControls, type ProofControls } from './contracts';
import {
  HOSTILE_STATIC_FIXTURE,
  type HostileBrowserProbeId,
  type HostileFixtureAsset,
  type HostileStaticFixture,
} from './hostile-static-fixture';

export const AICO007_GENERATED_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
  "font-src 'self'; media-src 'self'; connect-src 'none'; object-src 'none'; " +
  "frame-src 'none'; child-src 'none'; worker-src 'none'; manifest-src 'none'; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none'; " +
  'sandbox allow-scripts allow-same-origin';

export const AICO007_BOOTSTRAP_SCRIPT = `(() => {
  const c = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  fetch('/__aico/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: c,
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'manual',
  }).finally(() => location.replace('/'));
})();`;

export const AICO007_BOOTSTRAP_SCRIPT_SHA256 = createHash('sha256')
  .update(AICO007_BOOTSTRAP_SCRIPT, 'utf8')
  .digest('base64');
export const AICO007_FROZEN_BOOTSTRAP_SCRIPT_SHA256 =
  '0K99yYE6jYGRdI008pEtqIua6cTps5n1zRKB0UzSqJA=';

if (
  Buffer.byteLength(AICO007_BOOTSTRAP_SCRIPT, 'utf8') !== 349 ||
  AICO007_BOOTSTRAP_SCRIPT_SHA256 !== AICO007_FROZEN_BOOTSTRAP_SCRIPT_SHA256
) {
  throw new Error('Frozen AICO-007 bootstrap script/hash mismatch.');
}

export const AICO007_BOOTSTRAP_CSP =
  `default-src 'none'; script-src 'sha256-${AICO007_BOOTSTRAP_SCRIPT_SHA256}'; ` +
  "style-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; " +
  "connect-src 'self'; object-src 'none'; frame-src 'none'; child-src 'none'; " +
  "worker-src 'none'; manifest-src 'none'; base-uri 'none'; form-action 'none'; " +
  "frame-ancestors 'none'; sandbox allow-scripts allow-same-origin";

export const AICO007_SECURITY_HEADERS = Object.freeze({
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Origin-Agent-Cluster': '?1',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Permissions-Policy':
    'accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), ' +
    'clipboard-read=(), clipboard-write=(), display-capture=(), encrypted-media=(), ' +
    'fullscreen=(), geolocation=(), gyroscope=(), hid=(), magnetometer=(), ' +
    'microphone=(), midi=(), payment=(), picture-in-picture=(), ' +
    'publickey-credentials-create=(), publickey-credentials-get=(), ' +
    'screen-wake-lock=(), serial=(), storage-access=(), usb=(), web-share=(), ' +
    'xr-spatial-tracking=()',
} as const);

export const AICO007_CACHE_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store, no-transform',
  Pragma: 'no-cache',
  Expires: '0',
  'CDN-Cache-Control': 'no-store',
  'Surrogate-Control': 'no-store',
} as const);

export const AICO007_UNAVAILABLE_BODY = Buffer.alloc(0);
export const AICO007_MAX_COOKIE_HEADER_BYTES = 2_048;
export const AICO007_MAX_REQUEST_BODY_BYTES = 4_096;
export const AICO007_MAX_REQUEST_TARGET_BYTES = 2_048;
export const AICO007_EXCHANGE_CONTENT_TYPE = 'application/octet-stream';

const CLEAR_SITE_DATA = '"cache", "cookies", "storage"';
const LOOPBACK_ADDRESS = '127.0.0.1';
const AUTH_COOKIE_NAME = '__Host-aico_preview';
const BOOTSTRAP_PATH = '/__aico/bootstrap';
const EXCHANGE_PATH = '/__aico/exchange';
const BOOTSTRAP_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Opening preview</title></head>
<body><p>Opening preview...</p><script>${AICO007_BOOTSTRAP_SCRIPT}</script></body>
</html>
`;

const ALLOWED_MEDIA_TYPES = new Set<HostileFixtureAsset['mediaType']>([
  'application/javascript',
  'application/json',
  'image/svg+xml',
  'text/css',
  'text/html',
]);

type MaybePromise<T> = T | Promise<T>;
type HeaderInputValue = string | readonly string[] | undefined;
type HeaderInput = Readonly<Record<string, HeaderInputValue>>;
type ResponseHeaders = Readonly<Record<string, string>>;
type PolicyProfile = 'BOOTSTRAP_V1' | 'GENERATED_V1';
type DecisionClass = 'ALLOW' | 'DENY';

export interface BrowserHttpRequest {
  readonly method: string;
  readonly target: string;
  readonly headers?: HeaderInput;
  readonly body?: Buffer | Uint8Array | string;
}

export interface BrowserHttpResponse {
  readonly status: number;
  readonly headers: ResponseHeaders;
  readonly body: Buffer;
}

export interface BrowserAuthorizationInput {
  readonly method: 'GET' | 'HEAD';
  readonly canonicalHost: string;
  readonly canonicalOrigin: string;
  readonly normalizedPath: string;
  readonly sessionPresentation: string;
  readonly fetchSite: string | null;
  readonly fetchMode: string | null;
  readonly fetchDestination: string | null;
}

export type BrowserAuthorizationDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; reasonClass: string }>;

export interface BrowserExchangeInput {
  readonly canonicalHost: string;
  readonly canonicalOrigin: string;
  readonly capability: string;
  readonly fetchSite: string | null;
  readonly fetchMode: string | null;
  readonly fetchDestination: string | null;
}

export type BrowserExchangeDecision =
  | Readonly<{
      allowed: true;
      sessionPresentation: string;
      maxAgeSeconds?: number;
      redirectPath?: '/';
    }>
  | Readonly<{ allowed: false; reasonClass: string }>;

export interface BrowserHttpAdapterOptions {
  readonly canonicalHost: string;
  readonly canonicalOrigin?: string;
  readonly fixture?: HostileStaticFixture;
  readonly controls?: ProofControls;
  readonly authorize?: (
    input: BrowserAuthorizationInput,
  ) => MaybePromise<BrowserAuthorizationDecision>;
  readonly exchange?: (input: BrowserExchangeInput) => MaybePromise<BrowserExchangeDecision>;
}

export interface BrowserHttpEvidenceEntry {
  readonly sequence: number;
  readonly requestClass:
    | 'BOOTSTRAP'
    | 'EXCHANGE'
    | 'FIXTURE'
    | 'INVALID'
    | 'RESERVED'
    | 'UNKNOWN'
    | 'WORKER_CONTROL';
  readonly methodClass: 'GET' | 'HEAD' | 'OPTIONS' | 'POST' | 'OTHER';
  readonly pathClass:
    | 'BOOTSTRAP'
    | 'DOCUMENT'
    | 'EXCHANGE'
    | 'FIXTURE_ASSET'
    | 'INVALID'
    | 'OTHER'
    | 'RESERVED_PLATFORM'
    | 'WORKER_CONTROL';
  readonly hostClass: 'EXACT' | 'MALFORMED' | 'MISMATCH' | 'MISSING';
  readonly originClass: 'ABSENT' | 'EXACT' | 'MALFORMED' | 'MISMATCH';
  readonly fetchSiteClass: 'ABSENT' | 'CROSS_SITE' | 'NONE' | 'SAME_ORIGIN' | 'SAME_SITE' | 'OTHER';
  readonly decision: DecisionClass;
  readonly reasonClass: string;
  readonly status: number;
  readonly policyProfile: PolicyProfile;
  readonly policyHeaderDigest: `sha256:${string}`;
  readonly authorizationCalls: number;
  readonly exchangeCalls: number;
  readonly objectReads: number;
  readonly generatedBytes: number;
  readonly privateControlEffects: 0;
}

export interface BrowserHttpEvidenceSnapshot {
  readonly schemaVersion: 1;
  readonly entries: readonly BrowserHttpEvidenceEntry[];
  readonly totals: Readonly<{
    requests: number;
    allowed: number;
    denied: number;
    authorizationCalls: number;
    exchangeCalls: number;
    objectReads: number;
    generatedBytes: number;
    privateControlEffects: 0;
  }>;
}

export interface BrowserBoundaryProbeResult {
  readonly probeId: HostileBrowserProbeId;
  readonly caseIds: readonly string[];
  readonly passed: boolean;
  readonly evidenceSequences: readonly number[];
  readonly observations: Readonly<Record<string, boolean | number | string>>;
}

export interface LoopbackBrowserHttpServer {
  readonly address: typeof LOOPBACK_ADDRESS;
  readonly port: number;
  readonly origin: string;
  readonly canonicalHost: string;
  request(input: BrowserHttpRequest): Promise<BrowserHttpResponse>;
  close(): Promise<void>;
}

interface NormalizedRequest {
  readonly method: string;
  readonly target: TargetClassification;
  readonly headers: Readonly<Record<string, readonly string[]>>;
  readonly body: Buffer;
}

interface TargetClassification {
  readonly valid: boolean;
  readonly normalizedPath: string | null;
  readonly pathClass: BrowserHttpEvidenceEntry['pathClass'];
  readonly requestClass: BrowserHttpEvidenceEntry['requestClass'];
  readonly relaxedUnsafe?: boolean;
}

interface DispatchResult {
  readonly response: BrowserHttpResponse;
  readonly decision: DecisionClass;
  readonly reasonClass: string;
  readonly policyProfile: PolicyProfile;
  readonly generatedBytes: number;
}

interface MutableTotals {
  requests: number;
  allowed: number;
  denied: number;
  authorizationCalls: number;
  exchangeCalls: number;
  objectReads: number;
  generatedBytes: number;
}

export class DeterministicBrowserHttpAdapter {
  readonly canonicalHost: string;
  readonly canonicalOrigin: string;
  readonly fixture: HostileStaticFixture;
  readonly controls: Readonly<ProofControls>;

  private readonly authorizeCallback?: BrowserHttpAdapterOptions['authorize'];
  private readonly exchangeCallback?: BrowserHttpAdapterOptions['exchange'];
  private readonly evidence: BrowserHttpEvidenceEntry[] = [];
  private readonly totals: MutableTotals = this.emptyTotals();

  constructor(options: BrowserHttpAdapterOptions) {
    this.canonicalHost = validateCanonicalHost(options.canonicalHost);
    this.canonicalOrigin = validateCanonicalOrigin(
      options.canonicalOrigin ?? `https://${this.canonicalHost}`,
      this.canonicalHost,
    );
    this.fixture = options.fixture ?? HOSTILE_STATIC_FIXTURE;
    this.controls = Object.freeze({ ...(options.controls ?? defaultProofControls()) });
    this.authorizeCallback = options.authorize;
    this.exchangeCallback = options.exchange;
    validateFixture(this.fixture);
  }

  async handle(input: BrowserHttpRequest): Promise<BrowserHttpResponse> {
    const request = normalizeRequest(
      input,
      this.fixture,
      this.controls.methodPathAndReferrerSafety,
    );
    const before = { ...this.totals };
    let result: DispatchResult;

    try {
      result = await this.dispatch(request);
    } catch {
      result = this.unavailable('ADAPTER_FAILURE');
    }

    this.totals.requests += 1;
    this.totals[result.decision === 'ALLOW' ? 'allowed' : 'denied'] += 1;
    this.totals.generatedBytes += result.generatedBytes;

    const entry: BrowserHttpEvidenceEntry = Object.freeze({
      sequence: this.evidence.length + 1,
      requestClass: request.target.requestClass,
      methodClass: methodClass(request.method),
      pathClass: request.target.pathClass,
      hostClass: classifyHost(request.headers.host, this.canonicalHost),
      originClass: classifyOrigin(request.headers.origin, this.canonicalOrigin),
      fetchSiteClass: classifyFetchSite(firstHeader(request.headers, 'sec-fetch-site')),
      decision: result.decision,
      reasonClass: safeReasonClass(result.reasonClass),
      status: result.response.status,
      policyProfile: result.policyProfile,
      policyHeaderDigest: policyHeaderDigest(
        result.response.headers,
        result.policyProfile,
        this.controls,
      ),
      authorizationCalls: this.totals.authorizationCalls - before.authorizationCalls,
      exchangeCalls: this.totals.exchangeCalls - before.exchangeCalls,
      objectReads: this.totals.objectReads - before.objectReads,
      generatedBytes: result.generatedBytes,
      privateControlEffects: 0,
    });
    this.evidence.push(entry);

    return cloneResponse(result.response);
  }

  snapshotEvidence(): BrowserHttpEvidenceSnapshot {
    return Object.freeze({
      schemaVersion: 1,
      entries: Object.freeze(this.evidence.map((entry) => Object.freeze({ ...entry }))),
      totals: Object.freeze({ ...this.totals, privateControlEffects: 0 as const }),
    });
  }

  resetEvidence(): void {
    this.evidence.length = 0;
    Object.assign(this.totals, this.emptyTotals());
  }

  private emptyTotals(): MutableTotals {
    return {
      requests: 0,
      allowed: 0,
      denied: 0,
      authorizationCalls: 0,
      exchangeCalls: 0,
      objectReads: 0,
      generatedBytes: 0,
    };
  }

  private async dispatch(request: NormalizedRequest): Promise<DispatchResult> {
    if (
      this.controls.originAndHostIsolation &&
      classifyHost(request.headers.host, this.canonicalHost) !== 'EXACT'
    ) {
      return this.unavailable('HOST_DENIED');
    }
    if (!request.target.valid || request.target.normalizedPath === null) {
      return this.unavailable('PATH_DENIED');
    }

    const path = request.target.normalizedPath;
    if (request.target.relaxedUnsafe === true && !this.controls.methodPathAndReferrerSafety) {
      return this.weakenedUnsafeRequest(request, path);
    }
    if (path === BOOTSTRAP_PATH) return this.bootstrap(request);
    if (path === EXCHANGE_PATH) return this.exchange(request);
    if (
      request.target.requestClass === 'RESERVED' ||
      request.target.requestClass === 'WORKER_CONTROL'
    ) {
      if (
        request.target.requestClass === 'WORKER_CONTROL' &&
        !this.controls.storageAndWorkerIsolation
      ) {
        return this.weakenedWorkerContent(request);
      }
      if (request.target.requestClass === 'RESERVED' && !this.controls.exactCspAndTargetDenial) {
        return this.weakenedReservedRoute();
      }
      return this.unavailable('RESERVED_ROUTE');
    }
    return this.content(request, path);
  }

  private bootstrap(request: NormalizedRequest): DispatchResult {
    const deny = (reasonClass: string): DispatchResult =>
      this.unavailable(reasonClass, 'BOOTSTRAP_V1');
    if (
      this.controls.methodPathAndReferrerSafety &&
      request.method !== 'GET' &&
      request.method !== 'HEAD'
    ) {
      return deny('METHOD_DENIED');
    }
    if (
      this.controls.methodPathAndReferrerSafety &&
      (hasHeader(request.headers, 'range') || hasConditionalHeader(request.headers))
    ) {
      return deny('REPRESENTATION_DENIED');
    }

    const body = Buffer.from(BOOTSTRAP_HTML, 'utf8');
    return {
      response: response(
        200,
        'BOOTSTRAP_V1',
        'text/html',
        body,
        request.method === 'HEAD',
        this.controls,
      ),
      decision: 'ALLOW',
      reasonClass: 'BOOTSTRAP_FIXED',
      policyProfile: 'BOOTSTRAP_V1',
      generatedBytes: 0,
    };
  }

  private async exchange(request: NormalizedRequest): Promise<DispatchResult> {
    const deny = (reasonClass: string): DispatchResult =>
      this.unavailable(reasonClass, 'BOOTSTRAP_V1');
    if (request.method !== 'POST') return deny('METHOD_DENIED');
    if (
      this.controls.originAndHostIsolation &&
      classifyOrigin(request.headers.origin, this.canonicalOrigin) !== 'EXACT'
    ) {
      return deny('ORIGIN_DENIED');
    }
    if (
      this.controls.originAndHostIsolation &&
      firstHeader(request.headers, 'sec-fetch-site') !== 'same-origin'
    ) {
      return deny('FETCH_METADATA_DENIED');
    }
    if (firstHeader(request.headers, 'content-type') !== AICO007_EXCHANGE_CONTENT_TYPE) {
      return deny('CONTENT_TYPE_DENIED');
    }
    if (request.body.byteLength === 0 || request.body.byteLength > AICO007_MAX_REQUEST_BODY_BYTES) {
      return deny('BODY_DENIED');
    }
    const cookie = parsePresentationCookie(request.headers.cookie, this.controls.cookieIsolation);
    if (!cookie.valid) return deny(cookie.reasonClass);
    if (this.exchangeCallback === undefined) return deny('EXCHANGE_UNAVAILABLE');

    this.totals.exchangeCalls += 1;
    let decision: BrowserExchangeDecision;
    try {
      decision = await this.exchangeCallback({
        canonicalHost: this.canonicalHost,
        canonicalOrigin: this.canonicalOrigin,
        capability: request.body.toString('utf8'),
        fetchSite: firstHeader(request.headers, 'sec-fetch-site'),
        fetchMode: firstHeader(request.headers, 'sec-fetch-mode'),
        fetchDestination: firstHeader(request.headers, 'sec-fetch-dest'),
      });
    } catch {
      return deny('EXCHANGE_UNAVAILABLE');
    }
    if (!decision.allowed) return deny(decision.reasonClass);
    if (!safePresentation(decision.sessionPresentation)) {
      return deny('SESSION_PRESENTATION_DENIED');
    }
    const maxAge = decision.maxAgeSeconds ?? 60;
    if (!Number.isSafeInteger(maxAge) || maxAge < 1 || maxAge > 86_400) {
      return deny('SESSION_LIFETIME_DENIED');
    }
    if (decision.redirectPath !== undefined && decision.redirectPath !== '/') {
      return deny('REDIRECT_PATH_DENIED');
    }

    const headers = {
      ...policyHeaders('BOOTSTRAP_V1', this.controls),
      'Content-Length': '0',
      Location: '/',
      'Set-Cookie': this.controls.cookieIsolation
        ? `${AUTH_COOKIE_NAME}=${decision.sessionPresentation}; Secure; HttpOnly; ` +
          `SameSite=Strict; Path=/; Max-Age=${maxAge}`
        : `${AUTH_COOKIE_NAME}=${decision.sessionPresentation}; Domain=.preview.test; ` +
          `SameSite=None; Path=/; Max-Age=${maxAge}`,
    };
    return {
      response: Object.freeze({
        status: 303,
        headers: Object.freeze(headers),
        body: Buffer.alloc(0),
      }),
      decision: 'ALLOW',
      reasonClass: 'EXCHANGE_ALLOWED',
      policyProfile: 'BOOTSTRAP_V1',
      generatedBytes: 0,
    };
  }

  private async content(request: NormalizedRequest, path: string): Promise<DispatchResult> {
    if (
      !this.controls.methodPathAndReferrerSafety &&
      (request.method !== 'GET' ||
        hasHeader(request.headers, 'range') ||
        hasConditionalHeader(request.headers))
    ) {
      return this.weakenedUnsafeRequest(request, path);
    }
    if (
      this.controls.methodPathAndReferrerSafety &&
      request.method !== 'GET' &&
      request.method !== 'HEAD'
    ) {
      return this.unavailable('METHOD_DENIED');
    }
    if (
      this.controls.methodPathAndReferrerSafety &&
      (hasHeader(request.headers, 'range') || hasConditionalHeader(request.headers))
    ) {
      return this.unavailable('REPRESENTATION_DENIED');
    }
    const originClass = classifyOrigin(request.headers.origin, this.canonicalOrigin);
    if (
      this.controls.originAndHostIsolation &&
      (originClass === 'MALFORMED' || originClass === 'MISMATCH')
    ) {
      return this.unavailable('ORIGIN_DENIED');
    }
    const fetchSite = firstHeader(request.headers, 'sec-fetch-site');
    if (
      this.controls.originAndHostIsolation &&
      (fetchSite === 'cross-site' || fetchSite === 'same-site')
    ) {
      return this.unavailable('FETCH_METADATA_DENIED');
    }

    const cookie = parsePresentationCookie(request.headers.cookie, this.controls.cookieIsolation);
    if (!cookie.valid || cookie.presentation === null) {
      return this.unavailable(cookie.reasonClass);
    }
    let decision: BrowserAuthorizationDecision;
    if (!this.controls.cookieIsolation) {
      decision = { allowed: true };
    } else {
      if (this.authorizeCallback === undefined) return this.unavailable('AUTHORITY_UNAVAILABLE');
      this.totals.authorizationCalls += 1;
      try {
        decision = await this.authorizeCallback({
          method: request.method === 'HEAD' ? 'HEAD' : 'GET',
          canonicalHost: this.canonicalHost,
          canonicalOrigin: this.canonicalOrigin,
          normalizedPath: path,
          sessionPresentation: cookie.presentation,
          fetchSite,
          fetchMode: firstHeader(request.headers, 'sec-fetch-mode'),
          fetchDestination: firstHeader(request.headers, 'sec-fetch-dest'),
        });
      } catch {
        return this.unavailable('AUTHORITY_UNAVAILABLE');
      }
    }
    if (!decision.allowed) return this.unavailable(decision.reasonClass);

    this.totals.objectReads += 1;
    const asset = this.fixture.assets[path];
    if (asset === undefined) return this.unavailable('OBJECT_UNAVAILABLE');
    if (
      this.controls.scriptAndMimeIntegrity &&
      (!ALLOWED_MEDIA_TYPES.has(asset.mediaType) || digest(asset.body) !== asset.sha256)
    ) {
      return this.unavailable('INTEGRITY_DENIED');
    }

    const body = Buffer.from(asset.body);
    return {
      response: response(
        200,
        'GENERATED_V1',
        asset.mediaType,
        body,
        request.method === 'HEAD',
        this.controls,
      ),
      decision: 'ALLOW',
      reasonClass: 'CONTENT_ALLOWED',
      policyProfile: 'GENERATED_V1',
      generatedBytes: request.method === 'HEAD' ? 0 : body.byteLength,
    };
  }

  private unavailable(
    reasonClass: string,
    policyProfile: PolicyProfile = 'GENERATED_V1',
  ): DispatchResult {
    const body = Buffer.from(AICO007_UNAVAILABLE_BODY);
    return {
      response: Object.freeze({
        status: 404,
        headers: Object.freeze({
          ...policyHeaders(policyProfile, this.controls),
          'Content-Length': '0',
          'Clear-Site-Data': CLEAR_SITE_DATA,
        }),
        body,
      }),
      decision: 'DENY',
      reasonClass,
      policyProfile,
      generatedBytes: 0,
    };
  }

  private weakenedWorkerContent(request: NormalizedRequest): DispatchResult {
    const body = Buffer.from("self.addEventListener('fetch', () => undefined);\n", 'utf8');
    return {
      response: response(
        200,
        'GENERATED_V1',
        'application/javascript',
        body,
        request.method === 'HEAD',
        this.controls,
      ),
      decision: 'ALLOW',
      reasonClass: 'WEAK_WORKER_ROUTE',
      policyProfile: 'GENERATED_V1',
      generatedBytes: request.method === 'HEAD' ? 0 : body.byteLength,
    };
  }

  private weakenedReservedRoute(): DispatchResult {
    return {
      response: Object.freeze({
        status: 204,
        headers: Object.freeze({
          ...policyHeaders('GENERATED_V1', this.controls),
          'Content-Length': '0',
        }),
        body: Buffer.alloc(0),
      }),
      decision: 'ALLOW',
      reasonClass: 'WEAK_RESERVED_ROUTE',
      policyProfile: 'GENERATED_V1',
      generatedBytes: 0,
    };
  }

  private weakenedUnsafeRequest(request: NormalizedRequest, path: string): DispatchResult {
    const asset = this.fixture.assets[path] ?? this.fixture.assets['/'];
    if (asset === undefined) return this.unavailable('OBJECT_UNAVAILABLE');
    const body = Buffer.from(asset.body);
    this.totals.objectReads += 1;
    return {
      response: response(
        200,
        'GENERATED_V1',
        asset.mediaType,
        body,
        request.method === 'HEAD',
        this.controls,
      ),
      decision: 'ALLOW',
      reasonClass: 'WEAK_METHOD_PATH',
      policyProfile: 'GENERATED_V1',
      generatedBytes: request.method === 'HEAD' ? 0 : body.byteLength,
    };
  }
}

export function createBrowserHttpAdapter(
  options: BrowserHttpAdapterOptions,
): DeterministicBrowserHttpAdapter {
  return new DeterministicBrowserHttpAdapter(options);
}

export async function startLoopbackBrowserHttpServer(
  adapter: DeterministicBrowserHttpAdapter,
): Promise<LoopbackBrowserHttpServer> {
  const server = createServer(
    { maxHeaderSize: 8_192, requireHostHeader: true },
    (request, responseStream) => void serveLoopbackRequest(adapter, request, responseStream),
  );
  server.headersTimeout = 5_000;
  server.requestTimeout = 5_000;
  server.keepAliveTimeout = 1_000;

  await listenLoopback(server);
  const address = server.address();
  if (address === null || typeof address === 'string') {
    await closeServer(server);
    throw new Error('Loopback server did not expose an IP address.');
  }
  const port = address.port;
  const origin = `http://${LOOPBACK_ADDRESS}:${port}`;

  return Object.freeze({
    address: LOOPBACK_ADDRESS,
    port,
    origin,
    canonicalHost: adapter.canonicalHost,
    request: (input: BrowserHttpRequest) => requestLoopback(port, adapter.canonicalHost, input),
    close: () => closeServer(server),
  });
}

export async function runBrowserHttpBoundaryProbes(
  adapter: DeterministicBrowserHttpAdapter,
): Promise<readonly BrowserBoundaryProbeResult[]> {
  const startSequence = adapter.snapshotEvidence().entries.length;
  const baseHeaders = { Host: adapter.canonicalHost };
  const bootstrap = await adapter.handle({
    method: 'GET',
    target: BOOTSTRAP_PATH,
    headers: { ...baseHeaders, 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Dest': 'document' },
  });
  const unavailable = await adapter.handle({
    method: 'GET',
    target: '/index.html',
    headers: baseHeaders,
  });
  const traversal = await adapter.handle({
    method: 'GET',
    target: '/assets/%2e%2e/__aico/private-control-probe',
    headers: { ...baseHeaders, Cookie: `${AUTH_COOKIE_NAME}=fixture-presentation` },
  });
  const duplicateCookie = await adapter.handle({
    method: 'GET',
    target: '/index.html',
    headers: {
      ...baseHeaders,
      Cookie: `${AUTH_COOKIE_NAME}=first; ${AUTH_COOKIE_NAME}=second`,
    },
  });
  const oversizedCookie = await adapter.handle({
    method: 'GET',
    target: '/index.html',
    headers: {
      ...baseHeaders,
      Cookie: `${AUTH_COOKIE_NAME}=${'x'.repeat(AICO007_MAX_COOKIE_HEADER_BYTES + 1)}`,
    },
  });
  const worker = await adapter.handle({
    method: 'GET',
    target: '/sw.js',
    headers: { ...baseHeaders, Cookie: `${AUTH_COOKIE_NAME}=fixture-presentation` },
  });
  const privateControl = await adapter.handle({
    method: 'POST',
    target: '/__aico/private-control-probe',
    headers: {
      ...baseHeaders,
      Origin: adapter.canonicalOrigin,
      'Sec-Fetch-Site': 'same-origin',
      Cookie: `${AUTH_COOKIE_NAME}=fixture-presentation`,
    },
  });
  const range = await adapter.handle({
    method: 'GET',
    target: '/index.html',
    headers: {
      ...baseHeaders,
      Cookie: `${AUTH_COOKIE_NAME}=fixture-presentation`,
      Range: 'bytes=0-7',
    },
  });
  const unsafeMethod = await adapter.handle({
    method: 'OPTIONS',
    target: '/index.html',
    headers: {
      ...baseHeaders,
      Cookie: `${AUTH_COOKIE_NAME}=fixture-presentation`,
    },
  });
  const conditional = await adapter.handle({
    method: 'GET',
    target: '/index.html',
    headers: {
      ...baseHeaders,
      Cookie: `${AUTH_COOKIE_NAME}=fixture-presentation`,
      'If-None-Match': '"attacker-controlled-validator"',
    },
  });
  const wrongHost = await adapter.handle({
    method: 'GET',
    target: BOOTSTRAP_PATH,
    headers: { Host: 'attacker.invalid', 'Sec-Fetch-Site': 'cross-site' },
  });
  const wrongOrigin = await adapter.handle({
    method: 'POST',
    target: EXCHANGE_PATH,
    headers: {
      ...baseHeaders,
      Origin: 'https://attacker.invalid',
      'Sec-Fetch-Site': 'cross-site',
      'Content-Type': AICO007_EXCHANGE_CONTENT_TYPE,
    },
    body: 'wrong-origin-capability',
  });
  const snapshot = adapter.snapshotEvidence();
  const newEntries = snapshot.entries.slice(startSequence);
  const sequences = (...indexes: number[]): readonly number[] =>
    Object.freeze(indexes.map((index) => newEntries[index]?.sequence ?? -1));
  const generatedCsp = unavailable.headers['Content-Security-Policy'];
  const fixtureHtml = adapter.fixture.assets['/index.html']?.body.toString('utf8') ?? '';
  const commonExact = exactHeaderSubset(unavailable.headers, AICO007_SECURITY_HEADERS);
  const cacheExact = exactHeaderSubset(unavailable.headers, AICO007_CACHE_HEADERS);
  const noForbiddenResponseHeaders = [
    'Access-Control-Allow-Credentials',
    'Access-Control-Allow-Origin',
    'Content-Disposition',
    'ETag',
    'Location',
    'Server',
    'SourceMap',
    'Timing-Allow-Origin',
    'Vary',
    'X-Powered-By',
    'X-SourceMap',
  ].every((name) => unavailable.headers[name] === undefined);
  const generatedSandbox = parseDirective(generatedCsp, 'sandbox');

  const results: BrowserBoundaryProbeResult[] = [
    probe(
      'ORIGIN_HOST',
      ['A7-T-ORIGIN-SITE-01', 'A7-T-HOST-TLS-01'],
      wrongHost.status === 404 &&
        wrongOrigin.status === 404 &&
        (newEntries[10]?.exchangeCalls ?? -1) === 0 &&
        (newEntries[11]?.exchangeCalls ?? -1) === 0,
      sequences(10, 11),
      {
        hstsExact:
          unavailable.headers['Strict-Transport-Security'] ===
          AICO007_SECURITY_HEADERS['Strict-Transport-Security'],
        wrongHostDenied: wrongHost.status === 404,
        wrongOriginDenied: wrongOrigin.status === 404,
      },
    ),
    probe(
      'CSP',
      ['A7-T-SCRIPT-TARGET-01', 'A7-T-CONNECT-01', 'A7-T-FORM-01'],
      generatedCsp === AICO007_GENERATED_CSP &&
        bootstrap.headers['Content-Security-Policy'] === AICO007_BOOTSTRAP_CSP,
      sequences(0, 1),
      {
        bootstrapHashPinned: AICO007_BOOTSTRAP_CSP.includes(
          `'sha256-${AICO007_BOOTSTRAP_SCRIPT_SHA256}'`,
        ),
        generatedCspExact: generatedCsp === AICO007_GENERATED_CSP,
      },
    ),
    probe(
      'HEADERS',
      ['A7-T-SCRIPT-TARGET-01', 'A7-T-FRAME-ANCESTOR-01'],
      commonExact,
      sequences(1),
      {
        commonHeadersExact: commonExact,
        forbiddenHeadersAbsent: noForbiddenResponseHeaders,
      },
    ),
    probe('CACHE', ['A7-T-CACHE-01'], cacheExact, sequences(1), {
      cacheHeadersExact: cacheExact,
      clearSiteDataOnUnavailable: unavailable.headers['Clear-Site-Data'] === CLEAR_SITE_DATA,
    }),
    probe(
      'MIME',
      ['A7-T-MIME-01'],
      unavailable.headers['X-Content-Type-Options'] === 'nosniff' &&
        adapter.fixture.assets['/assets/mime-canary.json']?.mediaType === 'application/json',
      sequences(1),
      {
        contentDispositionAbsent: unavailable.headers['Content-Disposition'] === undefined,
        nosniff: unavailable.headers['X-Content-Type-Options'] === 'nosniff',
      },
    ),
    probe(
      'PATH',
      ['A7-T-PATH-01'],
      traversal.status === 404 &&
        range.status === 404 &&
        unsafeMethod.status === 404 &&
        conditional.status === 404,
      sequences(2, 7, 8, 9),
      {
        conditionalDenied: conditional.status === 404,
        rangeDenied: range.status === 404,
        traversalDenied: traversal.status === 404,
        unsafeMethodDenied: unsafeMethod.status === 404,
      },
    ),
    probe(
      'NAVIGATION',
      ['A7-T-NAVIGATION-01'],
      fixtureHtml.includes('data-aico-probe="NAVIGATION"') &&
        !generatedSandbox.includes('allow-popups') &&
        !generatedSandbox.includes('allow-top-navigation'),
      sequences(1),
      {
        popupPermissionAbsent: !generatedSandbox.includes('allow-popups'),
        topNavigationPermissionAbsent: !generatedSandbox.includes('allow-top-navigation'),
      },
    ),
    probe(
      'OPENER',
      ['A7-T-OPENER-NAV-01'],
      unavailable.headers['Cross-Origin-Opener-Policy'] === 'same-origin' &&
        fixtureHtml.includes('data-aico-probe="OPENER"'),
      sequences(1),
      { coopSameOrigin: unavailable.headers['Cross-Origin-Opener-Policy'] === 'same-origin' },
    ),
    probe(
      'REFERRER',
      ['A7-T-REFERRER-01'],
      unavailable.headers['Referrer-Policy'] === 'no-referrer',
      sequences(1),
      { noReferrer: unavailable.headers['Referrer-Policy'] === 'no-referrer' },
    ),
    probe(
      'DOWNLOAD',
      ['A7-T-DOWNLOAD-01'],
      fixtureHtml.includes('data-aico-probe="DOWNLOAD"') &&
        !generatedSandbox.includes('allow-downloads') &&
        unavailable.headers['Content-Disposition'] === undefined,
      sequences(1),
      {
        attachmentDispositionAbsent: unavailable.headers['Content-Disposition'] === undefined,
        downloadPermissionAbsent: !generatedSandbox.includes('allow-downloads'),
      },
    ),
    probe(
      'COOKIE',
      ['A7-T-COOKIE-01', 'A7-T-COOKIE-STORAGE-01'],
      duplicateCookie.status === 404 &&
        oversizedCookie.status === 404 &&
        (newEntries[3]?.authorizationCalls ?? -1) === 0 &&
        (newEntries[4]?.authorizationCalls ?? -1) === 0,
      sequences(3, 4),
      {
        duplicateDeniedBeforeAuthorization: (newEntries[3]?.authorizationCalls ?? -1) === 0,
        duplicateStatus: duplicateCookie.status,
        oversizedDeniedBeforeAuthorization: (newEntries[4]?.authorizationCalls ?? -1) === 0,
        oversizedStatus: oversizedCookie.status,
      },
    ),
    probe(
      'STORAGE',
      ['A7-T-STORAGE-01'],
      fixtureHtml.includes('id="aico-proof-results"') &&
        unavailable.headers['Clear-Site-Data'] === CLEAR_SITE_DATA &&
        worker.status === 404 &&
        parseDirective(generatedCsp, 'worker-src').includes("'none'") &&
        parseDirective(generatedCsp, 'manifest-src').includes("'none'"),
      sequences(1, 5),
      {
        cleanupHeaderPresent: unavailable.headers['Clear-Site-Data'] === CLEAR_SITE_DATA,
        manifestSourceNone: parseDirective(generatedCsp, 'manifest-src').includes("'none'"),
        originLocalProbePresent:
          adapter.fixture.assets[adapter.fixture.scriptPath]?.body
            .toString('utf8')
            .includes('ORIGIN_LOCAL') ?? false,
        persistentControllerRouteDenied: worker.status === 404,
        workerSourceNone: parseDirective(generatedCsp, 'worker-src').includes("'none'"),
      },
    ),
    probe(
      'SERVICE_WORKER',
      ['A7-T-SERVICE-WORKER-01'],
      worker.status === 404 &&
        (newEntries[5]?.authorizationCalls ?? -1) === 0 &&
        parseDirective(generatedCsp, 'worker-src').includes("'none'"),
      sequences(5),
      {
        registrationRouteDenied: worker.status === 404,
        workerSourceNone: parseDirective(generatedCsp, 'worker-src').includes("'none'"),
      },
    ),
    probe(
      'PRIVATE_CONTROL_REQUEST',
      ['A7-T-CONTROL-REQUEST-01', 'A7-T-CONNECT-01'],
      privateControl.status === 404 &&
        (newEntries[6]?.authorizationCalls ?? -1) === 0 &&
        snapshot.totals.privateControlEffects === 0 &&
        unavailable.headers['Access-Control-Allow-Origin'] === undefined,
      sequences(6),
      {
        accessControlAllowOriginAbsent:
          unavailable.headers['Access-Control-Allow-Origin'] === undefined,
        authorizationCalls: newEntries[6]?.authorizationCalls ?? -1,
        privateControlEffects: snapshot.totals.privateControlEffects,
      },
    ),
  ];

  return Object.freeze(results);
}

function normalizeRequest(
  input: BrowserHttpRequest,
  fixture: HostileStaticFixture,
  strictPathSafety: boolean,
): NormalizedRequest {
  const headers: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const [rawName, rawValue] of Object.entries(input.headers ?? {})) {
    const name = rawName.trim().toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name) || rawValue === undefined) continue;
    const values = typeof rawValue === 'string' ? [rawValue] : [...rawValue];
    headers[name] ??= [];
    headers[name].push(...values.map((value) => String(value)));
  }
  const body =
    typeof input.body === 'string'
      ? Buffer.from(input.body, 'utf8')
      : input.body === undefined
        ? Buffer.alloc(0)
        : Buffer.from(input.body);
  return {
    method: input.method.trim().toUpperCase(),
    target: classifyTarget(input.target, fixture, strictPathSafety),
    headers: Object.freeze(headers),
    body,
  };
}

function classifyTarget(
  target: string,
  fixture: HostileStaticFixture,
  strictPathSafety: boolean,
): TargetClassification {
  if (
    Buffer.byteLength(target, 'utf8') > AICO007_MAX_REQUEST_TARGET_BYTES ||
    !target.startsWith('/') ||
    target.includes('#') ||
    containsDisallowedTargetCodePoint(target)
  ) {
    if (!strictPathSafety) {
      return {
        valid: true,
        normalizedPath: '/',
        pathClass: 'DOCUMENT',
        requestClass: 'FIXTURE',
        relaxedUnsafe: true,
      };
    }
    return { valid: false, normalizedPath: null, pathClass: 'INVALID', requestClass: 'INVALID' };
  }
  const queryIndex = target.indexOf('?');
  const path = queryIndex === -1 ? target : target.slice(0, queryIndex);
  if (path.includes('//') || (path.length > 1 && path.endsWith('/'))) {
    if (!strictPathSafety) {
      return {
        valid: true,
        normalizedPath: '/',
        pathClass: 'DOCUMENT',
        requestClass: 'FIXTURE',
        relaxedUnsafe: true,
      };
    }
    return { valid: false, normalizedPath: null, pathClass: 'INVALID', requestClass: 'INVALID' };
  }
  const segments = path.split('/').slice(1);
  if (
    path !== '/' &&
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    if (!strictPathSafety) {
      return {
        valid: true,
        normalizedPath: '/',
        pathClass: 'DOCUMENT',
        requestClass: 'FIXTURE',
        relaxedUnsafe: true,
      };
    }
    return { valid: false, normalizedPath: null, pathClass: 'INVALID', requestClass: 'INVALID' };
  }
  if (path === BOOTSTRAP_PATH) {
    return { valid: true, normalizedPath: path, pathClass: 'BOOTSTRAP', requestClass: 'BOOTSTRAP' };
  }
  if (path === EXCHANGE_PATH) {
    return { valid: true, normalizedPath: path, pathClass: 'EXCHANGE', requestClass: 'EXCHANGE' };
  }
  if (isWorkerControlPath(path)) {
    return {
      valid: true,
      normalizedPath: path,
      pathClass: 'WORKER_CONTROL',
      requestClass: 'WORKER_CONTROL',
    };
  }
  if (path === '/__aico' || path.startsWith('/__aico/')) {
    return {
      valid: true,
      normalizedPath: path,
      pathClass: 'RESERVED_PLATFORM',
      requestClass: 'RESERVED',
    };
  }
  if (path === '/' || path === fixture.documentPath) {
    return { valid: true, normalizedPath: path, pathClass: 'DOCUMENT', requestClass: 'FIXTURE' };
  }
  if (path.startsWith('/assets/')) {
    return {
      valid: true,
      normalizedPath: path,
      pathClass: 'FIXTURE_ASSET',
      requestClass: 'FIXTURE',
    };
  }
  return { valid: true, normalizedPath: path, pathClass: 'OTHER', requestClass: 'UNKNOWN' };
}

function isWorkerControlPath(path: string): boolean {
  return (
    path === '/sw.js' ||
    path === '/service-worker.js' ||
    path === '/manifest.webmanifest' ||
    path.endsWith('/sw.js') ||
    path.endsWith('/service-worker.js')
  );
}

function containsDisallowedTargetCodePoint(target: string): boolean {
  for (const character of target) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (character === '\\' || character === '%' || codePoint <= 0x1f || codePoint === 0x7f) {
      return true;
    }
  }
  return false;
}

function response(
  status: number,
  profile: PolicyProfile,
  mediaType: string,
  body: Buffer,
  head: boolean,
  controls: Readonly<ProofControls>,
): BrowserHttpResponse {
  const headers = Object.freeze({
    ...policyHeaders(profile, controls),
    'Content-Type': mediaType,
    'Content-Length': body.byteLength.toString(10),
  });
  return Object.freeze({ status, headers, body: head ? Buffer.alloc(0) : Buffer.from(body) });
}

function policyHeaders(profile: PolicyProfile, controls: Readonly<ProofControls>): ResponseHeaders {
  return Object.freeze({
    'Content-Security-Policy':
      profile === 'BOOTSTRAP_V1'
        ? bootstrapCspForControls(controls)
        : generatedCspForControls(controls),
    ...securityHeadersForControls(controls),
    ...AICO007_CACHE_HEADERS,
  });
}

function generatedCspForControls(controls: Readonly<ProofControls>): string {
  if (
    controls.storageAndWorkerIsolation &&
    controls.openerNavigationAndFrameIsolation &&
    controls.exactCspAndTargetDenial &&
    controls.scriptAndMimeIntegrity &&
    controls.methodPathAndReferrerSafety
  ) {
    return AICO007_GENERATED_CSP;
  }
  const sandbox = ['allow-scripts', 'allow-same-origin'];
  if (!controls.openerNavigationAndFrameIsolation) {
    sandbox.push('allow-downloads', 'allow-forms', 'allow-popups', 'allow-top-navigation');
  } else if (!controls.methodPathAndReferrerSafety) {
    sandbox.push('allow-downloads');
  }
  return [
    "default-src 'none'",
    controls.scriptAndMimeIntegrity
      ? "script-src 'self'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "media-src 'self'",
    controls.exactCspAndTargetDenial ? "connect-src 'none'" : 'connect-src *',
    controls.exactCspAndTargetDenial ? "object-src 'none'" : 'object-src *',
    controls.exactCspAndTargetDenial ? "frame-src 'none'" : 'frame-src *',
    controls.exactCspAndTargetDenial ? "child-src 'none'" : 'child-src *',
    controls.storageAndWorkerIsolation ? "worker-src 'none'" : "worker-src 'self'",
    controls.storageAndWorkerIsolation ? "manifest-src 'none'" : "manifest-src 'self'",
    "base-uri 'none'",
    controls.exactCspAndTargetDenial ? "form-action 'none'" : 'form-action *',
    controls.openerNavigationAndFrameIsolation ? "frame-ancestors 'none'" : 'frame-ancestors *',
    `sandbox ${sandbox.join(' ')}`,
  ].join('; ');
}

function bootstrapCspForControls(controls: Readonly<ProofControls>): string {
  if (
    controls.storageAndWorkerIsolation &&
    controls.openerNavigationAndFrameIsolation &&
    controls.exactCspAndTargetDenial &&
    controls.scriptAndMimeIntegrity &&
    controls.methodPathAndReferrerSafety
  ) {
    return AICO007_BOOTSTRAP_CSP;
  }
  const sandbox = ['allow-scripts', 'allow-same-origin'];
  if (!controls.openerNavigationAndFrameIsolation) {
    sandbox.push('allow-downloads', 'allow-forms', 'allow-popups', 'allow-top-navigation');
  } else if (!controls.methodPathAndReferrerSafety) {
    sandbox.push('allow-downloads');
  }
  return [
    "default-src 'none'",
    controls.scriptAndMimeIntegrity
      ? `script-src 'sha256-${AICO007_BOOTSTRAP_SCRIPT_SHA256}'`
      : `script-src 'sha256-${AICO007_BOOTSTRAP_SCRIPT_SHA256}' 'unsafe-inline'`,
    "style-src 'none'",
    "img-src 'none'",
    "font-src 'none'",
    "media-src 'none'",
    controls.exactCspAndTargetDenial ? "connect-src 'self'" : 'connect-src *',
    controls.exactCspAndTargetDenial ? "object-src 'none'" : 'object-src *',
    controls.exactCspAndTargetDenial ? "frame-src 'none'" : 'frame-src *',
    controls.exactCspAndTargetDenial ? "child-src 'none'" : 'child-src *',
    controls.storageAndWorkerIsolation ? "worker-src 'none'" : "worker-src 'self'",
    controls.storageAndWorkerIsolation ? "manifest-src 'none'" : "manifest-src 'self'",
    "base-uri 'none'",
    controls.exactCspAndTargetDenial ? "form-action 'none'" : 'form-action *',
    controls.openerNavigationAndFrameIsolation ? "frame-ancestors 'none'" : 'frame-ancestors *',
    `sandbox ${sandbox.join(' ')}`,
  ].join('; ');
}

function securityHeadersForControls(controls: Readonly<ProofControls>): Record<string, string> {
  const headers: Record<string, string> = { ...AICO007_SECURITY_HEADERS };
  if (!controls.originAndHostIsolation) {
    delete headers['Strict-Transport-Security'];
    headers['Cross-Origin-Embedder-Policy'] = 'unsafe-none';
    headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
  }
  if (!controls.openerNavigationAndFrameIsolation) {
    headers['Cross-Origin-Opener-Policy'] = 'unsafe-none';
    headers['X-Frame-Options'] = 'SAMEORIGIN';
  }
  if (!controls.exactCspAndTargetDenial) headers['Access-Control-Allow-Origin'] = '*';
  if (!controls.scriptAndMimeIntegrity) delete headers['X-Content-Type-Options'];
  if (!controls.methodPathAndReferrerSafety) headers['Referrer-Policy'] = 'unsafe-url';
  return headers;
}

function parsePresentationCookie(
  values: readonly string[] | undefined,
  strictIsolation: boolean,
):
  | Readonly<{
      valid: true;
      presentation: string | null;
      reasonClass: 'COOKIE_ABSENT' | 'COOKIE_VALID';
    }>
  | Readonly<{ valid: false; presentation: null; reasonClass: string }> {
  if (values === undefined || values.length === 0) {
    return { valid: true, presentation: null, reasonClass: 'COOKIE_ABSENT' };
  }
  if (!strictIsolation) {
    const candidates = values
      .join(';')
      .split(';')
      .map((pair) => pair.trim())
      .filter((pair) => pair.startsWith(`${AUTH_COOKIE_NAME}=`))
      .map((pair) => pair.slice(AUTH_COOKIE_NAME.length + 1))
      .filter(safePresentation);
    return {
      valid: true,
      presentation: candidates.at(-1) ?? null,
      reasonClass: candidates.length === 0 ? 'COOKIE_ABSENT' : 'COOKIE_VALID',
    };
  }
  if (values.length !== 1) {
    return { valid: false, presentation: null, reasonClass: 'COOKIE_HEADER_DUPLICATE' };
  }
  const header = values[0] ?? '';
  if (Buffer.byteLength(header, 'utf8') > AICO007_MAX_COOKIE_HEADER_BYTES) {
    return { valid: false, presentation: null, reasonClass: 'COOKIE_HEADER_OVERSIZED' };
  }
  let presentation: string | null = null;
  for (const pair of header.split(';')) {
    const trimmed = pair.trim();
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      return { valid: false, presentation: null, reasonClass: 'COOKIE_HEADER_MALFORMED' };
    }
    const name = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || !safePresentation(value)) {
      return { valid: false, presentation: null, reasonClass: 'COOKIE_HEADER_MALFORMED' };
    }
    if (name !== AUTH_COOKIE_NAME) continue;
    if (presentation !== null) {
      return { valid: false, presentation: null, reasonClass: 'COOKIE_AUTH_DUPLICATE' };
    }
    presentation = value;
  }
  return {
    valid: true,
    presentation,
    reasonClass: presentation === null ? 'COOKIE_ABSENT' : 'COOKIE_VALID',
  };
}

function safePresentation(value: string): boolean {
  return value.length >= 1 && value.length <= 1_024 && /^[A-Za-z0-9._~-]+$/.test(value);
}

function firstHeader(
  headers: Readonly<Record<string, readonly string[]>>,
  name: string,
): string | null {
  const values = headers[name];
  return values?.length === 1 ? (values[0] ?? null) : null;
}

function hasHeader(headers: Readonly<Record<string, readonly string[]>>, name: string): boolean {
  return (headers[name]?.length ?? 0) > 0;
}

function hasConditionalHeader(headers: Readonly<Record<string, readonly string[]>>): boolean {
  return ['if-match', 'if-modified-since', 'if-none-match', 'if-range', 'if-unmodified-since'].some(
    (name) => hasHeader(headers, name),
  );
}

function classifyHost(
  values: readonly string[] | undefined,
  canonicalHost: string,
): BrowserHttpEvidenceEntry['hostClass'] {
  if (values === undefined || values.length === 0) return 'MISSING';
  if (values.length !== 1) return 'MALFORMED';
  const value = values[0] ?? '';
  if (!/^[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(value)) return 'MALFORMED';
  return value === canonicalHost ? 'EXACT' : 'MISMATCH';
}

function classifyOrigin(
  values: readonly string[] | undefined,
  canonicalOrigin: string,
): BrowserHttpEvidenceEntry['originClass'] {
  if (values === undefined || values.length === 0) return 'ABSENT';
  if (values.length !== 1) return 'MALFORMED';
  const value = values[0] ?? '';
  try {
    const parsed = new URL(value);
    if (parsed.origin !== value || parsed.username !== '' || parsed.password !== '')
      return 'MALFORMED';
  } catch {
    return 'MALFORMED';
  }
  return value === canonicalOrigin ? 'EXACT' : 'MISMATCH';
}

function classifyFetchSite(value: string | null): BrowserHttpEvidenceEntry['fetchSiteClass'] {
  switch (value) {
    case null:
      return 'ABSENT';
    case 'cross-site':
      return 'CROSS_SITE';
    case 'none':
      return 'NONE';
    case 'same-origin':
      return 'SAME_ORIGIN';
    case 'same-site':
      return 'SAME_SITE';
    default:
      return 'OTHER';
  }
}

function methodClass(method: string): BrowserHttpEvidenceEntry['methodClass'] {
  switch (method) {
    case 'GET':
    case 'HEAD':
    case 'OPTIONS':
    case 'POST':
      return method;
    default:
      return 'OTHER';
  }
}

function safeReasonClass(value: string): string {
  return /^[A-Z][A-Z0-9_]{0,47}$/.test(value) ? value : 'UNSAFE_REASON_CLASS';
}

function digest(bytes: Buffer | string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function policyHeaderDigest(
  headers: ResponseHeaders,
  profile: PolicyProfile,
  controls: Readonly<ProofControls>,
): `sha256:${string}` {
  const expected = policyHeaders(profile, controls);
  const serialized = Object.keys(expected)
    .sort((left, right) => left.localeCompare(right))
    .map((name) => `${name.toLowerCase()}:${headers[name] ?? ''}`)
    .join('\n');
  return digest(`${serialized}\n`);
}

function exactHeaderSubset(actual: ResponseHeaders, expected: ResponseHeaders): boolean {
  return Object.entries(expected).every(([name, value]) => actual[name] === value);
}

function parseDirective(csp: string | undefined, directive: string): readonly string[] {
  if (csp === undefined) return Object.freeze([]);
  const matched = csp
    .split(';')
    .map((part) => part.trim().split(/\s+/u))
    .find(([name]) => name === directive);
  return Object.freeze(matched?.slice(1) ?? []);
}

function fixtureMarker(fixture: HostileStaticFixture, marker: string): boolean {
  return fixture.assets[fixture.documentPath]?.body.toString('utf8').includes(marker) ?? false;
}

function validateCanonicalHost(value: string): string {
  if (
    value !== value.toLowerCase() ||
    value.length > 253 ||
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value) ||
    value.includes('..') ||
    !value.includes('.')
  ) {
    throw new TypeError('canonicalHost must be a lower-case DNS hostname without a port.');
  }
  return value;
}

function validateCanonicalOrigin(value: string, canonicalHost: string): string {
  const expected = `https://${canonicalHost}`;
  if (value !== expected) {
    throw new TypeError(`canonicalOrigin must be exactly ${expected}.`);
  }
  return value;
}

function validateFixture(fixture: HostileStaticFixture): void {
  if (fixture.schemaVersion !== 1 || fixture.fixtureId !== 'aico-007-hostile-static/v1') {
    throw new TypeError('Unsupported hostile fixture contract.');
  }
  for (const [path, asset] of Object.entries(fixture.assets)) {
    if (asset.path !== path || !path.startsWith('/') || !ALLOWED_MEDIA_TYPES.has(asset.mediaType)) {
      throw new TypeError('Hostile fixture contains an invalid asset binding.');
    }
    if (digest(asset.body) !== asset.sha256) {
      throw new TypeError('Hostile fixture contains an invalid asset digest.');
    }
  }
  for (const marker of ['NAVIGATION', 'OPENER', 'DOWNLOAD', 'PRIVATE_CONTROL_REQUEST']) {
    if (!fixtureMarker(fixture, `data-aico-probe="${marker}"`)) {
      throw new TypeError(`Hostile fixture is missing the ${marker} marker.`);
    }
  }
}

function cloneResponse(value: BrowserHttpResponse): BrowserHttpResponse {
  return Object.freeze({
    status: value.status,
    headers: Object.freeze({ ...value.headers }),
    body: Buffer.from(value.body),
  });
}

function probe(
  probeId: HostileBrowserProbeId,
  caseIds: readonly string[],
  passed: boolean,
  evidenceSequences: readonly number[],
  observations: Readonly<Record<string, boolean | number | string>>,
): BrowserBoundaryProbeResult {
  return Object.freeze({
    probeId,
    caseIds: Object.freeze([...caseIds]),
    passed,
    evidenceSequences,
    observations: Object.freeze({ ...observations }),
  });
}

async function serveLoopbackRequest(
  adapter: DeterministicBrowserHttpAdapter,
  request: IncomingMessage,
  output: ServerResponse,
): Promise<void> {
  const remoteAddress = request.socket.remoteAddress;
  if (remoteAddress !== LOOPBACK_ADDRESS && remoteAddress !== `::ffff:${LOOPBACK_ADDRESS}`) {
    request.destroy();
    return;
  }

  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    if (received <= AICO007_MAX_REQUEST_BODY_BYTES) {
      const remaining = AICO007_MAX_REQUEST_BODY_BYTES + 1 - received;
      chunks.push(bytes.subarray(0, Math.max(0, remaining)));
    }
    received += bytes.byteLength;
  }
  const body = Buffer.concat(chunks);
  const result = await adapter.handle({
    method: request.method ?? '',
    target: request.url ?? '',
    headers: fromIncomingHeaders(request.headers),
    body,
  });
  output.sendDate = false;
  output.statusCode = result.status;
  for (const [name, value] of Object.entries(result.headers)) output.setHeader(name, value);
  output.end(result.body);
}

function fromIncomingHeaders(headers: IncomingHttpHeaders): HeaderInput {
  const normalized: Record<string, HeaderInputValue> = Object.create(null) as Record<
    string,
    HeaderInputValue
  >;
  for (const [name, value] of Object.entries(headers)) normalized[name] = value;
  return normalized;
}

function listenLoopback(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    server.listen(0, LOOPBACK_ADDRESS, () => {
      server.off('error', onError);
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

function requestLoopback(
  port: number,
  canonicalHost: string,
  input: BrowserHttpRequest,
): Promise<BrowserHttpResponse> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | string[]> = Object.create(null) as Record<
      string,
      string | string[]
    >;
    for (const [name, value] of Object.entries(input.headers ?? {})) {
      if (value !== undefined) headers[name] = typeof value === 'string' ? value : [...value];
    }
    headers.Host = canonicalHost;
    const body =
      typeof input.body === 'string'
        ? Buffer.from(input.body, 'utf8')
        : input.body === undefined
          ? Buffer.alloc(0)
          : Buffer.from(input.body);
    if (body.byteLength > 0 && headers['Content-Length'] === undefined) {
      headers['Content-Length'] = body.byteLength.toString(10);
    }
    const request = sendHttpRequest(
      {
        hostname: LOOPBACK_ADDRESS,
        port,
        method: input.method,
        path: input.target,
        headers,
      },
      (responseStream) => {
        const chunks: Buffer[] = [];
        responseStream.on('data', (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
        responseStream.once('error', reject);
        responseStream.once('end', () => {
          const responseHeaders: Record<string, string> = Object.create(null) as Record<
            string,
            string
          >;
          for (let index = 0; index < responseStream.rawHeaders.length; index += 2) {
            const name = responseStream.rawHeaders[index];
            const value = responseStream.rawHeaders[index + 1];
            if (name !== undefined && value !== undefined) responseHeaders[name] = value;
          }
          resolve(
            Object.freeze({
              status: responseStream.statusCode ?? 0,
              headers: Object.freeze(responseHeaders),
              body: Buffer.concat(chunks),
            }),
          );
        });
      },
    );
    request.once('error', reject);
    request.end(body);
  });
}
