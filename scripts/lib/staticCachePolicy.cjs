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

function resolveStaticCacheHeaders(relativePath, stats, requestHeaders = {}) {
  const etag = makeWeakEtag(stats);
  const cacheControl = resolveStaticCacheControl(relativePath);
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
  isSaveOrMutableDocument,
  resolveStaticCacheControl,
  makeWeakEtag,
  ifNoneMatchSatisfied,
  resolveStaticCacheHeaders,
};
