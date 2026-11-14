// PL-285 The fare pool — Charon (design/program/INFERENCE_PLANTS.md, row PL-285).
// "The fare pool. Share your tow-fare with a stranded skiffer at the pool box, and the
// pool marks you covered. The day YOUR hull dies out there, someone tows you in, prepaid."
// What the player can do: Pay it forward; or dodge a fare you owe — the pool forgets your
// hull, politely and forever.
//
// SEAM NOTE (honest): Charon Expanse is the station_expanse body (sector_charon_expanse).
// The pool box is a chalked prop at a fixed hash bearing on the docking ring; the
// stranded skiffer is a real neutral stranger (makeShipEntitySpec, team 2, passive, low
// hull) adrift at a hash spot inside the patrol shell (4x dockRadius, stationBubbles).
// Paying it forward is physical: tether the skiffer (the real tether:attached receipt)
// and bring them inside the pool range — the pool takes the line, the skiffer despawns
// into the pool's tow, and a flag-borne receipt marks you covered
// (state.story.flags.plantsPl285Covered). Dodging a fare you owe is breaking that tether
// away from the pool: the pool forgets your hull, politely and forever (covered cleared,
// receipt flag plantsPl285Forgot). The prepaid tow: while covered, a hull below the
// critical fraction gets one real rescue — a pool tug (team 2, passive) that comes out
// and shoves you toward the pool. The day-your-hull-dies integration is documented as a
// handoff: PL_285_RESCUE_DUE_EVENT is emitted on the player's entity:killed receipt for
// the death/respawn owner to consume; no economy or respawn code is touched here.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; pool bearing and skiffer drift are
//   pure clock/hash math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded Maps with tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns box, skiffer, tug.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { makeShipEntitySpec } from '../ships.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_285_COVERED_EVENT = 'plants:pl285:covered';
export const PL_285_DODGED_EVENT = 'plants:pl285:dodged';
export const PL_285_RESCUE_EVENT = 'plants:pl285:rescue';
export const PL_285_RESCUE_DUE_EVENT = 'plants:pl285:rescueDue';

export const FARE_POOL_TUNING = Object.freeze({
  stationId: 'station_expanse',
  sectorId: 'sector_charon_expanse',
  dayLengthS: 240,
  poolRadiusMult: BUBBLE_MULTIPLIERS.docking,  // 2.4x — the pool box apron
  skifferRadiusMult: BUBBLE_MULTIPLIERS.patrol, // 4x — stranded out on the line
  skifferHull: 'ship_drifter',
  skifferFaction: 'faction_dmc',
  skifferHullValue: 30,
  skifferHullMaxValue: 100,
  poolRangeWu: 40,
  releaseZoneWu: 60,           // inside this, dropping the line is handing over, not dodging
  rescueHullFraction: 0.2,
  rescueOncePerSession: true,
  tugSpeedWu: 26,
  tugImpulseWu: 70,
  memoryCap: 8,
  sender: 'Fare pool',
});

export const POOL_SALT = 'plantsPl285Pool';
export const COVERED_LINE = 'Covered. Someone will tow you too.';
export const DODGED_LINE = 'The pool crosses you off. Politely.';
export const RESCUE_LINE = 'Pool\u2019s paid. Grab the line.';
export const RESCUE_DUE_NOTE = 'The pool owes you a tow. Prepaid.';

/** The pool box: a fixed chalked spot, hash-derived bearing. */
export function poolPointFor(station, t = FARE_POOL_TUNING) {
  const a = (hash32(POOL_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.poolRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

/** The stranded skiffer's adrift spot, deterministic per session seed-day. */
export function skifferPointFor(station, day, t = FARE_POOL_TUNING) {
  const a = (hash32(POOL_SALT, 'skiffer', String(day)) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.skifferRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

export function createFarePool() {
  return {
    name: 'plantsPl285',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._boxId = null;
      this._boxPoint = null;
      this._skifferId = null;
      this._skifferDay = -1;
      this._tugId = null;
      this._towing = false;      // the player's line is on the skiffer
      this._covered = false;
      this._forgot = false;
      this._rescueDone = false;
      const on = (event, fn) => {
        const off = this.bus?.on?.(event, fn);
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('tether:attached', (p = {}) => this._onTether(p));
      on('tether:broken', (p = {}) => this._onTetherBroken(p));
      on('entity:killed', (p = {}) => this._onKilled(p));
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
      const flags = this.state?.story?.flags || {};
      this._covered = !flags.plantsPl285Forgot && !!flags.plantsPl285Covered;
      this._forgot = !!flags.plantsPl285Forgot;
      this._rescueDone = false;
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._boxId, this._skifferId, this._tugId]) if (id != null) rm(id);
      }
      this._boxId = null;
      this._boxPoint = null;
      this._skifferId = null;
      this._skifferDay = -1;
      this._tugId = null;
      this._towing = false;
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

    _ensureBox(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._boxId != null) return;
      const point = poolPointFor(station);
      this._boxPoint = point;
      const box = spawn({
        type: 'beacon',
        pos: { x: point.x, z: point.z },
        vel: { x: 0, z: 0 },
        radius: 6,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: FARE_POOL_TUNING.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_fare_pool_box',
          plantsPl285Box: true,
          placeId: 'place_utility_module',
          everydaySpaceKit: true,
          scanLabel: 'The fare pool box \u2014 share a tow-fare, get marked covered',
          swarmFloorPad: { label: this._covered ? 'POOL: YOU ARE COVERED' : 'FARE POOL BOX' },
        },
      });
      this._boxId = box && box.id != null ? box.id : null;
    },

    _ensureSkiffer(station, day) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._skifferId != null || this._forgot) return;
      if (this._skifferDay === day) return;
      const point = skifferPointFor(station, day, FARE_POOL_TUNING);
      const spec = makeShipEntitySpec(FARE_POOL_TUNING.skifferHull, {
        team: 2,
        factionId: FARE_POOL_TUNING.skifferFaction,
        pos: { x: point.x, z: point.z },
        ai: { archetype: 'passive', passive: true },
      });
      spec.data = spec.data || {};
      spec.data.plantsPl285Skiffer = true;
      spec.data.parentType = 'story_prop';
      spec.data.callsign = 'skiffer';
      spec.data.despawnAt = null;
      spec.hull = FARE_POOL_TUNING.skifferHullValue;
      spec.hullMax = FARE_POOL_TUNING.skifferHullMaxValue;
      const ent = spawn(spec);
      if (ent && ent.id != null) {
        this._skifferId = ent.id;
        this._skifferDay = day;
      }
    },

    _onTether(p) {
      const s = this.state;
      if (!s || !p || p.actorId !== s.playerId) return;
      if (p.targetId != null && p.targetId === this._skifferId) this._towing = true;
    },

    _onTetherBroken(p) {
      const s = this.state;
      if (!s || !p || !this._towing) return;
      this._towing = false;
      // Handing over at the pool is not dodging; only dropping the line out on the line is.
      const skiffer = this._skifferId != null ? this._get(this._skifferId) : null;
      if (!skiffer?.pos || !this._boxPoint) return;
      const dPool = Math.hypot(skiffer.pos.x - this._boxPoint.x, skiffer.pos.z - this._boxPoint.z);
      const now = this._now();
      if (dPool <= FARE_POOL_TUNING.releaseZoneWu) return;
      // Dodged a fare you owed: the pool forgets your hull, politely and forever.
      this._forgot = true;
      this._covered = false;
      this.helpers?.removeEntity?.(this._skifferId);
      this._skifferId = null;
      const flags = this._flags();
      if (flags) {
        flags.plantsPl285Forgot = true;
        flags.plantsPl285Covered = false;
      }
      const box = this._get(this._boxId);
      if (box?.data) box.data.swarmFloorPad = { label: 'FARE POOL BOX' };
      this._cue('ui_deny', 0.5);
      this._popup(`plants:pl285:dodged:${Math.round(now)}`, FARE_POOL_TUNING.sender, DODGED_LINE);
      this._emit(PL_285_DODGED_EVENT, { t: now });
    },

    _onKilled(p) {
      const s = this.state;
      if (!s || !p) return;
      if (p.id !== s.playerId) return;
      // Documented handoff: the death/respawn owner consumes this prepaid-tow receipt.
      if (this._covered) this._emit(PL_285_RESCUE_DUE_EVENT, { hullId: s.playerId, note: RESCUE_DUE_NOTE });
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== FARE_POOL_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, FARE_POOL_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = FARE_POOL_TUNING;
      const day = Math.floor(now / Math.max(1, t.dayLengthS));
      this._ensureBox(station);
      this._ensureSkiffer(station, day);
      if (!this._boxPoint) return;
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;

      // Share your tow-fare: bring the skiffer inside the pool range and the pool takes the line.
      const skiffer = this._skifferId != null ? this._get(this._skifferId) : null;
      if (skiffer?.pos && this._towing && !this._covered && !this._forgot) {
        const d = Math.hypot(skiffer.pos.x - this._boxPoint.x, skiffer.pos.z - this._boxPoint.z);
        if (d <= t.poolRangeWu) {
          this._covered = true;
          const flags = this._flags();
          if (flags) flags.plantsPl285Covered = true;
          this._towing = false;
          this.helpers?.removeEntity?.(this._skifferId);
          this._skifferId = null;
          const box = this._get(this._boxId);
          if (box?.data) box.data.swarmFloorPad = { label: 'POOL: YOU ARE COVERED' };
          this._cue('confirm', 0.45);
          this._popup(`plants:pl285:covered:${Math.round(now)}`, t.sender, COVERED_LINE);
          this._emit(PL_285_COVERED_EVENT, { day, t: now });
        }
      }

      // The day your hull runs out out there: the prepaid tow comes to you, once.
      if (this._covered && !this._rescueDone && this._tugId == null) {
        const hullMax = Number.isFinite(player.hullMax) && player.hullMax > 0 ? player.hullMax : Math.max(1, player.hull || 1);
        const frac = Number.isFinite(player.hull) ? player.hull / hullMax : 1;
        if (frac <= t.rescueHullFraction) {
          const spawn = this.helpers?.spawnEntity;
          if (typeof spawn !== 'function') return;
          const spec = makeShipEntitySpec('ship_drifter', {
            team: 2,
            factionId: t.skifferFaction,
            pos: { x: station.pos.x + 40, z: station.pos.z - 40 },
            ai: { archetype: 'passive', passive: true },
          });
          spec.data = spec.data || {};
          spec.data.plantsPl285Tug = true;
          spec.data.parentType = 'story_prop';
          spec.data.callsign = 'pool tug';
          spec.data.despawnAt = null;
          const tug = spawn(spec);
          if (tug && tug.id != null) this._tugId = tug.id;
          this._popup(`plants:pl285:tug:${Math.round(now)}`, t.sender, RESCUE_LINE);
        }
      }

      // The pool tug closes and gives one real shove toward the pool.
      const tug = this._tugId != null ? this._get(this._tugId) : null;
      if (tug?.pos) {
        const dx = player.pos.x - tug.pos.x;
        const dz = player.pos.z - tug.pos.z;
        const d = Math.hypot(dx, dz);
        const step = t.tugSpeedWu * Math.max(0, Number(dt) || 0);
        if (d > 20) {
          tug.pos.x += (dx / d) * step;
          tug.pos.z += (dz / d) * step;
        } else {
          player.vel = player.vel || { x: 0, z: 0 };
          const toward = Math.hypot(this._boxPoint.x - player.pos.x, this._boxPoint.z - player.pos.z) || 1;
          player.vel.x += ((this._boxPoint.x - player.pos.x) / toward) * t.tugImpulseWu;
          player.vel.z += ((this._boxPoint.z - player.pos.z) / toward) * t.tugImpulseWu;
          this._rescueDone = true;
          this.helpers?.removeEntity?.(this._tugId);
          this._tugId = null;
          this._cue('confirm', 0.45);
          this._emit(PL_285_RESCUE_EVENT, { t: now });
        }
      }
    },
  };
}

export const farePoolPlant = createFarePool();
