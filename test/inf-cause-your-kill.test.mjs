// inf-cause-your-kill (WF-06): the cause ledger names the one cause that was unmistakably
// yours. Hovering a moving price already explains sector danger, war pressure, your hired
// hauler lane, and your own settled trades — but the biggest single economy cause a pilot
// can create was invisible: down a laden hauler, gather what spilled, sell it, and the
// destination's book tightens because the freight never landed. Economy already owns that
// causal chain end to end; this pins the read layer:
//   * a redeemed chain at this station+good speaks, citing the salvaged units;
//   * recency joins to the pilot's own settled sell receipt (the chain carries no clock) —
//     a stale receipt, a foreign sale, or none at all renders NOTHING;
//   * a chain for another station or good never speaks here;
//   * the tooltip prefers the kill line over the generic hand-trade note for the same sale.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { cargoKillLine, HAND_TRADE_PRESSURE_WINDOW_S, handTradeLine } =
  await import('../src/ui/causeLedger.js');

const STATION = 'station_meridian_arc';
const SALE = 'station_drift_yard';
const GOOD = 'cmdty_ore_copper';
const NOW = 20000;

function stateFor({ chainAgeS = 40, receiptQty = 10, chain = {} } = {}) {
  return {
    simTime: NOW,
    economy: { cargoKillChains: [{
      id: 'ck_test',
      victimId: 5124,
      commodityId: GOOD,
      destStationId: STATION,
      saleStationId: SALE,
      closed: true,
      salvaged: {},
      redeemed: { [GOOD]: 6 },
      pressureReceipts: { [GOOD]: { receiptId: 'trade:test', stationId: STATION,
        saleStationId: SALE, seenAt: NOW - chainAgeS, qty: 6 } },
      ...chain,
    }] },
    player: { tradeLedger: [{
      tradeSequence: 42,
      stationId: SALE,
      commodityId: GOOD,
      side: 'sell',
      qty: receiptQty,
      seenAt: NOW - chainAgeS,
    }] },
  };
}

test('a redeemed chain at this station names the kill behind the move', () => {
  const line = cargoKillLine(stateFor(), STATION, GOOD);
  assert.ok(line, 'the kill speaks');
  assert.match(line, /hauler you downed never landed/);
  assert.match(line, /6u of its manifest was sold at/);
});

test('the receipt is the clock: stale or missing sales render nothing', () => {
  assert.equal(cargoKillLine(stateFor({ chainAgeS: HAND_TRADE_PRESSURE_WINDOW_S + 30 }), STATION, GOOD),
    null, 'an old sale never claims a live move');
  const noReceipt = stateFor();
  noReceipt.player.tradeLedger = [];
  assert.ok(cargoKillLine(noReceipt, STATION, GOOD), 'the owner-recorded receipt fact survives ledger eviction');
  const smallSale = stateFor({ receiptQty: 4 });
  assert.ok(cargoKillLine(smallSale, STATION, GOOD), 'an unrelated ledger entry cannot replace the bound fact');
  const legacy = stateFor(); delete legacy.economy.cargoKillChains[0].pressureReceipts;
  assert.equal(cargoKillLine(legacy, STATION, GOOD), null, 'legacy chains cannot borrow a recent unrelated sale');
});

test('another station or another good never borrows this desk\u2019s why', () => {
  const state = stateFor();
  assert.equal(cargoKillLine(state, 'station_elsewhere', GOOD), null,
    'the move happened at the destination, nowhere else');
  assert.equal(cargoKillLine(state, STATION, 'cmdty_food'), null);
  assert.ok(cargoKillLine(stateFor({ chain: { destStationId: null } }), STATION, GOOD), 'the actual pressure station owns the fact');
  assert.equal(cargoKillLine({}, STATION, GOOD), null);
  assert.equal(cargoKillLine(null, STATION, GOOD), null);
});

test('an open chain with unsold salvage still owes its sold units a why', () => {
  const state = stateFor({ chain: { closed: false, salvaged: { [GOOD]: 4 } } });
  const line = cargoKillLine(state, STATION, GOOD);
  assert.ok(line, 'each redeemed tranche moved the book — the why is already earned');
  assert.match(line, /6u/);
});

test('the kill line outranks the generic hand-trade note for the same sale', () => {
  const state = stateFor({ receiptQty: 10 });
  // The closing sale is also a settled hand trade big enough to claim on its own:
  const hand = handTradeLine(state, SALE, GOOD);
  assert.ok(hand, 'the generic note would speak on its own');
  const kill = cargoKillLine(state, STATION, GOOD);
  assert.ok(kill, 'the kill line speaks at the destination');
  assert.notEqual(kill, hand);
});

test('the tooltip prefers the kill line over the hand note for the same sale', () => {
  const src = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui', 'causeLedger.js'),
    'utf8',
  );
  assert.ok(src.includes('cargoKillLine(this._state, docked, cmdty)'),
    'the mounted tooltip reads the kill line');
  assert.ok(src.includes('kill || hand'),
    'a named kill replaces the generic hand-trade note; the hand note never doubles it');
});
