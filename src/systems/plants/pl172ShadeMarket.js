// PL-172 Riding the shade — "Kepler | Riding the shade. The shade's edge crosses the Scar on its
// own schedule, and the stalls unfold where it touches. Fly on the line and the market opens round
// you as you go | Bring the market with you; or sit in its path — a stall unfolds round your hull,
// and Okoye says *'Rent.'* | DRAFT 2026-11-11"
// The quoted line "Rent." is final copy from the row.
//
// SEAM NOTE (honest): the Scar is sector_kepler_scar / station_kepler_scar (verified in
// src/data/frontierRegions/west.js). There is no eclipsing body in live code, so the shade edge
// is an authored deterministic sweep line across the Scar (sim-time phase). The stalls are
// everyday-kit dressing rows (insertDressingRow + stampSolidDressing, kesslerScaleWorksite
// pattern) that unfold along your path while you ride the edge, and expire behind you.
// Okoye exists only in the row; she speaks through comms:popup (category 'traffic').
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit drop owned dressing rows and clear Maps.
// - Bounded stall ledger (tuning.memoryCap); rent cooldown.
// - Dressing rows are scenery: dedup + dropDressingRow cleanup, never foreign-row writes.

import { hash32 } from '../../core/rng.js';
import { insertDressingRow, dropDressingRow } from '../../world/dressingTable.js';
import { stampSolidDressing } from '../../world/solidDressing.js';

export const PL_172_RIDE_EVENT = 'plants:pl172:riding';
export const PL_172_RENT_EVENT = 'plants:pl172:rent';

export const OKOYE_SENDER = 'OKOYE';
export const RENT_LINE = 'Rent.';

export const SHADE_MARKET_TUNING = Object.freeze({
  sectorId: 'sector_kepler_scar',
  stationId: 'station_kepler_scar',
  sweepPeriodS: 240,          // the shade crosses the Scar on its own schedule
  sweepRangeWu: 1600,         // edge travel either side of the Scar center
  bandHalfWu: 90,             // width of the touch line
  rideSpeedWu: 8,             // fly on the line
  sitSpeedWu: 4,              // sit in its path
  sitHoldS: 6,                // sitting this long unfolds a stall round your hull
  stallSpacingS: 8,           // stalls unfold one per this many seconds while riding
  stallTtlS: 30,              // a stall stands this long, then is gone behind you
  stallOffsetsWu: 28,         // stalls flank the line, not your hull
  rentCooldownS: 120,
  stallPlaceIds: Object.freeze(['place_container_rack', 'place_parts_rack', 'place_worklight_tower']),
  memoryCap: 12,              // bounded stall ledger
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** X of the shade edge at simTime, sweeping across the Scar center on a fixed period. */
export function shadeEdgeXAt(simTime, centerX, tuning = SHADE_MARKET_TUNING) {
  const t = finite(simTime);
  const phase = ((t % tuning.sweepPeriodS) + tuning.sweepPeriodS) % tuning.sweepPeriodS / tuning.sweepPeriodS;
  return finite(centerX) - tuning.sweepRangeWu + phase * 2 * tuning.sweepRangeWu;
}

export function onShadeEdge(pos, edgeX, tuning = SHADE_MARKET_TUNING) {
  if (!pos || !Number.isFinite(pos.x)) return false;
  return Math.abs(pos.x - edgeX) <= tuning.bandHalfWu;
}

const STALL_SALT = hash32('plantsPl172', SHADE_MARKET_TUNING.sectorId);

export const pl172ShadeMarket = {
  name: 'plantsPl172',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._stalls = new Map();      // rowId -> expireAt (bounded)
    this._riding = false;
    this._lastStallAt = -Infinity;
    this._sitHoldS = 0;
    this._lastRentAt = -Infinity;
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', (p = {}) => {
      if (!p.sectorId || p.sectorId === SHADE_MARKET_TUNING.sectorId) this._clear();
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
    if (s) for (const rowId of this._stalls.keys()) dropDressingRow(s, rowId);
    this._stalls = new Map();
    this._riding = false;
    this._lastStallAt = -Infinity;
    this._sitHoldS = 0;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _scarCenter(s) {
    const entities = s?.entities;
    if (!entities) return null;
    const list = typeof entities.values === 'function' ? [...entities.values()] : (Array.isArray(entities) ? entities : []);
    for (const e of list) {
      if (!e || e.alive === false || e.type !== 'station') continue;
      const data = e.data || {};
      if (data.isGate === true || data.isWormhole === true) continue;
      if (data.stationId === SHADE_MARKET_TUNING.stationId) return e.pos;
    }
    return null;
  },

  _spawnStall(s, pos, rot, index) {
    const placeId = SHADE_MARKET_TUNING.stallPlaceIds[Math.abs(index) % SHADE_MARKET_TUNING.stallPlaceIds.length];
    const data = {
      pl172Stall: true,
      placeId,
      homeSectorId: SHADE_MARKET_TUNING.sectorId,
      sectorId: SHADE_MARKET_TUNING.sectorId,
      name: 'Scar shade stall',
      everydaySpaceKit: true,
    };
    const solid = stampSolidDressing(data, { radius: 9 });
    const row = insertDressingRow(s, {
      type: 'prop',
      pos, rot,
      radius: 9,
      homeSectorId: SHADE_MARKET_TUNING.sectorId,
      data,
      collides: !!solid,
      ...(solid ? { physicsBody: { dynamic: false, material: 'prop' } } : {}),
    });
    if (row && row.id != null) {
      if (this._stalls.size >= SHADE_MARKET_TUNING.memoryCap) {
        const oldest = this._stalls.keys().next().value;
        dropDressingRow(s, oldest);
        this._stalls.delete(oldest);
      }
      this._stalls.set(row.id, this._now(s) + SHADE_MARKET_TUNING.stallTtlS);
    }
    return row;
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== SHADE_MARKET_TUNING.sectorId) { this._clear(); return; }

    const now = this._now(s);
    // Stalls expire behind you (deterministic ttl sweep — cheap, bounded).
    for (const [rowId, expireAt] of this._stalls) {
      if (now >= expireAt) {
        dropDressingRow(s, rowId);
        this._stalls.delete(rowId);
      }
    }

    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    const center = this._scarCenter(s);
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!center || !player || player.alive === false || !player.pos) return;

    const t = SHADE_MARKET_TUNING;
    const edgeX = shadeEdgeXAt(now, center.x, t);
    const inBand = onShadeEdge(player.pos, edgeX, t);
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));

    if (inBand && speed >= t.rideSpeedWu) {
      // Fly on the line and the market opens round you as you go.
      if (!this._riding) {
        this._riding = true;
        this.bus?.emit(PL_172_RIDE_EVENT, { playerId: player.id ?? s.playerId, edgeX, t: now });
      }
      if (now - this._lastStallAt >= t.stallSpacingS) {
        this._lastStallAt = now;
        const side = (Math.floor(now / t.stallSpacingS) + STALL_SALT) % 2 === 0 ? 1 : -1;
        this._spawnStall(s, {
          x: player.pos.x + side * t.stallOffsetsWu,
          z: player.pos.z + side * t.stallOffsetsWu * 0.4,
        }, side * Math.PI / 2, Math.floor(now));
      }
      this._sitHoldS = 0;
    } else if (inBand && speed < t.sitSpeedWu) {
      // Sit in its path: a stall unfolds round your hull, and Okoye says rent.
      this._sitHoldS += 1;
      if (this._sitHoldS >= t.sitHoldS && now - this._lastRentAt >= t.rentCooldownS) {
        this._lastRentAt = now;
        this._sitHoldS = 0;
        this._spawnStall(s, { x: player.pos.x + t.stallOffsetsWu, z: player.pos.z }, Math.PI / 2, Math.floor(now));
        this._spawnStall(s, { x: player.pos.x - t.stallOffsetsWu, z: player.pos.z }, -Math.PI / 2, Math.floor(now) + 1);
        this.bus?.emit(PL_172_RENT_EVENT, { playerId: player.id ?? s.playerId, edgeX, t: now });
        if (this.helpers?.voice && typeof this.helpers.voice.say === 'function') {
          this.helpers.voice.say({ channel: 'comms', id: 'plants:pl172:rent', text: RENT_LINE, kind: 'traffic', ttl: 4 });
        } else {
          this.bus?.emit('voice:say', { channel: 'comms', id: 'plants:pl172:rent', text: RENT_LINE, ttl: 4 });
        }
        this.bus?.emit('comms:popup', { id: 'plants:pl172:rent', sender: OKOYE_SENDER, category: 'traffic', text: RENT_LINE, ttl: 6, persist: false });
        this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: player.pos.x, z: player.pos.z }, gain: 0.5, rate: 1 });
      }
    } else {
      this._sitHoldS = 0;
      if (!inBand) this._riding = false;
    }
  },
};
