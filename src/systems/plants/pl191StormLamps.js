// PL-191 Less metal showing — "Veil | Less metal showing. In the storm wall, run lamps dark and
// the lightning finds the pylons; run lit, and it finds you | Run dark and slow; or run bright and
// mean it | DRAFT 2026-11-11"
//
// SEAM NOTE (honest): Veil is sector_veil_nebula / station_veil (verified in src/data/sectors.js;
// the sector carries a sector-wide nebula hazard — the storm wall). "Running dark" is staged as
// the honest physical proxy the row itself names: speed. Run dark and slow (at or under the dark
// speed) and the deterministic strikes hit the storm pylons; run bright (over it) and the strike
// finds your hull. The pylons are everyday-kit dressing rows (insertDressingRow +
// stampSolidDressing, kesslerScaleWorksite pattern) at hashed moorings near Station Veil.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit drop owned dressing rows.
// - Bounded ledgers (tuning.memoryCap); strike cadence is its own cooldown.
// - Strikes are a weather read, not damage writes: hull ownership stays with combat.

import { hash32 } from '../../core/rng.js';
import { insertDressingRow, dropDressingRow } from '../../world/dressingTable.js';
import { stampSolidDressing } from '../../world/solidDressing.js';
import { plantStationById } from '../plantEntityViews.js';

export const PL_191_STRUCK_EVENT = 'plants:pl191:struck';

export const STORM_LAMPS_TUNING = Object.freeze({
  sectorId: 'sector_veil_nebula',
  stationId: 'station_veil',
  wallRadiusWu: 1400,          // the storm wall around Station Veil
  strikeIntervalS: 12,         // deterministic strike cadence
  litSpeedWu: 60,              // over this you are metal showing
  pylonCount: 2,
  pylonDistanceWu: 700,
  pylonPlaceId: 'place_customs_pylon',
  memoryCap: 8,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

const PYLON_SALT = hash32('plantsPl191pylons', STORM_LAMPS_TUNING.sectorId);

/** Deterministic pylon moorings around the storm-wall center. */
export function pylonPositions(centerPos, sectorId = STORM_LAMPS_TUNING.sectorId) {
  const out = [];
  for (let i = 0; i < STORM_LAMPS_TUNING.pylonCount; i += 1) {
    const h = hash32('plantsPl191pylon', String(sectorId), i, PYLON_SALT);
    const bearing = (h % 3600) / 3600 * Math.PI * 2;
    out.push({
      x: finite(centerPos?.x) + Math.cos(bearing) * STORM_LAMPS_TUNING.pylonDistanceWu,
      z: finite(centerPos?.z) + Math.sin(bearing) * STORM_LAMPS_TUNING.pylonDistanceWu,
    });
  }
  return out;
}

/** The strike target rule: bright hulls in the wall get found; dark-and-slow hulls do not. */
export function strikeTargetFor(playerSpeed, playerDistToCenter, tuning = STORM_LAMPS_TUNING) {
  if (playerDistToCenter > tuning.wallRadiusWu) return 'outside';
  return playerSpeed > tuning.litSpeedWu ? 'you' : 'pylon';
}

export const pl191StormLamps = {
  modes: ['flight'],
  name: 'plantsPl191',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._strikeTimer = 0;
    this._pylonRows = new Map();   // rowId -> pylonIndex (bounded)
    this._pylonPos = new Map();    // pylonIndex -> {x, z}
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', (p = {}) => {
      if (!p.sectorId || p.sectorId === STORM_LAMPS_TUNING.sectorId) this._clear();
    });
    on('save:loaded', () => this._clear());
    on('game:newGame', () => this._clear());
  },

  destroy() {
    for (const off of this._unsubs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._clear();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _clear() {
    const s = this.state;
    if (s) for (const rowId of this._pylonRows.keys()) dropDressingRow(s, rowId);
    this._pylonRows = new Map();
    this._pylonPos = new Map();
    this._strikeTimer = 0;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _station(s) {
    return plantStationById(s, STORM_LAMPS_TUNING.stationId);
  },

  _ensurePylons(s) {
    const center = this._station(s)?.pos;
    if (!center || this._pylonRows.size > 0) return;
    const spots = pylonPositions(center);
    spots.forEach((pos, index) => {
      const data = {
        pl191Pylon: true,
        pylonIndex: index,
        placeId: STORM_LAMPS_TUNING.pylonPlaceId,
        homeSectorId: STORM_LAMPS_TUNING.sectorId,
        sectorId: STORM_LAMPS_TUNING.sectorId,
        name: 'Storm pylon',
        everydaySpaceKit: true,
      };
      const solid = stampSolidDressing(data, { radius: 12 });
      const row = insertDressingRow(s, {
        type: 'prop',
        pos, rot: 0,
        radius: 12,
        homeSectorId: STORM_LAMPS_TUNING.sectorId,
        data,
        collides: !!solid,
        ...(solid ? { physicsBody: { dynamic: false, material: 'prop' } } : {}),
      });
      if (row && row.id != null && this._pylonRows.size < STORM_LAMPS_TUNING.memoryCap) {
        this._pylonRows.set(row.id, index);
        this._pylonPos.set(index, pos);
      }
    });
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== STORM_LAMPS_TUNING.sectorId) { this._clear(); return; }

    const now = this._now(s);
    const t = STORM_LAMPS_TUNING;
    const center = this._station(s)?.pos;
    if (!center) return;
    this._ensurePylons(s);

    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!player || player.alive === false || !player.pos) return;

    this._strikeTimer += 1;
    if (this._strikeTimer < t.strikeIntervalS) return;
    this._strikeTimer = 0;

    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
    const dist = Math.hypot(player.pos.x - center.x, player.pos.z - center.z);
    const target = strikeTargetFor(speed, dist, t);
    if (target === 'outside') return;

    if (target === 'you') {
      // Run lit, and the lightning finds you.
      this.bus?.emit(PL_191_STRUCK_EVENT, {
        target: 'you', playerId: player.id ?? s.playerId,
        pos: { x: player.pos.x, z: player.pos.z }, speed, t: now,
      });
      this.bus?.emit('audio:cue', { id: 'warning', position: { x: player.pos.x, z: player.pos.z }, gain: 0.6, rate: 1.3 });
    } else {
      // Run dark and slow, and it finds the pylons.
      let best = -1;
      let bestD = Infinity;
      for (const [index, pos] of this._pylonPos) {
        const d = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
        if (d < bestD) { bestD = d; best = index; }
      }
      const pos = best >= 0 ? this._pylonPos.get(best) : center;
      this.bus?.emit(PL_191_STRUCK_EVENT, {
        target: 'pylon', pylonIndex: best,
        pos: pos ? { x: pos.x, z: pos.z } : null, speed, t: now,
      });
      if (pos) this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', position: { x: pos.x, z: pos.z }, gain: 0.5, rate: 1.5 });
    }
  },
};
