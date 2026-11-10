// SFQ-I034 — a refused market load names volume, legality, or service availability.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBestTrades, formatRouteCard, routeIsActionable } from '../src/ui/market/tradeLogic.js';

const HERE = 'station_helios';
const IRON = 'cmdty_ore_iron';
const VOLUME = 'The hold has no free volume for this load.';
const LEGAL = 'This berth will not accept that cargo.';
const SERVICE = 'That trade is not available at this berth.';

function market() {
  return {
    simTime: 100,
    player: {
      credits: 5000,
      cargo: { items: {}, capVolume: 40, usedVolume: 0 },
      marketMemory: {
        station_ceres: { [IRON]: { buy: 20, sell: 80, seenAt: 90 } },
      },
    },
    economy: { markets: { [HERE]: { [IRON]: { lastBuy: 10, stock: 40 } } } },
  };
}

function cardFor(quote) {
  const trades = computeBestTrades(market(), HERE, { quote: () => quote });
  assert.equal(trades.length, 1);
  return formatRouteCard(trades[0]).sub;
}

test('a volume refusal names the hold', () => {
  const fromReason = cardFor({ ok: false, reason: 'cargo_full', total: 0, qty: 0 });
  const fromHold = cardFor({ ok: true, qty: 1, total: 10, holdLimited: true, acceptQty: 0 });
  assert.equal(fromReason, VOLUME);
  assert.equal(fromHold, VOLUME);
  assert.equal(/_/.test(fromReason), false);
});

test('a legality refusal names the berth refusal', () => {
  const text = cardFor({ ok: false, reason: 'contamination_refusal', total: 0, qty: 0 });
  assert.equal(text, LEGAL);
  assert.equal(/_/.test(text), false);
  assert.notEqual(text, VOLUME);
});

test('a service refusal names availability', () => {
  const tier = cardFor({ ok: false, reason: 'tier_unavailable', total: 0, qty: 0 });
  const locked = cardFor({ ok: false, reason: 'black_market_locked', total: 0, qty: 0 });
  const outage = cardFor({ ok: false, total: 0, qty: 0, outage: { remainingS: 90 } });
  assert.equal(tier, SERVICE);
  assert.equal(locked, SERVICE);
  assert.equal(outage, SERVICE);
  assert.equal(/_/.test(tier), false);
  assert.notEqual(tier, VOLUME);
  assert.notEqual(tier, LEGAL);
});

test('a missing listing is not called a legal refusal', () => {
  const trades = computeBestTrades(market(), HERE, {
    quote: () => ({ ok: false, reason: 'untraded', total: 0, qty: 0 }),
  });
  assert.deepEqual(trades, []);
});

test('a refused-load entry is flagged so the market screen shows no course or review button for it', () => {
  const trades = computeBestTrades(market(), HERE, {
    quote: () => ({ ok: false, reason: 'cargo_full', total: 0, qty: 0 }),
  });
  assert.ok(trades.length > 0, 'a refusal still produces an explaining entry when no run exists');
  for (const trade of trades) {
    assert.equal(trade.denied, true, 'every entry is a refusal, not a run');
    assert.equal(routeIsActionable(trade), false, 'nothing to review or plot');
  }
  // A real run stays actionable; zero units or no entry never is.
  assert.equal(routeIsActionable({ loadUnits: 12, loadProfit: 300 }), true);
  assert.equal(routeIsActionable({ loadUnits: 0 }), false);
  assert.equal(routeIsActionable(null), false);
});
