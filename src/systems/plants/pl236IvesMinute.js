// PL-236 Ives's minute — "The Bolus | Ives's minute. Every day at the same minute, Ives stands on
// the wall's road, hands in pockets, riding the Breath like a ferry | Stand your ship beside him
// for one breath | DRAFT 2026-11-11"
//
// SEAM NOTE (honest): The Bolus is sector_the_bolus / station_bolus_rib — The Swallowed Rib
// (verified in src/data/theBolus.js; the wall's road is the authored Cartilage Road zone,
// BOLUS_WALL_X). Ives exists only in the row, so he is a story-prop body that exists only during
// his deterministic minute of the watch day, standing on the wall road. "Stand beside him for one
// breath" is physical: hold station inside his stand radius for the breath hold. No copy is
// quoted in the row, so the plant is wordless — a lamp blink and a chime.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn Ives and clear Maps.
// - Bounded ledgers (tuning.memoryCap); Ives exists only inside his minute; one stand per minute.
// - The wall road uses theBolus.js authored constants; no invented wall geometry.

import { hash32 } from '../../core/rng.js';
import { BOLUS_SECTOR_ID, BOLUS_STATION_ID, BOLUS_WALL_X } from '../../data/theBolus.js';

export const PL_236_STOOD_EVENT = 'plants:pl236:stood';
export const PL_236_MISSED_EVENT = 'plants:pl236:missed';

export const IVES_MINUTE_TUNING = Object.freeze({
  sectorId: BOLUS_SECTOR_ID,          // 'sector_the_bolus'
  stationId: BOLUS_STATION_ID,        // 'station_bolus_rib'
  wallRoadX: BOLUS_WALL_X,            // the wall's road (Cartilage Road zone x)
  wallRoadZ: -300,                    // Cartilage Road zone center z (authored zone)
  dayS: 240,
  minuteStartS: 120,                  // every day at the same minute
  minuteLengthS: 6,                   // a playable "minute" of the watch day
  standRadiusWu: 60,
  breathHoldS: 3,                     // one breath
  lampFlashS: 1.2,
  memoryCap: 4,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Deterministic minute window on the watch day. */
export function isIvesMinute(simTime, tuning = IVES_MINUTE_TUNING) {
  const dayT = ((finite(simTime) % tuning.dayS) + tuning.dayS) % tuning.dayS;
  return dayT >= tuning.minuteStartS && dayT < tuning.minuteStartS + tuning.minuteLengthS;
}

/** Deterministic spot on the wall road, stable per sector. */
export function ivesSpot(sectorId = IVES_MINUTE_TUNING.sectorId, tuning = IVES_MINUTE_TUNING) {
  const h = hash32('plantsPl236spot', String(sectorId));
  const jitter = (h % 200) - 100;   // ±100 WU along the road, still on it
  return { x: tuning.wallRoadX, z: tuning.wallRoadZ + jitter };
}

export const pl236IvesMinute = {
  modes: ['flight'],
  name: 'plantsPl236',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._ivesId = null;
    this._minuteNight = -1;
    this._standHoldS = 0;
    this._stoodTonight = false;
    this._wasPresentTonight = false;
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', (p = {}) => {
      if (!p.sectorId || p.sectorId === IVES_MINUTE_TUNING.sectorId) this._despawn();
    });
    on('save:loaded', () => this._despawn());
    on('game:newGame', () => this._despawn());
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._despawn();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _despawn() {
    if (this._ivesId != null && typeof this.helpers?.removeEntity === 'function') {
      this.helpers.removeEntity(this._ivesId);
    }
    this._ivesId = null;
    this._minuteNight = -1;
    this._standHoldS = 0;
    this._stoodTonight = false;
    this._wasPresentTonight = false;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _entity(s, id) {
    return id != null && typeof s?.entities?.get === 'function' ? s.entities.get(id) : null;
  },

  _spawnIves(s) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function' || this._ivesId != null) return;
    const spot = ivesSpot();
    const ent = spawn({
      type: 'debris',
      pos: spot, vel: { x: 0, z: 0 },
      radius: 10,
      mass: 60,
      hull: 80,
      hullMax: 80,
      homeSectorId: IVES_MINUTE_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: "Ives — hands in pockets, riding the Breath",
        storyPropKind: 'wall_walker',
        pl236Ives: true,
        lampsFlashing: false,
        lampFlashUntil: 0,
        homeSectorId: IVES_MINUTE_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._ivesId = ent.id;
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== IVES_MINUTE_TUNING.sectorId) { this._despawn(); return; }

    const now = this._now(s);
    const t = IVES_MINUTE_TUNING;
    const inMinute = isIvesMinute(now, t);
    const night = Math.floor(now / t.dayS);

    if (!inMinute) {
      // His minute ends; he is gone as if he was never standing there.
      if (this._ivesId != null) {
        if (this._stoodTonight === false && this._wasPresentTonight) {
          this.bus?.emit(PL_236_MISSED_EVENT, { night: this._minuteNight, t: now });
        }
        this._despawn();
      }
      return;
    }

    if (this._ivesId == null || this._minuteNight !== night) {
      if (this._ivesId != null) this._despawn();
      this._minuteNight = night;
      this._stoodTonight = false;
      this._wasPresentTonight = false;
      this._spawnIves(s);
    }
    const ives = this._entity(s, this._ivesId);
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!ives?.pos || !player || player.alive === false || !player.pos) return;

    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    this._wasPresentTonight = true;

    const d = Math.hypot(player.pos.x - ives.pos.x, player.pos.z - ives.pos.z);
    if (d <= t.standRadiusWu) {
      this._standHoldS += 1;
      if (this._standHoldS >= t.breathHoldS && !this._stoodTonight) {
        // Stand your ship beside him for one breath.
        this._stoodTonight = true;
        ives.data.lampsFlashing = true;
        ives.data.lampFlashUntil = now + t.lampFlashS;
        this.bus?.emit(PL_236_STOOD_EVENT, { ivesId: this._ivesId, night, t: now });
        this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', position: { x: ives.pos.x, z: ives.pos.z }, gain: 0.4, rate: 0.6 });
      }
    } else {
      this._standHoldS = 0;
    }
  },
};
