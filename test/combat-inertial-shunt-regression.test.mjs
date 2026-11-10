import assert from 'node:assert/strict';
import test from 'node:test';

import {
  tryApplyInertialShuntFromImpact,
} from '../src/combat/inertialShunt.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { INERTIAL_SHUNT_WEAPON_ID } from '../src/data/combatDefs.js';

function hull(id, position, velocity, fittings = []) {
  return {
    id,
    type: 'ship',
    alive: true,
    mass: 24,
    pos: position,
    vel: velocity,
    data: {
      fittings,
      weapons: fittings.map((defId, slotIndex) => ({ defId, slotIndex })),
    },
  };
}

test('inertial shunt ignores a tangential impact with zero radial closure', () => {
  const shunter = hull(
    1,
    { x: 0, z: 0 },
    { x: 100, z: 0 },
    [INERTIAL_SHUNT_WEAPON_ID],
  );
  const target = hull(2, { x: 0, z: 24 }, { x: 0, z: 0 });
  const state = {
    tick: 7,
    playerId: shunter.id,
    entities: new Map([[shunter.id, shunter], [target.id, target]]),
  };
  const getEntity = (id) => state.entities.get(id);
  const shunterImpulse = { x: 0, y: 0, z: 0 };
  const targetImpulse = { x: 0, y: 0, z: 0 };

  const result = tryApplyInertialShuntFromImpact(
    state,
    {
      aId: shunter.id,
      bId: target.id,
      tick: state.tick,
      normal: { x: 0, z: 1 },
      preSolveClosingSpeed: 0,
    },
    getEntity,
    shunterImpulse,
    targetImpulse,
    new Map(),
  );

  assert.equal(result, null);
  assert.deepEqual(shunterImpulse, { x: 0, y: 0, z: 0 });
  assert.deepEqual(targetImpulse, { x: 0, y: 0, z: 0 });
  assert.equal(consumePhysicsCommand(shunter), null);
  assert.equal(consumePhysicsCommand(target), null);
});

test('inertial shunt uses the impact normal and radial closure, not tangent speed', () => {
  const shunter = hull(
    3,
    { x: 0, z: 0 },
    { x: 100, z: 60 },
    [INERTIAL_SHUNT_WEAPON_ID],
  );
  const target = hull(4, { x: 0, z: 24 }, { x: 0, z: 0 });
  const state = {
    tick: 8,
    playerId: shunter.id,
    entities: new Map([[shunter.id, shunter], [target.id, target]]),
  };
  const shunterImpulse = { x: 0, y: 0, z: 0 };
  const targetImpulse = { x: 0, y: 0, z: 0 };

  const result = tryApplyInertialShuntFromImpact(
    state,
    {
      aId: shunter.id,
      bId: target.id,
      tick: state.tick,
      normal: { x: 0, z: 1 },
      preSolveClosingSpeed: 60,
    },
    (id) => state.entities.get(id),
    shunterImpulse,
    targetImpulse,
    new Map(),
  );

  assert.ok(result);
  assert.equal(targetImpulse.x, 0);
  assert.equal(targetImpulse.z, 1368);
  assert.equal(result.targetDeltaV, 57);
});
