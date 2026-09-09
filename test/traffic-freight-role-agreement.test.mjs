import test from 'node:test';
import assert from 'node:assert/strict';

import { FREIGHT_TRADING_ROLES } from '../src/economy/freightCausality.js';
import { TRAFFIC_ROLES } from '../src/systems/traffic.js';

test('every traffic role agrees with freight about who settles station lots', () => {
  const freight = new Set(FREIGHT_TRADING_ROLES);

  for (const role of FREIGHT_TRADING_ROLES) {
    assert.ok(TRAFFIC_ROLES[role], `freight role ${role} must exist in TRAFFIC_ROLES`);
  }

  const mismatches = [];
  for (const [role, def] of Object.entries(TRAFFIC_ROLES)) {
    const trafficTrades = def.trades === true;
    const freightTrades = freight.has(role);
    if (trafficTrades !== freightTrades) {
      mismatches.push(`${role}: traffic.trades=${trafficTrades} freight=${freightTrades}`);
    }
  }
  assert.deepEqual(mismatches, []);
});
