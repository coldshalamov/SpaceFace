// FB-050 — price pins can carry a target; a crossing announces once, re-arms on the way back,
// and a station the pilot never visited can never speak.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import {
  toggleWatchPin, checkWatchlistAlerts, watchlistPins, normalizeWatchlist,
} from '../src/ui/watchlist.js';
import { tickerEventRef } from '../src/ui/marketNews.js';

const ST = 'station_helios';
const REF = 'commodity:cmdty_ore_iron';
const CID = 'cmdty_ore_iron';

function boot() {
  const sim = createSimulation({ seed: 4242, systems: [economy] });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 8 });
  state.playerId = player.id;
  return { sim, state, econ: sim.registry.get('economy') };
}

function rememberMarket(state, econ, stationId, commodityId, buyPrice) {
  const market = econ.ensureMarket(stationId);
  if (buyPrice != null) {
    // marketQuoteValue reads lastBuy before buy — move the live last-trade field, not the seed.
    market[commodityId].buy = buyPrice;
    market[commodityId].lastBuy = buyPrice;
    market[commodityId].sell = Math.round(buyPrice * 0.9);
    market[commodityId].lastSell = Math.round(buyPrice * 0.9);
  }
  econ.recordMarketMemory(stationId, market);
  return market;
}

test('a crossing fires once, then re-arms when the price crosses back', () => {
  const { state, econ } = boot();
  const market = rememberMarket(state, econ, ST, CID);
  const quoted = econ.quote(ST, CID, 'buy', 1).unitAvg;

  const res = toggleWatchPin(state, REF, { stationId: ST, target: Math.round(quoted * 0.5), direction: 'below' });
  assert.equal(res.pinned, true);
  assert.equal(res.pin.target, Math.round(quoted * 0.5));
  assert.equal(res.pin.direction, 'below');

  // Below the target already → the alert fires on the first check, exactly once.
  rememberMarket(state, econ, ST, CID, Math.round(quoted * 0.4));
  const hits1 = checkWatchlistAlerts(state);
  assert.equal(hits1.length, 1);
  assert.equal(hits1[0].pin.ref, REF);
  assert.equal(checkWatchlistAlerts(state).length, 0, 'no second announcement for the same crossing');

  // Price recovers above the target → pin re-arms; next drop fires again.
  rememberMarket(state, econ, ST, CID, Math.round(quoted * 0.8));
  assert.equal(checkWatchlistAlerts(state).length, 0, 'crossing back announces nothing');
  rememberMarket(state, econ, ST, CID, Math.round(quoted * 0.3));
  const hits2 = checkWatchlistAlerts(state);
  assert.equal(hits2.length, 1, 're-armed pin speaks on the next crossing');
});

test('a station the pilot has never visited cannot trigger an alert', () => {
  const { state } = boot();
  const res = toggleWatchPin(state, REF, { stationId: 'station_expunge', target: 1, direction: 'below' });
  assert.equal(res.pinned, true);
  assert.equal(state.player.marketMemory?.station_expunge, undefined, 'never seen');
  assert.equal(checkWatchlistAlerts(state).length, 0, 'unvisited stations stay silent');
});

test('the news:publish payload carries provenance the ticker accepts', () => {
  // The ticker drops records with no eventRef — the announce payload must cite the pin.
  const payload = {
    text: 'Watch: Iron ore down to 250 cr — quoting 240.',
    kind: 'watchlist_price',
    sourceRef: 'watchlist:commodity:cmdty_ore_iron@station_helios',
    stationId: 'station_helios',
  };
  assert.ok(tickerEventRef(payload), 'a sourceRef-cited alert survives the ticker gate');
  assert.equal(tickerEventRef({ text: 'no citation', kind: 'watchlist_price' }), null);
});

test('targets persist through the watchlist normalize round-trip', () => {
  const { state } = boot();
  toggleWatchPin(state, REF, { stationId: ST, target: 250, direction: 'below' });
  const round = normalizeWatchlist(JSON.parse(JSON.stringify(watchlistPins(state))));
  const pin = round.find((p) => p.ref === REF);
  assert.ok(pin, 'pin survives');
  assert.equal(pin.target, 250);
  assert.equal(pin.direction, 'below');
});
