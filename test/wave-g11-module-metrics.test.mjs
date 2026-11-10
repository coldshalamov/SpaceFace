// Wave G11 — the module card shows the damage rate the sim fires, not a dead catalog field.

import test from 'node:test';
import assert from 'node:assert/strict';

import { admitModuleMetric, liveDamageRate } from '../src/ui/station/moduleCardMetrics.js';

test('G11 a stale dps field is not the number, and an unknown field is refused', () => {
  assert.equal(liveDamageRate({ dmg: 10, rof: 2, dps: 999 }), 20);
  assert.equal(liveDamageRate({ dmg: 60, rof: 0, dps: 999 }), 60);
  assert.equal(liveDamageRate({ dps: 40 }), null);
  assert.equal(admitModuleMetric('DPS'), true);
  assert.equal(admitModuleMetric('RANGE'), true);
  assert.equal(admitModuleMetric('LUCK'), false);
});
