// Core system: owns the entity store + lifecycle, the per-step prelude (tick/time/snapshot),
// the end-of-step lifetime sweep, and the cross-cutting helpers exposed via ctx.helpers (§4.3).
import { makeEntity } from './entity.js';
import { isDynamicPhysicsBodyEntity, shouldSyncPhysicsBodyEntity } from './physicsAuthority.js';
import { mulberry32, hash32, wrapAngle } from './rng.js';
import { hasActiveSpatialHash } from './spatialQuery.js';

const DAY_SECONDS = 600; // 10 sim-minutes per in-game "day" (faction decay/conflict cadence)

export const core = {
  name: 'core',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._lastDay = 0;

    const state = this.state, bus = this.bus;

    const spawnEntity = (spec) => {
      const index = ensureEntityIndex(state);
      reconcileEntityIndexSource(index, state.entityList);
      const e = makeEntity(spec);
      const id = state.freeIds.length ? state.freeIds.pop() : state.nextEntityId++;
      e.id = id;
      state.entities.set(id, e);
      state.entityList.push(e);
      appendEntityIndex(index, e);
      markEntityIndexSourceSynced(index, state.entityList);
      bus.emit('entity:spawned', { id, type: e.type, entity: e });
      return e;
    };
    const getEntity = (id) => state.entities.get(id) || null;
    const removeEntity = (id) => { const e = state.entities.get(id); if (e) e.alive = false; };
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

    Object.assign(ctx.helpers, {
      spawnEntity, getEntity, removeEntity, queryRadius, player,
      entityIndex: () => ensureEntityIndex(state),
      mulberry32, hash32, wrapAngle,
    });
    this.helpers = ctx.helpers;

    // force-kill (missions/console)
    bus.on('entity:kill', ({ id, killerId }) => {
      const e = state.entities.get(id);
      if (e && e.alive) { e.alive = false; e._killerId = killerId; }
    });
    bus.on('entity:spawnRequest', ({ spec }) => spawnEntity(spec));
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
      }
    }
    index.ready = true;
    const day = Math.floor(state.simTime / DAY_SECONDS);
    if (day !== this._lastDay) {
      const elapsed = day - this._lastDay;
      this._lastDay = day; state.days = day;
      this.bus.emit('day:tick', { days: day, elapsed });
    }
  },

  // End-of-step: TTL/despawn, sweep dead entities, recycle ids, flush deferred events.
  lifetimeSweep(dt, state) {
    const list = state.entityList;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.alive && e.ttl !== Infinity) { e.ttl -= dt; if (e.ttl <= 0) e.alive = false; }
      if (e.alive && e.data && e.data.despawnAt != null && state.simTime >= e.data.despawnAt) e.alive = false;
      if (!e.alive) {
        removeEntityIndex(state.entityIndex, e);
        this.bus.queue('entity:destroyed', {
          id: e.id, type: e.type, pos: { x: e.pos.x, z: e.pos.z }, radius: e.radius, factionId: e.factionId,
        });
        state.entities.delete(e.id);
        state.freeIds.push(e.id);
        // swap-remove
        const last = list.pop();
        if (i < list.length) list[i] = last;
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
  if (e.type !== 'projectile' && e.type !== 'fx') {
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
  switch (e.type) {
    case 'ship':
    case 'drone':
    case 'projectile':
    case 'pickup':
    case 'payload':
    case 'fx':
      return true;
    default:
      return false;
  }
}
