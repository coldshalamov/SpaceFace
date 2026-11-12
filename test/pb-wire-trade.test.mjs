// pb-wire-trade.test.mjs — row 286 / SF-241 consumer half.
//
// A partial fill says so: the market screen stamps the confirmed terms into the UI-owned
// `state.ui.marketTradeExpectation` before it emits ui:buy/ui:sell, and the TRADE CLEARED receipt
// projects them through tradeTruth.projectTradeOutcome against economy's own ledger — "settled 6
// of the 10 confirmed" instead of silently showing new totals. The model is proven in
// pb-ui-c-trade-truth.test.mjs; this file proves the screen path consumes it, driving a REAL
// economy.execute() partial (hold clamps a confirmed 10 down to the 6 aboard).

import test from 'node:test';
import assert from 'node:assert/strict';

import { economy } from '../src/systems/economy.js';
import { projectTradeOutcome, latestTradeReceipt } from '../src/ui/sim/tradeTruth.js';
import { clearTradeExpectation, tradeClearedReceipt, TRADE_EXPECTATION_KEY } from '../src/ui/station/tradeReceipt.js';
import { COMMODITIES } from '../src/data/commodities.js';

const SEED = 4242;
const CMDTY = 'cmdty_ore_iron';
const CMDTY_NAME = new Map(COMMODITIES.map((c) => [c.id, c.name])).get(CMDTY);

function makeState({ holdQty = 6 } = {}) {
  return {
    meta: { seed: SEED },
    simTime: 420,
    playerId: 1,
    player: {
      credits: 5000,
      cargo: { items: holdQty ? { [CMDTY]: holdQty } : {}, capVolume: 40, capMass: 60, usedVolume: 0 },
      stats: {},
      tradeLedger: [],
      tradeLots: {},
    },
    world: { currentSectorId: 'sector_helios_prime' },
    ui: { dockedStationId: 'station_test', trackedMissionId: null },
    missions: { active: [] },
    story: { persistentCargo: [] },
    economy: { markets: { station_test: { [CMDTY]: { stock: 20 } } } },
  };
}

function makeEconomy(state, emitted) {
  return {
    ...economy,
    state,
    bus: { emit: (name, payload) => emitted.push({ name, payload }) },
    quote(_stationId, _commodityId, side, qty) {
      return { ok: true, side, qty, total: qty * 10, priceImpactPct: 0 };
    },
    registryGet() { return null; },
    grantCredits(total) { state.player.credits += total; },
    chargeCredits(total) { state.player.credits -= total; },
    recomputeLivePrices() {},
    recordLivePriceHistory() {},
    snapshotIntel() {},
  };
}

/** The expectation the screen stamps — mirrors market.js's emit path field-for-field. */
function stampExpectation(state, { qty, side = 'sell', total = null, stationId = 'station_test' }) {
  const lastReceipt = latestTradeReceipt(state);
  state.ui[TRADE_EXPECTATION_KEY] = {
    commodityId: CMDTY,
    side,
    qty,
    total,
    stationId,
    afterSequence: lastReceipt ? lastReceipt.tradeSequence : 0,
    atSimTime: Number(state.simTime) || 0,
  };
}

function completed(emitted) {
  const ev = emitted.filter((e) => e.name === 'economy:tradeCompleted').pop();
  assert.ok(ev, 'a settle publishes economy:tradeCompleted');
  return ev.payload;
}

test('PB-286: a sell of 10 that settles 6 reads the partial through projectTradeOutcome', () => {
  const state = makeState({ holdQty: 6 });
  const emitted = [];
  const system = makeEconomy(state, emitted);

  // The screen confirms 10; the hold only carries 6 — execute() clamps (unchanged rule).
  const res = system.execute('station_test', CMDTY, 'sell', 10);
  assert.equal(res.ok, true);
  assert.equal(res.qty, 6, 'the economy itself settled 6 of 10');

  const p = completed(emitted);
  assert.equal(p.qty, 6);

  const outcome = projectTradeOutcome(state, { commodityId: CMDTY, side: 'sell', qty: 10 });
  assert.equal(outcome.found, true);
  assert.equal(outcome.partialFill, true);
  assert.equal(outcome.executedQty, 6);
  assert.equal(outcome.requestedQty, 10);
  assert.equal(outcome.receipt.receiptId, p.receiptId);
});

test('PB-286: the receipt names the partial — "6 of the 10 confirmed" — in its own words', () => {
  const state = makeState({ holdQty: 6 });
  const emitted = [];
  const system = makeEconomy(state, emitted);

  stampExpectation(state, { qty: 10, side: 'sell', total: 100 });
  system.execute('station_test', CMDTY, 'sell', 10);
  const receipt = tradeClearedReceipt(state, completed(emitted));

  assert.equal(receipt.title, 'TRADE CLEARED');
  assert.equal(receipt.line, `SOLD 6 OF THE 10 CONFIRMED`);
  assert.ok(receipt.detail.includes(CMDTY_NAME), `the lot stays named: ${receipt.detail}`);
  assert.ok(receipt.detail.includes('+60 cr'), `settled credits stay named: ${receipt.detail}`);
  // The expectation slot is consumed once — a second read cannot resurrect the stamp.
  assert.equal(state.ui[TRADE_EXPECTATION_KEY], null);
});

test('PB-286: a full fill reports agreement with the stated terms', () => {
  const state = makeState({ holdQty: 10 });
  const emitted = [];
  const system = makeEconomy(state, emitted);

  stampExpectation(state, { qty: 10, side: 'sell', total: 100 });
  system.execute('station_test', CMDTY, 'sell', 10);
  const receipt = tradeClearedReceipt(state, completed(emitted));

  assert.equal(receipt.line, `SOLD 10u ${CMDTY_NAME}`);
  assert.equal(receipt.detail, `+100 cr · settled as confirmed`);
});

test('PB-286: no expectation, a wrong lot, or a different settlement renders legacy truth', () => {
  // No stamp at all — the receipt shows exactly what the event settled, as before.
  let state = makeState({ holdQty: 6 });
  let emitted = [];
  makeEconomy(state, emitted).execute('station_test', CMDTY, 'sell', 4);
  let receipt = tradeClearedReceipt(state, completed(emitted));
  assert.equal(receipt.line, `SOLD 4u ${CMDTY_NAME}`);
  assert.equal(receipt.detail, `+40 cr`);

  // A stamp for a different commodity cannot describe this settle — popped, not applied.
  state = makeState({ holdQty: 6 });
  emitted = [];
  const system = makeEconomy(state, emitted);
  state.ui[TRADE_EXPECTATION_KEY] = {
    commodityId: 'cmdty_water', side: 'sell', qty: 10, total: 100,
    stationId: 'station_test', afterSequence: 0, atSimTime: state.simTime,
  };
  system.execute('station_test', CMDTY, 'sell', 4);
  receipt = tradeClearedReceipt(state, completed(emitted));
  assert.equal(receipt.line, `SOLD 4u ${CMDTY_NAME}`);
  assert.equal(receipt.detail, `+40 cr`);
  assert.equal(state.ui[TRADE_EXPECTATION_KEY], null);

  // An older event rendered late cannot borrow a newer settle's stamp: the projection resolves
  // the newest receipt after the pin, its receiptId is not this event's, and the receipt falls
  // back rather than naming the wrong settlement.
  state = makeState({ holdQty: 20 });
  emitted = [];
  const sys2 = makeEconomy(state, emitted);
  sys2.execute('station_test', CMDTY, 'sell', 6);            // settlement A
  const first = completed(emitted);
  sys2.execute('station_test', CMDTY, 'sell', 6);            // settlement B
  completed(emitted);
  state.ui[TRADE_EXPECTATION_KEY] = {
    commodityId: CMDTY, side: 'sell', qty: 6, total: 60,
    stationId: 'station_test', afterSequence: 0, atSimTime: state.simTime,
  };
  receipt = tradeClearedReceipt(state, first);
  assert.equal(receipt.line, `SOLD 6u ${CMDTY_NAME}`);
  assert.equal(receipt.detail, `+60 cr`, 'the stamp belongs to B, never to A');
  assert.equal(state.ui[TRADE_EXPECTATION_KEY], null);
});

test('PB-286: a stale stamp past its window is debris, not context', () => {
  const state = makeState({ holdQty: 6 });
  const emitted = [];
  const system = makeEconomy(state, emitted);
  stampExpectation(state, { qty: 10, side: 'sell', total: 100 });
  state.ui[TRADE_EXPECTATION_KEY].atSimTime = state.simTime - 3600;
  system.execute('station_test', CMDTY, 'sell', 4);
  const receipt = tradeClearedReceipt(state, completed(emitted));
  assert.equal(receipt.line, `SOLD 4u ${CMDTY_NAME}`);
  assert.equal(receipt.detail, `+40 cr`);
  assert.equal(state.ui[TRADE_EXPECTATION_KEY], null);
});

test('PB-286: a stamp from a different station or the future cannot describe this settle', () => {
  const state = makeState({ holdQty: 6 });
  const emitted = [];
  const system = makeEconomy(state, emitted);
  // A stamped station that is not the settle's station rejects outright — even when the event
  // omits its own station — and a stamp dated after the settle's clock is not this trade.
  stampExpectation(state, { qty: 10, side: 'sell', total: 100, stationId: 'station_elsewhere' });
  system.execute('station_test', CMDTY, 'sell', 4);
  let receipt = tradeClearedReceipt(state, { ...completed(emitted), stationId: 'station_test' });
  assert.equal(receipt.line, `SOLD 4u ${CMDTY_NAME}`, 'foreign-station stamp falls back');
  stampExpectation(state, { qty: 10, side: 'sell', total: 100 });
  state.ui[TRADE_EXPECTATION_KEY].atSimTime = state.simTime + 3600;
  system.execute('station_test', CMDTY, 'sell', 2);
  receipt = tradeClearedReceipt(state, completed(emitted));
  assert.equal(receipt.line, `SOLD 2u ${CMDTY_NAME}`, 'a future-dated stamp falls back');
});

test('PB-286: correlated partial receipts and refusal clearing belong to their intent', () => {
  const partialId = 'market:pb286:partial';
  const state = makeState({ holdQty: 6 });
  const emitted = [];
  const system = makeEconomy(state, emitted);
  state.ui[TRADE_EXPECTATION_KEY] = {
    intentId: partialId, commodityId: CMDTY, side: 'sell', qty: 10, total: 100,
    stationId: 'station_test', afterSequence: 0, atSimTime: state.simTime,
  };

  // Execute the actual owner with its ID seam but no stale full-lot price floor: this case is
  // specifically proving the cargo-clamped partial receipt and its correlated presentation.
  const result = system.execute('station_test', CMDTY, 'sell', 10, { intentId: partialId });
  assert.equal(result.ok, true);
  assert.equal(result.qty, 6);
  const settled = completed(emitted);
  assert.equal(settled.intentId, partialId);
  const receipt = tradeClearedReceipt(state, settled);
  assert.equal(receipt.line, 'SOLD 6 OF THE 10 CONFIRMED');
  assert.ok(receipt.detail.includes('+60 cr'));
  assert.equal(state.ui[TRADE_EXPECTATION_KEY], null);

  // Neither an unrelated completion nor a refusal may consume the newer confirmed slot.
  const newerId = 'market:pb286:newer';
  state.ui[TRADE_EXPECTATION_KEY] = {
    intentId: newerId, commodityId: CMDTY, side: 'sell', qty: 2, total: 20,
    stationId: 'station_test', afterSequence: 1, atSimTime: state.simTime,
  };
  const olderId = 'market:pb286:older';
  assert.equal(clearTradeExpectation(state, { intentId: olderId, reason: 'no_cargo' }), null);
  const oldReceipt = tradeClearedReceipt(state, {
    intentId: olderId, stationId: 'station_test', commodityId: CMDTY,
    side: 'sell', qty: 1, total: 10,
  });
  assert.equal(oldReceipt.line, `SOLD 1u ${CMDTY_NAME}`);
  assert.equal(state.ui[TRADE_EXPECTATION_KEY].intentId, newerId);

  // A matching terminal refusal from the real economy owner clears only its own confirmation.
  const refusalId = 'market:pb286:refusal';
  const refusalState = makeState({ holdQty: 6 });
  const refusalEvents = [];
  const refusalSystem = makeEconomy(refusalState, refusalEvents);
  const refusalExpectation = {
    intentId: refusalId, commodityId: CMDTY, side: 'sell', qty: 1, total: 1_000_000,
    stationId: 'station_test', afterSequence: 0, atSimTime: refusalState.simTime,
  };
  refusalState.ui[TRADE_EXPECTATION_KEY] = refusalExpectation;
  const creditsBefore = refusalState.player.credits;
  const cargoBefore = refusalState.player.cargo.items[CMDTY];
  const stockBefore = refusalState.economy.markets.station_test[CMDTY].stock;
  const refusal = refusalSystem.handleTrade(CMDTY, 'sell', 1, {
    intentId: refusalId, expectedTotal: 1_000_000, sourceStationId: 'station_test',
  });
  assert.equal(refusal.ok, false);
  assert.equal(refusal.reason, 'price_changed');
  const failed = refusalEvents.filter((event) => event.name === 'economy:tradeFailed').pop();
  assert.ok(failed);
  assert.equal(failed.payload.intentId, refusalId);
  assert.equal(clearTradeExpectation(refusalState, failed.payload), refusalExpectation);
  assert.equal(refusalState.ui[TRADE_EXPECTATION_KEY], null);
  assert.equal(refusalState.player.credits, creditsBefore);
  assert.equal(refusalState.player.cargo.items[CMDTY], cargoBefore);
  assert.equal(refusalState.economy.markets.station_test[CMDTY].stock, stockBefore);
});
