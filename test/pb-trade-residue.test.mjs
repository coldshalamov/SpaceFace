// Seed 4242. After a sale of the free iron, the TRADE CLEARED receipt names the
// sealed remainder still aboard. A hold with nothing sealed does not invent one.

import test from 'node:test';
import assert from 'node:assert/strict';

import { economy } from '../src/systems/economy.js';
import { tradeClearedReceipt, TRADE_EXPECTATION_KEY } from '../src/ui/station/tradeReceipt.js';
import { latestTradeReceipt } from '../src/ui/sim/tradeTruth.js';

const SEED = 4242;
const CMDTY = 'cmdty_ore_iron';

function makeState(holdQty) {
  return {
    meta: { seed: SEED },
    simTime: 420,
    playerId: 1,
    player: {
      credits: 5000,
      cargo: { items: { [CMDTY]: holdQty }, capVolume: 40, capMass: 60, usedVolume: holdQty },
      stats: {},
      tradeLedger: [],
      tradeLots: {},
    },
    world: { currentSectorId: 'sector_helios_prime' },
    ui: { dockedStationId: 'station_test' },
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

function stamp(state, qty) {
  const last = latestTradeReceipt(state);
  state.ui[TRADE_EXPECTATION_KEY] = {
    commodityId: CMDTY,
    side: 'sell',
    qty,
    total: qty * 10,
    stationId: 'station_test',
    afterSequence: last ? last.tradeSequence : 0,
    atSimTime: state.simTime,
  };
}

test('seed 4242 the cleared receipt names sealed iron still aboard', () => {
  const sealed = makeState(10);
  assert.equal(sealed.meta.seed, SEED);
  sealed.missions.active = [{
    status: 'active',
    preloadedCargo: true,
    params: { cmdtyId: CMDTY, sealAccounted: true, sealedRemaining: 4 },
  }];
  const emitted = [];
  const system = makeEconomy(sealed, emitted);
  stamp(sealed, 6);
  const res = system.execute('station_test', CMDTY, 'sell', 6);
  assert.equal(res.ok, true);
  assert.equal(res.qty, 6);
  const payload = emitted.filter((row) => row.name === 'economy:tradeCompleted').pop().payload;
  const receipt = tradeClearedReceipt(sealed, payload);
  assert.ok(receipt.detail.includes('0 of 4 Iron Ore yours to sell'), receipt.detail);
  assert.ok(receipt.detail.includes('settled as confirmed'), receipt.detail);

  const open = makeState(6);
  const openEmitted = [];
  const openSystem = makeEconomy(open, openEmitted);
  stamp(open, 6);
  assert.equal(openSystem.execute('station_test', CMDTY, 'sell', 6).ok, true);
  const openPayload = openEmitted.filter((row) => row.name === 'economy:tradeCompleted').pop().payload;
  const openReceipt = tradeClearedReceipt(open, openPayload);
  assert.equal(openReceipt.detail.includes('yours to sell'), false, openReceipt.detail);
});
