import assert from 'node:assert/strict';
import test from 'node:test';

import { orbitNodePose } from '../src/combat/orbitNodes.js';

test('orbit periodTicks is converted from live simTime seconds', () => {
  const host = { x: 0, z: 0 };
  const quarterPeriodSeconds = 90 / 60 / 4;
  const pose = orbitNodePose(host, 0, 1, 48, quarterPeriodSeconds, 90);

  assert.ok(Math.abs(pose.x) < 1e-9, `quarter-period x should be 0, got ${pose.x}`);
  assert.ok(Math.abs(pose.z - 48) < 1e-9, `quarter-period z should be 48, got ${pose.z}`);
});
