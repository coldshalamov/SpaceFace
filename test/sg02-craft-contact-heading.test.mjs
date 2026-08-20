import assert from 'node:assert/strict';
import { test } from 'node:test';

import { queuePhysicsTorqueImpulse } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;

test('a glancing asteroid bump does not reverse a ship or leave it spinning', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const ship = makeCraft(1, 'ship', { x: -36, z: 5, vx: 48 });
    const drone = makeCraft(2, 'drone', { x: -36, z: -28, vx: 48 });
    const rockA = makeRock(10, { x: 0, z: 0 });
    const rockB = makeRock(11, { x: 0, z: -33 });
    owner.syncFromEntities([ship, drone, rockA, rockB]);

    let shipHit = false;
    let droneHit = false;
    for (let i = 0; i < 90; i++) {
      owner.step(DT);
      for (const impact of owner.drainContactImpacts()) {
        if (impact.aId === ship.id || impact.bId === ship.id) shipHit = true;
        if (impact.aId === drone.id || impact.bId === drone.id) droneHit = true;
      }
    }

    assert.equal(shipHit, true, 'the ship must actually strike the rock');
    assert.equal(droneHit, true, 'the drone must actually strike the rock');
    assert.ok(ship.pos.x < rockA.pos.x - 2, 'the ship must not tunnel through the rock');
    assert.ok(Math.abs(ship.angVel) < 0.2,
      `ship must not keep spinning after a bump (angVel=${ship.angVel})`);
    assert.ok(Math.abs(ship.rot) < 0.45,
      `ship must not reverse heading after a bump (rot=${ship.rot})`);
    assert.ok(Math.abs(drone.angVel) < 0.2,
      `drone must not keep spinning after a bump (angVel=${drone.angVel})`);
    assert.ok(Math.abs(drone.rot) < 0.45,
      `drone must not reverse heading after a bump (rot=${drone.rot})`);
  } finally {
    owner.dispose();
  }
});

test('authored yaw torque still turns a ship, including after a bump', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const ship = makeCraft(3, 'ship', { x: 0, z: 0, vx: 0 });
    owner.syncFromEntities([ship]);
    assert.equal(queuePhysicsTorqueImpulse(ship, { x: 0, y: 40, z: 0 }), true);
    owner.step(DT);
    assert.ok(ship.rot > 0.01, 'a queued torque impulse must still yaw the hull');
    assert.ok(ship.angVel > 0.01, 'a queued torque impulse must still raise yaw rate');
  } finally {
    owner.dispose();
  }
});

function makeCraft(id, type, pose) {
  return {
    id,
    type,
    alive: true,
    radius: type === 'drone' ? 4 : 6,
    mass: type === 'drone' ? 8 : 24,
    pos: { x: pose.x, z: pose.z },
    vel: { x: pose.vx, z: 0 },
    rot: 0,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1,
      radius: type === 'drone' ? 4 : 6,
      mass: type === 'drone' ? 8 : 24,
      inertiaY: type === 'drone' ? 16 : 48,
      dynamic: true,
      ccd: true,
      revision: 0,
    },
    data: type === 'ship' ? { defId: 'ship_kestrel' } : {},
  };
}

function makeRock(id, pose) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    radius: 10,
    mass: 1_000_000,
    pos: { x: pose.x, z: pose.z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1,
      radius: 10,
      mass: 1_000_000,
      inertiaY: 1_000_000,
      dynamic: false,
      ccd: false,
      revision: 0,
    },
    data: {},
  };
}
