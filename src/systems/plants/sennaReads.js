// PL-120 The reading — "After dark Dustwife Senna reads the names of the lost, one lamp
// hung for each. One night, without looking up, she hangs one and reads yours."
// What the player can do: "Sit the night out; or leave Sedna a while — when you come
// back, she is past it."
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; the 600 s sector-day and night window
//   mirror coreSystem's DAY_SECONDS; no Math.random/Date.now; no Three.js/DOM imports.
// - All state on `this` (session-only); lamp ledger bounded (tuning.memoryCap); one
//   reading per night key.
// - Anchors sector_sedna_dark / station_sedna — read from live entities; lamps are
//   spawned by this module only (never edits src/data).
// - Session-only memory of completed readings decides when she reads yours; leaving
//   mid-reading marks her past it for the rest of the session.

import { hash32 } from '../../core/rng.js';

export const PLANTS_SENNA_EVENT = 'plants:sennaReads';

export const SENNA_TUNING = Object.freeze({
  plId: 'pl120',
  sectorId: 'sector_sedna_dark',
  stationId: 'station_sedna',
  dayS: 600,             // one sector-day (coreSystem DAY_SECONDS)
  nightStartAt: 480,     // after dark on the 600 s day
  readingS: 30,
  lampBase: 5,
  lampMaxExtra: 4,       // the row of lamps grows with your completed sittings
  lampRangeWu: 420,      // sitting range around the post
  memoryCap: 24,         // hung lamp props this session
});

/** Pure: after dark on the sector-day clock? */
export function nightWindow(simTime, dayS = SENNA_TUNING.dayS, nightStartAt = SENNA_TUNING.nightStartAt) {
  const t = Number.isFinite(simTime) ? simTime : 0;
  return ((t % dayS) + dayS) % dayS >= nightStartAt;
}

/** Pure: the night key — one reading per night. */
export function nightKey(simTime, dayS = SENNA_TUNING.dayS) {
  const t = Number.isFinite(simTime) ? simTime : 0;
  return Math.floor(t / dayS);
}

/** Pure: how many lamps hang tonight, given completed sittings this session. */
export function lampCountTonight(completedSittings, base = SENNA_TUNING.lampBase, maxExtra = SENNA_TUNING.lampMaxExtra) {
  return base + Math.max(0, Math.min(maxExtra, completedSittings));
}

export const sennaReadsPlant = {
  name: 'plants120',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._ownedIds = new Set();
    this._completedSittings = 0;   // nights you sat out to the end, this session
    this._readYours = false;       // she reads yours once per session
    this._pastIt = false;          // you left mid-reading once — she is past it
    this._reading = null;          // { key, startedAt, seenWhole }
    this._announcedPast = null;    // night key she was announced past for
    this._accum = 0;
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const on = (event, fn) => {
      const off = this.bus.on(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:exit', () => this._onSectorExit());
  },

  update(dt) {
    const s = this.state;
    if (s && s.mode && s.mode !== 'flight') return;
    if (!s || !this.bus) return;
    if ((s.world && s.world.currentSectorId) !== SENNA_TUNING.sectorId) return;
    this._accum += dt;
    if (this._accum < 1) return;   // 1 Hz
    this._accum = 0;
    const station = this._station();
    const player = s.entities && s.entities.get(s.playerId);
    if (!station || !player || !player.pos) return;
    const now = Number.isFinite(s.simTime) ? s.simTime : 0;
    const key = nightKey(now, SENNA_TUNING.dayS);
    const near = Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z) <= SENNA_TUNING.lampRangeWu;
    const night = nightWindow(now, SENNA_TUNING.dayS, SENNA_TUNING.nightStartAt);

    if (night && this._pastIt && this._announcedPast !== key && near && !this._reading) {
      this._announcedPast = key;
      this._say(`plants:pl120:past:${key}`, 'She was past it.', 6);
      this.bus.emit(PLANTS_SENNA_EVENT, { kind: 'pastIt', nightKey: key, t: now });
    }

    if (!night) {
      if (this._reading && this._reading.key !== key) this._reading = null;
      return;
    }
    if (!near) {
      if (this._reading) this._leaveReading();
      return;
    }
    if (!this._reading) {
      if (this._reading !== null) return;
      this._reading = { key, startedAt: now, seenWhole: true };
      if (!this._pastIt) {
        this._hangLamps(lampCountTonight(this._completedSittings));
        this._say(`plants:pl120:start:${key}`, 'She reads the lost.', 6);
        this.bus.emit(PLANTS_SENNA_EVENT, { kind: 'readingStarts', nightKey: key, t: now });
      }
      return;
    }
    // mid-reading
    if (this._reading.key !== key) { this._reading = null; return; }
    this._reading.seenWhole = this._reading.seenWhole && near;
    if (now - this._reading.startedAt >= SENNA_TUNING.readingS) {
      this._finishReading(key, now);
    }
  },

  destroy() {
    if (!this._unsubs) { this.state = null; this.bus = null; return; }
    for (const off of this._unsubs) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._unsubs = [];
    this._despawnOwned();
    this._reading = null;
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
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === SENNA_TUNING.stationId) return e;
      }
    }
    if (s.entities && typeof s.entities.values === 'function') {
      for (const e of s.entities.values()) {
        if (e && e.type === 'station' && e.alive !== false && e.data && e.data.stationId === SENNA_TUNING.stationId) return e;
      }
    }
    return null;
  },

  _finishReading(key, now) {
    const seenWhole = this._reading && this._reading.seenWhole;
    this._reading = null;
    if (!seenWhole || this._pastIt) return;
    this._completedSittings += 1;
    if (!this._readYours && this._completedSittings >= 2) {
      this._readYours = true;
      this._hangLamps(lampCountTonight(this._completedSittings) + 1, 'A LAMP — YOURS');
      this._say(`plants:pl120:yours:${key}`, 'Yours is the last lamp.', 7);
      this.bus.emit('audio:cue', { id: 'confirm', position: null, gain: 0.7, rate: 0.8 });
      this.bus.emit(PLANTS_SENNA_EVENT, { kind: 'readsYours', nightKey: key, t: now });
    } else {
      this.bus.emit(PLANTS_SENNA_EVENT, { kind: 'satOut', nightKey: key, t: now });
    }
  },

  _leaveReading() {
    if (!this._reading || this._pastIt) { this._reading = null; return; }
    this._pastIt = true;
    this._reading = null;
    this.bus.emit(PLANTS_SENNA_EVENT, { kind: 'leftMidReading', t: this._now() });
  },

  _onSectorExit() {
    if (this._reading) this._leaveReading();
  },

  _hangLamps(count, lastLabel = 'A LAMP FOR THE LOST') {
    const station = this._station();
    if (!station || !this.helpers || typeof this.helpers.spawnEntity !== 'function') return;
    const s = this.state;
    const have = this._ownedIds.size;
    const total = Math.min(count, SENNA_TUNING.memoryCap);
    for (let i = have; i < total; i++) {
      const h = Number.isFinite(i) ? i : 0;
      const bearing = (hashSeed(s, 'pl120', h) % 6283) / 1000;
      const dist = 60 + (i * 22);
      const pos = {
        x: station.pos.x + Math.cos(bearing) * dist,
        z: station.pos.z + Math.sin(bearing) * dist,
      };
      const isLast = i === total - 1 && lastLabel === 'A LAMP — YOURS';
      this._spawn({
        type: 'beacon',
        pos,
        vel: { x: 0, z: 0 },
        radius: 5,
        mass: 1e6,
        hull: 1,
        hullMax: 1,
        data: {
          parentType: 'story_prop',
          scanLabel: isLast ? 'Dustwife Senna — hung a lamp, and read yours' : 'Dustwife Senna — hung a lamp for the lost',
          storyPropKind: isLast ? 'senna_lamp_yours' : 'senna_lamp',
          tetherable: true,
          masslineTetherable: true,
          swarmFloorPad: { label: isLast ? lastLabel : 'A LAMP FOR THE LOST' },
        },
      });
    }
  },

  _now() {
    return Number.isFinite(this.state && this.state.simTime) ? this.state.simTime : 0;
  },

  _spawn(spec) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const data = spec.data || {};
    spec.data = {
      ...data,
      plants: { ...(data.plants || {}), [SENNA_TUNING.plId]: { role: 'lamp' } },
    };
    const ent = spawnEntity(spec);
    if (ent && ent.id != null) this._ownedIds.add(ent.id);
    return ent || null;
  },

  _say(id, text, ttl) {
    if (!this.bus) return;
    this.bus.emit('comms:popup', { id, sender: 'DUSTWIFE SENNA', category: 'traffic', text, ttl, persist: false });
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'bark', id, text, ttl, key: SENNA_TUNING.plId });
    }
  },

  _despawnOwned() {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity !== 'function') return;
    for (const id of this._ownedIds) removeEntity(id);
    this._ownedIds = new Set();
  },
};

function hashSeed(state, salt, i) {
  return hash32(state && state.meta && state.meta.seed, salt, i, SENNA_TUNING.sectorId);
}
