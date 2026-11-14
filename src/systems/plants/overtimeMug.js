// PL-286 The overtime mug — Charon (design/program/INFERENCE_PLANTS.md, row PL-286).
// "The overtime mug. Work any job past the shift bell and the foreman's drone climbs the
// line to bring you a hot mug, no charge."
// What the player can do: Drink it; or pour it out to keep working — drones remember who
// does not drink.
//
// SEAM NOTE (honest): Charon Expanse is the station_expanse body (sector_charon_expanse).
// The foreman's drone is a small drone prop (everyday-kit place_welding_drone body) that
// climbs from the foundry line to a hull still working past the shift bell (phase in the
// late band of the shared 240 s plant day, inside the patrol shell 4x dockRadius, moving
// at work speed). The mug is a physical payload prop handed over beside the hull; drinking
// is carrying it long enough (a real warm stamp on the hull data). Pouring it out is a
// real impact that knocks the mug away while you keep moving. Drones remember via a
// bounded pour ledger keyed by hull AND the flag-borne receipt
// (state.story.flags.plantsPl286NoMug): after two pours no drone comes to you again, and
// one ambient line says what the drones logged.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; the shift bell band and the drone's
//   climb are pure clock math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded Maps with tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns drone and mugs.
// - NO economy writes: a mug is a prop and a stamp, never credits.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_286_MUG_EVENT = 'plants:pl286:mug';
export const PL_286_DRUNK_EVENT = 'plants:pl286:drunk';
export const PL_286_POURED_EVENT = 'plants:pl286:poured';

export const OVERTIME_MUG_TUNING = Object.freeze({
  stationId: 'station_expanse',
  sectorId: 'sector_charon_expanse',
  dayLengthS: 240,
  bellPhase: 0.75,             // the shift bell
  lateWindowFraction: 0.125,   // the overtime band: [bell, bell + 1/8 of a day)
  patrolMult: BUBBLE_MULTIPLIERS.patrol, // 4x — working means inside this shell
  workSpeedWu: 10,
  droneRadius: 3,
  climbSpeedWu: 30,
  handRangeWu: 20,
  drinkS: 8,
  pourImpulseGate: 80,
  poursAllowed: 2,
  memoryCap: 8,
  sender: 'Foreman',
});

export const MUG_SALT = 'plantsPl286Mug';
export const MUG_LINE = 'Past bell. Take the mug.';
export const DRUNK_LINE = 'Good. Now go home when the job\u2019s done.';
export const POURED_LINE = 'Drones remember who does not drink.';
export const MUG_LABEL = 'HOT MUG';

/** The overtime band: past the shift bell, before the foundry goes quiet. */
export function overtimeAt(simTime, t = OVERTIME_MUG_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const phase = ((simTime % len) + len) % len;
  const start = len * t.bellPhase;
  return phase >= start && phase < start + len * t.lateWindowFraction;
}

/** Day index of the shared plant clock. */
export function mugDayOf(simTime, t = OVERTIME_MUG_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** Where the drone starts its climb: the foundry line, hash-derived bearing. */
export function linePointFor(station, t = OVERTIME_MUG_TUNING) {
  const a = (hash32(MUG_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * 1.5; // the foundry line sits at the no-fire ring
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

export function createOvertimeMug() {
  return {
    name: 'plantsPl286',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._droneId = null;
      this._mugId = null;
      this._mugSince = null;
      this._climbDay = -1;
      this._deliveredDay = -1;
      this._pours = new Map();     // hullId -> count, capped ledger
      this._noMug = false;
      this._noted = false;
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
      this._pours?.clear();
      this._noMug = !!(this.state?.story?.flags?.plantsPl286NoMug);
      this._noted = false;
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._droneId, this._mugId]) if (id != null) rm(id);
      }
      this._droneId = null;
      this._mugId = null;
      this._mugSince = null;
      this._climbDay = -1;
      this._deliveredDay = -1;
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

    _onImpact(p) {
      const s = this.state;
      if (!s || !p || this._mugId == null) return;
      const mug = [p.aId, p.bId]
        .map((id) => (id != null ? this._get(id) : null))
        .find((e) => e && e.data && e.data.plantsPl286Mug === true);
      if (!mug) return;
      if (p.aId !== s.playerId && p.bId !== s.playerId) return;
      if ((Number(p.impulse) || 0) < OVERTIME_MUG_TUNING.pourImpulseGate) return;
      const now = this._now();
      this.helpers?.removeEntity?.(this._mugId);
      this._mugId = null;
      this._mugSince = null;
      const key = String(s.playerId);
      const pours = (this._pours.get(key) || 0) + 1;
      if (this._pours.size >= OVERTIME_MUG_TUNING.memoryCap) this._pours.clear();
      this._pours.set(key, pours);
      this._cue('ui_deny', 0.45);
      this._emit(PL_286_POURED_EVENT, { pours, t: now });
      if (pours >= OVERTIME_MUG_TUNING.poursAllowed && !this._noMug) {
        this._noMug = true;
        const flags = this._flags();
        if (flags) flags.plantsPl286NoMug = true;
        this._popup(`plants:pl286:noted:${Math.round(now)}`, OVERTIME_MUG_TUNING.sender, POURED_LINE);
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== OVERTIME_MUG_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, OVERTIME_MUG_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = OVERTIME_MUG_TUNING;
      const day = mugDayOf(now, t);
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;

      // Off-overtime: the drone goes back down the line.
      if (!overtimeAt(now, t)) {
        if (this._droneId != null) this.helpers?.removeEntity?.(this._droneId);
        this._droneId = null;
        this._climbDay = -1;
        if (this._mugId == null) this._deliveredDay = -1;
      }

      // The mug rides your quarter; carrying it long enough is drinking it.
      const mug = this._mugId != null ? this._get(this._mugId) : null;
      if (mug?.pos) {
        mug.pos.x = player.pos.x + 12;
        mug.pos.z = player.pos.z + 6;
        if (this._mugSince == null) this._mugSince = now;
        if (now - this._mugSince >= t.drinkS) {
          this.helpers?.removeEntity?.(this._mugId);
          this._mugId = null;
          this._mugSince = null;
          player.data = player.data || {};
          player.data.plantsPl286WarmedUntil = now + 120;
          this._cue('confirm', 0.4);
          this._popup(`plants:pl286:drunk:${Math.round(now)}`, t.sender, DRUNK_LINE);
          this._emit(PL_286_DRUNK_EVENT, { day, t: now });
          return;
        }
        return;
      }

      // No mug in the world: working past the bell summons the foreman's drone.
      if (!overtimeAt(now, t) || this._noMug || this._deliveredDay === day) return;
      const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
        ? station.data.dockRadius : 72;
      const d = Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z);
      const speed = Math.hypot(Number(player.vel?.x) || 0, Number(player.vel?.z) || 0);
      const working = d <= base * t.patrolMult && speed > t.workSpeedWu;
      if (!working) return;

      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const line = linePointFor(station, t);
      if (this._droneId == null || this._climbDay !== day) {
        if (this._droneId != null) this.helpers?.removeEntity?.(this._droneId);
        const drone = spawn({
          type: 'beacon',
          pos: { x: line.x, z: line.z },
          vel: { x: 0, z: 0 },
          radius: t.droneRadius,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: t.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_foreman_drone',
            plantsPl286Drone: true,
            placeId: 'place_welding_drone',
            everydaySpaceKit: true,
            scanLabel: 'The foreman\u2019s drone, climbing the line with a mug',
            swarmFloorPad: { label: 'FOREMAN DRONE' },
          },
        });
        if (!drone || drone.id == null) return;
        this._droneId = drone.id;
        this._climbDay = day;
      }
      const drone = this._get(this._droneId);
      if (!drone?.pos) return;
      const dx = player.pos.x - drone.pos.x;
      const dz = player.pos.z - drone.pos.z;
      const dd = Math.hypot(dx, dz) || 1;
      const step = t.climbSpeedWu * Math.max(0, Number(dt) || 0);
      if (dd > t.handRangeWu) {
        drone.pos.x += (dx / dd) * step;
        drone.pos.z += (dz / dd) * step;
        return;
      }
      // Hand-over: a hot mug, no charge.
      this.helpers?.removeEntity?.(this._droneId);
      this._droneId = null;
      const mugSpec = {
        type: 'payload',
        pos: { x: player.pos.x + 12, z: player.pos.z + 6 },
        vel: { x: 0, z: 0 },
        radius: 3,
        mass: 1,
        physicsBody: { mass: 1 },
        flags: { persistent: true },
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_overtime_mug',
          plantsPl286Mug: true,
          masslineTetherable: true,
          scanLabel: 'The foreman\u2019s overtime mug \u2014 hot, no charge',
          swarmFloorPad: { label: MUG_LABEL },
        },
      };
      const handed = spawn(mugSpec);
      if (handed && handed.id != null) {
        this._mugId = handed.id;
        this._deliveredDay = day;
        this._mugSince = now;
        this._cue('sfx_vent_chime', 0.35, 1.2);
        this._popup(`plants:pl286:mug:${Math.round(now)}`, t.sender, MUG_LINE);
        this._emit(PL_286_MUG_EVENT, { day, t: now });
      }
    },
  };
}

export const overtimeMugPlant = createOvertimeMug();
