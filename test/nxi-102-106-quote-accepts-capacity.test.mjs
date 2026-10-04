// NXI-102 — a nearly full hold cannot preview a fractional unit the commit rejects or
// overcharges: quote() names the accepted quantity on the same whole-unit capacity rule the
// settlement uses, priced on the same curve.
// NXI-106 — a partial fill has one consistent cargo, credit and receipt amount: execute()
// reports the accepted (not requested) quantity, and the intent receipt preserves both.
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

test('NXI-102: a nearly full hold previews the accepted whole units, not the request', () => {
  // Iron occupies 1 vol/unit; four free units of hold mean the commit can only accept 4.
  const { econ } = boot({ capVolume: 24, usedVolume: 20 });
  try {
    const q = econ.quote(SID, IRON, 'buy', 10);
    assert.ok(q.ok, 'quote works: ' + q.reason);
    assert.equal(q.qty, 10, 'the market answer stays the book-side amount for intel reads');
    assert.equal(q.acceptQty, 4, 'accepted quantity is bound by the same whole-unit hold rule');
    assert.equal(q.holdLimited, true, 'the preview flags the capacity bind');
    assert.ok(q.acceptTotal > 0 && q.acceptTotal < q.total, 'accepted total prices the accepted lot');
  } finally { economy._instance = null; }
});

test('NXI-102: quote and settlement agree on the accepted amount and price', () => {
  const { state, econ } = boot({ capVolume: 24, usedVolume: 20 });
  try {
    const q = econ.quote(SID, IRON, 'buy', 10);
    const result = econ.execute(SID, IRON, 'buy', 10);
    assert.ok(result.ok, 'commit succeeds: ' + result.reason);
    assert.equal(result.qty, q.acceptQty, 'the commit accepts exactly the previewed quantity');
    assert.equal(result.total, q.acceptTotal, 'the commit charges the accepted-total the quote named');
    assert.equal(state.player.cargo.items[IRON], 4, 'cargo gains the accepted amount');
  } finally { economy._instance = null; }
});

test('NXI-102: a hold with no room previews zero accepted, and a roomy hold is untouched', () => {
  const { econ } = boot({ capVolume: 20, usedVolume: 20 });
  try {
    const q = econ.quote(SID, IRON, 'buy', 5);
    assert.ok(q.ok, 'quote still answers: ' + q.reason);
    assert.equal(q.qty, 5, 'market answer intact');
    assert.equal(q.acceptQty, 0, 'nothing fits');
    assert.equal(q.acceptTotal, 0);
    assert.equal(q.holdLimited, true);
  } finally { economy._instance = null; }
  const roomy = boot({ capVolume: 100, usedVolume: 20 });
  try {
    const q = roomy.econ.quote(SID, IRON, 'buy', 5);
    assert.equal(q.acceptQty, 5, 'roomy hold accepts the full request');
    assert.equal(q.holdLimited, false);
    assert.equal(q.acceptTotal, q.total, 'accepted total equals the market total when unbound');
  } finally { economy._instance = null; }
});

test('NXI-106: a partial buy fill keeps one consistent cargo, credit and receipt amount', () => {
  const { state, econ } = boot({ capVolume: 24, usedVolume: 20, credits: 100000 });
  try {
    const creditsBefore = state.player.credits;
    const result = econ.execute(SID, IRON, 'buy', 10, { intentId: 'nxi106-buy' });
    assert.ok(result.ok, 'commit succeeds: ' + result.reason);
    assert.equal(result.qty, 4, 'result reports accepted, not requested, quantity');
    const cargoDelta = state.player.cargo.items[IRON] || 0;
    const creditDelta = creditsBefore - state.player.credits;
    assert.equal(cargoDelta, result.qty, 'cargo gained the result quantity');
    assert.equal(creditDelta, result.total, 'credits paid the result total');
    assert.ok(result.receipt, 'intent receipt present');
    assert.equal(result.receipt.quantity, result.qty, 'receipt quantity is the accepted amount');
    assert.equal(result.receipt.requestedQty, 10, 'receipt keeps the request for intent dedup');
    assert.equal(result.receipt.total, result.total, 'receipt total is what was charged');
  } finally { economy._instance = null; }
});

test('NXI-106: a partial sell fill settles exactly the units that left the hold', () => {
  const { state, econ } = boot({ items: { [IRON]: 6 }, usedVolume: 6 });
  try {
    const creditsBefore = state.player.credits;
    const result = econ.execute(SID, IRON, 'sell', 20);
    assert.ok(result.ok, 'commit succeeds: ' + result.reason);
    assert.equal(result.qty, 6, 'result reports the units actually sold');
    assert.equal(state.player.cargo.items[IRON] || 0, 0, 'hold emptied by exactly the result qty');
    assert.equal(state.player.credits - creditsBefore, result.total, 'credits gained the result total');
  } finally { economy._instance = null; }
});
