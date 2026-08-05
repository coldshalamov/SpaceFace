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
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
}

/**
 * Create the canonical SpaceFace static game server.
 *
 * @param {object} opts
 * @param {string} opts.root            Absolute filesystem root to serve.
 * @param {boolean} [opts.async=true]   Use async filesystem metadata reads (required by Electron).
 * @param {Array}  [opts.extraRoutes]   Extra route handlers: [{ test(req), handle(req, res, ctx) }].
 *                                      Used by the browser server for /__shot, etc.
 * @returns {http.Server}               An http.Server (not yet listening).
 */
function createGameServer(opts) {
  const root = path.resolve(opts.root);
  const useAsync = opts.async !== false;
  const extraRoutes = opts.extraRoutes || [];
  const staticHeaders = Object.freeze({ ...(opts.staticHeaders || {}) });
  const staticHeadersByPath = Object.fromEntries(Object.entries(opts.staticHeadersByPath || {})
    .map(([key, headers]) => [String(key).replace(/\\/g, '/').replace(/^\//, ''), Object.freeze({ ...headers })]));
  const devDiagnostics = opts.devDiagnostics !== false;
  const devFreshnessPayload = makeFreshnessTracker(root, { async: useAsync });

  const server = http.createServer(async (req, res) => {
    try {
      const method = req.method || 'GET';
      const url = req.url || '/';

      // Extra routes first (e.g. browser /__shot screenshot sink).
      for (const route of extraRoutes) {
        if (route.test && route.test(method, url)) {
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

      // Static file serving.
      let urlPath = decodeURIComponent(url.split('?')[0]);
      if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
      const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
      let file = path.join(root, safe);
      if (!isInsideRoot(file, root)) { res.writeHead(403); res.end('Forbidden'); return; }

      let stats;
      try { stats = useAsync ? await fsp.stat(file) : fs.statSync(file); }
      catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found: ' + safe); return; }

      if (stats.isDirectory()) {
        file = path.join(file, 'index.html');
        try { stats = useAsync ? await fsp.stat(file) : fs.statSync(file); }
        catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 Not Found: ' + safe); return; }
      }
      if (!isInsideRoot(file, root)) { res.writeHead(403); res.end('Forbidden'); return; }

      const relativePath = path.relative(root, file).split(path.sep).join('/');
      res.writeHead(200, {
        ...staticHeaders,
        ...(staticHeadersByPath[relativePath] || {}),
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stats.size,
        'Cache-Control': 'no-cache',
      });
      // GLBs routinely carry tens of megabytes of embedded KTX2 data. A whole-file read stages a
      // second copy in the server heap and, in packaged Electron, synchronously blocks the main
      // process while ASAR materializes it. Stream the identical bytes so transport can overlap
      // decode and neither launcher creates an avoidable admission/GC spike.
      fs.createReadStream(file).on('error', (error) => res.destroy(error)).pipe(res);
    } catch (err) {
      try { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('500 ' + (err && err.message ? err.message : err)); }
      catch { /* response already sent */ }
    }
  });

  return server;
}

module.exports = {
  MIME,
  DEV_FRESHNESS_ROOTS,
  createGameServer,
  isInsideRoot,
  maxMtimeMsSync,
  maxMtimeMsAsync,
};
