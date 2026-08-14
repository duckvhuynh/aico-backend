import { createHash, generateKeyPairSync, sign, X509Certificate } from 'node:crypto';
import { constants as fsConstants, createReadStream } from 'node:fs';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer as createHttpsServer, type Server as HttpsServer } from 'node:https';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, resolve, sep } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import {
  AICO007_MAX_REQUEST_BODY_BYTES,
  startLoopbackBrowserHttpServer,
  type BrowserHttpRequest,
  type BrowserHttpResponse,
  type DeterministicBrowserHttpAdapter,
  type LoopbackBrowserHttpServer,
} from './browser-http-adapter';
import { HOSTILE_BROWSER_PROBE_IDS, type HostileBrowserProbeId } from './hostile-static-fixture';

const LOOPBACK_ADDRESS = '127.0.0.1';
const PROFILE_PREFIX = 'aico007-real-browser-';
const CONTROL_TEST_HOST = 'control.aico-control.test';
const MAX_PAGE_RECORDS = 32;
const DEFAULT_LAUNCH_TIMEOUT_MS = 12_000;
const DEFAULT_PAGE_TIMEOUT_MS = 20_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 60_000;

export const REAL_BROWSER_PROBE_OUTCOMES = Object.freeze([
  'AVAILABLE',
  'BLOCKED',
  'ORIGIN_LOCAL',
] as const);

export type RealBrowserProbeOutcome = (typeof REAL_BROWSER_PROBE_OUTCOMES)[number];

export const REAL_BROWSER_DETAIL_CLASSES = Object.freeze([
  'api-unavailable',
  'cache-storage-available-only-to-this-origin',
  'cache-storage-unavailable',
  'cookie-write-rejected',
  'cross-origin-request-blocked',
  'cross-origin-request-unexpectedly-resolved',
  'encoded-path-blocked',
  'encoded-path-unexpectedly-resolved',
  'indexeddb-available-only-to-this-origin',
  'indexeddb-unavailable',
  'inline-script-did-not-run',
  'inline-script-ran',
  'isolated-https-origin',
  'localStorage-available-only-to-this-origin',
  'localStorage-unavailable',
  'opener-is-null',
  'opener-present',
  'platform-cookie-hidden',
  'platform-cookie-visible',
  'popup-blocked',
  'popup-opened',
  'popup-threw',
  'referrer-empty',
  'referrer-present',
  'registration-rejected',
  'registration-unexpectedly-succeeded',
  'same-origin-request-blocked',
  'same-origin-request-unexpectedly-resolved',
  'sessionStorage-available-only-to-this-origin',
  'sessionStorage-unavailable',
  'unexpected-origin',
] as const);

export type RealBrowserDetailClass = (typeof REAL_BROWSER_DETAIL_CLASSES)[number];

export const REAL_BROWSER_BLOCKERS = Object.freeze([
  'BROWSER_LAUNCH_FAILED',
  'BROWSER_DIGEST_FAILED',
  'BROWSER_NOT_FOUND',
  'CDP_CONNECTION_FAILED',
  'CDP_ENDPOINT_TIMEOUT',
  'CDP_PROTOCOL_FAILED',
  'CDP_WEBSOCKET_UNAVAILABLE',
  'CLEANUP_FAILED',
  'EXCHANGE_NOT_REACHED',
  'HARNESS_INTERNAL_FAILURE',
  'HOSTILE_FIXTURE_NOT_LOADED',
  'HOST_MAPPING_FAILED',
  'HOST_MAPPING_UNSUPPORTED',
  'INPUT_REJECTED',
  'NAVIGATION_FAILED',
  'PAGE_PROBE_SCHEMA_INVALID',
  'PAGE_PROBE_UNSAFE',
  'PAGE_PROBES_TIMEOUT',
  'SECURE_COOKIE_FLOW_FAILED',
  'TLS_CERTIFICATE_REJECTED',
  'TLS_PROXY_FAILED',
  'TLS_PROXY_UNREACHABLE',
] as const);

export type RealBrowserBlocker = (typeof REAL_BROWSER_BLOCKERS)[number];
export type RealBrowserFamily = 'CHROME' | 'CHROMIUM' | 'EDGE';

export const REAL_BROWSER_ORIGIN_CLASSES = Object.freeze([
  'PREVIEW_TEST_SITE',
  'CONTROL_TEST_SITE',
] as const);

export type RealBrowserOriginClass = (typeof REAL_BROWSER_ORIGIN_CLASSES)[number];
export type Sha256Digest = `sha256:${string}`;

export interface RealBrowserHarnessOptions {
  readonly adapter: DeterministicBrowserHttpAdapter;
  readonly capability: string;
  readonly launchTimeoutMs?: number;
  readonly pageTimeoutMs?: number;
}

export interface RealBrowserProbeObservation {
  readonly probeId: HostileBrowserProbeId;
  readonly outcome: RealBrowserProbeOutcome;
  readonly detailClass: RealBrowserDetailClass;
  readonly count: number;
}

const EXPECTED_REAL_BROWSER_PROBES_INPUT = [
  {
    probeId: 'ORIGIN_HOST',
    outcome: 'ORIGIN_LOCAL',
    detailClass: 'isolated-https-origin',
    count: 1,
  },
  { probeId: 'CSP', outcome: 'BLOCKED', detailClass: 'inline-script-did-not-run', count: 1 },
  { probeId: 'OPENER', outcome: 'BLOCKED', detailClass: 'opener-is-null', count: 1 },
  { probeId: 'REFERRER', outcome: 'BLOCKED', detailClass: 'referrer-empty', count: 1 },
  { probeId: 'COOKIE', outcome: 'BLOCKED', detailClass: 'platform-cookie-hidden', count: 1 },
  {
    probeId: 'STORAGE',
    outcome: 'ORIGIN_LOCAL',
    detailClass: 'localStorage-available-only-to-this-origin',
    count: 1,
  },
  {
    probeId: 'STORAGE',
    outcome: 'ORIGIN_LOCAL',
    detailClass: 'sessionStorage-available-only-to-this-origin',
    count: 1,
  },
  { probeId: 'NAVIGATION', outcome: 'BLOCKED', detailClass: 'popup-blocked', count: 1 },
  {
    probeId: 'SERVICE_WORKER',
    outcome: 'BLOCKED',
    detailClass: 'registration-rejected',
    count: 1,
  },
  {
    probeId: 'PRIVATE_CONTROL_REQUEST',
    outcome: 'BLOCKED',
    detailClass: 'same-origin-request-blocked',
    count: 1,
  },
  {
    probeId: 'PRIVATE_CONTROL_REQUEST',
    outcome: 'BLOCKED',
    detailClass: 'cross-origin-request-blocked',
    count: 1,
  },
  { probeId: 'PATH', outcome: 'BLOCKED', detailClass: 'encoded-path-blocked', count: 1 },
  {
    probeId: 'STORAGE',
    outcome: 'ORIGIN_LOCAL',
    detailClass: 'cache-storage-available-only-to-this-origin',
    count: 1,
  },
  {
    probeId: 'STORAGE',
    outcome: 'ORIGIN_LOCAL',
    detailClass: 'indexeddb-available-only-to-this-origin',
    count: 1,
  },
] as const satisfies readonly RealBrowserProbeObservation[];

export const REAL_BROWSER_EXPECTED_PROBES = normalizeProbeRecords(
  EXPECTED_REAL_BROWSER_PROBES_INPUT,
);

export interface RealBrowserHarnessCounts {
  readonly pageRecords: number;
  readonly invalidPageRecords: number;
  readonly httpRequests: number;
  readonly authorizationCalls: number;
  readonly exchangeCalls: number;
  readonly privateControlEffects: number;
  readonly controlSiteRequests: number;
}

export interface RealBrowserHarnessDigests {
  readonly browserExecutableDigest: Sha256Digest;
  readonly browserRuntimeProfileDigest: Sha256Digest;
  readonly probeResultDigest: Sha256Digest;
  readonly tlsProfileDigest: Sha256Digest;
}

export type RealBrowserHarnessResult =
  | Readonly<{
      schemaVersion: 1;
      kind: 'COMPLETED';
      browserFamily: RealBrowserFamily;
      probes: readonly RealBrowserProbeObservation[];
      counts: RealBrowserHarnessCounts;
      digests: RealBrowserHarnessDigests;
      originClasses: readonly ['PREVIEW_TEST_SITE', 'CONTROL_TEST_SITE'];
      trustMode: 'DISPOSABLE_CA_SPKI';
      freshProfileRemoved: true;
    }>
  | Readonly<{
      schemaVersion: 1;
      kind: 'BLOCKED';
      blocker: RealBrowserBlocker;
      browserFamily: RealBrowserFamily | null;
      counts: RealBrowserHarnessCounts;
    }>;

interface BrowserCandidate {
  readonly family: RealBrowserFamily;
  readonly executablePath: string;
}

interface TlsMaterial {
  readonly certificateChainPem: string;
  readonly privateKeyPem: string;
}

interface DisposableTlsBundle {
  readonly preview: TlsMaterial;
  readonly control: TlsMaterial;
  readonly caSpkiSha256Base64: string;
  readonly tlsProfileDigest: Sha256Digest;
}

interface LoopbackTlsProxy {
  readonly port: number;
  close(): Promise<void>;
}

interface LoopbackControlSentinel {
  readonly port: number;
  requestCount(): number;
  close(): Promise<void>;
}

interface DestroyableSocket {
  destroy(): void;
}

interface ServerTlsSocket {
  readonly encrypted?: boolean;
  readonly servername?: string;
}

interface DevToolsEndpoint {
  readonly port: number;
  readonly browserPath: string;
}

interface PageProbeEnvelope {
  readonly ready: boolean;
  readonly totalCount: number;
  readonly invalidCount: number;
  readonly records: readonly RealBrowserProbeObservation[];
  readonly originClasses: readonly ['PREVIEW_TEST_SITE', 'CONTROL_TEST_SITE'];
}

interface CdpMessage {
  readonly id?: number;
  readonly result?: unknown;
  readonly error?: unknown;
}

interface CdpPending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

interface BrowserResources {
  profilePath: string | null;
  backend: LoopbackBrowserHttpServer | null;
  tlsProxy: LoopbackTlsProxy | null;
  controlSentinel: LoopbackControlSentinel | null;
  browserProcess: ChildProcess | null;
  cdp: CdpClient | null;
}

class HarnessBlockedError extends Error {
  constructor(readonly blocker: RealBrowserBlocker) {
    super(blocker);
    this.name = 'HarnessBlockedError';
  }
}

class CdpClient {
  private readonly pending = new Map<number, CdpPending>();
  private nextId = 1;
  private closed = false;

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => this.receive(event.data));
    socket.addEventListener('close', () => this.failPending());
    socket.addEventListener('error', () => this.failPending());
  }

  static async connect(url: string, timeoutMs: number): Promise<CdpClient> {
    if (typeof globalThis.WebSocket !== 'function') {
      throw new HarnessBlockedError('CDP_WEBSOCKET_UNAVAILABLE');
    }
    const socket = new WebSocket(url);
    await new Promise<void>((resolveConnection, rejectConnection) => {
      const timer = setTimeout(() => {
        socket.close();
        rejectConnection(new HarnessBlockedError('CDP_CONNECTION_FAILED'));
      }, timeoutMs);
      const complete = (callback: () => void): void => {
        clearTimeout(timer);
        callback();
      };
      socket.addEventListener('open', () => complete(resolveConnection), { once: true });
      socket.addEventListener(
        'error',
        () => complete(() => rejectConnection(new HarnessBlockedError('CDP_CONNECTION_FAILED'))),
        { once: true },
      );
    });
    return new CdpClient(socket);
  }

  send(
    method: string,
    params: Readonly<Record<string, unknown>> = {},
    sessionId?: string,
  ): Promise<unknown> {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new HarnessBlockedError('CDP_PROTOCOL_FAILED'));
    }
    const id = this.nextId++;
    const payload: Record<string, unknown> = { id, method, params };
    if (sessionId !== undefined) payload.sessionId = sessionId;
    return new Promise((resolveCommand, rejectCommand) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectCommand(new HarnessBlockedError('CDP_PROTOCOL_FAILED'));
      }, 5_000);
      this.pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timer });
      try {
        this.socket.send(JSON.stringify(payload));
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        rejectCommand(new HarnessBlockedError('CDP_PROTOCOL_FAILED'));
      }
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.failPending();
    this.socket.close();
  }

  private receive(data: unknown): void {
    if (typeof data !== 'string') return;
    let message: CdpMessage;
    try {
      message = JSON.parse(data) as CdpMessage;
    } catch {
      return;
    }
    if (!Number.isSafeInteger(message.id)) return;
    const pending = this.pending.get(message.id as number);
    if (pending === undefined) return;
    this.pending.delete(message.id as number);
    clearTimeout(pending.timer);
    if (message.error !== undefined) {
      pending.reject(new HarnessBlockedError('CDP_PROTOCOL_FAILED'));
    } else {
      pending.resolve(message.result);
    }
  }

  private failPending(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new HarnessBlockedError('CDP_PROTOCOL_FAILED'));
    }
    this.pending.clear();
  }
}

export async function runRealBrowserHarness(
  options: RealBrowserHarnessOptions,
): Promise<RealBrowserHarnessResult> {
  const resources: BrowserResources = {
    profilePath: null,
    backend: null,
    tlsProxy: null,
    controlSentinel: null,
    browserProcess: null,
    cdp: null,
  };
  let browserFamily: RealBrowserFamily | null = null;
  const before = options.adapter.snapshotEvidence().totals;
  let result: RealBrowserHarnessResult;

  try {
    const launchTimeoutMs = boundedTimeout(options.launchTimeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS);
    const pageTimeoutMs = boundedTimeout(options.pageTimeoutMs ?? DEFAULT_PAGE_TIMEOUT_MS);
    validateCapability(options.capability);
    validateHarnessHost(options.adapter.canonicalHost);

    const candidate = await findBrowserCandidate();
    if (candidate === null) throw new HarnessBlockedError('BROWSER_NOT_FOUND');
    browserFamily = candidate.family;

    resources.profilePath = await mkdtemp(join(tmpdir(), PROFILE_PREFIX));
    const browserExecutableDigest = await fileSha256(candidate.executablePath);
    const tlsBundle = createDisposableTlsBundle(options.adapter.canonicalHost);
    resources.backend = await startLoopbackBrowserHttpServer(options.adapter);
    resources.tlsProxy = await startTlsProxy(
      resources.backend,
      options.adapter.canonicalHost,
      tlsBundle.preview,
    );
    resources.controlSentinel = await startControlSentinel(CONTROL_TEST_HOST, tlsBundle.control);
    const browserRuntimeProfileDigest = runtimeProfileDigest(candidate.family);
    resources.browserProcess = launchBrowser(
      candidate,
      resources.profilePath,
      options.adapter.canonicalHost,
      resources.tlsProxy.port,
      resources.controlSentinel.port,
      tlsBundle.caSpkiSha256Base64,
    );

    const endpoint = await waitForDevToolsEndpoint(
      resources.profilePath,
      resources.browserProcess,
      launchTimeoutMs,
    );
    resources.cdp = await CdpClient.connect(
      `ws://${LOOPBACK_ADDRESS}:${endpoint.port}${endpoint.browserPath}`,
      launchTimeoutMs,
    );

    const page = asRecord(await resources.cdp.send('Target.createTarget', { url: 'about:blank' }));
    const targetId = requiredSafeString(page.targetId);
    const attached = asRecord(
      await resources.cdp.send('Target.attachToTarget', { targetId, flatten: true }),
    );
    const sessionId = requiredSafeString(attached.sessionId);

    const navigationUrl =
      `https://${options.adapter.canonicalHost}/__aico/bootstrap#` + options.capability;
    const navigation = asRecord(
      await resources.cdp.send(
        'Page.navigate',
        { url: navigationUrl, transitionType: 'typed' },
        sessionId,
      ),
    );
    if (typeof navigation.errorText === 'string') {
      throw new HarnessBlockedError(classifyNavigationError(navigation.errorText));
    }

    const envelope = await waitForPageProbes(resources.cdp, sessionId, pageTimeoutMs);
    if (envelope.invalidCount !== 0 || envelope.records.length === 0) {
      throw new HarnessBlockedError('PAGE_PROBE_SCHEMA_INVALID');
    }
    const probes = normalizeProbeRecords(envelope.records);
    if (JSON.stringify(probes) !== JSON.stringify(REAL_BROWSER_EXPECTED_PROBES)) {
      throw new HarnessBlockedError('PAGE_PROBE_UNSAFE');
    }
    const counts = evidenceCounts(options.adapter, before, envelope, resources.controlSentinel);
    result = Object.freeze({
      schemaVersion: 1,
      kind: 'COMPLETED',
      browserFamily,
      probes,
      counts,
      digests: Object.freeze({
        browserExecutableDigest,
        browserRuntimeProfileDigest,
        probeResultDigest: digestProbeRecords(probes),
        tlsProfileDigest: tlsBundle.tlsProfileDigest,
      }),
      originClasses: envelope.originClasses,
      trustMode: 'DISPOSABLE_CA_SPKI',
      freshProfileRemoved: true,
    });
  } catch (error) {
    const blocker =
      error instanceof HarnessBlockedError ? error.blocker : 'HARNESS_INTERNAL_FAILURE';
    result = blockedResult(
      blocker,
      browserFamily,
      evidenceCounts(options.adapter, before, undefined, resources.controlSentinel),
    );
  }

  const cleanupSucceeded = await cleanupResources(resources);
  if (!cleanupSucceeded) {
    return blockedResult(
      'CLEANUP_FAILED',
      browserFamily,
      evidenceCounts(options.adapter, before, undefined, resources.controlSentinel),
    );
  }
  return result;
}

async function findBrowserCandidate(): Promise<BrowserCandidate | null> {
  const candidates: readonly BrowserCandidate[] =
    process.platform === 'win32'
      ? windowsBrowserCandidates()
      : process.platform === 'linux'
        ? linuxBrowserCandidates()
        : [];
  for (const candidate of candidates) {
    try {
      await access(
        candidate.executablePath,
        process.platform === 'win32' ? fsConstants.F_OK : fsConstants.X_OK,
      );
      return candidate;
    } catch {
      // Continue through the closed, ordered candidate list.
    }
  }
  return null;
}

function windowsBrowserCandidates(): readonly BrowserCandidate[] {
  const programFiles = process.env.PROGRAMFILES ?? 'C:\\Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA;
  const candidates: BrowserCandidate[] = [
    {
      family: 'CHROME',
      executablePath: join(programFiles, 'Google/Chrome/Application/chrome.exe'),
    },
    {
      family: 'CHROME',
      executablePath: join(programFilesX86, 'Google/Chrome/Application/chrome.exe'),
    },
    { family: 'EDGE', executablePath: join(programFiles, 'Microsoft/Edge/Application/msedge.exe') },
    {
      family: 'EDGE',
      executablePath: join(programFilesX86, 'Microsoft/Edge/Application/msedge.exe'),
    },
  ];
  if (localAppData !== undefined) {
    candidates.splice(2, 0, {
      family: 'CHROME',
      executablePath: join(localAppData, 'Google/Chrome/Application/chrome.exe'),
    });
  }
  return Object.freeze(candidates);
}

function linuxBrowserCandidates(): readonly BrowserCandidate[] {
  return Object.freeze([
    { family: 'CHROME', executablePath: '/usr/bin/google-chrome' },
    { family: 'CHROME', executablePath: '/usr/bin/google-chrome-stable' },
    { family: 'CHROMIUM', executablePath: '/usr/bin/chromium' },
    { family: 'CHROMIUM', executablePath: '/usr/bin/chromium-browser' },
    { family: 'CHROMIUM', executablePath: '/snap/bin/chromium' },
  ]);
}

function launchBrowser(
  candidate: BrowserCandidate,
  profilePath: string,
  canonicalHost: string,
  previewTlsPort: number,
  controlTlsPort: number,
  caSpkiSha256Base64: string,
): ChildProcess {
  const resolverRules =
    `MAP ${canonicalHost}:443 ${LOOPBACK_ADDRESS}:${previewTlsPort},` +
    `MAP ${CONTROL_TEST_HOST}:443 ${LOOPBACK_ADDRESS}:${controlTlsPort},` +
    'MAP * ~NOTFOUND,EXCLUDE localhost';
  const args = [
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    '--remote-allow-origins=http://127.0.0.1',
    `--user-data-dir=${profilePath}`,
    `--host-resolver-rules=${resolverRules}`,
    `--ignore-certificate-errors-spki-list=${caSpkiSha256Base64}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--no-proxy-server',
    '--disable-background-networking',
    '--disable-breakpad',
    '--disable-component-update',
    '--disable-crash-reporter',
    '--disable-default-apps',
    '--disable-domain-reliability',
    '--disable-extensions',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    'about:blank',
  ];
  try {
    return spawn(candidate.executablePath, args, {
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch {
    throw new HarnessBlockedError('BROWSER_LAUNCH_FAILED');
  }
}

async function waitForDevToolsEndpoint(
  profilePath: string,
  browserProcess: ChildProcess,
  timeoutMs: number,
): Promise<DevToolsEndpoint> {
  const endpointPath = join(profilePath, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (browserProcess.exitCode !== null) {
      throw new HarnessBlockedError('BROWSER_LAUNCH_FAILED');
    }
    try {
      const lines = (await readFile(endpointPath, 'utf8')).trim().split(/\r?\n/u);
      const port = Number.parseInt(lines[0] ?? '', 10);
      const browserPath = lines[1] ?? '';
      if (
        Number.isSafeInteger(port) &&
        port > 0 &&
        port <= 65_535 &&
        /^\/devtools\/browser\/[0-9a-f-]+$/u.test(browserPath)
      ) {
        return { port, browserPath };
      }
    } catch {
      // The fresh profile has not published its bounded endpoint yet.
    }
    await delay(50);
  }
  throw new HarnessBlockedError('CDP_ENDPOINT_TIMEOUT');
}

async function startTlsProxy(
  backend: LoopbackBrowserHttpServer,
  canonicalHost: string,
  material: TlsMaterial,
): Promise<LoopbackTlsProxy> {
  const sockets = new Set<DestroyableSocket>();
  let server: HttpsServer;
  try {
    server = createHttpsServer(
      {
        cert: material.certificateChainPem,
        key: material.privateKeyPem,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
      },
      (request, response) => void proxyRequest(backend, canonicalHost, request, response),
    );
  } catch {
    throw new HarnessBlockedError('TLS_PROXY_FAILED');
  }
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (): void => rejectListen(new HarnessBlockedError('TLS_PROXY_FAILED'));
    server.once('error', onError);
    server.listen(0, LOOPBACK_ADDRESS, () => {
      server.off('error', onError);
      resolveListen();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    await closeHttpsServer(server, sockets);
    throw new HarnessBlockedError('TLS_PROXY_FAILED');
  }
  return Object.freeze({
    port: address.port,
    close: () => closeHttpsServer(server, sockets),
  });
}

async function startControlSentinel(
  canonicalHost: string,
  material: TlsMaterial,
): Promise<LoopbackControlSentinel> {
  const sockets = new Set<DestroyableSocket>();
  let requests = 0;
  let server: HttpsServer;
  try {
    server = createHttpsServer(
      {
        cert: material.certificateChainPem,
        key: material.privateKeyPem,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.3',
      },
      (request, response) => {
        const tlsSocket = request.socket as unknown as ServerTlsSocket;
        if (
          !isLoopbackAddress(request.socket.remoteAddress) ||
          request.headers.host !== canonicalHost ||
          tlsSocket.encrypted !== true ||
          tlsSocket.servername !== canonicalHost
        ) {
          request.destroy();
          return;
        }
        requests += 1;
        request.resume();
        response.sendDate = false;
        response.statusCode = 404;
        response.setHeader('Content-Length', '0');
        response.end();
      },
    );
  } catch {
    throw new HarnessBlockedError('TLS_PROXY_FAILED');
  }
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('clientError', (_error, socket) => socket.destroy());
  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (): void => rejectListen(new HarnessBlockedError('TLS_PROXY_FAILED'));
    server.once('error', onError);
    server.listen(0, LOOPBACK_ADDRESS, () => {
      server.off('error', onError);
      resolveListen();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    await closeHttpsServer(server, sockets);
    throw new HarnessBlockedError('TLS_PROXY_FAILED');
  }
  return Object.freeze({
    port: address.port,
    requestCount: () => requests,
    close: () => closeHttpsServer(server, sockets),
  });
}

async function proxyRequest(
  backend: LoopbackBrowserHttpServer,
  canonicalHost: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const tlsSocket = request.socket as unknown as ServerTlsSocket;
  if (
    !isLoopbackAddress(request.socket.remoteAddress) ||
    request.headers.host !== canonicalHost ||
    tlsSocket.encrypted !== true ||
    tlsSocket.servername !== canonicalHost
  ) {
    request.destroy();
    return;
  }
  const body = await readBoundedRequestBody(request);
  if (body === null) {
    request.destroy();
    return;
  }
  let backendResponse: BrowserHttpResponse;
  try {
    backendResponse = await backend.request({
      method: request.method ?? '',
      target: request.url ?? '',
      headers: proxyHeaders(request.headers),
      body,
    });
  } catch {
    request.destroy();
    return;
  }
  response.sendDate = false;
  response.statusCode = backendResponse.status;
  for (const [name, value] of Object.entries(backendResponse.headers)) {
    response.setHeader(name, value);
  }
  response.end(backendResponse.body);
}

async function readBoundedRequestBody(request: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    received += bytes.byteLength;
    if (received > AICO007_MAX_REQUEST_BODY_BYTES) return null;
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function proxyHeaders(headers: IncomingHttpHeaders): BrowserHttpRequest['headers'] {
  const output: Record<string, string | readonly string[]> = Object.create(null) as Record<
    string,
    string | readonly string[]
  >;
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && name.toLowerCase() !== 'host') output[name] = value;
  }
  return output;
}

async function waitForPageProbes(
  cdp: CdpClient,
  sessionId: string,
  timeoutMs: number,
): Promise<PageProbeEnvelope> {
  const expression = pageProbeExpression();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const evaluation = asRecord(
        await cdp.send(
          'Runtime.evaluate',
          { expression, returnByValue: true, silent: true },
          sessionId,
        ),
      );
      const remoteResult = asRecord(evaluation.result);
      const value = parsePageEnvelope(remoteResult.value);
      if (value.ready) return value;
    } catch (error) {
      if (!(error instanceof HarnessBlockedError)) throw error;
      // Execution contexts can disappear during bootstrap location replacement.
    }
    await delay(75);
  }
  throw new HarnessBlockedError('PAGE_PROBES_TIMEOUT');
}

function pageProbeExpression(): string {
  const ids = JSON.stringify(HOSTILE_BROWSER_PROBE_IDS);
  const outcomes = JSON.stringify(REAL_BROWSER_PROBE_OUTCOMES);
  const details = JSON.stringify(REAL_BROWSER_DETAIL_CLASSES);
  return `(() => {
    const raw = globalThis.__AICO007_BROWSER_RESULTS__;
    if (!Array.isArray(raw)) return { ready: false, totalCount: 0, invalidCount: 0, records: [] };
    const ids = new Set(${ids});
    const outcomes = new Set(${outcomes});
    const details = new Set(${details});
    const counts = new Map();
    const previewHost = location.hostname;
    const previewClass = previewHost.endsWith('.preview.test') || previewHost.endsWith('.aico-preview.test')
      ? 'PREVIEW_TEST_SITE'
      : 'INVALID_ORIGIN_CLASS';
    const hasControlSite = Array.from(document.querySelectorAll('[href],[src],[action]')).some((element) => {
      const target = element.getAttribute('href') || element.getAttribute('src') || element.getAttribute('action');
      if (!target) return false;
      try { return new URL(target, location.href).hostname === '${CONTROL_TEST_HOST}'; }
      catch { return false; }
    });
    const originClasses = [previewClass, hasControlSite ? 'CONTROL_TEST_SITE' : 'INVALID_ORIGIN_CLASS'];
    let invalidCount = Math.max(0, raw.length - ${MAX_PAGE_RECORDS});
    for (const item of raw.slice(0, ${MAX_PAGE_RECORDS})) {
      const probeId = item && item.id;
      const outcome = item && item.outcome;
      const detailClass = item && item.detail;
      if (!ids.has(probeId) || !outcomes.has(outcome) || !details.has(detailClass)) {
        invalidCount += 1;
        continue;
      }
      const key = probeId + '\\u0000' + outcome + '\\u0000' + detailClass;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const records = Array.from(counts, ([key, count]) => {
      const [probeId, outcome, detailClass] = key.split('\\u0000');
      return { probeId, outcome, detailClass, count };
    });
    return {
      ready: true,
      totalCount: Math.min(raw.length, ${MAX_PAGE_RECORDS + 1}),
      invalidCount,
      records,
      originClasses,
    };
  })()`;
}

function parsePageEnvelope(value: unknown): PageProbeEnvelope {
  const envelope = asRecord(value);
  if (envelope.ready !== true) {
    return {
      ready: false,
      totalCount: 0,
      invalidCount: 0,
      records: [],
      originClasses: ['PREVIEW_TEST_SITE', 'CONTROL_TEST_SITE'],
    };
  }
  const totalCount = boundedNonNegativeInt(envelope.totalCount, MAX_PAGE_RECORDS + 1);
  const invalidCount = boundedNonNegativeInt(envelope.invalidCount, MAX_PAGE_RECORDS + 1);
  if (
    !Array.isArray(envelope.originClasses) ||
    envelope.originClasses.length !== 2 ||
    envelope.originClasses[0] !== 'PREVIEW_TEST_SITE' ||
    envelope.originClasses[1] !== 'CONTROL_TEST_SITE'
  ) {
    throw new HarnessBlockedError('PAGE_PROBE_SCHEMA_INVALID');
  }
  if (!Array.isArray(envelope.records) || envelope.records.length > MAX_PAGE_RECORDS) {
    throw new HarnessBlockedError('PAGE_PROBE_SCHEMA_INVALID');
  }
  const records = envelope.records.map((rawRecord) => {
    const record = asRecord(rawRecord);
    if (
      !isOneOf(record.probeId, HOSTILE_BROWSER_PROBE_IDS) ||
      !isOneOf(record.outcome, REAL_BROWSER_PROBE_OUTCOMES) ||
      !isOneOf(record.detailClass, REAL_BROWSER_DETAIL_CLASSES)
    ) {
      throw new HarnessBlockedError('PAGE_PROBE_SCHEMA_INVALID');
    }
    return Object.freeze({
      probeId: record.probeId,
      outcome: record.outcome,
      detailClass: record.detailClass,
      count: boundedPositiveInt(record.count, MAX_PAGE_RECORDS),
    });
  });
  return Object.freeze({
    ready: true,
    totalCount,
    invalidCount,
    records: Object.freeze(records),
    originClasses: Object.freeze(['PREVIEW_TEST_SITE', 'CONTROL_TEST_SITE'] as const),
  });
}

function normalizeProbeRecords(
  records: readonly RealBrowserProbeObservation[],
): readonly RealBrowserProbeObservation[] {
  return Object.freeze(
    records
      .map((record) => Object.freeze({ ...record }))
      .sort((left, right) =>
        [left.probeId, left.detailClass, left.outcome]
          .join('\u0000')
          .localeCompare([right.probeId, right.detailClass, right.outcome].join('\u0000')),
      ),
  );
}

function digestProbeRecords(records: readonly RealBrowserProbeObservation[]): Sha256Digest {
  return sha256Digest(
    records
      .map((record) =>
        [record.probeId, record.outcome, record.detailClass, record.count].join('\u0000'),
      )
      .join('\n'),
  );
}

function createDisposableTlsBundle(previewHost: string): DisposableTlsBundle {
  try {
    const caKeys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicExponent: 0x10001,
    });
    const caPublicKeyDer = caKeys.publicKey.export({ type: 'spki', format: 'der' });
    const signatureAlgorithm = derSequence(
      derOid('1.2.840.113549.1.1.11'),
      der(0x05, Buffer.alloc(0)),
    );
    const caName = derName('AICO-007 Disposable Test CA');
    const now = Date.now();
    const validity = derSequence(
      derUtcTime(new Date(now - 86_400_000)),
      derUtcTime(new Date(now + 2_592_000_000)),
    );
    const caTbs = derSequence(
      der(0xa0, derInteger(Buffer.from([2]))),
      derInteger(certificateSerial(caPublicKeyDer, 'ca')),
      signatureAlgorithm,
      caName,
      validity,
      caName,
      caPublicKeyDer,
      der(0xa3, certificateAuthorityExtensions()),
    );
    const caCertificateDer = derSequence(
      caTbs,
      signatureAlgorithm,
      derBitString(sign('RSA-SHA256', caTbs, caKeys.privateKey), 0),
    );
    const caCertificatePem = pem('CERTIFICATE', caCertificateDer);
    const caCertificate = new X509Certificate(caCertificatePem);
    if (!caCertificate.ca || !caCertificate.verify(caKeys.publicKey)) {
      throw new Error('disposable CA validation failed');
    }

    const preview = createCaSignedLeaf(
      previewHost,
      'preview',
      caName,
      caKeys.privateKey,
      caKeys.publicKey,
      caCertificatePem,
      validity,
      signatureAlgorithm,
    );
    const control = createCaSignedLeaf(
      CONTROL_TEST_HOST,
      'control',
      caName,
      caKeys.privateKey,
      caKeys.publicKey,
      caCertificatePem,
      validity,
      signatureAlgorithm,
    );
    return Object.freeze({
      preview: preview.material,
      control: control.material,
      caSpkiSha256Base64: createHash('sha256').update(caPublicKeyDer).digest('base64'),
      tlsProfileDigest: sha256Digest(
        Buffer.concat([caCertificateDer, preview.certificateDer, control.certificateDer]),
      ),
    });
  } catch {
    throw new HarnessBlockedError('TLS_PROXY_FAILED');
  }
}

function createCaSignedLeaf(
  canonicalHost: string,
  purpose: 'preview' | 'control',
  caName: Buffer,
  caPrivateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  caPublicKey: ReturnType<typeof generateKeyPairSync>['publicKey'],
  caCertificatePem: string,
  validity: Buffer,
  signatureAlgorithm: Buffer,
): Readonly<{ material: TlsMaterial; certificateDer: Buffer }> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  const tbs = derSequence(
    der(0xa0, derInteger(Buffer.from([2]))),
    derInteger(certificateSerial(publicKeyDer, purpose)),
    signatureAlgorithm,
    caName,
    validity,
    derName(canonicalHost),
    publicKeyDer,
    der(0xa3, leafCertificateExtensions(canonicalHost)),
  );
  const certificateDer = derSequence(
    tbs,
    signatureAlgorithm,
    derBitString(sign('RSA-SHA256', tbs, caPrivateKey), 0),
  );
  const certificatePem = pem('CERTIFICATE', certificateDer);
  const certificate = new X509Certificate(certificatePem);
  if (
    certificate.ca ||
    certificate.checkHost(canonicalHost) !== canonicalHost ||
    !certificate.verify(caPublicKey)
  ) {
    throw new Error('CA-signed leaf validation failed');
  }
  return Object.freeze({
    material: Object.freeze({
      certificateChainPem: certificatePem + caCertificatePem,
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    }),
    certificateDer,
  });
}

function certificateSerial(publicKeyDer: Buffer, purpose: string): Buffer {
  const serial = Buffer.from(
    createHash('sha256').update(publicKeyDer).update(purpose, 'ascii').digest().subarray(0, 16),
  );
  serial[0] = (serial[0] ?? 0) & 0x7f;
  return serial;
}

function certificateAuthorityExtensions(): Buffer {
  const basicConstraints = derExtension(
    '2.5.29.19',
    derSequence(der(0x01, Buffer.from([0xff]))),
    true,
  );
  const keyUsage = derExtension('2.5.29.15', derBitString(Buffer.from([0x06]), 1), true);
  return derSequence(basicConstraints, keyUsage);
}

function leafCertificateExtensions(canonicalHost: string): Buffer {
  const basicConstraints = derExtension('2.5.29.19', derSequence(), true);
  const keyUsage = derExtension('2.5.29.15', derBitString(Buffer.from([0xa0]), 5), true);
  const extendedKeyUsage = derExtension(
    '2.5.29.37',
    derSequence(derOid('1.3.6.1.5.5.7.3.1')),
    false,
  );
  const subjectAltName = derExtension(
    '2.5.29.17',
    derSequence(der(0x82, Buffer.from(canonicalHost, 'ascii'))),
    false,
  );
  return derSequence(basicConstraints, keyUsage, extendedKeyUsage, subjectAltName);
}

function derExtension(oid: string, value: Buffer, critical: boolean): Buffer {
  return derSequence(
    derOid(oid),
    ...(critical ? [der(0x01, Buffer.from([0xff]))] : []),
    der(0x04, value),
  );
}

function derName(commonName: string): Buffer {
  return derSequence(
    der(0x31, derSequence(derOid('2.5.4.3'), der(0x0c, Buffer.from(commonName, 'utf8')))),
  );
}

function derUtcTime(value: Date): Buffer {
  const year = value.getUTCFullYear();
  if (year < 1950 || year > 2049) throw new Error('UTCTime year out of range');
  const text =
    year.toString().slice(-2) +
    twoDigits(value.getUTCMonth() + 1) +
    twoDigits(value.getUTCDate()) +
    twoDigits(value.getUTCHours()) +
    twoDigits(value.getUTCMinutes()) +
    twoDigits(value.getUTCSeconds()) +
    'Z';
  return der(0x17, Buffer.from(text, 'ascii'));
}

function twoDigits(value: number): string {
  return value.toString(10).padStart(2, '0');
}

function derSequence(...parts: readonly Buffer[]): Buffer {
  return der(0x30, Buffer.concat(parts));
}

function derInteger(bytes: Buffer): Buffer {
  let firstNonZero = 0;
  while (firstNonZero < bytes.length - 1 && bytes[firstNonZero] === 0) firstNonZero += 1;
  let value = bytes.subarray(firstNonZero);
  if (value.length === 0) value = Buffer.from([0]);
  if (((value[0] ?? 0) & 0x80) !== 0) value = Buffer.concat([Buffer.from([0]), value]);
  return der(0x02, value);
}

function derBitString(bytes: Buffer, unusedBits: number): Buffer {
  return der(0x03, Buffer.concat([Buffer.from([unusedBits]), bytes]));
}

function derOid(value: string): Buffer {
  const parts = value.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    throw new Error('invalid OID');
  }
  const encoded = [40 * (parts[0] ?? 0) + (parts[1] ?? 0)];
  for (const part of parts.slice(2)) {
    const bytes = [part & 0x7f];
    let remainder = part >>> 7;
    while (remainder > 0) {
      bytes.unshift((remainder & 0x7f) | 0x80);
      remainder >>>= 7;
    }
    encoded.push(...bytes);
  }
  return der(0x06, Buffer.from(encoded));
}

function der(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(value.length), value]);
}

function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function pem(label: string, bytes: Buffer): string {
  const body = bytes
    .toString('base64')
    .match(/.{1,64}/gu)
    ?.join('\n');
  if (body === undefined) throw new Error('PEM encoding failed');
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

async function cleanupResources(resources: BrowserResources): Promise<boolean> {
  let succeeded = true;
  if (resources.cdp !== null && resources.browserProcess !== null) {
    try {
      await resources.cdp.send('Browser.close');
    } catch {
      // Process termination below remains mandatory.
    }
    resources.cdp.close();
  }
  if (resources.browserProcess !== null) {
    succeeded = (await terminateBrowser(resources.browserProcess)) && succeeded;
  }
  if (resources.tlsProxy !== null) {
    try {
      await resources.tlsProxy.close();
    } catch {
      succeeded = false;
    }
  }
  if (resources.controlSentinel !== null) {
    try {
      await resources.controlSentinel.close();
    } catch {
      succeeded = false;
    }
  }
  if (resources.backend !== null) {
    try {
      await resources.backend.close();
    } catch {
      succeeded = false;
    }
  }
  if (resources.profilePath !== null) {
    succeeded = (await removeProfile(resources.profilePath)) && succeeded;
  }
  return succeeded;
}

async function terminateBrowser(browserProcess: ChildProcess): Promise<boolean> {
  if (await waitForProcessExit(browserProcess, 2_000)) return true;
  browserProcess.kill('SIGTERM');
  if (await waitForProcessExit(browserProcess, 2_000)) return true;
  browserProcess.kill('SIGKILL');
  return waitForProcessExit(browserProcess, 2_000);
}

function waitForProcessExit(browserProcess: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (browserProcess.exitCode !== null || browserProcess.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolveExit) => {
    const complete = (value: boolean): void => {
      clearTimeout(timer);
      browserProcess.off('exit', onExit);
      browserProcess.off('error', onError);
      resolveExit(value);
    };
    const onExit = (): void => complete(true);
    const onError = (): void => complete(false);
    const timer = setTimeout(() => complete(false), timeoutMs);
    browserProcess.once('exit', onExit);
    browserProcess.once('error', onError);
  });
}

async function removeProfile(profilePath: string): Promise<boolean> {
  const resolvedProfile = resolve(profilePath);
  const resolvedTemp = resolve(tmpdir());
  if (
    !isAbsolute(resolvedProfile) ||
    !resolvedProfile.startsWith(`${resolvedTemp}${sep}`) ||
    !basename(resolvedProfile).startsWith(PROFILE_PREFIX)
  ) {
    return false;
  }
  try {
    await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 75 });
    return true;
  } catch {
    return false;
  }
}

function closeHttpsServer(server: HttpsServer, sockets: Set<DestroyableSocket>): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.closeAllConnections();
    for (const socket of sockets) socket.destroy();
    if (!server.listening) {
      resolveClose();
      return;
    }
    server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
  });
}

function evidenceCounts(
  adapter: DeterministicBrowserHttpAdapter,
  before: ReturnType<DeterministicBrowserHttpAdapter['snapshotEvidence']>['totals'],
  page: PageProbeEnvelope = {
    ready: false,
    totalCount: 0,
    invalidCount: 0,
    records: [],
    originClasses: ['PREVIEW_TEST_SITE', 'CONTROL_TEST_SITE'],
  },
  controlSentinel: LoopbackControlSentinel | null = null,
): RealBrowserHarnessCounts {
  const after = adapter.snapshotEvidence().totals;
  return Object.freeze({
    pageRecords: page.records.reduce((sum, record) => sum + record.count, 0),
    invalidPageRecords: page.invalidCount,
    httpRequests: nonNegativeDelta(after.requests, before.requests),
    authorizationCalls: nonNegativeDelta(after.authorizationCalls, before.authorizationCalls),
    exchangeCalls: nonNegativeDelta(after.exchangeCalls, before.exchangeCalls),
    privateControlEffects: nonNegativeDelta(
      after.privateControlEffects,
      before.privateControlEffects,
    ),
    controlSiteRequests: controlSentinel?.requestCount() ?? 0,
  });
}

function blockedResult(
  blocker: RealBrowserBlocker,
  browserFamily: RealBrowserFamily | null,
  counts: RealBrowserHarnessCounts,
): RealBrowserHarnessResult {
  return Object.freeze({ schemaVersion: 1, kind: 'BLOCKED', blocker, browserFamily, counts });
}

function classifyNavigationError(errorText: string): RealBrowserBlocker {
  if (errorText.startsWith('net::ERR_CERT_')) return 'TLS_CERTIFICATE_REJECTED';
  if (errorText === 'net::ERR_NAME_NOT_RESOLVED') return 'HOST_MAPPING_FAILED';
  if (errorText === 'net::ERR_CONNECTION_REFUSED') return 'TLS_PROXY_UNREACHABLE';
  return 'NAVIGATION_FAILED';
}

function validateHarnessHost(value: string): void {
  if (
    !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(value) ||
    value === CONTROL_TEST_HOST ||
    (!value.endsWith('.preview.test') && !value.endsWith('.aico-preview.test'))
  ) {
    throw new HarnessBlockedError('HOST_MAPPING_UNSUPPORTED');
  }
}

async function fileSha256(path: string): Promise<Sha256Digest> {
  try {
    const digest = createHash('sha256');
    const source = createReadStream(path);
    for await (const chunk of source) digest.update(chunk as Buffer);
    return `sha256:${digest.digest('hex')}`;
  } catch {
    throw new HarnessBlockedError('BROWSER_DIGEST_FAILED');
  }
}

function runtimeProfileDigest(family: RealBrowserFamily): Sha256Digest {
  return sha256Digest(
    JSON.stringify({
      schema: 'aico007-real-browser-runtime/v1',
      family,
      execution: 'HEADLESS_NEW',
      debugging: 'LOOPBACK_EPHEMERAL',
      profile: 'FRESH_TEMP',
      trust: 'DISPOSABLE_CA_SPKI',
      previewMapping: 'PREVIEW_TEST_SITE_443_TO_LOOPBACK',
      controlMapping: 'CONTROL_TEST_SITE_443_TO_LOOPBACK',
      otherDns: 'NOTFOUND',
      proxy: 'NONE',
      sandbox: 'OS_DEFAULT',
    }),
  );
}

function sha256Digest(value: string | Buffer): Sha256Digest {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function validateCapability(value: string): void {
  if (
    value.length < 1 ||
    Buffer.byteLength(value, 'utf8') > AICO007_MAX_REQUEST_BODY_BYTES ||
    !/^[A-Za-z0-9._~-]+$/u.test(value)
  ) {
    throw new HarnessBlockedError('INPUT_REJECTED');
  }
}

function boundedTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    throw new HarnessBlockedError('INPUT_REJECTED');
  }
  return value;
}

function parsePageCount(value: unknown, maximum: number, positive: boolean): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < (positive ? 1 : 0) ||
    (value as number) > maximum
  ) {
    throw new HarnessBlockedError('PAGE_PROBE_SCHEMA_INVALID');
  }
  return value as number;
}

function boundedNonNegativeInt(value: unknown, maximum: number): number {
  return parsePageCount(value, maximum, false);
}

function boundedPositiveInt(value: unknown, maximum: number): number {
  return parsePageCount(value, maximum, true);
}

function nonNegativeDelta(after: number, before: number): number {
  const delta = after - before;
  return Number.isSafeInteger(delta) && delta >= 0 ? delta : 0;
}

function requiredSafeString(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9A-Za-z-]{1,128}$/u.test(value)) {
    throw new HarnessBlockedError('CDP_PROTOCOL_FAILED');
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HarnessBlockedError('CDP_PROTOCOL_FAILED');
  }
  return value as Record<string, unknown>;
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === 'string' && allowed.some((candidate) => candidate === value);
}

function isLoopbackAddress(value: string | undefined): boolean {
  return value === LOOPBACK_ADDRESS || value === `::ffff:${LOOPBACK_ADDRESS}`;
}
