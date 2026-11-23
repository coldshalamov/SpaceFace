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
//   mintAllowance()          -> spawnEntity mints a deferrable caller may still spend this step
//   consumeMint(n)           -> spend up to n mints for this step (re-queue the unspent debt)
//   mintCap()/setMintCap(v)  -> the per-step mint bound

// Eight slots are reserved for ambient world ships, leaving sixteen for multiple light squads,
// an escort/controller, and a heavy anchor without lifting the hard safety ceiling below.
const DEFAULT_MAX = 24;
const MIN_MAX = 1;
const HARD_MAX = 40;      // absolute ceiling so a bad override can never explode the sim

// Per-step mint lane (D-burst fix): every granted reservation implies spawnEntity construction
// work — construction, index append, dirty membership, activity reclassification — that used to
// all land inside the same step the grant was spent in. The lane counts the mints a step is
// asked to absorb, tick-keyed so it is deterministic and never wall-clock:
//   request()      records its grant — the caller mints those bodies synchronously, so the
//                  step is charged for the construction it is about to do.
//   consumeMint(n) is for DEFERRABLE work only (corpse decoration, wave materialization
//                  debts): it grants up to n mints for this step and the caller re-queues
//                  what did not fit — owe, never drop.
//   mintAllowance() reads the lane without spending it.
// The lane is advisory: it binds no slots and refuses no reservation. A step that genuinely
// needs more mints than the cap can still take them via request() — the cap exists so the
// callers that CAN spread work across ticks have one shared accounting to spread through.
const STEP_MINT_CAP = 16;
const MIN_MINT_CAP = 1;
const HARD_MINT_CAP = 64;

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
      this._unsubs.push(this.bus.on('entity:destroyed', (p) => {
        // Queued receipts are id-keyed but ids recycle: a destroy queued for an id's previous
        // occupant can flush after a different entity took the id — even a live one — and must
        // not release the new occupant's binding. The receipt carries the destroyed entity ref;
        // releaseEntity compares it against the binding's recorded owner generation (D70).
        api.releaseEntity(p && p.id, p && p.entity);
      }));
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
  // guessing which system-owned count it belonged to. entityRefs records WHICH entity object a
  // binding belongs to so a stale destroy receipt from a recycled id cannot release the new
  // occupant's slot.
  if (!(b.reservations instanceof Map)) b.reservations = new Map();
  for (const rec of b.reservations.values()) {
    if (!(rec.ids instanceof Set)) rec.ids = new Set();
  }
  if (!(b.entityOwners instanceof Map)) b.entityOwners = new Map();
  if (!(b.entityRefs instanceof Map)) b.entityRefs = new Map();
  if (!Number.isFinite(b.used) || b.used < 0) b.used = recomputeUsed(b);
  if (!Number.isInteger(b._seq) || b._seq < 1) b._seq = 1;
  // Mint lane state: _mintTick/mintedThisStep are per-step transients (lazily re-zeroed on
  // the first call of each tick); mintCap persists like max.
  if (!Number.isFinite(b.mintCap)) b.mintCap = STEP_MINT_CAP;
  b.mintCap = clampInt(b.mintCap, MIN_MINT_CAP, HARD_MINT_CAP);
  if (!Number.isFinite(b.mintedThisStep) || b.mintedThisStep < 0) b.mintedThisStep = 0;
  return b;
}

/** Build the ctx.helpers.spawnBudget API bound to a state. Exported for headless unit testing. */
export function makeBudgetApi(state) {
  const b = ensureBudgetState(state);

  function current() { return b.used; }
  function max() { return b.max; }
  function available() { return Math.max(0, b.max - b.used); }

  // Mint lane: reset on the first mint call of each sim tick (state.tick is the only clock —
  // deterministic, never wall time). Callers that never mint still get a correct lane.
  function touchMintLane() {
    const tick = state && Number.isFinite(state.tick) ? state.tick | 0 : 0;
    if (b._mintTick !== tick) {
      b._mintTick = tick;
      b.mintedThisStep = 0;
    }
  }

  // Mints a deferrable caller may still spend this step.
  function mintAllowance() {
    touchMintLane();
    return Math.max(0, (b.mintCap | 0) - (b.mintedThisStep | 0));
  }

  // Spend up to n mints for this step. Returns the granted count — callers re-queue the
  // debt they could not spend (the lane owes them next tick; it never drops their work).
  function consumeMint(n = 1) {
    touchMintLane();
    const want = clampInt(n, 0, HARD_MINT_CAP);
    const granted = Math.min(want, mintAllowance());
    if (granted > 0) b.mintedThisStep = (b.mintedThisStep | 0) + granted;
    return granted;
  }

  function mintCap() { return b.mintCap | 0; }
  function setMintCap(v) {
    b.mintCap = clampInt(v, MIN_MINT_CAP, HARD_MINT_CAP);
    return b.mintCap;
  }

  function request(n, requesterId) {
    // A Crucible round owns its combat population. Adventure patrols, missions
    // and traffic cannot consume its slots or arrive as unscored attackers.
    if (state.run?.kind === 'survival' && state.run.phase !== 'inactive'
      && !String(requesterId || '').startsWith('survival-wave:')) return 0;
    const want = clampInt(n, 0, HARD_MAX);
    if (want <= 0) return 0;
    const grant = Math.min(want, available());
    if (grant <= 0) return 0;
    const key = requesterId == null ? '_anon' : String(requesterId);
    let rec = b.reservations.get(key);
    if (!rec) { rec = { count: 0, ids: new Set() }; b.reservations.set(key, rec); }
    rec.count += grant;
    b.used += grant;
    // The grant implies same-step construction: charge the mint lane so deferrable mints
    // (corpse decoration drains) see the construction this step is already committed to.
    touchMintLane();
    b.mintedThisStep = (b.mintedThisStep | 0) + grant;
    return grant;
  }

  function bindEntity(entityId, requesterId) {
    if (entityId == null) return false;
    const entityKey = String(entityId);
    const key = requesterId == null ? '_anon' : String(requesterId);
    const existingOwner = b.entityOwners.get(entityKey);
    if (existingOwner != null) {
      const rebound = state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(entityId)
        : null;
      // A binding whose recorded entity is no longer the id's occupant is stale: its release is
      // still queued on the bus. Reclaim it for the entity actually holding the id now instead
      // of leaving the fresh occupant unbound (D70).
      const staleRef = b.entityRefs.get(entityKey);
      if (staleRef != null && rebound != null && staleRef !== rebound) {
        const staleRec = b.reservations.get(existingOwner);
        if (staleRec && staleRec.ids.delete(entityKey)) {
          staleRec.count = Math.max(0, staleRec.count - 1);
          b.used = Math.max(0, b.used - 1);
          if (staleRec.count <= 0) b.reservations.delete(existingOwner);
        }
        b.entityOwners.delete(entityKey);
        b.entityRefs.delete(entityKey);
      } else {
        if (existingOwner !== key) return false;
        if (rebound) b.entityRefs.set(entityKey, rebound);
        return true;
      }
    }
    const rec = b.reservations.get(key);
    if (!rec || rec.ids.size >= rec.count) return false;
    rec.ids.add(entityKey);
    b.entityOwners.set(entityKey, key);
    const bound = state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(entityId)
      : null;
    if (bound) b.entityRefs.set(entityKey, bound);
    return true;
  }

  function releaseEntity(entityId, entity) {
    if (entityId == null) return 0;
    const entityKey = String(entityId);
    const key = b.entityOwners.get(entityKey);
    if (key == null) return 0;
    // Generation check: when the destroyed receipt names an entity ref, the binding it may
    // release is only the one recorded for that same object. A recycled id's new binding —
    // recorded for a different live entity — is not this receipt's to free.
    const boundRef = b.entityRefs.get(entityKey);
    if (entity != null && boundRef != null && boundRef !== entity) return 0;
    b.entityOwners.delete(entityKey);
    b.entityRefs.delete(entityKey);
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
    for (const entityKey of rec.ids) {
      b.entityOwners.delete(entityKey);
      b.entityRefs.delete(entityKey);
    }
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
        b.entityRefs.delete(entityKey);
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
    b.entityRefs.clear();
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
    mintAllowance, consumeMint, mintCap, setMintCap,
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
