// PL-114 Sponsorship — "Between rounds a banner drone circles the floor. Throw it into the lane
// and the freight takes its banner — the next Wasp through wears it, blind.
// Kiln: *'The sponsors are thrilled.'*" — Do it on purpose; the blind one charges someone.
//
// The between-round window opens on `run:transitioned` into cleanup/draft/refit (run:waveCleared
// only ever emits while the round is still active — survivalWave.js:1876 — so the transition
// receipt is the real "between rounds" seam). The plant spawns one banner drone prop that
// circles the arena center. A thrown-body death or a crush receipt on the drone during the
// window is "thrown into the lane": the banner is armed. When a Wasp actually spawns through
// the seam while the banner is armed, the plant stamps it blind and only then does Kiln deliver
// her line — no Wasp to stamp, no line.
//
// Invariants:
// - Deterministic: state.simTime only; no Math.random/Date.now; circling uses simTime phase.
// - Observes the Pit purely via bus events + this.state.run polling; zero edits to swarm files.
// - Never writes state.run; all plant state lives on `this` (session-only).
// - The blind stamp is a data flag (data.plants.pl114); the actual charge behavior belongs to
//   the swarm AI owner and is NOT simulated here (the blind_wasp receipt is the declared seam
//   handoff — no consumer exists yet).
// - Bounded Maps capped by tuning.memoryCap; one drone per window, one Kiln line per stamp.

import { isSwarmRuleset } from '../survivalSwarm.js';

export const PLANTS_SPONSORSHIP_EVENT = 'plants:sponsorship';

export const SPONSORSHIP_TUNING = Object.freeze({
  plId: 'pl114',
  droneRadiusWu: 14,
  droneHull: 320,
  droneTtlS: 90,            // despawns when the round starts (or this TTL)
  orbitRadiusWu: 520,       // the drone circles the floor around the arena center
  orbitPeriodS: 24,
  betweenRoundPhases: Object.freeze(['cleanup', 'refit', 'draft']),
  bannerWasps: 1,           // the next Wasp through wears the banner
  bannerWindowS: 30,        // the banner expires if no Wasp spawns inside it
  waspArchetypeId: 'wasp_swarmer',
  memoryCap: 8,
});

export const SPONSORSHIP_KILN_LINE = 'The sponsors are thrilled.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Pure: is this transitioned phase inside the between-round window? */
export function isBetweenRounds(phase, tuning = SPONSORSHIP_TUNING) {
  return typeof phase === 'string' && tuning.betweenRoundPhases.includes(phase);
}

/** Pure: does this spawned-entity receipt carry the Wasp archetype the banner fits? */
export function isWaspSpawn(entity, tuning = SPONSORSHIP_TUNING) {
  const d = entity && entity.data;
  if (!d) return false;
  return d.lootTableId === tuning.waspArchetypeId || d.enemyTypeId === tuning.waspArchetypeId;
}

export const sponsorshipPlant = {
  name: 'plants114',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._droneId = null;
    this._droneExpiresAt = 0;
    this._bannerArmed = false;
    this._bannerUntil = 0;
    this._kilnSaidThisRun = false;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:transitioned', (p) => this._onTransitioned(p));
    on('run:waveStarted', () => this._despawnDrone('round_started'));
    on('run:ended', () => this._reset('run_ended'));
    on('entity:killed', (p) => this._onDroneLost(p && p.id, 'killed'));
    on('combat:crushed', (p) => this._onDroneLost(p && p.entityId, 'crushed'));
    on('entity:spawned', (p) => this._onSpawned(p));
  },

  update() {
    const s = this.state;
    if (!s) return;
    const now = finite(s.simTime, 0);
    // Drone expiry (no per-tick work while no drone is out).
    if (this._droneId != null && now >= this._droneExpiresAt) this._despawnDrone('ttl');
    if (this._bannerArmed && now >= this._bannerUntil) {
      this._bannerArmed = false;
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._despawnDrone('destroy');
    this._bannerArmed = false;
    this._kilnSaidThisRun = false;
  },

  // ---- internals ----

  _liveRun() {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return null;
    if (run.phase === 'inactive' || run.phase === 'ended' || run.phase === 'victory') return null;
    return run;
  },

  _now() {
    return finite(this.state && this.state.simTime, 0);
  },

  _despawnDrone(reason) {
    if (this._droneId == null) return;
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      this.helpers.removeEntity(this._droneId);
    }
    this._droneId = null;
  },

  _spawnDrone() {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const spawned = spawnEntity({
      type: 'debris',
      pos: { x: SPONSORSHIP_TUNING.orbitRadiusWu, z: 0 },
      vel: { x: 0, z: 0 },
      radius: SPONSORSHIP_TUNING.droneRadiusWu,
      hull: SPONSORSHIP_TUNING.droneHull,
      collides: true,
      data: {
        runtimeOwner: 'plants',
        parentType: 'story_prop',
        scanLabel: 'banner drone',
        swarmFloorPad: { label: 'SPONSORS <3 U' },
        plants: { [SPONSORSHIP_TUNING.plId]: { role: 'banner_drone' } },
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    this._droneId = id;
    this._droneExpiresAt = this._now() + SPONSORSHIP_TUNING.droneTtlS;
    this.bus.emit(PLANTS_SPONSORSHIP_EVENT, { kind: 'drone_out', droneId: id, t: this._now() });
  },

  // Between rounds opens here: the machine has already committed the new phase.
  _onTransitioned(payload) {
    const run = this._liveRun();
    if (!run) return;
    const phase = payload && payload.phase;
    if (isBetweenRounds(phase, SPONSORSHIP_TUNING)) {
      if (this._droneId != null) return; // one drone per between-round window
      this._spawnDrone();
      return;
    }
    this._despawnDrone('round_started');
  },

  // A thrown-body death or a crush receipt on the drone = thrown into the lane.
  _onDroneLost(id, via) {
    if (id == null || id !== this._droneId) return;
    const run = this._liveRun();
    this._droneId = null;
    if (!run || !isBetweenRounds(run.phase, SPONSORSHIP_TUNING)) return;
    this._bannerArmed = true;
    this._bannerUntil = this._now() + SPONSORSHIP_TUNING.bannerWindowS;
    this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.7, rate: 1 });
    this.bus.emit(PLANTS_SPONSORSHIP_EVENT, {
      kind: 'banner_armed', via, bannerWasps: SPONSORSHIP_TUNING.bannerWasps, t: this._now(),
    });
  },

  // Kiln speaks only when a real Wasp body is here to take the banner.
  _onSpawned(p) {
    if (!this._bannerArmed) return;
    const ent = p && p.entity ? p.entity : null;
    if (!isWaspSpawn(ent, SPONSORSHIP_TUNING)) return;
    this._bannerArmed = false;
    const now = this._now();
    ent.data = ent.data || {};
    ent.data.plants = { ...(ent.data.plants || {}), [SPONSORSHIP_TUNING.plId]: { blind: true } };
    ent.data.lampsFlashing = false; // blind: nav lamps dead
    if (!this._kilnSaidThisRun) {
      this._kilnSaidThisRun = true;
      this.bus.emit('voice:say', {
        channel: 'comms', id: 'plants:pl114:kiln', text: SPONSORSHIP_KILN_LINE, ttl: 6,
      });
    }
    this.bus.emit(PLANTS_SPONSORSHIP_EVENT, {
      kind: 'blind_wasp', waspId: p.id, t: now,
    });
  },

  _reset(reason) {
    this._despawnDrone(reason);
    this._bannerArmed = false;
    this._kilnSaidThisRun = false;
  },
};
