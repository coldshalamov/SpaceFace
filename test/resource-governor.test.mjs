import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareEvictionOrder,
  createResourceGovernor,
  evictionPriority,
  selectEvictions,
} from '../src/render/resourceGovernor.js';
import { applySectorExitResidency, createAssetResidencyRegistry } from '../src/render/assetResidency.js';

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

test('sector exit calls the live governor instead of leaving warmth forever', () => {
  const calls = [];
  const residency = {
    prepareSectorExit(id) { calls.push(['exit', id]); },
    enforceBudget(kind) { calls.push(['budget', kind]); return { evict: ['old-ceres'] }; },
  };
  const receipt = applySectorExitResidency(residency, 'ceres');
  assert.deepEqual(calls, [['exit', 'ceres'], ['budget', 'gpu']]);
  assert.deepEqual(receipt.evict, ['old-ceres']);
});

test('live residency registry evicts previous-sector warmth when over budget', () => {
  const registry = createAssetResidencyRegistry({ maxGpuBytes: 40 });
  const playerRes = { dispose() {}, userData: {}, byteSize: 16 };
  const warmRes = { dispose() {}, userData: {}, byteSize: 80 };
  registry.registerAsset('player-shell', [playerRes], { byteSize: 16 });
  registry.registerAsset('old-ceres', [warmRes], { byteSize: 80 });
  registry.retain('player-shell', { name: 'player' }, { role: 'player', sectorId: 'helios' });
  registry.retain('old-ceres', { name: 'warm' }, { role: 'warm-previous-sector', sectorId: 'ceres' });
  const plan = applySectorExitResidency(registry, 'ceres');
  assert.ok(plan.evict.includes('old-ceres'));
  assert.equal(registry.has('player-shell'), true);
});
