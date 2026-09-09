// src/systems/spawnBudget.js — the SINGLE authority for the live hostile/NPC ship cap.
//
// Problem this solves: zone ambient traffic, the encounter director, and missions all want to spawn
// ships. Without one arbiter they fight over the budget and the sector either floods (perf death) or
// starves. This system does NOTHING but ACCOUNT slots: a caller asks for N, gets a granted count back
// (clamped so total never exceeds MAX), spawns exactly that many entities itself, and releases the
// slots when those entities die or despawn. It never spawns, moves, or touches entities.
//
// Owns state.spawnBudget only (§0.6). Exposed to every system via ctx.helpers.spawnBudget so callers
// can request/release without importing this module. It is fully deterministic (pure counting, no RNG)
// and additive: if nobody requests, it's an inert ledger and the legacy world/mission spawners are
// unaffected.
//
// API (via ctx.helpers.spawnBudget):
//   request(n, requesterId)  -> granted count (0..n), reserves that many slots under requesterId
//   bindEntity(entityId, requesterId) -> binds one reserved slot to a live entity
//   releaseEntity(entityId)  -> frees the exact entity-bound slot (idempotent)
//   release(requesterIdOrIds) -> frees all slots for one or more requester ids
//   current()                -> slots currently reserved
//   available()              -> MAX - current()
//   max()                    -> the cap
//   reset()                  -> clear all reservations (used on hard sector change / new game / restore)

// Eight slots are reserved for ambient world ships, leaving sixteen for multiple light squads,
// an escort/controller, and a heavy anchor without lifting the hard safety ceiling below.
const DEFAULT_MAX = 24;
const MIN_MAX = 1;
const HARD_MAX = 40;      // absolute ceiling so a bad override can never explode the sim

export const spawnBudget = {
  name: 'spawnBudget',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    ensureBudgetState(this.state);
    const api = makeBudgetApi(this.state);
    this.api = api;
    this.helpers.spawnBudget = api;
    this._unsubs = [];

    if (this.bus && typeof this.bus.on === 'function') {
      // Reset on hard sector:EXIT (intentional jump / load boundary) — NOT continuous free-flight
      // membership handoffs, and NOT sector:enter. world.js reserves ambient allotment DURING
      // enterSector before sector:enter; resetting on enter would wipe that reservation.
      // Continuous exits keep live entities and their budget slots (M2-C1). Restore resets before
      // world rematerializes; resetting at save:loaded would erase the incoming world's live slots.
      // First-ever entry has no exit; ensureBudgetState starts empty.
      this._unsubs.push(this.bus.on('sector:exit', (p) => {
        if (isContinuousHandoff(p)) return;
        api.reset();
      }));
      this._unsubs.push(this.bus.on('save:restoring', () => api.reset()));
      this._unsubs.push(this.bus.on('entity:destroyed', (p) => api.releaseEntity(p && p.id)));
    }
  },

  newGame() {
    ensureBudgetState(this.state);
    if (this.api) this.api.reset();
  },

  // Pure ledger — no per-tick work. Present so the system slots cleanly into UPDATE_ORDER if desired,
  // but it does nothing each step (the accounting happens on request/release calls).
  update() { /* intentionally inert */ },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
  },
};

/** Ensure state.spawnBudget exists with a sane shape. Returns the budget record. */
export function ensureBudgetState(state) {
  if (!state.spawnBudget || typeof state.spawnBudget !== 'object' || Array.isArray(state.spawnBudget)) {
    state.spawnBudget = {};
  }
  const b = state.spawnBudget;
  if (!Number.isFinite(b.max)) b.max = DEFAULT_MAX;
  b.max = clampInt(b.max, MIN_MAX, HARD_MAX);
  // Both maps are transient. Entity binding lets lifecycle events release one exact slot without
  // guessing which system-owned count it belonged to.
  if (!(b.reservations instanceof Map)) b.reservations = new Map();
  for (const rec of b.reservations.values()) {
    if (!(rec.ids instanceof Set)) rec.ids = new Set();
  }
  if (!(b.entityOwners instanceof Map)) b.entityOwners = new Map();
  if (!Number.isFinite(b.used) || b.used < 0) b.used = recomputeUsed(b);
  if (!Number.isInteger(b._seq) || b._seq < 1) b._seq = 1;
  return b;
}

/** Build the ctx.helpers.spawnBudget API bound to a state. Exported for headless unit testing. */
export function makeBudgetApi(state) {
  const b = ensureBudgetState(state);

  function current() { return b.used; }
  function max() { return b.max; }
  function available() { return Math.max(0, b.max - b.used); }

  function request(n, requesterId) {
    const want = clampInt(n, 0, HARD_MAX);
    if (want <= 0) return 0;
    const grant = Math.min(want, available());
    if (grant <= 0) return 0;
    const key = requesterId == null ? '_anon' : String(requesterId);
    let rec = b.reservations.get(key);
    if (!rec) { rec = { count: 0, ids: new Set() }; b.reservations.set(key, rec); }
    rec.count += grant;
    b.used += grant;
    return grant;
  }

  function bindEntity(entityId, requesterId) {
    if (entityId == null) return false;
    const entityKey = String(entityId);
    const key = requesterId == null ? '_anon' : String(requesterId);
    const existingOwner = b.entityOwners.get(entityKey);
    if (existingOwner != null) return existingOwner === key;
    const rec = b.reservations.get(key);
    if (!rec || rec.ids.size >= rec.count) return false;
    rec.ids.add(entityKey);
    b.entityOwners.set(entityKey, key);
    return true;
  }

  function releaseEntity(entityId) {
    if (entityId == null) return 0;
    const entityKey = String(entityId);
    const key = b.entityOwners.get(entityKey);
    if (key == null) return 0;
    b.entityOwners.delete(entityKey);
    const rec = b.reservations.get(key);
    if (!rec || !rec.ids.delete(entityKey)) return 0;
    rec.count = Math.max(0, rec.count - 1);
    b.used = Math.max(0, b.used - 1);
    if (rec.count <= 0) b.reservations.delete(key);
    return 1;
  }

  // Free a requester's slots. Accepts a requesterId (frees ALL its slots), or an array of
  // requesterIds. Returns the number of slots actually freed. Idempotent / safe on unknown ids.
  function release(requesterIdOrIds) {
    if (Array.isArray(requesterIdOrIds)) {
      let freed = 0;
      for (const id of requesterIdOrIds) freed += release(id);
      return freed;
    }
    const key = requesterIdOrIds == null ? '_anon' : String(requesterIdOrIds);
    const rec = b.reservations.get(key);
    if (!rec) return 0;
    const freed = rec.count;
    for (const entityKey of rec.ids) b.entityOwners.delete(entityKey);
    b.reservations.delete(key);
    b.used = Math.max(0, b.used - freed);
    return freed;
  }

  // Release a specific number of slots for a requester (e.g. one ship of a squad died). Returns freed.
  function releaseSome(requesterId, n) {
    const key = requesterId == null ? '_anon' : String(requesterId);
    const rec = b.reservations.get(key);
    if (!rec) return 0;
    const freed = clampInt(n, 0, rec.count);
    // Failure paths normally release unbound grants. If a caller explicitly releases more than
    // that, detach a deterministic insertion-order prefix so stale entity events remain harmless.
    const boundToDetach = Math.max(0, freed - Math.max(0, rec.count - rec.ids.size));
    if (boundToDetach > 0) {
      let detached = 0;
      for (const entityKey of rec.ids) {
        rec.ids.delete(entityKey);
        b.entityOwners.delete(entityKey);
        if (++detached >= boundToDetach) break;
      }
    }
    rec.count -= freed;
    b.used = Math.max(0, b.used - freed);
    if (rec.count <= 0) b.reservations.delete(key);
    return freed;
  }

  function reset() {
    b.reservations.clear();
    b.entityOwners.clear();
    b.used = 0;
  }

  function setMax(v) {
    b.max = clampInt(v, MIN_MAX, HARD_MAX);
    return b.max;
  }

  function ownerForEntity(entityId) {
    return entityId == null ? null : (b.entityOwners.get(String(entityId)) || null);
  }

  return {
    request, bindEntity, releaseEntity, release, releaseSome,
    ownerForEntity, current, available, max, setMax, reset,
  };
}

function recomputeUsed(b) {
  let used = 0;
  if (b.reservations instanceof Map) for (const rec of b.reservations.values()) used += Math.max(0, rec.count | 0);
  return used;
}

function clampInt(v, lo, hi) {
  v = Math.floor(Number(v));
  if (!Number.isFinite(v)) return lo;
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/** Free-flight membership handoff: world emits continuous/noTeleport on Voronoi edge crosses. */
function isContinuousHandoff(p) {
  return !!(p && (p.continuous || p.noTeleport));
}
