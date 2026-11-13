// PL-229 The other name — The town chalked a name for the day the tug brought you in asleep, and it stuck.
// Row (design/program/INFERENCE_PLANTS.md §H):
//   What happens: The town chalked a name on the board for the day the tug brought you in
//   asleep, and it stuck
//   What the player can do: Earn a better one; the town will keep both
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via OTHER_NAME_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; the tug story is a
//   chalk line — this plant steers nobody.
// - Cooldowns per station key. All session state lives on `this`, never module-level.
//
// The chalk is physical: the board prop at the station carries data.swarmFloorPad {label}
// (rendered by the existing pad-label layer) plus the plantsBoardName stamp PL-250 reads.

import { hash32 } from '../../core/rng.js';

export const PLANTS_OTHER_NAME_CHALK_EVENT = 'plants:otherNameChalked';
export const PLANTS_OTHER_NAME_EARNED_EVENT = 'plants:otherNameEarned';
export const PLANTS_OTHER_NAME_BOTH_EVENT = 'plants:otherNameBoth';

export const OTHER_NAME_TUNING = Object.freeze({
  disabledHullFraction: 0.3,  // "brought you in asleep": hull at or below this fraction
  sightRangeWu: 700,          // a deed the chalked town can see
  bothCooldownS: 60,          // the both-names line, once per visit window
  boardOffsetWu: 46,          // the board prop hangs this far off the station heart
  boardPropRadius: 4,
  memoryCap: 16,              // bounded board rows
});

export const OTHER_NAME_ASLEEP = 'The Sleeping Cargo';

export const OTHER_NAME_POOL = Object.freeze([
  'The Loadstar',
  'The Quiet Hand',
  'The Pile-keeper',
  'The Long Tow',
]);

/** ≤8 words, plain: the town keeps both names and says so once per visit. */
export function otherNameEarnedLineFor() {
  return 'Both names stay chalked.';
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decision helper (pure): is this hull asleep on its ropes — disabled enough to be towed in?
 */
export function broughtInAsleep(entity, tuning = OTHER_NAME_TUNING) {
  if (!entity || entity.alive === false) return false;
  const data = entity.data || {};
  if (data.disabled === true) return true;
  const hp = Number.isFinite(Number(data.hp)) ? Number(data.hp) : null;
  const maxHp = Number.isFinite(Number(data.maxHp)) ? Number(data.maxHp) : null;
  if (hp != null && maxHp != null && maxHp > 0) return hp <= maxHp * tuning.disabledHullFraction;
  const hull = Number.isFinite(Number(entity.hull)) ? Number(entity.hull) : null;
  const hullMax = Number.isFinite(Number(entity.hullMax)) ? Number(entity.hullMax) : null;
  if (hull != null && hullMax != null && hullMax > 0) return hull <= hullMax * tuning.disabledHullFraction;
  return false;
}

/**
 * Memory-row builder (pure): the chalked board row, FIFO + stale eviction at the cap.
 */
export function otherNameRowFor(memory, stationId, now, cap = OTHER_NAME_TUNING.memoryCap) {
  if (!memory || !stationId) return null;
  let row = memory.get(stationId);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { asleepName: null, betterName: null, lastBothAt: -Infinity, lastAt: now };
    memory.set(stationId, row);
  }
  return row;
}

export const otherNameOps = {
  _initOtherName(ctx = {}) {
    this._otherNameMemory = new Map();
    if (this.bus && typeof this.bus.on === 'function' && !this._otherNameInstalled) {
      this._otherNameInstalled = true;
      this.bus.on('dock:range', (p) => this._onOtherNameDockRange(p));
      this.bus.on('entity:killed', (p) => this._onOtherNameDeed(p));
      this.bus.on('sector:exit', () => this._otherNameCleanup());
      this.bus.on('save:loaded', () => this._otherNameCleanup());
    }
  },

  _otherNameMemoryMap() {
    if (!(this._otherNameMemory instanceof Map)) this._otherNameMemory = new Map();
    return this._otherNameMemory;
  },

  _otherNameCleanup() {
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') {
      for (const row of this._otherNameMemory.values()) {
        if (row.propId != null) removeEntity(row.propId);
        row.propId = null;
      }
    }
  },

  /** The physical chalk: a board prop at the station, label rendered via swarmFloorPad. */
  _otherNameSpawnBoard(station, stationId, name, playerId, now) {
    const row = otherNameRowFor(this._otherNameMemoryMap(), stationId, now);
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (row && row.propId != null && typeof removeEntity === 'function') removeEntity(row.propId);
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function' || !station || !station.pos) return null;
    const ang = (hash32(String(stationId), 'boardAngle', 'o') % 6283) / 1000;
    const prop = spawnEntity({
      type: 'beacon',
      pos: {
        x: finite(station.pos.x) + Math.cos(ang) * OTHER_NAME_TUNING.boardOffsetWu,
        z: finite(station.pos.z) + Math.sin(ang) * OTHER_NAME_TUNING.boardOffsetWu,
      },
      vel: { x: 0, z: 0 },
      radius: OTHER_NAME_TUNING.boardPropRadius,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: 'Berth Board',
        storyPropKind: 'berth_board',
        swarmFloorPad: { label: name },
        plantsBoardName: { forPlayer: playerId, name },
        tetherable: true,
        masslineTetherable: true,
      },
    });
    if (row) row.propId = prop && prop.id != null ? prop.id : null;
    return prop;
  },

  _otherNameEntityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  _onOtherNameDockRange(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    if (payload.shipId !== this.state.playerId || payload.inRange !== true) return;
    const now = finite(this.state.simTime, 0);
    const player = this._otherNameEntityById(this.state.playerId);
    const row = otherNameRowFor(this._otherNameMemoryMap(), payload.stationId, now);
    if (!row) return;
    row.lastAt = now;

    // The day the tug brought you in asleep: the chalk goes up and sticks.
    if (!row.asleepName && broughtInAsleep(player)) {
      row.asleepName = OTHER_NAME_ASLEEP;
      const station = this._otherNameStationById(payload.stationId);
      if (station) {
        const sdata = station.data || (station.data = {});
        sdata.boardName = row.asleepName;
        sdata.boardNameFor = this.state.playerId;
        this._otherNameSpawnBoard(station, payload.stationId, row.asleepName, this.state.playerId, now);
      }
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_OTHER_NAME_CHALK_EVENT, { stationId: payload.stationId, name: row.asleepName, t: now });
        this.bus.emit('comms:popup', {
          id: 'plants:pl229:chalk',
          sender: 'BERTH BOARD',
          category: 'traffic',
          text: `${row.asleepName}. It sticks.`,
          ttl: 6,
        });
      }
      return;
    }

    // The town keeps both names, and says so, once per visit window.
    if (row.asleepName && row.betterName && now - row.lastBothAt >= OTHER_NAME_TUNING.bothCooldownS) {
      row.lastBothAt = now;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_OTHER_NAME_BOTH_EVENT, {
          stationId: payload.stationId,
          asleepName: row.asleepName,
          betterName: row.betterName,
          text: otherNameEarnedLineFor(row.betterName),
          t: now,
        });
        this.bus.emit('comms:popup', {
          id: 'plants:pl229:both',
          sender: 'BERTH BOARD',
          category: 'traffic',
          text: otherNameEarnedLineFor(row.betterName),
          ttl: 6,
        });
      }
    }
  },

  /** entity:killed receipt: a deed in the chalked town's sight earns a better name. */
  _onOtherNameDeed(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    if (payload.killerId !== this.state.playerId || payload.id === this.state.playerId) return;
    const pos = payload.pos || null;
    if (!pos) return;
    const now = finite(this.state.simTime, 0);
    const memory = this._otherNameMemoryMap();

    for (const [stationId, row] of memory) {
      if (!row.asleepName || row.betterName) continue;
      const station = this._otherNameStationById(stationId);
      if (!station || !station.pos) continue;
      const d = Math.hypot(finite(station.pos.x) - finite(pos.x), finite(station.pos.z) - finite(pos.z));
      if (d > OTHER_NAME_TUNING.sightRangeWu) continue;
      row.betterName = OTHER_NAME_POOL[hash32(String(stationId), 'otherName', String(payload.id)) % OTHER_NAME_POOL.length];
      row.lastAt = now;
      const sdata = station.data || (station.data = {});
      sdata.boardName = row.betterName;
      sdata.boardNameFor = this.state.playerId;
      this._otherNameSpawnBoard(station, stationId, row.betterName, this.state.playerId, now);
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_OTHER_NAME_EARNED_EVENT, { stationId, name: row.betterName, t: now });
      }
      break;
    }
  },

  _otherNameStationById(id) {
    if (id == null || !this.state || !Array.isArray(this.state.stations)) return null;
    return this.state.stations.find(
      (s) => s && ((s.data && s.data.stationId) || s.id) === id,
    ) || null;
  },
};
