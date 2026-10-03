// NXI-106 — Preserve the exact accepted transaction quantity in the receipt.
// A partial fill has one consistent cargo, credit and receipt amount: execute() reports the
// accepted (not requested) quantity, moves exactly that cargo, settles exactly that credit
// delta, and every receipt (intent receipt + trade ledger) preserves the same numbers.
// A partial fill is a success, not a failure. Fixed seed; live owner end to end.
import test from 'node:test';
import assert from 'node:assert/strict';

import { economy } from '../src/systems/economy.js';

const SID = 'station_helios';
const IRON = 'cmdty_ore_iron';

function makeBus() {
  const handlers = new Map();
  return {
    on(e, h) { const l = handlers.get(e) || []; l.push(h); handlers.set(e, l); },
    off(e, h) { handlers.set(e, (handlers.get(e) || []).filter((x) => x !== h)); },
    emit(e, p) { for (const h of [...(handlers.get(e) || [])]) h(p); },
  };
}

function boot({ capVolume = 100, usedVolume = 20, credits = 100000, items = {} } = {}) {
  const state = {
    mode: 'flight', simTime: 100, meta: { seed: 83 },
    player: {
      credits,
      cargo: { items: { ...items }, capVolume, usedVolume },
      marketMemory: {}, tradeLedger: [], tradeLots: {},
    },
    economy: {},
    conflicts: {},
    sectorSim: { field: { nodes: {} } },
    world: { currentSectorId: 'sector_helios_prime', sectors: { sector_helios_prime: { owner: 'faction_scn' } } },
    ui: {}, nav: {}, entities: new Map(), entityList: [],
  };
  const econ = { ...economy };
  econ.init({ state, bus: makeBus(), helpers: {}, registry: { get: () => null } });
  econ.newGame();
  return { state, econ };
}

test('NXI-106: a partial buy fill keeps one consistent cargo, credit and receipt amount', () => {
  const { state, econ } = boot({ capVolume: 24, usedVolume: 20 });
  try {
    const creditsBefore = state.player.credits;
    const result = econ.execute(SID, IRON, 'buy', 10, { intentId: 'nxi106-partial-buy' });
    assert.ok(result.ok, 'a partial fill succeeds: ' + result.reason);
    assert.equal(result.qty, 4, 'the result reports the accepted quantity, not the request');
    const cargoDelta = state.player.cargo.items[IRON] || 0;
    const creditDelta = creditsBefore - state.player.credits;
    assert.equal(cargoDelta, result.qty, 'cargo gained exactly the accepted quantity');
    assert.equal(creditDelta, result.total, 'credits paid exactly the accepted total');
    assert.ok(result.receipt, 'the intent receipt is present');
    assert.equal(result.receipt.quantity, result.qty, 'the receipt quantity is the accepted amount');
    assert.equal(result.receipt.requestedQty, 10, 'the receipt keeps the request for intent dedup');
    assert.equal(result.receipt.total, result.total, 'the receipt total is what was charged');
    assert.equal(result.receipt.side, 'buy');
    assert.equal(Math.round(result.receipt.unitPrice * result.receipt.quantity), result.receipt.total,
      'unit price and quantity multiply back to the receipt total');
    const ledger = state.player.tradeLedger[0];
    assert.ok(ledger, 'the trade ledger recorded the fill');
    assert.equal(ledger.qty, result.qty, 'the ledger receipt records the accepted quantity');
    assert.equal(ledger.total, result.total, 'the ledger receipt total is the settled credit delta');
  } finally { economy._instance = null; }
});

test('NXI-106: replaying the partial-fill intent returns the same accepted receipt', () => {
  const { state, econ } = boot({ capVolume: 24, usedVolume: 20 });
  try {
    const first = econ.execute(SID, IRON, 'buy', 10, { intentId: 'nxi106-replay' });
    assert.ok(first.ok && first.qty === 4);
    const second = econ.execute(SID, IRON, 'buy', 10, { intentId: 'nxi106-replay' });
    assert.equal(second.duplicate, true, 'the replay is recognized');
    assert.equal(second.qty, first.qty, 'the replay reports the same accepted quantity');
    assert.equal(second.total, first.total, 'the replay reports the same settled total');
    assert.equal(second.receipt.quantity, first.receipt.quantity, 'the preserved receipt keeps the accepted amount');
    assert.equal((state.player.cargo.items[IRON] || 0), 4, 'no double fill');
  } finally { economy._instance = null; }
});

test('NXI-106: a partial sell fill settles exactly the units that left the hold', () => {
  const { state, econ } = boot({ items: { [IRON]: 6 }, usedVolume: 6 });
  try {
    const creditsBefore = state.player.credits;
    const result = econ.execute(SID, IRON, 'sell', 20, { intentId: 'nxi106-partial-sell' });
    assert.ok(result.ok, 'a partial sale succeeds: ' + result.reason);
    assert.equal(result.qty, 6, 'the result reports the units actually sold');
    assert.equal(state.player.cargo.items[IRON] || 0, 0, 'the hold emptied by exactly the result quantity');
    assert.equal(state.player.credits - creditsBefore, result.total, 'credits gained exactly the accepted total');
    assert.equal(result.receipt.quantity, 6, 'the intent receipt quantity is the accepted amount');
    assert.equal(result.receipt.requestedQty, 20);
    assert.equal(result.receipt.total, result.total);
    const ledger = state.player.tradeLedger[0];
    assert.ok(ledger, 'the trade ledger recorded the sale');
    assert.equal(ledger.qty, 6, 'the ledger quantity is the accepted amount');
    assert.equal(ledger.total, result.total, 'the ledger total is the credit delta');
  } finally { economy._instance = null; }
});

test('NXI-106: neighboring success — a full fill keeps receipt and settlement identical', () => {
  const { state, econ } = boot({ capVolume: 100, usedVolume: 20 });
  try {
    const creditsBefore = state.player.credits;
    const result = econ.execute(SID, IRON, 'buy', 5, { intentId: 'nxi106-full-buy' });
    assert.ok(result.ok, 'commit succeeds: ' + result.reason);
    assert.equal(result.qty, 5, 'the full request settles in full');
    assert.equal(state.player.cargo.items[IRON] || 0, 5);
    assert.equal(creditsBefore - state.player.credits, result.total);
    assert.equal(result.receipt.quantity, 5, 'the receipt quantity matches the accepted amount');
    assert.equal(result.receipt.requestedQty, 5);
    assert.equal(result.receipt.total, result.total);
  } finally { economy._instance = null; }
});
