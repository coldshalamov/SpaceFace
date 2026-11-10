// One impact scale. Three closing speeds must not get softer as they get harder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCollisionFeel } from '../src/render/feel.js';

const SPEEDS = [20, 80, 150];

function feelAt(deltaV) {
  return resolveCollisionFeel(
    { id: 'impact' },
    { deltaV, feelDeltaV: deltaV, mode: 'flight', playerDistance: 0, momentum: deltaV * 20, kickDirX: 1, kickDirZ: 0 },
  );
}

test('hit-stop, trauma, and pitch rise together as the closing speed rises', () => {
  assert.equal(typeof resolveCollisionFeel, 'function');
  const samples = SPEEDS.map(feelAt);
  assert.equal(samples.some((sample) => sample == null), false);
  for (let i = 1; i < samples.length; i += 1) {
    assert.ok(samples[i].hsDur >= samples[i - 1].hsDur, `hit-stop ${SPEEDS[i]}`);
    assert.ok(samples[i].trauma >= samples[i - 1].trauma, `trauma ${SPEEDS[i]}`);
    assert.ok(samples[i].fov >= samples[i - 1].fov, `pitch ${SPEEDS[i]}`);
  }
});
