// PL-199 The jug — Tethys (design/program/INFERENCE_PLANTS.md, row PL-199).
// "The jug. Big Ansel fills one jug before the shutter goes up, and it goes to whoever
// looks like they need it. Look sorry enough and it is yours."
// What the player can do: Drink it; or steer it to a hull in worse shape — Ansel sees,
// and the jug finds you next anyway.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - The yard is the REAL Tethys trade hub (station_tethys). The jug is one payload prop
//   per yard day, spawned on the docking ring (2.4x dockRadius, stationBubbles) toward the
//   hull that needs it.
// - "Looks like they need it" is a real hull fraction (entity.hull / entity.hullMax) —
//   no invented pity score. The player qualifies below tuning.needHullFraction; an NPC
//   hull in worse shape qualifies over the player when the jug is carried near it.
// - "Drink it" is carrying the jug for tuning.drinkS. "Steer it" is holding the jug inside
//   handoff range of a worse hull for tuning.offerS — Ansel sees, and the next day's jug
//   comes to the player anyway (flag-borne, like every durable receipt).
// - Bounded Maps with tuning.memoryCap; one jug per yard day (day-index cooldown).
// - Session state on `this`; destroy() unsubscribes all + despawns owned entities.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';

export const PL_199_JUG_EVENT = 'plants:pl199:jug';
export const PL_199_DRUNK_EVENT = 'plants:pl199:drunk';
export const PL_199_STEERED_EVENT = 'plants:pl199:steered';

export const PL_199_STEERED_FLAG = 'plantsPl199Steered';

export const THE_JUG_TUNING = Object.freeze({
  anchorStationId: 'station_tethys',
  dayLengthS: 240,
  jugRadiusMult: BUBBLE_MULTIPLIERS.docking,   // 2.4x — the apron by the shutter
  needHullFraction: 0.55,                      // look sorry enough
  pickupRangeWu: 26,
  drinkS: 12,                                  // carried long enough counts as drunk
  steerRangeWu: 90,
  handoffRangeWu: 30,
  offerS: 6,
  memoryCap: 8,
  sender: 'BIG ANSEL',                         // Ansel Merrin, src/data/shipRegistry.js:39
});

export function hullFractionOf(entity) {
  if (!entity || !Number.isFinite(entity.hull) || entity.hull == null) return null;
  const max = Number.isFinite(entity.hullMax) && entity.hullMax > 0 ? entity.hullMax : Math.max(1, entity.hull);
  return Math.max(0, Math.min(1, entity.hull / max));
}

export function dockRadiusOf(station) {
  if (!station) return 72;
  const d = station.data || {};
  if (Number.isFinite(d.dockRadius) && d.dockRadius > 0) return d.dockRadius;
  const size = station.size || d.size;
  return size === 'L' ? 90 : size === 'S' ? 60 : 72; // bountyMarks.js:165 size rule
}

export function jugPointFor(station, bearingIndex, t = THE_JUG_TUNING) {
  const a = (hash32('pl199jug', bearingIndex, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const r = dockRadiusOf(station) * t.jugRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

export function createPl199TheJug() {
  return {
    name: 'plantsPl199',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._accum = 0;
      this._jugId = null;
      this._jugDay = -1;
      this._jugForced = false;      // the day after steering: it finds you next anyway
      this._carried = false;
      this._carriedSince = null;
      this._steerTarget = null;     // entityId
      this._steerSince = null;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:exit', () => this._resetJug());
      on('save:loaded', () => this._resetJug());
      on('game:newGame', () => this._resetJug());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._resetJug();
    },

    _resetJug() {
      if (this._jugId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(this._jugId);
      }
      this._jugId = null;
      this._carried = false;
      this._carriedSince = null;
      this._steerTarget = null;
      this._steerSince = null;
      this._accum = 0;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _popup(id, sender, text, ttl = 8) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('comms:popup', { id, sender, category: 'story', text, ttl, persist: false });
    },

    _cue(id, gain = 0.45) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('audio:cue', { id, gain });
    },

    _emit(type, payload) {
      if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(type, payload);
    },

    _get(id) {
      return this.state && this.state.entities && typeof this.state.entities.get === 'function'
        ? this.state.entities.get(id) : null;
    },

    _flags() {
      const s = this.state;
      return s && s.story ? (s.story.flags || (s.story.flags = {})) : null;
    },

    _station(state) {
      const player = state && state.entities && typeof state.entities.get === 'function'
        ? state.entities.get(state.playerId) : null;
      if (!player || !player.pos) return null;
      const idx = state.entityIndex;
      const list = (idx && Array.isArray(idx.stations) && idx.stations.length)
        ? idx.stations
        : (Array.isArray(state.entityList) ? state.entityList : [...(state.entities ? state.entities.values() : [])]);
      let best = null;
      let bestD2 = Infinity;
      for (const st of list) {
        if (!st || st.alive === false || st.type !== 'station') continue;
        if ((st.data && st.data.stationId || st.id) !== THE_JUG_TUNING.anchorStationId) continue;
        const d2 = (st.pos.x - player.pos.x) ** 2 + (st.pos.z - player.pos.z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = st; }
      }
      return best;
    },

    _spawnJug(station, now, dayIndex) {
      const spawn = this.helpers && this.helpers.spawnEntity;
      if (typeof spawn !== 'function') return;
      const point = jugPointFor(station, dayIndex, THE_JUG_TUNING);
      const ent = spawn({
        type: 'payload',
        pos: { x: point.x, z: point.z },
        vel: { x: 0, z: 0 },
        radius: 3,
        mass: 2,
        physicsBody: { mass: 2 },
        flags: { persistent: true },
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_ansel_jug',
          plantsPl199Jug: true,
          scanLabel: "Big Ansel's jug — filled before the shutter went up",
          masslineTetherable: true,
          swarmFloorPad: { label: "BIG ANSEL'S JUG" },
        },
      });
      if (ent && ent.id != null) {
        this._jugId = ent.id;
        this._jugDay = dayIndex;
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = THE_JUG_TUNING;
      const station = this._station(s);
      if (!station) { this._accum = 0; return; }
      const dayIndex = Math.floor(now / t.dayLengthS);
      const player = this._get(s.playerId);
      if (!player || !player.pos) return;

      // One jug per yard day, before the shutter goes up.
      if (this._jugId == null && this._jugDay !== dayIndex) {
        const flags = this._flags();
        const steeredBefore = !!(flags && flags[PL_199_STEERED_FLAG]);
        const frac = hullFractionOf(player);
        const needsIt = frac != null && frac <= t.needHullFraction;
        if (steeredBefore || needsIt) {
          this._spawnJug(station, now, dayIndex);
          this._jugForced = steeredBefore;
          if (steeredBefore) {
            if (flags) flags[PL_199_STEERED_FLAG] = false;
            this._popup(`plants:pl199:return:${Math.round(now)}`, t.sender,
              'Ansel sees. The jug finds you next anyway.');
            this._cue('confirm', 0.4);
          } else {
            this._popup(`plants:pl199:offer:${Math.round(now)}`, t.sender,
              'One jug before the shutter goes up, and it goes to whoever looks like they need it. Today that is you.');
          }
          this._emit(PL_199_JUG_EVENT, { dayIndex, forced: steeredBefore, t: now });
        } else {
          this._jugDay = dayIndex; // no jug today — nothing invented for a healthy hull
        }
      }
      const jug = this._jugId != null ? this._get(this._jugId) : null;
      if (!jug || jug.alive === false || !jug.pos) { this._jugId = null; return; }

      // Carrying: the jug rides the player's quarter.
      const dJug = Math.hypot(jug.pos.x - player.pos.x, jug.pos.z - player.pos.z);
      if (!this._carried && dJug <= t.pickupRangeWu) {
        this._carried = true;
        this._carriedSince = now;
      }
      if (this._carried) {
        jug.pos.x = player.pos.x + 12;
        jug.pos.z = player.pos.z + 6;

        // Drink it: carried long enough.
        if (now - (this._carriedSince || now) >= t.drinkS) {
          if (this.helpers.removeEntity) this.helpers.removeEntity(this._jugId);
          this._jugId = null;
          this._carried = false;
          this._popup(`plants:pl199:drunk:${Math.round(now)}`, t.sender,
            'You drink it. Ansel says nothing, and the shutter goes up.');
          this._cue('confirm', 0.45);
          this._emit(PL_199_DRUNK_EVENT, { t: now });
          return;
        }

        // Steer it to a hull in worse shape.
        const playerFrac = hullFractionOf(player);
        const ents = s.entityList && Array.isArray(s.entityList)
          ? s.entityList
          : [...(s.entities && typeof s.entities.values === 'function' ? s.entities.values() : [])];
        let worst = null;
        let worstFrac = playerFrac != null ? playerFrac : 1;
        for (const e of ents) {
          if (!e || e.alive === false || !e.pos || e.type !== 'ship' || e.id === s.playerId) continue;
          const frac = hullFractionOf(e);
          if (frac == null || frac >= worstFrac) continue;
          const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
          if (d > t.steerRangeWu) continue;
          worst = e;
          worstFrac = frac;
        }
        if (worst) {
          const d = Math.hypot(jug.pos.x - worst.pos.x, jug.pos.z - worst.pos.z);
          if (d <= t.handoffRangeWu) {
            if (this._steerTarget !== worst.id) {
              this._steerTarget = worst.id;
              this._steerSince = now;
            } else if (now - this._steerSince >= t.offerS) {
              if (this.helpers.removeEntity) this.helpers.removeEntity(this._jugId);
              this._jugId = null;
              this._carried = false;
              this._steerTarget = null;
              const flags = this._flags();
              if (flags) flags[PL_199_STEERED_FLAG] = true;
              this._popup(`plants:pl199:steered:${Math.round(now)}`, t.sender,
                'Ansel sees. The jug goes to the worse hull — and it will find you next anyway.');
              this._cue('confirm', 0.45);
              this._emit(PL_199_STEERED_EVENT, { toId: worst.id, toFrac: worstFrac, t: now });
            }
          } else if (this._steerTarget === worst.id) {
            this._steerTarget = null;
            this._steerSince = null;
          }
        } else if (this._steerTarget != null) {
          this._steerTarget = null;
          this._steerSince = null;
        }
      }
    },
  };
}

export const pl199TheJug = createPl199TheJug();
