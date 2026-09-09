import test from 'node:test';
import assert from 'node:assert/strict';

import { core } from '../src/core/coreSystem.js';
import { isDynamicPhysicsBodyEntity } from '../src/core/physicsAuthority.js';

function position(x, z) {
  return {
    x,
    z,
    copy(value) {
      this.x = value.x;
      this.z = value.z;
      return this;
    },
  };
}

function entity(type, x, z, data = {}) {
  return {
    id: `${type}:${x}:${z}`,
    type,
    alive: true,
    collides: true,
    radius: 4,
    pos: position(x, z),
    prevPos: position(-999, -999),
    rot: 0.7,
    prevRot: -999,
    bank: 0.2,
    prevBank: -999,
    pitch: -0.1,
    prevPitch: -999,
    data,
  };
}

test('Rapier-owned wrecks and fracture chunks snapshot their render interpolation pose', () => {
  const wreck = entity('wreck', 42, -17);
  const chunk = entity('asteroid', -12, 31, { isChunk: true });
  const staticRock = entity('asteroid', 7, 9);
  const state = {
    tick: 0,
    simTime: 0,
    days: 0,
    meta: { playtimeS: 0 },
    entityList: [wreck, chunk, staticRock],
  };

  assert.equal(isDynamicPhysicsBodyEntity(wreck), true);
  assert.equal(isDynamicPhysicsBodyEntity(chunk), true);
  assert.equal(isDynamicPhysicsBodyEntity(staticRock), false);

  core.preStep.call({ _lastDay: 0, bus: { emit() {} } }, 1 / 60, state);

  for (const moving of [wreck, chunk]) {
    assert.deepEqual(
      { x: moving.prevPos.x, z: moving.prevPos.z, rot: moving.prevRot },
      { x: moving.pos.x, z: moving.pos.z, rot: moving.rot },
      `${moving.type} interpolation origin must follow the current physics pose`,
    );
  }
  assert.deepEqual(
    { x: staticRock.prevPos.x, z: staticRock.prevPos.z },
    { x: -999, z: -999 },
    'ordinary static asteroids should not be promoted into the per-frame movable set',
  );
});

test('every dynamic physics classification shares the same render interpolation snapshot contract', () => {
  const dynamicEntities = [
    entity('ship', 1, 2),
    entity('drone', 3, 4),
    entity('payload', 5, 6),
    entity('projectile', 7, 8),
    entity('pickup', 9, 10),
    entity('wreck', 11, 12),
    entity('asteroid', 13, 14, { isChunk: true }),
    entity('asteroid', 15, 16, { majorDebris: true }),
    entity('fx', 17, 18, { tetherPayload: true }),
    { ...entity('station', 19, 20), physicsBody: { dynamic: true } },
  ];
  const state = {
    tick: 0,
    simTime: 0,
    days: 0,
    meta: { playtimeS: 0 },
    entityList: dynamicEntities,
  };

  for (const moving of dynamicEntities) {
    assert.equal(isDynamicPhysicsBodyEntity(moving), true, `${moving.type} fixture must be dynamic`);
  }

  core.preStep.call({ _lastDay: 0, bus: { emit() {} } }, 1 / 60, state);

  for (const moving of dynamicEntities) {
    assert.deepEqual(
      { x: moving.prevPos.x, z: moving.prevPos.z, rot: moving.prevRot },
      { x: moving.pos.x, z: moving.pos.z, rot: moving.rot },
      `${moving.type} must never interpolate against a stale spawn pose`,
    );
  }
});
