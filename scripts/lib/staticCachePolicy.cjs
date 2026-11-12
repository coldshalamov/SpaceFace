'use strict';

// Content-class cache policy for the shared Browser/Electron static server.
// Release GLB/KTX2/font/wasm bytes are immutable retail assets. HTML, source JS, CSS, JSON
// configs, and saves stay no-cache. ETag lets a warm launch 304 instead of re-shipping megabytes.

const IMMUTABLE_EXT = new Set([
  '.glb', '.gltf', '.ktx2', '.ktx', '.basis', '.woff2', '.woff', '.wasm', '.bin',
  '.png', '.jpg', '.jpeg', '.webp', '.avif',
]);

const MUTABLE_EXT = new Set([
  '.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.json', '.map', '.txt', '.md',
]);

function normalizePath(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function extname(relativePath) {
  const base = normalizePath(relativePath).split('/').pop() || '';
  const idx = base.lastIndexOf('.');
  return idx >= 0 ? base.slice(idx).toLowerCase() : '';
}

function isSaveOrMutableDocument(relativePath) {
  const p = normalizePath(relativePath);
  if (!p) return true;
  if (p.startsWith('saves/') || p.includes('/saves/')) return true;
  if (p.endsWith('index.html') || p === 'index.html') return true;
  if (p.startsWith('src/') || p.startsWith('styles/') || p.startsWith('electron/')) return true;
  return MUTABLE_EXT.has(extname(p)) && !isImmutableReleaseAsset(p);
}

function isImmutableReleaseAsset(relativePath) {
  const p = normalizePath(relativePath);
  // Hash manifests and package JSON keep a stable URL while the bytes change whenever a
  // ship is rebuilt. Pinning them immutable leaves the desktop app on a stale Hitch forever.
  if (extname(p) === '.json') return false;
  if (p.startsWith('assets/ships/release/')) return true;
  if (p.startsWith('assets/fonts/') || p.startsWith('styles/fonts/')) return true;
  if (p.startsWith('vendor/')) {
    const ext = extname(p);
    return ext === '.wasm' || ext === '.js' || ext === '.mjs';
  }
  if (p.includes('/release/') && IMMUTABLE_EXT.has(extname(p))) return true;
  return IMMUTABLE_EXT.has(extname(p)) && (p.startsWith('assets/') || p.startsWith('build/'));
}

function resolveStaticCacheControl(relativePath) {
  if (isImmutableReleaseAsset(relativePath) && !isSaveOrMutableDocument(relativePath)) {
    return 'public, max-age=31536000, immutable';
  }
  return 'no-cache';
}

/**
 * App-source paths whose bytes are fixed for the life of a packaged build. A packaged app's
 * asar payload cannot change between launches of one build, so marking these immutable makes a
 * warm launch skip the ~700 conditional-GET revalidations the module graph otherwise pays.
 * index.html is deliberately NOT in this class: it stays no-cache as the launch detector — the
 * server compares its digest-keyed ETag to decide whether to emit Clear-Site-Data for a build
 * change, which is what makes the rest of this class safe to pin.
 */
function isImmutableAppSource(relativePath) {
  const p = normalizePath(relativePath);
  if (!p) return false;
  if (p === 'index.html' || p.endsWith('.html') || p.endsWith('.htm')) return false;
  if (p.startsWith('saves/') || p.includes('/saves/')) return false;
  return p.startsWith('src/')
    || p.startsWith('styles/')
    || p.startsWith('node_modules/')
    || p.startsWith('electron/');
}

function makeWeakEtag(stats) {
  if (!stats) return null;
  const size = Number(stats.size) || 0;
  const mtime = Number(stats.mtimeMs) || (stats.mtime ? Number(new Date(stats.mtime)) : 0);
  return `W/"${size.toString(16)}-${Math.floor(mtime).toString(16)}"`;
}

function ifNoneMatchSatisfied(requestEtag, etag) {
  if (!requestEtag || !etag) return false;
  const raw = String(requestEtag);
  if (raw.trim() === '*') return true;
  return raw.split(',').map((part) => part.trim()).includes(etag);
}

function resolveStaticCacheHeaders(relativePath, stats, requestHeaders = {}, options = {}) {
  const etag = makeWeakEtag(stats);
  const appSourceImmutable = options && options.appSourceImmutable === true;
  const cacheControl = appSourceImmutable && isImmutableAppSource(relativePath)
    ? 'public, max-age=31536000, immutable'
    : resolveStaticCacheControl(relativePath);
  const headers = {
    'Cache-Control': cacheControl,
  };
  if (etag) headers.ETag = etag;
  if (stats && stats.mtime) headers['Last-Modified'] = new Date(stats.mtime).toUTCString();
  const notModified = ifNoneMatchSatisfied(requestHeaders['if-none-match'] || requestHeaders['If-None-Match'], etag);
  return { headers, etag, cacheControl, notModified };
}

module.exports = {
  extname,
  isImmutableReleaseAsset,
  isImmutableAppSource,
  isSaveOrMutableDocument,
  resolveStaticCacheControl,
  makeWeakEtag,
  ifNoneMatchSatisfied,
  resolveStaticCacheHeaders,
};
