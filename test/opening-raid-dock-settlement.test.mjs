import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { runtime as openingRaid } from '../src/data/encounters/344-opening-hauler-raid.js';
import { PRODUCTION_FEATURES, LEGACY47A_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';

const PLATE = 'cmdty_comp_hullplate';
function fixture(features) {
  const sim = createSimulation({ seed: 4242, systems: [cargo, economy] });
  sim.state.runtime = { ...(sim.state.runtime || {}), features };
  sim.state.mode = 'flight';
  sim.state.playerId = 1;
  return sim;
}
function defend(sim) {
  const live = { id: 'opening-rescue', phase: 'conflict', deadlineAt: 100, ids: [], roles: {},
    data: { freightCargoCustody: { terminal: true, raiderEscaped: false } } };
  const director = {
    aliveCount(_row, role) { return role === 'hauler' ? 1 : 0; },
    despawnAll() {},
    resolve(row, outcome) { row.phase = 'done'; row.outcome = outcome; },
    grant(amount, reason) { sim.bus.emit('economy:grantCredits', { amount, reason }); },
    rep() {}, emit(name, payload) { sim.bus.emit(name, payload); },
  };
  openingRaid.tick(director, live, sim.state, 20);
  assert.equal(live.outcome, 'defended');
}

test('opening rescue plate reaches the wallet on actual dock settlement with instance production features', () => {
  const prior = snapshotFeatureMaps();
  applyFeatureConfigToMaps(LEGACY47A_FEATURES);
  const sim = fixture(PRODUCTION_FEATURES);
  try {
    const start = sim.state.player.credits, sales = [];
    sim.bus.on('salvage:bayCashedIn', event => sales.push(event));
    defend(sim);
    assert.equal(sim.state.player.credits, start + 250);
    assert.equal(sim.state.player.salvageBay.items[PLATE], 1);
    sim.bus.emit('dock:docked', { stationId: 'station_helios' });
    assert.equal(sim.state.player.credits, start + 315, 'the dock cashes the promised plate for 65 credits');
    assert.equal(sim.state.player.salvageBay.items[PLATE], undefined);
    assert.deepEqual(sales.map(sale => sale.lots), [[{ commodityId: PLATE, qty: 1, credits: 65 }]]);
    sim.bus.emit('dock:docked', { stationId: 'station_helios' });
    assert.equal(sim.state.player.credits, start + 315, 'duplicate docking cannot pay the same plate twice');
    assert.equal(sales.length, 1);
  } finally { sim.dispose(); restoreFeatureMaps(prior); }
});

test('legacy instance cannot cash a bay merely because another runtime enables production features', () => {
  const prior = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const sim = fixture(LEGACY47A_FEATURES);
  try {
    const start = sim.state.player.credits;
    sim.state.player.salvageBay = { items: { [PLATE]: 1 }, usedVolume: .7 };
    sim.bus.emit('dock:docked', { stationId: 'station_helios' });
    assert.equal(sim.state.player.credits, start);
    assert.equal(sim.state.player.salvageBay.items[PLATE], 1, 'disabled owner preserves existing custody');
  } finally { sim.dispose(); restoreFeatureMaps(prior); }
});

for (const [label, features, globalFeatures, bayEnabled] of [
  ['production', PRODUCTION_FEATURES, LEGACY47A_FEATURES, true],
  ['legacy', LEGACY47A_FEATURES, PRODUCTION_FEATURES, false],
]) test(`${label} combat loot enters the same runtime-owned container that docking settles`, () => {
  const prior = snapshotFeatureMaps();
  applyFeatureConfigToMaps(globalFeatures);
  const sim = fixture(features);
  try {
    const pickup = { id: 2, type: 'pickup', alive: true, data: { combatLoot: true } };
    sim.state.entities.set(pickup.id, pickup);
    const receipt = { collectorId: sim.state.playerId, pickupId: pickup.id, kind: 'cargo', commodityId: PLATE, amount: 1 };
    sim.bus.emit('pickup:collected', receipt);
    assert.equal(receipt.acceptedAmount, 1);
    assert.equal(sim.state.player.salvageBay?.items?.[PLATE] || 0, bayEnabled ? 1 : 0);
    assert.equal(sim.state.player.cargo.items[PLATE] || 0, bayEnabled ? 0 : 1);
  } finally { sim.dispose(); restoreFeatureMaps(prior); }
});
