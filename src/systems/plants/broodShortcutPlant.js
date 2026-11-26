// PL-224 The Brood's shortcut — "In the Hive, a wall you cut stays cut for the run — and the
// Brood uses your cut too, every one you did not need. Cut only what you need."
//
// In the Hive arena (run.arenaId 'the_hive' — survivalCircuit.js:204), every hive sac/wall kill
// is a cut. The plant keeps the
// cut ledger for the run, marks the cut with a persistent plant-owned marker (the wall "stays
// cut"), and from the second cut on reports the brood-follows receipt: the Brood takes your
// cut too. The Brood's actual pathing belongs to the wave planner owner; the plant publishes
// the receipt it can act on.
//
// Invariants:
// - Deterministic: state.simTime only; no Math.random/Date.now.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - Cuts ledger bounded (memoryCap); markers are plant-owned and die with the run/destroy.
// - Hive arenas only; non-hive floors never arm.

import { isSwarmRuleset } from '../survivalSwarm.js';

export const PLANTS_BROOD_SHORTCUT_EVENT = 'plants:broodShortcut';

export const BROOD_SHORTCUT_TUNING = Object.freeze({
  plId: 'pl224',
  hiveArenaId: 'the_hive',     // survivalCircuit.js:204
  markerRadiusWu: 8,
  markerHull: 160,
  broodFollowsFrom: 2,         // from the second cut the Brood takes the shortcut too
  memoryCap: 16,               // cut ledger cap
});

/** Pure: is this run the Hive floor? */
export function isHiveArena(arenaId, tuning = BROOD_SHORTCUT_TUNING) {
  return arenaId === tuning.hiveArenaId;
}

/** Pure: the receipt kind for a cut count. */
export function cutReceiptKind(cutCount, tuning = BROOD_SHORTCUT_TUNING) {
  return cutCount >= tuning.broodFollowsFrom ? 'brood_follows' : 'cut_open';
}

export const broodShortcutPlant = {
  modes: ['swarm'],
  name: 'plants224',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._cuts = [];             // [{ wave, t }] — the run's cut ledger
    this._markerIds = [];        // plant-owned "stays cut" markers
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('swarm:hiveSacKilled', (p) => this._onCut(p));
    on('run:ended', () => this._reset('run_ended'));
  },

  update() { /* event-driven */ },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._despawnMarkers('destroy');
    this._cuts = [];
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

  _despawnMarkers(reason) {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of this._markerIds) this.helpers.removeEntity(id);
    }
    this._markerIds = [];
  },

  _reset(reason) {
    this._despawnMarkers(reason);
    this._cuts = [];
  },

  _spawnMarker(at, wave) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const spawned = spawnEntity({
      type: 'debris',
      pos: { x: at.x, z: at.z },
      vel: { x: 0, z: 0 },
      radius: BROOD_SHORTCUT_TUNING.markerRadiusWu,
      hull: BROOD_SHORTCUT_TUNING.markerHull,
      collides: false,
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: 'your cut',
        lampsFlashing: true,
        plants: { [BROOD_SHORTCUT_TUNING.plId]: { role: 'cut_marker', wave } },
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    return id == null ? null : id;
  },

  _onCut(payload) {
    const run = this._liveRun();
    if (!run) return;
    if (!isHiveArena(run.arenaId, BROOD_SHORTCUT_TUNING)) return;
    if (this._cuts.length >= BROOD_SHORTCUT_TUNING.memoryCap) return; // bounded ledger
    const now = this._now();
    const wave = finite(payload && payload.wave, finite(run.wave, 0));
    this._cuts.push({ wave, t: now });
    const sacId = payload && payload.sacId;
    const sac = sacId != null && this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(sacId) : null;
    const at = sac && sac.pos ? { x: sac.pos.x, z: sac.pos.z } : null;
    let markerId = null;
    if (at) markerId = this._spawnMarker(at, wave);
    if (markerId != null) this._markerIds.push(markerId);
    const kind = cutReceiptKind(this._cuts.length, BROOD_SHORTCUT_TUNING);
    if (kind === 'brood_follows') {
      this.bus.emit('audio:cue', { id: 'warning', position: at, gain: 0.7, rate: 0.9 });
    }
    this.bus.emit(PLANTS_BROOD_SHORTCUT_EVENT, {
      kind,
      cutCount: this._cuts.length,
      sacId: sacId != null ? sacId : null,
      markerId,
      at,
      wave,
      t: now,
    });
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
