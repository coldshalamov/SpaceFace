import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { automation } from '../src/systems/automation.js';
import { formatTraderReceipt, traderPortLine } from '../src/ui/screens/automationPanel.js';

// A hired trader's card and last-delivery line name the ports. The receipt keeps the station ids.
test('hired trader names Ceres Refinery and Helios Station on seed 4242', () => {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.player.credits = 20000;
  const trader = {
    id: 'au_trader_4242',
    defId: 'trader_hauler',
    status: 'enroute',
    hotness: 0,
    route: { from: 'station_ceres', to: 'station_helios', good: 'cmdty_ore_iron' },
    cycleProgress: 0,
  };
  state.automation.traders.push(trader);
  const inst = Object.create(automation);
  inst.state = state;
  inst.bus = {
    emit(ev, payload) {
      if (ev === 'economy:grantCredits' && payload && payload.amount) {
        state.player.credits += payload.amount;
      }
    },
  };
  inst.helpers = {};
  inst._rng = () => 0.99;
  inst._capBudget = 100000;
  inst._stationPrice = (_station, _good, side) => (side === 'buy' ? 8 : 14);
  inst._routeFuelCost = () => 3;
  inst._traderLossProb = () => 0;
  inst._applyTradePressure = () => {};
  const def = { cargoVol: 120, tradeEff: 0.9, cycleTime: 180, upkeepPerMin: 5 };
  inst._completeTraderCycle(trader, def, state.automation, 0);

  assert.equal(trader.lastReceipt.from, 'station_ceres');
  assert.equal(trader.lastReceipt.to, 'station_helios');
  assert.equal(trader.route.from, 'station_ceres');
  assert.equal(trader.route.to, 'station_helios');

  const route = traderPortLine(trader.route.from, trader.route.to);
  assert.equal(route, 'Ceres Refinery → Helios Station');
  assert.doesNotMatch(route, /station_/);

  const line = formatTraderReceipt(trader);
  assert.match(line, /Ceres Refinery/);
  assert.match(line, /Helios Station/);
  assert.match(line, /120u/);
  assert.doesNotMatch(line, /station_ceres|station_helios/);
  assert.ok(trader.lastReceipt.credited > 0);
});
