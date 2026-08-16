import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { cargo } from '../src/systems/cargo.js';
import {
  appendLootHistoryEntry,
  LOOT_HISTORY_LIMIT,
  lootHistoryEnabled,
  normalizeLootHistoryEntry,
} from '../src/ui/lootHistory.js';

function route() {
  const state = createGameState(54);
  state.playerId = 1;
  state.simTime = 12.5;
  state.player.cargo.capVolume = 5;
  state.player.cargo.usedVolume = 0;
  state.player.cargo.usedMass = 0;
  state.player.cargo.items = {};
  state.player.moduleInventory = [];
  const bus = createBus();
  const collected = [];
  bus.on('loot:collected', (payload) => collected.push(payload));
  cargo.init({ state, bus, helpers: {} });
  return { state, bus, collected };
}

test('Plan54 loot history is default-hidden and formats finalized pickups', () => {
  const state = createGameState(54);
  assert.equal(lootHistoryEnabled(state), false, 'new careers keep the side log dismissed by default');
  state.settings.showLootHistory = true;
  assert.equal(lootHistoryEnabled(state), true, 'the explicit setting enables the side log');

  const entry = normalizeLootHistoryEntry({
    kind: 'cargo',
    commodityId: 'cmdty_ore_iron',
    amount: 3,
    simTime: 9,
  }, state);
  assert.equal(entry.label, '+3 Iron Ore');
  assert.equal(entry.detail, 'Cargo hold');
});

test('Plan54 loot history receives only accepted cargo/module pickup receipts', () => {
  const run = route();
  run.bus.emit('pickup:collected', {
    collectorId: 1,
    pickupId: 7,
    kind: 'cargo',
    commodityId: 'cmdty_ore_iron',
    amount: 8,
    simTime: 12.5,
  });

  assert.equal(run.state.player.cargo.items.cmdty_ore_iron, 5, 'cargo writer clamps to the real hold cap');
  assert.equal(run.collected.length, 1);
  assert.equal(run.collected[0].amount, 5, 'history receipt uses acceptedAmount, not requested amount');

  run.bus.emit('pickup:collected', {
    collectorId: 1,
    pickupId: 8,
    kind: 'cargo',
    commodityId: 'cmdty_ore_iron',
    amount: 1,
    simTime: 13,
  });
  assert.equal(run.collected.length, 1, 'fully rejected cargo does not create a fake history row');

  run.bus.emit('pickup:collected', {
    collectorId: 1,
    pickupId: 9,
    kind: 'module',
    commodityId: 'mod_pd_laser',
    amount: 2,
    simTime: 14,
  });
  assert.equal(run.state.player.moduleInventory.length, 2);
  assert.equal(run.collected.length, 2);
  assert.equal(run.collected[1].kind, 'module');
  assert.equal(run.collected[1].amount, 2);

  const rows = run.collected
    .map((payload) => normalizeLootHistoryEntry(payload, run.state))
    .reduce((entries, entry) => appendLootHistoryEntry(entries, entry), []);
  assert.equal(rows[0].label, 'Module acquired · mod_pd_laser');
  assert.equal(rows[1].label, '+5 Iron Ore');
});

test('Plan54 loot history caps the session side log without touching cargo state', () => {
  let entries = [];
  for (let i = 0; i < LOOT_HISTORY_LIMIT + 3; i++) {
    entries = appendLootHistoryEntry(entries, {
      id: `cargo:${i}`,
      kind: 'cargo',
      qty: 1,
      name: `Cargo ${i}`,
      label: `+1 Cargo ${i}`,
      detail: 'Cargo hold',
      simTime: i,
    });
  }

  assert.equal(entries.length, LOOT_HISTORY_LIMIT);
  assert.equal(entries[0].label, `+1 Cargo ${LOOT_HISTORY_LIMIT + 2}`);
  assert.equal(entries.at(-1).label, '+1 Cargo 3');
});
