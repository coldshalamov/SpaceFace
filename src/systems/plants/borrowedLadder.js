// PL-279 The borrowed ladder — Vesta (design/program/INFERENCE_PLANTS.md, row PL-279).
// "The borrowed ladder. A work ladder hangs off the pier arm, chalked BORROW, BACK BY
// BELL. Borrow it and it is simply there when you need a hand."
// What the player can do: Return it by the bell; or keep it — the pier chain-lends you
// nothing again, and everyone sees the empty hook.
//
// SEAM NOTE (honest): Vesta Forge is the station_forge body (sector_vesta_forge). The pier
// arm is a chalked hook prop at a fixed hash bearing on the docking ring, with the ladder
// hanging beside it as a tetherable payload prop. Borrowing is proximity pickup: the
// ladder rides your quarter, tetherable the whole way. "It is simply there when you need
// a hand": while carried, if your hull runs low, a pier hand line gives one real shove
// impulse toward the station (a physics nudge on vel, once per borrow). Back by the bell:
// return it inside hook range before phase 0.75 of the shared 240 s plant day and it is
// re-hung. Keep it past the bell and the receipt is flag-borne
// (state.story.flags.plantsPl279Kept): the hook goes empty (visible label), the shove
// never fires again for you, and one passer-by says what everyone is thinking.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; bell phase and hook bearing are pure
//   clock/hash math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded memory: the shove ledger is one slot per borrow.
// - Session state on `this`; destroy() unsubscribes all + despawns hook, ladder, witness.
// - NO economy writes: a hand is an impulse and a line, never a credits mutation.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_279_BORROW_EVENT = 'plants:pl279:borrow';
export const PL_279_RETURNED_EVENT = 'plants:pl279:returned';
export const PL_279_KEPT_EVENT = 'plants:pl279:kept';
export const PL_279_HAND_EVENT = 'plants:pl279:hand';

export const BORROWED_LADDER_TUNING = Object.freeze({
  stationId: 'station_forge',
  sectorId: 'sector_vesta_forge',
  dayLengthS: 240,
  bellPhase: 0.75,             // back by the bell
  hookRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the pier arm
  pickupRangeWu: 24,
  returnRangeWu: 30,
  handHullFraction: 0.45,      // "when you need a hand"
  handImpulseWu: 60,           // one real shove toward the pier
  handCooldownS: 45,
  carryMinBeforeReturnS: 5,    // grabbing it off the hook is not "returning" it
  ladderRadius: 4,
  memoryCap: 8,
});

export const HOOK_SALT = 'plantsPl279Hook';
export const BORROW_LINE = 'Chalk says back by bell.';
export const RETURNED_LINE = 'On the hook. Chalk still reads BORROW.';
export const WITNESS_LINE = 'That\u2019s the ladder that never came back.';

/** The pier arm hook: a fixed chalked spot, hash-derived bearing. */
export function hookPointFor(station, t = BORROWED_LADDER_TUNING) {
  const a = (hash32(HOOK_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.hookRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

/** Day index of the shared plant clock. */
export function ladderDayOf(simTime, t = BORROWED_LADDER_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** Phase of the shared plant day, 0..1. */
export function ladderPhaseOf(simTime, t = BORROWED_LADDER_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  return (((simTime % len) + len) % len) / len;
}

export function createBorrowedLadder() {
  return {
    name: 'plantsPl279',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._hookId = null;
      this._ladderId = null;
      this._hookPoint = null;
      this._carried = false;
      this._carriedSince = null;
      this._borrowDay = -1;
      this._handsGiven = 0;
      this._lastHandAt = null;
      this._kept = false;
      this._keptAt = null;
      this._witnessed = false;
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
      this._drop();
      this._kept = !!(this.state?.story?.flags?.plantsPl279Kept);
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._hookId, this._ladderId]) if (id != null) rm(id);
      }
      this._hookId = null;
      this._ladderId = null;
      this._hookPoint = null;
      this._carried = false;
      this._carriedSince = null;
      this._borrowDay = -1;
      this._handsGiven = 0;
      this._lastHandAt = null;
      this._witnessed = false;
      this._keptAt = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
    },

    _flags() {
      const s = this.state;
      return s && s.story ? (s.story.flags || (s.story.flags = {})) : null;
    },

    _popup(id, sender, text, ttl = 8) {
      this.bus?.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
    },

    _cue(id, gain = 0.45) {
      this.bus?.emit('audio:cue', { id, gain });
    },

    _emit(type, payload) {
      this.bus?.emit(type, payload);
    },

    _get(id) {
      return this.state?.entities?.get ? this.state.entities.get(id) : null;
    },

    _ensurePier(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const point = hookPointFor(station);
      this._hookPoint = point;
      if (this._hookId == null) {
        const kept = this._kept;
        const hook = spawn({
          type: 'beacon',
          pos: { x: point.x, z: point.z },
          vel: { x: 0, z: 0 },
          radius: 6,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: BORROWED_LADDER_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_ladder_hook',
            plantsPl279Hook: true,
            scanLabel: kept
              ? 'The pier arm hook \u2014 empty, and everyone has noticed'
              : 'The pier arm hook \u2014 chalked BORROW, BACK BY BELL',
            swarmFloorPad: { label: kept ? 'EMPTY HOOK' : 'BORROW \u2014 BACK BY BELL' },
          },
        });
        this._hookId = hook && hook.id != null ? hook.id : null;
      }
      if (this._ladderId == null && !this._kept) {
        const ladder = spawn({
          type: 'payload',
          pos: { x: point.x + 8, z: point.z + 2 },
          vel: { x: 0, z: 0 },
          radius: BORROWED_LADDER_TUNING.ladderRadius,
          mass: 6,
          physicsBody: { mass: 6 },
          flags: { persistent: true },
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_work_ladder',
            plantsPl279Ladder: true,
            masslineTetherable: true,
            scanLabel: 'The pier ladder \u2014 borrow it, back by the bell',
            swarmFloorPad: { label: 'WORK LADDER' },
          },
        });
        this._ladderId = ladder && ladder.id != null ? ladder.id : null;
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== BORROWED_LADDER_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, BORROWED_LADDER_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = BORROWED_LADDER_TUNING;
      this._ensurePier(station);
      if (!this._hookPoint) return;
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;
      const phase = ladderPhaseOf(now, t);

      // Everyone sees the empty hook: one passer-by says what the street is thinking.
      if (this._kept && !this._witnessed && this._keptAt != null
          && now - this._keptAt >= 20 && this._hookPoint) {
        const dHook = Math.hypot(player.pos.x - this._hookPoint.x, player.pos.z - this._hookPoint.z);
        if (dHook <= 120) {
          this._witnessed = true;
          this._popup(`plants:pl279:witness:${Math.round(now)}`, 'Passing hauler', WITNESS_LINE);
        }
      }

      const ladder = this._ladderId != null ? this._get(this._ladderId) : null;
      if (!this._carried && (!ladder || ladder.alive === false)) {
        this._ladderId = null;
        return;                                              // kept, or gone for good
      }

      if (!this._carried) {
        const d = Math.hypot(ladder.pos.x - player.pos.x, ladder.pos.z - player.pos.z);
        if (d <= t.pickupRangeWu) {
          this._carried = true;
          this._carriedSince = now;
          this._borrowDay = ladderDayOf(now, t);
          this._handsGiven = 0;
          this._cue('sfx_vent_chime', 0.35, 0.8);
          this._popup(`plants:pl279:borrow:${Math.round(now)}`, 'Pier hand', BORROW_LINE);
          this._emit(PL_279_BORROW_EVENT, { day: this._borrowDay, t: now });
        }
        return;
      }

      // Carried: the ladder rides your quarter.
      ladder.pos.x = player.pos.x + 14;
      ladder.pos.z = player.pos.z + 8;

      // Kept past the bell: the empty hook, and the chain never lends you again.
      if (phase >= t.bellPhase && !this._kept) {
        this._kept = true;
        const flags = this._flags();
        if (flags) flags.plantsPl279Kept = true;
        this.helpers?.removeEntity?.(this._ladderId);
        this._ladderId = null;
        this._carried = false;
        const hook = this._get(this._hookId);
        if (hook?.data) {
          hook.data.swarmFloorPad = { label: 'EMPTY HOOK' };
          hook.data.scanLabel = 'The pier arm hook \u2014 empty, and everyone has noticed';
        }
        this._cue('ui_deny', 0.5);
        this._popup(`plants:pl279:kept:${Math.round(now)}`, 'Pier hand',
          'The ladder was chalked BACK BY BELL. It isn\u2019t coming back.');
        this._emit(PL_279_KEPT_EVENT, { day: this._borrowDay, t: now });
        this._keptAt = now;
        return;
      }

      // It is simply there when you need a hand: one shove per borrow, when your hull runs low.
      const hullMax = Number.isFinite(player.hullMax) && player.hullMax > 0 ? player.hullMax : Math.max(1, player.hull || 1);
      const frac = Number.isFinite(player.hull) ? player.hull / hullMax : 1;
      if (!this._kept && frac <= t.handHullFraction
          && (this._lastHandAt == null || now - this._lastHandAt >= t.handCooldownS)) {
        this._lastHandAt = now;
        this._handsGiven += 1;
        const dx = station.pos.x - player.pos.x;
        const dz = station.pos.z - player.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        player.vel = player.vel || { x: 0, z: 0 };
        player.vel.x += (dx / d) * t.handImpulseWu;
        player.vel.z += (dz / d) * t.handImpulseWu;
        this._cue('confirm', 0.4);
        this._popup(`plants:pl279:hand:${Math.round(now)}`, 'Pier hand',
          'Easy \u2014 the ladder\u2019s got you. Hook\u2019s this way.');
        this._emit(PL_279_HAND_EVENT, { handsGiven: this._handsGiven, t: now });
        return;
      }

      // Back by the bell: bring it to the hook and it is simply there again next time.
      const dHook = Math.hypot(player.pos.x - this._hookPoint.x, player.pos.z - this._hookPoint.z);
      if (dHook <= t.returnRangeWu && phase < t.bellPhase
          && now - (this._carriedSince || now) >= t.carryMinBeforeReturnS) {
        this.helpers?.removeEntity?.(this._ladderId);
        this._ladderId = null;
        this._carried = false;
        this._handsGiven = 0;
        this._cue('confirm', 0.4);
        this._popup(`plants:pl279:returned:${Math.round(now)}`, 'Pier hand', RETURNED_LINE);
        this._emit(PL_279_RETURNED_EVENT, { day: ladderDayOf(now, t), t: now });
      }
    },
  };
}

export const borrowedLadderPlant = createBorrowedLadder();
