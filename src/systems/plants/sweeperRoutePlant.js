// PL-213 The sweeper's route — "The janitor's path between rounds is the cleanest line on the
// floor — it sweeps round every hazard on the map. Follow it once and learn the room."
//
// The between-round window opens on `run:transitioned` into cleanup/draft/refit (run:waveCleared
// only ever emits while the round is still active, so the transition receipt is the real
// between-rounds seam). The plant sends one sweeper prop across the floor, along the cleanest
// line: the route that bends round every live hazard it can see (barrels/mines), so following
// it teaches the room. The route is emitted once as an event receipt.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; route geometry is pure, no Math.random.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - The sweeper is a plant-owned prop (data.runtimeOwner 'plants'), despawned at wave start.
// - Bounded Maps (memoryCap); hazard scan bounded; one sweeper per between-round window.

import { isSwarmRuleset } from '../survivalSwarm.js';

export const PLANTS_SWEEPER_ROUTE_EVENT = 'plants:sweeperRoute';

export const SWEEPER_ROUTE_TUNING = Object.freeze({
  plId: 'pl213',
  betweenRoundPhases: Object.freeze(['cleanup', 'refit', 'draft']),
  arenaCenter: Object.freeze({ x: 0, z: 0 }),
  sweepLengthWu: 1400,         // the clean line runs the floor's long axis
  sweepSpeedWuS: 90,
  hazardClearanceWu: 120,      // how far the route bends round a hazard
  hazardKinds: Object.freeze(['barrel', 'mine', 'hazard']),
  hazardScanCap: 64,
  sweeperRadiusWu: 10,
  sweeperHull: 320,
  ttlS: 120,
  memoryCap: 8,
});

/**
 * Pure: the sweeper's waypoints across the floor, bending round each hazard (sorted along the
 * run so the bend happens in order). Returns [{x, z}] — start, one bend per hazard, end.
 */
export function sweeperRoute(center, hazards, tuning = SWEEPER_ROUTE_TUNING) {
  const c = center || tuning.arenaCenter;
  const half = tuning.sweepLengthWu / 2;
  const waypoints = [{ x: c.x - half, z: c.z }];
  const sorted = (hazards || [])
    .filter((h) => h && Number.isFinite(h.x) && Number.isFinite(h.z) && Math.abs(h.x - c.x) <= half + tuning.hazardClearanceWu)
    .sort((a, b) => a.x - b.x);
  for (const h of sorted) {
    const side = h.z >= c.z ? -1 : 1; // bend away from the hazard
    waypoints.push({ x: h.x, z: c.z + side * tuning.hazardClearanceWu });
    waypoints.push({ x: h.x, z: c.z });
  }
  waypoints.push({ x: c.x + half, z: c.z });
  return waypoints;
}

/** Pure: hazard candidates from an entity snapshot (bounded kinds). */
export function hazardPositionsFrom(entities, tuning = SWEEPER_ROUTE_TUNING) {
  if (!entities || typeof entities.values !== 'function') return [];
  const hazards = [];
  let scanned = 0;
  for (const e of entities.values()) {
    if (scanned >= tuning.hazardScanCap) break;
    scanned += 1;
    if (!e || e.alive === false || !e.pos || !e.data) continue;
    if (!tuning.hazardKinds.includes(e.data.kind)) continue;
    hazards.push({ x: e.pos.x, z: e.pos.z });
    if (hazards.length >= 8) break;
  }
  return hazards;
}

/** Pure: walk progress along the waypoint chain. */
export function routeProgress(waypoints, traveledWu) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return null;
  let remaining = Math.max(0, traveledWu);
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const leg = Math.hypot(b.x - a.x, b.z - a.z) || 1e-6;
    if (remaining <= leg) {
      const f = remaining / leg;
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, done: false };
    }
    remaining -= leg;
  }
  const last = waypoints[waypoints.length - 1];
  return { x: last.x, z: last.z, done: true };
}

export const sweeperRoutePlant = {
  name: 'plants213',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._sweeperId = null;
    this._route = null;
    this._traveled = 0;
    this._expiresAt = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:transitioned', (p) => this._onTransitioned(p));
    on('run:waveStarted', () => this._despawn('round_started'));
    on('run:ended', () => this._despawn('run_ended'));
  },

  update(dt) {
    const s = this.state;
    if (!s || this._sweeperId == null || !this._route) return;
    const now = finite(s.simTime, 0);
    if (now >= this._expiresAt) return this._despawn('ttl');
    const step = SWEEPER_ROUTE_TUNING.sweepSpeedWuS * Math.max(0, finite(dt, 0));
    this._traveled += step;
    const at = routeProgress(this._route, this._traveled);
    const sweeper = this._entity(this._sweeperId);
    if (!sweeper || sweeper.alive === false) return this._despawn('gone');
    if (!at) return this._despawn('no_route');
    sweeper.pos.x = at.x;
    sweeper.pos.z = at.z;
    if (at.done) {
      this.bus.emit(PLANTS_SWEEPER_ROUTE_EVENT, { kind: 'route_end', sweeperId: this._sweeperId, t: now });
      this._despawn('route_done');
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._despawn('destroy');
    this._route = null;
  },

  // ---- internals ----

  _liveRun() {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return null;
    if (!SWEEPER_ROUTE_TUNING.betweenRoundPhases.includes(run.phase)) return null;
    return run;
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _entity(id) {
    const s = this.state;
    if (id == null || !s || !s.entities || typeof s.entities.get !== 'function') return null;
    return s.entities.get(id) || null;
  },

  _despawn(reason) {
    if (this._sweeperId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(this._sweeperId);
    }
    this._sweeperId = null;
    this._route = null;
    this._traveled = 0;
  },

  _onTransitioned(payload) {
    const run = this._liveRun();
    if (!run) return;
    const phase = payload && payload.phase;
    if (!SWEEPER_ROUTE_TUNING.betweenRoundPhases.includes(phase)) return this._despawn('round_started');
    if (this._sweeperId != null) return; // one sweeper per window
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const hazards = hazardPositionsFrom(this.state.entities, SWEEPER_ROUTE_TUNING);
    const route = sweeperRoute(SWEEPER_ROUTE_TUNING.arenaCenter, hazards, SWEEPER_ROUTE_TUNING);
    const start = route[0];
    const spawned = spawnEntity({
      type: 'debris',
      pos: { x: start.x, z: start.z },
      vel: { x: 0, z: 0 },
      radius: SWEEPER_ROUTE_TUNING.sweeperRadiusWu,
      hull: SWEEPER_ROUTE_TUNING.sweeperHull,
      collides: true,
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: 'the sweeper',
        swarmFloorPad: { label: 'THE SWEEPER' },
        lampsFlashing: true,
        plants: { [SWEEPER_ROUTE_TUNING.plId]: { role: 'sweeper' } },
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    this._sweeperId = id;
    this._route = route;
    this._traveled = 0;
    this._expiresAt = this._now() + SWEEPER_ROUTE_TUNING.ttlS;
    // The route receipt is the row's teach: follow it once and learn the room.
    this.bus.emit(PLANTS_SWEEPER_ROUTE_EVENT, {
      kind: 'route', sweeperId: id, waypoints: route, hazards: hazards.length, t: this._now(),
    });
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
