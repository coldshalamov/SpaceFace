// PL-353 Dione — "The clean stamp. The funnel's checker stamps small hulls CLEAN for a month
// after one honest declaration, unprompted | Declare once; or smuggle once — the stamp and the
// memory last a year, and the line moves slower for you | DRAFT 2026-11-13"
//
// SEAM NOTE (honest): Dione Lane is sector_dione_lane; the funnel is station_dione_customs
// (verified in src/data/frontierRegions/south.js — it sits beside the Exchange's station_dione).
// The funnel and the checker exist only in the row, so the funnel is a deterministic approach
// lane (a hash-fixed offset ring off the customs station) and the checker speaks through the
// ordinary voice seam. An honest declaration, unprompted, is physical and measurable: pass
// through the funnel lane carrying cargo at DECLARE pace — you stopped, unprompted, and declared
// what you carry (the funnel reads cargo from the real state.player.cargo — no invented
// manifest). The stamp is CLEAN for a month: a hull stamp (data.plantsPl353CleanUntil) + the
// checker's line + a station stamp. Smuggling once is physical too: through the funnel carrying
// cargo above smuggle pace with no declare stop. The stamp and the memory last a year: the hull
// is marked (data.plantsPl353Smuggled + station.data.plantsPl353Slow) and the line moves slower
// — a real speed cap while inside the funnel ring — until the year runs out. CLEAN hulls feel
// none of it.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit reset funnel state (RESET not unsubscribe).
// - Bounded ledgers (tuning.memoryCap); the funnel's speed cap touches only the offending hull.
// - NO economy mutations: customs fines belong to law/economy owners; the stamp documents the
//   memory for them (station.data.plantsPl353Slow) — ECONOMY-OWNER HANDOFF documented.

import { hash32 } from '../../core/rng.js';
import { queuePlayerImpulse } from './playerImpulse.js';

export const PL_353_CLEAN_EVENT = 'plants:pl353:clean';
export const PL_353_SMUGGLED_EVENT = 'plants:pl353:smuggled';

export const CHECKER_SENDER = 'THE FUNNEL CHECKER';
export const CLEAN_LINE = 'Stamped CLEAN. One honest declaration.';
export const SMUGGLED_LINE = 'The line moves slower for you.';

export const CLEAN_STAMP_TUNING = Object.freeze({
  plId: 'pl353',
  sectorId: 'sector_dione_lane',
  stationId: 'station_dione_customs',
  MERCY_DAY_S: 240,          // the tuning day, same constant as sibling mercy modules
  funnelOffsetWu: 260,
  funnelRadiusWu: 110,
  declareSpeedWu: 14,        // declare pace: you stop in the funnel and declare
  declareHoldS: 8,           // cumulative inside the funnel ring
  smuggleSpeedWu: 70,        // blasting through carrying cargo, no stop
  smallHullMassWu: 400,      // small hulls only
  cleanDays: 30,             // a month
  smuggledDays: 360,         // a year: the stamp and the memory
  funnelSpeedCapWu: 24,      // the line moves slower for you
  memoryCap: 6,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Pure: the funnel lane's approach point off the customs station. */
export function funnelPoint(stationPos, tuning = CLEAN_STAMP_TUNING) {
  const h = hash32('plantsPl353funnel', tuning.sectorId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  return {
    x: finite(stationPos?.x) + Math.cos(bearing) * tuning.funnelOffsetWu,
    z: finite(stationPos?.z) + Math.sin(bearing) * tuning.funnelOffsetWu,
  };
}

/** Pure: the honest smallness metric — mass at or under the tuning cap. */
export function isSmallHull(ent, tuning = CLEAN_STAMP_TUNING) {
  if (!ent) return false;
  const mass = Number(ent.physicsBody?.mass ?? ent.mass);
  return Number.isFinite(mass) && mass > 0 && mass <= tuning.smallHullMassWu;
}

/** Pure: is the hull carrying anything (the real cargo — state.player.cargo.items)? */
export function isCarryingCargo(player) {
  const items = player?.cargo?.items;
  if (!items || typeof items !== 'object') return false;
  for (const key of Object.keys(items)) {
    const qty = Number(items[key]);
    if (Number.isFinite(qty) && qty > 0) return true;
  }
  return false;
}

/** Pure: is the CLEAN stamp live on this hull? */
export function isCleanUntil(cleanUntil, now) {
  return Number.isFinite(cleanUntil) && now < cleanUntil;
}

/** Pure: is the year-memory live on this hull? */
export function isSmuggledUntil(smuggledUntil, now) {
  return Number.isFinite(smuggledUntil) && now < smuggledUntil;
}

export const pl353CleanStamp = {
  modes: ['flight'],
  name: 'plantsPl353',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._funnelId = null;
    this._declareHold = 0;
    this._cleanUntil = null;
    this._smuggledUntil = null;
    this._toldSmuggledAt = -Infinity;
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', () => this._drop());
    on('save:loaded', () => this._drop());
    on('game:new', () => this._resetSession());
    on('game:newGame', () => this._resetSession());
  },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; this.helpers = {}; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._drop();
    this.state = null;
    this.bus = null;
    this.helpers = {};
  },

  _resetSession() {
    this._cleanUntil = null;
    this._smuggledUntil = null;
    this._declareHold = 0;
    this._toldSmuggledAt = -Infinity;
    this._drop();
  },

  _drop() {
    const rm = this.helpers?.removeEntity;
    if (typeof rm === 'function' && this._funnelId != null) rm(this._funnelId);
    this._funnelId = null;
    this._declareHold = 0;
  },

  _now(s) {
    return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
  },

  _station(s) {
    const entities = s?.entities;
    if (!entities) return null;
    const list = typeof entities.values === 'function' ? [...entities.values()] : (Array.isArray(entities) ? entities : []);
    for (const e of list) {
      if (!e || e.alive === false || e.type !== 'station') continue;
      const data = e.data || {};
      if (data.isGate === true || data.isWormhole === true) continue;
      if (data.stationId === CLEAN_STAMP_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureFunnel(s, now) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    const point = funnelPoint(station.pos, CLEAN_STAMP_TUNING);
    if (this._funnelId != null) return point;
    const ent = spawn({
      type: 'beacon',
      pos: point, vel: { x: 0, z: 0 },
      radius: 6,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: CLEAN_STAMP_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: 'The funnel — the checker stamps honest declarations CLEAN for a month',
        storyPropKind: 'customs_funnel_mark',
        plantsPl353Funnel: true,
        lampsFlashing: true,
        lampFlashUntil: now + 1,
        swarmFloorPad: { label: 'THE FUNNEL — DECLARE' },
        tetherable: true,
        masslineTetherable: true,
        homeSectorId: CLEAN_STAMP_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._funnelId = ent.id;
    return point;
  },

  _voice(id, text, ttl = 5) {
    if (this.helpers?.voice && typeof this.helpers.voice.say === 'function') {
      this.helpers.voice.say({ channel: 'comms', id, text, kind: 'traffic', ttl });
    } else {
      this.bus?.emit('voice:say', { channel: 'comms', id, text, ttl });
    }
  },

  _popup(id, sender, text, ttl = 6) {
    this.bus?.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== CLEAN_STAMP_TUNING.sectorId) { this._drop(); return; }
    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    const step = this._acc;
    this._acc = 0;

    const station = this._station(s);
    if (!station?.pos) return;
    const point = this._ensureFunnel(s, this._now(s));
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!point || !player || player.alive === false || !player.pos) return;
    const now = this._now(s);
    const t = CLEAN_STAMP_TUNING;
    const speed = Math.hypot(finite(player.vel?.x), finite(player.vel?.z));
    const dist = Math.hypot(player.pos.x - point.x, player.pos.z - point.z);
    const funnelMark = this._funnelId != null && typeof s.entities?.get === 'function'
      ? s.entities.get(this._funnelId) : null;

    const clean = isCleanUntil(this._cleanUntil, now);
    const smuggled = isSmuggledUntil(this._smuggledUntil, now);

    if (dist > t.funnelRadiusWu) {
      this._declareHold = Math.max(0, this._declareHold - step * 2);
      return;
    }

    // Smuggled once, a year of memory: the line moves slower for you inside the funnel.
    if (smuggled && !clean) {
      // The line moves slower for you: a drag toward the cap, through the membrane (the
      // funnel buoy is the visible source) — never a raw hard clamp on the hull's vel.
      const cap = t.funnelSpeedCapWu;
      if (speed > cap && player.vel) {
        const scale = cap / speed;
        queuePlayerImpulse(s, player, player.vel.x * (scale - 1), player.vel.z * (scale - 1),
          'plantsPl353Funnel', { continuous: true, dt: step });
      }
      if (funnelMark?.data) {
        funnelMark.data.scanLabel = 'The funnel — your hull is remembered here. The line moves slower.';
      }
      if (now - this._toldSmuggledAt >= t.MERCY_DAY_S) {
        this._toldSmuggledAt = now;
        this.bus?.emit(PL_353_SMUGGLED_EVENT, { playerId: s.playerId, remembered: true, t: now });
        this._voice('plants:pl353:smuggled', SMUGGLED_LINE, 5);
        this._popup('plants:pl353:smuggled', CHECKER_SENDER, SMUGGLED_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'ui_deny', position: { x: point.x, z: point.z }, gain: 0.4, rate: 0.9 });
      }
      return;
    }
    if (clean) {
      if (funnelMark?.data) funnelMark.data.scanLabel = 'The funnel — CLEAN hulls pass. One honest declaration lasts.';
      return;   // CLEAN hulls pass; the funnel holds nothing against them
    }
    if (!isSmallHull(player, t)) return;   // small hulls only

    const carrying = isCarryingCargo(s.player);
    if (carrying && speed <= t.declareSpeedWu) {
      // Declare once, unprompted: hold in the funnel carrying your cargo, honestly.
      this._declareHold += step;
      if (this._declareHold >= t.declareHoldS) {
        this._declareHold = 0;
        this._cleanUntil = now + t.cleanDays * t.MERCY_DAY_S;
        player.data = player.data || {};
        player.data.plantsPl353CleanUntil = this._cleanUntil;
        this.bus?.emit(PL_353_CLEAN_EVENT, { playerId: s.playerId, cleanUntil: this._cleanUntil, t: now });
        this._voice('plants:pl353:clean', CLEAN_LINE, 5);
        this._popup('plants:pl353:clean', CHECKER_SENDER, CLEAN_LINE, 6);
        this.bus?.emit('audio:cue', { id: 'confirm', position: { x: point.x, z: point.z }, gain: 0.5, rate: 1 });
      }
    } else if (carrying && speed >= t.smuggleSpeedWu) {
      // Smuggle once: blast the funnel carrying undeclared cargo. The memory lasts a year.
      this._declareHold = 0;
      this._smuggledUntil = now + t.smuggledDays * t.MERCY_DAY_S;
      this._cleanUntil = null;   // the stamp goes with the memory
      player.data = player.data || {};
      player.data.plantsPl353Smuggled = true;
      delete player.data.plantsPl353CleanUntil;
      const sd = station.data || (station.data = {});
      sd.plantsPl353Slow = String(s.playerId);   // economy-owner handoff stamp
      this.bus?.emit(PL_353_SMUGGLED_EVENT, { playerId: s.playerId, until: this._smuggledUntil, t: now });
      this._voice('plants:pl353:smuggled', SMUGGLED_LINE, 5);
      this._popup('plants:pl353:smuggled', CHECKER_SENDER, SMUGGLED_LINE, 6);
      this.bus?.emit('audio:cue', { id: 'warning', position: { x: point.x, z: point.z }, gain: 0.5, rate: 0.9 });
    }
  },
};

export const pl353CleanStampPlant = pl353CleanStamp;
