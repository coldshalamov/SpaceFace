import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTHORED_UPGRADE_OPENING_LIMIT,
  AUTHORED_UPGRADE_SETTLE_MS,
  AUTHORED_UPGRADE_STEADY_LIMIT,
  authoredUpgradeConcurrencyLimit,
} from '../src/render/authoredUpgradePolicy.js';

test('steady flight stays serial; only loading and opening may overlap two jobs', () => {
  assert.equal(authoredUpgradeConcurrencyLimit({ mode: 'flight' }), AUTHORED_UPGRADE_STEADY_LIMIT);
  assert.equal(authoredUpgradeConcurrencyLimit({ mode: 'loading' }), AUTHORED_UPGRADE_OPENING_LIMIT);
  assert.equal(authoredUpgradeConcurrencyLimit({
    mode: 'flight',
    deferNoncriticalMeshStreaming: true,
  }), AUTHORED_UPGRADE_OPENING_LIMIT);
  assert.equal(authoredUpgradeConcurrencyLimit({
    mode: 'flight',
    firstPlayableFrameAt: 1000,
    nowMs: 1400,
  }), AUTHORED_UPGRADE_STEADY_LIMIT);
  assert.equal(AUTHORED_UPGRADE_SETTLE_MS, 0);
});
