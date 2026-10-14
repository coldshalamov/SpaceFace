import assert from 'node:assert/strict';
import test from 'node:test';
import { createLodState, resolvePresentedLodLevel } from '../src/render/lod.js';
import { primeAuthoredState } from '../src/render/partsLibrary.js';

test('visible ships retain their authored detail through ordinary chase-camera size changes', () => {
  const lod = createLodState();
  let resolves = 0;
  const resolve = lod.resolve.bind(lod);
  lod.resolve = (...args) => { resolves++; return resolve(...args); };
  for (let t = 0; t < 60; t += 0.25) {
    const px = [180, 80, 10, 160][Math.floor(t / 2) % 4];
    assert.equal(resolvePresentedLodLevel(lod, px, t, false, 'ship'), 'lod0');
  }
  assert.equal(resolves, 0, 'visible ships must not run the demotion state machine');
  assert.equal(lod.swapTimes.length, 0);
});

test('a previously coarse ship requests full detail as soon as it is visible', () => {
  const lod = createLodState();
  lod.adopt('lod2', 12);
  for (const type of ['ship', 'drone', 'freighter', 'reaver', 'fauna']) {
    assert.equal(resolvePresentedLodLevel(lod, 12, 5, false, type), 'lod0');
  }
  assert.equal(resolvePresentedLodLevel(lod, 12, 6, true, 'ship'), 'lod0');
});

test('non-ship detail retains its authored projected-size selector', () => {
  const lod = createLodState();
  assert.equal(resolvePresentedLodLevel(lod, 10, 0, false, 'asteroid'), 'lod1');
  assert.equal(resolvePresentedLodLevel(lod, 10, 2, false, 'asteroid'), 'lod1');
  assert.equal(resolvePresentedLodLevel(lod, 10, 4, false, 'asteroid'), 'lod2');
});

test('authored ship admission and the first visible frame request the same full body', () => {
  const oldLod = createLodState();
  oldLod.adopt('lod2', 12);
  const lod = createLodState();
  const applied = [];
  let damageEntity = null;
  const authored = { userData: { lod, updateLod: (level) => applied.push(level),
    updateDamageState: (entity) => { damageEntity = entity; } } };
  const entity = { type: 'ship', hull: 40 };
  primeAuthoredState(authored, { userData: { lod: oldLod } }, entity);
  assert.deepEqual(applied, ['lod0']);
  assert.equal(lod.level, 'lod0');
  assert.equal(resolvePresentedLodLevel(lod, 12, 2, false, 'ship'), applied[0]);
  assert.equal(damageEntity, entity, 'damage presentation still primes before publication');
});
