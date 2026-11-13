// PL-174 The witness — A civilian saw it; your description goes on the Berth Board, wrong colour, wrong tag.
// Row (design/program/INFERENCE_PLANTS.md §H):
//   What happens: A civilian saw it, and your description goes chalked on the Berth Board —
//   wrong colour, wrong tag. It holds until the witness docks and corrects it
//   What the player can do: Enjoy the wrong chalk; or be gone before they dock
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via WITNESS_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; this plant chalks a
//   board and listens for a docking — it steers nobody.
// - Cooldowns per board key. All session state lives on `this`, never module-level.

import { hash32 } from '../../core/rng.js';

export const PLANTS_WITNESS_CHALK_EVENT = 'plants:witnessChalk';
export const PLANTS_WITNESS_CORRECTED_EVENT = 'plants:witnessCorrected';
export const PLANTS_WITNESS_FADED_EVENT = 'plants:witnessFaded';

export const WITNESS_TUNING = Object.freeze({
  witnessRangeWu: 300,        // a civilian within this of the incident saw it
  boardRangeWu: 600,          // the nearest station inside this gets the chalk
  scanCap: 64,                // bounded witness scan
  memoryCap: 8,               // one board entry per sector; bounded anyway
});

export const WITNESS_WRONG_COLOURS = Object.freeze(['grey', 'ochre', 'pale green', 'washed blue', 'rust']);
export const WITNESS_CHALK_LINE = 'Berth Board: chalked.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decision helper (pure): the wrong description the witness gives — wrong colour, wrong tag.
 * Deterministic from the witness id, and wrong by construction.
 */
export function wrongDescriptionFor(witnessId, player) {
  const colour = WITNESS_WRONG_COLOURS[hash32(String(witnessId), 'witnessColour', 'c') % WITNESS_WRONG_COLOURS.length];
  const seed = hash32(String(witnessId), 'witnessTag', 't');
  const trueTag = player && player.data && player.data.tag ? String(player.data.tag) : 'p1';
  const wrongTag = `${trueTag}-${(seed % 89) + 10}`;
  return { colour, tag: wrongTag };
}

/**
 * Eligibility: a civilian hull able to witness (alive, near, not the player, not hostile).
 */
export function isWitnessCandidate(entity, state = null) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.pos) return false;
  if (state && entity.id === state.playerId) return false;
  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
  if (data.disabled || data.derelict) return false;
  if (data.ai && data.ai.pirate === true) return false;
  return true;
}

/**
 * Memory-row builder (pure): the board entry row, FIFO + stale eviction at the cap.
 */
export function witnessRowFor(memory, key, now, cap = WITNESS_TUNING.memoryCap) {
  if (!memory || !key) return null;
  let row = memory.get(key);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = {
      boardStationId: null,
      witnessId: null,
      colour: null,
      tag: null,
      corrected: false,
      chalkedAt: -Infinity,
      lastAt: now,
    };
    memory.set(key, row);
  }
  return row;
}

export const witnessOps = {
  _initWitness(ctx = {}) {
    this._witnessMemory = new Map();
    if (this.bus && typeof this.bus.on === 'function' && !this._witnessInstalled) {
      this._witnessInstalled = true;
      this.bus.on('law:incidentOpened', (p) => this._onWitnessIncident(p));
      this.bus.on('dock:range', (p) => this._onWitnessDockRange(p));
      this.bus.on('sector:exit', () => this._onWitnessSectorExit());
    }
  },

  _witnessMemoryMap() {
    if (!(this._witnessMemory instanceof Map)) this._witnessMemory = new Map();
    return this._witnessMemory;
  },

  _witnessEntities() {
    const entities = this.state && this.state.entities;
    if (!entities) return [];
    const out = [];
    if (typeof entities.values === 'function') { for (const e of entities.values()) out.push(e); }
    else if (Array.isArray(entities)) { for (const e of entities) out.push(e); }
    return out;
  },

  /** law:incidentOpened receipt ({attackerId, victimId, victimAnchor:{x,z}, ...}): a civilian saw it. */
  _onWitnessIncident(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    // Only incidents attributed to the player get chalked; the position is the receipt's
    // victimAnchor (lawSecurity's publicIncident shape) — there is no pos field.
    if (payload.attackerId !== this.state.playerId) return;
    const pos = payload.victimAnchor && Number.isFinite(payload.victimAnchor.x)
      && Number.isFinite(payload.victimAnchor.z)
      ? { x: payload.victimAnchor.x, z: payload.victimAnchor.z }
      : null;
    if (!pos) return;

    const now = finite(this.state.simTime, 0);
    const row = witnessRowFor(this._witnessMemoryMap(), 'board', now);
    if (!row || row.corrected) return;
    row.lastAt = now;

    // Nearest witnessing civilian, bounded scan.
    let witness = null;
    let witnessD = Infinity;
    let scanned = 0;
    for (const ent of this._witnessEntities()) {
      if (scanned >= WITNESS_TUNING.scanCap) break;
      scanned += 1;
      if (!isWitnessCandidate(ent, this.state)) continue;
      const d = Math.hypot(finite(ent.pos.x) - finite(pos.x), finite(ent.pos.z) - finite(pos.z));
      if (d <= WITNESS_TUNING.witnessRangeWu && d < witnessD) {
        witness = ent;
        witnessD = d;
      }
    }
    if (!witness) return;

    // Nearest station to chalk the Berth Board.
    const stations = Array.isArray(this.state.stations) ? this.state.stations : [];
    let boardStation = null;
    let boardD = Infinity;
    for (const station of stations) {
      if (!station || station.alive === false || !station.pos) continue;
      const sd = station.data || {};
      if (sd.isGate || sd.isWormhole) continue;
      const d = Math.hypot(finite(station.pos.x) - finite(pos.x), finite(station.pos.z) - finite(pos.z));
      if (d <= WITNESS_TUNING.boardRangeWu && d < boardD) {
        boardStation = station;
        boardD = d;
      }
    }
    if (!boardStation) return;

    const player = this._witnessEntityById(this.state.playerId);
    const wrong = wrongDescriptionFor(witness.id, player);
    row.boardStationId = (boardStation.data && boardStation.data.stationId) || boardStation.id;
    row.witnessId = witness.id;
    row.colour = wrong.colour;
    row.tag = wrong.tag;
    row.chalkedAt = now;

    const sdata = boardStation.data || (boardStation.data = {});
    sdata.berthBoard = { colour: wrong.colour, tag: wrong.tag, corrected: false, playerId: this.state.playerId };

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_WITNESS_CHALK_EVENT, {
        stationId: row.boardStationId,
        witnessId: witness.id,
        colour: wrong.colour,
        tag: wrong.tag,
        t: now,
      });
      this.bus.emit('comms:popup', {
        id: 'plants:pl174:chalk',
        sender: 'BERTH BOARD',
        category: 'traffic',
        text: WITNESS_CHALK_LINE,
        ttl: 5,
      });
    }
  },

  /** dock:range receipt: the witness docks and corrects the chalk. */
  _onWitnessDockRange(payload) {
    if (!payload || !this.state || (this.state.mode && this.state.mode !== 'flight')) return;
    if (payload.inRange !== true) return;
    const now = finite(this.state.simTime, 0);
    const row = this._witnessMemoryMap().get('board');
    if (!row || row.corrected || row.witnessId == null) return;
    if (row.witnessId !== payload.shipId) return;
    if (row.boardStationId !== payload.stationId) return;
    row.lastAt = now;

    // Corrected: the true colour and tag go up.
    const player = this._witnessEntityById(this.state.playerId);
    const pdata = (player && player.data) || {};
    row.colour = pdata.colour || row.colour;
    row.tag = pdata.tag || row.tag;
    row.corrected = true;
    const station = this._witnessStationById(row.boardStationId);
    if (station) {
      const sdata = station.data || (station.data = {});
      sdata.berthBoard = {
        colour: row.colour,
        tag: row.tag,
        corrected: true,
        playerId: this.state.playerId,
      };
    }
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_WITNESS_CORRECTED_EVENT, { stationId: row.boardStationId, witnessId: row.witnessId, t: now });
    }
  },

  /** Be gone before they dock: leaving the sector lets the wrong chalk fade uncorrected. */
  _onWitnessSectorExit() {
    const row = this._witnessMemoryMap().get('board');
    if (!row || row.corrected) return;
    const now = finite(this.state && this.state.simTime, 0);
    this._witnessMemoryMap().delete('board');
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_WITNESS_FADED_EVENT, { stationId: row.boardStationId, t: now });
    }
  },

  _witnessEntityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  _witnessStationById(id) {
    if (id == null || !this.state || !Array.isArray(this.state.stations)) return null;
    return this.state.stations.find(
      (s) => s && ((s.data && s.data.stationId) || s.id) === id,
    ) || null;
  },
};
