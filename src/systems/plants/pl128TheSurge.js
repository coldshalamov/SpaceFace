// PL-128 The surge — Helios (design/program/INFERENCE_PLANTS.md, row PL-128).
// "The surge. At the shift horn every ship in the harbor moves at once for a full minute.
// Hold still in the middle and the whole harbor parts round you; cut across the flow and
// the tugs box you into a berth you did not pick."
// What the player can do: Be still and watch; or cut the flow and take the berth they give you.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - The surge lane runs through the harbor on the traffic ring scale (lane endpoints on the
//   patrol ring, 4x dockRadius, stationBubbles BUBBLE_MULTIPLIERS); the assigned berth sits
//   on the docking ring (2.4x).
// - Nearest-station walk runs off a 1 Hz accumulator (stationSideEventDirector pattern);
//   mover motion is per-tick because the hulls are owned by this plant.
// - "Hold still" and "cut across" are measured from the player's real velocity and lane-side
//   sign, not from a synthetic input. Pushing the player uses queuePhysicsImpulse only
//   (the physics authority queue — no direct vel writes).
// - Bounded Maps with tuning.memoryCap; cooldowns in sim time; movers/tugs spawn through
//   helpers.spawnEntity(makeShipEntitySpec(...)) passive team-2 (traffic.js pattern).
// - Session state on `this`; destroy() unsubscribes all + despawns owned entities.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { makeShipEntitySpec } from '../ships.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

export const PL_128_SURGE_EVENT = 'plants:pl128:surge';
export const PL_128_PARTED_EVENT = 'plants:pl128:parted';
export const PL_128_BOXED_EVENT = 'plants:pl128:boxed';

export const SURGE_TUNING = Object.freeze({
  anchorStationId: 'station_helios',
  shiftLengthS: 240,
  surgeDurS: 60,                                 // the full minute
  laneRadiusMult: BUBBLE_MULTIPLIERS.patrol,     // 4x — lane endpoints on the patrol ring
  berthRadiusMult: BUBBLE_MULTIPLIERS.docking,   // 2.4x — the berth they give you
  moverCount: 6,
  flowSpeedWuPerS: 55,
  laneHalfWidthWu: 26,
  partRadiusWu: 90,
  stillGateWuPerS: 4,
  crossGateWuPerS: 10,
  boxDvPerS: 26,                                 // tug nudge, dv per second toward the berth
  berthArriveRadiusWu: 34,
  tugSpacingWu: 22,
  memoryCap: 16,
});

export function dockRadiusOf(station) {
  if (!station) return 72;
  const d = station.data || {};
  if (Number.isFinite(d.dockRadius) && d.dockRadius > 0) return d.dockRadius;
  const size = station.size || d.size;
  return size === 'L' ? 90 : size === 'S' ? 60 : 72; // bountyMarks.js:165 size rule
}

export function surgeLaneFor(station, shiftIndex, seed, t = SURGE_TUNING) {
  const a = (hash32(seed, 'pl128', shiftIndex) % 6283) / 1000;
  const dir = { x: Math.cos(a), z: Math.sin(a) };
  const r = dockRadiusOf(station) * t.laneRadiusMult;
  return {
    dir,
    perp: { x: -dir.z, z: dir.x },
    from: { x: station.pos.x - dir.x * r, z: station.pos.z - dir.z * r },
    to: { x: station.pos.x + dir.x * r, z: station.pos.z + dir.z * r },
  };
}

export function berthPointFor(station, shiftIndex, seed, t = SURGE_TUNING) {
  const a = (hash32(seed, 'pl128berth', shiftIndex) % 6283) / 1000;
  const r = dockRadiusOf(station) * t.berthRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

export function createPl128TheSurge() {
  return {
    name: 'plantsPl128',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._accum = 0;
      this._surge = null;      // { shiftIndex, lane, until, moverIds[], parted, crossed }
      this._box = null;        // { shiftIndex, berth, tugIds[], until, boxed }
      this._laneSide = 0;
      this._lastShift = null;      // null, not -1: shiftIndex 0 must start the surge
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
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
      if (typeof rm === 'function') {
        if (this._surge) for (const id of this._surge.moverIds) rm(id);
        if (this._box) for (const id of this._box.tugIds) rm(id);
      }
      this._surge = null;
      this._box = null;
      this._accum = 0;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _popup(id, sender, text, ttl = 7) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('comms:popup', { id, sender, category: 'traffic', text, ttl, persist: false });
    },

    _cue(id, gain = 0.5) {
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
        if ((st.data && st.data.stationId || st.id) !== SURGE_TUNING.anchorStationId) continue;
        const d2 = (st.pos.x - player.pos.x) ** 2 + (st.pos.z - player.pos.z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = st; }
      }
      return best;
    },

    _startSurge(station, now) {
      const spawn = this.helpers && this.helpers.spawnEntity;
      if (typeof spawn !== 'function') return;
      const t = SURGE_TUNING;
      const seed = this.state && this.state.meta && this.state.meta.seed;
      const shiftIndex = Math.floor(now / t.shiftLengthS);
      const lane = surgeLaneFor(station, shiftIndex, seed, t);
      const moverIds = [];
      for (let i = 0; i < t.moverCount; i++) {
        const back = i * 34; // staggered behind the lane mouth
        const spec = makeShipEntitySpec('ship_kestrel', {
          team: 2,
          factionId: (station.data && station.data.factionId) || 'faction_scn',
          pos: { x: lane.from.x - lane.dir.x * back, z: lane.from.z - lane.dir.z * back },
          rot: Math.atan2(lane.dir.x, -lane.dir.z),
          ai: { archetype: 'passive', passive: true },
        });
        spec.data = spec.data || {};
        spec.data.plantsPl128Mover = true;
        spec.data.callsign = 'Harbor mover';
        const ent = spawn(spec);
        if (ent && ent.id != null) moverIds.push(ent.id);
      }
      this._surge = {
        shiftIndex, lane, until: now + t.surgeDurS, moverIds,
        parted: false, crossed: false,
        sideSign: this._sideSign(station, lane),
      };
      this._popup(`plants:pl128:horn:${Math.round(now)}`, 'HELIOS SHIFT HORN',
        'The horn goes — every hull in the harbor moves at once.');
      this._cue('sfx_vent_chime', 0.5);
      this._emit(PL_128_SURGE_EVENT, { shiftIndex, until: this._surge.until, t: now });
    },

    _sideSign(station, lane) {
      const player = this.state && this.state.entities && typeof this.state.entities.get === 'function'
        ? this.state.entities.get(this.state.playerId) : null;
      if (!player || !player.pos) return 0;
      const rx = player.pos.x - station.pos.x;
      const rz = player.pos.z - station.pos.z;
      const dot = rx * lane.perp.x + rz * lane.perp.z;
      return dot > 0 ? 1 : dot < 0 ? -1 : 0;
    },

    _startBox(station, now) {
      const spawn = this.helpers && this.helpers.spawnEntity;
      if (typeof spawn !== 'function') return;
      const t = SURGE_TUNING;
      const seed = this.state && this.state.meta && this.state.meta.seed;
      const shiftIndex = Math.floor(now / t.shiftLengthS);
      const berth = berthPointFor(station, shiftIndex, seed, t);
      const player = this._get(this.state.playerId);
      if (!player || !player.pos) return;
      const tugIds = [];
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? 1 : -1;
        const spec = makeShipEntitySpec('ship_kestrel', {
          team: 2,
          factionId: (station.data && station.data.factionId) || 'faction_scn',
          pos: {
            x: player.pos.x + (berth.x - player.pos.x) * 0 + side * t.tugSpacingWu,
            z: player.pos.z + side * t.tugSpacingWu * 0.4,
          },
          ai: { archetype: 'passive', passive: true },
        });
        spec.data = spec.data || {};
        spec.data.plantsPl128Tug = true;
        spec.data.callsign = 'Harbor tug';
        spec.data.swarmFloorPad = { label: 'HARBOR TUG' };
        const ent = spawn(spec);
        if (ent && ent.id != null) tugIds.push(ent.id);
      }
      this._box = { shiftIndex, berth, tugIds, until: now + SURGE_TUNING.surgeDurS, boxed: true };
      this._popup(`plants:pl128:box:${Math.round(now)}`, 'TUG PAIR',
        'You cut the flow. Berth assigned — you did not pick it. Take the tow.');
      this._cue('ui_deny', 0.6);
      this._emit(PL_128_BOXED_EVENT, { shiftIndex, berth, t: now });
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = SURGE_TUNING;
      const step = Math.max(0, Number(dt) || 0);

      const station = this._station(s);
      if (!station) { this._accum = 0; return; }
      const shiftIndex = Math.floor(now / t.shiftLengthS);

      // Cut-across detection runs per tick: the side sign flips fast.
      if (this._surge && this._surge.until > now) {
        const player = this._get(s.playerId);
        if (player && player.pos) {
          const sign = this._sideSign(station, this._surge.lane);
          const speed = player.vel ? Math.hypot(Number(player.vel.x) || 0, Number(player.vel.z) || 0) : 0;
          const rx = player.pos.x - station.pos.x;
          const rz = player.pos.z - station.pos.z;
          const along = rx * this._surge.lane.dir.x + rz * this._surge.lane.dir.z;
          const perpD = Math.abs(rx * this._surge.lane.perp.x + rz * this._surge.lane.perp.z);
          const inLane = perpD <= t.laneHalfWidthWu && Math.abs(along) <= dockRadiusOf(station) * t.laneRadiusMult;
          if (inLane && sign !== 0 && this._surge.sideSign !== 0 && sign !== this._surge.sideSign
              && speed > t.crossGateWuPerS && !this._box) {
            this._surge.crossed = true;
            this._startBox(station, now);
          }
          if (inLane && speed <= t.stillGateWuPerS && !this._surge.parted) {
            this._surge.parted = true;
            this._popup(`plants:pl128:part:${Math.round(now)}`, 'HELIOS HARBOUR',
              'Dead still in the flood — and the whole harbor parts round you.');
            this._cue('confirm', 0.4);
            this._emit(PL_128_PARTED_EVENT, { shiftIndex, t: now });
          }
          this._surge.sideSign = sign !== 0 ? sign : this._surge.sideSign;
        }
        // Movers ride the lane.
        for (const id of this._surge.moverIds) {
          const m = this._get(id);
          if (!m || m.alive === false || !m.pos) continue;
          m.pos.x += this._surge.lane.dir.x * t.flowSpeedWuPerS * step;
          m.pos.z += this._surge.lane.dir.z * t.flowSpeedWuPerS * step;
          // Hold-still courtesy: hulls still in the part radius bend away from a still player.
          const player = this._get(s.playerId);
          if (player && player.pos && this._surge.parted) {
            const d = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z);
            if (d < t.partRadiusWu) {
              const px = (m.pos.x - player.pos.x) / (d || 1);
              const pz = (m.pos.z - player.pos.z) / (d || 1);
              m.pos.x += px * 30 * step;
              m.pos.z += pz * 30 * step;
            }
          }
        }
      } else if (this._surge) {
        this._resetSurge();
      }

      // The tow: tugs hold formation and push the player to the berth they did not pick.
      if (this._box && this._box.until > now) {
        const player = this._get(s.playerId);
        if (player && player.pos) {
          const dx = this._box.berth.x - player.pos.x;
          const dz = this._box.berth.z - player.pos.z;
          const d = Math.hypot(dx, dz);
          if (d > t.berthArriveRadiusWu && player.mass > 0) {
            const dvx = (dx / d) * t.boxDvPerS * step;
            const dvz = (dz / d) * t.boxDvPerS * step;
            queuePhysicsImpulse(player, { x: dvx * player.mass, z: dvz * player.mass }, { tick: s.tick });
          }
          const tugs = this._box.tugIds.map((id) => this._get(id)).filter((e) => e && e.pos);
          for (let i = 0; i < tugs.length; i++) {
            const side = i === 0 ? 1 : -1;
            tugs[i].pos.x = player.pos.x + side * t.tugSpacingWu;
            tugs[i].pos.z = player.pos.z + side * t.tugSpacingWu * 0.4;
          }
          if (d <= t.berthArriveRadiusWu) {
            this._popup(`plants:pl128:berth:${Math.round(now)}`, 'TUG PAIR',
              'Berth made fast. It was never yours to pick.');
            this._resetBox();
          }
        }
      } else if (this._box) {
        this._resetBox();
      }

      this._accum += step;
      if (this._accum < 1) return;             // 1 Hz below here
      this._accum = 0;
      if (!this._surge && shiftIndex !== this._lastShift) {
        this._lastShift = shiftIndex;
        this._startSurge(station, now);
      }
    },

    _resetSurge() {
      const rm = this.helpers && this.helpers.removeEntity;
      if (rm && this._surge) for (const id of this._surge.moverIds) rm(id);
      this._surge = null;
    },

    _resetBox() {
      const rm = this.helpers && this.helpers.removeEntity;
      if (rm && this._box) for (const id of this._box.tugIds) rm(id);
      this._box = null;
    },
  };
}

export const pl128TheSurge = createPl128TheSurge();
