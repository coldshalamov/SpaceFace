import assert from 'node:assert/strict';

import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;
const CASES = 1000;
const BATCH = 50;
const STEPS = 90;

let completed = 0;
for (let base = 0; base < CASES; base += BATCH) {
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  const entities = [];
  const pairs = [];
  try {
    const count = Math.min(BATCH, CASES - base);
    for (let i = 0; i < count; i++) {
      const lane = base + i;
      const z = lane * 32;
      const ship = makeShip(10000 + lane, -64, z);
      const rock = makeRock(20000 + lane, 0, z);
      entities.push(ship, rock);
      pairs.push([ship, rock]);
    }

    runtime.syncFromEntities(entities);
    for (const [ship] of pairs) {
      assert.equal(queuePhysicsImpulse(ship, { x: 2200, y: 123, z: 0 }), true, 'dash impulse should queue through membrane');
    }
    for (let step = 0; step < STEPS; step++) runtime.step(DT);

    for (const [ship, rock] of pairs) {
      assertFinite(ship);
      const minX = rock.pos.x - rock.radius - ship.radius - 0.75;
      assert(ship.pos.x <= minX,
        `dash collision tunneled through obstacle for ship ${ship.id}: x=${ship.pos.x}, limit=${minX}`);
      completed++;
    }
  } finally {
    runtime.dispose();
  }
}

assert.equal(completed, CASES, 'dash collision suite should execute every authored case');
console.log('SG-02 dash collision checks OK');

function makeShip(id, x, z) {
  return {
    id,
    type: 'ship',
    alive: true,
    radius: 4,
    mass: 24,
    physicsBody: {
      schemaVersion: 1,
      radius: 4,
      mass: 24,
      inertiaY: 48,
      dynamic: true,
      ccd: true,
      revision: 0,
    },
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    data: {},
  };
}

function makeRock(id, x, z) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    radius: 8,
    mass: 100000,
    physicsBody: {
      schemaVersion: 1,
      radius: 8,
      mass: 100000,
      inertiaY: 100000,
      dynamic: false,
      ccd: false,
      revision: 0,
    },
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    data: {},
  };
}

function assertFinite(entity) {
  for (const [label, value] of [
    ['pos.x', entity.pos.x],
    ['pos.z', entity.pos.z],
    ['vel.x', entity.vel.x],
    ['vel.z', entity.vel.z],
    ['rot', entity.rot],
    ['angVel', entity.angVel],
  ]) {
    assert(Number.isFinite(value), `${entity.id} ${label} should remain finite`);
  }
}
