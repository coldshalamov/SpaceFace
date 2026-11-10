import { createBus } from '../../src/core/eventBus.js';
import { mulberry32, hash32 } from '../../src/core/rng.js';
import { asteroidSites } from '../../src/systems/asteroidSites.js';
import { tickAlienEcology, handleAlienEcologyEvent } from '../../src/systems/alienEcology.js';
import { materializeMachineLayer, tickMachineLayer } from '../../src/systems/precursorMachines.js';

export function siteRuntime(sectorId, { offset = { x: 0, z: 0 } } = {}) {
  const state = { meta: { seed: 4242 }, simTime: 0, tick: 0, mode: 'flight', timeScale: 1,
    entities: new Map(), entityList: [], playerId: 1, freeIds: [],
    player: { activeShipIndex: 0, ownedShips: [{ defId: 'ship_kestrel' }],
      cargo: { items: {}, capVolume: 500, capMass: 500, usedVolume: 0, usedMass: 0 } },
    world: { currentSectorId: sectorId, sectors: {} }, content: { commodities: [] } };
  const bus = createBus(), events = [], emit = bus.emit.bind(bus);
  bus.emit = (name, payload) => { events.push({ name, payload }); return emit(name, payload); };
  let nextId = 100;
  const helpers = { mulberry32, hash32, spawnEntity(spec) {
    const entity = { id: nextId++, alive: true, occupantGeneration: 1, flags: {}, rot: 0,
      vel: { x: 0, z: 0 }, ...spec, pos: { ...spec.pos }, data: { ...(spec.data || {}) } };
    state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
  }, removeEntity(id) { const entity = state.entities.get(id); if (entity) entity.alive = false; } };
  const world = { state, bus, helpers, active: { dressing: [], pois: [] },
    _toGlobal: p => ({ x: p.x + offset.x, z: p.z + offset.z }),
    _toLocal: p => ({ x: p.x - offset.x, z: p.z - offset.z }) };
  const system = Object.create(asteroidSites), registry = { get: name => name === 'world' ? world : name === 'asteroidSites' ? system : null };
  world.registry = registry;
  state.world.activeSector = world.active;
  system.init({ state, bus, helpers, registry });
  bus.on('ecology:evidence', payload => handleAlienEcologyEvent(world, 'ecology:evidence', payload));
  bus.on('sectorsim:impulse', payload => handleAlienEcologyEvent(world, 'sectorsim:impulse', payload));
  return { state, world, system, helpers, bus, events,
    materializeMachines() { materializeMachineLayer(world, { id: sectorId }, world.active); },
    playerAt(local) {
      let player = state.entities.get(1);
      if (!player) { player = { id: 1, alive: true, pos: {}, rot: 0, radius: 10, vel: { x: 0, z: 0 }, data: {} }; state.entities.set(1, player); }
      player.pos = world._toGlobal(local); return player;
    },
    action(siteId, verb, extra = {}) {
      bus.emit('siteEvidence:action', { siteId, verb, ...extra });
      return events.findLast(event => event.name === 'siteEvidence:result')?.payload;
    },
    step(dt = 0.1, { ecology = false } = {}) {
      if (state.timeScale === 0) return;
      state.simTime += dt; state.tick++;
      if (ecology) tickAlienEcology(world, dt);
      else tickMachineLayer(world, dt);
      system.update(dt, state);
    },
    seconds(seconds, options) { for (let i = 0; i < Math.ceil(seconds * 10); i++) this.step(0.1, options); },
  };
}
