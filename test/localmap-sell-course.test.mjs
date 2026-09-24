// The local-map route button names the station the cargo is going to.

import test from 'node:test';
import assert from 'node:assert/strict';

import { tradeRouteVisibleAction } from '../src/ui/screens/localmap.js';

test('a ranked route says which station the sell course is for', () => {
  assert.equal(tradeRouteVisibleAction('Tethys Trade Hub'), 'Sell at Tethys Trade Hub');
  assert.equal(tradeRouteVisibleAction('  Ceres Refinery  '), 'Sell at Ceres Refinery');
  assert.equal(tradeRouteVisibleAction(''), 'Set sell course');
  assert.equal(tradeRouteVisibleAction('   '), 'Set sell course');
});
