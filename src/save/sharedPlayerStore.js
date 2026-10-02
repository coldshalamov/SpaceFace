// Browser/Electron client for the loopback player save store.
// Absent, 404, or failed fetches must never break localStorage-only tests or a store-less server.
export const SHARED_PLAYER_STORE_PATH = '/__spaceface_player_store';
export const SHARED_PLAYER_STORE_INDEX_KEY = 'sf.save.index';

// Chromium caps a keepalive request body at 64 KiB of UTF-8 — measured in encoded BYTES, not
// string length — and fails anything larger without sending it. A real save envelope measures
// ~205-224 KB, so the page-outliving guarantee is only requested where the transport can
// actually honor it; larger mirrors go as a normal PUT, which still reaches the store — the
// property the two shells depend on to share saves.
const KEEPALIVE_BODY_BUDGET_BYTES = 60000;

// Every store call gets its own deadline: a store that accepts the connection but never answers
// must not pin isSharedStoreSyncPending() (Continue's "Checking saves…") forever. This module's
// header already promises an absent store never breaks anything — a stalled one must not either.
const SHARED_STORE_TIMEOUT_MS = 10000;

const KEY_RE = /^(sf\.save\.[A-Za-z0-9._-]+|sf\.recovery\.[A-Za-z0-9._-]+|sf\.settings\.profile\.v1)$/;

// Deletion tombstones. Slot deletes and quota evictions remove keys locally and mirror a null
// patch to the store — but absence is not a durable signal: a stale copy still held by the other
// side (an offline delete, a second shell that never got the null) merges straight back in under
// last-writer-wins, and the deleted slot reappears in Continue. A null patch therefore also writes
// `sf.save.deleted.<slot>` / `sf.recovery.deleted.<slot>` = {slot, deletedAt} — locally first so a
// failed PUT still protects this shell, and into the same PUT so the other shells learn it.
// Tombstones are per-key on purpose: a quota eviction that deletes `sf.recovery.2` must not kill a
// live `sf.save.2` primary, so `sf.save.deleted.*` covers only the primary key and the matching
// `sf.recovery.deleted.*` covers only the recovery copy. A save written after the delete has a
// newer savedAt and wins over the tombstone, so re-using the slot stays clean.
const SAVE_PREFIX = 'sf.save.';
const RECOVERY_PREFIX = 'sf.recovery.';
const SAVE_TOMBSTONE_PREFIX = SAVE_PREFIX + 'deleted.';
const RECOVERY_TOMBSTONE_PREFIX = RECOVERY_PREFIX + 'deleted.';

// A 404 from the store route is definitive: this server mounts no player store, and a
// server never gains routes mid-session. Remember it so every save/load on a store-less
// server stops paying a doomed round trip (and logging a console error) per call.
// Network failures and other statuses stay retryable — only 404 is memoized.
let storeRouteAbsent = false;

export function resetSharedPlayerStoreMemoForTests() {
  storeRouteAbsent = false;
}

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
    const stamp = parsed && (parsed.savedAt || parsed.updatedAt || parsed.deletedAt);
    const time = Date.parse(stamp);
    return Number.isFinite(time) ? time : 0;
  } catch {
    return 0;
  }
}

// Map a storage key to the slot a tombstone would use: 'sf.save.2' -> '2' under
// SAVE_TOMBSTONE_PREFIX, 'sf.recovery.2' -> '2' under RECOVERY_TOMBSTONE_PREFIX. The slot index,
// side-channel records (achievements, crucible meta), and tombstone keys themselves are not
// envelopes — they have no tombstone coverage and return null.
function deletableKey(key) {
  if (typeof key !== 'string') return null;
  if (key.startsWith(SAVE_TOMBSTONE_PREFIX) || key.startsWith(RECOVERY_TOMBSTONE_PREFIX)) return null;
  if (key === SHARED_PLAYER_STORE_INDEX_KEY) return null;
  if (key.startsWith(SAVE_PREFIX)) return { slot: key.slice(SAVE_PREFIX.length), tombstone: SAVE_TOMBSTONE_PREFIX };
  if (key.startsWith(RECOVERY_PREFIX)) return { slot: key.slice(RECOVERY_PREFIX.length), tombstone: RECOVERY_TOMBSTONE_PREFIX };
  return null;
}

// Newest deletedAt per tombstone key across one or more key sets. A tombstone arriving from either
// side is authoritative for both — the whole point is that a delete on one shell binds the other.
function collectTombstones(...keySets) {
  const out = new Map();
  for (const keys of keySets) {
    for (const [key, value] of Object.entries(keys || {})) {
      const isSave = key.startsWith(SAVE_TOMBSTONE_PREFIX);
      const isRecovery = !isSave && key.startsWith(RECOVERY_TOMBSTONE_PREFIX);
      if (!isSave && !isRecovery) continue;
      if (typeof value !== 'string') continue;
      const tombstoneKey = (isSave ? SAVE_TOMBSTONE_PREFIX : RECOVERY_TOMBSTONE_PREFIX)
        + key.slice(isSave ? SAVE_TOMBSTONE_PREFIX.length : RECOVERY_TOMBSTONE_PREFIX.length);
      const time = envelopeTime(value);
      if (time > 0 && (out.get(tombstoneKey) || 0) < time) out.set(tombstoneKey, time);
    }
  }
  return out;
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
  const tombstones = collectTombstones(localKeys, remoteKeys);
  const names = new Set([...Object.keys(localKeys || {}), ...Object.keys(remoteKeys || {})]);
  const out = {};
  for (const key of names) {
    if (!isSharedPlayerStoreKey(key)) continue;
    const local = localKeys[key];
    const remote = remoteKeys[key];
    if (local == null && remote == null) continue;
    const deletable = deletableKey(key);
    const winner = local == null ? remote : remote == null ? local
      : (envelopeTime(local) >= envelopeTime(remote) ? local : remote);
    // A tombstone at-or-after the surviving copy's stamp means the delete is newer than the save:
    // the copy is a stale mirror survivor, not a save — drop it instead of resurrecting the slot.
    if (deletable && tombstones.size) {
      const deletedAt = tombstones.get(deletable.tombstone + deletable.slot);
      if (deletedAt != null && deletedAt >= envelopeTime(winner)) continue;
    }
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
    out[key] = winner;
  }
  // Scrub tombstoned slots out of the merged index or Continue re-advertises a deleted save
  // (the other side's index can outlive its envelope). Only a primary-side tombstone clears the
  // index row — a quota-evicted recovery copy must not hide a live primary.
  if (tombstones.size && typeof out[SHARED_PLAYER_STORE_INDEX_KEY] === 'string') {
    const index = parseIndex(out[SHARED_PLAYER_STORE_INDEX_KEY]);
    let changed = false;
    for (const slot of Object.keys(index)) {
      const deletedAt = tombstones.get(SAVE_TOMBSTONE_PREFIX + slot);
      if (deletedAt == null) continue;
      if (!(Date.parse(index[slot] && index[slot].savedAt) > deletedAt)) {
        delete index[slot];
        changed = true;
      }
    }
    if (changed) out[SHARED_PLAYER_STORE_INDEX_KEY] = JSON.stringify(index);
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
  // Prune local bytes a tombstone-covered delete left behind. The merge omits them, so without
  // this pass a stale sf.save.<slot>/sf.recovery.<slot> still sitting in storage would be pushed
  // straight back to the store on the next mirror flush — resurrecting the slot it just lost.
  const tombstones = collectTombstones(keys);
  if (tombstones.size && typeof storage.key === 'function' && typeof storage.removeItem === 'function') {
    for (let i = (storage.length || 0) - 1; i >= 0; i--) {
      let key = null;
      try { key = storage.key(i); } catch { break; }
      const deletable = deletableKey(key);
      if (!deletable || Object.hasOwn(keys, key)) continue;
      const deletedAt = tombstones.get(deletable.tombstone + deletable.slot);
      if (deletedAt == null) continue;
      let stale = null;
      try { stale = storage.getItem(key); } catch { continue; }
      if (deletedAt >= envelopeTime(stale)) {
        try { storage.removeItem(key); } catch { /* best effort */ }
      }
    }
  }
  return written;
}

export async function fetchSharedPlayerStore() {
  if (!sharedPlayerStoreAvailable() || typeof fetch !== 'function') return null;
  if (storeRouteAbsent) return null;
  try {
    // No timeout here means isSharedStoreSyncPending() can stay true forever, which pins the main
    // menu's Continue button at "Checking saves..." with no way out. This module's own header says
    // an absent store must never break anything — a stalled one must not either.
    const response = await fetch(SHARED_PLAYER_STORE_PATH, { cache: 'no-store', signal: AbortSignal.timeout(SHARED_STORE_TIMEOUT_MS) });
    if (response.status === 404) storeRouteAbsent = true;
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
  const deletions = new Map();
  let count = 0;
  for (const [key, value] of Object.entries(keys || {})) {
    if (!isSharedPlayerStoreKey(key)) continue;
    patch[key] = value == null ? null : String(value);
    count += 1;
    if (value == null) {
      const deletable = deletableKey(key);
      if (deletable) deletions.set(deletable.tombstone + deletable.slot, deletable.slot);
    }
  }
  // Record the deletion durably BEFORE the PUT: the tombstone lands in localStorage even if this
  // push never reaches the store, so a stale remote copy loses the next merge instead of
  // resurrecting the slot. The same tombstones ride this PUT so the other shells honor the delete.
  if (deletions.size) {
    const deletedAt = new Date().toISOString();
    for (const [tombstoneKey, slot] of deletions) {
      const value = JSON.stringify({ slot, deletedAt });
      patch[tombstoneKey] = value;
      count += 1;
      try {
        const storage = globalThis.localStorage;
        if (storage && typeof storage.setItem === 'function') storage.setItem(tombstoneKey, value);
      } catch {
        // localStorage disabled/full — the PUT still carries the tombstone for other shells
      }
    }
  }
  if (count === 0) return true;
  if (storeRouteAbsent) return false;
  try {
    const body = JSON.stringify({ keys: patch });
    const response = await fetch(SHARED_PLAYER_STORE_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(SHARED_STORE_TIMEOUT_MS),
      // The budget is measured in UTF-8 bytes (non-ASCII names encode wider than .length), and
      // the encoder only runs when the guarantee was actually requested.
      keepalive: keepalive && new TextEncoder().encode(body).byteLength <= KEEPALIVE_BODY_BUDGET_BYTES,
    });
    if (response.status === 404) storeRouteAbsent = true;
    return response.ok;
  } catch {
    return false;
  }
}
