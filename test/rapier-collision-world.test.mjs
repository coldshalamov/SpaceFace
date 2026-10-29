import test from 'node:test';
import assert from 'node:assert/strict';

import { createRapierCollisionWorld } from '../src/core/rapierCollisionWorld.js';

function ship(id, z) {
  return {
    id,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 10,
    pos: { x: 0, z },
    prevPos: { x: 0, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
  };
}

function station(id, z) {
  return {
    id,
    type: 'station',
    alive: true,
    collides: true,
    radius: 4,
    pos: { x: 0, z },
    prevPos: { x: 0, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
  };
}

test('observer contact diagnostics follow the craft colliders, not their radius balls', async () => {
  const observer = await createRapierCollisionWorld();
  try {
    const a = ship('a', 0);
    const b = station('b', 13);
    observer.syncFromEntities([a, b]);
    observer.step(1 / 60);
    assert.equal(observer.diagnostics().contacts, 0,
      'radius balls overlap, but the craft capsule and station collider remain separated');

    b.pos.z = 0;
    b.prevPos.z = 0;
    observer.syncFromEntities([a, b]);
    observer.step(1 / 60);
    assert.ok(observer.diagnostics().collisionEvents > 0, 'the overlap produces native collision events');
    assert.equal(observer.diagnostics().contacts, 1,
      'the physical craft-to-station contact is counted once');
  } finally {
    observer.dispose();
  }
});
