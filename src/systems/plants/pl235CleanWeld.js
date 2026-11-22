// PL-235 The new weld — "Eunomia | The new weld. Kowalczyk's own seal-flare launcher is welded
// shut — one clean weld, newer than everything else on his hull. He did it himself | Notice; say
// nothing | DRAFT 2026-11-11"
//
// SEAM NOTE (honest): Eunomia is sector_eunomia_gulf / station_eunomia — Eunomia Fence (verified
// in src/data/frontierRegions/south.js, a Vael-licensed salvage yard). Kowalczyk exists only in
// the row, so his hull is a moored story-prop body near the Fence with the weld as its scan
// label. "Notice" is physical: a dwell inside his notice radius. "Say nothing" is physical too:
// no impact receipt against his hull inside the window, and his only answer is a lamp blink
// (data.lampsFlashing + lampFlashUntil — applausePlant lamp seam).
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM imports.
// - Session state on `this`; destroy()/sector:exit despawn the owned hull and clear Maps.
// - Bounded ledgers (tuning.memoryCap); one notice window per visit; cooldown after a spook.
// - Impacts are canonical physics receipts; the module never writes hull values.

import { hash32 } from '../../core/rng.js';

export const PL_235_NOTICED_EVENT = 'plants:pl235:noticed';
export const PL_235_SAID_NOTHING_EVENT = 'plants:pl235:saidNothing';
export const PL_235_SPOOKED_EVENT = 'plants:pl235:spooked';

export const CLEAN_WELD_TUNING = Object.freeze({
  sectorId: 'sector_eunomia_gulf',
  stationId: 'station_eunomia',
  hullOffsetWu: 200,
  noticeRadiusWu: 90,          // notice: come this close and stay
  noticeHoldS: 5,
  sayWindowS: 20,              // say nothing for this long after noticing
  spookImpulseMin: 30,         // a real hit on his hull ends the moment
  lampFlashS: 1.5,
  memoryCap: 4,
});

const finite = (v, f = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};

/** Deterministic mooring for Kowalczyk's hull off the Fence. */
export function hullMooring(stationPos, sectorId = CLEAN_WELD_TUNING.sectorId) {
  const h = hash32('plantsPl235mooring', String(sectorId));
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  return {
    x: finite(stationPos?.x) + Math.cos(bearing) * CLEAN_WELD_TUNING.hullOffsetWu,
    z: finite(stationPos?.z) + Math.sin(bearing) * CLEAN_WELD_TUNING.hullOffsetWu,
  };
}

export const pl235CleanWeld = {
  modes: ['flight'],
  name: 'plantsPl235',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._acc = 0;
    this._hullId = null;
    this._noticeHoldS = 0;
    this._noticedAt = -Infinity;
    this._saidThisVisit = false;
    this._spookedThisVisit = false;
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('physics:impact', (p = {}) => this._onImpact(p));
    on('entity:killed', (p = {}) => this._onKilled(p));
    on('sector:exit', (p = {}) => {
      if (!p.sectorId || p.sectorId === CLEAN_WELD_TUNING.sectorId) this._despawn();
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
    if (this._hullId != null && typeof this.helpers?.removeEntity === 'function') {
      this.helpers.removeEntity(this._hullId);
    }
    this._hullId = null;
    this._noticeHoldS = 0;
    this._noticedAt = -Infinity;
    this._saidThisVisit = false;
    this._spookedThisVisit = false;
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
      if (data.stationId === CLEAN_WELD_TUNING.stationId) return e;
    }
    return null;
  },

  _ensureHull(s, now) {
    const spawn = this.helpers?.spawnEntity;
    const station = this._station(s);
    if (typeof spawn !== 'function' || !station?.pos) return null;
    if (this._hullId != null) return this._entity(s, this._hullId);
    const pos = hullMooring(station.pos);
    const ent = spawn({
      type: 'debris',
      pos, vel: { x: 0, z: 0 },
      radius: 14,
      mass: 120,
      hull: 200,
      hullMax: 200,
      homeSectorId: CLEAN_WELD_TUNING.sectorId,
      data: {
        parentType: 'story_prop',
        scanLabel: "Kowalczyk's cutter — one clean weld, newer than everything else on the hull",
        storyPropKind: 'yard_cutter',
        pl235Hull: true,
        lampsFlashing: false,
        lampFlashUntil: 0,
        homeSectorId: CLEAN_WELD_TUNING.sectorId,
      },
    });
    if (ent && ent.id != null) this._hullId = ent.id;
    return ent;
  },

  _onImpact(p) {
    const s = this.state;
    if (!s || this._hullId == null) return;
    if (p.aId !== this._hullId && p.bId !== this._hullId) return;
    if (finite(p.impulse, 0) < CLEAN_WELD_TUNING.spookImpulseMin) return;
    this._spook(s);
  },

  _onKilled(p) {
    const s = this.state;
    if (!s || p.id !== this._hullId) return;
    this._spook(s);
  },

  _spook(s) {
    if (this._noticedAt < 0 || this._saidThisVisit || this._spookedThisVisit) return;
    this._spookedThisVisit = true;
    const now = this._now(s);
    const hull = this._entity(s, this._hullId);
    if (hull?.data) {
      hull.data.lampsFlashing = false;
      hull.data.lampFlashUntil = 0;
    }
    this.bus?.emit(PL_235_SPOOKED_EVENT, { hullId: this._hullId, t: now });
  },

  update(dt, state) {
    const s = state || this.state;
    if (!s || (s.mode && s.mode !== 'flight')) return;
    if (s.world?.currentSectorId !== CLEAN_WELD_TUNING.sectorId) { this._despawn(); return; }

    const hull = this._ensureHull(s, this._now(s));
    const player = typeof s.entities?.get === 'function' ? s.entities.get(s.playerId) : null;
    if (!hull?.pos || !player || player.alive === false || !player.pos) return;

    const now = this._now(s);
    const t = CLEAN_WELD_TUNING;

    this._acc += finite(dt);
    if (this._acc < 1) return;                 // 1 Hz — no per-frame work
    this._acc = 0;

    if (this._noticedAt < 0 && !this._spookedThisVisit) {
      const d = Math.hypot(player.pos.x - hull.pos.x, player.pos.z - hull.pos.z);
      if (d <= t.noticeRadiusWu) {
        this._noticeHoldS += 1;
        if (this._noticeHoldS >= t.noticeHoldS) {
          this._noticedAt = now;
          this.bus?.emit(PL_235_NOTICED_EVENT, { hullId: this._hullId, t: now });
          this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', position: { x: hull.pos.x, z: hull.pos.z }, gain: 0.3, rate: 0.7 });
        }
      } else {
        this._noticeHoldS = 0;
      }
    } else if (this._noticedAt >= 0 && !this._saidThisVisit && !this._spookedThisVisit) {
      // Say nothing: the window passes without a hit, and the weld answers with one blink.
      if (now - this._noticedAt >= t.sayWindowS) {
        this._saidThisVisit = true;
        hull.data.lampsFlashing = true;
        hull.data.lampFlashUntil = now + t.lampFlashS;
        this.bus?.emit(PL_235_SAID_NOTHING_EVENT, { hullId: this._hullId, t: now });
      }
    }
  },
};
