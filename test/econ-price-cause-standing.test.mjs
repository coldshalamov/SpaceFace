// Board row 321 (ECON-PRICE-CAUSE, from SFQ-B081): a quote's reputation component is named.
//
// The economy already applies standing to every quote: priceModForState feeds
// commodityStandingMultipliers, which improves the merchant's spread for a trusted pilot and widens
// it for a disliked one. The quote payload carries standingPriceMultiplier and stationSurchargeWaived
// with no UI consumer, so scarcity, fees and stale intel read as causes and the relationship did not.
// The driver presenter now words it, from the same multipliers the quote uses, as one row.

import test from 'node:test';
import assert from 'node:assert/strict';

import { marketCardDrivers, presentMarketDrivers, standingDriver } from '../src/ui/marketDriverPresenter.js';
import { priceModForState } from '../src/systems/factions.js';
import { commodityStandingMultipliers } from '../src/economy/economyMath.js';
import { marketQuoteHtml } from '../src/ui/views/marketPresentation.js';
import { SECTORS } from '../src/data/sectors.js';

const HELIOS = SECTORS.find((s) => s.id === 'sector_helios_prime').stations.find((s) => s.id === 'station_helios');
const FACTION = HELIOS.factionId;
const FOOD = { id: 'cmdty_food', name: 'Food', basePrice: 100 };
// A listing whose own quotes carry a 10% spread: buy = mid * 1.05, sell = mid * 0.95.
const ENTRY = { role: 'none', buy: 105, sell: 95, lastBuy: 105, lastSell: 95 };

function stateWith(rep, tier, flags = {}) {
  return { factions: { [FACTION]: { rep, tier, aggro: false } }, story: { flags }, economy: { cycles: {} } };
}

test('a stranger gets no standing row: nothing was applied', () => {
  assert.equal(standingDriver(stateWith(0, 'Neutral'), HELIOS, ENTRY), null);
  const drivers = presentMarketDrivers({ state: stateWith(0, 'Neutral'), stationId: 'station_helios', commodity: FOOD, entry: ENTRY });
  assert.deepEqual(drivers.primary.map((d) => d.id), ['role', 'geography', 'conflict', 'cycle']);
});

test('a trusted pilot sees the improved spread named, in the quote\'s own numbers', () => {
  const state = stateWith(600, 'Allied');
  const row = standingDriver(state, HELIOS, ENTRY);
  assert.ok(row, 'standing at 600 changes the quote, so it is worded');
  assert.equal(row.id, 'standing');
  assert.equal(row.direction, 'down', 'cheaper buys');

  // The wording is derived from the SAME multipliers the economy quote applies.
  const applied = commodityStandingMultipliers(0.1, priceModForState(state, FACTION), {});
  const buyPct = Math.round(Math.abs(applied.buy - 1) * 1000) / 10;
  const sellPct = Math.round(Math.abs(applied.sell - 1) * 1000) / 10;
  assert.ok(buyPct > 0 && sellPct > 0);
  assert.match(row.explanation, new RegExp(`buys run ${buyPct}% under`));
  assert.match(row.explanation, new RegExp(`sales pay ${sellPct}% over`));
  assert.match(row.explanation, /improves/);
  assert.match(row.shortLabel, /^Allied −/, 'tier first, then the buy change');
  assert.ok(row.label.includes('(Allied)'));
});

test('a disliked pilot sees the surcharge named as a cost, not a bonus', () => {
  const state = stateWith(-300, 'Hostile');
  const row = standingDriver(state, HELIOS, ENTRY);
  assert.ok(row);
  assert.equal(row.direction, 'up', 'dearer buys');
  assert.match(row.explanation, /worsens/);
  assert.match(row.explanation, /buys run [\d.]+% over/);
  assert.match(row.explanation, /sales pay [\d.]+% under/);
  assert.match(row.shortLabel, /^Hostile \+/);
});

test('a commission that waives the outsider surcharge says so instead of showing a cost', () => {
  const state = stateWith(-300, 'Hostile', { surcharges_cleared: true });
  const row = standingDriver(state, HELIOS, ENTRY);
  assert.ok(row);
  assert.equal(row.shortLabel, 'Surcharge waived');
  assert.match(row.explanation, /waives it/);
  assert.equal(row.direction, 'flat');
  assert.doesNotMatch(row.explanation, /buys run [\d.]+% over/, 'the waived buy is not described as dear');
});

test('standing rides every selected instrument but never a commodity card', () => {
  const drivers = presentMarketDrivers({
    state: stateWith(600, 'Allied'), stationId: 'station_helios', commodity: FOOD, entry: ENTRY,
  });
  assert.deepEqual(drivers.primary.map((d) => d.id), ['role', 'geography', 'conflict', 'cycle', 'standing']);
  assert.match(drivers.accessibleSummary, /standing with/i, 'screen readers get the standing sentence too');
  assert.ok(!marketCardDrivers(drivers.primary).some((d) => d.id === 'standing'),
    'a station-wide reading would repeat on every card');
});

test('the reading line labels it Standing and keeps the tier and change as its word', () => {
  const drivers = presentMarketDrivers({
    state: stateWith(600, 'Allied'), stationId: 'station_helios', commodity: FOOD, entry: ENTRY,
  });
  const html = marketQuoteHtml({
    id: 'cmdty_food', name: 'Food', category: 'consumable', mode: 'buy', buy: 105, sell: 95, avg: 100,
    drivers: drivers.primary, driversSummary: drivers.accessibleSummary, hist: [], forecast: [],
  });
  assert.match(html, /sx-mkt-drivers__k">Standing</, 'the kicker names what the reading is about');
  assert.match(html, /Allied −[\d.]+%/, 'the word carries the tier and what it does to a buy');
});

test('no faction record, or a station with no faction, quietly yields no row', () => {
  assert.equal(standingDriver({ factions: {} }, HELIOS, ENTRY), null);
  assert.equal(standingDriver(stateWith(600, 'Allied'), { id: 'station_x' }, ENTRY), null);
  assert.equal(standingDriver(null, HELIOS, ENTRY), null);
});
