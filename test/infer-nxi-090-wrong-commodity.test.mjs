// NXI-090 — the wrong good on a valid contact does not move either inventory.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverRepairParts } from '../src/systems/worldSiteRuntime.js';

test('a mismatched commodity is refused and the order is unchanged', () => {
  const ledger = {
    repair: {
      orderId: 'ord-4242',
      commodityId: 'cmdty_ore',
      qty: 6,
      received: 1,
      status: 'partial',
      receipts: {},
    },
  };
  const before = JSON.stringify(ledger);
  const result = deliverRepairParts(ledger, {
    orderId: 'ord-4242',
    commodityId: 'cmdty_scrap',
    qty: 3,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'incompatible');
  assert.equal(result.consumed, 0);
  assert.equal(result.order.received, 1);
  assert.equal(JSON.stringify(ledger), before);
});
