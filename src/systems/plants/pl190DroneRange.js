// PL-190 Off-hours — "Dione | Off-hours. The range dark, the drones racked, and Lt. Sorrel alone
// on the rail: shooting one drone down, catching it, racking it, again | Watch; or take a turn —
// she racks them slower for you | DRAFT 2026-11-11"
//
// SEAM NOTE (honest): Dione is sector_dione_lane / station_dione — Dione Exchange (verified in
// src/data/frontierRegions/south.js). The off-hours range, Sorrel and her drones exist only in
// the row, so this stages an authored off-hours window on the deterministic day phase, one
// story-prop range drone at a time launched, shot down and racked by the house, and a slower
// rack cadence once YOUR kill receipt (entity:killed of the active drill drone) takes a turn.
// Sorrel speaks only through comms:popup (category 'traffic').
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned drill drone and clear Maps.
// - Bounded ledgers (tuning.memoryCap); one active drone; slows capped.
// - "Take a turn" is a physics fact: only a real entity:killed receipt for the active drone counts.

import { hash32 } from '../../core/rng.js';
import { plantStationById } from '../plantEntityViews.js';

export const PL_190_DRILL_EVENT = 'plants:pl190:drill';
export const PL_190_TOOK_TURN_EVENT = 'plants:pl190:tookTurn';

export const SORREL_SENDER = 'LT. SORREL';
export const SORREL_TURN_LINE = 'Racking slower for you now.';

export const DRONE_RANGE_TUNING = Object.freeze({
  sectorId: 'sector_dione_lane',
  stationId: 'station_dione',
  dayS: 240,
  offHoursStartS: 200,         // the range is dark late in the day
  offHoursEndS: 240,
  viewRadiusWu: 700,           // close enough to watch from the rail
  drillIntervalS: 26,          // base cadence: down, caught, racked, again
  droneFlightS: 14,            // launch to shot-down
  rangeOffsetWu: 420,
  slowFactor: 1.6,             // she racks them slower for you
  maxSlows: 2,
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

const RANGE_SALT = hash32('plantsPl190', DRONE_RANGE_TUNING.sectorId);

/** Deterministic off-hours window on the day phase. */
export function isOffHours(dayTimeS, tuning = DRONE_RANGE_TUNING) {
  const t = ((finite(dayTimeS) % tuning.dayS) + tuning.dayS) % tuning.dayS;
  return t >= tuning.offHoursStartS && t < tuning.offHoursEndS;
}

/** Deterministic drone launch point off the Exchange, stable per sector. */
export function rangePosition(stationPos, sectorId = DRONE_RANGE_TUNING.sectorId) {
  const h = hash32('plantsPl190range', String(sectorId), RANGE_SALT);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  return {
    x: finite(stationPos?.x) + Math.cos(bearing) * DRONE_RANGE_TUNING.rangeOffsetWu,
    z: finite(stationPos?.z) + Math.sin(bearing) * DRONE_RANGE_TUNING.rangeOffsetWu,
  };
}

export const pl190DroneRange = {
  modes: ['flight'],
  name: 'plantsPl190',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._droneId = null;
    this._droneSpawnedAt = -Infinity;
    this._nextDrillAt = -Infinity;
    this._slows = 0;
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('entity:killed', (p = {}) => this._onKilled(p));
    on('sector:exit', (pp = {}) => {
      if (!pp.sectorId || pp.sectorId === DRONE_RANGE_TUNING.sectorId) this._resetDrill();
    });
    on('save:loaded', () => this._resetDrill());
    on('game:newGame', () => this._resetDrill());
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._resetDrill();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _despawnDrone() {
    if (this._droneId != null && typeof this.helpers?.removeEntity === 'function') {
      this.helpers.removeEntity(this._droneId);
    }
    this._droneId = null;
    this._droneSpawnedAt = -Infinity;
  },

  _resetDrill() {
    this._despawnDrone();
    this._nextDrillAt = -Infinity;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _entity(s, id) {
    return id != null && typeof s?.entities?.get === 'function' ? s.entities.get(id) : null;
  },

  _station(s) {
    return plantStationById(s, DRONE_RANGE_TUNING.stationId);
  },

  _currentInterval() {
    return DRONE_RANGE_TUNING.drillIntervalS * Math.pow(DRONE_RANGE_TUNING.slowFactor, this._slows);
  },

  /** Take a turn: the house racks them slower once your receipt counts. */
  _onKilled(p) {
    const s = this.state;
    if (!s || p.id !== this._droneId) return;
    const now = this._now(s);
    this._despawnDrone();
    // The rack time is real: the next drone comes off the rail one (slower) cadence later.
    this._nextDrillAt = now + this._currentInterval();
    if (this._slows < DRONE_RANGE_TUNING.maxSlows) {
      this._slows += 1;
      this.bus?.emit(PL_190_TOOK_TURN_EVENT, { kills: this._slows, intervalS: this._currentInterval(), t: now });
      this.bus?.emit('comms:popup', {
        id: 'plants:pl190:turn', sender: SORREL_SENDER, category: 'traffic',
        text: SORREL_TURN_LINE, ttl: 6, persist: false,
      });
    }
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== DRONE_RANGE_TUNING.sectorId) { this._resetDrill(); return; }

    const now = this._now(s);
    const t = DRONE_RANGE_TUNING;

    const station = this._station(s);
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    const dayT = ((now % t.dayS) + t.dayS) % t.dayS;
    const offHours = isOffHours(dayT, t);
    const watching = !!station && !!player?.pos
      && Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z) <= t.viewRadiusWu;

    // The house drill: launch one drone, shoot it down, catch it, rack it, again.
    const drone = this._entity(s, this._droneId);
    if (drone && now - this._droneSpawnedAt >= t.droneFlightS) {
      // Shot down, caught, racked — the rail takes it back.
      this.bus?.emit(PL_190_DRILL_EVENT, { phase: 'racked', droneId: this._droneId, t: now });
      this.bus?.emit('audio:cue', { id: 'confirm', position: { x: drone.pos.x, z: drone.pos.z }, gain: 0.3, rate: 1.4 });
      this._despawnDrone();
    }

    if (!offHours || !watching) return;

    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    if (!this._droneId && (this._nextDrillAt < 0 || now >= this._nextDrillAt)) {
      this._nextDrillAt = now + this._currentInterval();
      const spawn = this.helpers?.spawnEntity;
      const launchPos = station ? rangePosition(station.pos) : null;
      if (typeof spawn === 'function' && launchPos) {
        const ent = spawn({
          type: 'debris',
          pos: launchPos, vel: { x: 0, z: 0 },
          radius: 6,
          mass: 18,
          hull: 24,
          hullMax: 24,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            scanLabel: 'Range drone — racked, flown, shot, caught',
            storyPropKind: 'range_drone',
            pl190Drone: true,
            homeSectorId: t.sectorId,
          },
        });
        if (ent && ent.id != null) {
          this._droneId = ent.id;
          this._droneSpawnedAt = now;
          this.bus?.emit(PL_190_DRILL_EVENT, { phase: 'launched', droneId: ent.id, intervalS: this._currentInterval(), t: now });
          this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', position: launchPos, gain: 0.3, rate: 0.8 });
        }
      }
    }
  },
};
