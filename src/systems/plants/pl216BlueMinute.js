// PL-216 The blue minute — "Nyx March | The blue minute. On nights no lot is due, the light on the
// Fence still turns blue for one minute — and every ship in Nyx March looks away | Look away with
// them; or watch the blue, and Clerk Yune will make a small note about you | DRAFT 2026-11-11"
//
// SEAM NOTE (honest): Nyx March is sector_nyx_march / station_nyx_march — Nyx Fence (verified in
// src/data/frontierRegions/west.js). Clerk Yune and the blue minute exist only in the row, so the
// minute is a deterministic night phase on nights the day-hash says no lot is due; the light is
// the verified lamp seam (station data.lampsFlashing + data.lampFlashUntil — applausePlant
// pattern). Watching is physical: holding your nose pointed at the Fence while it burns. Yune's
// small note rides the patrol log seam (comms:log) plus a traffic popup.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy() clears Maps and the armed minute.
// - Bounded ledgers (tuning.memoryCap); one note per blue minute.
// - Lamp stamps never fight applausePlant's flash contract: they end when the minute ends.

import { hash32, wrapAngle } from '../../core/rng.js';
import { plantStationById } from '../plantEntityViews.js';

export const PL_216_BLUE_EVENT = 'plants:pl216:blue';
export const PL_216_NOTED_EVENT = 'plants:pl216:noted';
export const PL_216_LOOKED_AWAY_EVENT = 'plants:pl216:lookedAway';

export const YUNE_SENDER = 'CLERK YUNE';
export const YUNE_NOTE_LINE = 'Noted.';

export const BLUE_MINUTE_TUNING = Object.freeze({
  sectorId: 'sector_nyx_march',
  stationId: 'station_nyx_march',
  dayS: 240,
  blueStartS: 180,             // late in the night watch
  blueLengthS: 60,             // one minute of the watch day
  lotsDueEveryNights: 3,       // nights the day-hash exempts from lots
  watchRangeWu: 1400,
  watchArcRad: 0.6,            // pointed at the Fence counts as watching
  watchHoldS: 8,               // hold your nose on the blue this long and Yune notes it
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

const LOT_SALT = hash32('plantsPl216lots', BLUE_MINUTE_TUNING.sectorId);

/** Deterministic lot exemption: on these nights no lot is due, and the light burns blue anyway. */
export function noLotDueNight(nightIndex) {
  const n = Math.floor(finite(nightIndex));
  const every = BLUE_MINUTE_TUNING.lotsDueEveryNights;
  return ((n % every) + every) % every !== 0 || (hash32('plantsPl216exempt', n, LOT_SALT) % 5) === 0;
}

/** Is the Fence light blue at simTime? */
export function isBlueMinute(simTime, tuning = BLUE_MINUTE_TUNING) {
  const t = finite(simTime);
  const dayT = ((t % tuning.dayS) + tuning.dayS) % tuning.dayS;
  const night = Math.floor(t / tuning.dayS);
  if (!noLotDueNight(night)) return false;
  return dayT >= tuning.blueStartS && dayT < tuning.blueStartS + tuning.blueLengthS;
}

/** Watching the blue: nose pointed at the Fence inside the watch arc. */
export function facingStation(playerPos, playerRot, stationPos, arcRad = BLUE_MINUTE_TUNING.watchArcRad) {
  if (!playerPos || !stationPos || !Number.isFinite(playerRot)) return false;
  const bearing = Math.atan2(stationPos.z - playerPos.z, stationPos.x - playerPos.x);
  return Math.abs(wrapAngle(bearing - playerRot)) <= arcRad;
}

export const pl216BlueMinute = {
  modes: ['flight'],
  name: 'plantsPl216',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._watchHoldS = 0;
    this._notedNight = -1;
    this._blueNight = -1;
    this._lookedAwayTonight = false;
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', (p = {}) => {
      if (!p.sectorId || p.sectorId === BLUE_MINUTE_TUNING.sectorId) this._reset();
    });
    on('save:loaded', () => this._reset());
    on('game:newGame', () => this._reset());
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._reset();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _reset() {
    this._watchHoldS = 0;
    this._notedNight = -1;
    this._blueNight = -1;
    this._lookedAwayTonight = false;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _station(s) {
    return plantStationById(s, BLUE_MINUTE_TUNING.stationId);
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== BLUE_MINUTE_TUNING.sectorId) { this._reset(); return; }

    const station = this._station(s);
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!station?.pos || !player || player.alive === false || !player.pos) return;

    const now = this._now(s);
    const t = BLUE_MINUTE_TUNING;
    const blue = isBlueMinute(now, t);
    const night = Math.floor(now / t.dayS);
    const data = station.data || (station.data = {});

    if (!blue) {
      // The minute is over: release the Fence's lamps cleanly.
      if (this._blueNight >= 0 && data.lampsFlashing === true && now >= (data.lampFlashUntil || 0)) {
        data.lampsFlashing = false;
        data.lampFlashUntil = 0;
      }
      return;
    }

    // The light on the Fence turns blue for one minute.
    if (this._blueNight !== night) {
      this._blueNight = night;
      this._lookedAwayTonight = false;
      this._watchHoldS = 0;
      data.lampsFlashing = true;
      data.lampFlashUntil = now + (t.blueStartS + t.blueLengthS) - ((now % t.dayS) + t.dayS) % t.dayS;
      this.bus?.emit(PL_216_BLUE_EVENT, { stationId: t.stationId, night, until: data.lampFlashUntil, t: now });
    }

    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const dist = Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z);
    const watching = dist <= t.watchRangeWu
      && facingStation(player.pos, finite(player.rot), station.pos, t.watchArcRad);

    if (watching) {
      this._watchHoldS += 1;
      if (this._watchHoldS >= t.watchHoldS && this._notedNight !== night) {
        // Watch the blue, and Clerk Yune makes a small note about you.
        this._notedNight = night;
        this.bus?.emit(PL_216_NOTED_EVENT, { night, playerId: player.id ?? s.playerId, t: now });
        this.bus?.emit('comms:log', { from: 'PATROL', text: 'Blue minute. A hull watched. Yune filed it.', t: now });
        this.bus?.emit('comms:popup', {
          id: `plants:pl216:noted:${night}`, sender: YUNE_SENDER, category: 'traffic',
          text: YUNE_NOTE_LINE, ttl: 5, persist: false,
        });
        this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: player.pos.x, z: player.pos.z }, gain: 0.4, rate: 0.9 });
      }
    } else if (!this._lookedAwayTonight) {
      // Look away with them.
      this._lookedAwayTonight = true;
      this._watchHoldS = 0;
      this.bus?.emit(PL_216_LOOKED_AWAY_EVENT, { night, playerId: player.id ?? s.playerId, t: now });
    }
  },
};
