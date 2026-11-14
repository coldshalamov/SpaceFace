// PL-288 The lantern loan — Veil (design/program/INFERENCE_PLANTS.md, row PL-288).
// "The lantern loan. A lantern hangs at the dark-hold berth, chalked TAKE, RETURN LIT.
// It is for jobs that go down where light has to be carried."
// What the player can do: Return it lit; or return it dead — lantern loans go dry for
// you, town-wide, by next bell.
//
// SEAM NOTE (honest): the dark-hold berth is the docking ring of the REAL research
// station body (station_veil, sector_veil_nebula). The lantern is a tetherable payload
// prop on a hook prop, chalked TAKE, RETURN LIT. Taking it is proximity pickup; the
// flame is a real burn clock (data.litUntil): lampsFlash while it burns and go dark when
// the oil runs out. Returning it inside hook range while it still burns re-arms the loan
// ("the hook thanks you"). Returning it dead — after the burn clock ran out — is the
// greed branch: loans go dry for you by next bell (the next day boundary on the shared
// 240 s plant clock): the lantern prop leaves the hook, the chalk reads NO LANTERNS, and
// the flag-borne receipt (state.story.flags.plantsPl288Dry) plus the station's read-only
// stamp (data.plantsPl288DryForHull) are the documented handoff for any other lantern
// owner ("town-wide") to honor.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; the burn clock, the bell and the
//   hook bearing are pure clock/hash math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded Maps with tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns hook and lantern.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_288_TAKE_EVENT = 'plants:pl288:take';
export const PL_288_LIT_EVENT = 'plants:pl288:lit';
export const PL_288_DEAD_EVENT = 'plants:pl288:dead';
export const PL_288_DRY_EVENT = 'plants:pl288:dry';

export const LANTERN_LOAN_TUNING = Object.freeze({
  stationId: 'station_veil',
  sectorId: 'sector_veil_nebula',
  dayLengthS: 240,
  berthRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the dark-hold berth
  pickupRangeWu: 24,
  returnRangeWu: 30,
  burnS: 90,                   // the oil: lamps go dark when this runs out
  carryMinBeforeReturnS: 5,    // grabbing it off the hook is not "returning" it
  radius: 4,
  memoryCap: 8,
  sender: 'Berth keeper',
});

export const HOOK_SALT = 'plantsPl288Hook';
export const TAKE_LINE = 'For the dark holds. Bring it back lit.';
export const LIT_LINE = 'Lit. The hook thanks you.';
export const DEAD_LINE = 'Lantern loans go dry for you.';

/** The hook: a fixed chalked spot at the dark-hold berth, hash-derived bearing. */
export function hookPointFor(station, t = LANTERN_LOAN_TUNING) {
  const a = (hash32(HOOK_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.berthRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

/** Day index of the shared plant clock ("by next bell" = the next day boundary). */
export function lanternDayOf(simTime, t = LANTERN_LOAN_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** Pure read: is the lantern still burning at sim time? */
export function burningAt(lanternData, now) {
  const until = Number(lanternData?.litUntil);
  return Number.isFinite(until) && now < until;
}

export function createLanternLoan() {
  return {
    name: 'plantsPl288',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._hookId = null;
      this._lanternId = null;
      this._hookPoint = null;
      this._carried = false;
      this._takeDay = -1;
      this._dry = false;
      this._dryDay = -1;
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
      this._dry = !!(this.state?.story?.flags?.plantsPl288Dry);
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._hookId, this._lanternId]) if (id != null) rm(id);
      }
      this._hookId = null;
      this._lanternId = null;
      this._hookPoint = null;
      this._carried = false;
      this._takeDay = -1;
      this._dryDay = -1;
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

    _ensureHook(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const point = hookPointFor(station);
      this._hookPoint = point;
      if (this._hookId == null) {
        const hook = spawn({
          type: 'beacon',
          pos: { x: point.x, z: point.z },
          vel: { x: 0, z: 0 },
          radius: 5,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: LANTERN_LOAN_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_lantern_hook',
            plantsPl288Hook: true,
            scanLabel: this._dry
              ? 'The lantern hook \u2014 dry by next bell, and the chalk says why'
              : 'The lantern hook \u2014 chalked TAKE, RETURN LIT',
            swarmFloorPad: { label: this._dry ? 'NO LANTERNS' : 'TAKE \u2014 RETURN LIT' },
          },
        });
        this._hookId = hook && hook.id != null ? hook.id : null;
      }
      if (!this._dry && this._lanternId == null) {
        const now = this._now();
        const lantern = spawn({
          type: 'payload',
          pos: { x: point.x + 6, z: point.z + 2 },
          vel: { x: 0, z: 0 },
          radius: LANTERN_LOAN_TUNING.radius,
          mass: 3,
          physicsBody: { mass: 3 },
          flags: { persistent: true },
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_lantern',
            plantsPl288Lantern: true,
            masslineTetherable: true,
            scanLabel: 'The loan lantern \u2014 TAKE, RETURN LIT',
            swarmFloorPad: { label: 'LOAN LANTERN' },
            litUntil: 0,                                     // lit when taken
            lampsFlashing: false,
          },
        });
        this._lanternId = lantern && lantern.id != null ? lantern.id : null;
        void now;
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== LANTERN_LOAN_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, LANTERN_LOAN_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = LANTERN_LOAN_TUNING;
      this._ensureHook(station);
      if (!this._hookPoint) return;
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;

      const lantern = this._lanternId != null ? this._get(this._lanternId) : null;
      // Loans go dry by next bell after a dead return: the prop leaves the hook.
      if (this._dry && this._dryDay !== lanternDayOf(now, t)) {
        this._dryDay = lanternDayOf(now, t);
        if (this._lanternId != null) this.helpers?.removeEntity?.(this._lanternId);
        this._lanternId = null;
        const hook = this._get(this._hookId);
        if (hook?.data) {
          hook.data.swarmFloorPad = { label: 'NO LANTERNS' };
          hook.data.scanLabel = 'The lantern hook \u2014 dry by next bell, and the chalk says why';
        }
        return;
      }
      if (!lantern || lantern.alive === false) {
        this._lanternId = null;
        this._carried = false;
        return;                                              // dry, or gone for good
      }

      if (!this._carried) {
        // Loans go dry by next bell after a dead return: the prop leaves the hook.
        if (this._dry && this._dryDay !== lanternDayOf(now, t)) {
          this.helpers?.removeEntity?.(this._lanternId);
          this._lanternId = null;
          const hook = this._get(this._hookId);
          if (hook?.data) {
            hook.data.swarmFloorPad = { label: 'NO LANTERNS' };
            hook.data.scanLabel = 'The lantern hook \u2014 dry by next bell, and the chalk says why';
          }
          this._dryDay = lanternDayOf(now, t);
          return;
        }
        const d = Math.hypot(lantern.pos.x - player.pos.x, lantern.pos.z - player.pos.z);
        if (d <= t.pickupRangeWu) {
          this._carried = true;
          this._carriedSince = now;
          this._takeDay = lanternDayOf(now, t);
          lantern.data.litUntil = now + t.burnS;             // the flame is a real burn clock
          lantern.data.lampsFlashing = true;
          this._cue('sfx_vent_chime', 0.35, 1.3);
          this._popup(`plants:pl288:take:${Math.round(now)}`, t.sender, TAKE_LINE);
          this._emit(PL_288_TAKE_EVENT, { day: this._takeDay, litUntil: lantern.data.litUntil, t: now });
        }
        return;
      }

      // Carried: the lantern rides your quarter, burning down.
      lantern.pos.x = player.pos.x + 12;
      lantern.pos.z = player.pos.z - 8;
      const lit = burningAt(lantern.data, now);
      lantern.data.lampsFlashing = lit;
      const dHook = Math.hypot(player.pos.x - this._hookPoint.x, player.pos.z - this._hookPoint.z);
      if (dHook <= t.returnRangeWu && now - (this._carriedSince || now) >= t.carryMinBeforeReturnS) {
        if (lit) {
          // Return it lit: the loan re-arms, the hook thanks you.
          this.helpers?.removeEntity?.(this._lanternId);
          this._lanternId = null;
          this._carried = false;
          lantern.data.lampsFlashing = false;
          this._cue('confirm', 0.45);
          this._popup(`plants:pl288:lit:${Math.round(now)}`, t.sender, LIT_LINE);
          this._emit(PL_288_LIT_EVENT, { day: lanternDayOf(now, t), t: now });
        } else {
          // Return it dead: loans go dry for you, town-wide, by next bell.
          this._dry = true;
          this._dryDay = lanternDayOf(now, t);
          const flags = this._flags();
          if (flags) flags.plantsPl288Dry = true;
          const stationEnt = station;
          if (stationEnt?.data) stationEnt.data.plantsPl288DryForHull = String(s.playerId);
          this.helpers?.removeEntity?.(this._lanternId);
          this._lanternId = null;
          this._carried = false;
          this._cue('ui_deny', 0.5);
          this._popup(`plants:pl288:dead:${Math.round(now)}`, t.sender, DEAD_LINE);
          this._emit(PL_288_DEAD_EVENT, { day: this._dryDay, t: now });
          this._emit(PL_288_DRY_EVENT, { day: this._dryDay, dryUntilDay: this._dryDay + 1, t: now });
        }
      }
    },
  };
}

export const lanternLoanPlant = createLanternLoan();
