import test from 'node:test';
import assert from 'node:assert/strict';

import { automation } from '../src/systems/automation.js';
import { lanePressureLine } from '../src/ui/causeLedger.js';

// INF-090: one price change must point back to a visible cause — the player's own paid hauler
// delivery. The market move and the displayed cause share one source record (the delivery
// receipt); anything else renders nothing, never a fabricated crisis.
function laneState(receipt) {
  return {
    ui: { dockedStationId: 'station_a' },
    automation: {
      traders: [{
        id: 'au_7', defId: 'trader_hauler', status: 'enroute',
        route: { from: 'station_a', to: 'station_b', good: 'ore_iron' },
        lastReceipt: receipt,
      }],
    },
  };
}

const PAID = {
  n: 3, from: 'station_a', to: 'station_b', good: 'ore_iron', qty: 120,
  buyUnit: 8, sellUnit: 14, outlay: 864, revenue: 1512, fuelCost: 3,
  credited: 645, result: 'paid',
};

test('INF-090 paid lane cites the lane, delivery, leg, and respond path', () => {
  const line = lanePressureLine(laneState(PAID), 'station_a', 'ore_iron');
  assert.ok(line.includes('a→b') || line.includes('station'), `names the lane, got: ${line}`);
  assert.ok(line.includes('#3'), 'cites the delivery record');
  assert.ok(line.includes('buys here'), 'buy-leg direction at the buy station');
  assert.ok(line.includes('Automation board'), 'names the existing respond path');
  const sellLeg = lanePressureLine(laneState(PAID), 'station_b', 'ore_iron');
  assert.ok(sellLeg.includes('sells here'), 'sell-leg direction at the sell station');
});

test('INF-090 unpaid lanes and unrelated rows render nothing', () => {
  assert.equal(lanePressureLine(laneState({ ...PAID, result: 'no_spread' }), 'station_a', 'ore_iron'), null);
  assert.equal(lanePressureLine(laneState(PAID), 'station_a', 'ore_copper'), null);
  assert.equal(lanePressureLine(laneState(PAID), 'station_c', 'ore_iron'), null);
  assert.equal(lanePressureLine({ automation: { traders: [] } }, 'station_a', 'ore_iron'), null);
  assert.equal(lanePressureLine(laneState(PAID), null, 'ore_iron'), null);
});

test('INF-090 the displayed cause shares the record of the pressure that moved the price', () => {
  // One live cycle: pressure events go out AND the receipt lands — same record, same cycle.
  const trader = {
    id: 'au_7', defId: 'trader_hauler', status: 'enroute', hotness: 0,
    route: { from: 'station_a', to: 'station_b', good: 'ore_iron' }, cycleProgress: 0,
  };
  const def = { cargoVol: 120, tradeEff: 0.9, cycleTime: 180, upkeepPerMin: 5 };
  const state = {
    player: { credits: 1000 },
    automation: { traders: [trader], accumulators: {}, meta: {} },
  };
  const pressure = [];
  const inst = Object.create(automation);
  Object.assign(inst, {
    state,
    bus: { emit(ev, p) { if (ev === 'economy:applyTradePressure') pressure.push(p); } },
    helpers: {},
    _rng: () => 0.99,
    _stationPrice: (station, good, side) => (side === 'buy' ? 8 : 14),
    _routeFuelCost: () => 3,
    _traderLossProb: () => 0,
    _applyTradePressure: (t) => {
      // mirror the real fan-out so the test binds the actual pressure path, not a stub shape.
      inst.bus.emit('economy:applyTradePressure', { stationId: t.route.from, good: t.route.good, vol: -120 });
      inst.bus.emit('economy:applyTradePressure', { stationId: t.route.to, good: t.route.good, vol: 120 });
    },
    creditPassive: () => {},
  });
  inst._completeTraderCycle(trader, def, state.automation, 0);
  assert.equal(pressure.length, 2);
  const line = lanePressureLine(state, pressure[0].stationId, pressure[0].good);
  assert.ok(line, 'the pressured station+good resolves a cause line');
  assert.ok(line.includes(`#${trader.lastReceipt.n}`), 'the line cites the very receipt of that cycle');
  assert.deepEqual(
    [pressure[0].stationId, pressure[0].good],
    [trader.lastReceipt.from, trader.lastReceipt.good],
    'pressure event and receipt share station+good',
  );
});
