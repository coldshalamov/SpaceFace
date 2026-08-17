import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { defaultLivingHull } from '../src/core/livingHull.js';
import { scanner } from '../src/systems/scanner.js';

function ship(id, overrides = {}) {
  const base = {
    id,
    type: 'ship',
    alive: true,
    team: 2,
    factionId: 'faction_dmc',
    pos: { x: 140, z: 0 },
    vel: { x: 0, z: 0 },
    data: {},
  };
  return {
    ...base,
    ...overrides,
    pos: { ...base.pos, ...(overrides.pos || {}) },
    data: { ...base.data, ...(overrides.data || {}) },
  };
}

function route({ registryName = null, livingHull = defaultLivingHull(0), factionId = 'faction_dmc' } = {}) {
  const target = ship('worker', {
    factionId,
    data: {
      trafficRole: 'miner',
      callsign: 'COPPER WAKE',
      jobId: 'job:copper-wake',
      jobPhase: 'work',
      ai: { passive: true },
    },
  });
  const player = ship('player', {
    team: 1,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
    data: { defId: 'ship_kestrel' },
  });
  const owned = { defId: 'ship_kestrel', fittings: [], livingHull };
  if (registryName) owned.registryName = registryName;
  const state = {
    mode: 'flight',
    simTime: 2400,
    tick: 144000,
    playerId: player.id,
    player: {
      team: 1,
      targetId: target.id,
      credits: 5000,
      heat: 0,
      activeShipIndex: 0,
      ownedShips: [owned],
      cargo: { items: {} },
      moduleInventory: [],
    },
    entities: new Map([[player.id, player], [target.id, target]]),
    entityList: [player, target],
    input: { actions: {} },
    ui: { docked: false },
    world: { currentSectorId: 'sector_test', scanPings: {} },
    factions: {},
    traffic: { freighters: [] },
    pirateParley: { squads: {} },
  };
  const bus = createBus();
  const offers = [];
  bus.on('contactHail:offer', (payload) => offers.push(structuredClone(payload)));
  const system = Object.create(scanner);
  system.init({ state, bus });
  return { state, bus, system, target, offers };
}

function request(harness) {
  harness.bus.emit('contactHail:request', { targetId: harness.target.id, source: 'plan44' });
  return harness.offers.at(-1);
}

test('ordinary physical Hails recognize a filed ship name and its durable visible history', () => {
  const clean = route({ registryName: 'Dead Reckoning' });
  try {
    assert.deepEqual(request(clean).lines, [
      'COPPER WAKE · WORKING TRAFFIC',
      'REGISTRY DEAD RECKONING CONFIRMED.',
    ]);
  } finally {
    clean.system.destroy();
  }

  const history = {
    ...defaultLivingHull(0),
    killTally: 5,
    repairPatches: 2,
    heatScorch: 1,
    updatedAtT: 2300,
  };
  const marked = route({ registryName: 'Dead Reckoning', livingHull: history });
  const before = structuredClone(marked.state.player.ownedShips[0]);
  try {
    assert.deepEqual(request(marked).lines, [
      'COPPER WAKE · WORKING TRAFFIC',
      "DEAD RECKONING · THAT HULL'S SEEN WORK.",
    ]);
    assert.deepEqual(marked.state.player.ownedShips[0], before,
      'the Hail presenter reads Ships/Living Hull truth without becoming a writer');
  } finally {
    marked.system.destroy();
  }

  const concord = route({ registryName: 'Dead Reckoning', livingHull: history, factionId: 'faction_scn' });
  try {
    assert.equal(request(concord).lines[1], 'DEAD RECKONING · DAMAGE HISTORY ON FILE.');
  } finally {
    concord.system.destroy();
  }

  const unnamed = route({ livingHull: history });
  try {
    assert.equal(request(unnamed).lines[1], "THAT HULL'S SEEN WORK.");
  } finally {
    unnamed.system.destroy();
  }
});
