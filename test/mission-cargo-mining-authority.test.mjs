import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { cargo as cargoPrototype, addCargo } from '../src/systems/cargo.js';
import { economy as economyPrototype } from '../src/systems/economy.js';
import { drill as drillPrototype } from '../src/systems/drill.js';
import { mining as miningPrototype } from '../src/systems/mining.js';
import { missions as missionsPrototype } from '../src/systems/missions.js';

const ORE = 'cmdty_ore_iron';

function harness(t) {
  const state = createGameState(47);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.world.currentSectorId = 'sector_helios_prime';
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 80 };
  state.story.beatIndex = 8;
  const bus = createBus();
  const owners = new Map();
  const helpers = { hash32, mulberry32, spawnEntity: () => null };
  const registry = { get: (name) => owners.get(name) || null };
  for (const prototype of [cargoPrototype, economyPrototype, missionsPrototype, miningPrototype, drillPrototype]) {
    const system = Object.create(prototype);
    owners.set(prototype.name, system);
    system.init({ state, bus, helpers, registry });
  }
  t.after(() => {
    owners.get('cargo').destroy();
    bus.clear();
  });
  const completions = [];
  const deliveries = [];
  bus.on('mission:completed', (payload) => completions.push(payload));
  bus.on('cargo:delivered', (payload) => deliveries.push(payload));
  return { state, bus, owners, completions, deliveries };
}

function accept(h, id, fields = {}) {
  const offer = {
    id,
    type: 'cargo_delivery',
    stationId: 'station_helios',
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt',
    title: id,
    reward_cr: 100,
    collateral_cr: 0,
    duration_s: 1000,
    riskTier: 0,
    params: { cmdtyId: ORE, qty: 5 },
    ...fields,
  };
  h.state.missions.boards.station_helios ||= { refreshEpoch: 0, slots: [] };
  h.state.missions.boards.station_helios.slots.push(offer);
  h.bus.emit('ui:acceptMission', { missionId: offer.id });
  const mission = h.state.missions.active.find((row) => row.sourceOfferId === id);
  assert.ok(mission, 'the public accept intent should create the contract');
  return mission;
}

test('live NPC ore release cannot advance or pay the player mining quota', (t) => {
  const h = harness(t);
  const mission = accept(h, 'quota', { type: 'mining_quota' });
  const mining = h.owners.get('mining');
  const rock = { id: 9, type: 'asteroid', alive: true, pos: { x: 20, z: 0 }, radius: 6, data: {} };
  const npc = { id: 77, data: {} };
  const player = { id: h.state.playerId, data: { miningBeam: { directToCargo: true } } };
  const creditsBefore = h.state.player.credits;
  const release = (miner, qty) => mining._releaseOre(rock, { oreTable: { [ORE]: 1 } }, qty, miner);

  release(npc, 5);
  assert.equal(mission.objectiveProgress, 0, 'ambient cutters must not fulfill the player contract');
  assert.equal(h.state.player.credits, creditsBefore);
  assert.equal(h.completions.length, 0);
  release(null, 5);
  assert.equal(mission.objectiveProgress, 0, 'unattributed world extraction is not player work');

  release(player, 3);
  assert.equal(mission.objectiveProgress, 3);
  release(npc, 2);
  assert.equal(mission.objectiveProgress, 3);
  release(player, 2);
  assert.equal(mission.status, 'completed');
  assert.equal(h.state.player.credits, creditsBefore + 100);
  assert.equal(h.completions.filter((row) => row.missionId === mission.id).length, 1);
});

test('ore actually granted by the deep-core Drill fulfills the player mining quota', (t) => {
  const h = harness(t);
  const mission = accept(h, 'deep-core-quota', { type: 'mining_quota' });
  const creditsBefore = h.state.player.credits;
  h.state.entities.set(9, {
    id: 9, type: 'asteroid', alive: true, pos: { x: 20, z: 0 },
    data: { yieldU: 20, drillYieldMax: 20, drillDepletion: 0 },
  });
  const drill = h.owners.get('drill');
  assert.equal(drill.begin(9), true);
  const d = h.state.drill;
  const col = d.avatar.col;
  const row = d.avatar.row + 1;
  d.field[col][row] = {
    type: 'vein', hp: 0.01, maxHp: 5, ore: ORE, yieldU: 5,
    hazard: false, tierReq: 1, hardness: 1,
  };
  for (let i = 0; i < 40 && !h.state.player.cargo.items[ORE]; i++) {
    drill.tickInput({ down: true }, 1 / 60);
  }
  assert.equal(h.state.player.cargo.items[ORE], 5, 'the Drill must grant the ore before progress');
  assert.equal(mission.status, 'completed', 'real deep-core extraction fulfills Mine 5u iron');
  assert.equal(h.state.player.credits, creditsBefore + 100);
  assert.equal(h.completions.filter((receipt) => receipt.missionId === mission.id).length, 1);
  drill.end();
});

test('ordinary delivery leaves another destination contract sealed and usable', (t) => {
  const h = harness(t);
  const sealed = accept(h, 'sealed', {
    preloadedCargo: true,
    destStationId: 'station_tycho',
    destSectorId: 'sector_lumen_reach',
    params: { cmdtyId: ORE, qty: 6 },
  });
  const ordinary = accept(h, 'ordinary');
  const creditsBefore = h.state.player.credits;

  h.bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(ordinary.status, 'active', 'a delivery cannot spend a sibling sealed manifest');
  assert.equal(h.state.player.cargo.items[ORE], 6);
  assert.equal(h.state.player.credits, creditsBefore);
  assert.equal(h.deliveries.length, 0);

  assert.equal(addCargo(h.state, ORE, 5), 5);
  h.bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(ordinary.status, 'completed');
  assert.equal(h.state.player.cargo.items[ORE], 6);
  assert.equal(sealed.params.sealedRemaining, 6);

  h.bus.emit('dock:docked', { stationId: 'station_tycho' });
  h.bus.emit('dock:docked', { stationId: 'station_tycho' });
  assert.equal(sealed.status, 'completed');
  assert.equal(h.state.player.cargo.items[ORE], undefined);
  assert.equal(h.state.player.credits, creditsBefore + 200);
  assert.deepEqual(h.deliveries.map((row) => row.qty), [5, 6]);
});

test('partial salvage recovery pays only for free units beside another sealed manifest', (t) => {
  const h = harness(t);
  const sealed = accept(h, 'sealed', {
    preloadedCargo: true,
    destStationId: 'station_tycho',
    params: { cmdtyId: ORE, qty: 6 },
  });
  const recovery = accept(h, 'recovery', { type: 'salvage_retrieval' });
  recovery.mutationTag = 'salvage';
  recovery.mutatedFromMissionId = 'lost_escort';
  assert.equal(addCargo(h.state, ORE, 2), 2);
  const creditsBefore = h.state.player.credits;

  h.bus.emit('dock:docked', { stationId: 'station_ceres' });
  h.bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(recovery.status, 'completed');
  assert.equal(recovery.params.completionMethod, 'partial_recovery');
  assert.equal(h.state.player.credits, creditsBefore + 40);
  assert.equal(h.state.player.cargo.items[ORE], 6);
  assert.equal(sealed.params.sealedRemaining, 6);
  assert.deepEqual(h.deliveries.map((row) => row.qty), [2]);
});
