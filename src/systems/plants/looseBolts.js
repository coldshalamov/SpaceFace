// PL-281 The loose bolts box — Sker (design/program/INFERENCE_PLANTS.md, row PL-281).
// "The loose bolts box. A box of serviceable bolts sits at the yard gate marked FREE,
// refilled by nobody anyone can name."
// What the player can do: Take a handful when you need them; or take the box home — it
// stops refilling, and the gate feels different.
//
// SEAM NOTE (honest): Sker's yard gate is the docking ring of the REAL station_sker body
// (sector_sker_haven). The box is a chalked prop at a fixed hash bearing; the bolts are
// small tetherable payload props beside it. Taking a handful is proximity pickup — one
// bolt every takeCooldownS, into your hull's count (a data stamp, not an economy write).
// Refills happen at dawn, quietly, while the box stands at the gate — no popup, nobody
// can name who. Taking the box home is physical: drag it (it is masslineTetherable)
// beyond tuning.keepRangeWu of the gate for tuning.keepS and it is yours — despawned from
// the gate, refills stop for good (flag-borne receipt plantsPl281BoxGone), and an empty
// chalk stamp marks the gate. One passer-by says the gate feels different.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only; dawn refill and gate bearing are pure
//   clock/hash math. No Math.random(), no Date.now().
// - No Three.js, no DOM. Bounded Maps with tuning.memoryCap.
// - Session state on `this`; destroy() unsubscribes all + despawns box, bolts, chalk.
// - NO economy writes: bolts are physical props and a hull stamp, never credits.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { plantStationById as stationOf } from '../plantEntityViews.js';

export const PL_281_BOLTS_EVENT = 'plants:pl281:bolts';
export const PL_281_REFILL_EVENT = 'plants:pl281:refill';
export const PL_281_TOOKBOX_EVENT = 'plants:pl281:tookbox';

export const LOOSE_BOLTS_TUNING = Object.freeze({
  stationId: 'station_sker',
  sectorId: 'sector_sker_haven',
  dayLengthS: 240,
  gateRadiusMult: BUBBLE_MULTIPLIERS.docking, // 2.4x — the yard gate apron
  boltCount: 6,
  boltSpacingWu: 8,
  boltRangeWu: 20,
  takeCooldownS: 2,
  carryCap: 6,
  keepRangeWu: 120,            // drag the box this far from the gate...
  keepS: 8,                    // ...for this long, and it's yours
  boxRadius: 6,
  memoryCap: 8,
});

export const GATE_SALT = 'plantsPl281Gate';
export const TOOK_LINE = 'Gate box is gone. Someone took it home.';
export const GONE_CHALK = 'GATE \u2014 NO BOX';

/** The yard gate: a fixed chalked spot, hash-derived bearing. */
export function gatePointFor(station, t = LOOSE_BOLTS_TUNING) {
  const a = (hash32(GATE_SALT, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const base = Number.isFinite(station.data?.dockRadius) && station.data.dockRadius > 0
    ? station.data.dockRadius
    : (station.size === 'L' ? 90 : station.size === 'S' ? 60 : 72);
  const r = base * t.gateRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

/** Day index of the shared plant clock. */
export function boltDayOf(simTime, t = LOOSE_BOLTS_TUNING) {
  return Math.floor((Number.isFinite(simTime) ? simTime : 0) / Math.max(1, t.dayLengthS));
}

/** Which bolt slot stands at the gate for a given refill generation (pure). */
export function boltSlotsFor(gatePoint, t = LOOSE_BOLTS_TUNING) {
  const slots = [];
  for (let i = 0; i < t.boltCount; i += 1) {
    const a = (hash32(GATE_SALT, 'bolt', i) % 6283) / 1000;
    slots.push({
      x: gatePoint.x + Math.cos(a) * t.boltSpacingWu,
      z: gatePoint.z + Math.sin(a) * t.boltSpacingWu,
    });
  }
  return slots;
}

export function createLooseBolts() {
  return {
    name: 'plantsPl281',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._gateId = null;
      this._chalkId = null;
      this._boxId = null;
      this._boltIds = [];
      this._gatePoint = null;
      this._boxGone = false;
      this._takenDay = -1;         // dawn refill bookkeeping
      this._lastTakeAt = null;
      this._keepS = 0;
      this._carriedDay = -1;
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
      this._boxGone = !!(this.state?.story?.flags?.plantsPl281BoxGone);
      this._witnessed = false;
    },

    _drop() {
      const rm = this.helpers?.removeEntity;
      if (typeof rm === 'function') {
        for (const id of [this._gateId, this._chalkId, this._boxId, ...this._boltIds]) {
          if (id != null) rm(id);
        }
      }
      this._gateId = null;
      this._chalkId = null;
      this._boxId = null;
      this._boltIds = [];
      this._gatePoint = null;
      this._takenDay = -1;
      this._lastTakeAt = null;
      this._keepS = 0;
      this._carriedDay = -1;
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

    _ensureGate(station, day) {
      const spawn = this.helpers?.spawnEntity;
      if (typeof spawn !== 'function') return;
      const point = gatePointFor(station);
      this._gatePoint = point;
      if (this._gateId == null) {
        const gate = spawn({
          type: 'beacon',
          pos: { x: point.x, z: point.z },
          vel: { x: 0, z: 0 },
          radius: 8,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: LOOSE_BOLTS_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_yard_gate',
            plantsPl281Gate: true,
            placeId: 'place_construction_frame',
            everydaySpaceKit: true,
            scanLabel: 'The yard gate \u2014 the FREE box lives here',
            swarmFloorPad: { label: 'YARD GATE' },
          },
        });
        this._gateId = gate && gate.id != null ? gate.id : null;
      }
      if (this._boxGone && this._chalkId == null) {
        const chalk = spawn({
          type: 'beacon',
          pos: { x: point.x + 6, z: point.z + 2 },
          vel: { x: 0, z: 0 },
          radius: 4,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          homeSectorId: LOOSE_BOLTS_TUNING.sectorId,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_gate_chalk',
            plantsPl281Chalk: true,
            scanLabel: 'Empty chalk where the FREE box sat',
            swarmFloorPad: { label: GONE_CHALK },
          },
        });
        this._chalkId = chalk && chalk.id != null ? chalk.id : null;
        return;
      }
      if (!this._boxGone && this._boxId == null) {
        const box = spawn({
          type: 'payload',
          pos: { x: point.x + 6, z: point.z + 2 },
          vel: { x: 0, z: 0 },
          radius: LOOSE_BOLTS_TUNING.boxRadius,
          mass: 8,
          physicsBody: { mass: 8 },
          flags: { persistent: true },
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_bolt_box',
            plantsPl281Box: true,
            masslineTetherable: true,
            scanLabel: 'A box of serviceable bolts, marked FREE, refilled by nobody anyone can name',
            swarmFloorPad: { label: 'FREE BOLTS' },
          },
        });
        this._boxId = box && box.id != null ? box.id : null;
      }
      if (!this._boxGone && this._takenDay !== day) {
        // Refilled by nobody anyone can name: at dawn, whatever is missing is back.
        this._takenDay = day;
        const alive = this._boltIds.filter((id) => id != null && this._get(id)).length;
        const missing = LOOSE_BOLTS_TUNING.boltCount - alive;
        if (missing <= 0) return;
        const slots = boltSlotsFor(point, LOOSE_BOLTS_TUNING);
        for (let i = 0; i < missing; i += 1) {
          const slot = slots[(alive + i) % slots.length];
          const bolt = spawn({
            type: 'payload',
            pos: { x: slot.x, z: slot.z },
            vel: { x: 0, z: 0 },
            radius: 2,
            mass: 1,
            physicsBody: { mass: 1 },
            flags: { persistent: true },
            data: {
              parentType: 'story_prop',
              storyPropKind: 'plants_loose_bolt',
              plantsPl281Bolt: true,
              masslineTetherable: true,
              scanLabel: 'A serviceable bolt, free for the taking',
            },
          });
          this._boltIds.push(bolt && bolt.id != null ? bolt.id : null);
        }
        this._emit(PL_281_REFILL_EVENT, { day, count: this._boltIds.filter((v) => v != null).length, t: this._now() });
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      if (s.world?.currentSectorId !== LOOSE_BOLTS_TUNING.sectorId) { this._drop(); return; }
      const station = stationOf(s, LOOSE_BOLTS_TUNING.stationId);
      if (!station?.pos) { this._drop(); return; }
      const now = this._now();
      const t = LOOSE_BOLTS_TUNING;
      const day = boltDayOf(now, t);
      this._ensureGate(station, day);
      if (!this._gatePoint) return;
      const player = s.entities?.get ? s.entities.get(s.playerId) : null;
      if (!player?.pos) return;

      // The gate feels different once the box is gone: one witness, once.
      if (this._boxGone && !this._witnessed) {
        const dGate = Math.hypot(player.pos.x - this._gatePoint.x, player.pos.z - this._gatePoint.z);
        if (dGate <= 100) {
          this._witnessed = true;
          this._popup(`plants:pl281:witness:${Math.round(now)}`, 'Yard regular', TOOK_LINE);
        }
        return;
      }

      // Taking a handful when you need them: one bolt per cooldown, into your hull count.
      this._boltIds = this._boltIds.filter((id) => {
        if (id == null) return false;
        const bolt = this._get(id);
        if (!bolt || bolt.alive === false) return false;
        const d = Math.hypot(bolt.pos.x - player.pos.x, bolt.pos.z - player.pos.z);
        const held = Number(player.data?.plantsPl281Bolts) || 0;
        if (d <= t.boltRangeWu && held < t.carryCap
            && (this._lastTakeAt == null || now - this._lastTakeAt >= t.takeCooldownS)) {
          this._lastTakeAt = now;
          this.helpers?.removeEntity?.(id);
          player.data = player.data || {};
          player.data.plantsPl281Bolts = held + 1;
          this._cue('confirm', 0.3);
          this._emit(PL_281_BOLTS_EVENT, { held: held + 1, day, t: now });
          return false;
        }
        return true;
      });

      // Taking the box home: dragged beyond keep range for keep seconds.
      const box = this._boxId != null ? this._get(this._boxId) : null;
      if (!box || box.alive === false || !box.pos) { this._boxId = null; this._keepS = 0; return; }
      const dBox = Math.hypot(box.pos.x - this._gatePoint.x, box.pos.z - this._gatePoint.z);
      if (dBox > t.keepRangeWu) {
        this._keepS += Math.max(0, Number(dt) || 0);
        if (this._keepS >= t.keepS) {
          this._boxGone = true;
          this._carriedDay = day;
          const flags = this._flags();
          if (flags) flags.plantsPl281BoxGone = true;
          this.helpers?.removeEntity?.(this._boxId);
          this._boxId = null;
          for (const id of this._boltIds) {
            if (id != null) this.helpers?.removeEntity?.(id);
          }
          this._boltIds = [];
          this._keepS = 0;
          this._cue('ui_deny', 0.5);
          this._emit(PL_281_TOOKBOX_EVENT, { day, carriedDay: this._carriedDay, t: now });
        }
      } else {
        this._keepS = 0;
      }
    },
  };
}

export const looseBoltsPlant = createLooseBolts();
