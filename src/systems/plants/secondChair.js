// PL-277 The second chair — Ceres (design/program/INFERENCE_PLANTS.md, row PL-277).
// "The second chair. The queue runs one window deep, but the second chair by the wall is
// never sat in. Sit there and the clerk serves you anyway, off-book, a beat faster."
// What the player can do: Keep it a quiet habit; or hog the chair daily — the clerk stops
// bending the rule, and the chair stays empty for good.
//
// SEAM NOTE (honest): Ceres Refinery is the station_ceres body (sector_ceres_belt). The
// window and the second chair are chalked props at fixed hash bearings on the docking
// ring; the queue is one real neutral stranger (makeShipEntitySpec, team 2, passive)
// parked at the window during the work band of the shared 240 s plant day. Sitting is
// parking slow on the chair for tuning.sitNeedS. Served off-book: the clerk's lamp flashes,
// a service cue fires, and the queue hull steps forward a beat. The habit ledger is a
// bounded day-Map: sit on more than tuning.hogDays distinct days inside the rolling window
// and the clerk stops bending the rule — the chair prop is removed and never respawns
// while the flag-borne receipt (state.story.flags.plantsPl277ChairGone) stands.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; work band, day index and the rolling
//   hog window are pure clock math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded memory: sat-days Map capped at tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns owned props and the
//   queue hull.
// - NO economy writes: "served off-book" is a cue + stamp, never a credits mutation.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { makeShipEntitySpec } from '../ships.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_277_SERVED_EVENT = 'plants:pl277:served';
export const PL_277_HOG_EVENT = 'plants:pl277:hog';
export const PL_277_EMPTY_EVENT = 'plants:pl277:empty';

export const SECOND_CHAIR_TUNING = Object.freeze({
  stationId: 'station_ceres',
  sectorId: 'sector_ceres_belt',
  dayLengthS: 240,
  workFraction: 0.5,           // work band: phase in [0.25, 0.75)
  ringRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the wall by the window
  chairSpacingWu: 24,          // window chair, second chair, then the wall
  sitSpeedWu: 4,
  sitNeedS: 5,
  hogWindowDays: 5,            // rolling window over in-world days
  hogDays: 3,                  // sit this many distinct days inside the window → hog
  servedCooldownS: 30,
  memoryCap: 12,
  queueHull: 'ship_mule',
  queueFaction: 'faction_dmc',
});

export const CHAIR_SALT = 'plantsPl277Chair';
export const SERVED_LINE = 'Off-book. Don\u2019t make it a thing.';
export const HOG_LINE = 'That\u2019s a habit, not a queue. Out.';

/** Work band of the shared plant day. */
export function workAt(simTime, t = SECOND_CHAIR_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const phase = ((simTime % len) + len) % len;
  const start = len * 0.25;
  return phase >= start && phase < start + len * t.workFraction;
}

/** Day index of the shared plant clock. */
export function chairDayOf(simTime, t = SECOND_CHAIR_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** Window and second chair: fixed chalked spots, hash-derived bearing, chair spacing apart. */
export function chairRowFor(station, t = SECOND_CHAIR_TUNING) {
  const a = (hash32(CHAIR_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.ringRadiusMult;
  const dir = { x: Math.cos(a), z: Math.sin(a) };
  return {
    window: { x: station.pos.x + dir.x * r, z: station.pos.z + dir.z * r },
    chair: { x: station.pos.x + dir.x * (r + t.chairSpacingWu), z: station.pos.z + dir.z * (r + t.chairSpacingWu) },
  };
}

export function createSecondChair() {
  return {
    name: 'plantsPl277',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._windowId = null;
      this._chairId = null;
      this._queueId = null;
      this._queueSpawnedDay = -1;
      this._sitS = 0;
      this._satDays = new Map();   // day -> true, bounded rolling ledger
      this._lastServedAt = null;
      // The empty-for-good receipt is flag-borne: it survives sector exits and saves.
      this._goneForGood = !!(this.state?.story?.flags?.plantsPl277ChairGone);
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
      this._satDays?.clear();
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._windowId, this._chairId, this._queueId]) {
          if (id != null) rm(id);
        }
      }
      this._windowId = null;
      this._chairId = null;
      this._queueId = null;
      this._queueSpawnedDay = -1;
      this._sitS = 0;
      this._lastServedAt = null;
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

    _ensureStreet(station, day) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const row = chairRowFor(station);
      if (this._windowId == null) {
        const win = spawn({
          type: 'beacon',
          pos: { x: row.window.x, z: row.window.z },
          vel: { x: 0, z: 0 },
          radius: 8,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: SECOND_CHAIR_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_ceres_window',
            plantsPl277Window: true,
            placeId: 'place_inspection_platform',
            everydaySpaceKit: true,
            scanLabel: 'The service window — queue runs one deep',
            swarmFloorPad: { label: 'SERVICE WINDOW' },
          },
        });
        this._windowId = win && win.id != null ? win.id : null;
      }
      if (this._chairId == null && !this._goneForGood) {
        const chair = spawn({
          type: 'beacon',
          pos: { x: row.chair.x, z: row.chair.z },
          vel: { x: 0, z: 0 },
          radius: 6,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: SECOND_CHAIR_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_second_chair',
            plantsPl277Chair: true,
            scanLabel: 'The second chair by the wall — never sat in',
            swarmFloorPad: { label: 'SECOND CHAIR' },
          },
        });
        this._chairId = chair && chair.id != null ? chair.id : null;
      }
      // The queue runs one window deep: one real stranger waits at the window on work days.
      if (workAt(this._now()) && this._queueId == null && this._queueSpawnedDay !== day) {
        const spec = makeShipEntitySpec(SECOND_CHAIR_TUNING.queueHull, {
          team: 2,
          factionId: SECOND_CHAIR_TUNING.queueFaction,
          pos: { x: row.window.x + 14, z: row.window.z - 10 },
          ai: { archetype: 'passive', passive: true },
        });
        spec.data = spec.data || {};
        spec.data.plantsPl277Queue = true;
        spec.data.parentType = 'story_prop';
        spec.data.despawnAt = null;
        const ent = spawn(spec);
        if (ent && ent.id != null) {
          this._queueId = ent.id;
          this._queueSpawnedDay = day;
        }
      }
    },

    _hogCount(day) {
      let n = 0;
      for (const d of this._satDays.keys()) {
        if (day - d < SECOND_CHAIR_TUNING.hogWindowDays) n += 1;
      }
      return n;
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== SECOND_CHAIR_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, SECOND_CHAIR_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = SECOND_CHAIR_TUNING;
      const day = chairDayOf(now, t);
      this._ensureStreet(station, day);

      const chair = this._chairId != null ? this._get(this._chairId) : null;
      if (!chair?.pos) return;                             // gone for good, or not stood yet
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;

      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
      const d = Math.hypot(player.pos.x - chair.pos.x, player.pos.z - chair.pos.z);
      const sitting = workAt(now, t) && d <= 12 && speed <= t.sitSpeedWu;

      if (!sitting) { this._sitS = 0; return; }
      this._sitS += Math.max(0, Number(dt) || 0);
      if (this._sitS < t.sitNeedS) return;
      this._sitS = 0;

      if (this._satDays.size >= t.memoryCap) {
        const oldest = [...this._satDays.keys()].sort((a, b) => a - b)[0];
        this._satDays.delete(oldest);
      }
      this._satDays.set(day, true);

      // Hogging: too many distinct days inside the rolling window — the rule unbends.
      if (this._hogCount(day) > t.hogDays && !this._goneForGood) {
        this._goneForGood = true;
        const flags = this._flags();
        if (flags) flags.plantsPl277ChairGone = true;
        this.helpers?.removeEntity?.(this._chairId);
        this._chairId = null;
        this._cue('ui_deny', 0.5);
        this._popup(`plants:pl277:hog:${Math.round(now)}`, 'Ceres clerk', HOG_LINE);
        this._emit(PL_277_HOG_EVENT, { day, t: now });
        this._emit(PL_277_EMPTY_EVENT, { day, t: now, reason: 'hogged' });
        return;
      }

      // Served anyway, off-book, a beat faster: the queue steps forward with you.
      if (this._lastServedAt == null || now - this._lastServedAt >= t.servedCooldownS) {
        this._lastServedAt = now;
        this._cue('confirm', 0.45);
        this._popup(`plants:pl277:served:${Math.round(now)}`, 'Ceres clerk', SERVED_LINE);
        const queue = this._queueId != null ? this._get(this._queueId) : null;
        const row = chairRowFor(station, t);
        if (queue?.pos) {
          queue.pos.x = row.window.x + 6;                  // a beat faster: the line moves
          queue.pos.z = row.window.z - 4;
        }
        this._emit(PL_277_SERVED_EVENT, { day, queueStepped: !!queue, t: now });
      }
    },
  };
}

export const secondChairPlant = createSecondChair();
