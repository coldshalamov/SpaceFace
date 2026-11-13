// PL-238 Half and half — "Io | Half and half. Coldburn Rey's hull is painted half one flag's
// colours, half the other's. Both sides pretend not to see him | See him | DRAFT 2026-11-11"
//
// SEAM NOTE (honest): Io is sector_io_reach / station_reach — Reach Station (verified in
// src/data/sectors.js, a contested floor with the Wreck Cathedral nearby). Coldburn Rey and the
// two flag lamps exist only in the row, so Rey is a drifting story-prop body near Reach Station
// (sim-owned authored drift) flanked by the two flag lamps as story-prop beacons whose lamps never
// flash at him — the "pretend not to see" is literal: their lampFlashUntil stays in the past.
// "See him" is physical: hold your nose pointed at Rey inside his radius for the hold; his lamp
// blinks back once (data.lampsFlashing + lampFlashUntil — the applausePlant lamp seam).
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn owned bodies and clear Maps.
// - Bounded ledgers (tuning.memoryCap); one see per cooldown; flag lamps never flash.
// - Rey moves only his own authored body; facing is geometry (wrapAngle), not a render read.

import { hash32, wrapAngle } from '../../core/rng.js';

export const PL_238_SEEN_EVENT = 'plants:pl238:seen';
export const PL_238_PASSED_EVENT = 'plants:pl238:passed';

export const SEE_HIM_TUNING = Object.freeze({
  sectorId: 'sector_io_reach',
  stationId: 'station_reach',
  driftRadiusWu: 420,          // Rey drifts a slow ring around Reach Station
  driftPeriodS: 180,
  seeRadiusWu: 140,
  seeArcRad: 0.55,             // your nose on him counts as seeing
  seeHoldS: 4,
  seenCooldownS: 60,
  passGraceS: 6,               // inside his radius unseeing this long is a pass-by
  lampFlashS: 2,
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

const REY_SALT = hash32('plantsPl238rey', SEE_HIM_TUNING.sectorId);

/** Rey's authored drift position on his ring around Reach Station. */
export function reyDriftPosition(simTime, stationPos, sectorId = SEE_HIM_TUNING.sectorId, tuning = SEE_HIM_TUNING) {
  const h = hash32('plantsPl238phase', String(sectorId), REY_SALT);
  const phase0 = (h % 3600) / 3600 * Math.PI * 2;
  const angle = phase0 + (finite(simTime) / tuning.driftPeriodS) * Math.PI * 2;
  return {
    x: finite(stationPos?.x) + Math.cos(angle) * tuning.driftRadiusWu,
    z: finite(stationPos?.z) + Math.sin(angle) * tuning.driftRadiusWu,
  };
}

/** Nose geometry: is the player facing the target inside the arc? */
export function isFacing(playerPos, playerRot, targetPos, arcRad = SEE_HIM_TUNING.seeArcRad) {
  if (!playerPos || !targetPos || !Number.isFinite(playerRot)) return false;
  const bearing = Math.atan2(targetPos.z - playerPos.z, targetPos.x - playerPos.x);
  return Math.abs(wrapAngle(bearing - playerRot)) <= arcRad;
}

export const pl238SeeHim = {
  name: 'plantsPl238',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._reyId = null;
    this._flagLampIds = [];
    this._seeHoldS = 0;
    this._unseeingHoldS = 0;
    this._lastSeenAt = -Infinity;
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', (p = {}) => {
      if (!p.sectorId || p.sectorId === SEE_HIM_TUNING.sectorId) this._despawnAll();
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
      if (this._reyId != null) rm(this._reyId);
      for (const id of this._flagLampIds) rm(id);
    }
    this._reyId = null;
    this._flagLampIds = [];
    this._seeHoldS = 0;
    this._unseeingHoldS = 0;
    this._lastSeenAt = -Infinity;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _entity(s, id) {
    return id != null && typeof s?.entities?.get === 'function' ? s.entities.get(id) : null;
  },

  _station(s) {
    const entities = s?.entities;
    if (!entities) return null;
    const list = typeof entities.values === 'function' ? [...entities.values()] : (Array.isArray(entities) ? entities : []);
    for (const e of list) {
      if (!e || e.alive === false || e.type !== 'station') continue;
      const data = e.data || {};
      if (data.isGate === true || data.isWormhole === true) continue;
      if (data.stationId === SEE_HIM_TUNING.stationId) return e;
    }
    return null;
  },

  _spawnProp(s, spec) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function') return null;
    const ent = spawn(spec);
    return (ent && ent.id != null) ? ent : null;
  },

  _ensureCast(s, now) {
    const station = this._station(s);
    if (!station?.pos) return;
    const t = SEE_HIM_TUNING;
    const reyPos = reyDriftPosition(now, station.pos);
    if (this._reyId == null) {
      const ent = this._spawnProp(s, {
        type: 'debris',
        pos: reyPos, vel: { x: 0, z: 0 },
        radius: 12,
        mass: 90,
        hull: 150,
        hullMax: 150,
        homeSectorId: t.sectorId,
        data: {
          parentType: 'story_prop',
          scanLabel: "Coldburn Rey — half one flag's colours, half the other's",
          storyPropKind: 'half_and_half_hull',
          pl238Rey: true,
          lampsFlashing: false,
          lampFlashUntil: 0,
          homeSectorId: t.sectorId,
        },
      });
      if (ent) this._reyId = ent.id;
    } else {
      const rey = this._entity(s, this._reyId);
      if (rey?.pos) {
        rey.pos.x = reyPos.x;
        rey.pos.z = reyPos.z;
      }
    }
    if (this._flagLampIds.length < 2) {
      const lampAngle = Math.atan2(reyPos.z - station.pos.z, reyPos.x - station.pos.x);
      for (let i = this._flagLampIds.length; i < 2; i += 1) {
        const side = i === 0 ? 1 : -1;
        const ent = this._spawnProp(s, {
          type: 'beacon',
          pos: {
            x: station.pos.x + Math.cos(lampAngle + side * 0.9) * (t.driftRadiusWu + 60),
            z: station.pos.z + Math.sin(lampAngle + side * 0.9) * (t.driftRadiusWu + 60),
          },
          vel: { x: 0, z: 0 },
          radius: 5,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            scanLabel: i === 0 ? 'Reach-colour flag lamp' : 'Frontier-colour flag lamp',
            storyPropKind: 'flag_lamp',
            pl238FlagLamp: true,
            pl238LampSide: i,
            // Both sides pretend not to see him: these lamps never flash.
            lampsFlashing: false,
            lampFlashUntil: 0,
            tetherable: true,
            masslineTetherable: true,
            homeSectorId: t.sectorId,
          },
        });
        if (ent && this._flagLampIds.length < t.memoryCap) this._flagLampIds.push(ent.id);
      }
    }
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== SEE_HIM_TUNING.sectorId) { this._despawnAll(); return; }

    this._ensureCast(s, this._now(s));
    const rey = this._entity(s, this._reyId);
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!rey?.pos || !player || player.alive === false || !player.pos) return;

    const now = this._now(s);
    const t = SEE_HIM_TUNING;

    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const d = Math.hypot(player.pos.x - rey.pos.x, player.pos.z - rey.pos.z);
    if (d > t.seeRadiusWu) {
      this._seeHoldS = 0;
      this._unseeingHoldS = 0;
      return;
    }

    if (isFacing(player.pos, finite(player.rot), rey.pos, t.seeArcRad)) {
      this._unseeingHoldS = 0;
      this._seeHoldS += 1;
      if (this._seeHoldS >= t.seeHoldS && now - this._lastSeenAt >= t.seenCooldownS) {
        // See him: his lamp blinks back once.
        this._lastSeenAt = now;
        this._seeHoldS = 0;
        rey.data.lampsFlashing = true;
        rey.data.lampFlashUntil = now + t.lampFlashS;
        this.bus?.emit(PL_238_SEEN_EVENT, { reyId: this._reyId, playerId: player.id ?? s.playerId, t: now });
        this.bus?.emit('audio:cue', { id: 'confirm', position: { x: rey.pos.x, z: rey.pos.z }, gain: 0.4, rate: 1 });
      }
    } else {
      this._seeHoldS = 0;
      this._unseeingHoldS += 1;
      if (this._unseeingHoldS === t.passGraceS) {
        // Both sides pretend not to see him: a pass-by without seeing.
        this.bus?.emit(PL_238_PASSED_EVENT, { reyId: this._reyId, playerId: player.id ?? s.playerId, t: now });
      }
    }
  },
};
