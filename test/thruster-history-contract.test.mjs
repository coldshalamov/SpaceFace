import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { ContrailTrail, TRAIL_SECONDS } from '../src/render/thruster/ribbon/contrailTrail.js';
import { DriveForge } from '../src/render/thruster/ribbon/driveForge.js';

const BURN = { drive: 1, emitFloor: 0.02, emitting: true, boost: 0, dash: 0, reel: 0 };
const COLD_WITH_LEGACY_REEL = {
  drive: 0,
  emitFloor: 0.02,
  emitting: false,
  boost: 0,
  dash: 0,
  reel: 1,
};

function close(a, b, eps = 1e-5) {
  return Math.abs(a - b) <= eps;
}

test('the live forge follows the current nozzle axis, never the recorded-history tangent', () => {
  const forge = new DriveForge(THREE, {});
  const nozzle = {
    x: 5,
    y: 2,
    z: 3,
    aftX: 0,
    aftY: 0,
    aftZ: -2,
  };

  // Deliberately point the legacy/history-derived argument 90 degrees away from the real bell axis.
  forge.update(nozzle, { x: 1, y: 0, z: 0 }, {
    drive: 1,
    boost: 0,
    throatRadius: 1.3,
  });

  assert.ok(close(forge._aim.x, 5));
  assert.ok(close(forge._aim.y, 2));
  assert.ok(close(forge._aim.z, 2));
  assert.equal(forge.inspect().aimSource, 'current-nozzle-axis');
  assert.equal(forge.inspect().temporalModulation, false);
  forge.dispose();
});

test('a legacy reel hint has zero authority over recorded world-space history', () => {
  const trail = new ContrailTrail(THREE, {});
  const nozzle = { x: 0, y: 0, z: 0, aftX: -1, aftY: 0, aftZ: 0 };

  for (let i = 0; i < 30; i++) {
    nozzle.x += 2;
    nozzle.z = Math.sin(i * 0.17) * 5;
    trail.update(1 / 60, nozzle, BURN);
  }
  const before = trail.samplePositions().map((sample) => ({ ...sample }));
  assert.ok(before.length > 20);

  for (let i = 0; i < 12; i++) {
    nozzle.x += 9;
    nozzle.z -= 7;
    trail.update(1 / 60, nozzle, COLD_WITH_LEGACY_REEL);
  }

  const after = trail.samplePositions();
  assert.equal(after.length, before.length);
  for (let i = 0; i < before.length; i++) {
    assert.ok(close(after[i].x, before[i].x), `sample ${i} moved in x`);
    assert.ok(close(after[i].y, before[i].y), `sample ${i} moved in y`);
    assert.ok(close(after[i].z, before[i].z), `sample ${i} moved in z`);
    assert.ok(close(after[i].age, before[i].age + 0.2, 2e-4), `sample ${i} did not age normally`);
  }

  for (let i = 0; i < Math.ceil(TRAIL_SECONDS * 60) + 4; i++) {
    trail.update(1 / 60, nozzle, COLD_WITH_LEGACY_REEL);
  }
  assert.equal(trail.liveSampleCount(), 0);
  trail.dispose();
});
