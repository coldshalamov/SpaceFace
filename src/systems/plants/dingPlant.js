// PL-226 The ding — "In the Storm Lattice, the cable car dings at each pylon just before the arc
// comes. Move on the ding, not the arc."
//
// In a Storm Lattice arena (run.arenaId storm_*), the arena's own storm warning receipt
// (survivalArena:stormWarning — emitted before the discharge, with its segment walk and warning
// window) is the arc's approach. The plant turns that receipt into the cable car's dings: one
// ding per pylon on the coming arc's walk, spread across the warning window, each pylon's lamps
// pulsing as it dings. The ding is the telegraph; the arc is the arena's own stormResolve.
//
// Invariants:
// - Deterministic: dings are scheduled from the receipt's atSim/warningS, state.simTime only.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - One ding schedule per warning serial; bounded serial memory (memoryCap).
// - The dings always finish before the arena's warning window expires.

import { isSwarmRuleset } from '../survivalSwarm.js';

export const PLANTS_DING_EVENT = 'plants:ding';

export const DING_TUNING = Object.freeze({
  plId: 'pl226',
  stormArenaPrefix: 'storm_',
  dingGain: 0.55,
  dingRate: 1.5,
  lampFlashS: 0.35,
  serialMemoryCap: 8,
});

/** Pure: the ding schedule for a storm warning receipt — one ding per node, before expiry. */
export function dingScheduleFromWarning(payload, tuning = DING_TUNING) {
  if (!payload || !Array.isArray(payload.nodes) || payload.nodes.length === 0) return [];
  const atSim = Number.isFinite(payload.atSim) ? payload.atSim : 0;
  const warningS = Number.isFinite(payload.warningS) && payload.warningS > 0 ? payload.warningS : 2;
  const n = payload.nodes.length;
  const schedule = [];
  for (let i = 0; i < n; i += 1) {
    const node = payload.nodes[i];
    if (!node || !Number.isFinite(node.x) || !Number.isFinite(node.z)) continue;
    schedule.push({
      x: node.x, z: node.z,
      at: atSim + ((i + 1) * warningS) / (n + 1), // every ding strictly before the arc
      radius: Number.isFinite(node.radius) ? node.radius : 0,
    });
  }
  return schedule;
}

export const dingPlant = {
  modes: ['swarm'],
  name: 'plants226',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._unsubs = [];
    this._schedule = [];
    this._nextIndex = 0;
    this._serials = new Map();   // warning serial -> true (bounded)
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('survivalArena:stormWarning', (p) => this._onWarning(p));
    on('survivalArena:stormCancel', () => { this._schedule = []; this._nextIndex = 0; });
    on('run:ended', () => this._reset());
  },

  update() {
    const s = this.state;
    if (!s || !this.bus || this._nextIndex >= this._schedule.length) return;
    const now = finite(s.simTime, 0);
    while (this._nextIndex < this._schedule.length && this._schedule[this._nextIndex].at <= now) {
      const ding = this._schedule[this._nextIndex];
      this._nextIndex += 1;
      const pylon = this._pylonAt(ding);
      if (pylon) {
        pylon.data = pylon.data || {};
        pylon.data.lampsFlashing = true;
        pylon.data.lampFlashUntil = now + DING_TUNING.lampFlashS;
      }
      this.bus.emit('audio:cue', {
        id: 'confirm', position: { x: ding.x, z: ding.z }, gain: DING_TUNING.dingGain, rate: DING_TUNING.dingRate,
      });
      this.bus.emit(PLANTS_DING_EVENT, { kind: 'ding', x: ding.x, z: ding.z, at: ding.at, t: now });
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._schedule = [];
    this._nextIndex = 0;
    if (this._serials) this._serials.clear();
  },

  // ---- internals ----

  _liveRun() {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return null;
    if (run.phase === 'inactive' || run.phase === 'ended') return null;
    return run;
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _reset() {
    this._schedule = [];
    this._nextIndex = 0;
    if (this._serials) this._serials.clear();
  },

  _pylonAt(ding) {
    const entities = this.state && this.state.entities;
    if (!entities || typeof entities.values !== 'function') return null;
    let best = null;
    let bestSq = Infinity;
    for (const e of entities.values()) {
      if (!e || e.alive === false || !e.pos || !e.data) continue;
      // Room-solid pylon toys stamp data.roomToyId ('relay_<i>'); the entity id is
      // 'survival-room-w<wave>-<toyId>' (survivalArena.js:2169), never a bare relay_*.
      const toyId = e.data.roomToyId;
      if (typeof toyId !== 'string' || !toyId.startsWith('relay')) continue;
      const dx = e.pos.x - ding.x;
      const dz = e.pos.z - ding.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestSq) {
        best = e;
        bestSq = distSq;
      }
    }
    return best;
  },

  _onWarning(payload) {
    const run = this._liveRun();
    if (!run) return;
    if (!isStormArena(run.arenaId, DING_TUNING)) return;
    const serial = payload && payload.serial;
    if (serial != null) {
      if (this._serials.has(serial)) return; // one schedule per warning
      this._serials.set(serial, true);
      while (this._serials.size >= DING_TUNING.serialMemoryCap) {
        this._serials.delete(this._serials.keys().next().value);
      }
    }
    this._schedule = dingScheduleFromWarning(payload, DING_TUNING);
    this._nextIndex = 0;
    if (this._schedule.length > 0) {
      this.bus.emit(PLANTS_DING_EVENT, {
        kind: 'schedule', dings: this._schedule.length, serial: serial != null ? serial : null,
        t: this._now(),
      });
    }
  },
};

/** Pure: is this run a Storm Lattice floor? */
export function isStormArena(arenaId, tuning = DING_TUNING) {
  return typeof arenaId === 'string' && arenaId.startsWith(tuning.stormArenaPrefix);
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
