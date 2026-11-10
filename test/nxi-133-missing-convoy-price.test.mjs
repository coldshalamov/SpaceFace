import assert from 'node:assert/strict';
import test from 'node:test';

import { claims, listedMarketSell } from '../src/systems/claims.js';

test('listedMarketSell ignores a missing or zero quote', () => {
  assert.equal(listedMarketSell(null), null);
  assert.equal(listedMarketSell({ lastSell: 0 }), null);
  assert.equal(listedMarketSell({ lastSell: null }), null);
  assert.equal(listedMarketSell({ lastSell: 18 }), 18);
});

function settle(entry, priceOf) {
  const credits = [];
  const receipts = [];
  const spec = { store: { input: { ore: 1 } }, totals: { soldTotalCr: 0 } };
  const convoy = {
    goodId: 'ore',
    qty: 4,
    destStationId: 'station_far',
    saleSettled: false,
  };
  const self = {
    state: { economy: { markets: { station_far: { ore: entry } } } },
    _economyPeer() {
      return { priceOf };
    },
    _receipt(_body, kind, text, extra) { receipts.push({ kind, text, extra }); },
    _relaySaleFee() { return 0.2; },
    _stationName() { return 'Far'; },
    _recordStationThroughput() {},
    bus: {
      emit(name, payload) {
        if (name === 'economy:grantCredits') credits.push(payload);
      },
    },
  };
  claims._settleConvoySale.call(self, { id: 'body', spec, name: 'Relay' }, spec, {}, convoy, 4);
  return { credits, receipts, spec, convoy };
}

test('a missing destination price holds the freight and does not pay a fabricated credit', () => {
  const held = settle({ lastSell: 0 }, () => 1);
  assert.equal(held.credits.length, 0);
  assert.equal(held.spec.store.input.ore, 5);
  assert.equal(held.receipts[0].kind, 'convoy_returned');
  assert.match(held.receipts[0].text, /No market price/);
  assert.equal(held.convoy.saleSettled, true);

  const again = held.spec.store.input.ore;
  claims._settleConvoySale.call({}, { spec: held.spec }, held.spec, {}, held.convoy, 4);
  assert.equal(held.spec.store.input.ore, again);
});

test('a real listed sell still pays once', () => {
  const sold = settle({ lastSell: 20 }, () => 20);
  assert.equal(sold.credits.length, 1);
  assert.equal(sold.credits[0].amount, Math.round(4 * 20 * 0.8));
  assert.equal(sold.receipts[0].kind, 'convoy_sold');
  assert.equal(sold.spec.store.input.ore, 1);
});
