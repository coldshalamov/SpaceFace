// Core system: owns the entity store + lifecycle, the per-step prelude (tick/time/snapshot),
// the end-of-step lifetime sweep, and the cross-cutting helpers exposed via ctx.helpers (§4.3).
import { makeEntity } from './entity.js';
import { mulberry32, hash32, wrapAngle } from './rng.js';

const DAY_SECONDS = 600; // 10 sim-minutes per in-game "day" (faction decay/conflict cadence)

export const core = {
  name: 'core',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._lastDay = 0;

    const state = this.state, bus = this.bus;

    const spawnEntity = (spec) => {
      const e = makeEntity(spec);
      const id = state.freeIds.length ? state.freeIds.pop() : state.nextEntityId++;
      e.id = id;
      state.entities.set(id, e);
      state.entityList.push(e);
      appendEntityIndex(state.entityIndex, e);
      bus.emit('entity:spawned', { id, type: e.type, entity: e });
      return e;
    };
    const getEntity = (id) => state.entities.get(id) || null;
    const removeEntity = (id) => { const e = state.entities.get(id); if (e) e.alive = false; };
    const queryRadius = (pos, r, out = []) => {
      out.length = 0;
      state.spatialHash.queryRadius(pos.x, pos.z, r, out);
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
    clearEntityIndex(index);
    for (const e of state.entityList) {
      e.prevPos.copy(e.pos);
      e.prevRot = e.rot;
      e.prevBank = e.bank;   // snapshot roll for renderer interpolation (Phase 1 banking)
      appendEntityIndex(index, e);
    }
    index.version++;
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
    if (state.spatialHash && typeof state.spatialHash.flushPerfCounters === 'function') {
      state.spatialHash.flushPerfCounters(state.perfRuntime);
    }
    this.bus.flush();
  },
};

function ensureEntityIndex(state) {
  if (state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1) return state.entityIndex;
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    version: 0,
    ready: false,
    ships: [],
    drones: [],
    shipLike: [],
    projectiles: [],
    pickups: [],
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
    byStationId: new Map(),
  };
  return state.entityIndex;
}

function clearEntityIndex(index) {
  if (!index || !index.__spacefaceEntityIndexV1) return;
  index.ships.length = 0;
  index.drones.length = 0;
  index.shipLike.length = 0;
  index.projectiles.length = 0;
  index.pickups.length = 0;
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
  index.byStationId.clear();
}

function appendEntityIndex(index, e) {
  if (!index || !index.__spacefaceEntityIndexV1 || !e || !e.alive) return;
  if (e.collides) index.collidables.push(e);

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
}
