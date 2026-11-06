// "You moved this price" — the market's cause tooltip attributes a price move to the player's own
// hand trade, from the economy's own trade ledger (the receipt IS the cause record: every settled
// trade moves the mid by the stock it shifts). The lane line had this; hand trades never did.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handTradeLine, HAND_TRADE_PRESSURE_MIN_QTY, HAND_TRADE_PRESSURE_WINDOW_S }
  from '../src/ui/causeLedger.js';

const STATION = 'station_helios';
const GOOD = 'cmdty_ore_iron';

function state({ qty = 33, side = 'buy', seenAt = 500, now = 600, sequence = 7 } = {}) {
  return {
    simTime: now,
    player: { tradeLedger: [
      { receiptId: 'r1', tradeSequence: sequence, stationId: STATION, commodityId: GOOD,
        side, qty, unit: 33, seenAt, total: qty * 33 },
    ] },
  };
}

test('a big recent hand trade is named as the cause, in the trade\'s own direction', () => {
  const line = handTradeLine(state(), STATION, GOOD);
  assert.match(line, /lifted this board: 33u of lot bought/);
  assert.match(line, /receipt #7/);
});

test('a big sell presses the board', () => {
  const line = handTradeLine(state({ side: 'sell' }), STATION, GOOD);
  assert.match(line, /pressed this board: 33u of lot sold/);
});

test('a small lot claims nothing', () => {
  assert.equal(handTradeLine(state({ qty: HAND_TRADE_PRESSURE_MIN_QTY - 1 }), STATION, GOOD), null);
});

test('a stale trade claims nothing', () => {
  assert.equal(handTradeLine(state({ seenAt: 600 - HAND_TRADE_PRESSURE_WINDOW_S - 1 }), STATION, GOOD), null);
  assert.equal(handTradeLine(state({ seenAt: 600 - HAND_TRADE_PRESSURE_WINDOW_S + 5 }), STATION, GOOD) != null, true);
});

test('another station or good claims nothing; malformed state reads as no trade', () => {
  assert.equal(handTradeLine(state(), 'station_tethys', GOOD), null);
  assert.equal(handTradeLine(state(), STATION, 'cmdty_fuel_cells'), null);
  assert.equal(handTradeLine(null, STATION, GOOD), null);
  assert.equal(handTradeLine({ simTime: 10, player: {} }, STATION, GOOD), null);
});

test('the newest matching receipt wins', () => {
  const s = state();
  s.player.tradeLedger.unshift({ receiptId: 'r0', tradeSequence: 3, stationId: STATION,
    commodityId: GOOD, side: 'sell', qty: 12, unit: 30, seenAt: 590, total: 360 });
  const line = handTradeLine(s, STATION, GOOD);
  assert.match(line, /receipt #3/);
});
