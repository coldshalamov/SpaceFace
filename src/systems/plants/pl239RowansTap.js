// PL-239 Rowan's tap — "Haumea | Rowan's tap. Tap Rowan strikes the ice once a pulse, and the whole
// rift flashes on his stroke | Move on the tap; everyone out here does | DRAFT 2026-11-11"
//
// SEAM NOTE (honest): Haumea is sector_haumea_rift / station_haumea_rift — Rift Observatory
// (verified in src/data/frontierRegions/north.js, with the Ice Fissure Signal POI as the rift).
// Rowan and his tap exist only in the row, so the tap is a story-prop post on the ice field rim;
// each deterministic pulse is a real chime at the post (audio seam) and the rift flash rides the
// lamp seam (rift lamp entity data.lampsFlashing + lampFlashUntil — applausePlant pattern).
// "Move on the tap" is physical: a speed or heading change inside the reaction window.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn owned props and clear Maps.
// - Bounded ledgers (tuning.memoryCap); pulse cadence is its own cooldown; one read per pulse.
// - The tap is a calendar fact of the sector while you are there (authored cadence, sim-time).

import { hash32, wrapAngle } from '../../core/rng.js';
import { plantStationById } from '../plantEntityViews.js';

export const PL_239_TAP_EVENT = 'plants:pl239:tap';
export const PL_239_MOVED_EVENT = 'plants:pl239:moved';
export const PL_239_STUCK_EVENT = 'plants:pl239:stuck';

export const ROWANS_TAP_TUNING = Object.freeze({
  sectorId: 'sector_haumea_rift',
  stationId: 'station_haumea_rift',
  tapIntervalS: 20,            // strikes the ice once a pulse
  reactWindowS: 4,             // everyone out here moves within this
  moveDeltaWu: 12,             // speed change that counts as moving
  turnDeltaRad: 0.4,           // heading change that counts as moving
  flashS: 1.5,                 // the whole rift flashes on his stroke
  tapOffsetWu: 700,            // the post stands at the ice field rim
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

const TAP_SALT = hash32('plantsPl239tap', ROWANS_TAP_TUNING.sectorId);

/** Deterministic tap-post mooring at the ice rim off the Observatory. */
export function tapPostPosition(stationPos, sectorId = ROWANS_TAP_TUNING.sectorId) {
  const h = hash32('plantsPl239pos', String(sectorId), TAP_SALT);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  return {
    x: finite(stationPos?.x) + Math.cos(bearing) * ROWANS_TAP_TUNING.tapOffsetWu,
    z: finite(stationPos?.z) + Math.sin(bearing) * ROWANS_TAP_TUNING.tapOffsetWu,
  };
}

export function isTapPulse(simTime, tuning = ROWANS_TAP_TUNING) {
  const t = finite(simTime);
  return t > 0 && (t % tuning.tapIntervalS) < 1;
}

export const pl239RowansTap = {
  name: 'plantsPl239',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._postId = null;
    this._riftLampId = null;
    this._lastPulseIndex = -1;
    this._react = null;          // { pulseIndex, speed, rot, endAt, resolved }
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', (p = {}) => {
      if (!p.sectorId || p.sectorId === ROWANS_TAP_TUNING.sectorId) this._despawnAll();
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
      if (this._postId != null) rm(this._postId);
      if (this._riftLampId != null) rm(this._riftLampId);
    }
    this._postId = null;
    this._riftLampId = null;
    this._lastPulseIndex = -1;
    this._react = null;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _entity(s, id) {
    return id != null && typeof s?.entities?.get === 'function' ? s.entities.get(id) : null;
  },

  _station(s) {
    return plantStationById(s, ROWANS_TAP_TUNING.stationId);
  },

  _spawnBeacon(s, pos, data) {
    const spawn = this.helpers?.spawnEntity;
    if (typeof spawn !== 'function') return null;
    const ent = spawn({
      type: 'beacon',
      pos, vel: { x: 0, z: 0 },
      radius: 5,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: ROWANS_TAP_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: ROWANS_TAP_TUNING.sectorId,
        ...data,
      },
    });
    return (ent && ent.id != null) ? ent : null;
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== ROWANS_TAP_TUNING.sectorId) { this._despawnAll(); return; }

    const now = this._now(s);
    const t = ROWANS_TAP_TUNING;
    const station = this._station(s);
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!station?.pos || !player || player.alive === false || !player.pos) return;

    const tapPos = tapPostPosition(station.pos);
    if (this._postId == null) {
      const post = this._spawnBeacon(s, tapPos, {
        scanLabel: "Rowan's tap — strikes the ice once a pulse",
        storyPropKind: 'tap_post',
        pl239TapPost: true,
        swarmFloorPad: { label: "ROWAN'S TAP" },
      });
      if (post) this._postId = post.id;
    }
    if (this._riftLampId == null) {
      const lamp = this._spawnBeacon(s, {
        x: tapPos.x + t.tapOffsetWu * 0.6,
        z: tapPos.z + t.tapOffsetWu * 0.6,
      }, {
        scanLabel: 'Rift lamp line — flashes on the tap',
        storyPropKind: 'rift_lamp',
        pl239RiftLamp: true,
        lampsFlashing: false,
        lampFlashUntil: 0,
      });
      if (lamp) this._riftLampId = lamp.id;
    }

    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const pulse = Math.floor(now / t.tapIntervalS);
    if (pulse > 0 && pulse !== this._lastPulseIndex) {
      // The tap: the ice rings and the whole rift flashes on his stroke.
      this._lastPulseIndex = pulse;
      const riftLamp = this._entity(s, this._riftLampId);
      if (riftLamp?.data) {
        riftLamp.data.lampsFlashing = true;
        riftLamp.data.lampFlashUntil = now + t.flashS;
      }
      this.bus?.emit(PL_239_TAP_EVENT, { postId: this._postId, pulse, t: now });
      this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', position: tapPos, gain: 0.45, rate: 0.5 });
      this._react = {
        pulse,
        speed: Math.hypot(finite(player.vel?.x), finite(player.vel?.z)),
        rot: finite(player.rot),
        endAt: now + t.reactWindowS,
        resolved: false,
      };
    }

    // Move on the tap.
    if (this._react && !this._react.resolved) {
      const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
      const moved = Math.abs(speed - this._react.speed) >= t.moveDeltaWu
        || Math.abs(wrapAngle(finite(player.rot) - this._react.rot)) >= t.turnDeltaRad;
      if (moved) {
        this._react.resolved = true;
        this.bus?.emit(PL_239_MOVED_EVENT, { pulse: this._react.pulse, reaction: 'moved', t: now });
      } else if (now >= this._react.endAt) {
        this._react.resolved = true;
        this.bus?.emit(PL_239_STUCK_EVENT, { pulse: this._react.pulse, reaction: 'stuck', t: now });
      }
    }
  },
};
