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

test('without a shared book the first commit stays untimed', () => {
  const lod = createLodState();
  assert.equal(lod.resolve(20, 0), 'lod1');
  assert.equal(lod.swapTimes.length, 0);
});

test('a shared book counts the first commit and caps every resolver for that entity', () => {
  const book = [];
  const a = createLodState();
  assert.equal(a.resolve(20, 0, book), 'lod1');
  assert.equal(book.length, 1);
  assert.equal(a.swapTimes.length, 0, 'the shared book is the only record');
  const b = createLodState();
  assert.equal(b.resolve(20, 1, book), 'lod1');
  assert.equal(book.length, 2);
  const c = createLodState();
  assert.equal(c.resolve(20, 2, book), 'lod0', 'a third resolver holds once the entity book is full');
  assert.equal(book.length, LOD_SWAP_CAP);
  assert.equal(a.resolve(200, 3, book), 'lod1', 'dwell not served');
  assert.equal(a.resolve(200, 3 + LOD_DWELL_S + 0.01, book), 'lod1', 'cap holds the presented level');
});

test('the swap cap follows the entity across family roots (adopt carries the history)', async () => {
  const { createLodState, LOD_SWAP_CAP, LOD_DWELL_S, LOD_THRESHOLDS } = await import('../src/render/lod.js');
  const far = LOD_THRESHOLDS.LOD2_BELOW * 0.5;
  const near = LOD_THRESHOLDS.LOD2_BELOW * 1.6;
  let lod = createLodState();
  let t = 0;
  lod.resolve(near, t);
  let swaps = 0;
  let level = lod.level;
  for (let i = 0; i < 40; i++) {
    t += LOD_DWELL_S + 0.05;
    const px = i % 2 ? near : far;
    lod.resolve(px, t);
    lod.resolve(px, t + LOD_DWELL_S + 0.01);
    t += LOD_DWELL_S + 0.01;
    if (lod.level !== level) {
      swaps++;
      level = lod.level;
      const next = createLodState();
      next.adopt(level, px, lod);
      lod = next;
    }
    if (t > 9.5) break;
  }
  assert.ok(swaps <= LOD_SWAP_CAP, `${swaps} swaps inside 10 s across rebinds`);
});
