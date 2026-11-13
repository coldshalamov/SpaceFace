// PL-228 Two names — Two towns' Berth Boards named you differently for the same deed; each town is sure theirs is right.
// Row (design/program/INFERENCE_PLANTS.md §H):
//   What happens: Two towns' Berth Boards have named you differently for the same deed, and
//   each town is sure theirs is right
//   What the player can do: Live with both; each town is certain
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via TWO_NAMES_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; boards chalk names —
//   this plant steers nobody.
// - Cooldowns per station key. All session state lives on `this`, never module-level.
//
// The chalk is physical: each named town gets a board prop at the station carrying
// data.swarmFloorPad {label} (rendered by the existing pad-label layer) plus the
// plantsBoardName stamp other plant modules read. One prop per station, replaced on re-chalk,
// despawned with the sector.

import { hash32 } from '../../core/rng.js';

export const PLANTS_TWO_NAMES_EVENT = 'plants:twoNamesChalked';
export const PLANTS_TWO_NAMES_CERTAIN_EVENT = 'plants:twoNamesCertain';

export const TWO_NAMES_TUNING = Object.freeze({
  sightRangeWu: 700,          // a deed seen by two towns at once
  certaintyCooldownS: 60,     // each town states its case once per visit window
  boardOffsetWu: 46,          // the board prop hangs this far off the station heart
  boardPropRadius: 4,
  memoryCap: 16,              // bounded board rows
});

export const TWO_NAMES_POOL = Object.freeze([
  'The Wire-puller',
  'The Berth Rat',
  'The Wake-fanner',
  'The Quiet Hand',
  'The Long Chalk',
  'The Tide-room Thief',
]);

export function twoNamesLineFor(name) {
  return `${name} — always was.`;
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decision helper (pure): the name a town chalks for a deed — different per town by design.
 */
export function chalkNameFor(stationId, deedKey) {
  return TWO_NAMES_POOL[hash32(String(stationId), 'twoNames', String(deedKey)) % TWO_NAMES_POOL.length];
}

/**
 * Pure helper: real stations (no gates/wormholes) within sight range of a position.
 */
export function findBoardsInSight(state, pos, maxRange = TWO_NAMES_TUNING.sightRangeWu) {
  if (!state || !pos) return [];
  const out = [];
  const stations = Array.isArray(state.stations) ? state.stations : [];
  for (const station of stations) {
    if (!station || station.alive === false || station.type !== 'station' || !station.pos) continue;
    const sd = station.data || {};
    if (sd.isGate || sd.isWormhole) continue;
    const d = Math.hypot(finite(station.pos.x) - finite(pos.x), finite(station.pos.z) - finite(pos.z));
    if (d <= maxRange) out.push({ station, stationId: sd.stationId || station.id, dist: d });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out;
}

/**
 * Memory-row builder (pure): per-station board row, FIFO + stale eviction at the cap.
 */
export function twoNamesRowFor(memory, stationId, now, cap = TWO_NAMES_TUNING.memoryCap) {
  if (!memory || !stationId) return null;
  let row = memory.get(stationId);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { name: null, deedKey: null, lastCertainAt: -Infinity, lastAt: now };
    memory.set(stationId, row);
  }
  return row;
}

export const twoNamesOps = {
  _initTwoNames(ctx = {}) {
    this._twoNamesMemory = new Map();
    if (this.bus && typeof this.bus.on === 'function' && !this._twoNamesInstalled) {
      this._twoNamesInstalled = true;
      this.bus.on('entity:killed', (p) => this._onTwoNamesDeed(p));
      this.bus.on('dock:range', (p) => this._onTwoNamesDockRange(p));
      this.bus.on('sector:exit', () => this._twoNamesCleanup());
      this.bus.on('save:loaded', () => this._twoNamesCleanup());
    }
  },

  _twoNamesMemoryMap() {
    if (!(this._twoNamesMemory instanceof Map)) this._twoNamesMemory = new Map();
    return this._twoNamesMemory;
  },

  _twoNamesCleanup() {
    // Board props never outlive the sector.
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (typeof removeEntity === 'function') {
      for (const row of this._twoNamesMemory.values()) {
        if (row.propId != null) removeEntity(row.propId);
        row.propId = null;
      }
    }
  },

  /** The physical chalk: a board prop at the station, label rendered via swarmFloorPad. */
  _twoNamesSpawnBoard(station, stationId, name, playerId, now) {
    const row = twoNamesRowFor(this._twoNamesMemoryMap(), stationId, now);
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (row && row.propId != null && typeof removeEntity === 'function') removeEntity(row.propId);
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function' || !station || !station.pos) return null;
    const ang = (hash32(String(stationId), 'boardAngle', 'b') % 6283) / 1000;
    const prop = spawnEntity({
      type: 'beacon',
      pos: {
        x: finite(station.pos.x) + Math.cos(ang) * TWO_NAMES_TUNING.boardOffsetWu,
        z: finite(station.pos.z) + Math.sin(ang) * TWO_NAMES_TUNING.boardOffsetWu,
      },
      vel: { x: 0, z: 0 },
      radius: TWO_NAMES_TUNING.boardPropRadius,
      mass: 1e6,
      hull: 1,
      hullMax: 1,
      data: {
        parentType: 'story_prop',
        scanLabel: 'Berth Board',
        storyPropKind: 'berth_board',
        // Rendered screen-space by the existing pad-label layer (src/ui/floatingText.js).
        swarmFloorPad: { label: name },
        // In-family stamp PL-250 reads as its prop-based source of truth.
        plantsBoardName: { forPlayer: playerId, name },
        tetherable: true,
        masslineTetherable: true,
      },
    });
    if (row) row.propId = prop && prop.id != null ? prop.id : null;
    return prop;
  },

  _twoNamesStationById(id) {
    if (id == null || !this.state || !Array.isArray(this.state.stations)) return null;
    return this.state.stations.find(
      (s) => s && ((s.data && s.data.stationId) || s.id) === id,
    ) || null;
  },

  /** entity:killed receipt: a player deed within sight of two towns chalks both boards. */
  _onTwoNamesDeed(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    if (payload.killerId !== this.state.playerId) return;
    if (payload.id === this.state.playerId) return;
    const pos = payload.pos || null;
    if (!pos) return;
    const now = finite(this.state.simTime, 0);

    const boards = findBoardsInSight(this.state, pos);
    if (boards.length < 2) return; // one deed, two towns, or no story
    const deedKey = `${payload.id}:${Math.round(pos.x)}:${Math.round(pos.z)}`;

    const memory = this._twoNamesMemoryMap();
    const chalked = [];
    for (const { stationId } of boards.slice(0, 3)) {
      const row = twoNamesRowFor(memory, stationId, now);
      if (!row) continue;
      row.lastAt = now;
      row.name = chalkNameFor(stationId, deedKey);
      row.deedKey = deedKey;
      const station = this._twoNamesStationById(stationId);
      if (station) {
        const sdata = station.data || (station.data = {});
        sdata.boardName = row.name;
        sdata.boardNameFor = this.state.playerId;
        // The chalk is physical: a board prop with the name on it, at the station.
        this._twoNamesSpawnBoard(station, stationId, row.name, this.state.playerId, now);
      }
      chalked.push({ stationId, name: row.name, propId: this._twoNamesMemoryMap().get(stationId)?.propId ?? null });
    }

    if (chalked.length >= 2 && this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_TWO_NAMES_EVENT, { deedKey, boards: chalked, t: now });
    }
  },

  /** dock:range receipt: each town states its case, and each is certain. */
  _onTwoNamesDockRange(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    if (payload.shipId !== this.state.playerId || payload.inRange !== true) return;
    const now = finite(this.state.simTime, 0);
    const row = this._twoNamesMemoryMap().get(payload.stationId);
    if (!row || !row.name) return;
    row.lastAt = now;
    if (now - row.lastCertainAt < TWO_NAMES_TUNING.certaintyCooldownS) return;
    row.lastCertainAt = now;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_TWO_NAMES_CERTAIN_EVENT, {
        stationId: payload.stationId,
        name: row.name,
        text: twoNamesLineFor(row.name),
        t: now,
      });
      this.bus.emit('comms:popup', {
        id: 'plants:pl228:certain',
        sender: 'BERTH BOARD',
        category: 'traffic',
        text: twoNamesLineFor(row.name),
        ttl: 6,
      });
    }
  },
};
