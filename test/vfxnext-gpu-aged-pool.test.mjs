import assert from 'node:assert/strict';
import test from 'node:test';

import { createSparkSubstrate } from '../src/vfxnext/core/gpuAged.js';

test('NaN or non-positive life is refused so a spawn cannot leak a permanent slot', () => {
  const sparks = createSparkSubstrate(8);
  assert.equal(sparks.spawn(0, { x: 0, y: 0, z: 0, life: Number.NaN }), -1);
  assert.equal(sparks.spawn(0, { x: 0, y: 0, z: 0, life: 0 }), -1);
  assert.equal(sparks.spawn(0, { x: 0, y: 0, z: 0, life: -1 }), -1);
  assert.equal(sparks.spawn(Number.NaN, { x: 0, y: 0, z: 0, life: 1 }), -1);
  assert.equal(sparks.spawn(0, { x: Number.NaN, y: 0, z: 0, life: 1 }), -1);

  const first = sparks.spawn(0, { x: 1, y: 0, z: 0, life: 1, priority: 1 });
  assert.ok(first >= 0);
  sparks.update(0);
  assert.equal(sparks.live, 1);

  // A bad spawn must not occupy or pin the live slot.
  assert.equal(sparks.spawn(0.1, { x: 2, y: 0, z: 0, life: Number.NaN, priority: 9 }), -1);
  sparks.update(0.1);
  assert.equal(sparks.live, 1);

  sparks.update(1.1);
  assert.equal(sparks.live, 0, 'the honest particle still expires');
  sparks.dispose();
});

test('a previously leaked NaN expiry is reclaimable on the next claim', () => {
  const sparks = createSparkSubstrate(4);
  const slots = [];
  for (let i = 0; i < 4; i++) {
    slots.push(sparks.spawn(0, { x: i, y: 0, z: 0, life: 10, priority: 5 }));
  }
  assert.ok(slots.every((slot) => slot >= 0));
  const poisoned = slots[2];
  sparks._expiry[poisoned] = Number.NaN;
  const reuse = sparks.spawn(1, { x: 9, y: 0, z: 0, life: 0.2, priority: 0 });
  assert.equal(reuse, poisoned, 'NaN expiry must count as free, not immortal');
  sparks.dispose();
});
