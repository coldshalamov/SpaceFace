// PL-205 The lit hull — "In the Helios yard one hull is always lit, and nobody is ever seen
// aboard. Park beside it and the light inside moves, once | Leave it be; that light is hers"
//
// SEAM NOTE (honest): the Helios yard is the apron of the station_helios body in
// sector_helios_prime (src/data/sectors.js:63). The lit hull is one fixed prop off the live
// station body, lamp always lit. Park beside it, slow, and the light inside moves ONCE —
// a lamp stamp flips and a single quiet interior cue sounds — then it will not move again
// until you have left it alone and come back. This plant is SILENT by design: nobody is
// ever seen aboard, so there is no voice, ever. Bump the hull and the light goes out for
// a while, then relights: she came home. Leave it be and nothing happens — that is the plant.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes every listener, despawns the hull prop,
//   clears session state. One bounded stamp per visit (tuning.memoryCap).
// - "Once" is honest: the light moves at most once per visit, and a visit ends when the
//   player has left the yard radius or the sector.

import { hash32 } from '../../core/rng.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_205_LIGHT_MOVED_EVENT = 'plants:pl205:lightMoved';
export const PL_205_DARK_EVENT = 'plants:pl205:dark';
export const PL_205_RELIT_EVENT = 'plants:pl205:relit';

export const LIT_HULL_TUNING = Object.freeze({
  sectorId: 'sector_helios_prime',
  stationId: 'station_helios',
  yardOffsetWu: 320,
  bearingSalt: 'plantsPl205LitHull',
  parkRadiusWu: 40,
  parkGateSpeed: 5,
  parkNeedS: 2,
  visitResetRadiusWu: 140,    // leave this far and the visit ends
  relightS: 45,               // the light comes back on its own
  interiorRate: 0.7,
  interiorGain: 0.25,
  hullRadius: 12,
  memoryCap: 4,
});

/** Fixed yard spot of the lit hull off the live station body. */
export function litHullSpotFor(origin, t = LIT_HULL_TUNING) {
  const h = hash32(t.bearingSalt, t.stationId);
  const bearing = (h % 3600) / 3600 * Math.PI * 2;
  return {
    x: origin.x + Math.cos(bearing) * t.yardOffsetWu,
    z: origin.z + Math.sin(bearing) * t.yardOffsetWu,
  };
}

export function createPl205TheLitHull() {
  return {
    name: 'plantsPl205',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._hullId = null;
      this._parkSince = null;
      this._movedThisVisit = false;
      this._inVisit = false;
      this._darkUntil = null;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('physics:impact', (p = {}) => this._onImpact(p));
      on('sector:exit', () => this._drop());
      on('save:loaded', () => this._drop());
      on('game:new', () => this._resetSession());
      on('game:newGame', () => this._resetSession());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._resetSession();
    },

    _resetSession() {
      this._drop();
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        if (this._hullId != null) rm(this._hullId);
      }
      this._hullId = null;
      this._parkSince = null;
      this._movedThisVisit = false;
      this._inVisit = false;
      this._darkUntil = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _ensure(origin) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._hullId != null) return;
      const t = LIT_HULL_TUNING;
      const spot = litHullSpotFor(origin, t);
      const ent = spawn({
        type: 'beacon',
        pos: { x: spot.x, z: spot.z },
        vel: { x: 0, z: 0 },
        radius: t.hullRadius,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: t.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_lit_hull',
          plantsPl205Hull: true,
          placeId: 'place_habitat_pod',
          everydaySpaceKit: true,
          scanLabel: 'One hull in the yard is always lit — nobody is ever seen aboard',
          swarmFloorPad: { label: 'The lit hull' },
          lampsFlashing: true, // always lit
          plantsPl205Lit: true,
        },
      });
      if (ent && ent.id != null) this._hullId = ent.id;
    },

    _onImpact(p) {
      const s = this.state;
      if (!s || !p || this._hullId == null) return;
      const involved = p.aId === this._hullId || p.bId === this._hullId;
      if (!involved) return;
      const otherId = p.aId === this._hullId ? p.bId : p.aId;
      if (otherId !== s.playerId) return;
      const hull = s.entities?.get ? s.entities.get(this._hullId) : null;
      if (!hull?.data) return;
      const now = this._now();
      // The light goes out — then she comes home.
      hull.data.plantsPl205Lit = false;
      hull.data.lampsFlashing = false;
      this._darkUntil = now + LIT_HULL_TUNING.relightS;
      this.bus?.emit('audio:cue', { id: 'ui_deny' });
      this.bus?.emit(PL_205_DARK_EVENT, { t: now });
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== LIT_HULL_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, LIT_HULL_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const t = LIT_HULL_TUNING;
      const now = this._now();
      this._ensure(station.pos);
      const hull = this._hullId != null && s.entities?.get ? s.entities.get(this._hullId) : null;
      if (!hull?.pos) return;

      // She comes home: the light relights itself.
      if (this._darkUntil != null && now >= this._darkUntil) {
        this._darkUntil = null;
        hull.data.plantsPl205Lit = true;
        hull.data.lampsFlashing = true;
        this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', rate: 1.1, gain: 0.2 });
        this.bus?.emit(PL_205_RELIT_EVENT, { t: now });
      }

      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;
      const d = Math.hypot(player.pos.x - hull.pos.x, player.pos.z - hull.pos.z);
      if (d > t.visitResetRadiusWu) {
        // Left alone: the visit ends, the "once" re-arms for next time.
        if (this._inVisit && d > t.visitResetRadiusWu) {
          this._inVisit = false;
          this._movedThisVisit = false;
        }
        this._parkSince = null;
        return;
      }
      this._inVisit = true;
      if (d <= t.parkRadiusWu && Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0) <= t.parkGateSpeed) {
        if (this._parkSince == null) this._parkSince = now;
        else if (!this._movedThisVisit && now - this._parkSince >= t.parkNeedS) {
          // The light inside moves, once.
          this._movedThisVisit = true;
          this._parkSince = null;
          hull.data.plantsPl205WindowSide = hull.data.plantsPl205WindowSide === 1 ? 2 : 1;
          hull.data.plantsPl205MovedAt = now;
          this.bus?.emit('audio:cue', { id: 'sfx_vent_chime', rate: t.interiorRate, gain: t.interiorGain });
          this.bus?.emit(PL_205_LIGHT_MOVED_EVENT, { windowSide: hull.data.plantsPl205WindowSide, t: now });
        }
      } else if (d > t.parkRadiusWu) {
        this._parkSince = null;
      }
    },
  };
}

export const pl205TheLitHull = createPl205TheLitHull();
