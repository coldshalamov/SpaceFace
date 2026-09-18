// Single source of truth for the SpaceFace static game server.
//
// Both launchers MUST build their HTTP server from this module:
//   - `server.js`            (browser dev server, ESM, default port 8123)
//   - `electron/main.cjs`    (desktop shell, CJS, fixed port 41788)
//
// This file exists because the two launchers previously duplicated the MIME table,
// dev-freshness logic, and static-serving core by copy-paste — and they drifted
// (added asset types in one but not the other → silent 404s / broken releases).
// Now there is ONE place to add an asset type, ONE freshness function, ONE
// containment check. `npm run check:launch-policy` enforces that both launchers
// wire this module and that the policy-relevant behavior lives here.
//
// CJS (not ESM) deliberately: Electron's main process is CJS and loads before
// the app is ready, so it cannot `import` an ESM module. The browser `server.js`
// is ESM but loads this via `createRequire(import.meta.url)` — which works in Node.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { resolveStaticCacheHeaders } = require('./staticCachePolicy.cjs');
const { attachPlayerStore } = require('./playerSaveStore.cjs');
const { buildUserContentScript } = require('./userContentStore.cjs');
// Launch-policy contract: mutable documents keep this exact header token.
const MUTABLE_DOCUMENT_CACHE = { 'Cache-Control': 'no-cache' };

// MIME types — ONE table for browser + Electron + every asset the game ships.
// If you add a new asset format (texture, font, model), add it HERE only.
const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.ktx2': 'image/ktx2',
  '.glb':  'model/gltf-binary',
  '.gltf': 'model/gltf+json; charset=utf-8',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.map':  'application/json; charset=utf-8',
});

// Dev-source freshness watch roots (used by /__dev_freshness for manual diagnostics).
// Watching source/UI roots only — never scan large asset/build dirs.
const DEV_FRESHNESS_ROOTS = Object.freeze(['index.html', 'src', 'styles']);

function maxMtimeMsSync(file) {
  const s = fs.statSync(file);
  if (!s.isDirectory()) return s.mtimeMs;
  let max = s.mtimeMs;
  for (const entry of fs.readdirSync(file, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'build' || entry.name === 'dist') continue;
    max = Math.max(max, maxMtimeMsSync(path.join(file, entry.name)));
  }
  return max;
}

async function maxMtimeMsAsync(file) {
  const s = await fsp.stat(file);
  if (!s.isDirectory()) return s.mtimeMs;
  let max = s.mtimeMs;
  for (const entry of await fsp.readdir(file, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'build' || entry.name === 'dist') continue;
    max = Math.max(max, await maxMtimeMsAsync(path.join(file, entry.name)));
  }
  return max;
}

// Build a fresh `/__dev_freshness` payload. `version` is the rounded max mtime of the
// watch roots — clients compare it to detect that source has changed on disk.
function makeFreshnessTracker(root, { async = true } = {}) {
  let cache = { checkedAt: 0, version: '' };
  return async function devFreshnessPayload() {
    const now = Date.now();
    if (cache.version && now - cache.checkedAt < 750) return { dev: true, version: cache.version };
    let max = 0;
    for (const rel of DEV_FRESHNESS_ROOTS) {
      try {
        max = Math.max(max, async ? await maxMtimeMsAsync(path.join(root, rel)) : maxMtimeMsSync(path.join(root, rel)));
      } catch { /* root may not exist yet */ }
    }
    cache = { checkedAt: now, version: String(Math.round(max)) };
    return { dev: true, version: cache.version };
  };
}

function isInsideRoot(file, resolvedRoot) {
  const resolved = path.resolve(file);
  const rel = path.relative(resolvedRoot, resolved);
  if (rel === '') return true;
  // Other-drive Windows paths come back absolute; parent escapes start with `..`.
  if (path.isAbsolute(rel)) return false;
  return rel !== '..' && !rel.startsWith(`..${path.sep}`);
}

function isAllowedLoopbackHost(hostHeader) {
  const raw = String(hostHeader || '').trim().toLowerCase();
  if (!raw) return false;
  let host = raw;
  if (host.startsWith('[')) {
    const close = host.indexOf(']');
    if (close < 0) return false;
    host = host.slice(1, close);
  } else {
    const colon = host.lastIndexOf(':');
    if (colon > -1 && host.indexOf(':') === colon) host = host.slice(0, colon);
  }
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function decodeRequestPath(url) {
  try {
    const decoded = decodeURIComponent(String(url || '/').split('?')[0]);
    if (decoded.includes('\0')) return null;
    return decoded;
  } catch {
    return null;
  }
}

function resolveContainedFile(root, decodedPath) {
  let urlPath = String(decodedPath || '/').replace(/\\/g, '/');
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const normalized = path.posix.normalize(urlPath);
  if (normalized === '..' || normalized.startsWith('../')) return null;
  const relative = normalized.replace(/^\/+/, '');
  if (!relative) return path.join(root, 'index.html');
  const first = relative.split('/')[0];
  // A drive-shaped first segment (`C:` / `C:/Windows`) makes path.resolve retarget the volume.
  if (/^[a-zA-Z]:/.test(first)) return null;
  const file = path.join(root, relative);
  if (!isInsideRoot(file, root)) return null;
  return file;
}

// Synthesized receipt for a dev/worktree serve where build/web/spaceface-release-build.json
// does not exist. Mirrors the electron/releaseIdentity.cjs precedence — SPACEFACE_BUILD_HASH,
// then the served root's git HEAD — so the version fine print resolves the same identity a
// packaged app would. No git or no hash → an empty `output`, exactly what a packaged build
// without a digest serves, and the menu falls back to the compiled version.
const devReleaseReceiptCache = new Map(); // root -> receipt object
function devReleaseReceipt(root) {
  let receipt = devReleaseReceiptCache.get(root);
  if (receipt) return receipt;
  receipt = { schema: 'spaceface.releaseBuild.dev.v1', dev: true, output: {} };
  const envHash = String(process.env.SPACEFACE_BUILD_HASH || '').trim().toLowerCase();
  if (/^[0-9a-f]{16,64}$/.test(envHash)) {
    receipt.output.digest = envHash;
  } else {
    try {
      const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
      }).trim().toLowerCase();
      if (/^[0-9a-f]{40}$/.test(sha)) receipt.output.digest = sha;
    } catch { /* not a checkout — serve the empty dev receipt */ }
  }
  devReleaseReceiptCache.set(root, receipt);
  return receipt;
}

function isAllowedStateChangingRequest(req) {
  const headers = req && req.headers ? req.headers : {};
  const fetchSite = String(headers['sec-fetch-site'] || '')
    .split(',')
    .some((value) => value.trim().toLowerCase() === 'cross-site');
  if (fetchSite) return false;

  // Non-browser capture clients do not send Origin. A present Origin must be an
  // exact HTTP origin for the request's loopback Host; `null` is never trusted.
  if (headers.origin == null) return true;
  if (Array.isArray(headers.origin)) return false;
  const origin = String(headers.origin).trim();
  if (!origin || origin.toLowerCase() === 'null') return false;

  const host = String(headers.host || '').trim();
  if (!isAllowedLoopbackHost(host)) return false;
  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== 'http:' || originUrl.username || originUrl.password ||
        originUrl.pathname !== '/' || originUrl.search || originUrl.hash) return false;
    const requestOrigin = new URL(`http://${host}`).origin;
    return originUrl.origin === requestOrigin;
  } catch {
    return false;
  }
}

/**
 * Create the canonical SpaceFace static game server.
 *
 * @param {object} opts
 * @param {string} opts.root            Absolute filesystem root to serve.
 * @param {boolean} [opts.async=true]   Use async filesystem metadata reads (required by Electron).
 * @param {Array}  [opts.extraRoutes]   Extra route handlers: [{ test(req), stateChanging?, handle(req, res, ctx) }].
 *                                      State-changing routes opt into the request-origin policy.
 *                                      Used by the browser server for /__shot, etc.
 * @param {string} [opts.playerStoreDir] Shared Browser/Electron save directory. Omitted in tests
 *                                      and isolated evidence so player slots stay untouched.
 * @param {string} [opts.userContentDir] Mounted user content ("mods") directory (PQ-172.00).
 *                                      When set, each index.html serve carries the scanned mod
 *                                      payload inline so src/data merges it at module-eval time.
 *                                      Omitted → the game boots with no mods mounted.
 * @returns {http.Server}               An http.Server (not yet listening).
 */
function createGameServer(opts) {
  const root = path.resolve(opts.root);
  const useAsync = opts.async !== false;
  const extraRoutes = attachPlayerStore(opts);
  const userContentDir = opts.userContentDir ? path.resolve(opts.userContentDir) : null;
  const staticHeaders = Object.freeze({ ...(opts.staticHeaders || {}) });
  const staticHeadersByPath = Object.fromEntries(Object.entries(opts.staticHeadersByPath || {})
    .map(([key, headers]) => [String(key).replace(/\\/g, '/').replace(/^\//, ''), Object.freeze({ ...headers })]));
  const devDiagnostics = opts.devDiagnostics !== false;
  const devFreshnessPayload = makeFreshnessTracker(root, { async: useAsync });

  const server = http.createServer(async (req, res) => {
    try {
      const method = req.method || 'GET';
      const url = req.url || '/';

      // DNS-rebinding defense for the loopback save store and source tree.
      if (!isAllowedLoopbackHost(req.headers && req.headers.host)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      // Malformed percent-encoding is a bad request, not an internal error. A 500 here
      // leaked `URI malformed` (and any later throw message) through the outer catch.
      const decodedPath = decodeRequestPath(url);
      if (decodedPath == null) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('400 Bad Request');
        return;
      }

      // Extra routes first (e.g. browser /__shot screenshot sink).
      for (const route of extraRoutes) {
        if (route.test && route.test(method, url)) {
          if (route.stateChanging && !isAllowedStateChangingRequest(req)) {
            req.resume();
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
          }
          return await route.handle(req, res, { root });
        }
      }

      // Minimal shell liveness probe. This deliberately carries no build, source, or gameplay
      // state: Electron uses it only to distinguish another SpaceFace instance from an unrelated
      // process that owns the stable save-origin port.
      if (method === 'GET' && url.startsWith('/__spaceface_health')) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ app: 'SpaceFace', route: '/' }));
        return;
      }

      // Dev freshness diagnostics are available to the source server only. A packaged build must
      // not disclose source-tree timestamps or carry a dev reload surface.
      if (devDiagnostics && method === 'GET' && url.startsWith('/__dev_freshness')) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(await devFreshnessPayload()));
        return;
      }

      // Static file serving. URL paths are POSIX; Windows must not treat `\` or `C:` as roots.
      let file = resolveContainedFile(root, decodedPath);
      if (!file) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Forbidden'); return; }

      // Packaged builds place the release receipt at the app root; a dev tree keeps it under
      // build/web/. Serve the generated bytes at the packaged URL so the version label and any
      // receipt consumers resolve one path on both hosts.
      if (decodedPath === '/spaceface-release-build.json') {
        let resolvedReceipt = false;
        const packaged = resolveContainedFile(root, '/build/web/spaceface-release-build.json');
        if (packaged) {
          try {
            const packagedStats = useAsync ? await fsp.stat(packaged) : fs.statSync(packaged);
            if (packagedStats.isFile()) { file = packaged; resolvedReceipt = true; }
          } catch { /* fall through to the root path */ }
        }
        if (!resolvedReceipt) {
          try { resolvedReceipt = (useAsync ? await fsp.stat(file) : fs.statSync(file)).isFile(); } catch { /* absent */ }
        }
        // The menu asks for this receipt on every boot. A dev/worktree serve has no packaged
        // file, and a bare 404 is a console error on a first-class URL — answer with the dev
        // identity instead. Order matches electron/releaseIdentity.cjs: SPACEFACE_BUILD_HASH,
        // then git HEAD for the served root, then no build claim.
        if (!resolvedReceipt) {
          const body = JSON.stringify(devReleaseReceipt(root));
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
          res.end(body);
          return;
        }
      }

      let stats;
      try { stats = useAsync ? await fsp.stat(file) : fs.statSync(file); }
      catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found'); return; }

      if (stats.isDirectory()) {
        file = path.join(file, 'index.html');
        if (!isInsideRoot(file, root)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Forbidden'); return; }
        try { stats = useAsync ? await fsp.stat(file) : fs.statSync(file); }
        catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found'); return; }
      }
      if (!isInsideRoot(file, root)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('Forbidden'); return; }

      const relativePath = path.relative(root, file).split(path.sep).join('/');
      const requestHeaders = req.headers || {};

      // User content ("mods") injection — PQ-172.00. index.html is served with the scanned mod
      // payload inline as a synchronous classic script ahead of the module graph, because data
      // modules and their consumers snapshot definitions during ES module evaluation — a runtime
      // fetch would arrive after every consumer froze its view. The payload is user-installed
      // state, not file state, so this serve bypasses the mtime etag/304 path (a dropped mod must
      // take effect on the next reload even when index.html itself is unchanged).
      if (userContentDir && relativePath === 'index.html') {
        let html;
        try {
          html = useAsync ? await fsp.readFile(file, 'utf8') : fs.readFileSync(file, 'utf8');
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        const script = `<script>${buildUserContentScript(userContentDir)}</script>`;
        const moduleTag = html.search(/<script\s+type=["']?module/i);
        html = moduleTag >= 0
          ? html.slice(0, moduleTag) + script + '\n    ' + html.slice(moduleTag)
          : html.replace(/<\/head>/i, `    ${script}\n  </head>`);
        const body = Buffer.from(html, 'utf8');
        res.writeHead(200, {
          ...staticHeaders,
          ...(staticHeadersByPath[relativePath] || {}),
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Length': body.length,
        });
        res.end(body);
        return;
      }

      const cache = resolveStaticCacheHeaders(relativePath, stats, requestHeaders);
      const headers = {
        ...staticHeaders,
        ...(staticHeadersByPath[relativePath] || {}),
        ...cache.headers,
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      };
      if (cache.notModified) {
        res.writeHead(304, headers);
        res.end();
        return;
      }
      headers['Content-Length'] = stats.size;
      res.writeHead(200, headers);
      // GLBs routinely carry tens of megabytes of embedded KTX2 data. A whole-file read stages a
      // second copy in the server heap and, in packaged Electron, synchronously blocks the main
      // process while ASAR materializes it. Stream the identical bytes so transport can overlap
      // decode and neither launcher creates an avoidable admission/GC spike.
      fs.createReadStream(file).on('error', (error) => res.destroy(error)).pipe(res);
    } catch (err) {
      const badUrl = err instanceof URIError || (err && err.code === 'ERR_UNESCAPED_CHARACTERS');
      try {
        res.writeHead(badUrl ? 400 : 500, { 'Content-Type': 'text/plain' });
        res.end(badUrl ? '400 Bad Request' : '500');
      } catch { /* response already sent */ }
    }
  });

  return server;
}

module.exports = {
  MIME,
  DEV_FRESHNESS_ROOTS,
  createGameServer,
  isInsideRoot,
  isAllowedLoopbackHost,
  isAllowedStateChangingRequest,
  decodeRequestPath,
  resolveContainedFile,
  maxMtimeMsSync,
  maxMtimeMsAsync,
};
