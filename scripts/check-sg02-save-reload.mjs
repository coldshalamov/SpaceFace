import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { physics } from '../src/core/physics.js';
import { save } from '../src/save/saveSystem.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';

const DT = 1 / 60;

const source = makeHarness(0x470a);
source.state.mode = 'flight';
source.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
source.state.world.currentSectorId = 'sector_47a_mass_discrepancy';
source.state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: ['wpn_pulse_laser_s'] }];
source.state.player.activeShipIndex = 0;

const player = source.helpers.spawnEntity({
  type: 'ship',
  alive: true,
  collides: true,
  radius: 9,
  mass: 64,
  pos: { x: 47, z: -12 },
  vel: { x: 12, z: -3 },
  rot: 0.4,
  angVel: 0.73,
  hull: 91,
  shield: 23,
  cap: 41,
  flags: { persistent: true },
  data: { defId: 'ship_kestrel', combat: { targetId: 999, lockProgress: 0.4 } },
  physicsBody: {
    schemaVersion: 1,
    mass: 64,
    inertiaY: 128,
    radius: 9,
    dynamic: true,
    ccd: true,
    material: 'ship',
    revision: 5,
    thrusters: [
      { id: 'drive-port', health: 0.625, forward: 1, reverse: 0.8, strafe: 0.45, yaw: 0.8 },
      { id: 'drive-starboard', health: 1, forward: 1, reverse: 0.8, strafe: 0.45, yaw: 0.8 },
    ],
  },
});
source.state.playerId = player.id;

const saved = withSaveRuntime(source, () => save.serialize('sg02-dynamic'));
assert.equal(saved.version, CURRENT_VERSION, 'SG-02 dynamic saves should use the current save schema');
assert.equal(saved.data.settings.gameplay.physicsBackend, 'rapier-dynamic', 'save should preserve SG-02 dynamic backend selection');
assert.equal(saved.data.entities.player.angVel, 0.73, 'save should persist dynamic body yaw-rate');
assert.equal(saved.data.entities.player.physicsBody.revision, 5, 'save should persist dynamic body schema revision');
assert.equal(saved.data.entities.player.physicsBody.thrusters[0].health, 0.625, 'save should persist thruster damage state');

const restored = makeHarness(0x9999);
const ok = withSaveRuntime(restored, () => save.loadEnvelope(saved, 'sg02-dynamic'));
assert.equal(ok, true, 'SG-02 dynamic save envelope should load');
assert.equal(restored.state.settings.gameplay.physicsBackend, 'rapier-dynamic', 'load should not downgrade SG-02 dynamic backend');

const restoredPlayer = restored.state.entities.get(restored.state.playerId);
assert(restoredPlayer, 'load should restore a player entity');
assert.equal(restoredPlayer.pos.x, 47, 'load should restore player x after sector re-entry');
assert.equal(restoredPlayer.pos.z, -12, 'load should restore player z after sector re-entry');
assert.equal(restoredPlayer.vel.x, 12, 'load should restore player velocity after sector re-entry');
assert.equal(restoredPlayer.rot, 0.4, 'load should restore player heading after sector re-entry');
assert.equal(restoredPlayer.angVel, 0.73, 'load should restore player yaw-rate after sector re-entry');
assert.equal(restoredPlayer.physicsBody.mass, 64, 'load should restore authored dynamic body mass');
assert.equal(restoredPlayer.physicsBody.thrusters[0].health, 0.625, 'load should restore dynamic thruster health');

const physicsRuntime = Object.create(physics);
const physicsHelpers = {};
physicsRuntime.init({ state: restored.state, bus: restored.bus, helpers: physicsHelpers, registry: restored.registry });
physicsRuntime.update(DT, restored.state);
await physicsRuntime._sg02Init;
assert(physicsRuntime._sg02, 'loaded rapier-dynamic state should initialize the SG-02 body owner');

const rotBeforeStep = restoredPlayer.rot;
physicsRuntime.update(DT, restored.state);
assert.equal(restored.state.physicsRuntime.diagnostics.backend, 'rapier-dynamic', 'physics diagnostics should stay on SG-02 dynamic backend');
assert.equal(restored.state.physicsRuntime.diagnostics.sg02Ready, true, 'physics diagnostics should report SG-02 ready after reload');
assert(Math.abs(restoredPlayer.angVel - 0.73) < 1e-6, 'SG-02 body owner should seed from saved yaw-rate');
assert(restoredPlayer.rot > rotBeforeStep, 'SG-02 body owner should advance heading from saved yaw-rate');

physicsRuntime._disableSg02DynamicAuthority();

console.log('SG-02 save/reload checks OK');

function withSaveRuntime(harness, fn) {
  save.state = harness.state;
  save.bus = harness.bus;
  save.helpers = harness.helpers;
  save.registry = harness.registry;
  return fn();
}

function makeHarness(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_47a_mass_discrepancy';
  const bus = createBus();
  const helpers = {
    spawnEntity(spec = {}) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      bus.emit('entity:spawned', { id: entity.id, type: entity.type });
      return entity;
    },
    getEntity(id) {
      return state.entities.get(id) || null;
    },
  };

  const worldStub = {
    serialize() {
      return { currentSectorId: state.world.currentSectorId };
    },
    deserialize(data = {}) {
      state.world.currentSectorId = data.currentSectorId || 'sector_47a_mass_discrepancy';
    },
    enterSector(sectorId) {
      state.world.currentSectorId = sectorId;
      const player = state.entities.get(state.playerId);
      if (player) {
        player.pos.set(999, 0, 999);
        player.prevPos.copy(player.pos);
        player.vel.set(0, 0, 0);
        player.rot = -2;
        player.prevRot = -2;
        player.angVel = 0;
      }
      bus.emit('sector:enter', { sectorId });
    },
  };

  const missionsStub = {
    serialize() {
      return { boards: {}, active: [], completedLog: [], nextId: 1, story: state.story };
    },
    deserialize(data = {}) {
      state.missions.boards = data.boards || {};
      state.missions.active = Array.isArray(data.active) ? data.active : [];
      state.missions.completedLog = Array.isArray(data.completedLog) ? data.completedLog : [];
      state.missions.nextId = data.nextId || 1;
      if (data.story) state.story = data.story;
    },
    spawnTargetsForSector() {},
  };

  const registry = {
    get(name) {
      return {
        economy: { serialize: () => ({}), deserialize() {} },
        factions: { serialize: () => ({}), deserialize() {} },
        world: worldStub,
        ships: { recomputeActiveShip() {} },
        cargo: { recompute() {} },
        missions: missionsStub,
        automation: { serialize: () => state.automation, deserialize(data) { state.automation = data || state.automation; } },
        crafting: { serialize: () => state.crafting, deserialize(data) { state.crafting = data || { queues: {} }; } },
        sectorSim: { serialize: () => state.sectorSim, deserialize(data) { state.sectorSim = data || state.sectorSim; } },
      }[name] || null;
    },
  };

  return { state, bus, helpers, registry };
}
