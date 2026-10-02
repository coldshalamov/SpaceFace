import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMODITIES } from '../src/data/commodities.js';
import { bestKnownBuy, bestKnownMarginLane } from '../src/ui/marketIntelligence.js';
import { computeBestTrades } from '../src/ui/market/tradeLogic.js';

const ORE = COMMODITIES.find((row) => row.id === 'cmdty_ore_iron');

function memoryQuote(buy, sell) {
  return { buy, sell, seenAt: 1, source: 'dock' };
}

test('a zero quote is unknown, so it is not the cheapest buy or a free-money lane', () => {
  const memory = {
    blank: { [ORE.id]: memoryQuote(0, 0) },
    priced: { [ORE.id]: memoryQuote(40, 90) },
  };
  const buy = bestKnownBuy(memory, ORE.id, 10);
  assert.equal(buy.stationId, 'priced');
  assert.equal(buy.buy, 40);

  const onlyBlank = { blank: { [ORE.id]: memoryQuote(0, 80) } };
  assert.equal(bestKnownBuy(onlyBlank, ORE.id, 10), null);

  const lane = bestKnownMarginLane({
    blank: { [ORE.id]: memoryQuote(0, 10) },
    priced: { [ORE.id]: memoryQuote(40, 90) },
  }, ORE.id, 10);
  if (lane) assert.notEqual(lane.buyStationId, 'blank');
});

test('an unknown local buy is not ranked as a risk-free source, and a real spread still is', () => {
  const state = {
    simTime: 20,
    player: {
      credits: 5000,
      cargo: { capVolume: 40, usedVolume: 0 },
      marketMemory: {
        station_far: { [ORE.id]: memoryQuote(10, 0) },
        station_real: { [ORE.id]: memoryQuote(30, 80) },
      },
    },
    economy: {
      markets: {
        station_here: {
          [ORE.id]: { lastBuy: 0, lastSell: 5 },
        },
      },
    },
  };
  assert.deepEqual(computeBestTrades(state, 'station_here'), []);

  state.economy.markets.station_here[ORE.id].lastBuy = 25;
  const trades = computeBestTrades(state, 'station_here');
  assert.equal(trades.length, 1);
  assert.equal(trades[0].destStation, 'station_real');
  assert.ok(trades[0].loadProfit > 0);
  assert.ok(trades[0].sellThere > 0);
});
