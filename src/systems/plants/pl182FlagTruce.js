// PL-182 Not while it's down — Io (design/program/INFERENCE_PLANTS.md, row PL-182).
// "Not while it's down. While a flag is being repainted, the other side does not touch
// the painters. It is the one thing both sides keep."
// What the player can do: Watch the truce hold; or rag a flag mid-repaint, and find out
// what both sides agree on.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - The two sides are the REAL Io stations: station_reach and station_io_merc
//   (src/data/sectors.js, sector_io_reach). Flags stand on the docking ring (2.4x
//   dockRadius, stationBubbles) off whichever side is the nearest anchor.
// - Repaint schedule: alternating sides per shift; painters work the first repaint window.
//   While it is down, the truce HOLDS — the world does nothing to the painters.
// - "Rag a flag" is a REAL player-involved physics:impact over the impulse gate against a
//   painter or its flag post, inside that side's repaint window. The answer is what both
//   sides agree on: both stations denounce in one voice, watchers from both sides shadow
//   the player for the shift, and no flag repaints for the rest of the shift.
// - Bounded Maps with tuning.memoryCap; cooldowns in sim time; NPC watchers spawn through
//   helpers.spawnEntity(makeShipEntitySpec(...)) passive team-2 (traffic.js pattern).
// - Session state on `this`; destroy() unsubscribes all + despawns owned entities.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { makeShipEntitySpec } from '../ships.js';

export const PL_182_TRUCE_EVENT = 'plants:pl182:truceHeld';
export const PL_182_BROKEN_EVENT = 'plants:pl182:truceBroken';

export const FLAG_TRUCE_TUNING = Object.freeze({
  sideStationIds: ['station_reach', 'station_io_merc'],
  shiftLengthS: 180,
  repaintWindowS: 45,
  flagRadiusMult: BUBBLE_MULTIPLIERS.docking,   // 2.4x
  ragImpulseMin: 220,
  shadowS: 45,                                   // both sides' watchers shadow the ragger
  memoryCap: 12,
});

export function dockRadiusOf(station) {
  if (!station) return 72;
  const d = station.data || {};
  if (Number.isFinite(d.dockRadius) && d.dockRadius > 0) return d.dockRadius;
  const size = station.size || d.size;
  return size === 'L' ? 90 : size === 'S' ? 60 : 72; // bountyMarks.js:165 size rule
}

export function repaintSideOf(shiftIndex) {
  return ((shiftIndex % 2) + 2) % 2; // 0 = Reach's flag, 1 = the Outpost's flag
}

export function flagPointFor(station, slot, t = FLAG_TRUCE_TUNING) {
  const a = (hash32('pl182', slot, (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const r = dockRadiusOf(station) * t.flagRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

export function createPl182FlagTruce() {
  return {
    name: 'plantsPl182',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._accum = 0;
      this._posts = { 0: null, 1: null };   // flag post entity ids by side slot
      this._postStationKey = null;
      this._painters = { 0: [], 1: [] };
      this._painterShift = -1;
      this._truceAnnounced = -1;
      this._broken = null;                  // { until, watcherIds[] }
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('physics:impact', (p = {}) => this._onImpact(p));
      on('entity:killed', (p = {}) => this._onKilled(p));
      on('sector:exit', () => this._reset());
      on('save:loaded', () => this._reset());
      on('game:newGame', () => this._reset());
    },

    destroy() {
      for (const off of this._unsubs || []) {
        try { off(); } catch (err) { /* cleanup must not throw */ }
      }
      this._unsubs = [];
      this._reset();
    },

    _reset() {
      const rm = this.helpers && this.helpers.removeEntity;
      this._posts = this._posts || { 0: null, 1: null };
      this._painters = this._painters || { 0: [], 1: [] };
      if (typeof rm === 'function') {
        for (const slot of [0, 1]) {
          if (this._posts[slot] != null) rm(this._posts[slot]);
          for (const id of this._painters[slot]) rm(id);
          this._posts[slot] = null;
          this._painters[slot] = [];
        }
        if (this._broken) for (const id of this._broken.watcherIds) rm(id);
      }
      this._posts = { 0: null, 1: null };
      this._painters = { 0: [], 1: [] };
      this._broken = null;
      this._painterShift = -1;
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

    _cue(id, gain = 0.55) {
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
        if (!FLAG_TRUCE_TUNING.sideStationIds.includes((st.data && st.data.stationId) || st.id)) continue;
        const d2 = (st.pos.x - player.pos.x) ** 2 + (st.pos.z - player.pos.z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = st; }
      }
      return best;
    },

    _ensurePosts(station) {
      const key = (station.data && station.data.stationId) || station.id;
      if (this._postStationKey === key && this._posts[0] != null && this._posts[1] != null) return;
      const spawn = this.helpers && this.helpers.spawnEntity;
      if (typeof spawn !== 'function') return;
      const labels = { 0: 'REACH FLAG', 1: 'OUTPOST FLAG' };
      for (const slot of [0, 1]) {
        if (this._posts[slot] != null) continue;
        const point = flagPointFor(station, slot, FLAG_TRUCE_TUNING);
        const ent = spawn({
          type: 'beacon',
          pos: { x: point.x, z: point.z },
          vel: { x: 0, z: 0 },
          radius: 5,
          mass: 1e6,
          hull: 1,
          hullMax: 1,
          collides: false,
          physicsBody: false,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_flag_post',
            plantsPl182Post: true,
            plantsPl182Side: slot,
            scanLabel: slot === 0 ? 'The Reach flag — repainted by rotation' : 'The Outpost flag — repainted by rotation',
            swarmFloorPad: { label: labels[slot] },
          },
        });
        if (ent && ent.id != null) this._posts[slot] = ent.id;
      }
      this._postStationKey = (this._posts[0] != null && this._posts[1] != null) ? key : null;
    },

    _spawnPainters(slot, station) {
      const spawn = this.helpers && this.helpers.spawnEntity;
      const post = this._get(this._posts[slot]);
      if (typeof spawn !== 'function' || !post || !post.pos) return;
      for (let i = 0; i < 2; i++) {
        const ent = spawn({
          type: 'debris',
          pos: { x: post.pos.x + (i === 0 ? -10 : 10), z: post.pos.z + (i === 0 ? 6 : -6) },
          vel: { x: 0, z: 0 },
          radius: 4,
          mass: 8,
          physicsBody: { mass: 8 },
          hull: 4,
          hullMax: 4,
          data: {
            parentType: 'story_prop',
            storyPropKind: 'plants_flag_painter',
            plantsPl182Painter: true,
            plantsPl182Side: slot,
            scanLabel: 'Painters, mid-repaint — hands off while it is down',
            swarmFloorPad: { label: 'PAINTERS' },
          },
        });
        if (ent && ent.id != null) this._painters[slot].push(ent.id);
      }
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = FLAG_TRUCE_TUNING;
      const station = this._station(s);
      if (!station) { this._accum = 0; return; }
      this._ensurePosts(station);
      if (this._posts[0] == null || this._posts[1] == null) return;

      const shiftIndex = Math.floor(now / t.shiftLengthS);
      const side = repaintSideOf(shiftIndex);
      const phase = now - shiftIndex * t.shiftLengthS;
      const repainting = phase <= t.repaintWindowS && !this._broken;

      // Shadow watchers follow while the agreement holds them.
      if (this._broken) {
        const player = this._get(s.playerId);
        if (player && player.pos) {
          for (let i = 0; i < this._broken.watcherIds.length; i++) {
            const w = this._get(this._broken.watcherIds[i]);
            if (!w || !w.pos) continue;
            const side2 = i === 0 ? 1 : -1;
            w.pos.x = player.pos.x + side2 * 26;
            w.pos.z = player.pos.z + side2 * 10;
          }
        }
        if (now >= this._broken.until) {
          const rm = this.helpers && this.helpers.removeEntity;
          if (typeof rm === 'function') for (const id of this._broken.watcherIds) rm(id);
          this._broken = null;
        }
      }

      this._accum += Math.max(0, Number(dt) || 0);
      if (this._accum < 1) return;             // 1 Hz — flags dry slow
      this._accum = 0;

      // The truce holds: painters out during the window, world leaves them alone.
      if (repainting && this._painterShift !== shiftIndex) {
        this._painterShift = shiftIndex;
        this._clearPainters(1 - side);
        this._spawnPainters(side, station);
        if (this._truceAnnounced !== shiftIndex) {
          this._truceAnnounced = shiftIndex;
          this._popup(`plants:pl182:truce:${shiftIndex}`, side === 0 ? 'REACH FLAG' : 'OUTPOST FLAG',
            'Repaint on. The other side does not touch the painters — the one thing both sides keep.');
          this._emit(PL_182_TRUCE_EVENT, { side, shiftIndex, t: now });
        }
      } else if (!repainting && this._painterShift === shiftIndex && phase > t.repaintWindowS) {
        this._clearPainters(side);
        this._painterShift = -1;
      }
    },

    _clearPainters(slot) {
      const rm = this.helpers && this.helpers.removeEntity;
      if (typeof rm === 'function') for (const id of this._painters[slot]) rm(id);
      this._painters[slot] = [];
    },

    _onImpact(p) {
      if (!p || !p.playerInvolved) return;
      if (!(Number(p.impulse) >= FLAG_TRUCE_TUNING.ragImpulseMin)) return;
      const now = this._now();
      const t = FLAG_TRUCE_TUNING;
      const shiftIndex = Math.floor(now / t.shiftLengthS);
      const side = repaintSideOf(shiftIndex);
      const phase = now - shiftIndex * t.shiftLengthS;
      if (phase > t.repaintWindowS || this._broken) return;
      const painterId = this._painters[side].find((id) => id === p.aId || id === p.bId);
      const postId = this._posts[side] != null && (this._posts[side] === p.aId || this._posts[side] === p.bId)
        ? this._posts[side] : null;
      if (painterId == null && postId == null) return;

      // Ragged mid-repaint: both sides agree on exactly one thing.
      this._broken = { until: now + t.shadowS, watcherIds: [] };
      const spawn = this.helpers && this.helpers.spawnEntity;
      const station = this._station(this.state);
      if (typeof spawn === 'function' && station) {
        const player = this._get(this.state.playerId);
        if (player && player.pos) {
          for (const faction of ['faction_reach', 'faction_quiet']) {
            const spec = makeShipEntitySpec('ship_kestrel', {
              team: 2,
              factionId: faction,
              pos: { x: player.pos.x + 30, z: player.pos.z + 12 },
              ai: { archetype: 'passive', passive: true },
            });
            spec.data = spec.data || {};
            spec.data.plantsPl182Watcher = true;
            spec.data.callsign = 'Both sides';
            const ent = spawn(spec);
            if (ent && ent.id != null) this._broken.watcherIds.push(ent.id);
          }
        }
      }
      this._clearPainters(side);
      this._painterShift = -1;
      this._popup(`plants:pl182:broken:${Math.round(now)}`, 'REACH FLAG',
        'Painting stops. Both sides, one voice: not while it is down.');
      this._popup(`plants:pl182:broken2:${Math.round(now)}`, 'OUTPOST FLAG',
        'The one thing both sides keep — and you found it. They agree on you.');
      this._cue('warning', 0.6);
      this._emit(PL_182_BROKEN_EVENT, { side, until: now + t.shadowS, t: now });
    },

    _onKilled(p) {
      if (!p) return;
      for (const slot of [0, 1]) {
        if (this._posts[slot] === p.id) this._posts[slot] = null;
        if (this._painters[slot].includes(p.id)) {
          this._painters[slot] = this._painters[slot].filter((id) => id !== p.id);
        }
      }
    },
  };
}

export const pl182FlagTruce = createPl182FlagTruce();
