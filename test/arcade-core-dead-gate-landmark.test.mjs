import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { DEAD_GATE } from '../src/data/deadGate.js';
import { frontierRumorOffer } from '../src/data/frontierRumors.js';
import { SECTORS } from '../src/data/sectors.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { scanner } from '../src/systems/scanner.js';
import { world } from '../src/systems/world.js';
import { buildSystemModel } from '../src/ui/galaxyMap.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';

function playerSpec() {
  return {
    type: 'ship', team: 0, collides: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 7, mass: 28, hull: 300, hullMax: 300,
    flags: { docked: false },
    physicsBody: {
      schemaVersion: 1, radius: 7, mass: 28, inertiaY: 240,
      dynamic: true, ccd: true, material: 'ship', revision: 0,
    },
    data: {},
  };
}

function boot(seed = 250025) {
  const sim = createSimulation({
    seed,
    systems: [cargo, economy, world, scanner, physics],
    updateOrder: [],
  });
  const owner = sim.registry.get('world');
  owner.newGame();
  const player = sim.spawn(playerSpec());
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.ui.docked = false;
  sim.state.input.actions = {};
  sim.state.player.credits = 2_000;
  sim.state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100,
  };
  return {
    sim,
    state: sim.state,
    bus: sim.bus,
    owner,
    scanner: sim.registry.get('scanner'),
    physics: sim.registry.get('physics'),
    player,
  };
}

function livePoi(state, poiId) {
  return state.entityList.find((entity) => entity && entity.alive !== false
    && entity.data && entity.data.poiId === poiId);
}

function liveRewards(state) {
  return state.entityList.filter((entity) => entity && entity.alive !== false
    && entity.data && entity.data.deadGateRewardSlotId);
}

function scanAndInvestigate(route) {
  const gate = livePoi(route.state, DEAD_GATE.poiId);
  route.player.pos.x = gate.pos.x - 70;
  route.player.pos.z = gate.pos.z;
  route.state.simTime = 15;
  route.scanner._pulse(route.state, route.player, route.state.simTime);
  const signal = route.state.signalInvestigation.records[DEAD_GATE.signalId];
  assert.equal(signal?.sourceId, DEAD_GATE.poiId);
  assert.equal(signal?.sourceKind, 'archive');
  assert.equal(signal?.manualInvestigation, true);
  route.bus.emit('signal:investigate', { signalId: DEAD_GATE.signalId });
  route.scanner._updateTrackedSignal(route.state);
  return gate;
}

function collect(route, pickup) {
  route.player.pos.x = pickup.pos.x;
  route.player.pos.z = pickup.pos.z;
  const before = route.state.player.cargo.items[pickup.data.commodityId] || 0;
  route.physics.collectPickups(route.state);
  const accepted = route.state.player.cargo.items[pickup.data.commodityId] || 0;
  assert.ok(accepted > before, 'the physical overlap reaches Cargo instead of writing the hold from World');
  return accepted - before;
}

test('the charted Dead Gate rumor resolves at one physical inert ring and releases finite tech material', () => {
  const route = boot();
  try {
    const sector = SECTORS.find((row) => row.id === DEAD_GATE.sectorId);
    const poi = sector?.pois.find((row) => row.id === DEAD_GATE.poiId);
    assert.ok(sector && poi);
    assert.equal(sector.charted, true);
    assert.deepEqual({ x: poi.pos.x, z: poi.pos.z }, DEAD_GATE.fixedLocalPos);
    assert.equal(buildSystemModel(route.state, DEAD_GATE.sectorId).points
      .some((point) => point.id === DEAD_GATE.poiId && point.name === 'The Dead Gate'), true,
    'charted space exposes the exact landmark on the ordinary system map before any rumor');

    const offer = frontierRumorOffer(route.state, DEAD_GATE.sourceStationId);
    assert.equal(offer?.id, DEAD_GATE.rumorId);
    assert.equal(offer?.targetId, DEAD_GATE.poiId);
    assert.match(offer?.text || '', /fifteenth carrier pulse|dead ring/i);
    const creditsBefore = route.state.player.credits;
    route.bus.emit('ui:purchaseFrontierRumor', {
      stationId: DEAD_GATE.sourceStationId,
      rumorId: DEAD_GATE.rumorId,
    });
    assert.ok(route.state.player.credits < creditsBefore, 'Economy owns the real bar-rumor debit');
    assert.equal(route.state.world.frontierRumors.byId[DEAD_GATE.rumorId]?.phase, 'rumored');

    route.owner.enterSector(DEAD_GATE.sectorId, { placePlayer: false });
    const gate = livePoi(route.state, DEAD_GATE.poiId);
    assert.ok(gate, 'ordinary Dione entry materializes the authored gate body');
    assert.equal(gate.data.placeId, 'place_gate_jump_ring');
    assert.equal(gate.data.isGate, undefined, 'the dead landmark never enters jump-gate authority');
    assert.equal(route.state.world.activeSector.gates.some((row) => row.id === gate.id), false);

    scanAndInvestigate(route);
    const discovery = route.state.world.discovery[DEAD_GATE.sectorId].pois[DEAD_GATE.poiId];
    assert.equal(discovery.deadGate.phase, 'recovered');
    assert.equal(route.state.world.frontierRumors.byId[DEAD_GATE.rumorId].phase, 'resolved');
    assert.equal(explorationDiscoveryPlates(route.state)
      .find((plate) => plate.poiId === DEAD_GATE.poiId)?.title, DEAD_GATE.storyTitle);
    assert.deepEqual(liveRewards(route.state).map((pickup) => pickup.data.commodityId).sort(),
      ['cmdty_quantum_cores', 'cmdty_salvage_electronics']);
    assert.equal(route.state.player.cargo.items.cmdty_quantum_cores || 0, 0,
      'investigation leaves material in world space');

    const core = liveRewards(route.state)
      .find((pickup) => pickup.data.commodityId === 'cmdty_quantum_cores');
    assert.equal(collect(route, core), 1);
    assert.equal(discovery.deadGate.rewards
      .find((slot) => slot.commodityId === 'cmdty_quantum_cores').remainingQty, 0);
  } finally {
    route.sim.dispose();
  }
});

test('World and Scanner Continue restore only the uncollected Dead Gate material', () => {
  const before = boot(250026);
  let worldSave;
  let scannerSave;
  let cargoSave;
  try {
    before.owner.enterSector(DEAD_GATE.sectorId, { placePlayer: false });
    scanAndInvestigate(before);
    const electronics = liveRewards(before.state)
      .find((pickup) => pickup.data.commodityId === 'cmdty_salvage_electronics');
    assert.equal(collect(before, electronics), 3);
    worldSave = structuredClone(before.owner.serialize());
    scannerSave = structuredClone(before.scanner.serialize());
    cargoSave = structuredClone(before.state.player.cargo);
  } finally {
    before.sim.dispose();
  }

  const after = boot(250026);
  try {
    after.state.player.cargo = cargoSave;
    after.owner.deserialize(worldSave);
    after.scanner.deserialize(scannerSave);
    after.owner.enterSector(DEAD_GATE.sectorId, { placePlayer: false });
    const rewards = liveRewards(after.state);
    assert.deepEqual(rewards.map((pickup) => pickup.data.commodityId), ['cmdty_quantum_cores'],
      'Continue rematerializes only the conserved uncollected slot');
    assert.equal(after.state.signalInvestigation.completed[DEAD_GATE.signalId]?.outcome, 'investigated');
    assert.equal(after.state.player.cargo.items.cmdty_salvage_electronics, 3);
    assert.equal(collect(after, rewards[0]), 1);
    const record = after.state.world.discovery[DEAD_GATE.sectorId].pois[DEAD_GATE.poiId].deadGate;
    assert.equal(record.phase, 'exhausted');
    assert.equal(after.owner._spawnDeadGateRewards(DEAD_GATE.sectorId).length, 0,
      'an exhausted gate cannot mint another reward body');
  } finally {
    after.sim.dispose();
  }
});
