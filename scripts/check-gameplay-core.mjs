import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { save } from '../src/save/saveSystem.js';
import { cargo } from '../src/systems/cargo.js';
import { mining } from '../src/systems/mining.js';
import { combat } from '../src/systems/combat.js';
import { ships, buildSlotList } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';

function makeCargoState() {
  return {
    mode: 'flight',
    playerId: 1,
    simTime: 0,
    meta: { seed: 123, playtimeS: 0 },
    content: {},
    entities: new Map([[1, { id: 1, type: 'ship', alive: true }]]),
    entityList: [],
    player: {
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 10, capMass: 10 },
      moduleInventory: [],
    },
  };
}

function checkPickupSingleWriter() {
  const state = makeCargoState();
  const bus = createBus();
  const registry = { get: (name) => (name === 'cargo' ? cargo : null) };
  const ctx = { state, bus, helpers: {}, registry };

  mining.init(ctx);
  cargo.init(ctx);

  bus.emit('pickup:collected', {
    pickupId: 10,
    collectorId: state.playerId,
    kind: 'ore',
    amount: 1,
    commodityId: 'cmdty_ore_iron',
  });
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 1, 'mined pickup should be added once');

  const direct = mining._giveCargo('cmdty_ore_iron', 2, state.playerId);
  assert.equal(direct, 2, 'direct-to-cargo mining should use cargo system writer');
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 3, 'direct-to-cargo should not double add');

  bus.emit('pickup:collected', {
    pickupId: 11,
    collectorId: state.playerId,
    kind: 'module',
    amount: 2,
    commodityId: 'wpn_pulse_laser_s',
  });
  assert.equal(state.player.moduleInventory.length, 2, 'module pickups should enter module inventory');
}

function makeSaveState() {
  return {
    meta: { seed: 99, playtimeS: 5, createdAt: 'test' },
    save: { currentSlot: null },
    player: {
      credits: 0,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 10, capMass: 10 },
    },
    economy: {},
    factions: {},
    world: { currentSectorId: null, sectors: {} },
    missions: { boards: {}, active: [], completedLog: [], nextId: 1 },
    story: { beatIndex: 0 },
    automation: { drones: [], meta: {} },
    settings: {},
    entityList: [],
  };
}

function checkSaveDelegatesSystemHooks() {
  const state = makeSaveState();
  let missionPayload = null;
  let automationPayload = null;
  const systems = {
    economy: { serialize: () => ({}) },
    factions: { serialize: () => ({}) },
    world: { serialize: () => ({}) },
    missions: {
      serialize: () => ({
        boards: {},
        active: [{ id: 'm1', targetEntityIds: [], needsTargets: true }],
        completedLog: [],
        nextId: 2,
        story: { beatIndex: 1 },
      }),
      deserialize: (data) => { missionPayload = data; },
    },
    automation: {
      serialize: () => ({
        drones: [{ id: 'd1' }],
        meta: { rngSeed: 7 },
        nextId: 4,
      }),
      deserialize: (data) => {
        automationPayload = data;
        state.automation = { ...data, rng: () => 0.25 };
      },
    },
  };

  save.state = state;
  save.registry = { get: (name) => systems[name] || null };
  const data = save.serializeData();

  assert.equal(data.missions.nextId, 2, 'save should use missions.serialize');
  assert.equal(data.missions.missions, undefined, 'mission payload should not use legacy wrapper');
  assert.equal(data.automation.nextId, 4, 'save should use automation.serialize');

  save._restoreMissions({
    missions: { boards: { legacy: true }, active: [], completedLog: [], nextId: 9 },
    story: { beatIndex: 3 },
  });
  assert.equal(missionPayload.boards.legacy, true, 'legacy mission payload should be unwrapped');
  assert.equal(missionPayload.story.beatIndex, 3, 'legacy story payload should be preserved');

  save._restoreAutomation({ drones: [{ id: 'd2', entityIds: [99] }], meta: { rngSeed: 8 }, nextId: 5 });
  assert.equal(automationPayload.nextId, 5, 'automation restore should use automation.deserialize');
  assert.equal(typeof state.automation.rng, 'function', 'automation deserialize should rebuild rng function');
}

function checkCombatRewardsAndLootKinds() {
  const grants = [];
  const spawned = [];
  const events = [];
  const state = {
    playerId: 1,
    simTime: 42,
    entities: new Map(),
  };
  const killer = { id: 1, type: 'ship', team: 0, alive: true };
  const target = {
    id: 2,
    type: 'ship',
    team: 1,
    alive: true,
    factionId: 'faction_vael',
    pos: { x: 10, z: -5 },
    data: {
      bountyCr: 50,
      lootTableId: 'test_loot',
      shipClass: 'fighter',
      loot: {
        creditsRange: [7, 7],
        guaranteed: [{ id: 'wpn_pulse_laser_s', qtyRange: [1, 1] }],
      },
    },
  };
  state.entities.set(killer.id, killer);
  state.entities.set(target.id, target);

  combat.state = state;
  combat.bus = {
    emit(event, payload) {
      events.push({ event, payload });
      if (event === 'economy:grantCredits') grants.push(payload);
    },
  };
  combat.helpers = {
    spawnEntity(spec) {
      spawned.push(spec);
      return { id: 100 + spawned.length, ...spec };
    },
  };
  combat.rng = () => 0;

  combat.kill(target, killer.id);

  assert.equal(target.alive, false, 'killed target should be marked dead');
  assert(grants.some((g) => g.amount === 50 && g.reason === 'bounty'), 'authored bounty should pay out');
  assert(grants.some((g) => g.amount === 7 && g.reason === 'loot'), 'loot credits should still pay out');
  assert.equal(spawned[0].data.kind, 'module', 'weapon loot should spawn as module pickup');
  assert(events.some((e) => e.event === 'entity:killed' && e.payload.bountyCr === 50), 'kill event should carry bounty');
}

function checkFailedCargoFitDoesNotDuplicateModules() {
  const atlas = SHIPS.find((s) => s.id === 'ship_atlas');
  const slots = buildSlotList(atlas);
  const cargoSlotIndex = slots.findIndex((s) => s.type === 'cargo' && s.size === 'L');
  assert(cargoSlotIndex >= 0, 'atlas should have an L cargo slot');

  const fittings = new Array(slots.length).fill(null);
  fittings[cargoSlotIndex] = 'mod_cargo_compactor_l';
  const inventoryItem = { instanceId: 'mi_try_expander', defId: 'mod_cargo_expander_l' };
  const state = {
    playerId: 1,
    tick: 10,
    player: {
      ownedShips: [{ defId: 'ship_atlas', fittings }],
      activeShipIndex: 0,
      cargo: {
        items: { cmdty_silicate: 650 },
        usedVolume: 650,
        usedMass: 650,
        capVolume: 678,
        capMass: 999,
      },
      moduleInventory: [inventoryItem],
      researchedNodes: ['tech_bulk_logistics', 'tech_matter_compression'],
      efficiencyMods: { miningYieldMult: 1, shieldRegenMult: 1, energyRegenMult: 1, cargoCapMult: 1, tradeFeeMult: 1 },
    },
    entities: new Map(),
  };
  const events = [];

  ships.state = state;
  ships.bus = { emit: (event, payload) => events.push({ event, payload }) };

  const fitted = ships.fitModule({ slotIndex: cargoSlotIndex, instanceId: inventoryItem.instanceId });

  assert.equal(fitted, false, 'overflowing replacement fit should be rejected');
  assert.equal(fittings[cargoSlotIndex], 'mod_cargo_compactor_l', 'failed fit should restore the previous module');
  assert.deepEqual(state.player.moduleInventory, [inventoryItem], 'failed fit should restore inventory without duplicating the fitted module');
  assert(events.some((e) => e.event === 'toast' && e.payload.kind === 'error'), 'failed fit should notify the player');
}

checkPickupSingleWriter();
checkSaveDelegatesSystemHooks();
checkCombatRewardsAndLootKinds();
checkFailedCargoFitDoesNotDuplicateModules();

console.log('Core gameplay checks OK');
