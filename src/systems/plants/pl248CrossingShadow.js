// PL-248 The crossing shadow — "At one hour of the day the Slipway's counterweight throws its
// shadow across exactly one window on the Tower side, and the light in that window goes out
// while it passes | Be there; that is all of it"
//
// SEAM NOTE (honest): no coded Slipway/Tower pair exists in live data, so this plant stages
// the crossing itself — a fixed counterweight and a fixed Tower window (real story-props) in
// sector_ceres_belt, on a deterministic sightline. At the shadow hour the counterweight is
// walked across the sightline (sim-time lerp, no teleport while witnessed), and exactly one
// thing happens: the window's light goes out while it passes, and comes back after. If the
// player is within sight range at the moment the light dies, one witnessed event fires. No
// voice, no reward — the row's payoff IS the sight.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes owned props, clears state.
// - The shadow hour is a fixed fraction of the fixed sim day; the pass lasts tuning.passS.
// - One witnessed event per in-world day; the window lamp state is plain data the renderer reads.

import { hash32 } from '../../core/rng.js';

export const PL_248_WITNESSED_EVENT = 'plants:pl248:witnessed';

export const CROSSING_SHADOW_TUNING = Object.freeze({
  sectorId: 'sector_ceres_belt',
  dayLengthS: 240,
  shadowHourFraction: 0.62,   // one hour of the day
  passS: 14,                  // the shadow crossing lasts this long
  returnS: 40,                // the counterweight walks back, unseen hours
  sightRangeWu: 320,          // "be there"
  memoryCap: 4,
});

export const SLIPWAY_SALT = 'plantsPl248Slipway';

export function crossingLayoutFor(sectorId, t = CROSSING_SHADOW_TUNING) {
  const h = hash32(SLIPWAY_SALT, String(sectorId ?? t.sectorId));
  const ax = 200 + (h % 1200);
  const az = -900 + ((h >>> 6) % 900);
  return {
    window: { x: ax, z: az },
    counterweightStart: { x: ax - 220, z: az - 130 },
    counterweightEnd: { x: ax + 220, z: az + 130 },
  };
}

export function crossingPropsSpec(layout, t = CROSSING_SHADOW_TUNING) {
  return {
    counterweight: {
      type: 'beacon',
      pos: { ...layout.counterweightStart },
      vel: { x: 0, z: 0 },
      radius: 12,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: t.sectorId,
      data: {
        parentType: 'story_prop',
        storyPropKind: 'plants_slipway_counterweight',
        plantsPl248Counterweight: true,
        scanLabel: 'The Slipway — its counterweight',
        lampsOff: true,
      },
    },
    window: {
      type: 'beacon',
      pos: { ...layout.window },
      vel: { x: 0, z: 0 },
      radius: 4,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      homeSectorId: t.sectorId,
      data: {
        parentType: 'story_prop',
        storyPropKind: 'plants_tower_window',
        plantsPl248Window: true,
        scanLabel: 'The Tower side — one window, lit',
        swarmFloorPad: { label: 'The lit window' },
        lampsFlashing: true, // the light in that window
      },
    },
  };
}

export function createPl248CrossingShadow() {
  return {
    name: 'plantsPl248',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._cwId = null;
      this._winId = null;
      this._passDay = -1;
      this._witnessedDay = -1;
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
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._resetSession();
    },

    _resetSession() {
      this._drop(true);
    },

    _drop(hard) {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        if (this._cwId != null) rm(this._cwId);
        if (this._winId != null) rm(this._winId);
      }
      this._cwId = null;
      this._winId = null;
      this._passDay = -1;
      if (hard) this._witnessedDay = -1;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== CROSSING_SHADOW_TUNING.sectorId) return;
      const t = CROSSING_SHADOW_TUNING;
      const now = this._now();
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const layout = crossingLayoutFor(s.world?.currentSectorId, t);
      // Keep the pair standing.
      if (this._cwId == null) {
        const specs = crossingPropsSpec(layout, t);
        const cw = spawn(specs.counterweight);
        if (cw && cw.id != null) this._cwId = cw.id;
        if (!this._winId) {
          const win = spawn(specs.window);
          if (win && win.id != null) this._winId = win.id;
        }
      }
      const cw = this._cwId != null && s.entities?.get ? s.entities.get(this._cwId) : null;
      const win = this._winId != null && s.entities?.get ? s.entities.get(this._winId) : null;
      if (!cw?.pos || !win?.data) return;
      const len = t.dayLengthS;
      const phase = ((now % len) + len) % len;
      const shadowStart = len * t.shadowHourFraction;
      const dayIndex = Math.floor(now / len);
      const passing = phase >= shadowStart && phase < shadowStart + t.passS;
      const returning = phase >= shadowStart + t.passS && phase < shadowStart + t.passS + t.returnS;
      // The counterweight crosses the sightline during the pass, then walks back unseen.
      const k = passing
        ? (phase - shadowStart) / t.passS
        : returning ? 1 - (phase - shadowStart - t.passS) / t.returnS : 0;
      cw.pos.x = layout.counterweightStart.x + (layout.counterweightEnd.x - layout.counterweightStart.x) * k;
      cw.pos.z = layout.counterweightStart.z + (layout.counterweightEnd.z - layout.counterweightStart.z) * k;
      // The light in that window goes out while it passes, and only while it passes.
      win.data.lampsFlashing = !passing;
      if (passing) {
        this._passDay = dayIndex;
        // Be there; that is all of it.
        if (this._witnessedDay !== dayIndex) {
          const player = s.entities?.get ? s.entities.get(s.playerId) : null;
          const px = Number(player?.pos?.x);
          const pz = Number(player?.pos?.z);
          if (Number.isFinite(px) && Number.isFinite(pz)
            && Math.hypot(px - layout.window.x, pz - layout.window.z) <= t.sightRangeWu) {
            this._witnessedDay = dayIndex;
            this.bus?.emit(PL_248_WITNESSED_EVENT, { dayIndex, t: now });
          }
        }
      }
    },
  };
}

export const pl248CrossingShadow = createPl248CrossingShadow();
