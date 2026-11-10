// NXI-102 — Round a purchasable load down before pricing it.
// A nearly full hold cannot preview a fractional unit that the commit rejects or overcharges:
// quote() binds the accepted quantity with the same whole-unit hold-capacity rule the commit
// applies, and prices that floored quantity on the same curve. Preview == commit.
// Fixed seed; exercises the live owner (economy.quote/execute) end to end.
import test from 'node:test';
import assert from 'node:assert/strict';

import { economy } from '../src/systems/economy.js';

const SID = 'station_helios';
const IRON = 'cmdty_ore_iron'; // volPerU 1.0 — integer-fit case
const WATER = 'cmdty_ice_water'; // volPerU 1.4 — fractional-fit case

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

test('NXI-102: a fractional hold fit is floored to whole units before it is priced', () => {
  // 5 free volume against 1.4 vol/unit water: floor(5/1.4) = 3 whole units fit — never 3.57.
  const { state, econ } = boot({ capVolume: 25, usedVolume: 20 });
  try {
    const q = econ.quote(SID, WATER, 'buy', 10);
    assert.ok(q.ok, 'quote answers: ' + q.reason);
    assert.equal(q.qty, 10, 'the market answer stays the book-side request');
    assert.ok(Number.isInteger(q.acceptQty), 'accepted quantity is a whole number: ' + q.acceptQty);
    assert.equal(q.acceptQty, 3, 'the fit is floored, not rounded, before pricing');
    assert.equal(q.holdLimited, true, 'the preview flags the capacity bind');
    assert.ok(Number.isFinite(q.acceptTotal) && q.acceptTotal > 0, 'the floored lot carries a price');
    assert.ok(q.acceptTotal < q.total, 'the floored lot prices for less than the full request');
  } finally { economy._instance = null; }
  assert.equal(state.player.cargo.items[WATER] || 0, 0, 'a quote writes nothing');
});

test('NXI-102: preview and commit agree on quantity and total for the nearly full hold', () => {
  const { state, econ } = boot({ capVolume: 25, usedVolume: 20 });
  try {
    const q = econ.quote(SID, WATER, 'buy', 10);
    const result = econ.execute(SID, WATER, 'buy', 10);
    assert.ok(result.ok, 'commit succeeds: ' + result.reason);
    assert.equal(result.qty, q.acceptQty, 'the commit accepts exactly the previewed quantity');
    assert.equal(result.total, q.acceptTotal, 'the commit charges exactly the previewed total');
    assert.equal(state.player.cargo.items[WATER] || 0, result.qty, 'cargo gained exactly the accepted units');
    assert.ok(Number.isInteger(result.total), 'settlement stays whole-credit');
  } finally { economy._instance = null; }
});

test('NXI-102: the integer-fit nearly full hold still previews what the commit settles', () => {
  const { econ } = boot({ capVolume: 24, usedVolume: 20 });
  try {
    const q = econ.quote(SID, IRON, 'buy', 10);
    const result = econ.execute(SID, IRON, 'buy', 10);
    assert.ok(result.ok, 'commit succeeds: ' + result.reason);
    assert.equal(q.acceptQty, 4);
    assert.equal(result.qty, 4, 'four whole units out of four free volume');
    assert.equal(result.total, q.acceptTotal, 'accepted total is what the settlement charges');
  } finally { economy._instance = null; }
});

test('NXI-102: neighboring success — a roomy hold is priced and filled on the full request', () => {
  const { state, econ } = boot({ capVolume: 100, usedVolume: 20 });
  try {
    const q = econ.quote(SID, WATER, 'buy', 6);
    assert.ok(q.ok, 'quote answers: ' + q.reason);
    assert.equal(q.acceptQty, 6, 'the full request fits and is accepted');
    assert.equal(q.holdLimited, false);
    assert.equal(q.acceptTotal, q.total, 'accepted total equals the market total when unbound');
    const result = econ.execute(SID, WATER, 'buy', 6);
    assert.ok(result.ok, 'commit succeeds: ' + result.reason);
    assert.equal(result.qty, 6, 'the full request settles');
    assert.equal(result.total, q.total, 'the commit charges the previewed market total');
    assert.equal(state.player.cargo.items[WATER] || 0, 6);
  } finally { economy._instance = null; }
});
