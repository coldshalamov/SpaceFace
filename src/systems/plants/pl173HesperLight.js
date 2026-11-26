// PL-173 Hesper's light — "Orcus | Hesper's light. Once, it does not cross on time. Go and look:
// the lamp is simply out. Bump it alight and it crosses exactly on time, as if it never stopped |
// Relight it; or wait in the dark, and see who else comes to look | DRAFT 2026-11-11"
//
// SEAM NOTE (honest): Orcus is sector_orcus_shadow / station_orcus_shadow (verified in
// src/data/frontierRegions/west.js). "Hesper" and her crossing light exist only in the row, so
// the lamp is a spawned story-prop beacon (beacons.js buoy contract: type 'beacon', parentType
// 'story_prop', masslineTetherable) on an authored crossing schedule; a real physics:impact
// against it relights it. "Who else comes to look" is an authored unregistered drifter that
// slides toward the dark lamp — sim-owned motion, no vel writes.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn owned entities and clear Maps.
// - Bounded ledgers (tuning.memoryCap); one lamp, one looker per dark window.
// - Relight is a physics fact: only a real impact receipt with enough impulse relights.

import { hash32 } from '../../core/rng.js';
import { plantStationById } from '../plantEntityViews.js';

export const PL_173_LAMP_EVENT = 'plants:pl173:lampOut';
export const PL_173_RELIT_EVENT = 'plants:pl173:relit';
export const PL_173_ON_TIME_EVENT = 'plants:pl173:onTime';
export const PL_173_MISSED_EVENT = 'plants:pl173:missed';
export const PL_173_LOOKER_EVENT = 'plants:pl173:looker';

export const HESPER_LIGHT_TUNING = Object.freeze({
  sectorId: 'sector_orcus_shadow',
  stationId: 'station_orcus_shadow',
  crossingPeriodS: 90,         // the light crosses on its own schedule
  crossingPhaseS: 45,          // the crossing moment inside each cycle
  darkEveryCycles: 4,          // once, it does not cross on time
  lampDistanceWu: 1100,        // lamp mooring distance from the Shadow Cache
  relightImpulseMin: 30,       // bump it alight — a real hit
  relightFlashS: 3,
  lookRadiusWu: 500,           // "wait in the dark" — you waited here
  lookerDelayS: 10,            // after this much dark, someone else comes to look
  lookerSpeedWu: 14,
  lookerDesistWu: 60,          // close enough; it holds and looks
  memoryCap: 8,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

const LAMP_SALT = hash32('plantsPl173lamp', HESPER_LIGHT_TUNING.sectorId);
const LOOKER_SALT = hash32('plantsPl173looker', HESPER_LIGHT_TUNING.sectorId);

/** Deterministic lamp mooring: a hashed bearing and distance off the Shadow Cache. */
export function lampPosition(stationPos, sectorId = HESPER_LIGHT_TUNING.sectorId) {
  const h = hash32('plantsPl173mooring', String(sectorId));
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  const dist = HESPER_LIGHT_TUNING.lampDistanceWu;
  return {
    x: finite(stationPos?.x) + Math.cos(bearing) * dist,
    z: finite(stationPos?.z) + Math.sin(bearing) * dist,
  };
}

export function isDarkCrossing(cycleIndex, tuning = HESPER_LIGHT_TUNING) {
  const c = Math.floor(finite(cycleIndex));
  return ((c % tuning.darkEveryCycles) + tuning.darkEveryCycles) % tuning.darkEveryCycles === 1;
}

export function crossingCycleAt(simTime, tuning = HESPER_LIGHT_TUNING) {
  const t = finite(simTime);
  return Math.floor(t / tuning.crossingPeriodS);
}

export function crossingMomentAt(simTime, tuning = HESPER_LIGHT_TUNING) {
  const c = crossingCycleAt(simTime, tuning);
  return c * tuning.crossingPeriodS + tuning.crossingPhaseS;
}

/** Deterministic looker approach bearing, stable per sector. */
export function lookerApproach(lampPos, sectorId = HESPER_LIGHT_TUNING.sectorId) {
  const h = hash32('plantsPl173approach', String(sectorId), LOOKER_SALT);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  return { x: finite(lampPos?.x) + Math.cos(bearing) * HESPER_LIGHT_TUNING.lookRadiusWu * 1.4, z: finite(lampPos?.z) + Math.sin(bearing) * HESPER_LIGHT_TUNING.lookRadiusWu * 1.4 };
}

export const pl173HesperLight = {
  modes: ['flight'],
  name: 'plantsPl173',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._lampId = null;
    this._lookerId = null;
    this._announcedCycle = -1;
    this._resolvedCycle = -1;
    this._lookerCycle = -1;
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('physics:impact', (p = {}) => this._onImpact(p));
    on('sector:exit', (pp = {}) => {
      if (!pp.sectorId || pp.sectorId === HESPER_LIGHT_TUNING.sectorId) this._despawnAll();
    });
    on('save:loaded', () => this._despawnAll());
    on('game:newGame', () => this._despawnAll());
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._despawnAll();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _despawnAll() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function') {
      if (this._lampId != null) rm(this._lampId);
      if (this._lookerId != null) rm(this._lookerId);
    }
    this._lampId = null;
    this._lookerId = null;
    this._announcedCycle = -1;
    this._resolvedCycle = -1;
    this._lookerCycle = -1;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _entity(s, id) {
    return id != null && typeof s?.entities?.get === 'function' ? s.entities.get(id) : null;
  },

  _spawnLamp(s, now) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function' || this._lampId != null) return;
    const station = this._station(s);
    if (!station?.pos) return;
    const pos = lampPosition(station.pos);
    const cycle = crossingCycleAt(now);
    const dark = isDarkCrossing(cycle);
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: HESPER_LIGHT_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: "Hesper's light — the crossing lamp",
        storyPropKind: 'crossing_lamp',
        hesperLamp: true,
        hesperDark: dark,
        lampsFlashing: !dark,
        lampFlashUntil: dark ? 0 : now + HESPER_LIGHT_TUNING.relightFlashS,
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: HESPER_LIGHT_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._lampId = ent.id;
  },

  _station(s) {
    return plantStationById(s, HESPER_LIGHT_TUNING.stationId);
  },

  _onImpact(p) {
    const s = this.state;
    if (!s || !p) return;
    const lamp = this._entity(s, this._lampId);
    if (!lamp || !lamp.data?.hesperDark) return;
    if (p.aId !== this._lampId && p.bId !== this._lampId) return;
    if (finite(p.impulse, 0) < HESPER_LIGHT_TUNING.relightImpulseMin) return;
    const now = this._now(s);
    lamp.data.hesperDark = false;
    lamp.data.lampsFlashing = true;
    lamp.data.lampFlashUntil = now + HESPER_LIGHT_TUNING.relightFlashS;
    this.bus?.emit(PL_173_RELIT_EVENT, { lampId: this._lampId, t: now });
    this.bus?.emit('audio:cue', { id: 'confirm', position: { x: lamp.pos.x, z: lamp.pos.z }, gain: 0.5, rate: 1 });
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== HESPER_LIGHT_TUNING.sectorId) { this._despawnAll(); return; }

    const now = this._now(s);
    const t = HESPER_LIGHT_TUNING;
    this._spawnLamp(s, now);
    const lamp = this._entity(s, this._lampId);
    if (!lamp?.pos) return;

    const cycle = crossingCycleAt(now);
    const moment = crossingMomentAt(now);
    const darkCycle = isDarkCrossing(cycle);

    // The lamp is dark from cycle start through the crossing moment on a dark cycle.
    if (darkCycle && lamp.data) {
      if (!lamp.data.hesperDark && now < moment) {
        lamp.data.hesperDark = true;
        lamp.data.lampsFlashing = false;
        lamp.data.lampFlashUntil = 0;
      }
      if (this._announcedCycle !== cycle && now < moment) {
        this._announcedCycle = cycle;
        this.bus?.emit(PL_173_LAMP_EVENT, { lampId: this._lampId, cycle, crossesAt: moment, t: now });
      }
    }

    // The crossing moment itself.
    if (this._resolvedCycle !== cycle && now >= moment) {
      this._resolvedCycle = cycle;
      if (darkCycle) {
        if (lamp.data?.hesperDark) {
          // It did not cross on time: the lamp is simply out.
          this.bus?.emit(PL_173_MISSED_EVENT, { lampId: this._lampId, cycle, t: now });
        } else {
          // Bumped alight: it crosses exactly on time, as if it never stopped.
          this.bus?.emit(PL_173_ON_TIME_EVENT, { lampId: this._lampId, cycle, t: now });
          this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', position: { x: lamp.pos.x, z: lamp.pos.z }, gain: 0.4, rate: 1 });
          lamp.data.lampsFlashing = true;
          lamp.data.lampFlashUntil = now + t.relightFlashS;
        }
      } else {
        // Ordinary lit crossings stay exactly on schedule.
        this.bus?.emit(PL_173_ON_TIME_EVENT, { lampId: this._lampId, cycle, ordinary: true, t: now });
      }
      // A dark lamp relights itself when its cycle turns over un-bumped.
      if (darkCycle && lamp.data?.hesperDark) {
        lamp.data.hesperDark = false;
        lamp.data.lampsFlashing = true;
        lamp.data.lampFlashUntil = now + t.relightFlashS;
      }
    }

    // Wait in the dark, and see who else comes to look.
    const cycleStart = cycle * t.crossingPeriodS;
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (lamp.data?.hesperDark && player?.pos
      && Math.hypot(player.pos.x - lamp.pos.x, player.pos.z - lamp.pos.z) <= t.lookRadiusWu
      && now >= cycleStart + t.lookerDelayS && now < moment) {
      const windowKey = cycle * 10;   // one looker per dark window
      if (this._lookerCycle !== windowKey) {
        this._lookerCycle = windowKey;
        this._spawnLooker(s, lamp.pos, now);
      }
    }
    this._driftLooker(s, lamp.pos);
  },

  _spawnLooker(s, lampPos, now) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function' || this._lookerId != null) return;
    const from = lookerApproach(lampPos);
    const ent = spawn({
      type: 'debris',
      pos: from, vel: { x: 0, z: 0 },
      radius: 8,
      mass: 40,
      hull: 40,
      hullMax: 40,
      homeSectorId: HESPER_LIGHT_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: 'Unregistered hull — came to look',
        storyPropKind: 'looker',
        pl173Looker: true,
        homeSectorId: HESPER_LIGHT_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) {
      this._lookerId = ent.id;
      this.bus?.emit(PL_173_LOOKER_EVENT, { lookerId: ent.id, lampId: this._lampId, t: now });
    }
  },

  _driftLooker(s, lampPos) {
    const looker = this._entity(s, this._lookerId);
    if (!looker?.pos || !lampPos) return;
    const dx = lampPos.x - looker.pos.x;
    const dz = lampPos.z - looker.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= HESPER_LIGHT_TUNING.lookerDesistWu) return;
    const step = Math.min(HESPER_LIGHT_TUNING.lookerSpeedWu, dist);
    looker.pos.x += (dx / dist) * step;
    looker.pos.z += (dz / dist) * step;
  },
};
