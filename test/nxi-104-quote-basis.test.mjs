// NXI-104 — changing load size cannot make an old remote quote appear freshly observed.
// evaluateTwoLegItinerary recomputes the quantity-dependent plan while retaining the
// remote quote's observation time and estimate basis (src/systems/economyCycles.js).
import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateTwoLegItinerary } from '../src/systems/economyCycles.js';

const SEEN = 100;
const NOW = 5000; // 4900 s after the sighting — past the 900 s staleness window

function plan({ leg1Qty, leg2Qty, buyQty }) {
  return evaluateTwoLegItinerary({
    credits: 1000,
    cargoFree: 60,
    now: NOW,
    leg1: { qty: leg1Qty, unitCr: 10, unitVolume: 1, stock: 60 },
    leg2: {
      quoted: true,
      seenAt: SEEN,
      unitCr: 50,
      qty: leg2Qty,
      stock: 60,
      buyQty,
      buyUnitCr: 30,
      buyVolume: 1,
      buyStock: 60,
    },
  });
}

test('NXI-104 an old remote quote stays an estimate at every load size', () => {
  const small = plan({ leg1Qty: 2, leg2Qty: 2, buyQty: 2 });
  const large = plan({ leg1Qty: 20, leg2Qty: 20, buyQty: 20 });

  // The recompute ran on different load sizes — only the basis is pinned.
  assert.notEqual(small.leg1Taken, large.leg1Taken);

  for (const result of [small, large]) {
    assert.equal(result.stale, true, 'the sighting is old');
    assert.equal(result.estimate, true, 'an old remote quote is not a fresh present quote');
    assert.equal(result.seenAt, SEEN, 'the observation time is retained, never restamped');
    assert.equal(result.quoted, true, 'the caller assumption is retained');
    assert.equal(result.leg2SellQty, null, 'the stale sale is not settled at the remembered price');
    assert.equal(result.leg2BuyQty, 0, 'the stale second buy is not planned at the remembered price');
    assert.equal(result.limit, 'estimate');
    assert.equal(result.guaranteed, false);
  }
});

test('NXI-104 a fresh remote quote still settles the second leg', () => {
  // Legitimate neighboring success: a sighting inside the window keeps present-quote
  // semantics — staleness was not painted over every remote price.
  const fresh = evaluateTwoLegItinerary({
    credits: 1000,
    cargoFree: 60,
    now: 400, // 300 s after the sighting — inside the window
    leg1: { qty: 5, unitCr: 10, unitVolume: 1, stock: 60 },
    leg2: {
      quoted: true, seenAt: SEEN, unitCr: 50, qty: 5, stock: 60,
      buyQty: 4, buyUnitCr: 30, buyVolume: 1, buyStock: 60,
    },
  });
  assert.equal(fresh.stale, false);
  assert.equal(fresh.estimate, false);
  assert.equal(fresh.seenAt, SEEN, 'the same observation basis is echoed on a fresh quote');
  assert.equal(fresh.leg2SellQty, 5);
  assert.ok(fresh.leg2BuyQty > 0);
  assert.ok(fresh.creditsAfter > 0);
});

test('NXI-104 a caller-marked stale quote never reads as a fresh observation', () => {
  const flagged = evaluateTwoLegItinerary({
    credits: 1000,
    cargoFree: 60,
    leg1: { qty: 3, unitCr: 10, unitVolume: 1, stock: 60 },
    leg2: { quoted: true, stale: true, unitCr: 50, qty: 3, buyQty: 3, buyUnitCr: 30 },
  });
  assert.equal(flagged.stale, true);
  assert.equal(flagged.estimate, true);
  assert.equal(flagged.seenAt, null);
  assert.equal(flagged.leg2BuyQty, 0);
  assert.equal(flagged.limit, 'estimate');
});

test('NXI-104 an unquoted second leg is an estimate, not a stale sighting', () => {
  const unquoted = evaluateTwoLegItinerary({
    credits: 100,
    cargoFree: 3,
    leg1: { qty: 1, unitCr: 10, unitVolume: 1, stock: 1 },
    leg2: { qty: 1, buyQty: 3, buyUnitCr: 10 },
  });
  assert.equal(unquoted.estimate, true);
  assert.equal(unquoted.stale, false, 'no observation was carried, so nothing is stale');
  assert.equal(unquoted.quoted, false);
  assert.equal(unquoted.leg2BuyQty, 0);
  assert.equal(unquoted.limit, 'estimate');
});
