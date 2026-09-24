// §22 G6 — impulse axis follows the hit, and a shield tick is not a hull cone.
import assert from 'node:assert/strict';
import test from 'node:test';

import { impactAxisAngle, impactRead } from '../src/render/combat/impactRead.js';

function angleDelta(a, b) {
  let d = Math.abs(a - b);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

test('the impact axis matches the impulse and shield versus hull pick different shapes', () => {
  const hull = impactRead({
    hullHit: true,
    approach: { x: 0, z: 40 },
    normal: { x: 1, z: 0 },
  });
  const shield = impactRead({
    shieldAbsorbed: true,
    hullHit: false,
    approach: { x: 30, z: 0 },
  });
  const impulse = Math.atan2(40, 0);
  assert.ok(angleDelta(impactAxisAngle(hull), impulse) < 0.05);
  assert.equal(hull.shapeId, 'hull-cone');
  assert.equal(shield.shapeId, 'shield-scar');
  assert.notEqual(hull.shapeId, shield.shapeId);
});
