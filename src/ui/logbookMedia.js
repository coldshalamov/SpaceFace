import { selectMoments } from '../presentation/momentMachine/index.js';
import { logbookEntries, logbookRunKey } from '../chronicler/logbook.js';
import { getFlightFootage } from './screens/flightFootage.js';
import { decodeFootageFrameToBlob } from './screens/footageVideoCodec.js';

export const LOGBOOK_MEDIA_LIMITS = Object.freeze({ records: 32, bytes: 8 * 1024 * 1024, imageBytes: 256 * 1024 });
const urls = new Map();
const keyFor = (state, entry) => `${logbookRunKey(state)}|${entry.id}`;
const evidenceKey = entry => JSON.stringify((entry.facts || []).map(fact =>
  [fact.id, fact.event, fact.tick, fact.actor?.key, fact.subject?.key]));
export function logbookStill(state, entry) {
  const saved = urls.get(keyFor(state, entry));
  return saved?.evidence === evidenceKey(entry) ? saved.url : null;
}

// Blobs stay in the presentation store, outside saves and state.chronicler. A denied quota leaves
// the written journal intact. One transaction prunes all runs to a small bounded disk footprint.
export function createLogbookStore(indexedDB = globalThis.indexedDB) {
  let database;
  const open = () => database ??= new Promise(resolve => {
    if (!indexedDB) { resolve(null); return; }
    let request;
    try { request = indexedDB.open('spaceface-logbook-stills', 1); } catch { resolve(null); return; }
    request.onupgradeneeded = () => request.result.createObjectStore('stills', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => resolve(null);
  });
  return {
    async all() {
      const db = await open(); if (!db) return [];
      return new Promise(resolve => {
        try {
          const request = db.transaction('stills', 'readonly').objectStore('stills').getAll();
          request.onsuccess = () => resolve(request.result || []); request.onerror = () => resolve([]);
        } catch { resolve([]); }
      });
    },
    async put(record) {
      const db = await open(); if (!db) return false;
      return new Promise(resolve => {
        try {
          const tx = db.transaction('stills', 'readwrite'), store = tx.objectStore('stills');
          store.put(record);
          const request = store.getAll();
          request.onsuccess = () => {
            const rows = request.result.sort((a, b) => b.savedAt - a.savedAt);
            let bytes = 0;
            rows.forEach((row, index) => {
              bytes += row.blob?.size || 0;
              if (index >= LOGBOOK_MEDIA_LIMITS.records || bytes > LOGBOOK_MEDIA_LIMITS.bytes) store.delete(row.key);
            });
          };
          tx.oncomplete = () => resolve(true); tx.onerror = tx.onabort = () => resolve(false);
        } catch { resolve(false); }
      });
    },
    async close() { const db = await database; db?.close(); database = null; },
  };
}

export function selectedLogbookFrame(entry, footage) {
  if (!entry?.facts?.length || !footage?.ring?.frames?.length) return null;
  const selection = selectMoments({ chronicle: entry.facts });
  for (const moment of selection.ranked || []) {
    let nearest = null;
    for (const frame of footage.ring.frames) {
      if (!nearest || Math.abs(frame.tick - moment.payoffTick) < Math.abs(nearest.tick - moment.payoffTick)) nearest = frame;
    }
    // Never illustrate an old event with today's flight picture.
    if (nearest && Math.abs(nearest.tick - moment.payoffTick) <= 30) return { frame: nearest, moment };
  }
  return null;
}

export function createLogbookMedia({ state, bus }, options = {}) {
  const store = options.store || createLogbookStore(), urlApi = options.urlApi || globalThis.URL;
  const footage = options.footage || getFlightFootage, decode = options.decode || decodeFootageFrameToBlob;
  let disposed = false, generation = 0, run = logbookRunKey(state), busy = false;
  const attempted = new Set();
  const clear = () => {
    generation += 1; attempted.clear();
    for (const item of urls.values()) urlApi?.revokeObjectURL?.(item.url);
    urls.clear();
  };
  const adopt = record => {
    if (!record?.blob || !urlApi?.createObjectURL) return;
    const old = urls.get(record.key); if (old) urlApi.revokeObjectURL?.(old.url);
    urls.set(record.key, { url: urlApi.createObjectURL(record.blob), revision: record.revision, evidence: record.evidence });
    while (urls.size > LOGBOOK_MEDIA_LIMITS.records) {
      const key = urls.keys().next().value;
      urlApi.revokeObjectURL?.(urls.get(key).url); urls.delete(key);
    }
  };
  const restore = async () => {
    const epoch = generation, prefix = `${logbookRunKey(state)}|`;
    const records = await store.all();
    if (disposed || epoch !== generation) return;
    for (const record of records) if (record.key.startsWith(prefix)) adopt(record);
    bus?.emit?.('logbook:stillReady', {});
  };
  void restore();
  return {
    restore,
    reload() { clear(); run = logbookRunKey(state); void restore(); },
    async frame() {
      if (disposed) return;
      const nextRun = logbookRunKey(state);
      if (nextRun !== run) { run = nextRun; clear(); void restore(); }
      if (busy || state.mode !== 'flight' || state.paused) return;
      const entries = logbookEntries(state, { opening: false });
      const entry = entries.find(row => !attempted.has(`${row.id}:${row.revision}`)
        && (!logbookStill(state, row) || urls.get(keyFor(state, row))?.revision !== row.revision)
        && selectedLogbookFrame(row, footage()));
      if (!entry) return;
      const selected = selectedLogbookFrame(entry, footage());
      const epoch = generation, key = keyFor(state, entry);
      busy = true; attempted.add(`${entry.id}:${entry.revision}`);
      try {
        const blob = await decode(selected.frame);
        if (disposed || epoch !== generation || !blob || blob.size > LOGBOOK_MEDIA_LIMITS.imageBytes) return;
        const record = { key, revision: entry.revision, evidence: evidenceKey(entry), tick: selected.frame.tick,
          momentId: selected.moment.id, savedAt: Date.now(), blob };
        adopt(record); await store.put(record);
        if (!disposed && epoch === generation) bus?.emit?.('logbook:stillReady', { storyId: entry.id });
      } catch { /* no invented illustration when capture/decoding is unavailable */ }
      finally { busy = false; }
    },
    dispose() { disposed = true; clear(); void store.close?.(); },
  };
}
