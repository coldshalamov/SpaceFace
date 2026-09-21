import test from 'node:test';
import assert from 'node:assert/strict';

import { automation } from '../src/systems/automation.js';
import { formatTraderReceipt } from '../src/ui/screens/automationPanel.js';

// INF-088: one automated delivery must be financially legible — a compact receipt with real
// purchase/sale/cost/result entries, living on the job record, reconciling to the economy
// owner, never counting transferred capital as profit, never paying twice after load.
function boot({ buy, sell, hotness = 0 }) {
  const trader = {
    id: 'au_7', defId: 'trader_hauler', status: 'enroute', hotness,
    route: { from: 'station_a', to: 'station_b', good: 'ore_iron' },
    cycleProgress: 0,
  };
  const def = { cargoVol: 120, tradeEff: 0.9, cycleTime: 180, upkeepPerMin: 5 };
  const state = {
    player: { credits: 1000 },
    automation: { traders: [trader], accumulators: {}, meta: {} },
  };
  const credited = [];
  const emitted = [];
  const inst = Object.create(automation);
  Object.assign(inst, {
    state,
    bus: { emit(ev, p) { emitted.push({ ev, p }); } },
    helpers: {},
    _rng: () => 0.99,
    _stationPrice: (station, good, side) => (side === 'buy' ? buy : sell),
    _routeFuelCost: () => 3,
    _traderLossProb: () => 0,
    _applyTradePressure: () => {},
    creditPassive: (amount, source) => { credited.push({ amount, source }); },
  });
  const a = state.automation;
  return { state, inst, a, trader, def, credited, emitted };
}

test('INF-088 paid delivery records purchase/sale/cost/result and credits exactly the net', () => {
  const { inst, a, trader, def, credited, emitted } = boot({ buy: 8, sell: 14 });
  inst._completeTraderCycle(trader, def, a, 0);
  const r = trader.lastReceipt;
  assert.equal(r.n, 1);
  assert.equal(r.qty, 120);
  assert.equal(r.buyUnit, 8);
  assert.equal(r.sellUnit, 14);
  assert.equal(r.outlay, 120 * 8 * 0.9);
  assert.equal(r.revenue, 120 * 14 * 0.9);
  assert.equal(r.fuelCost, 3);
  assert.equal(r.result, 'paid');
  // entries reconcile: revenue - outlay - fuel === the credited net (capital is not profit).
  assert.ok(Math.abs((r.revenue - r.outlay - r.fuelCost) - r.credited) < 1e-9);
  assert.equal(credited.length, 1);
  assert.strictEqual(credited[0].amount, r.credited);
  assert.equal(credited[0].source, 'trader');
  assert.equal(trader.lastCycleProfit, Math.round(r.credited));
  const done = emitted.find((e) => e.ev === 'automation:traderCycleCompleted');
  assert.deepEqual(done.p.receipt, r);
});

test('INF-088 collapsed spread records an honest no-payout receipt and credits nothing', () => {
  const { inst, a, trader, def, credited } = boot({ buy: 14, sell: 8 });
  inst._completeTraderCycle(trader, def, a, 0);
  const r = trader.lastReceipt;
  assert.equal(r.result, 'no_spread');
  assert.equal(r.credited, 0);
  assert.equal(credited.length, 0);
  assert.equal(trader.lastCycleProfit, 0);
});

test('INF-088 receipt survives save/load and is never paid twice', () => {
  const first = boot({ buy: 8, sell: 14 });
  first.inst._completeTraderCycle(first.trader, first.def, first.a, 0);
  const r1 = { ...first.trader.lastReceipt };
  // save/load round-trip through plain JSON, as the save system persists automation state.
  const loaded = JSON.parse(JSON.stringify(first.state.automation));
  assert.deepEqual(loaded.traders[0].lastReceipt, r1);
  const second = boot({ buy: 8, sell: 14 });
  second.state.automation = loaded;
  second.inst.state = second.state;
  second.a = loaded;
  const trader = loaded.traders[0];
  second.inst._completeTraderCycle(trader, second.def, loaded, 0);
  assert.equal(trader.lastReceipt.n, 2);
  // exactly one credit per completed cycle — the loaded receipt paid nothing on arrival.
  assert.equal(second.credited.length, 1);
  assert.strictEqual(second.credited[0].amount, trader.lastReceipt.credited);
});

test('INF-088 receipt line reads financially with no second ledger', () => {
  assert.equal(formatTraderReceipt({}), '');
  const paid = formatTraderReceipt({ lastReceipt: {
    n: 1, from: 'station_a', to: 'station_b', qty: 120,
    buyUnit: 8, sellUnit: 14, fuelCost: 3, credited: 645, result: 'paid',
  } });
  assert.ok(paid.includes('Last delivery #1'));
  assert.ok(paid.includes('bought @8'));
  assert.ok(paid.includes('sold @14'));
  assert.ok(paid.includes('net +645 cr'));
  const dry = formatTraderReceipt({ lastReceipt: {
    n: 2, from: 'station_a', to: 'station_b', qty: 120,
    buyUnit: 14, sellUnit: 8, fuelCost: 3, credited: 0, result: 'no_spread',
  } });
  assert.ok(dry.includes('no payout'));
});
