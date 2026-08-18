// Browser/Electron client for the loopback player save store.
// Absent, 404, or failed fetches must never break localStorage-only tests or a store-less server.
export const SHARED_PLAYER_STORE_PATH = '/__spaceface_player_store';
export const SHARED_PLAYER_STORE_INDEX_KEY = 'sf.save.index';

const KEY_RE = /^(sf\.save\.[A-Za-z0-9._-]+|sf\.recovery\.[A-Za-z0-9._-]+|sf\.settings\.profile\.v1)$/;

export function isSharedPlayerStoreKey(key) {
  return typeof key === 'string' && KEY_RE.test(key);
}

export function sharedPlayerStoreAvailable() {
  try {
    const loc = globalThis.location;
    return !!(loc && (loc.protocol === 'http:' || loc.protocol === 'https:'));
  } catch {
    return false;
  }
}

export function collectLocalSharedStoreKeys(storage = globalThis.localStorage) {
  const keys = {};
  if (!storage || typeof storage.key !== 'function' || typeof storage.getItem !== 'function') {
    return keys;
  }
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!isSharedPlayerStoreKey(key)) continue;
      keys[key] = storage.getItem(key);
    }
  } catch {
    // localStorage scans are best-effort
  }
  return keys;
}

export function envelopeTime(raw) {
  if (typeof raw !== 'string' || !raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    const stamp = parsed && (parsed.savedAt || parsed.updatedAt);
    const time = Date.parse(stamp);
    return Number.isFinite(time) ? time : 0;
  } catch {
    return 0;
  }
}

function parseIndex(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mergeIndexes(localIndex, remoteIndex) {
  const out = { ...remoteIndex };
  for (const [slot, meta] of Object.entries(localIndex || {})) {
    const remote = out[slot];
    if (!remote) {
      out[slot] = meta;
      continue;
    }
    const localTime = Date.parse(meta && meta.savedAt) || 0;
    const remoteTime = Date.parse(remote && remote.savedAt) || 0;
    if (localTime >= remoteTime) out[slot] = meta;
  }
  return out;
}

export function mergeSharedStoreKeys(localKeys = {}, remoteKeys = {}) {
  const names = new Set([...Object.keys(localKeys || {}), ...Object.keys(remoteKeys || {})]);
  const out = {};
  for (const key of names) {
    if (!isSharedPlayerStoreKey(key)) continue;
    const local = localKeys[key];
    const remote = remoteKeys[key];
    if (local == null && remote == null) continue;
    if (local == null) {
      out[key] = remote;
      continue;
    }
    if (remote == null) {
      out[key] = local;
      continue;
    }
    if (key === SHARED_PLAYER_STORE_INDEX_KEY) {
      out[key] = JSON.stringify(mergeIndexes(parseIndex(local), parseIndex(remote)));
      continue;
    }
    out[key] = envelopeTime(local) >= envelopeTime(remote) ? local : remote;
  }
  return out;
}

export function applySharedStoreKeys(keys, storage = globalThis.localStorage) {
  if (!storage || typeof storage.setItem !== 'function') return 0;
  let written = 0;
  for (const [key, value] of Object.entries(keys || {})) {
    if (!isSharedPlayerStoreKey(key) || typeof value !== 'string') continue;
    try {
      storage.setItem(key, value);
      written += 1;
    } catch {
      // quota / disabled storage: keep going
    }
  }
  return written;
}

export async function fetchSharedPlayerStore() {
  if (!sharedPlayerStoreAvailable() || typeof fetch !== 'function') return null;
  try {
    // No timeout here means isSharedStoreSyncPending() can stay true forever, which pins the main
    // menu's Continue button at "Checking saves..." with no way out. This module's own header says
    // an absent store must never break anything — a stalled one must not either.
    const response = await fetch(SHARED_PLAYER_STORE_PATH, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const body = await response.json();
    if (!body || typeof body.keys !== 'object' || body.keys == null) return null;
    const keys = {};
    for (const [key, value] of Object.entries(body.keys)) {
      if (isSharedPlayerStoreKey(key) && typeof value === 'string') keys[key] = value;
    }
    return keys;
  } catch {
    return null;
  }
}

export async function pushSharedPlayerStore(keys, { keepalive = false } = {}) {
  if (!sharedPlayerStoreAvailable() || typeof fetch !== 'function') return false;
  const patch = {};
  let count = 0;
  for (const [key, value] of Object.entries(keys || {})) {
    if (!isSharedPlayerStoreKey(key)) continue;
    patch[key] = value == null ? null : String(value);
    count += 1;
  }
  if (count === 0) return true;
  try {
    const response = await fetch(SHARED_PLAYER_STORE_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: patch }),
      keepalive,
    });
    return response.ok;
  } catch {
    return false;
  }
}
