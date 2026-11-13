// PL-198 The orphan — An ownerless wreck drifts across a lane for days; everyone files around it, then a town argues.
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: A wreck nobody owns drifts across a lane for days, and everyone files around
//   it, until the nearest town is arguing about it on open radio
//   What the player can do: Tow it to the dock and watch three owners appear; or enjoy the
//   argument
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via ORPHAN_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; filing-around is a
//   short leased avoidance beat, aborted when the lease is refused.
// - Cooldowns per hull key. All session state lives on `this`, never module-level.
//
// "Tow it to the dock" is judged through the real tether seams (towWatch): the three-owner
// payoff fires only when the player has actually tethered the wreck (latched at arrival or
// within towGraceS of it). The spawn delay is sector-relative, never absolute simTime.

import { hash32 } from '../../core/rng.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';
import { attachTowWatch, towTargetIdOf } from './towWatch.js';

export const PLANTS_ORPHAN_SPAWN_EVENT = 'plants:orphanWreckSpawn';
export const PLANTS_ORPHAN_FILE_EVENT = 'plants:orphanFileAround';
export const PLANTS_ORPHAN_ARGUMENT_EVENT = 'plants:orphanArgument';
export const PLANTS_ORPHAN_OWNERS_EVENT = 'plants:orphanOwners';

export const ORPHAN_ARGUMENT_LINES = Object.freeze([
  'That wreck sits in MY lane.',
  'It drifted in from YOUR side.',
]);

export const ORPHAN_TUNING = Object.freeze({
  spawnDelayS: 25,            // after sector entry, the orphan appears
  wreckRadius: 9,
  wreckMass: 220,
  wreckHull: 60,
  driftSpeedWu: 6,            // it drifts across the lane
  fileAroundRadiusWu: 150,    // traffic files around it within this
  fileDurationS: 2,           // each filed-around hull's leased avoidance beat
  hullFileCooldownS: 4,       // per-hull cooldown between filing beats
  argumentAfterS: 45,         // drifting this long brings the open-radio argument
  dockArriveRadiusWu: 220,    // orphan inside this of a station = towed to the dock
  claimGraceS: 20,            // the wreck leaves the world this long after the owners appear
  towGraceS: 12,              // the tow latch must be this fresh at arrival for the owners payoff
  memoryCap: 32,              // bounded hull rows
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Eligibility: an ambient civilian hull that will file around the orphan (not the player).
 */
export function isOrphanFiler(entity, rec = null, state = null) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.pos) return false;
  if (state && entity.id === state.playerId) return false;
  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
  if (data.disabled || data.derelict || data.orphanWreck) return false;
  return true;
}

/**
 * Memory-row builder (pure): per-hull filing bookkeeping, FIFO + stale eviction at the cap.
 */
export function orphanRowFor(memory, hullId, now, cap = ORPHAN_TUNING.memoryCap) {
  if (!memory || !hullId) return null;
  let row = memory.get(hullId);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || now - old.lastAt > ORPHAN_TUNING.hullFileCooldownS * 8) memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { lastFileAt: -Infinity, files: 0, lastAt: now };
    memory.set(hullId, row);
  }
  return row;
}

/**
 * Standalone plant body shared by the ops mixin: spawn/argument/dock bookkeeping.
 * Implemented as a mixin because the filing-around beat needs the traffic dispatch.
 */
export const orphanWreckOps = {
  _initOrphanWreck(ctx = {}) {
    this._orphanMemory = new Map();
    this._orphanTowMemory = new Map();
    this._orphanRow = null;
    this._orphanSectorEnteredAt = -1;
    if (this.bus && typeof this.bus.on === 'function' && !this._orphanInstalled) {
      this._orphanInstalled = true;
      this.bus.on('sector:enter', () => this._orphanOnSectorEnter());
      this.bus.on('sector:exit', () => this._orphanReset());
      this.bus.on('save:loaded', () => this._orphanReset());
    }
    attachTowWatch(this, 'orphan', () => this._orphanTowMemory);
  },

  _orphanOnSectorEnter() {
    this._orphanReset();
    this._orphanSectorEnteredAt = finite(this.state && this.state.simTime, 0);
  },

  _orphanReset() {
    this._orphanMemory = new Map();
    this._orphanRow = null;
  },

  _orphanTowMemoryMap() {
    if (!(this._orphanTowMemory instanceof Map)) this._orphanTowMemory = new Map();
    return this._orphanTowMemory;
  },

  _orphanEntities() {
    const entities = this.state && this.state.entities;
    if (!entities) return [];
    const out = [];
    if (typeof entities.values === 'function') { for (const e of entities.values()) out.push(e); }
    else if (Array.isArray(entities)) { for (const e of entities) out.push(e); }
    return out;
  },

  _orphanEntityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  _orphanSpawnWreck(state, now) {
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    const sectorId = (state.world && state.world.currentSectorId) || 's';
    const ang = (hash32(sectorId, 'orphanDrift', 'angle') % 6283) / 1000; // [0, 2π)
    const wreck = spawnEntity({
      type: 'cargo',
      pos: { x: Math.cos(ang) * 500, z: Math.sin(ang) * 500 },
      vel: { x: Math.cos(ang + Math.PI / 2) * ORPHAN_TUNING.driftSpeedWu, z: Math.sin(ang + Math.PI / 2) * ORPHAN_TUNING.driftSpeedWu },
      radius: ORPHAN_TUNING.wreckRadius,
      mass: ORPHAN_TUNING.wreckMass,
      physicsBody: { mass: ORPHAN_TUNING.wreckMass },
      hull: ORPHAN_TUNING.wreckHull,
      hullMax: ORPHAN_TUNING.wreckHull,
      ownerId: null,
      data: {
        orphanWreck: true,
        derelict: true,
        ownerId: null,
        masslineTetherable: true,
        tetherable: true,
        scanLabel: 'Ownerless wreck',
      },
    });
    if (wreck && wreck.id != null) {
      this._orphanRow = {
        wreckId: wreck.id,
        spawnedAt: now,
        arguedAt: -Infinity,
        claimedAt: -Infinity,
        claimedStationId: null,
        towLatchedAt: -Infinity,
        lastAt: now,
      };
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_ORPHAN_SPAWN_EVENT, { wreckId: wreck.id, t: now });
      }
    }
    return wreck;
  },

  _orphanStep(state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    const now = finite(state.simTime, 0);
    if (!this._orphanRow) {
      // One orphan per sector, scheduled sector-relative (never absolute simTime).
      if (this._orphanSectorEnteredAt >= 0
          && now - this._orphanSectorEnteredAt >= ORPHAN_TUNING.spawnDelayS) {
        this._orphanSpawnWreck(state, now);
      }
      return;
    }
    const wreck = this._orphanEntityById(this._orphanRow.wreckId);
    if (!wreck || wreck.alive === false) {
      this._orphanRow = null;
      return;
    }
    this._orphanRow.lastAt = now;

    // Track the player actually towing the wreck (real tether seams).
    if (towTargetIdOf(state, this._orphanTowMemoryMap(), now) === wreck.id) {
      this._orphanRow.towLatchedAt = now;
    }

    // The nearest town argues about it on open radio, once, after it has drifted a while.
    if (this._orphanRow.arguedAt < 0 && now - this._orphanRow.spawnedAt >= ORPHAN_TUNING.argumentAfterS) {
      this._orphanRow.arguedAt = now;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_ORPHAN_ARGUMENT_EVENT, { wreckId: wreck.id, t: now });
        for (let i = 0; i < ORPHAN_ARGUMENT_LINES.length; i += 1) {
          this.bus.emit('comms:popup', {
            id: `plants:pl198:argue:${i}`,
            sender: i === 0 ? 'DOCK CONTROL' : 'TUG CREW',
            category: 'traffic',
            text: ORPHAN_ARGUMENT_LINES[i],
            ttl: 6,
          });
        }
      }
    }

    // Towed to the dock BY THE PLAYER: three owners appear. Proximity alone is not the story —
    // the tow latch must be fresh (the player actually tethered this wreck).
    if (this._orphanRow.claimedAt < 0 && wreck.pos && Array.isArray(state.stations)) {
      const towFresh = Number.isFinite(this._orphanRow.towLatchedAt)
        && now - this._orphanRow.towLatchedAt <= ORPHAN_TUNING.towGraceS;
      if (towFresh) for (const station of state.stations) {
        if (!station || station.alive === false || !station.pos) continue;
        const sd = station.data || {};
        if (sd.isGate || sd.isWormhole) continue;
        const d = Math.hypot(finite(wreck.pos.x) - finite(station.pos.x), finite(wreck.pos.z) - finite(station.pos.z));
        if (d <= ORPHAN_TUNING.dockArriveRadiusWu) {
          this._orphanRow.claimedAt = now;
          this._orphanRow.claimedStationId = (sd.stationId) || station.id;
          if (this.bus && typeof this.bus.emit === 'function') {
            this.bus.emit(PLANTS_ORPHAN_OWNERS_EVENT, { wreckId: wreck.id, stationId: this._orphanRow.claimedStationId, owners: 3, t: now });
            for (let i = 0; i < 3; i += 1) {
              this.bus.emit('comms:popup', {
                id: `plants:pl198:owner:${i}`,
                sender: `OWNER ${i + 1}`,
                category: 'traffic',
                text: 'That is mine. Been mine.',
                ttl: 6,
              });
            }
            this.bus.emit('audio:cue', { id: 'confirm', position: { x: wreck.pos.x, z: wreck.pos.z }, gain: 0.6, rate: 1 });
          }
          break;
        }
      }
    }

    // After the owners appear, the claim is settled and the wreck leaves the lane.
    if (this._orphanRow.claimedAt >= 0 && now - this._orphanRow.claimedAt >= ORPHAN_TUNING.claimGraceS) {
      const removeEntity = this.helpers && this.helpers.removeEntity;
      if (typeof removeEntity === 'function') removeEntity(this._orphanRow.wreckId);
      this._orphanRow = null;
    }
  },

  /**
   * Per-hull hook from the traffic dispatch: everyone files around the orphan. Leases a short
   * avoidance beat; aborts silently when the lease is refused. Returns true only while this
   * hull's filing beat is being flown this tick.
   */
  _reactOrphanWreck(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    this._orphanStep(state, player);
    const row = this._orphanRow;
    if (!row) return false;
    if (!isOrphanFiler(e, rec, state)) return false;
    const wreck = this._orphanEntityById(row.wreckId);
    if (!wreck || !wreck.pos) return false;

    const now = finite(state.simTime, 0);
    const d = Math.hypot(finite(e.pos.x) - finite(wreck.pos.x), finite(e.pos.z) - finite(wreck.pos.z));
    if (d > ORPHAN_TUNING.fileAroundRadiusWu) {
      releaseTrafficReaction(this, e);
      return false;
    }

    const memRow = orphanRowFor(this._orphanMemory, e.id, now);
    if (!memRow) return false;
    memRow.lastAt = now;

    const filing = now - memRow.lastFileAt < ORPHAN_TUNING.fileDurationS;
    if (!filing && now - memRow.lastFileAt < ORPHAN_TUNING.hullFileCooldownS) return false;

    // Tangential avoidance: aim across the wreck's bow, not at it.
    const ax = finite(e.pos.x) - finite(wreck.pos.x);
    const az = finite(e.pos.z) - finite(wreck.pos.z);
    const side = (hash32(String(e.id), 'orphanSide', 'x') & 1) ? 1 : -1;
    const aim = Math.atan2(az, ax) + side * Math.PI / 3;
    const owned = requestTrafficReaction(this, e, {
      moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
    }, ORPHAN_TUNING.fileDurationS);
    if (!owned) return false; // refused: the hull keeps its own course, we abort

    memRow.lastFileAt = now;
    memRow.files += 1;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_ORPHAN_FILE_EVENT, { hullId: e.id, wreckId: wreck.id, files: memRow.files, t: now });
    }
    return true;
  },
};
