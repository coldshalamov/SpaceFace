// PL-195 The fixed X — "One mark on your Chart is not yours, and never moves: a small X beside
// nothing, there since your first chart | Go and look: nothing, at first"
//
// SEAM NOTE (honest): the Chart is UI-owned; this plant does not draw on maps. The mark is
// physical instead: a small X-shaped prop standing beside nothing at a position derived
// deterministically from hash32(sectorId) — the same absolute spot every session, so it truly
// never moves. It appears on the player's first flight in a sector (flagged once so it reads
// as "there since your first chart") and never relocates. Going and looking pays the row's
// whole payoff once per look: nothing, at first.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; the spot is hash32(sectorId, salt).
// - No Math.random(), no Date.now(). No Three.js, no DOM.
// - Session state on `this`; destroy() unsubscribes, removes the X, clears state.
// - The X never moves: update() snaps any drift (it is ours). One 'looked' event per look,
//   exit-gated so walking away and coming back is a new look.

import { hash32 } from '../../core/rng.js';

export const PL_195_LOOKED_EVENT = 'plants:pl195:looked';

export const FIXED_X_TUNING = Object.freeze({
  lookRadiusWu: 70,
  relookGapS: 20,             // leave and come back, and you may look again
  radius: 4,
  memoryCap: 2,
});

export const X_SALT = 'plantsPl195FixedX';

/** The fixed spot: same sector, same spot, every session, forever. */
export function fixedXPosition(sectorId, t = FIXED_X_TUNING) {
  const h = hash32(X_SALT, String(sectorId ?? 'sector'));
  return {
    x: -1200 + (h % 2400),
    z: -1200 + ((h >>> 12) % 2400),
  };
}

export function fixedXSpec(sectorId, t = FIXED_X_TUNING) {
  return {
    type: 'debris',
    pos: fixedXPosition(sectorId, t),
    vel: { x: 0, z: 0 },
    radius: t.radius,
    mass: 1e6,                  // never moves
    hull: 40,
    hullMax: 40,
    physicsBody: false,
    collides: false,
    data: {
      parentType: 'story_prop',
      storyPropKind: 'plants_fixed_x',
      plantsPl195X: true,
      scanLabel: 'A small X beside nothing — not your mark, and it never moves',
      swarmFloorPad: { label: 'X' },
    },
  };
}

export function createPl195FixedX() {
  return {
    name: 'plantsPl195',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._xId = null;
      this._placedFor = null;      // sectorId the X stands in
      this._wasLooking = false;
      this._lastLookAt = -Infinity;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => { this._wasLooking = false; });
      on('save:loaded', () => { this._wasLooking = false; });
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
      if (this._xId != null) this.helpers?.removeEntity?.(this._xId);
      this._xId = null;
      this._placedFor = null;
      this._wasLooking = false;
      this._lastLookAt = -Infinity;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      // A Swarm arena admits run bodies and arena props only — no campaign plants.
      if (s.world?.swarmArenaOnly) { this._resetSession(); return; }
      const t = FIXED_X_TUNING;
      const sectorId = s.world?.currentSectorId;
      if (!sectorId) return;
      // There since your first chart: it stands once per sector, at the fixed spot.
      if (this._xId == null || this._placedFor !== sectorId) {
        if (this._xId != null) this.helpers?.removeEntity?.(this._xId);
        const spawn = this.helpers?.spawnEntity;
        if (typeof spawn !== 'function') return;
        const ent = spawn(fixedXSpec(sectorId, t));
        if (ent && ent.id != null) {
          this._xId = ent.id;
          this._placedFor = sectorId;
        }
        return;
      }
      const x = s.entities?.get ? s.entities.get(this._xId) : null;
      if (!x || x.alive === false) { this._xId = null; return; }
      // Never moves: snap any drift.
      const spot = fixedXPosition(sectorId, t);
      if (x.pos && (Math.abs(Number(x.pos.x) - spot.x) > 0.5 || Math.abs(Number(x.pos.z) - spot.z) > 0.5)) {
        x.pos.x = spot.x;
        x.pos.z = spot.z;
      }
      // Go and look.
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;
      const now = this._now();
      const d = Math.hypot(Number(player.pos.x) - spot.x, Number(player.pos.z) - spot.z);
      const looking = d <= t.lookRadiusWu;
      if (looking && !this._wasLooking && now - this._lastLookAt >= t.relookGapS) {
        this._wasLooking = true;
        this._lastLookAt = now;
        this.bus?.emit('comms:popup', {
          id: `plants:pl195:looked:${Math.round(now)}`,
          sender: 'The spot',
          category: 'story',
          text: 'Nothing, at first.',
          ttl: 6,
          persist: false,
        });
        this.bus?.emit(PL_195_LOOKED_EVENT, { sectorId, pos: { ...spot }, t: now });
      } else if (!looking && this._wasLooking) {
        this._wasLooking = false;
      }
    },
  };
}

export const pl195FixedX = createPl195FixedX();
