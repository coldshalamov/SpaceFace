// S1 Phase-B stage 8 — realm-neutral host shims.
//
// The sim host machinery (scripts/lib/simWorkerHost.mjs and friends) runs in three
// realms: the node worker_threads lane, the node in-process lane, and the browser
// module Worker lane (`src/core/wholeSimBrowserWorker.js`). Timing, memory and
// filesystem reads differ per realm — this module is the single seam they funnel
// through so the host code carries no `process`/`node:*` references of its own.
//
// Pure module: no argv reads, no self-execute, no side effects at import.

// Node's monotonic clock in bigint nanoseconds; browsers (main or worker) fall back
// to performance.now() scaled — same units, same call sites, never a Date source.
const _hrtime = (typeof process !== 'undefined' && process && typeof process.hrtime === 'function'
  && typeof process.hrtime.bigint === 'function')
  ? () => process.hrtime.bigint()
  : null;

export function nowNs() {
  if (_hrtime) return _hrtime();
  const ms = (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
  return BigInt(Math.round(ms * 1e6));
}

export function realmMemoryUsage() {
  if (typeof process !== 'undefined' && process && typeof process.memoryUsage === 'function') {
    try { return process.memoryUsage(); } catch (_) { /* fall through to browser probe */ }
  }
  const memory = (typeof performance !== 'undefined' && performance && performance.memory) || null;
  return {
    rss: memory ? memory.totalJSHeapSize : 0,
    heapTotal: memory ? memory.totalJSHeapSize : 0,
    heapUsed: memory ? memory.usedJSHeapSize : 0,
    external: 0,
    arrayBuffers: 0,
  };
}

// --- filesystem -------------------------------------------------------------
// The 47-A harness loads its scenario contract and save blobs off disk. The
// browser lane never does — the contract JSON arrives on the init directive —
// but the node lanes share the same call sites, so the fs surface is injected
// once by whichever node adapter boots the host. A browser realm that reaches
// these paths gets a loud, honest error (never a silent wrong answer).

let _fs = null;

export function installRealmFs(fs) {
  _fs = fs && typeof fs === 'object' ? fs : null;
}

export function realmReadFileSync(path, encoding = 'utf8') {
  if (!_fs || typeof _fs.readFileSync !== 'function') {
    throw new Error(`realm fs unavailable: cannot read ${String(path)} in this host realm`);
  }
  return _fs.readFileSync(path, encoding);
}

export function realmResolvePath(root, rel) {
  if (_fs && typeof _fs.resolve === 'function') return _fs.resolve(root, rel);
  // Realm fallback: posix-style join. The browser realm never reads files so
  // this only supports callers that pass a path the host treats as opaque.
  const base = String(root || '').replace(/[\\/]+$/, '');
  const rest = String(rel || '').replace(/^[.\\/]+/, '').replace(/\\/g, '/');
  return base ? `${base}/${rest}` : rest;
}

export function realmFsAvailable() {
  return !!(_fs && typeof _fs.readFileSync === 'function');
}

// --- lane storage -------------------------------------------------------------
// The save system's localStorage contract is synchronous, so the worker realm
// cannot reach main's real storage. Instead the realm gets a Map-backed shim:
// main stages its `sf.*` keyspace onto it when a load/save event forwards, and
// the worker's save code runs its own slot/recovery logic against the bytes.

const _laneStore = new Map();
// Optional write relay: shim writes also post to main (folded into tick
// replies) so durable persistence stays main-owned while the bytes are the
// worker's own — its real sim state, not a mirror serialize.
let _laneWriteHook = null;

const laneStorageShim = {
  getItem(k) { const v = _laneStore.get(String(k)); return v === undefined ? null : v; },
  setItem(k, v) {
    const s = String(v);
    _laneStore.set(String(k), s);
    if (_laneWriteHook) { try { _laneWriteHook('set', String(k), s); } catch (_) { /* relay best-effort */ } }
  },
  removeItem(k) {
    if (_laneStore.delete(String(k)) && _laneWriteHook) { try { _laneWriteHook('remove', String(k), null); } catch (_) { /* relay best-effort */ } }
  },
  clear() {
    if (_laneStore.size === 0) return;
    _laneStore.clear();
    if (_laneWriteHook) { try { _laneWriteHook('clear', null, null); } catch (_) { /* relay best-effort */ } }
  },
  key(i) { let n = 0; for (const k of _laneStore.keys()) { if (n++ === i) return k; } return null; },
  get length() { return _laneStore.size; },
};

/** Install the Map-backed shim as globalThis.localStorage when none exists. */
export function installLaneStorage(globalObj, { onWrite } = {}) {
  if (typeof onWrite === 'function') _laneWriteHook = onWrite;
  const g = globalObj || globalThis;
  if (typeof g.localStorage === 'undefined') {
    try { g.localStorage = laneStorageShim; } catch (_) { /* non-extensible realm */ }
  }
}

/**
 * Replace the staged snapshot wholesale: entries the main realm no longer
 * holds disappear here too (slot deletes must be visible to recovery logic).
 */
export function stageLaneStorage(entries, preserveOps = null) {
  if (!entries || typeof entries !== 'object') return;
  _laneStore.clear();
  for (const key of Object.keys(entries)) {
    const v = entries[key];
    if (typeof v === 'string') _laneStore.set(key, v);
  }
  // Writes the worker already staged but has not yet relayed main-side must
  // survive the wholesale restage — the incoming snapshot predates them.
  if (Array.isArray(preserveOps)) {
    for (const op of preserveOps) {
      try {
        if (!op) continue;
        if (op.op === 'set' && typeof op.key === 'string' && typeof op.value === 'string') _laneStore.set(op.key, op.value);
        else if (op.op === 'remove' && typeof op.key === 'string') _laneStore.delete(op.key);
        else if (op.op === 'clear') { for (const k of [..._laneStore.keys()]) _laneStore.delete(k); }
      } catch (_) { /* staging replay is best-effort */ }
    }
  }
}
