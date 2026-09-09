import assert from 'node:assert/strict';
import test from 'node:test';

import { HullScorchPool } from '../src/render/weapons/contactMarks.js';
import { DistortionField } from '../src/render/weapons/distortionField.js';
import { FlipbookPool } from '../src/render/weapons/flipbookPool.js';
import { WeaponRibbonPool } from '../src/render/weapons/ribbonPool.js';

function spawn(pool, entityId) {
  return pool.spawn({
    entityId,
    x: entityId,
    y: 0,
    z: 0,
    width: 1,
    colorHead: '#ffffff',
    colorTail: '#ffffff',
    linger: 1,
  });
}

test('saturated weapon ribbons rotate eviction across pool slots', () => {
  const pool = new WeaponRibbonPool(null, { capacity: 2, segments: 4 });
  try {
    spawn(pool, 1);
    spawn(pool, 2);
    const firstReplacement = spawn(pool, 3);
    const secondReplacement = spawn(pool, 4);

    assert.notEqual(secondReplacement, firstReplacement);
    assert.deepEqual([...pool.byEntity.keys()].sort((a, b) => a - b), [3, 4]);
  } finally {
    pool.dispose();
  }
});

for (const fixture of [
  {
    name: 'flipbooks',
    create: () => new FlipbookPool(null, { capacity: 2 }),
    spawn: (pool, id) => pool.spawn({ x: id }),
    values: (pool) => pool.slots.map((slot) => slot.localX),
  },
  {
    name: 'hull scorches',
    create: () => new HullScorchPool(null, { capacity: 2 }),
    spawn: (pool, id) => pool.spawn({ localX: id }),
    values: (pool) => pool.slots.map((slot) => slot.localX),
  },
  {
    name: 'distortion fields',
    create: () => new DistortionField({ capacity: 2 }),
    spawn: (pool, id) => pool.spawn({ x: id }),
    values: (pool) => pool.slots.map((slot) => slot.x),
  },
]) {
  test(`saturated ${fixture.name} rotate eviction across pool slots`, () => {
    const pool = fixture.create();
    try {
      fixture.spawn(pool, 1);
      fixture.spawn(pool, 2);
      const firstReplacement = fixture.spawn(pool, 3);
      const secondReplacement = fixture.spawn(pool, 4);

      assert.notEqual(secondReplacement, firstReplacement);
      assert.deepEqual(fixture.values(pool).sort((a, b) => a - b), [3, 4]);
    } finally {
      pool.dispose();
    }
  });
}

test('weapon effect pools preserve explicit zero intensity and color channels', () => {
  const flipbooks = new FlipbookPool(null, { capacity: 1 });
  const scorches = new HullScorchPool(null, { capacity: 1 });
  const distortion = new DistortionField({ capacity: 1 });
  try {
    const flipbookSlot = flipbooks.spawn({ intensity: 0, r: 0, g: 0, b: 0 });
    assert.equal(flipbooks.slots[flipbookSlot].intensity, 0);
    assert.deepEqual(
      [flipbooks.slots[flipbookSlot].r, flipbooks.slots[flipbookSlot].g, flipbooks.slots[flipbookSlot].b],
      [0, 0, 0],
    );

    const scorchSlot = scorches.spawn({ r: 0, g: 0, b: 0 });
    assert.deepEqual(
      [scorches.slots[scorchSlot].r, scorches.slots[scorchSlot].g, scorches.slots[scorchSlot].b],
      [0, 0, 0],
    );

    const distortionSlot = distortion.spawn({ strength: 0 });
    assert.equal(distortion.slots[distortionSlot].strength, 0);
  } finally {
    flipbooks.dispose();
    scorches.dispose();
    distortion.dispose();
  }
});
