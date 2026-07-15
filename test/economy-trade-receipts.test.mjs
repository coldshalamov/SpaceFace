import assert from 'node:assert/strict';
import test from 'node:test';

import { economy, TRADE_LEDGER_MAX } from '../src/systems/economy.js';
import { save } from '../src/save/saveSystem.js';

function makeState(seed = 0x47a) {
  return {
    meta: { seed },
    simTime: 420,
    player: {
      cargo: { items: {}, capVolume: 40, capMass: 60 },
      stats: {},
      tradeLedger: [],
      tradeLots: {},
    },
  };
}

function makeEconomy(state, emitted = []) {
  return {
    ...economy,
    state,
    bus: { emit: (name, payload) => emitted.push({ name, payload }) },
    snapshotIntel() {},
  };
}

function record(system, state, overrides = {}) {
  return system.recordTradeLedger(
    state,
    overrides.stationId || 'station_helios',
    overrides.commodityId || 'cmdty_ore_iron',
    overrides.side || 'buy',
    overrides.qty || 2,
    overrides.unitAvg || 25,
    overrides.total || 50,
    { basePrice: 20 },
  );
}

test('identical same-tick trades receive distinct durable identities published on tradeCompleted', () => {
  const state = makeState();
  const emitted = [];
  const system = makeEconomy(state, emitted);

  system.afterTrade(state, 'station_helios', 'cmdty_ore_iron', 'buy', 2, 25, 50, 0, { basePrice: 20 }, null);
  system.afterTrade(state, 'station_helios', 'cmdty_ore_iron', 'buy', 2, 25, 50, 0, { basePrice: 20 }, null);

  const [newest, oldest] = state.player.tradeLedger;
  assert.equal(oldest.tradeSequence, 1);
  assert.equal(newest.tradeSequence, 2);
  assert.notEqual(newest.receiptId, oldest.receiptId);
  const events = emitted.filter((entry) => entry.name === 'economy:tradeCompleted');
  assert.deepEqual(events.map((entry) => entry.payload.receiptId), [oldest.receiptId, newest.receiptId]);
  assert.deepEqual(events.map((entry) => entry.payload.tradeSequence), [1, 2]);
});

test('trade receipt history stays capped while its occurrence sequence remains monotonic', () => {
  const state = makeState();
  const system = makeEconomy(state);

  for (let i = 0; i < TRADE_LEDGER_MAX + 3; i++) record(system, state);

  assert.equal(state.player.tradeLedger.length, TRADE_LEDGER_MAX);
  assert.equal(state.player.tradeReceiptSeq, TRADE_LEDGER_MAX + 3);
  assert.deepEqual(
    state.player.tradeLedger.map((entry) => entry.tradeSequence),
    Array.from({ length: TRADE_LEDGER_MAX }, (_, index) => TRADE_LEDGER_MAX + 3 - index),
  );
  assert.equal(new Set(state.player.tradeLedger.map((entry) => entry.receiptId)).size, TRADE_LEDGER_MAX);
});

test('player save round-trip preserves receipt identity and deterministic next occurrence', () => {
  const state = makeState(0xabc);
  const system = makeEconomy(state);
  record(system, state);
  record(system, state);

  const saveOwner = { ...save, state };
  const playerPayload = JSON.parse(JSON.stringify(saveOwner._serializePlayer()));
  const controlPayload = JSON.parse(JSON.stringify(playerPayload));
  const restoredState = makeState(0xabc);
  const restoreOwner = { ...save, state: restoredState };
  restoreOwner._restorePlayer(playerPayload);

  assert.deepEqual(restoredState.player.tradeLedger, state.player.tradeLedger);
  assert.equal(restoredState.player.tradeReceiptSeq, 2);

  const restoredNext = record(makeEconomy(restoredState), restoredState);
  const controlState = makeState(0xabc);
  ({ ...save, state: controlState })._restorePlayer(controlPayload);
  const controlNext = record(makeEconomy(controlState), controlState);
  assert.equal(restoredNext.tradeSequence, 3);
  assert.equal(restoredNext.receiptId, controlNext.receiptId);
  assert.notEqual(restoredNext.receiptId, state.player.tradeLedger[0].receiptId);
});
