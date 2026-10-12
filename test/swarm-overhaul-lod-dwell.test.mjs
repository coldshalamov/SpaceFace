import test from 'node:test';
import assert from 'node:assert/strict';
import { createLodState, LOD_DWELL_S } from '../src/render/lod.js';

test('a combat camera breathing across a LOD boundary does not swap the model', () => {
  const lod = createLodState();
  assert.equal(lod.resolve(200, 0), 'lod0');
  let swaps = 0;
  let prev = lod.level;
  // Zoom breathes 60px each way twice a second for ten seconds (the harness's worst asteroid).
  for (let i = 1; i <= 600; i++) {
    const t = i / 60;
    const px = 120 + 60 * Math.sin(t * Math.PI * 4);
    const level = lod.resolve(px, t);
    if (level !== prev) swaps++;
    prev = level;
  }
  assert.equal(swaps, 0);
});

test('a held change is presented after the dwell, and an untimed caller keeps immediate semantics', () => {
  const lod = createLodState();
  lod.resolve(200, 0);
  assert.equal(lod.resolve(60, 0.1), 'lod0');
  assert.equal(lod.resolve(60, 0.1 + LOD_DWELL_S * 0.5), 'lod0');
  assert.equal(lod.resolve(60, 0.1 + LOD_DWELL_S + 0.01), 'lod1');
  const untimed = createLodState();
  untimed.resolve(200);
  assert.equal(untimed.resolve(60), 'lod1');
});

test('the first resolve commits at once so far rocks never open at hero detail', () => {
  const lod = createLodState();
  assert.equal(lod.resolve(10, 5), 'lod1');
});
