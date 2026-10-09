// NXI-103 — a credit-limited second purchase is not described as a ship-capacity limit.
// Exercises the exact market.js pipeline: compareDockedFreight → formatFreightComparison
// (src/ui/station/screens/market.js `renderRoutes`, lines ~1491-1492).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compareDockedFreight,
  compareTwoStopFreight,
  formatFreightComparison,
} from '../src/systems/economy.js';

const CHIPS = 'cmdty_microchips';
const FOOD = 'cmdty_food';

function docked({ credits = 300, capVolume = 200, usedVolume = 0 } = {}) {
  return {
    meta: { seed: 25 },
    simTime: 1000,
    tick: 1,
    story: { persistentCargo: [] },
    missions: {
      active: [], boards: {}, completedLog: [], receipts: [], nextId: 1, config: { maxActive: 8 },
    },
    player: {
      credits,
      marketMemory: {
        station_customs: { [FOOD]: { buy: 60, sell: 62, stock: 100, seenAt: 900 } },
        station_forge: { [FOOD]: { buy: 40, sell: 80, stock: 100, seenAt: 900 } },
      },
      cargo: { items: {}, capVolume, usedVolume, usedMass: 0 },
      stats: {},
      tradeLedger: [],
      tradeLots: {},
    },
    economy: { markets: { station_test: { [CHIPS]: { stock: 100, lastBuy: 10, lastSell: 9 } } } },
    ui: {},
    nav: {},
    world: { sectors: {} },
  };
}

const TRADE = { cmdtyId: CHIPS, destStation: 'station_customs', buyHere: 10, sellThere: 30, seenAtT: 900 };

// The rendered fragment that names the limiting leg, isolated from the rest of the line.
function limitFragment(line) {
  const hit = /leg \d limited by [^·]+/.exec(line);
  return hit ? hit[0].trim() : '';
}

test('NXI-103 a credit-limited second purchase names credits, never ship capacity', () => {
  const state = docked({ credits: 300, capVolume: 200 });
  const result = compareDockedFreight(state, 'station_test', TRADE);
  assert.ok(result);
  assert.equal(result.leg2.limit, 'credits', 'the second buy is bound by its credits, not the hold');
  assert.equal(result.limitingLeg, 2);
  assert.equal(result.limitingInput, 'credits');

  const line = formatFreightComparison(result);
  const fragment = limitFragment(line);
  assert.equal(fragment, 'leg 2 limited by credits');
  assert.doesNotMatch(fragment, /volume|hold|capacity|space/i);
});

test('NXI-103 a hold-limited second purchase still tells the truth', () => {
  // Legitimate neighboring success: when the second buy really is volume-bound the card
  // keeps naming the hold — the credit word was not just painted over every limit.
  // Leg 2's commodity is four times as bulky, so the same free hold fits fewer units of
  // it: the second buy's binding input is the hold even though credits are ample.
  const plan = {
    credits: 100000,
    capVolume: 8,
    usedVolume: 0,
    operatingCost: 0,
    leg1: { buy: 10, sell: 30, stock: 100, volume: 1, qty: 8 },
    leg2: { buy: 5, sell: 9, stock: 100, volume: 4 },
  };
  const result = compareTwoStopFreight(plan);
  assert.equal(result.leg2.limit, 'volume');
  assert.equal(result.limitingLeg, 2);
  assert.equal(result.limitingInput, 'volume');
  assert.equal(limitFragment(formatFreightComparison(result)), 'leg 2 limited by volume');
});

test('NXI-103 a second purchase whose quote is missing stays unknown, not capacity', () => {
  const plan = {
    credits: 100000,
    capVolume: 200,
    usedVolume: 0,
    operatingCost: 0,
    leg1: { buy: 10, sell: 30, stock: 100, volume: 1 },
    leg2: { buy: null, sell: 9, stock: 100, volume: 1 },
  };
  const result = compareTwoStopFreight(plan);
  assert.equal(result.leg2.limit, 'unknown');
  assert.equal(result.limitingInput, 'unknown');
  const fragment = limitFragment(formatFreightComparison(result));
  assert.equal(fragment, 'leg 2 limited by unknown');
  assert.doesNotMatch(fragment, /volume|hold|capacity|space/i);
});
