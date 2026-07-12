import test from 'node:test';
import assert from 'node:assert/strict';

import { createCareerOriginsSystem } from '../src/careers/origins/careerOrigins.js';
import { ORIGIN_ROLE_KITS } from '../src/careers/origins/careerOriginContracts.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { save } from '../src/save/saveSystem.js';
import { makeShipEntitySpec, ships } from '../src/systems/ships.js';

const CAREERS = Object.freeze(['hauler', 'hunter', 'prospector']);

function makeHarness(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.moduleInventory = [];
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 100 };
  state.economy.markets = {
    station_helios: {
      cmdty_food: { stock: 80, lastMid: 18, lastBuy: 20, lastSell: 16 },
      cmdty_fuel_cells: { stock: 60, lastMid: 28, lastBuy: 30, lastSell: 26 },
    },
    station_coalition: {
      cmdty_food: { stock: 20, lastMid: 26, lastBuy: 28, lastSell: 24 },
    },
    station_ceres: {
      cmdty_fuel_cells: { stock: 15, lastMid: 38, lastBuy: 40, lastSell: 36 },
      cmdty_ore_iron: { stock: 20, lastMid: 34, lastBuy: 36, lastSell: 32 },
    },
    station_beltout: {
      cmdty_ore_iron: { stock: 80, lastMid: 24, lastBuy: 26, lastSell: 22 },
    },
  };

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

  const shipsRuntime = Object.create(ships);
  let nextMissionId = 1;
  const missions = {
    postAndAcceptAuthoredOffer(offer) {
      return { ok: true, offerId: offer.id, missionId: `m3_origin_${nextMissionId++}` };
    },
    serialize() {
      return { boards: {}, active: [], completedLog: [], nextId: nextMissionId, story: state.story };
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
  const world = {
    serialize() { return { currentSectorId: state.world.currentSectorId }; },
    deserialize(data = {}) { state.world.currentSectorId = data.currentSectorId || 'sector_helios_prime'; },
    enterSector(sectorId) { state.world.currentSectorId = sectorId; bus.emit('sector:enter', { sectorId }); },
  };
  const origins = createCareerOriginsSystem();
  const registry = {
    get(name) {
      return {
        ships: shipsRuntime,
        careerOrigins: origins,
        missions,
        world,
        economy: { serialize: () => ({}), deserialize() {} },
        economyContracts: { serialize: () => ({}), deserialize() {} },
        factions: { serialize: () => ({}), deserialize() {} },
        cargo: { recompute() {} },
        automation: { serialize: () => state.automation, deserialize(data) { state.automation = data || state.automation; } },
        crafting: { serialize: () => state.crafting, deserialize(data) { state.crafting = data || { queues: {} }; } },
        sectorSim: { serialize: () => state.sectorSim, deserialize(data) { state.sectorSim = data || state.sectorSim; } },
      }[name] || null;
    },
  };
  const ctx = { state, bus, helpers, registry };
  shipsRuntime.init(ctx);
  shipsRuntime.newGame();
  const owned = state.player.ownedShips[state.player.activeShipIndex];
  const playerEntity = helpers.spawnEntity(makeShipEntitySpec(owned.defId, {
    team: 0,
    isPlayer: true,
    player: state.player,
    fittings: owned.fittings,
  }));
  state.playerId = playerEntity.id;
  origins.init(ctx);

  return { state, bus, helpers, registry, ships: shipsRuntime, origins };
}

function withSaveRuntime(harness, fn) {
  save.init({
    state: harness.state,
    bus: harness.bus,
    helpers: harness.helpers,
    registry: harness.registry,
  });
  return fn();
}

for (const [index, careerId] of CAREERS.entries()) {
  test(`${careerId} origin uses real ships grant authority and survives real save load`, () => {
    const source = makeHarness(8300 + index);
    const grantedEvents = [];
    source.bus.on('module:granted', (payload) => grantedEvents.push(structuredClone(payload)));
    source.bus.emit('dock:docked', { stationId: 'station_helios' });

    const accepted = source.origins.accept(careerId);
    assert.equal(accepted.ok, true, `${careerId} origin accepts`);
    const kit = ORIGIN_ROLE_KITS[careerId];
    const inventoryItem = source.state.player.moduleInventory.find((item) => item.defId === kit.defId);
    assert.ok(inventoryItem, `${careerId} real ships authority grants ${kit.defId}`);
    assert.deepEqual(grantedEvents, [{
      defId: kit.defId,
      instanceId: inventoryItem.instanceId,
      reason: `career_origin:${careerId}:starter`,
    }]);

    const receipt = source.state.careers.origins.__meta.upgradeReceipts[careerId];
    assert.deepEqual(receipt, {
      defId: kit.defId,
      label: kit.label,
      grantedAtS: source.state.simTime,
      source: 'primary_origin_start',
    });

    const envelope = withSaveRuntime(source, () => save.serialize(`m3_${careerId}`));
    assert.equal(envelope.data.player.moduleInventory.some((item) => item.instanceId === inventoryItem.instanceId), true,
      `${careerId} inventory item is in the real save envelope`);
    assert.deepEqual(envelope.data.careerOrigins.origins.__meta.upgradeReceipts[careerId], receipt,
      `${careerId} receipt is in the real save envelope`);

    const restored = makeHarness(9300 + index);
    const loadErrors = [];
    restored.bus.on('save:error', (payload) => loadErrors.push(payload));
    const loaded = withSaveRuntime(restored, () => save.loadEnvelope(
      JSON.parse(JSON.stringify(envelope)),
      `m3_${careerId}`,
    ));
    assert.equal(loaded, true, `${careerId} real save envelope loads: ${JSON.stringify(loadErrors)}`);
    assert.deepEqual(
      restored.state.player.moduleInventory.find((item) => item.instanceId === inventoryItem.instanceId),
      inventoryItem,
      `${careerId} granted inventory instance survives Continue`,
    );
    assert.deepEqual(
      restored.state.careers.origins.__meta.upgradeReceipts[careerId],
      receipt,
      `${careerId} grant receipt survives Continue`,
    );
  });
}
