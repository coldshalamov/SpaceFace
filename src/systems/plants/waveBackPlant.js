// PL-212 The wave-back — "Flash your lamps at the stands between rounds and a whole section
// flashes back. Play to them; they came for this."
//
// The row's literal trigger — a lamp-flash input — has no seam in today's Pit (no lamp action is
// wired in swarm). The same gesture reachable through the ordinary route today is gunfire at the
// stands rail between rounds: muzzle flash, twice, aimed at the crowd (declared substitute).
// Once per run the plant benches a small section of rail beacon props at the stands ring; when
// the wave-back lands, the beacons nearest the player's flash stamp lampsFlashing — the section
// visibly flashes back, not just a number.
//
// Invariants:
// - Deterministic: state.simTime only; beacon placement is fixed angles, no Math.random.
// - Observes via bus events + polling; zero edits to swarm files; never writes state.run.
// - Beacons are plant-owned props (data.runtimeOwner 'plants'), capped, despawned at run end.
// - Bounded Maps (memoryCap); one flashback per between-round window.

import { isSwarmRuleset } from '../survivalSwarm.js';

export const PLANTS_WAVE_BACK_EVENT = 'plants:waveBack';

export const WAVE_BACK_TUNING = Object.freeze({
  plId: 'pl212',
  betweenRoundPhases: Object.freeze(['cleanup', 'refit', 'draft']),
  arenaCenter: Object.freeze({ x: 0, z: 0 }),
  standsRadiusWu: 1500,        // the rail: shots this far out read as fired at the stands
  beaconCount: 4,              // one benched section of the rail
  beaconRadiusWu: 6,
  beaconHull: 120,
  beaconAngles: Object.freeze([0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]),
  shotsNeeded: 2,              // a proper wave: two flashes
  shotWindowS: 2.5,
  flashbackS: 4,
  flashNearestBeacons: 2,      // the section nearest the flash
  sectionLamps: 12,            // one whole section of lamps
  memoryCap: 4,
});

/** Pure: was this shot fired near the stands rail (inside the stands band)? */
export function isShotAtStands(origin, center = WAVE_BACK_TUNING.arenaCenter, tuning = WAVE_BACK_TUNING) {
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return false;
  const dx = origin.x - center.x;
  const dz = origin.z - center.z;
  return Math.hypot(dx, dz) >= tuning.standsRadiusWu * 0.55;
}

/** Pure: the wave-back verdict for a shot tally inside the window. */
export function waveBackVerdict(shots, tuning = WAVE_BACK_TUNING) {
  return shots >= tuning.shotsNeeded ? 'flashback' : 'waiting';
}

/** Pure: the k nearest beacon entries (by id) to a point. */
export function nearestBeacons(beacons, origin, k = WAVE_BACK_TUNING.flashNearestBeacons) {
  if (!origin || !Array.isArray(beacons)) return [];
  return beacons
    .map((b) => {
      const dx = b.pos.x - origin.x;
      const dz = b.pos.z - origin.z;
      return { id: b.id, distSq: dx * dx + dz * dz };
    })
    .sort((a, b) => a.distSq - b.distSq)
    .slice(0, Math.max(0, k))
    .map((r) => r.id);
}

export const waveBackPlant = {
  name: 'plants212',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._beaconIds = [];        // benched rail section, spawned once per run
    this._shotTimes = [];        // bounded ring of shot simTimes inside the window
    this._flashedWindow = false;
    this._flashUntil = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('run:transitioned', (p) => this._onTransitioned(p));
    on('combat:fire', (p) => this._onShot(p));
    on('run:waveStarted', () => { this._shotTimes = []; this._flashedWindow = false; });
    on('run:ended', () => this._reset('run_ended'));
  },

  update() {
    const s = this.state;
    if (!s || !this.bus) return;
    const now = finite(s.simTime, 0);
    if (this._flashedWindow && now >= this._flashUntil) {
      this._flashedWindow = false;
      this.bus.emit(PLANTS_WAVE_BACK_EVENT, { kind: 'flashback_over', t: now });
    }
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._despawnBeacons('destroy');
    this._shotTimes = [];
    this._flashedWindow = false;
    this._flashUntil = 0;
  },

  // ---- internals ----

  _liveRun() {
    const run = this.state && this.state.run;
    if (!run || run.kind !== 'survival' || !isSwarmRuleset(run.ruleset)) return null;
    if (!WAVE_BACK_TUNING.betweenRoundPhases.includes(run.phase)) return null;
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

  _despawnBeacons(reason) {
    if (this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of this._beaconIds) this.helpers.removeEntity(id);
    }
    this._beaconIds = [];
  },

  _reset(reason) {
    this._despawnBeacons(reason);
    this._shotTimes = [];
    this._flashedWindow = false;
    this._flashUntil = 0;
  },

  // One benched rail section per run, set up the first time a between-round window opens.
  _onTransitioned(payload) {
    const run = this._liveRun();
    if (!run) return;
    const phase = payload && payload.phase;
    if (!WAVE_BACK_TUNING.betweenRoundPhases.includes(phase)) return;
    if (this._beaconIds.length > 0) return;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return;
    const c = WAVE_BACK_TUNING.arenaCenter;
    for (const angle of WAVE_BACK_TUNING.beaconAngles) {
      const spawned = spawnEntity({
        type: 'debris',
        pos: { x: c.x + Math.cos(angle) * WAVE_BACK_TUNING.standsRadiusWu, z: c.z + Math.sin(angle) * WAVE_BACK_TUNING.standsRadiusWu },
        vel: { x: 0, z: 0 },
        radius: WAVE_BACK_TUNING.beaconRadiusWu,
        hull: WAVE_BACK_TUNING.beaconHull,
        collides: false,
        data: {
          runtimeOwner: 'plants',
          parentType: 'story_prop',
          scanLabel: 'stands beacon',
          plants: { [WAVE_BACK_TUNING.plId]: { role: 'rail_beacon' } },
        },
      });
      const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
      if (id != null) this._beaconIds.push(id);
    }
    if (this._beaconIds.length > 0) {
      this.bus.emit(PLANTS_WAVE_BACK_EVENT, { kind: 'section_benched', beacons: this._beaconIds.length, t: this._now() });
    }
  },

  _onShot(payload) {
    const run = this._liveRun();
    if (!run || !payload) return;
    if (payload.ownerId !== this.state.playerId) return; // your flash, not the pack's
    if (this._flashedWindow) return;
    const origin = payload.origin;
    if (!isShotAtStands(origin, WAVE_BACK_TUNING.arenaCenter, WAVE_BACK_TUNING)) return;
    const now = this._now();
    this._shotTimes.push(now);
    while (this._shotTimes.length > WAVE_BACK_TUNING.shotsNeeded * 2) this._shotTimes.shift();
    this._shotTimes = this._shotTimes.filter((t) => now - t <= WAVE_BACK_TUNING.shotWindowS);
    if (waveBackVerdict(this._shotTimes.length, WAVE_BACK_TUNING) !== 'flashback') return;
    this._flashedWindow = true;
    this._flashUntil = now + WAVE_BACK_TUNING.flashbackS;
    // The section nearest the flash answers in lamps, not just in numbers.
    const beacons = this._beaconIds.map((id) => this._entity(id)).filter((b) => b && b.alive !== false);
    const nearest = nearestBeacons(beacons, origin, WAVE_BACK_TUNING.flashNearestBeacons);
    for (const id of nearest) {
      const b = this._entity(id);
      if (!b) continue;
      b.data = b.data || {};
      b.data.lampsFlashing = true;
      b.data.lampFlashUntil = this._flashUntil;
    }
    this.bus.emit('audio:cue', { id: 'confirm', position: origin, gain: 0.9, rate: 1.3 });
    this.bus.emit(PLANTS_WAVE_BACK_EVENT, {
      kind: 'section_flashes_back',
      lamps: WAVE_BACK_TUNING.sectionLamps,
      beaconIds: nearest,
      until: this._flashUntil,
      shots: this._shotTimes.length,
      t: now, wave: run.wave,
    });
  },
};

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
