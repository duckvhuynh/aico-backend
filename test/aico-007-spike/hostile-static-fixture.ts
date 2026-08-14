import { createHash } from 'node:crypto';

export const HOSTILE_CONTROL_CANARY = 'AICO007_PRIVATE_CONTROL_CANARY_7e23d91a';

export const HOSTILE_BROWSER_PROBE_IDS = Object.freeze([
  'ORIGIN_HOST',
  'CSP',
  'HEADERS',
  'CACHE',
  'MIME',
  'PATH',
  'NAVIGATION',
  'OPENER',
  'REFERRER',
  'DOWNLOAD',
  'COOKIE',
  'STORAGE',
  'SERVICE_WORKER',
  'PRIVATE_CONTROL_REQUEST',
] as const);

export type HostileBrowserProbeId = (typeof HOSTILE_BROWSER_PROBE_IDS)[number];

export interface HostileFixtureAsset {
  readonly path: string;
  readonly mediaType:
    | 'application/javascript'
    | 'application/json'
    | 'image/svg+xml'
    | 'text/css'
    | 'text/html';
  readonly body: Buffer;
  readonly sha256: `sha256:${string}`;
}

export interface HostileStaticFixture {
  readonly schemaVersion: 1;
  readonly fixtureId: 'aico-007-hostile-static/v1';
  readonly documentPath: '/index.html';
  readonly scriptPath: '/assets/hostile.js';
  readonly assets: Readonly<Record<string, HostileFixtureAsset>>;
  readonly manifestDigest: `sha256:${string}`;
  readonly probeIds: readonly HostileBrowserProbeId[];
}

const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AICO-007 hostile static fixture</title>
  <link rel="stylesheet" href="/assets/fixture.css">
</head>
<body>
  <main id="aico-proof-root">
    <h1>Untrusted preview</h1>
    <p id="aico-proof-status">browser probes pending</p>
    <pre id="aico-proof-results" aria-live="polite"></pre>

    <a id="aico-probe-navigation" data-aico-probe="NAVIGATION"
       href="https://control.aico-control.test/private">leave preview</a>
    <a id="aico-probe-opener" data-aico-probe="OPENER" target="_blank"
       href="https://control.aico-control.test/private">attempt popup</a>
    <a id="aico-probe-download" data-aico-probe="DOWNLOAD" download="proof.css"
       href="/assets/fixture.css">attempt download</a>
    <form id="aico-probe-form" data-aico-probe="PRIVATE_CONTROL_REQUEST"
          action="https://control.aico-control.test/private" method="post">
      <input name="canary" value="${HOSTILE_CONTROL_CANARY}">
      <button type="submit">attempt private control form</button>
    </form>
    <iframe id="aico-probe-frame" data-aico-probe="PRIVATE_CONTROL_REQUEST"
            title="blocked private control frame"
            src="https://control.aico-control.test/private"></iframe>
    <script>window.__AICO007_INLINE_EXECUTED__ = true;</script>
    <script data-aico-probe="MIME" src="/assets/mime-canary.json"></script>
    <script src="/assets/hostile.js"></script>
  </main>
</body>
</html>
`;

const FIXTURE_CSS = `:root { color-scheme: light; font-family: system-ui, sans-serif; }
body { margin: 2rem; }
#aico-proof-results { white-space: pre-wrap; }
iframe, form, a { display: block; margin-block: 0.5rem; }
`;

const PIXEL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"><rect width="1" height="1" fill="#334155"/></svg>`;

const MIME_CANARY = JSON.stringify({
  fixture: 'aico-007-hostile-static/v1',
  executed: false,
});

const HOSTILE_SCRIPT = `(() => {
  'use strict';

  const results = [];
  const record = (id, outcome, detail) => {
    results.push(Object.freeze({ id, outcome, detail }));
  };
  const settle = (promise, id, successDetail, blockedDetail) =>
    Promise.resolve(promise).then(
      () => record(id, 'AVAILABLE', successDetail),
      () => record(id, 'BLOCKED', blockedDetail),
    );
  const settleHttp = (promise, id, successDetail, blockedDetail) =>
    Promise.resolve(promise).then(
      (response) => record(id, response.ok ? 'AVAILABLE' : 'BLOCKED',
        response.ok ? successDetail : blockedDetail),
      () => record(id, 'BLOCKED', blockedDetail),
    );

  record('ORIGIN_HOST', location.origin.startsWith('https://') ? 'ORIGIN_LOCAL' : 'BLOCKED',
    location.origin.startsWith('https://') ? 'isolated-https-origin' : 'unexpected-origin');
  record('CSP', window.__AICO007_INLINE_EXECUTED__ === true ? 'AVAILABLE' : 'BLOCKED',
    window.__AICO007_INLINE_EXECUTED__ === true ? 'inline-script-ran' : 'inline-script-did-not-run');
  record('OPENER', window.opener === null ? 'BLOCKED' : 'AVAILABLE',
    window.opener === null ? 'opener-is-null' : 'opener-present');
  record('REFERRER', document.referrer === '' ? 'BLOCKED' : 'AVAILABLE',
    document.referrer === '' ? 'referrer-empty' : 'referrer-present');

  try {
    document.cookie = 'AICO007_PARENT_TOSS=attacker; Domain=.preview.test; Path=/';
    record('COOKIE', document.cookie.includes('__Host-aico_preview=') ? 'AVAILABLE' : 'BLOCKED',
      document.cookie.includes('__Host-aico_preview=') ? 'platform-cookie-visible' : 'platform-cookie-hidden');
  } catch {
    record('COOKIE', 'BLOCKED', 'cookie-write-rejected');
  }

  for (const [name, storage] of [['localStorage', window.localStorage], ['sessionStorage', window.sessionStorage]]) {
    try {
      storage.setItem('aico007-origin-canary', name);
      record('STORAGE', 'ORIGIN_LOCAL', name + '-available-only-to-this-origin');
    } catch {
      record('STORAGE', 'BLOCKED', name + '-unavailable');
    }
  }

  const asyncProbes = [];
  if ('indexedDB' in window) {
    asyncProbes.push(new Promise((resolve) => {
      const open = indexedDB.open('aico007-origin-db', 1);
      open.onerror = () => {
        record('STORAGE', 'BLOCKED', 'indexeddb-unavailable');
        resolve();
      };
      open.onsuccess = () => {
        open.result.close();
        indexedDB.deleteDatabase('aico007-origin-db');
        record('STORAGE', 'ORIGIN_LOCAL', 'indexeddb-available-only-to-this-origin');
        resolve();
      };
    }));
  }
  if ('caches' in window) {
    asyncProbes.push(caches.open('aico007-origin-cache').then(
      () => caches.delete('aico007-origin-cache').then(() => {
        record('STORAGE', 'ORIGIN_LOCAL', 'cache-storage-available-only-to-this-origin');
      }),
      () => record('STORAGE', 'BLOCKED', 'cache-storage-unavailable'),
    ));
  }
  if ('serviceWorker' in navigator) {
    asyncProbes.push(settle(
      navigator.serviceWorker.register('/sw.js'),
      'SERVICE_WORKER',
      'registration-unexpectedly-succeeded',
      'registration-rejected',
    ));
  } else {
    record('SERVICE_WORKER', 'BLOCKED', 'api-unavailable');
  }

  asyncProbes.push(settleHttp(
    fetch('/__aico/private-control-probe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'text/plain' },
      body: '${HOSTILE_CONTROL_CANARY}',
    }),
    'PRIVATE_CONTROL_REQUEST',
    'same-origin-request-unexpectedly-resolved',
    'same-origin-request-blocked',
  ));
  asyncProbes.push(settleHttp(
    fetch('https://control.aico-control.test/private?canary=${HOSTILE_CONTROL_CANARY}', {
      method: 'POST',
      credentials: 'include',
      body: '${HOSTILE_CONTROL_CANARY}',
    }),
    'PRIVATE_CONTROL_REQUEST',
    'cross-origin-request-unexpectedly-resolved',
    'cross-origin-request-blocked',
  ));
  asyncProbes.push(settleHttp(
    fetch('/assets/%2e%2e/__aico/private-control-probe'),
    'PATH',
    'encoded-path-unexpectedly-resolved',
    'encoded-path-blocked',
  ));

  try {
    const popup = window.open('https://control.aico-control.test/private', '_blank');
    record('NAVIGATION', popup === null ? 'BLOCKED' : 'AVAILABLE',
      popup === null ? 'popup-blocked' : 'popup-opened');
    if (popup !== null) popup.close();
  } catch {
    record('NAVIGATION', 'BLOCKED', 'popup-threw');
  }

  Promise.allSettled(asyncProbes).then(() => {
    const frozen = Object.freeze(results.slice());
    Object.defineProperty(window, '__AICO007_BROWSER_RESULTS__', {
      configurable: false,
      enumerable: false,
      value: frozen,
      writable: false,
    });
    const output = document.getElementById('aico-proof-results');
    if (output) output.textContent = JSON.stringify(frozen);
    const status = document.getElementById('aico-proof-status');
    if (status) status.textContent = 'browser probes complete';
    window.dispatchEvent(new CustomEvent('aico007:browser-probes-complete', {
      detail: { count: frozen.length },
    }));
  });
})();
`;

const FIXTURE_ASSET_INPUTS = Object.freeze([
  { path: '/', mediaType: 'text/html', body: INDEX_HTML },
  { path: '/index.html', mediaType: 'text/html', body: INDEX_HTML },
  { path: '/assets/hostile.js', mediaType: 'application/javascript', body: HOSTILE_SCRIPT },
  { path: '/assets/fixture.css', mediaType: 'text/css', body: FIXTURE_CSS },
  { path: '/assets/pixel.svg', mediaType: 'image/svg+xml', body: PIXEL_SVG },
  { path: '/assets/mime-canary.json', mediaType: 'application/json', body: MIME_CANARY },
] as const);

function digest(bytes: Buffer | string): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function buildFixture(): HostileStaticFixture {
  const assets: Record<string, HostileFixtureAsset> = Object.create(null) as Record<
    string,
    HostileFixtureAsset
  >;
  const manifestLines: string[] = [];

  for (const input of FIXTURE_ASSET_INPUTS) {
    const body = Buffer.from(input.body, 'utf8');
    const sha256 = digest(body);
    const asset: HostileFixtureAsset = Object.freeze({
      path: input.path,
      mediaType: input.mediaType,
      body,
      sha256,
    });
    assets[input.path] = asset;
    manifestLines.push(
      [input.path, input.mediaType, body.byteLength.toString(10), sha256].join('\u0000'),
    );
  }

  return Object.freeze({
    schemaVersion: 1,
    fixtureId: 'aico-007-hostile-static/v1',
    documentPath: '/index.html',
    scriptPath: '/assets/hostile.js',
    assets: Object.freeze(assets),
    manifestDigest: digest(`${manifestLines.sort().join('\n')}\n`),
    probeIds: HOSTILE_BROWSER_PROBE_IDS,
  });
}

export function createHostileStaticFixture(): HostileStaticFixture {
  return buildFixture();
}

export const HOSTILE_STATIC_FIXTURE = createHostileStaticFixture();
