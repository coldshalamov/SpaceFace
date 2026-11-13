// PL-181 Two towns' problem — Vesta (design/program/INFERENCE_PLANTS.md, row PL-181).
// "Two towns' problem. Rhea's hot cargo cooks whoever carries it. Vesta's coolant fall
// quenches it on the instant — if you can make the crossing."
// What the player can do: Make the crossing; or deliver it roasted.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - HONEST SUBSTITUTES (documented, not silent): no sector, station, or commodity named
//   Rhea exists in the codebase, and no "hot" commodity class exists. The heat source this
//   plant uses is the REAL furnace mouth (FURNACE_INTAKE.mouth, src/data/furnace.js): a
//   slag ring just outside the intake lip stamps any jettisoned pod crossing it
//   plantsPl181Hot — a physical fact the player makes by flying the pod through the heat.
//   The coolant fall is a real quench ring this plant owns on the docking ring (2.4x
//   dockRadius, stationBubbles) at the nearest forge anchor.
// - "Carries" is proximity: a hot pod within carry range cooks — timed warnings on the
//   real audio channel; no fake hull damage is written (hull damage is combat/dock owned).
// - "Deliver it roasted" is dock:docked with a hot pod still in range: the receiving log
//   records it (event + flag). The quench is the only way a pod reads clean.
// - Bounded Maps with tuning.memoryCap; cooldowns in sim time.
// - Session state on `this`; destroy() unsubscribes all + despawns owned entities.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';
import { FURNACE_INTAKE } from '../../data/furnace.js';

export const PL_181_HEATED_EVENT = 'plants:pl181:heated';
export const PL_181_QUENCHED_EVENT = 'plants:pl181:quenched';
export const PL_181_ROASTED_EVENT = 'plants:pl181:roasted';

export const HOT_CARGO_TUNING = Object.freeze({
  anchorStationId: 'station_forge',
  slagInnerFromMouth: 104,     // just outside the intake lip (mouthRadius 90)
  slagOuterFromMouth: 170,     // the heat falls off fast
  coolantRadiusMult: BUBBLE_MULTIPLIERS.docking,   // 2.4x — the fall stands on the dock ring
  coolantRingRadiusWu: 34,
  carryRangeWu: 42,
  cookTickS: 5,
  roastedCooldownS: 30,
  memoryCap: 12,
});

export function dockRadiusOf(station) {
  if (!station) return 72;
  const d = station.data || {};
  if (Number.isFinite(d.dockRadius) && d.dockRadius > 0) return d.dockRadius;
  const size = station.size || d.size;
  return size === 'L' ? 90 : size === 'S' ? 60 : 72; // bountyMarks.js:165 size rule
}

export function coolantPointFor(station, t = HOT_CARGO_TUNING) {
  const a = (hash32('pl181cool', (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const r = dockRadiusOf(station) * t.coolantRadiusMult;
  return { x: station.pos.x + Math.cos(a) * r, z: station.pos.z + Math.sin(a) * r };
}

export function isHotPod(entity) {
  return !!(entity && entity.data && entity.data.plantsPl181Hot === true
    && entity.data.plantsPl181Quenched !== true);
}

export function inSlagRing(pos, t = HOT_CARGO_TUNING) {
  if (!pos) return false;
  const d = Math.hypot(pos.x - FURNACE_INTAKE.mouth.x, pos.z - FURNACE_INTAKE.mouth.z);
  return d >= t.slagInnerFromMouth && d <= t.slagOuterFromMouth;
}

export function createPl181HotCargo() {
  return {
    name: 'plantsPl181',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._accum = 0;
      this._fallId = null;
      this._fallStationKey = null;
      this._hot = new Map();          // entityId -> { heatedAt, lastCookLine, lastCookCue }
      this._lastRoasted = -Infinity;
      this._roastedDeliveries = 0;
      const on = (event, fn) => {
        const off = this.bus && this.bus.on ? this.bus.on(event, fn) : null;
        if (typeof off === 'function') this._unsubs.push(off);
      };
      on('dock:docked', (p = {}) => this._onDocked(p));
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
      if (this._fallId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(this._fallId);
      }
      this._fallId = null;
      if (this._hot && typeof this._hot.clear === 'function') this._hot.clear();
      this._accum = 0;
    },

    _now() {
      const s = this.state;
      return Number.isFinite(s && s.simTime) ? s.simTime : (Number.isFinite(s && s.tick) ? s.tick / 60 : 0);
    },

    _popup(id, sender, text, ttl = 7) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('comms:popup', { id, sender, category: 'info', text, ttl, persist: false });
    },

    _cue(id, position = null, gain = 0.5) {
      if (!this.bus || typeof this.bus.emit !== 'function') return;
      this.bus.emit('audio:cue', { id, position, gain });
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
        if ((st.data && st.data.stationId || st.id) !== HOT_CARGO_TUNING.anchorStationId) continue;
        const d2 = (st.pos.x - player.pos.x) ** 2 + (st.pos.z - player.pos.z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = st; }
      }
      return best;
    },

    _ensureFall(station) {
      const key = (station.data && station.data.stationId) || station.id;
      if (this._fallStationKey === key && this._fallId != null) return;
      const spawn = this.helpers && this.helpers.spawnEntity;
      if (typeof spawn !== 'function') return;
      const point = coolantPointFor(station, HOT_CARGO_TUNING);
      const ent = spawn({
        type: 'beacon',
        pos: { x: point.x, z: point.z },
        vel: { x: 0, z: 0 },
        radius: 6,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        collides: false,
        physicsBody: false,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_coolant_fall',
          plantsPl181Fall: true,
          scanLabel: 'The coolant fall — quenches hot cargo on the instant',
          swarmFloorPad: { label: 'COOLANT FALL' },
        },
      });
      this._fallId = ent && ent.id != null ? ent.id : null;
      this._fallStationKey = this._fallId != null ? key : null;
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = HOT_CARGO_TUNING;

      this._accum += Math.max(0, Number(dt) || 0);
      if (this._accum < 1) return;             // 1 Hz — heat and water move slow
      this._accum = 0;

      const station = this._station(s);
      if (station) this._ensureFall(station);
      const fall = this._fallId != null ? this._get(this._fallId) : null;
      const fallPos = fall && fall.alive !== false ? fall.pos : null;

      const player = this._get(s.playerId);
      const playerPos = player && player.pos ? player.pos : null;

      const ents = s.entityList && Array.isArray(s.entityList)
        ? s.entityList
        : [...(s.entities && typeof s.entities.values === 'function' ? s.entities.values() : [])];

      for (const e of ents) {
        if (!e || e.alive === false || !e.pos) continue;
        if (e.type !== 'payload' && e.type !== 'debris') continue;
        let rec = this._hot.get(e.id);

        // The slag ring outside the furnace lip heats any pod that crosses it.
        if (!rec && e.data && e.data.payloadType === 'jettisoned_cargo' && inSlagRing(e.pos, t)) {
          e.data = e.data || {};
          e.data.plantsPl181Hot = true;
          e.data.swarmFloorPad = { label: 'HOT — COOKS WHOEVER CARRIES IT' };
          this._hot.set(e.id, { heatedAt: now, lastCookLine: -Infinity, lastCookCue: -Infinity });
          this._cue('warning', { x: e.pos.x, z: e.pos.z }, 0.55);
          this._emit(PL_181_HEATED_EVENT, { entityId: e.id, t: now });
          rec = this._hot.get(e.id);
        }
        if (!rec || e.data == null) continue;

        // The coolant fall quenches on the instant — if the pod makes the crossing.
        if (fallPos && e.data.plantsPl181Hot === true && e.data.plantsPl181Quenched !== true) {
          const d = Math.hypot(e.pos.x - fallPos.x, e.pos.z - fallPos.z);
          if (d <= t.coolantRingRadiusWu) {
            e.data.plantsPl181Quenched = true;
            e.data.plantsPl181Hot = false;
            e.data.swarmFloorPad = { label: 'QUENCHED' };
            this._hot.delete(e.id);
            this._popup(`plants:pl181:quench:${e.id}`, 'VESTA YARD',
              'Through the fall — quenched on the instant. The crossing was the whole trick.');
            this._cue('confirm', { x: e.pos.x, z: e.pos.z }, 0.5);
            this._emit(PL_181_QUENCHED_EVENT, { entityId: e.id, t: now });
            continue;
          }
        }

        // Carrying a hot pod cooks: timed, honest warnings on the audio channel.
        if (e.data.plantsPl181Hot === true && playerPos) {
          const d = Math.hypot(e.pos.x - playerPos.x, e.pos.z - playerPos.z);
          if (d <= t.carryRangeWu) {
            if (now - rec.lastCookLine >= t.cookTickS * 4) {
              rec.lastCookLine = now;
              this._popup(`plants:pl181:cook:${e.id}`, 'TWO TOWNS',
                'Two towns\' problem: it cooks whoever carries it, and only the fall fixes it.');
            }
            if (now - rec.lastCookCue >= t.cookTickS) {
              rec.lastCookCue = now;
              this._cue('warning', { x: e.pos.x, z: e.pos.z }, 0.35);
            }
          }
        }
      }
    },

    /** Deliver it roasted: dock with a hot pod still in carry range and the receiving
     *  log records it. No credits move — the log entry is the consequence this plant owns. */
    _onDocked(payload) {
      if (!this.state || !payload) return;
      const now = this._now();
      const t = HOT_CARGO_TUNING;
      const player = this._get(this.state.playerId);
      if (!player || !player.pos) return;
      let roasted = false;
      for (const [id] of this._hot) {
        const e = this._get(id);
        if (!e || !e.pos) continue;
        if (Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) <= t.carryRangeWu) {
          roasted = true;
          break;
        }
      }
      if (!roasted || now - this._lastRoasted < t.roastedCooldownS) return;
      this._lastRoasted = now;
      this._roastedDeliveries = Math.min(999, this._roastedDeliveries + 1);
      this._popup(`plants:pl181:roasted:${Math.round(now)}`, 'RECEIVING',
        'Delivered roasted. The receiver signs slow, and remembers.');
      this._cue('ui_deny', 0.5);
      this._emit(PL_181_ROASTED_EVENT, { stationId: payload.stationId || null, count: this._roastedDeliveries, t: now });
    },
  };
}

export const pl181HotCargo = createPl181HotCargo();
