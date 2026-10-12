import test from 'node:test';
import assert from 'node:assert/strict';
import { swarmArena } from '../src/systems/swarmArena.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';

test('between rounds a rock still flying from the last fight is stopped through the physics port', () => {
  const calls = [];
  const sys = Object.create(swarmArena);
  sys.helpers = { combatPhysics: { applyImpulse: (input) => { calls.push(input); return true; } } };
  sys.state = {
    tick: 5,
    entities: new Map([
      [1, { id: 1, type: 'asteroid', alive: true, mass: 40, vel: { x: 150, z: -20 } }],
      [2, { id: 2, type: 'asteroid', alive: true, mass: 40, vel: { x: 1, z: 0 } }],
      [3, { id: 3, type: 'ship', alive: true, mass: 10, vel: { x: 200, z: 0 } }],
      [4, { id: 4, type: 'wreck', alive: true, radius: 12, vel: { x: 0, z: 75 } }],
    ]),
  };
  sys._settleRoom();
  assert.deepEqual(calls.map((c) => c.entityId), [1, 4], 'moving rocks and wrecks settle; ships keep their momentum');
  const m1 = resolvePhysicsBodySpec(sys.state.entities.get(1)).mass;
  const m4 = resolvePhysicsBodySpec(sys.state.entities.get(4)).mass;
  assert.deepEqual(calls[0].impulse, { x: -150 * m1, z: 20 * m1 }, 'sized on the solver body mass');
  assert.deepEqual(calls[1].impulse, { x: -0 * m4, z: -75 * m4 });
});
