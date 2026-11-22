// PL-118 Pips counts — "Pips paces you along the buoy line, counting aloud, always right.
// Passing you: 'Two.'"
// What the player can do: "Count your own ships; or come back with a passenger pod and
// hear 'Three.'"
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; hash32 (src/core/rng.js) seeds the buoy
//   line bearing; no Math.random/Date.now; no Three.js/DOM imports.
// - All state on `this` (session-only); bounded pass ledger (tuning.memoryCap); cooldown
//   per pass.
// - Anchors sector_veil_nebula / station_veil — read from live entities; props are spawned
//   by this module only (never edits src/data).
// - Pods aboard are read from this module's own record of survivorPod:boarded receipts
//   (cleared on sector:exit) — no writes to the pod owner's state.

import { hash32 } from '../../core/rng.js';

export const PLANTS_PIPS_EVENT = 'plants:pipsCounts';

export const PIPS_TUNING = Object.freeze({
  plId: 'pl118',
  sectorId: 'sector_veil_nebula',
  stationId: 'station_veil',
  buoyCount: 4,
  lineLengthWu: 420,       // the buoy line off the research station
  corridorHalfWu: 60,      // how close the line must be crossed
  passCooldownS: 20,
  baseCount: 2,            // Pips counts you and himself, always right
  memoryCap: 8,            // pass receipts this session
});

/** Pure: the buoy-line endpoints from a seeded bearing off a station. */
export function buoyLineEndpoints(stationPos, seed, sectorId, lengthWu = PIPS_TUNING.lineLengthWu, count = PIPS_TUNING.buoyCount) {
  const h = Number.isFinite(hash32(seed, sectorId, 'pl118-line')) ? hash32(seed, sectorId, 'pl118-line') : 0;
  const bearing = (h % 6283) / 1000;
  const ux = Math.cos(bearing);
  const uz = Math.sin(bearing);
  const a = { x: stationPos.x + ux * lengthWu * 0.5, z: stationPos.z + uz * lengthWu * 0.5 };
  const b = { x: stationPos.x - ux * lengthWu * 0.5, z: stationPos.z - uz * lengthWu * 0.5 };
  const buoys = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    buoys.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  }
  return { a, b, buoys, bearing };
}

/** Pure: nearest point on segment ab to p, plus the side sign Pips watches for a crossing. */
export function nearestOnSegment(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const lenSq = abx * abx + abz * abz;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / lenSq)) : 0;
  const x = a.x + abx * t;
  const z = a.z + abz * t;
  return { x, z, t };
}

/** Pure: side sign of p relative to line ab (through-line direction ux,uz). */
export function sideSign(p, a, ux, uz) {
  return (p.x - a.x) * uz - (p.z - a.z) * ux >= 0 ? 1 : -1;
}

/** Pure: Pips's word for the count. */
export function pipsWord(n) {
  const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five'];
  return words[n] || String(n);
}

export const pipsCountsPlant = {
  modes: ['flight'],
  name: 'plants118',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ownedIds = new Set();
    this._podsAboard = 0;        // survivor pods in your custody this visit
    this._lastSide = 0;
    this._passTimes = new Map(); // passKey -> simTime (bounded)
    this._accum = 0;
    this._propsBuilt = false;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('survivorPod:boarded', () => { this._podsAboard += 1; });
    on('sector:exit', () => { this._podsAboard = 0; this._lastSide = 0; this._despawnOwned(); this._propsBuilt = false; });
    // game:newGame: the old session's props are already gone, so _despawnOwned's removals
    // no-op and the buoy line respawns fresh; the pass ledger's 20 s bucket keys would
    // collide with the old session's tail and gate the first crossings.
    on('game:newGame', () => { this._despawnOwned(); this._passTimes = new Map(); this._podsAboard = 0; });
    // A same-sector quickload emits no sector/new-game events: rebuilt world, fresh clock,
    // and the hold's board receipts are whatever the save says. Reset like a fresh sector.
    on('save:loaded', () => { this._despawnOwned(); this._passTimes = new Map(); this._podsAboard = 0; });
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus) return;
    if ((s.world && s.world.currentSectorId) !== PIPS_TUNING.sectorId) return;
    this._accum += dt;
    if (this._accum < 1) return;   // 1 Hz — pacing pace
    this._accum = 0;
    const player = s.entities && s.entities.get(s.playerId);
    const station = this._station();
    if (!player || !player.pos || !station) return;
    const seed = s.meta && s.meta.seed;
    const line = buoyLineEndpoints(station.pos, seed, PIPS_TUNING.sectorId);
    this._ensureProps(line);
    const near = nearestOnSegment(player.pos, line.a, line.b);
    const ux = Math.cos(line.bearing);
    const uz = Math.sin(line.bearing);
    const side = sideSign(player.pos, line.a, ux, uz);
    const onSpan = near.t > 0.05 && near.t < 0.95;
    const dist = Math.hypot(near.x - player.pos.x, near.z - player.pos.z);
    // Pips paces you: his marker rides the line at your nearest point.
    this._pacePips(near);
    if (onSpan && dist <= PIPS_TUNING.corridorHalfWu) {
      if (this._lastSide !== 0 && side !== this._lastSide) this._onPass(line, dist);
      this._lastSide = side;
    } else if (dist > PIPS_TUNING.corridorHalfWu * 3) {
      this._lastSide = 0;   // re-arm once you leave the corridor
    }
  },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._despawnOwned();
    this._passTimes = new Map();
    this._podsAboard = 0;
     this.state = null;
    this.bus = null;
  },

  // ---- internals ----

  _station() {
    const s = this.state;
    const idx = s.entityIndex && Array.isArray(s.entityIndex.stations) ? s.entityIndex.stations : null;
    const lists = [idx, Array.isArray(s.entityList) ? s.entityList : null];
    for (const list of lists) {
      if (!list) continue;
      for (const e of list) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === PIPS_TUNING.stationId) return e;
      }
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === PIPS_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _ensureProps(line) {
    if (this._propsBuilt) return;
    if (!this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    for (let i = 0; i < line.buoys.length; i++) {
      this._spawn({
        type: 'beacon',
        pos: line.buoys[i],
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          scanLabel: 'Buoy line — Pips paces it',
          storyPropKind: 'pips_buoy',
          tetherable: true,
          masslineTetherable: true,
          swarmFloorPad: { label: `PIP LINE ${i + 1}` },
        },
      });
    }
    this._pipsId = this._spawn({
      type: 'beacon',
      pos: line.a,
      vel: { x: 0, z: 0 },
      radius: 5,
      mass: 12,
      hull: 18,
      hullMax: 18,
      data: {
        parentType: 'story_prop',
        scanLabel: 'PIP — pacer drone, counting',
        storyPropKind: 'pips_pacer',
        tetherable: true,
        masslineTetherable: true,
        swarmFloorPad: { label: 'PIP' },
      },
    })?.id ?? null;
    this._propsBuilt = true;
  },

  _pacePips(point) {
    if (this._pipsId == null) return;
    const pips = this.state.entities && this.state.entities.get(this._pipsId);
    if (pips && pips.alive !== false) {
      pips.pos.x = point.x;
      pips.pos.z = point.z;
    }
  },

  _onPass(line, distWu) {
    const s = this.state;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    const key = String(Math.floor(now / PIPS_TUNING.passCooldownS));
    if (this._passTimes.has(key)) return;
    this._passTimes.set(key, now);
    if (this._passTimes.size > PIPS_TUNING.memoryCap) {
      const oldest = this._passTimes.keys().next().value;
      this._passTimes.delete(oldest);
    }
    const count = PIPS_TUNING.baseCount + this._podsAboard;
    const word = pipsWord(count);
    this._say(`plants:pl118:pass:${key}`, `${word}.`, 6);
    this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.6, rate: 1.2 });
    this.bus.emit(PLANTS_PIPS_EVENT, { kind: 'passed', count, word, distWu, podsAboard: this._podsAboard, t: now });
  },

  _spawn(spec) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const data = spec.data || {};
    spec.data = {
      ...data,
      plants: { ...(data.plants || {}), [PIPS_TUNING.plId]: { role: 'buoy' } },
    };
    const ent = spawnEntity(spec);
    if (ent && ent.id != null) this._ownedIds.add(ent.id);
    return ent || null;
  },

  _say(id, text, ttl) {
    if (!this.bus) return;
    this.bus.emit('comms:popup', { id, sender: 'PIP', category: 'traffic', text, ttl, persist: false });
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'comms', id, text, ttl, key: PIPS_TUNING.plId });
    }
  },

  _despawnOwned() {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity !== 'function') return;
    for (const id of this._ownedIds) removeEntity(id);
    this._ownedIds = new Set();
    this._pipsId = null;
    this._propsBuilt = false;
  },
};
