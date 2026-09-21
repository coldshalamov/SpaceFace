// INF-085 — show route profit as a forecast with costs and age. The route card showed
// a bare "+X cr" that read as guaranteed profit: no spread, no cost, no cargo limit,
// no intel age — and the destination price is remembered intel, not knowledge. Now
// the card states gross spread, known purchase cost, net, the binding cargo limit,
// and the intel's age/source, all reproducible from the displayed numbers, while the
// Set course action rides the same untouched fields.
import test from 'node:test';
import assert from 'node:assert/strict';

import { computeBestTrades, formatRouteCard } from '../src/ui/market/tradeLogic.js';

const HERE = 'station_helios';
const THERE = 'station_ceres';
const IRON = 'cmdty_ore_iron';

function boot({ credits = 100000, seenAtAgo = 60 } = {}) {
  const now = 2000;
  const state = {
    simTime: now,
    player: {
      credits,
      cargo: { items: {}, capVolume: 100, usedVolume: 0 },
      marketMemory: {
        [THERE]: { [IRON]: { buy: 140, sell: 150, seenAt: now - seenAtAgo } },
      },
    },
    economy: { markets: { [HERE]: { [IRON]: { lastBuy: 100 } } } },
  };
  return state;
}

test('the card states spread, cost, net, limit, and age distinctly', () => {
  const trades = computeBestTrades(boot(), HERE);
  assert.equal(trades.length, 1, 'one run found');
  const card = formatRouteCard(trades[0]);
  assert.match(card.sub, /buy 100 → sell 150/, 'gross spread stated');
  assert.match(card.sub, /cost 10,000/, 'known purchase cost stated');
  assert.match(card.sub, /100 u/, 'cargo load stated');
  assert.match(card.sub, /hold fits 100 u/, 'the hold limit stated');
  assert.match(card.sub, /price memory · fresh/, 'intel age/source stated');
  assert.equal(card.profitText, '+5,000 cr', 'net stated');
});

test('the net reproduces from the displayed assumptions', () => {
  const trades = computeBestTrades(boot(), HERE);
  const t = trades[0];
  const card = formatRouteCard(t);
  assert.equal(t.loadProfit, Math.round((t.sellThere - t.buyHere) * t.loadUnits), 'net is spread times load');
  assert.equal(t.loadCost, Math.round(t.buyHere * t.loadUnits), 'cost is buy times load');
  assert.match(card.sub, new RegExp(`cost ${t.loadCost.toLocaleString('en-US')}`), 'card carries the cost');
});

test('a binding credit limit is named, not hidden', () => {
  const trades = computeBestTrades(boot({ credits: 500 }), HERE);
  assert.equal(trades.length, 1, 'a small run still found');
  const t = trades[0];
  assert.equal(t.loadBound, 'credits', 'credits bind');
  assert.equal(t.loadUnits, 5, 'only five affordable');
  const card = formatRouteCard(t);
  assert.match(card.sub, /credits bind/, 'the card names the limit');
  assert.match(card.sub, /5 u/, 'the limited load stated');
});

test('stale intel is recognizable on the card', () => {
  const trades = computeBestTrades(boot({ seenAtAgo: 1200 }), HERE);
  const card = formatRouteCard(trades[0]);
  assert.match(card.sub, /stale price memory · 20m old/, 'age and staleness stated');
  assert.ok(!/\bguaranteed\b/i.test(card.sub), 'no guaranteed-profit language');
});

test('the route action rides untouched fields', () => {
  const trades = computeBestTrades(boot(), HERE);
  const t = trades[0];
  assert.equal(t.cmdtyId, IRON, 'commodity rides along');
  assert.equal(t.destStation, THERE, 'destination rides along');
});
