// PL-106 The parts sled — Sker (design/program/INFERENCE_PLANTS.md, row PL-106).
// "The parts sled. A scrapper on a sled works the Chop Line all day, catching what the
// claws drop. Take a part out of the air and the sled shadows you through the market
// till Market Night — bids run low with it there."
// What the player can do: Let the sled eat; or steal from a sled and haggle under its witness.
//
// Invariants:
// - Deterministic: state.simTime / state.tick only. No Math.random(), no Date.now().
// - No Three.js, no DOM.
// - The Chop Line is a chord through the patrol ring (4x dockRadius, stationBubbles
//   BUBBLE_MULTIPLIERS); the sled ping-pongs it, catching parts inside its catch radius.
// - "Take a part out of the air" is a REAL physical fact: a player-involved physics:impact
//   with a loose part over the impulse gate. No synthetic pickup event is invented.
// - Market Night is the fixed sim-clock night band (tuning.dayLengthS / nightFraction).
// - Bounded Maps with tuning.memoryCap; cooldowns in sim time.
// - Session state on `this`; destroy() unsubscribes all + despawns owned entities.

import { hash32 } from '../../core/rng.js';
import { BUBBLE_MULTIPLIERS } from '../../data/stationBubbles.js';

export const PL_106_FED_EVENT = 'plants:pl106:fed';
export const PL_106_SHADOWED_EVENT = 'plants:pl106:shadowed';
export const PL_106_MARKET_NIGHT_EVENT = 'plants:pl106:marketNight';

export const PARTS_SLED_TUNING = Object.freeze({
  anchorStationId: 'station_sker',
  dayLengthS: 240,
  nightFraction: 0.25,                  // Market Night = the last 60 s of each yard day
  lineRadiusMult: BUBBLE_MULTIPLIERS.patrol,  // 4x — the Chop Line rides the patrol ring
  lineHalfLenWu: 90,
  sledSpeedWuPerS: 10,
  partIntervalS: 9,                     // what the claws drop
  catchRadiusWu: 20,                    // the sled's reach
  catchImpulseMin: 60,                  // a real catch bumps the part
  maxLooseParts: 4,                     // bounded air inventory
  eatLineCooldownS: 30,
  shadowBarkCooldownS: 30,
  memoryCap: 12,
});

export function nextNightStartAt(simTime, t = PARTS_SLED_TUNING) {
  const len = Math.max(1, t.dayLengthS);
  const day = Math.floor(simTime / len);
  const phase = simTime - day * len;
  const nightStart = len * (1 - t.nightFraction);
  return phase < nightStart ? day * len + nightStart : (day + 1) * len + nightStart;
}

export function chopLineFor(station, dayIndex, seed, t = PARTS_SLED_TUNING) {
  const a = (hash32(seed, 'pl106', dayIndex) % 6283) / 1000;
  const dir = { x: Math.cos(a), z: Math.sin(a) };
  const half = t.lineHalfLenWu;
  return {
    from: { x: station.pos.x - dir.x * half, z: station.pos.z - dir.z * half },
    to: { x: station.pos.x + dir.x * half, z: station.pos.z + dir.z * half },
    dir,
    length: half * 2,
  };
}

export function createPl106PartsSled() {
  return {
    name: 'plantsPl106',
    init(ctx) {
      this.destroy();
      this.state = ctx.state;
      this.bus = ctx.bus;
      this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._accum = 0;
      this._sledId = null;
      this._line = null;
      this._lineDay = -1;
      this._parts = [];          // owned loose-part entity ids, FIFO
      this._nextPartAt = 0;
      this._lastEatLine = -Infinity;
      this._shadow = null;       // { until } — sled shadows the player till Market Night
      this._lastShadowBark = -Infinity;
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
      if (typeof rm === 'function') {
        if (this._sledId != null) rm(this._sledId);
        for (const id of this._parts || []) rm(id);
      }
      this._sledId = null;
      this._parts = [];
      this._shadow = null;
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
        if ((st.data && st.data.stationId || st.id) !== PARTS_SLED_TUNING.anchorStationId) continue;
        const d2 = (st.pos.x - player.pos.x) ** 2 + (st.pos.z - player.pos.z) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = st; }
      }
      return best;
    },

    _sledSpec(line, phase) {
      const x = line.from.x + line.dir.x * phase;
      const z = line.from.z + line.dir.z * phase;
      return {
        type: 'debris',
        pos: { x, z },
        vel: { x: 0, z: 0 },
        radius: 8,
        mass: 30,
        physicsBody: { mass: 30 },
        hull: 20,
        hullMax: 20,
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_parts_sled',
          plantsPl106Sled: true,
          scanLabel: 'A scrapper sled — working the Chop Line',
          masslineTetherable: true,
          swarmFloorPad: { label: 'PARTS SLED' },
        },
      };
    },

    _partSpec(pos, seq) {
      return {
        type: 'debris',
        pos: { x: pos.x, z: pos.z },
        vel: { x: 0, z: 0 },
        radius: 3,
        mass: 6,
        physicsBody: { mass: 6 },
        hull: 4,
        hullMax: 4,
        flags: { persistent: true },
        data: {
          parentType: 'story_prop',
          storyPropKind: 'plants_chop_part',
          plantsPl106Part: true,
          plantsPl106Seq: seq,
          scanLabel: 'A chopped part, mid-air',
          masslineTetherable: true,
        },
      };
    },

    update(dt, state) {
      const s = state || this.state;
      if (!s || s.mode !== 'flight') return;
      const now = this._now();
      const t = PARTS_SLED_TUNING;

      const station = this._station(s);
      if (!station) { this._accum = 0; return; }

      const dayIndex = Math.floor(now / t.dayLengthS);
      if (dayIndex !== this._lineDay) {
        const seed = s.meta && s.meta.seed;
        this._line = chopLineFor(station, dayIndex, seed, t);
        this._lineDay = dayIndex;
      }
      const line = this._line;

      // Shadow travel: the sled hangs off the player's quarter till Market Night.
      if (this._shadow && this._sledId != null) {
        const sled = this._get(this._sledId);
        const player = this._get(s.playerId);
        if (sled && player && player.pos && sled.pos) {
          sled.pos.x = player.pos.x - line.dir.x * 24;
          sled.pos.z = player.pos.z - line.dir.z * 24;
        }
        if (now >= this._shadow.until) {
          if (this._sledId != null && this.helpers.removeEntity) this.helpers.removeEntity(this._sledId);
          this._sledId = null;
          const until = this._shadow.until;
          this._shadow = null;
          if (this.bus && typeof this.bus.emit === 'function') {
            this.bus.emit(PL_106_MARKET_NIGHT_EVENT, { t: now, shadowUntil: until });
          }
        }
        this._accum += Math.max(0, Number(dt) || 0);
        if (this._accum >= 1) {
          this._accum = 0;
          if (now - this._lastShadowBark >= t.shadowBarkCooldownS) {
            this._lastShadowBark = now;
            this._popup(`plants:pl106:shadow:${Math.round(now)}`, 'The parts sled',
              'It follows. Under its witness, bids run low.');
            this._cue('ui_deny', 0.3);
          }
        }
        return;
      }

      this._accum += Math.max(0, Number(dt) || 0);
      if (this._accum < 1) return;             // 1 Hz below here
      this._accum = 0;

      // The sled works the line all day.
      if (this._sledId == null) {
        const spawn = this.helpers && this.helpers.spawnEntity;
        if (typeof spawn === 'function') {
          const ent = spawn(this._sledSpec(line, 0));
          if (ent && ent.id != null) this._sledId = ent.id;
        }
        this._nextPartAt = now + t.partIntervalS;
      }

      // Claws drop AHEAD of the sled's path — the sled reaches them a few seconds later,
      // which is the player's window to take one out of the air first.
      if (now >= this._nextPartAt) {
        this._nextPartAt = now + t.partIntervalS;
        if (this._parts.length >= t.maxLooseParts) {
          const oldest = this._parts.shift();
          if (oldest != null && this.helpers.removeEntity) this.helpers.removeEntity(oldest);
        }
        const sled = this._get(this._sledId);
        if (sled && sled.pos && typeof this.helpers.spawnEntity === 'function') {
          const raw = (now * t.sledSpeedWuPerS) % (line.length * 2);
          const along = Math.max(0, Math.min(line.length, raw));
          const dirSign = raw <= line.length ? 1 : -1;
          const ahead = Math.max(0, Math.min(line.length, along + dirSign * 40));
          const dropPos = { x: line.from.x + line.dir.x * ahead, z: line.from.z + line.dir.z * ahead };
          const ent = this.helpers.spawnEntity(this._partSpec(dropPos, now));
          if (ent && ent.id != null) this._parts.push(ent.id);
        }
      }

      const sled = this._get(this._sledId);
      if (!sled || sled.alive === false || !sled.pos) { this._sledId = null; return; }
      // Ping-pong the line.
      const phase = (now * t.sledSpeedWuPerS) % (line.length * 2);
      const along = phase <= line.length ? phase : line.length * 2 - phase;
      sled.pos.x = line.from.x + line.dir.x * along;
      sled.pos.z = line.from.z + line.dir.z * along;

      // The sled eats any part it reaches.
      for (let i = this._parts.length - 1; i >= 0; i--) {
        const part = this._get(this._parts[i]);
        if (!part || part.alive === false) { this._parts.splice(i, 1); continue; }
        if (!part.pos) continue;
        const d = Math.hypot(part.pos.x - sled.pos.x, part.pos.z - sled.pos.z);
        if (d <= t.catchRadiusWu) {
          if (this.helpers.removeEntity) this.helpers.removeEntity(this._parts[i]);
          this._parts.splice(i, 1);
          if (this.bus && typeof this.bus.emit === 'function') {
            this.bus.emit(PL_106_FED_EVENT, { t: now });
          }
          if (now - this._lastEatLine >= t.eatLineCooldownS) {
            this._lastEatLine = now;
            this._popup(`plants:pl106:eat:${Math.round(now)}`, 'The parts sled', 'The sled eats.');
          }
        }
      }
    },

    /** "Take a part out of the air" — a real player-involved impact with a loose part. */
    _onImpact(p) {
      if (!p || !p.playerInvolved) return;
      if (!(Number(p.impulse) >= PARTS_SLED_TUNING.catchImpulseMin)) return;
      if (this._shadow) return;
      const partId = p.aId != null && this._parts.includes(p.aId) ? p.aId
        : (p.bId != null && this._parts.includes(p.bId) ? p.bId : null);
      if (partId == null) return;
      const now = this._now();
      const until = nextNightStartAt(now, PARTS_SLED_TUNING);
      this._shadow = { until };
      this._parts = this._parts.filter((id) => id !== partId);
      const sled = this._get(this._sledId);
      if (sled && sled.data) {
        sled.data.swarmFloorPad = { label: 'SLED WITNESS — BIDS RUN LOW' };
      }
      this._popup(`plants:pl106:took:${Math.round(now)}`, 'The parts sled',
        'You took it out of the air. The sled saw. It follows you through the market.');
      this._cue('ui_deny', 0.5);
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PL_106_SHADOWED_EVENT, { partId, until, t: now });
      }
    },

    _onKilled(p) {
      if (p && p.id === this._sledId) {
        this._sledId = null;
        this._shadow = null;
      }
    },
  };
}

export const pl106PartsSled = createPl106PartsSled();
