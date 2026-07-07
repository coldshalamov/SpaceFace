// stationSideEventDirector.js — BP-11 packet A6 "Station Side-Events", the SEEDED DIRECTOR.
// (See design/revamp/detail/A_sector_station.md packet A6.)
//
// Mirrors encounterDirector's two-layer shape: (1) a PURE seeded planner (planStationSideEvents in
// data/stationSideEvents.js) decides WHAT could happen at a station today; (2) this 1 Hz runtime
// paces WHEN each item fires — anchored to the nearest VISIBLE station only, one event per
// MIN_SPACING_S, at most one BUDGETED side-event live per sector. Same rng discipline
// (mulberry32(hash32(seed, sectorId, dayIndex, stationId))), same "own only my state slice, every
// spawn is a spawnBudget client" contract.
//
// Budget lifecycle (the load-bearing invariant — total live ships never exceed spawnBudget.max()):
//   * Cosmetic events (budget 0): a `station:sideEvent` seam only — ZERO spawnBudget, ZERO sim
//     entities. The graphics lane draws the mover from the seam (handoff, like A2/A5/A7).
//   * A launching patrol (budget 1): request(1, eventId) → spawn ONE team-2 passive ship (never
//     hostile — scanner.isHostileToPlayer returns false for team 2) with despawnAt baked at
//     durationS. Removal is delegated to core.lifetimeSweep (mode-independent): at despawnAt it
//     flips alive=false and queues entity:destroyed → our listener releases the slot. So the slot
//     is freed ONLY AFTER the ship is actually gone — release can never precede removal.
//   * sector:exit clears our tracking WITHOUT releasing (spawnBudget self-resets its ledger on
//     sector:exit, exactly like encounterDirector). A straggler entity:destroyed then finds nothing
//     tracked and is a no-op — release is idempotent via the active-map lookup.
//
// Voice: NONE, ever (visual-only packet). Determinism: no Math.random, no wall clock; the pump does
// pure comparisons; per-station-day schedule is planned once (keyed) and fixed. Additive + guarded:
// no visible station → strict no-op; missing helpers → degrades to cosmetic; nothing near → inert
// (so the 47-A golden, which has no station beside the player and never jumps, is untouched).
//
// noTouch honored: world.js / encounterDirector.js / spawnBudget.js / traffic.js / combat.js are
// imported read-only where needed, never edited.

import { planStationSideEvents, SIDE_EVENTS } from '../data/stationSideEvents.js';
import { bubblesFor } from '../data/stationBubbles.js';
import { nearestVisibleStation } from './stationBroadcast.js';
import { makeShipEntitySpec } from './ships.js';

const DAY_SECONDS = 600;        // sector-day contract (mirrors encounterDirector)
const ANCHOR_RANGE = 1400;      // a station within this range of the player is "visible" for side-events
const MIN_SPACING_S = 25;       // min gap between fired side-events at a station
const DEFER_S = 15;             // re-check period for a due-but-blocked item
const MAX_BUDGETED = 1;         // concurrent BUDGETED side-events per sector (spawn-budget-war guard)
const PATROL_SHIP = 'ship_wasp';

export const stationSideEventDirector = {
  name: 'stationSideEventDirector',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    ensureState(this.state);
    if (this.bus && typeof this.bus.on === 'function') {
      this._onGone = (p) => this._onEntityDestroyed(p);
      this._onExit = () => this._onSectorExit();
      this._onLoaded = () => this._onSaveLoaded();
      this.bus.on('entity:destroyed', this._onGone);
      this.bus.on('sector:exit', this._onExit);
      this.bus.on('save:loaded', this._onLoaded);
    }
  },

  newGame() {
    this.state.stationSideEvents = freshState();
  },

  update(dt, state) {
    const s = ensureState(state);
    s.accum = (s.accum || 0) + dt;
    if (s.accum < 1) return;                 // 1 Hz — no per-frame work
    s.accum = 0;
    if (state.mode && state.mode !== 'flight') return;        // pacing is flight-only (cosmetic + spawn)
    if (isDocked(state) || isTutorialActive(state)) return;
    const now = state.simTime || 0;
    const station = this._resolveAnchor(state);
    if (!station) { s.anchorId = null; return; }              // no visible station → strict no-op
    s.anchorId = stationKey(station);
    this._planStation(state, station, now);
    this._pump(state, station, now);
  },

  // Nearest VISIBLE station (the packet's off-screen guard). Reuses the shipped A5 helper.
  _resolveAnchor(state) {
    return nearestVisibleStation(state, ANCHOR_RANGE);
  },

  // Plan a station-day's schedule ONCE, keyed on (sector, day, station). Cumulative delays →
  // pending stays ascending; dueAt is fixed at plan time (never recomputes dayIndex at fire time).
  _planStation(state, station, now) {
    const s = ensureState(state);
    const sectorId = currentSectorId(state);
    if (!sectorId) return;
    const day = Math.floor(now / DAY_SECONDS);
    const stId = stationKey(station);
    const key = `${sectorId}#${day}#${stId}`;
    if (s.plannedKeys[key] != null) return;
    s.plannedKeys[key] = day;
    const typeId = station.data && station.data.stationTypeId;
    const schedule = planStationSideEvents(state.meta && state.meta.seed, sectorId, day, stId, typeId);
    for (const item of schedule) {
      s.pending.push({ ...item, sectorId, stationId: stId, dueAt: now + item.delay });
    }
    // Bounded memory: drop plans older than yesterday.
    for (const k of Object.keys(s.plannedKeys)) {
      if (s.plannedKeys[k] < day - 1) delete s.plannedKeys[k];
    }
  },

  // Fire at most one due item for the CURRENT anchor per beat, spaced by MIN_SPACING_S.
  _pump(state, station, now) {
    const s = ensureState(state);
    if (!s.pending.length) return;
    if (now < s.nextFireAt) return;

    let idx = -1;
    let best = Infinity;
    for (let i = 0; i < s.pending.length; i++) {
      const it = s.pending[i];
      if (it.stationId !== s.anchorId) continue;          // items for un-anchored stations wait
      if (it.dueAt <= now && it.dueAt < best) { best = it.dueAt; idx = i; }
    }
    if (idx < 0) return;

    const item = s.pending[idx];
    if ((item.budget | 0) > 0 && countActive(s) >= MAX_BUDGETED) {
      item.dueAt = now + DEFER_S;                          // budgeted cap reached → defer, don't drop
      return;
    }
    s.pending.splice(idx, 1);
    this._fire(state, station, item, now);
  },

  _fire(state, station, item, now) {
    const s = ensureState(state);
    const geom = pathPoints(station, item);

    if ((item.budget | 0) <= 0) {
      this._emitSeam(item, station, geom, []);              // cosmetic: seam only, no budget, no entity
      s.nextFireAt = now + MIN_SPACING_S;
      return;
    }

    // Budgeted launching patrol — a real spawnBudget client.
    const budget = this.helpers && this.helpers.spawnBudget;
    const grant = budget && typeof budget.request === 'function' ? budget.request(1, item.eventId) : 1;
    if (grant < 1) {                                        // budget contention elsewhere → requeue, keep the slot free
      item.dueAt = now + DEFER_S;
      s.pending.push(item);
      return;
    }

    let spawnedId = null;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity === 'function') {
      try {
        const spec = makeShipEntitySpec(PATROL_SHIP, {
          team: 2,                                          // civilian/neutral — never hostile (scanner returns false for team 2)
          factionId: (station.data && station.data.factionId) || (station.factionId) || null,
          pos: { x: geom.from.x, z: geom.from.z },
          ai: { archetype: 'passive', passive: true },      // AI skips offensive behavior (traffic.js pattern)
        });
        const ent = spawnEntity(spec);
        if (ent && ent.id != null) {
          spawnedId = ent.id;
          ent.data = ent.data || {};
          ent.data.despawnAt = now + (item.durationS || 60); // leaves the bubble after its lifetime
          ent.data.sideEventId = item.eventId;
          ent.data.trafficLabel = 'patrol';
        }
      } catch (_) { spawnedId = null; }
    }

    if (spawnedId == null) {
      // Spawn helper absent or spec build failed — free the slot and degrade to a cosmetic seam.
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(item.eventId, grant);
      this._emitSeam(item, station, geom, []);
    } else {
      s.active[item.eventId] = { ids: [spawnedId], sectorId: item.sectorId };
      this._emitSeam(item, station, geom, [spawnedId]);
    }
    s.nextFireAt = now + MIN_SPACING_S;
  },

  // Additive seam for the graphics lane: draw the mover along from→to. entityIds populated for the
  // budgeted patrol (decorate that ship) or [] for a cosmetic mover (conjure a dressing mover).
  _emitSeam(item, station, geom, entityIds) {
    if (!this.bus || typeof this.bus.emit !== 'function') return;
    this.bus.emit('station:sideEvent', {
      eventId: item.eventId,
      kind: item.kind,
      stationId: stationKey(station),
      path: item.path,
      durationS: item.durationS,
      budget: item.budget | 0,
      bearing: item.bearing,
      from: { x: geom.from.x, z: geom.from.z },
      to: { x: geom.to.x, z: geom.to.z },
      entityIds: entityIds || [],
    });
  },

  // Budget release — idempotent via the active-map lookup (mirrors encounterDirector._onEntityGone).
  _onEntityDestroyed(p) {
    const id = p && p.id;
    if (id == null) return;
    const s = ensureState(this.state);
    for (const eventId of Object.keys(s.active)) {
      const rec = s.active[eventId];
      const i = rec.ids.indexOf(id);
      if (i === -1) continue;
      rec.ids.splice(i, 1);
      const budget = this.helpers && this.helpers.spawnBudget;
      if (budget && typeof budget.releaseSome === 'function') budget.releaseSome(eventId, 1);
      if (!rec.ids.length) delete s.active[eventId];
      break;
    }
  },

  _onSectorExit() {
    const s = ensureState(this.state);
    s.pending = [];
    s.active = {};              // spawnBudget resets its own ledger on sector:exit — no releaseSome here
    s.anchorId = null;
    s.nextFireAt = 0;
  },

  _onSaveLoaded() {
    // Live entity refs never persist; rebuild transients, keep nothing stale.
    this.state.stationSideEvents = freshState();
  },

  destroy() {
    if (this.bus && this.bus.off) {
      if (this._onGone) this.bus.off('entity:destroyed', this._onGone);
      if (this._onExit) this.bus.off('sector:exit', this._onExit);
      if (this._onLoaded) this.bus.off('save:loaded', this._onLoaded);
    }
    this._onGone = this._onExit = this._onLoaded = null;
  },
};

// ── pure geometry (exported for the check) ─────────────────────────────────────────────────────
/** from→to points for a side-event's symbolic path, on the A2 bubble rings at the item's bearing. */
export function pathPoints(station, item) {
  const b = bubblesFor(station);
  const c = (station && station.pos) || { x: 0, z: 0 };
  const ang = (item && item.bearing) || 0;
  const at = (radius) => ({ x: c.x + Math.cos(ang) * radius, z: c.z + Math.sin(ang) * radius });
  switch (item && item.path) {
    case 'inbound-to-docking':    return { from: at(b.traffic.radius),       to: at(b.docking.radius) };
    case 'outbound-past-traffic': return { from: at(b.docking.radius),       to: at(b.traffic.radius * 1.2) };
    case 'hull-crawl':            return { from: at(b.noFire.radius),        to: at(b.noFire.radius * 1.05) };
    case 'docking-orbit':         return { from: at(b.docking.radius),       to: at(b.docking.radius) };
    default:                      return { from: at(b.docking.radius),       to: at(b.traffic.radius) };
  }
}

// ── state + small helpers ──────────────────────────────────────────────────────────────────────

function freshState() {
  return { accum: 0, plannedKeys: {}, pending: [], anchorId: null, nextFireAt: 0, active: {} };
}

export function ensureState(state) {
  if (!state.stationSideEvents || typeof state.stationSideEvents !== 'object' || Array.isArray(state.stationSideEvents)) {
    state.stationSideEvents = freshState();
  }
  const s = state.stationSideEvents;
  if (!Number.isFinite(s.accum)) s.accum = 0;
  if (!s.plannedKeys || typeof s.plannedKeys !== 'object' || Array.isArray(s.plannedKeys)) s.plannedKeys = {};
  if (!Array.isArray(s.pending)) s.pending = [];
  if (!s.active || typeof s.active !== 'object' || Array.isArray(s.active)) s.active = {};
  if (!('anchorId' in s)) s.anchorId = null;
  if (!Number.isFinite(s.nextFireAt)) s.nextFireAt = 0;
  return s;
}

function countActive(s) {
  return Object.keys(s.active).length;
}

function stationKey(station) {
  if (!station) return null;
  return String(
    station.id != null ? station.id
      : station.stationId != null ? station.stationId
        : (station.data && station.data.stationId) != null ? station.data.stationId
          : 'station',
  );
}

function currentSectorId(state) {
  const w = state && state.world;
  return (w && w.currentSectorId) || null;
}

function isDocked(state) {
  return !!((state.player && state.player.flags && state.player.flags.docked) || (state.ui && state.ui.docked));
}

function isTutorialActive(state) {
  const ob = state.onboarding;
  return !!(ob && ob.active && !ob.finished);
}

export default stationSideEventDirector;
