// PL-183 The weather — Sker (design/program/INFERENCE_PLANTS.md, row PL-183).
// "The weather. The Door's toll board re-chalks itself as ships Vane likes or dislikes
// pass through. You can read his opinion of anyone, before you ever meet him."
// What the player can do: Read the board; or ask him why it changed — *'Weather.'*
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - The Door is the REAL Sker seam: the board stands near station_sker (the Bazaar's toll
//   gate) on the noFire ring (1.5x dockRadius, stationBubbles); ships pass through the
//   Door corridor laid on the patrol ring (4x). Vane is a real world figure: Sker Vane
//   (stationContacts 'contact_sker_vane', encounters 'Vane the Ash', the poi_sker_tally_wall).
// - Opinion is a deterministic hash verdict per (callsign, pass index) — fair or foul —
//   re-chalked only when a ship physically passes through the corridor. Opinions are kept
//   in a bounded Map (memoryCap, oldest evicted).
// - The board read is the floor pad: his opinion of anyone, readable before you meet them.
// - "Ask him why it changed" is standing at the board inside the answer window after a
//   re-chalk; the answer is the exact italic copy — once per change.
// - Bounded Maps with tuning.memoryCap; cooldowns in sim time.
// - Session state on `this`; destroy() unsubscribes all + despawns owned entities.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';

export const PL_183_RECHALKED_EVENT = 'plants:pl183:rechalked';
export const PL_183_ANSWERED_EVENT = 'plants:pl183:answered';

export const PL_183_WEATHER_LINE = 'Weather.';

export const WEATHER_TUNING = Object.freeze({
  anchorStationId: 'station_sker',
  corridorHalfWidthWu: 30,
  doorRadiusMult: BUBBLE_MULTIPLIERS.patrol,      // 4x — the Door corridor on the patrol ring
  boardRadiusMult: BUBBLE_MULTIPLIERS.noFire,     // 1.5x — the board by the door line
  passCooldownPerShipS: 12,
  hailRangeWu: 70,
  answerWindowS: 12,
  opinionCap: 32,
  sender: 'SKER VANE',
  memoryCap: 32,
});

export function dockRadiusOf(station) {
  if (!station) return 72;
  const d = station.data || {};
  if (Number.isFinite(d.dockRadius) && d.dockRadius > 0) return d.dockRadius;
  const size = station.size || d.size;
  return size === 'L' ? 90 : size === 'S' ? 60 : 72; // bountyMarks.js:165 size rule
}

export function doorLineFor(station, t = WEATHER_TUNING) {
  const a = (hash32('pl183door', (station.data && station.data.stationId) || station.id) % 6283) / 1000;
  const dir = { x: Math.cos(a), z: Math.sin(a) };
  const r = dockRadiusOf(station) * t.doorRadiusMult;
  return {
    dir, perp: { x: -dir.z, z: dir.x },
    a: { x: station.pos.x - dir.x * r, z: station.pos.z - dir.z * r },
    b: { x: station.pos.x + dir.x * r, z: station.pos.z + dir.z * r },
  };
}

export function boardPointFor(station, t = WEATHER_TUNING) {
  const line = doorLineFor(station, t);
  const r = dockRadiusOf(station) * t.boardRadiusMult;
  return {
    x: station.pos.x + line.perp.x * r * 0.6 + line.dir.x * r * 0.4,
    z: station.pos.z + line.perp.z * r * 0.6 + line.dir.z * r * 0.4,
  };
}

/** Vane's verdict: a deterministic hash read of the hull and its pass count. */
export function weatherFor(callsign, passIndex) {
  const h = hash32('pl183vane', String(callsign), passIndex);
  return h % 2 === 0 ? 'fair' : 'foul';
}

export function corridorSideOf(pos, line) {
  const rx = pos.x - line.a.x;
  const rz = pos.z - line.a.z;
  return {
    along: rx * line.dir.x + rz * line.dir.z,
    across: rx * line.perp.x + rz * line.perp.z,
  };
}

export function createPl183TheWeather() {
  return {
    name: 'plantsPl183',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._accum = 0;
      this._boardId = null;
      this._boardStationKey = null;
      this._line = null;
      this._passes = new Map();      // callsign -> { count, lastPassAt, weather }  (bounded)
      this._lastChange = null;       // { callsign, weather, passIndex, at, answered }
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
      if (this._boardId != null && this.helpers && typeof this.helpers.removeEntity === 'function') {
        this.helpers.removeEntity(this._boardId);
      }
      this._boardId = null;
      this._boardStationKey = null;
      if (this._passes && typeof this._passes.clear === 'function') this._passes.clear();
      this._lastChange = null;
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

    _voice(id, text, ttl = 7) {
      const say = this.helpers && this.helpers.voice && this.helpers.voice.say;
      if (typeof say === 'function') {
        say({ id, channel: 'bark', priority: 2, text, ttl });
        return;
      }
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('voice:say', { id, channel: 'bark', priority: 2, text, ttl });
      }
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
        if ((st.data && st.data.stationId || st.id) !== WEATHER_TUNING.anchorStationId) continue;
        const d2 = (st.pos.x - player.pos.x) ** 2 + (st.pos.z - player.pos.z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = st; }
      }
      return best;
    },

    _ensureBoard(station) {
      const key = (station.data && station.data.stationId) || station.id;
      if (this._boardStationKey === key && this._boardId != null) return;
      const spawn = this.helpers && this.helpers.spawnEntity;
      if (typeof spawn !== 'function') return;
      const point = boardPointFor(station, WEATHER_TUNING);
      const ent = spawn({
        type: 'beacon',
        pos: { x: point.x, z: point.z },
        vel: { x: 0, z: 0 },
        radius: 4,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        collides: false,
        physicsBody: false,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_toll_board',
          plantsPl183Board: true,
          scanLabel: "The Door's toll board — chalked in Vane's own hand",
          swarmFloorPad: { label: "VANE'S BOARD — no weather yet" },
        },
      });
      this._boardId = ent && ent.id != null ? ent.id : null;
      this._boardStationKey = this._boardId != null ? key : null;
      this._line = doorLineFor(station, WEATHER_TUNING);
    },

    _syncBoard() {
      const board = this._get(this._boardId);
      if (!board || !board.data) return;
      const change = this._lastChange;
      board.data.swarmFloorPad = {
        label: change
          ? `VANE'S BOARD — ${change.callsign}: ${change.weather} weather`
          : "VANE'S BOARD — no weather yet",
      };
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = WEATHER_TUNING;
      const station = this._station(s);
      if (!station) { this._accum = 0; return; }
      this._ensureBoard(station);
      if (this._boardId == null || !this._line) return;

      this._accum += Math.max(0, Number(dt) || 0);
      if (this._accum < 1) return;             // 1 Hz — chalk is slow, ships are not
      this._accum = 0;

      // Passing through the Door: NPC hulls cross the corridor inside the patrol ring.
      const reach = dockRadiusOf(station) * t.doorRadiusMult;
      const ents = s.entityList && Array.isArray(s.entityList)
        ? s.entityList
        : [...(s.entities && typeof s.entities.values === 'function' ? s.entities.values() : [])];
      const player = this._get(s.playerId);
      for (const e of ents) {
        if (!e || e.alive === false || !e.pos) continue;
        if (e.type !== 'ship' || e.id === s.playerId) continue;
        const rel = corridorSideOf(e.pos, this._line);
        if (Math.abs(rel.across) > t.corridorHalfWidthWu) continue;
        if (Math.abs(rel.along) > reach) continue;
        const callsign = (e.data && e.data.callsign) || `Hull ${e.id}`;
        let rec = this._passes.get(callsign);
        if (!rec) {
          if (this._passes.size >= t.opinionCap) {
            const oldest = this._passes.keys().next().value;
            this._passes.delete(oldest);
          }
          rec = { count: 0, lastPassAt: -Infinity, weather: null };
          this._passes.set(callsign, rec);
        }
        if (now - rec.lastPassAt < t.passCooldownPerShipS) continue;
        rec.lastPassAt = now;
        rec.count += 1;
        const weather = weatherFor(callsign, rec.count);
        if (weather !== rec.weather) {
          rec.weather = weather;
          this._lastChange = { callsign, weather, passIndex: rec.count, at: now, answered: false };
          this._syncBoard();
          this._cue('sfx_vent_chime', 0.3);
          this._emit(PL_183_RECHALKED_EVENT, { callsign, weather, passIndex: rec.count, t: now });
        }
      }

      // Ask him why it changed: stand at the board inside the answer window.
      if (this._lastChange && !this._lastChange.answered && player && player.pos) {
        const board = this._get(this._boardId);
        if (board && board.pos) {
          const d = Math.hypot(player.pos.x - board.pos.x, player.pos.z - board.pos.z);
          if (d <= t.hailRangeWu && now - this._lastChange.at <= t.answerWindowS) {
            this._lastChange.answered = true;
            this._popup(`plants:pl183:ask:${Math.round(now)}`, t.sender, PL_183_WEATHER_LINE, 6);
            this._voice(`plants:pl183:vane:${Math.round(now)}`, PL_183_WEATHER_LINE, 6);
            this._emit(PL_183_ANSWERED_EVENT, {
              callsign: this._lastChange.callsign, weather: this._lastChange.weather, t: now,
            });
          }
        }
      }
    },
  };
}

export const pl183TheWeather = createPl183TheWeather();
