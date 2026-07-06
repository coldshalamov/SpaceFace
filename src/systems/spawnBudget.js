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
//   release(requesterIdOrIds) -> frees a requester's slots (string, or a specific reservation id, or
//                                an array of either); returns the number of slots freed
//   current()                -> slots currently reserved
//   available()              -> MAX - current()
//   max()                    -> the cap
//   reset()                  -> clear all reservations (used on sector change / new game / load)

const DEFAULT_MAX = 12;   // target live NPC/hostile cap (~10-14); tunable via state.spawnBudget.max
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

    if (this.bus && typeof this.bus.on === 'function') {
      // Reset on sector:EXIT (fired at the START of a jump, before the destination sector spawns) — NOT
      // sector:enter. world.js reserves its ambient allotment DURING enterSector, before it emits
      // sector:enter; resetting on enter would wipe that reservation. Exiting clears the old sector's
      // ledger (its entities are despawned with the sector); the first-ever entry has no exit, and
      // ensureBudgetState already starts the ledger empty. save:loaded also resets (re-entry re-reserves).
      this.bus.on('sector:exit', () => api.reset());
      this.bus.on('save:loaded', () => api.reset());
    }
  },

  newGame() {
    ensureBudgetState(this.state);
    if (this.api) this.api.reset();
  },

  // Pure ledger — no per-tick work. Present so the system slots cleanly into UPDATE_ORDER if desired,
  // but it does nothing each step (the accounting happens on request/release calls).
  update() { /* intentionally inert */ },
};

/** Ensure state.spawnBudget exists with a sane shape. Returns the budget record. */
export function ensureBudgetState(state) {
  if (!state.spawnBudget || typeof state.spawnBudget !== 'object' || Array.isArray(state.spawnBudget)) {
    state.spawnBudget = {};
  }
  const b = state.spawnBudget;
  if (!Number.isFinite(b.max)) b.max = DEFAULT_MAX;
  b.max = clampInt(b.max, MIN_MAX, HARD_MAX);
  // reservations: requesterId -> { count, ids:Set<reservationId> }. Kept as a plain object for
  // serializability is unnecessary (transient), but a Map is fine because budget is never persisted.
  if (!(b.reservations instanceof Map)) b.reservations = new Map();
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
    rec.count -= freed;
    b.used = Math.max(0, b.used - freed);
    if (rec.count <= 0) b.reservations.delete(key);
    return freed;
  }

  function reset() {
    b.reservations.clear();
    b.used = 0;
  }

  function setMax(v) {
    b.max = clampInt(v, MIN_MAX, HARD_MAX);
    return b.max;
  }

  return { request, release, releaseSome, current, available, max, setMax, reset };
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
