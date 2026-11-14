// PL-291 The sampler — Ashfall (design/program/INFERENCE_PLANTS.md, row PL-291).
// "The sampler. A new stall on the Reach gives the first taste free to anyone who is not
// in a hurry — the stall can tell."
// What the player can do: Slow down once; or rush past daily — the day you finally stop,
// they point you to the back of the queue you could have skipped.
//
// SEAM NOTE (honest): Ashfall's Reach is the docking ring of the REAL Ash Cache body
// (station_ashcache, sector_ashfall_reach). The stall is a chalked prop at a fixed hash
// bearing, with a queue of two real neutral strangers (makeShipEntitySpec, team 2,
// passive) standing at it during the work band. "The stall can tell" is a real speed
// read: pass inside the sense range above tuning.rushSpeedWu on distinct in-world days
// (bounded, keyed hull) and the rushes are counted in silence; slow below
// tuning.tasteSpeedWu and dwell tuning.tasteNeedS and the first taste is free — a taste
// prop handed at your quarter, eaten by carrying it. Rush past on tuning.rushDaysForQueue
// distinct days and the day you finally stop, the queue materializes ahead of you (the
// strangers step to the stall), the taste comes only after the queue's wait, and one
// line points you to the back of the queue you could have skipped. NO economy writes:
// a taste is a prop and a stamp, never credits.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; day counting and the stall bearing
//   are pure clock/hash math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded Maps with tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns stall, queue, tastes.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { makeShipEntitySpec } from '../ships.js';

export const PL_291_TASTE_EVENT = 'plants:pl291:taste';
export const PL_291_EATEN_EVENT = 'plants:pl291:eaten';
export const PL_291_RUSH_EVENT = 'plants:pl291:rush';
export const PL_291_QUEUE_EVENT = 'plants:pl291:queue';

export const THE_SAMPLER_TUNING = Object.freeze({
  stationId: 'station_ashcache',
  sectorId: 'sector_ashfall_reach',
  dayLengthS: 240,
  stallRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the Reach frontage
  senseRangeWu: 60,
  tasteSpeedWu: 8,
  tasteNeedS: 6,
  eatS: 8,
  rushSpeedWu: 30,
  rushDaysForQueue: 3,
  queueWaitS: 20,              // "the back of the queue" wait once flagged
  queueCount: 2,
  queueHull: 'ship_drifter',
  queueFaction: 'faction_dmc',
  memoryCap: 12,
  sender: 'The sampler',
});

export const STALL_SALT = 'plantsPl291Stall';
export const TASTE_LINE = 'First taste\u2019s free. No hurry.';
export const QUEUE_LINE = 'Back of the queue. You could have skipped it.';
export const TASTE_LABEL = 'FIRST TASTE';

/** The stall: a fixed chalked spot, hash-derived bearing. */
export function stallPointFor(station, t = THE_SAMPLER_TUNING) {
  const a = (hash32(STALL_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.stallRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

/** Day index of the shared plant clock. */
export function samplerDayOf(simTime, t = THE_SAMPLER_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

function stationOf(state, stationId) {
  if (!state) return null;
  const list = (state.entityIndex && state.entityIndex.stations) || state.entityList || [];
  const pools = [];
  if (list.length) pools.push(list);
  if (state.entities && typeof state.entities.values === 'function') pools.push([...state.entities.values()]);
  for (const pool of pools) {
    for (const e of pool) {
      if (!e || e.alive === false || e.type !== 'station') continue;
      if (((e.data && e.data.stationId) || e.id) === stationId) return e;
    }
  }
  return null;
}

export function createTheSampler() {
  return {
    name: 'plantsPl291',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._stallId = null;
      this._stallPoint = null;
      this._queueIds = [];
      this._queueUp = false;
      this._tasteId = null;
      this._tasteSince = null;
      this._tasteDay = -1;
      this._dwellS = 0;
      this._rushedDays = new Map(); // hull -> Set of days, capped
      this._queueDay = -1;
      this._queueWaitStart = null;
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
      this._rushedDays?.clear();
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._stallId, this._tasteId, ...this._queueIds]) {
          if (id != null) rm(id);
        }
      }
      this._stallId = null;
      this._stallPoint = null;
      this._queueIds = [];
      this._queueUp = false;
      this._tasteId = null;
      this._tasteSince = null;
      this._tasteDay = -1;
      this._dwellS = 0;
      this._queueDay = -1;
      this._queueWaitStart = null;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s?.simTime) ? s.simTime : (Number.isFinite(s?.tick) ? s.tick / 60 : 0);
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

    _rushedDaysFor(hullId) {
      const key = String(hullId);
      let days = this._rushedDays.get(key);
      if (!days) {
        if (this._rushedDays.size >= THE_SAMPLER_TUNING.memoryCap) this._rushedDays.clear();
        days = new Set();
        this._rushedDays.set(key, days);
      }
      return days;
    },

    _ensureStall(station) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function' || this._stallId != null) return;
      const point = stallPointFor(station);
      this._stallPoint = point;
      const stall = spawn({
        type: 'beacon',
        pos: { x: point.x, z: point.z },
        vel: { x: 0, z: 0 },
        radius: 8,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        homeSectorId: THE_SAMPLER_TUNING.sectorId,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_sampler_stall',
          plantsPl291Stall: true,
          placeId: 'place_parts_rack',
          everydaySpaceKit: true,
          scanLabel: 'The sampler \u2014 a new stall on the Reach; the first taste is free to the unhurried',
          swarmFloorPad: { label: 'THE SAMPLER' },
        },
      });
      this._stallId = stall && stall.id != null ? stall.id : null;
    },

    _queueUp_(station, now) {
      const spawn = this.helpers?.spawnEntity;
      const t = THE_SAMPLER_TUNING;
      if (typeof spawn !== 'function' || this._queueIds.length) return;
      for (let i = 0; i < t.queueCount; i += 1) {
        const spec = makeShipEntitySpec(t.queueHull, {
          team: 2,
          factionId: t.queueFaction,
          pos: { x: this._stallPoint.x + (i + 1) * 22, z: this._stallPoint.z - (i + 1) * 10 },
          ai: { archetype: 'passive', passive: true },
        });
        spec.data = spec.data || {};
        spec.data.plantsPl291Queue = true;
        spec.data.parentType = 'story_prop';
        spec.data.despawnAt = null;
        const ent = spawn(spec);
        if (ent && ent.id != null) this._queueIds.push(ent.id);
      }
      this._queueUp = true;
      this._queueWaitStart = now;
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== THE_SAMPLER_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, THE_SAMPLER_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = THE_SAMPLER_TUNING;
      this._ensureStall(station);
      if (!this._stallPoint) return;
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;

      const day = samplerDayOf(now, t);
      const d = Math.hypot(player.pos.x - this._stallPoint.x, player.pos.z - this._stallPoint.z);
      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);

      // The stall can tell: rushing past is counted, in silence, per distinct day.
      if (d <= t.senseRangeWu && speed > t.rushSpeedWu) {
        const days = this._rushedDaysFor(s.playerId);
        if (!days.has(day)) {
          days.add(day);
          if (days.size >= t.rushDaysForQueue && this._queueDay !== day) {
            this._queueDay = day;
            this._emit(PL_291_RUSH_EVENT, { rushDays: days.size, day, t: now });
          }
        }
      }

      // Slow down once: the first taste is free — unless you owe the queue a wait.
      const owesQueue = this._rushedDaysFor(s.playerId).size >= t.rushDaysForQueue;
      if (owesQueue && this._queueWaitStart == null && d <= t.senseRangeWu && speed <= t.tasteSpeedWu) {
        this._queueWaitStart = now;
        this._queueUp_(station, now);
      }
      const waiting = owesQueue && this._queueWaitStart != null && now - this._queueWaitStart < t.queueWaitS;

      if (this._tasteId == null && d <= t.senseRangeWu && speed <= t.tasteSpeedWu) {
        this._dwellS += Math.max(0, Number(dt) || 0);
        if (this._dwellS >= (waiting ? t.queueWaitS + t.tasteNeedS : t.tasteNeedS)
            && this._tasteDay !== day) {
          this._dwellS = 0;
          this._tasteDay = day;
          const spawn = this.helpers?.spawnEntity;
          if (typeof spawn === 'function') {
            const taste = spawn({
              type: 'payload',
              pos: { x: player.pos.x + 10, z: player.pos.z + 4 },
              vel: { x: 0, z: 0 },
              radius: 2,
              mass: 1,
              physicsBody: { mass: 1 },
              flags: { persistent: true },
              data: {
                parentType: 'story_prop',
                storyPropKind: 'plants_first_taste',
                plantsPl291Taste: true,
                scanLabel: 'The sampler\u2019s first taste, free',
                swarmFloorPad: { label: TASTE_LABEL },
              },
            });
            if (taste && taste.id != null) {
              this._tasteId = taste.id;
              this._tasteSince = now;
              this._cue('confirm', 0.4);
              this._popup(`plants:pl291:taste:${Math.round(now)}`, t.sender,
                owesQueue ? QUEUE_LINE : TASTE_LINE);
              this._emit(owesQueue ? PL_291_QUEUE_EVENT : PL_291_TASTE_EVENT, { day, t: now });
            }
          }
        }
      } else if (d > t.senseRangeWu || speed > t.tasteSpeedWu) {
        this._dwellS = 0;
      }

      // Eating the taste: carry it a moment.
      const taste = this._tasteId != null ? this._get(this._tasteId) : null;
      if (!taste || taste.alive === false) { this._tasteId = null; this._tasteSince = null; return; }
      taste.pos.x = player.pos.x + 10;
      taste.pos.z = player.pos.z + 4;
      if (this._tasteSince != null && now - this._tasteSince >= t.eatS) {
        this.helpers?.removeEntity?.(this._tasteId);
        player.data = player.data || {};
        player.data.plantsPl291TastedDay = day;
        this._tasteId = null;
        this._tasteSince = null;
        this._cue('confirm', 0.35);
        this._emit(PL_291_EATEN_EVENT, { day, t: now });
      }
    },
  };
}

export const theSamplerPlant = createTheSampler();
