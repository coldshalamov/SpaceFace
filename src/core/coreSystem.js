// Core system: owns the entity store + lifecycle, the per-step prelude (tick/time/snapshot),
// the end-of-step lifetime sweep, and the cross-cutting helpers exposed via ctx.helpers (§4.3).
import { allocateEntityId, makeEntity } from './entity.js';
import { isDynamicPhysicsBodyEntity, shouldSyncPhysicsBodyEntity } from './physicsAuthority.js';
import { mulberry32, hash32, wrapAngle } from './rng.js';
import { hasActiveSpatialHash } from './spatialQuery.js';
import { initializePresentationAdmission } from './presentationAdmission.js';

const DAY_SECONDS = 600; // 10 sim-minutes per in-game "day" (faction decay/conflict cadence)

export const core = {
  name: 'core',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.presentationJournal = ctx.presentationJournal || null;
    this._lastDay = 0;
    this._presentationPausedForDock = false;
    this._presentationJournalErrorCount = 0;
    if (Array.isArray(this._presentationJournalUnsubscribes)) {
      for (const unsubscribe of this._presentationJournalUnsubscribes) unsubscribe();
    }
    this._presentationJournalUnsubscribes = [];

    const state = this.state, bus = this.bus;
    const publishPresentation = (method, entity) => {
      const journal = this.presentationJournal;
      if (!journal || typeof journal[method] !== 'function') return 0;
      try {
        return journal[method](state.tick, entity);
      } catch (error) {
        this._presentationJournalErrorCount++;
        try { journal.requestRebuild?.('owner-publication-error'); } catch (_) { /* derived only */ }
        if (this._presentationJournalErrorCount <= 3) {
          console.error(`[core] presentation journal ${method} failed:`, error);
        }
        return 0;
      }
    };
    const requestPresentationRebuild = (reason) => {
      const journal = this.presentationJournal;
      if (!journal || typeof journal.requestRebuild !== 'function') return;
      try { journal.requestRebuild(reason); }
      catch (_) { this._presentationJournalErrorCount++; }
    };
    this._publishPresentation = publishPresentation;

    const spawnEntity = (spec) => {
      const index = ensureEntityIndex(state);
      reconcileEntityIndexSource(index, state.entityList);
      const e = makeEntity(spec);
      initializePresentationAdmission(e);
      const id = allocateEntityId(state);
      e.id = id;
      state.entities.set(id, e);
      state.entityList.push(e);
      appendEntityIndex(index, e);
      markEntityIndexSourceSynced(index, state.entityList);
      publishPresentation('recordSpawn', e);
      bus.emit('entity:spawned', { id, type: e.type, entity: e });
      return e;
    };
    const getEntity = (id) => state.entities.get(id) || null;
    const removeEntity = (id, opts) => {
      const e = state.entities.get(id);
      if (!e) return false;
      e.alive = false;
      if (opts && opts.immediate === true) {
        const hintedIndex = Number.isInteger(opts.index) ? opts.index : -1;
        const index = state.entityList[hintedIndex] === e
          ? hintedIndex
          : state.entityList.indexOf(e);
        if (index >= 0) this._removeEntityAtIndex(index, state, opts);
      }
      return true;
    };
    const queryRadius = (pos, r, out = []) => {
      out.length = 0;
      const hash = state.spatialHash;
      if (hasActiveSpatialHash(hash)) {
        hash.queryRadius(pos.x, pos.z, r, out);
      } else {
        const source = (state.entityIndex && state.entityIndex.collidables) || state.entityList;
        for (const e of source) {
          if (e && e.alive && e.collides) out.push(e);
        }
      }
      const r2 = r * r;
      let write = 0;
      for (let i = 0; i < out.length; i++) {
        const e = out[i];
        const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
        if (dx * dx + dz * dz <= r2) out[write++] = e;
      }
      out.length = write;
      return out;
    };
    const player = () => state.entities.get(state.playerId) || null;
    ensureEntityIndex(state);

    const markEntityVisualChanged = (entityOrId) => {
      const entity = typeof entityOrId === 'object'
        ? entityOrId
        : state.entities.get(entityOrId);
      return entity ? publishPresentation('recordVisual', entity) : 0;
    };
    Object.assign(ctx.helpers, {
      spawnEntity, getEntity, removeEntity, queryRadius, player,
      entityIndex: () => ensureEntityIndex(state),
      markEntityVisualChanged,
      mulberry32, hash32, wrapAngle,
    });
    this.helpers = ctx.helpers;

    this._presentationJournalUnsubscribes.push(
      // Force-kill command (missions/console).
      bus.on('entity:kill', ({ id, killerId }) => {
        const e = state.entities.get(id);
        if (e && e.alive) { e.alive = false; e._killerId = killerId; }
      }),
      bus.on('entity:spawnRequest', ({ spec }) => spawnEntity(spec)),
      bus.on('ship:appearanceChanged', ({ id }) => markEntityVisualChanged(id)),
      bus.on('save:restoring', () => requestPresentationRebuild('save-restoring')),
      // Continue restores simTime without reconstructing core. Re-anchor the day boundary so the
      // first preStep cannot invent a multi-day day:tick from _lastDay still sitting at 0.
      bus.on('save:loaded', () => {
        this.syncDayBoundaryFromSimTime(state);
        requestPresentationRebuild('save-loaded');
      }),
      bus.on('game:new', () => requestPresentationRebuild('game-new')),
      bus.on('game:newGame', () => requestPresentationRebuild('game-new')),
      bus.on('game:started', () => requestPresentationRebuild('game-started')),
    );
  },

  /**
   * Align the day-boundary cursor with the authoritative sim clock.
   * Used after Continue/load so restored simTime does not look like N days of elapsed time.
   */
  syncDayBoundaryFromSimTime(state = this.state) {
    if (!state) return;
    const day = Math.max(0, Math.floor((Number(state.simTime) || 0) / DAY_SECONDS));
    this._lastDay = day;
    state.days = day;
  },

  destroy() {
    if (Array.isArray(this._presentationJournalUnsubscribes)) {
      for (const unsubscribe of this._presentationJournalUnsubscribes) unsubscribe();
      this._presentationJournalUnsubscribes.length = 0;
    }
    this._publishPresentation = null;
    this.presentationJournal = null;
  },

  // Prelude: advance clocks and snapshot interpolation state. Called by registry.step().
  preStep(dt, state) {
    state.tick++;
    state.simTime += dt;
    state.meta.playtimeS += dt;
    const index = ensureEntityIndex(state);
    reconcileEntityIndexSource(index, state.entityList);
    refreshVolatileEntityIndex(index);
    const movables = index.movables;
    for (const e of movables) {
      if (!e || !e.alive) continue;
      if (isMovableEntity(e)) {
        e.prevPos.copy(e.pos);
        e.prevRot = e.rot;
        e.prevBank = e.bank;   // snapshot roll for renderer interpolation (Phase 1 banking)
        e.prevPitch = e.pitch; // snapshot pitch lean for renderer interpolation
      }
    }
    index.ready = true;
    const day = Math.floor(state.simTime / DAY_SECONDS);
    if (day !== this._lastDay) {
      const elapsed = day - this._lastDay;
      this._lastDay = day;
      state.days = day;
      // Forward boundaries notify consumers. A backward jump means the clock was reset (New Game)
      // while core kept the prior cursor — adopt silently instead of emitting a negative/zero catch-up.
      if (elapsed > 0) {
        this.bus.emit('day:tick', { days: day, elapsed });
      }
    }
  },

  _removeEntityAtIndex(i, state, opts) {
    const list = state.entityList;
    const e = list[i];
    if (!e) return false;
    e.alive = false;
    this._publishPresentation?.('recordDestroy', e);
    removeEntityIndex(state.entityIndex, e);
    const destroyed = {
      id: e.id,
      type: e.type,
      pos: { x: e.pos.x, z: e.pos.z },
      radius: e.radius,
      factionId: e.factionId,
    };
    if (opts && opts.reason) destroyed.reason = opts.reason;
    this.bus.queue('entity:destroyed', destroyed);
    state.entities.delete(e.id);
    state.freeIds.push(e.id);
    const last = list.pop();
    if (i < list.length) list[i] = last;
    if (opts && opts.immediate === true) markEntityIndexSourceSynced(state.entityIndex, list);
    return true;
  },

  // End-of-step: TTL/despawn, sweep dead entities, recycle ids, flush deferred events.
  lifetimeSweep(dt, state) {
    const docked = !!(state.ui && state.ui.docked);
    if (docked !== this._presentationPausedForDock) {
      this._presentationPausedForDock = docked;
      if (!docked) {
        const journal = this.presentationJournal;
        if (journal && typeof journal.requestRebuild === 'function') {
          try { journal.requestRebuild('undock-resume'); }
          catch (_) { this._presentationJournalErrorCount++; }
        }
      }
    }
    const list = state.entityList;
    // Tier-1 causal count: the sweep visits every entity once per tick. One hoisted boolean per
    // tick; the visit count itself is a length read, not a per-entity call.
    const tier1 = state.perfRuntime && state.perfRuntime.tier1;
    if (tier1 && tier1.isEnabled()) tier1.countEntityVisits(list.length, 'lifetime-sweep');
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      // Defeat leaves the current player dead on purpose (wreck / recovery latch). Recycle would
      // hand that id to the next projectile and make helpers.player() return the wrong object.
      if (e && e.id === state.playerId) {
        if (e.alive && !this._presentationPausedForDock && isMovableEntity(e)) {
          this._publishPresentation?.('recordTransformIfChanged', e);
        }
        continue;
      }
      if (e.alive && e.ttl !== Infinity) { e.ttl -= dt; if (e.ttl <= 0) e.alive = false; }
      if (e.alive && e.data && e.data.despawnAt != null && state.simTime >= e.data.despawnAt) e.alive = false;
      if (e.alive) {
        if (!this._presentationPausedForDock && isMovableEntity(e)) {
          this._publishPresentation?.('recordTransformIfChanged', e);
        }
        continue;
      }
      if (!e.alive) {
        this._removeEntityAtIndex(i, state);
      }
    }
    if (state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1) {
      markEntityIndexSourceSynced(state.entityIndex, list);
    }
    if (state.spatialHash && typeof state.spatialHash.flushPerfCounters === 'function') {
      state.spatialHash.flushPerfCounters(state.perfRuntime);
    }
    this.bus.flush();
  },
};

function ensureEntityIndex(state) {
  if (state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1) return repairEntityIndex(state.entityIndex);
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    version: 0,
    ready: false,
    ships: [],
    drones: [],
    shipLike: [],
    projectiles: [],
    pickups: [],
    payloads: [],
    movables: [],
    stations: [],
    dockStations: [],
    gates: [],
    asteroids: [],
    mineables: [],
    wrecks: [],
    statics: [],
    damageables: [],
    aiShips: [],
    weaponShips: [],
    collidables: [],
    spatialStatics: [],
    spatialDynamics: [],
    spatialStaticVersion: 0,
    physicsBodies: [],
    physicsStatics: [],
    physicsDynamics: [],
    physicsStaticVersion: 0,
    radarContacts: [],
    radarAsteroids: [],
    byStationId: new Map(),
    _indexedIds: new Set(),
    _sourceList: null,
    _sourceLength: -1,
  };
  return state.entityIndex;
}

function repairEntityIndex(index) {
  if (!index || !index.__spacefaceEntityIndexV1) return index;
  if (!Array.isArray(index.ships)) index.ships = [];
  if (!Array.isArray(index.drones)) index.drones = [];
  if (!Array.isArray(index.shipLike)) index.shipLike = [];
  if (!Array.isArray(index.projectiles)) index.projectiles = [];
  if (!Array.isArray(index.pickups)) index.pickups = [];
  if (!Array.isArray(index.payloads)) index.payloads = [];
  if (!Array.isArray(index.movables)) index.movables = [];
  if (!Array.isArray(index.stations)) index.stations = [];
  if (!Array.isArray(index.dockStations)) index.dockStations = [];
  if (!Array.isArray(index.gates)) index.gates = [];
  if (!Array.isArray(index.asteroids)) index.asteroids = [];
  if (!Array.isArray(index.mineables)) index.mineables = [];
  if (!Array.isArray(index.wrecks)) index.wrecks = [];
  if (!Array.isArray(index.statics)) index.statics = [];
  if (!Array.isArray(index.damageables)) index.damageables = [];
  if (!Array.isArray(index.aiShips)) index.aiShips = [];
  if (!Array.isArray(index.weaponShips)) index.weaponShips = [];
  if (!Array.isArray(index.collidables)) index.collidables = [];
  if (!Array.isArray(index.spatialStatics)) index.spatialStatics = [];
  if (!Array.isArray(index.spatialDynamics)) index.spatialDynamics = [];
  if (!Number.isFinite(index.spatialStaticVersion)) index.spatialStaticVersion = 0;
  if (!Array.isArray(index.physicsBodies)) index.physicsBodies = [];
  if (!Array.isArray(index.physicsStatics)) index.physicsStatics = [];
  if (!Array.isArray(index.physicsDynamics)) index.physicsDynamics = [];
  if (!Number.isFinite(index.physicsStaticVersion)) index.physicsStaticVersion = 0;
  if (!Array.isArray(index.radarContacts)) index.radarContacts = [];
  if (!Array.isArray(index.radarAsteroids)) index.radarAsteroids = [];
  if (!(index.byStationId instanceof Map)) index.byStationId = new Map();
  if (!(index._indexedIds instanceof Set)) {
    index._indexedIds = new Set();
    index.ready = false;
  }
  if (!('_sourceList' in index)) index._sourceList = null;
  if (!Number.isFinite(index._sourceLength)) index._sourceLength = -1;
  return index;
}

function clearEntityIndex(index) {
  if (!index || !index.__spacefaceEntityIndexV1) return;
  repairEntityIndex(index);
  index.ships.length = 0;
  index.drones.length = 0;
  index.shipLike.length = 0;
  index.projectiles.length = 0;
  index.pickups.length = 0;
  index.payloads.length = 0;
  index.movables.length = 0;
  index.stations.length = 0;
  index.dockStations.length = 0;
  index.gates.length = 0;
  index.asteroids.length = 0;
  index.mineables.length = 0;
  index.wrecks.length = 0;
  index.statics.length = 0;
  index.damageables.length = 0;
  index.aiShips.length = 0;
  index.weaponShips.length = 0;
  index.collidables.length = 0;
  index.spatialStatics.length = 0;
  index.spatialDynamics.length = 0;
  index.physicsBodies.length = 0;
  index.physicsStatics.length = 0;
  index.physicsDynamics.length = 0;
  index.radarContacts.length = 0;
  index.radarAsteroids.length = 0;
  index.byStationId.clear();
  index._indexedIds.clear();
}

function appendEntityIndex(index, e) {
  if (!index || !index.__spacefaceEntityIndexV1 || !e || !e.alive) return;
  if (e.id != null) {
    if (index._indexedIds.has(e.id)) return;
    index._indexedIds.add(e.id);
  }
  const movable = isMovableEntity(e);
  if (e.collides) {
    index.collidables.push(e);
    if (movable) {
      index.spatialDynamics.push(e);
    } else {
      index.spatialStatics.push(e);
      index.spatialStaticVersion++;
    }
  }
  if (shouldSyncPhysicsBodyEntity(e)) {
    index.physicsBodies.push(e);
    if (isDynamicPhysicsBodyEntity(e)) {
      index.physicsDynamics.push(e);
    } else {
      index.physicsStatics.push(e);
      index.physicsStaticVersion++;
    }
  }
  if (movable) index.movables.push(e);
  if (e.type !== 'projectile' && e.type !== 'fx'
      && e.type !== 'masslineSnare' && e.type !== 'masslineSnareAnchor') {
    if (e.type === 'asteroid') index.radarAsteroids.push(e);
    else index.radarContacts.push(e);
  }

  switch (e.type) {
    case 'ship':
      index.ships.push(e);
      index.shipLike.push(e);
      index.damageables.push(e);
      if (e.data && e.data.ai) index.aiShips.push(e);
      if (e.data && e.data.weapons && e.data.weapons.length) index.weaponShips.push(e);
      break;
    case 'drone':
      index.drones.push(e);
      index.shipLike.push(e);
      index.damageables.push(e);
      break;
    case 'projectile':
      index.projectiles.push(e);
      break;
    case 'pickup':
      index.pickups.push(e);
      break;
    case 'payload':
      index.payloads.push(e);
      break;
    case 'station': {
      index.stations.push(e);
      index.statics.push(e);
      index.damageables.push(e);
      const data = e.data || {};
      if (data.isGate) index.gates.push(e);
      else index.dockStations.push(e);
      if (data.stationId && !index.byStationId.has(data.stationId)) index.byStationId.set(data.stationId, e);
      break;
    }
    case 'asteroid':
      index.asteroids.push(e);
      index.statics.push(e);
      if (!(e.data && e.data.respawnAt != null)) index.mineables.push(e);
      break;
    case 'wreck':
      index.wrecks.push(e);
      index.mineables.push(e);
      break;
    case 'mine':
      // W03 physical mines: shootable (damageables) so clearing a wake is counterplay.
      index.damageables.push(e);
      break;
    case 'massSeed':
      // PQ-011 anchor seeds: damageable in every phase (counterplay — hostile fire and stray
      // blasts can destroy the anchor; there is no protected window).
      index.damageables.push(e);
      break;
    case 'fieldEmitter':
      // PQ-012 deployed Well/Repulsor devices: damageable so shooting one down unregisters its
      // field the same tick (counterplay + destruction cleanup). The Cone has no emitter entity.
      index.damageables.push(e);
      break;
    case 'masslineSnareAnchor':
      // PQ-030: visible snare endpoints are fixed ghost bodies but remain projectile-damageable;
      // destroying either endpoint cleanly breaks the authority-owned line.
      index.damageables.push(e);
      break;
  }
  index.version++;
}

function removeEntityIndex(index, e) {
  if (!index || !index.__spacefaceEntityIndexV1 || !e) return;
  repairEntityIndex(index);
  if (e.id != null && !index._indexedIds.has(e.id)) return;
  if (e.id != null) index._indexedIds.delete(e.id);
  removeFromIndexArray(index.collidables, e);
  const removedSpatialStatic = removeFromIndexArray(index.spatialStatics, e);
  removeFromIndexArray(index.spatialDynamics, e);
  removeFromIndexArray(index.physicsBodies, e);
  const removedPhysicsStatic = removeFromIndexArray(index.physicsStatics, e);
  removeFromIndexArray(index.physicsDynamics, e);
  removeFromIndexArray(index.movables, e);
  removeFromIndexArray(index.radarContacts, e);
  removeFromIndexArray(index.radarAsteroids, e);
  removeFromIndexArray(index.ships, e);
  removeFromIndexArray(index.drones, e);
  removeFromIndexArray(index.shipLike, e);
  removeFromIndexArray(index.projectiles, e);
  removeFromIndexArray(index.pickups, e);
  removeFromIndexArray(index.payloads, e);
  removeFromIndexArray(index.stations, e);
  removeFromIndexArray(index.dockStations, e);
  removeFromIndexArray(index.gates, e);
  removeFromIndexArray(index.asteroids, e);
  removeFromIndexArray(index.mineables, e);
  removeFromIndexArray(index.wrecks, e);
  removeFromIndexArray(index.statics, e);
  removeFromIndexArray(index.damageables, e);
  removeFromIndexArray(index.aiShips, e);
  removeFromIndexArray(index.weaponShips, e);
  if (e.type === 'station') {
    const stationId = e.data && e.data.stationId;
    if (stationId && index.byStationId.get(stationId) === e) {
      index.byStationId.delete(stationId);
      for (const station of index.stations) {
        if (station && station.alive && station.data && station.data.stationId === stationId) {
          index.byStationId.set(stationId, station);
          break;
        }
      }
    }
  }
  if (removedSpatialStatic) index.spatialStaticVersion++;
  if (removedPhysicsStatic) index.physicsStaticVersion++;
  index.version++;
}

function removeFromIndexArray(list, e) {
  if (!Array.isArray(list)) return;
  const i = list.indexOf(e);
  if (i >= 0) {
    list.splice(i, 1);
    return true;
  }
  return false;
}

function reconcileEntityIndexSource(index, list) {
  repairEntityIndex(index);
  if (index.ready && index._sourceList === list && index._sourceLength === list.length) return;
  clearEntityIndex(index);
  for (const e of list) appendEntityIndex(index, e);
  markEntityIndexSourceSynced(index, list);
  index.ready = true;
}

function markEntityIndexSourceSynced(index, list) {
  if (!index || !index.__spacefaceEntityIndexV1) return;
  index._sourceList = list;
  index._sourceLength = list.length;
}

function refreshVolatileEntityIndex(index) {
  index.aiShips.length = 0;
  index.weaponShips.length = 0;
  for (const e of index.ships) {
    if (!e || !e.alive || e.type !== 'ship') continue;
    if (e.data && e.data.ai) index.aiShips.push(e);
    if (e.data && e.data.weapons && e.data.weapons.length) index.weaponShips.push(e);
  }
}

function isMovableEntity(e) {
  // Keep render interpolation aligned with the physics authority. Wrecks and fracture chunks are
  // dynamic Rapier bodies; without a fresh previous pose, render alpha repeatedly pulls them back
  // toward their spawn pose and creates the characteristic object-width flicker.
  if (isDynamicPhysicsBodyEntity(e)) return true;
  switch (e.type) {
    case 'ship':
    case 'drone':
    case 'projectile':
    case 'pickup':
    case 'payload':
    case 'fx':
      return true;
    // PQ-011: a Mass Seed's Rapier body stays FIXED (physicsStatics), but the entity itself moves
    // kinematically during travel — and the spatial-hash STATIC layer caches positions by version,
    // so classing it static would leave it bucketed at its spawn point and unacquirable at its lock
    // point. Movable membership puts it in the incremental dynamic layer (rehash follows pos) and
    // earns prevPos snapshots so renderer interpolation doesn't judder the travel animation.
    case 'massSeed':
      return true;
    default:
      return false;
  }
}
