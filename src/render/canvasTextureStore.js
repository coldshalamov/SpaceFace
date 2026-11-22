// Persistent layer for the procedural canvas textures (campaign B5,
// design/overhaul/14_PERF_PLAN.md). canvasTextures.js synthesises deterministic seeded
// textures on the main thread — its header measures ~49 MB + 12.3 MB of scratch allocations
// for one 1024px fbm pass — and visualFactory keeps every texture alive precisely because
// generation is the costly part. This module persists the built canvases as lossless PNG
// blobs in IndexedDB keyed by the texture key, mirroring programBinaryCache: the first boot
// builds and backfills, later boots preload the stored set while the loading screens play and
// the builders never run. Same pixels by construction (PNG is lossless and the builders are
// pure given their args and seed), so nothing visible changes.
//
// Stored pixels carry a builder stamp: bump CANVAS_TEXTURE_STORE_VERSION whenever a builder's
// output changes for the same key and every stored texture is invalidated at once.
import * as THREE from 'three';

export const CANVAS_TEXTURE_STORE_VERSION = 1;

const IDB_DB = 'spaceface-canvas-textures';
const IDB_STORE = 'textures';
const IDB_MAX_BYTES = 96 * 1024 * 1024; // PNG payloads; the RGBA VRAM they spare is ~4x larger
const idbMeta = new Map(); // key -> { t, size }
let idbBytes = 0;
let idbDb = null;

// Diagnostics surface (the __THREE_GAME_DIAGNOSTICS__ pattern): what the store did this boot.
export const storeStats = { hydrated: 0, built: 0, served: 0, persisted: 0, persistedBytes: 0 };
if (typeof globalThis.window !== 'undefined') {
  try { window.__SF_CANVAS_TEX_STORE__ = storeStats; } catch { /* inert off-main-thread */ }
}

function idbOpenDb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    let request;
    try { request = indexedDB.open(IDB_DB, CANVAS_TEXTURE_STORE_VERSION); } catch { resolve(null); return; }
    request.onupgradeneeded = () => {
      try { if (!request.result.objectStoreNames.contains(IDB_STORE)) request.result.createObjectStore(IDB_STORE); } catch { /* best-effort */ }
    };
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function idbClearAll(db) {
  try {
    await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = resolve;
      tx.onerror = resolve;
      tx.onabort = resolve;
    });
  } catch { /* best-effort */ }
}

function idbEvict(db) {
  const doomed = [];
  while (idbBytes > IDB_MAX_BYTES && idbMeta.size) {
    let oldestKey = null;
    let oldestT = Infinity;
    for (const [key, meta] of idbMeta) {
      if (meta.t < oldestT) { oldestT = meta.t; oldestKey = key; }
    }
    if (!oldestKey) break;
    idbBytes -= idbMeta.get(oldestKey).size;
    idbMeta.delete(oldestKey);
    doomed.push(oldestKey);
  }
  if (!doomed.length) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    for (const key of doomed) tx.objectStore(IDB_STORE).delete(key);
  } catch { /* eviction is best-effort */ }
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob || null), 'image/png');
    } catch { resolve(null); }
  });
}

// Backfill after a build: PNG-encode off the frame path and store. Lossless, best-effort,
// never blocks or fails the caller. Builds that race the store's own open (the menu builds
// textures before hydration finishes) are queued and flushed once the DB exists — otherwise
// the same early keys would rebuild every boot.
const pendingPuts = [];
function idbPut(db, record) {
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(record, record.key);
    idbMeta.set(record.key, { t: record.t, size: record.blob.size });
    idbBytes += record.blob.size;
    storeStats.persisted += 1;
    storeStats.persistedBytes += record.blob.size;
    idbEvict(db);
  } catch { /* best-effort */ }
}

export function persistCanvasTexture(key, texture) {
  const image = texture && texture.image;
  if (!image || typeof image.toBlob !== 'function') return;
  const record = {
    v: CANVAS_TEXTURE_STORE_VERSION,
    key,
    t: Date.now(),
    blob: null, // filled below
    meta: {
      srgb: texture.colorSpace === THREE.SRGBColorSpace,
      anisotropy: texture.anisotropy || 4,
      repeat: [texture.repeat.x, texture.repeat.y],
    },
  };
  canvasToPngBlob(image).then((blob) => {
    if (!blob) return;
    record.blob = blob;
    if (idbDb) idbPut(idbDb, record);
    else {
      pendingPuts.push(record);
      if (pendingPuts.length > 256) pendingPuts.shift(); // a store that never opens must not leak
    }
  });
}

// Texture from a stored record matching canvasTextures.finalize() semantics. The canvas
// default orientation is flipY=true; ImageBitmap ignores UNPACK_FLIP_Y, so the flip is baked
// into the bitmap at decode and the texture keeps flipY=false.
function textureFromRecord(record) {
  return createImageBitmap(record.blob, { imageOrientation: 'flipY' }).then((bitmap) => {
    const texture = new THREE.Texture(bitmap);
    texture.flipY = false;
    texture.colorSpace = record.meta.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = record.meta.anisotropy;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(record.meta.repeat[0] || 1, record.meta.repeat[1] || 1);
    texture.needsUpdate = true;
    return texture;
  });
}

// Hydrate the stored set once at module load. Returns a promise of the key -> texture map
// (empty when storage is unavailable or a version bump cleared it); callers treat it as a
// race they may lose — any key that misses simply builds as before.
export async function hydrateCanvasTextures() {
  const db = await idbOpenDb();
  if (!db) return new Map();
  idbDb = db;
  while (pendingPuts.length) idbPut(db, pendingPuts.shift());
  const out = new Map();
  try {
    const records = await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
    const usable = records.filter((r) => r && r.v === CANVAS_TEXTURE_STORE_VERSION && r.blob instanceof Blob && r.meta);
    if (usable.length !== records.length) {
      // A version bump left stale rows behind: clear once so the store tracks reality.
      await idbClearAll(db);
      idbBytes = 0;
      idbMeta.clear();
    } else {
      await Promise.all(usable.map((record) => textureFromRecord(record)
        .then((texture) => {
          out.set(record.key, texture);
          idbMeta.set(record.key, { t: record.t || 0, size: record.blob.size });
          idbBytes += record.blob.size;
        })
        .catch(() => { /* one bad record never blocks the set */ })));
      storeStats.hydrated = out.size;
    }
  } catch { /* best-effort: an unreadable store behaves like an empty one */ }
  return out;
}
