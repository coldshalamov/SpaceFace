// LOD selector: ~20% bands around each threshold, a 1.5 s dwell, and a hard cap of swaps per 10 s.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLodState, LOD_DWELL_S, LOD_SWAP_CAP, LOD_SWAP_WINDOW_S } from '../src/render/lod.js';

test('bands and dwell: noise near a threshold never swaps; a held change lands after the dwell', () => {
  assert.ok(LOD_DWELL_S >= 1.5);
  const lod = createLodState();
  assert.equal(lod.resolve(200, 0), 'lod0');
  assert.equal(lod.resolve(100, 0.5), 'lod0', 'inside the 120 px band');
  assert.equal(lod.resolve(90, 1), 'lod0', 'pending, dwell not served');
  assert.equal(lod.resolve(90, 2), 'lod0');
  assert.equal(lod.resolve(90, 2.6), 'lod1');
  assert.equal(lod.resolve(40, 3), 'lod1', 'inside the 45 px band');
});

test('an entity presents at most LOD_SWAP_CAP changes per window', () => {
  assert.equal(LOD_SWAP_CAP, 2);
  const lod = createLodState();
  lod.resolve(200, 0);
  lod.resolve(90, 1);
  assert.equal(lod.resolve(90, 2.6), 'lod1');
  lod.resolve(200, 3);
  assert.equal(lod.resolve(200, 4.6), 'lod0');
  lod.resolve(90, 5);
  assert.equal(lod.resolve(90, 6.6), 'lod0', 'capped');
  assert.equal(lod.resolve(90, 2.6 + LOD_SWAP_WINDOW_S + 0.1), 'lod1', 'window rolled');
});
