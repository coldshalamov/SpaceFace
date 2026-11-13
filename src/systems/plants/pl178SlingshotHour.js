// PL-178 Slingshot hour — Helios (design/program/INFERENCE_PLANTS.md, row PL-178).
// "Slingshot hour. At shift change the Slipway throws pods across the harbor one every
// few seconds, and the far side catches them."
// What the player can do: Ride the stream across for free; or throw something in and see
// if they catch it.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - The stream crosses the harbor on the docking ring scale: slipway mouth and catch ring
//   both at 2.4x dockRadius (stationBubbles BUBBLE_MULTIPLIERS), opposite bearings.
// - The hour opens at each shift change and holds tuning.hourWindowS.
// - Riding is a REAL push: queuePhysicsImpulse along the stream while the player holds the
//   lane corridor (physics authority queue — no direct vel writes).
// - "Throw something in" is a real jettisoned-cargo pod (payloadType 'jettisoned_cargo')
//   entering the corridor; the stream then carries it to the catch ring, and the far side
//   keeps it — an honest cost, no simulated refund.
// - Bounded Maps with tuning.memoryCap; cooldowns in sim time; pods are owned payloads
//   despawned on catch / destroy / sector exit.
// - Session state on `this`; destroy() unsubscribes all + despawns owned entities.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { queuePhysicsImpulse } from '../../core/physicsAuthority.js';

export const PL_178_HOUR_EVENT = 'plants:pl178:hour';
export const PL_178_RIDING_EVENT = 'plants:pl178:riding';
export const PL_178_CAUGHT_EVENT = 'plants:pl178:caught';
export const PL_178_GIVEN_EVENT = 'plants:pl178:given';

export const SLINGSHOT_TUNING = Object.freeze({
  anchorStationId: 'station_helios',
  shiftLengthS: 240,
  hourWindowS: 36,                                 // the hour at shift change
  ringRadiusMult: BUBBLE_MULTIPLIERS.docking,      // 2.4x — slip and catch across the harbor
  podIntervalS: 6,                                 // one every few seconds
  podSpeedWuPerS: 75,
  laneHalfWidthWu: 26,
  catchRadiusWu: 24,
  rideDvPerS: 40,
  maxOwnedPods: 8,
  memoryCap: 16,
});

export function dockRadiusOf(station) {
  if (!station) return 72;
  const d = station.data || {};
  if (Number.isFinite(d.dockRadius) && d.dockRadius > 0) return d.dockRadius;
  const size = station.size || d.size;
  return size === 'L' ? 90 : size === 'S' ? 60 : 72; // bountyMarks.js:165 size rule
}

export function streamFor(station, shiftIndex, seed, t = SLINGSHOT_TUNING) {
  const a = (hash32(seed, 'pl178', shiftIndex) % 6283) / 1000;
  const dir = { x: Math.cos(a), z: Math.sin(a) };
  const r = dockRadiusOf(station) * t.ringRadiusMult;
  const slip = { x: station.pos.x + dir.x * r, z: station.pos.z + dir.z * r };
  const catchPos = { x: station.pos.x - dir.x * r, z: station.pos.z - dir.z * r };
  // The stream flows slip -> catch: pods and riders travel with `flow`, never against it.
  const len = Math.hypot(catchPos.x - slip.x, catchPos.z - slip.z) || 1;
  return {
    dir,
    flow: { x: (catchPos.x - slip.x) / len, z: (catchPos.z - slip.z) / len },
    slip,
    catch: catchPos,
  };
}

export function laneTOf(pos, stream) {
  const ax = stream.catch.x - stream.slip.x;
  const az = stream.catch.z - stream.slip.z;
  const len2 = ax * ax + az * az || 1;
  return ((pos.x - stream.slip.x) * ax + (pos.z - stream.slip.z) * az) / len2;
}

export function laneWidthAt(pos, stream) {
  const t = laneTOf(pos, stream);
  const px = stream.slip.x + (stream.catch.x - stream.slip.x) * t;
  const pz = stream.slip.z + (stream.catch.z - stream.slip.z) * t;
  return { t, w: Math.hypot(pos.x - px, pos.z - pz) };
}

export function createPl178SlingshotHour() {
  return {
    name: 'plantsPl178',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._accum = 0;
      this._stream = null;
      this._hour = null;         // { shiftIndex, until, nextPodAt, rodeOnce, announced }
      this._pods = [];           // owned stream-pod ids
      this._carried = new Map(); // entityId -> 'thrown' (jettisoned pods the stream took)
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
        for (const id of this._pods || []) rm(id);
        if (this._carried && typeof this._carried.keys === 'function') for (const id of this._carried.keys()) rm(id);
      }
      this._pods = [];
      if (this._carried && typeof this._carried.clear === 'function') this._carried.clear();
      this._hour = null;
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

    _cue(id, gain = 0.4) {
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
        if ((st.data && st.data.stationId || st.id) !== SLINGSHOT_TUNING.anchorStationId) continue;
        const d2 = (st.pos.x - player.pos.x) ** 2 + (st.pos.z - player.pos.z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = st; }
      }
      return best;
    },

    _openHour(station, now) {
      const t = SLINGSHOT_TUNING;
      const seed = this.state && this.state.meta && this.state.meta.seed;
      const shiftIndex = Math.floor(now / t.shiftLengthS);
      this._stream = streamFor(station, shiftIndex, seed, t);
      this._hour = { shiftIndex, until: now + t.hourWindowS, nextPodAt: now, rodeOnce: false, announced: false };
      this._popup(`plants:pl178:hour:${Math.round(now)}`, 'THE SLIPWAY',
        'Shift change — slingshot hour. Pods across the harbor, one every few seconds.');
      this._cue('sfx_vent_chime', 0.4);
      this._emit(PL_178_HOUR_EVENT, { shiftIndex, until: this._hour.until, t: now });
    },

    _spawnStreamPod(now) {
      const spawn = this.helpers && this.helpers.spawnEntity;
      const stream = this._stream;
      if (typeof spawn !== 'function' || !stream) return;
      if (this._pods.length >= SLINGSHOT_TUNING.maxOwnedPods) {
        const oldest = this._pods.shift();
        if (oldest != null) this.helpers.removeEntity(oldest);
      }
      const i = this._pods.length % 3;
      const perp = { x: -stream.dir.z, z: stream.dir.x };
      const off = (i - 1) * 8;
      const ent = spawn({
        type: 'debris',
        pos: { x: stream.slip.x + perp.x * off, z: stream.slip.z + perp.z * off },
        vel: { x: 0, z: 0 },
        radius: 4,
        mass: 10,
        physicsBody: { mass: 10 },
        hull: 4,
        hullMax: 4,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_slingshot_pod',
          plantsPl178Pod: true,
          scanLabel: 'A slipway pod, thrown across the harbor',
          masslineTetherable: true,
          swarmFloorPad: { label: 'SLIPWAY POD' },
        },
      });
      if (ent && ent.id != null) this._pods.push(ent.id);
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = SLINGSHOT_TUNING;
      const step = Math.max(0, Number(dt) || 0);

      const station = this._station(s);
      if (!station) { this._accum = 0; return; }
      const shiftIndex = Math.floor(now / t.shiftLengthS);

      // The hour opens at shift change.
      if ((!this._hour || this._hour.shiftIndex !== shiftIndex)
          && (now % t.shiftLengthS) <= t.hourWindowS) {
        if (this._hour && this._hour.shiftIndex !== shiftIndex) this._closeHour();
        this._openHour(station, now);
      }
      if (this._hour && now >= this._hour.until) this._closeHour();
      if (!this._hour || !this._stream) { this._accum = 0; return; }

      // Pods leave the slip every few seconds.
      if (now >= this._hour.nextPodAt) {
        this._hour.nextPodAt = now + t.podIntervalS;
        this._spawnStreamPod(now);
      }

      const stream = this._stream;

      // Ride the stream: a real push along the lane while the player holds the corridor.
      const player = this._get(s.playerId);
      if (player && player.pos) {
        const { t: pt, w } = laneWidthAt(player.pos, stream);
        if (w <= t.laneHalfWidthWu && pt >= 0 && pt <= 1) {
          if (player.mass > 0) {
            queuePhysicsImpulse(player, {
              x: stream.flow.x * t.rideDvPerS * player.mass * step,
              z: stream.flow.z * t.rideDvPerS * player.mass * step,
            }, { tick: s.tick });
          }
          if (!this._hour.rodeOnce) {
            this._hour.rodeOnce = true;
            this._popup(`plants:pl178:ride:${Math.round(now)}`, 'THE SLIPWAY',
              'In the stream — it carries you across, free.');
            this._cue('confirm', 0.4);
            this._emit(PL_178_RIDING_EVENT, { t: now });
          }
        }
      }

      // Move owned pods; catch at the far ring.
      for (let i = this._pods.length - 1; i >= 0; i--) {
        const pod = this._get(this._pods[i]);
        if (!pod || pod.alive === false || !pod.pos) { this._pods.splice(i, 1); continue; }
        pod.pos.x += stream.flow.x * t.podSpeedWuPerS * step;
        pod.pos.z += stream.flow.z * t.podSpeedWuPerS * step;
        if (Math.hypot(pod.pos.x - stream.catch.x, pod.pos.z - stream.catch.z) <= t.catchRadiusWu) {
          if (this.helpers.removeEntity) this.helpers.removeEntity(this._pods[i]);
          this._pods.splice(i, 1);
          this._emit(PL_178_CAUGHT_EVENT, { t: now });
          if (!this._hour.announced) {
            this._hour.announced = true;
            this._popup(`plants:pl178:catch:${Math.round(now)}`, 'THE SLIPWAY',
              'The far side caught it. Clean hands, every time.');
          }
        }
      }

      // Anything the player threw in: real jettisoned cargo entering the corridor joins
      // the stream, and the far side keeps it.
      this._accum += step;
      if (this._accum < 1) return;
      this._accum = 0;
      const ents = s.entityList && Array.isArray(s.entityList)
        ? s.entityList
        : [...(s.entities && typeof s.entities.values === 'function' ? s.entities.values() : [])];
      for (const e of ents) {
        if (!e || e.alive === false || !e.pos) continue;
        if (e.type !== 'payload') continue;
        if (!e.data || e.data.payloadType !== 'jettisoned_cargo') continue;
        if (this._carried.has(e.id)) continue;
        const { t: et, w } = laneWidthAt(e.pos, stream);
        if (w <= t.laneHalfWidthWu && et >= 0 && et <= 1) {
          this._carried.set(e.id, 'thrown');
          if (this._carried.size > t.memoryCap) {
            const first = this._carried.keys().next().value;
            this._carried.delete(first);
          }
          this._popup(`plants:pl178:thrown:${e.id}`, 'THE SLIPWAY',
            'Thrown in. The stream takes it — see if they catch it.');
        }
      }
      for (const [id] of this._carried) {
        const pod = this._get(id);
        if (!pod || pod.alive === false || !pod.pos) { this._carried.delete(id); continue; }
        pod.pos.x += stream.flow.x * t.podSpeedWuPerS * step;
        pod.pos.z += stream.flow.z * t.podSpeedWuPerS * step;
        if (Math.hypot(pod.pos.x - stream.catch.x, pod.pos.z - stream.catch.z) <= t.catchRadiusWu) {
          if (this.helpers.removeEntity) this.helpers.removeEntity(id);
          this._carried.delete(id);
          this._emit(PL_178_GIVEN_EVENT, { entityId: id, t: now });
          this._popup(`plants:pl178:given:${Math.round(now)}`, 'THE SLIPWAY',
            'They caught it. It is theirs now — the stream keeps what it carries.');
        }
      }
    },

    _closeHour() {
      this._hour = null;
    },
  };
}

export const pl178SlingshotHour = createPl178SlingshotHour();
