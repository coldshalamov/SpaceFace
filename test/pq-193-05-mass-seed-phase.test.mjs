import assert from 'node:assert/strict';
import test from 'node:test';

import { createVisualFactory } from '../src/render/visualFactory.js';

function createSeed() {
  const entity = { type: 'massSeed', radius: 7, data: { massSeedState: { phase: 'travel' } } };
  const root = createVisualFactory().build(entity);
  const struts = Array.from({ length: 4 }, (_, i) => root.getObjectByName(`MassSeedFrameStrut_${i + 1}`));
  const pylons = Array.from({ length: 3 }, (_, i) => root.getObjectByName(`MassSeedAnchorPylon_${i + 1}`));
  const gyro = root.getObjectByName('MassSeedFrameLockGyro');
  return {
    root,
    update(phase, now) {
      entity.data.massSeedState.phase = phase;
      root.userData.updateRuntimeState(entity, now);
    },
    pose() {
      return {
        strutRadii: struts.map((strut) => Math.hypot(strut.position.x, strut.position.z)),
        strutLengths: struts.map((strut) => strut.scale.x),
        pylonScales: pylons.map((pylon) => pylon.scale.x),
        pylonHeights: pylons.map((pylon) => pylon.position.y),
        gyroScale: gyro.scale.x,
      };
    },
  };
}

for (const lockingElapsed of [0.3, 1]) {
  test(`locking to active preserves the rendered frame pose after ${lockingElapsed}s`, () => {
    const seed = createSeed();
    seed.update('locking', 10);
    seed.update('locking', 10 + lockingElapsed);
    const before = seed.pose();
    assert.ok(before.strutRadii.every((radius) => radius > 0.7), 'locking has deployed the frame');

    seed.update('active', 10 + lockingElapsed + 1 / 60);
    assert.deepEqual(seed.pose(), before, 'activation must not fold or rescale deployed hardware');
    assert.equal(seed.root.getObjectByName('MassSeedStatusBeacon').material.name, 'MassSeedBeaconActive');

    for (const elapsed of [0.05, 0.15, 0.35, 0.5]) {
      const previous = seed.pose();
      seed.update('active', 10 + lockingElapsed + 1 / 60 + elapsed);
      const current = seed.pose();
      assert.ok(current.strutRadii.every((radius, i) => radius >= previous.strutRadii[i] - 1e-12),
        'remaining deployment continues outward without reopening from zero');
      assert.ok(current.pylonScales.every((scale, i) => scale >= previous.pylonScales[i] - 1e-12));
    }
    assert.ok(seed.pose().strutRadii.every((radius) => Math.abs(radius - 0.78) < 1e-12));
    assert.ok(seed.pose().pylonScales.every((scale) => scale === 1));
  });
}

test('active to warning retracts continuously from the deployed pose to the warning pose', () => {
  const seed = createSeed();
  seed.update('active', 10);
  seed.update('active', 11);
  const before = seed.pose();

  seed.update('warning', 12);
  assert.deepEqual(seed.pose(), before, 'warning must start at the visible active pose');
  assert.equal(seed.root.getObjectByName('MassSeedStatusBeacon').material.name, 'MassSeedBeaconWarning');

  for (const elapsed of [0.05, 0.15, 0.35, 0.5]) {
    const previous = seed.pose();
    seed.update('warning', 12 + elapsed);
    const current = seed.pose();
    assert.ok(current.strutRadii.every((radius, i) => radius <= previous.strutRadii[i] + 1e-12),
      'warning retracts rather than folding shut and reopening');
    assert.ok(current.pylonScales.every((scale, i) => scale <= previous.pylonScales[i] + 1e-12 && scale >= 0.82),
      'pylons stay deployed throughout the warning transition');
  }
  assert.ok(seed.pose().strutRadii.every((radius) => Math.abs(radius - 0.7008) < 1e-12));
  assert.ok(seed.pose().pylonScales.every((scale) => Math.abs(scale - 0.82) < 1e-12));
});

test('collapse still folds immediately and the next deployment starts folded', () => {
  const seed = createSeed();
  const folded = seed.pose();
  seed.update('active', 10);
  seed.update('active', 11);
  seed.update('warning', 12);
  seed.update('warning', 12.15);
  seed.update('collapsing', 12.2);
  assert.deepEqual(seed.pose(), folded);
  seed.update('locking', 13);
  assert.deepEqual(seed.pose(), folded, 'a new deployment must not inherit the retired anchor pose');
});
