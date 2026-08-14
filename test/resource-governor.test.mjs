import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareEvictionOrder,
  createResourceGovernor,
  evictionPriority,
  selectEvictions,
} from '../src/render/resourceGovernor.js';

test('player and opening shell outrank previous-sector warmth', () => {
  assert.ok(evictionPriority({ role: 'player' }) < evictionPriority({ role: 'warm-previous-sector' }));
  const ordered = [
    { key: 'warm', roles: ['warm-previous-sector'], bytes: 10 },
    { key: 'player', roles: ['player'], bytes: 50 },
  ].sort(compareEvictionOrder);
  assert.equal(ordered[0].key, 'warm');
});

test('governor evicts unused warmth before touching the current shell', () => {
  const entries = [
    { key: 'player-shell', roles: ['player', 'opening-shell'], bytes: 40 },
    { key: 'helios-station', roles: ['current-sector', 'opening-shell'], bytes: 80 },
    { key: 'old-ceres', roles: ['warm-previous-sector'], bytes: 120 },
    { key: 'far-lod2', roles: ['unused'], bytes: 30 },
  ];
  const plan = selectEvictions(entries, { maxBytes: 160 });
  assert.ok(plan.evict.includes('old-ceres'));
  assert.equal(plan.evict.includes('player-shell'), false);
  assert.equal(plan.evict.includes('helios-station'), false);

  const governor = createResourceGovernor({ maxGpuBytes: 160 });
  const again = governor.plan(entries, 'gpu');
  assert.deepEqual(again.evict, plan.evict);
});
