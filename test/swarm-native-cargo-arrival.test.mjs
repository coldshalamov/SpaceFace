import test from 'node:test';
import assert from 'node:assert/strict';
import { swarmPlacementIsClear, findSwarmArrival } from '../src/systems/swarmSafety.js';

test('Swarm arrivals avoid swept native cargo while sensor markers remain passable', () => {
  const cargo = { id: 2, type: 'payload', alive: true, collides: true, radius: 12,
    pos: { x: 200, z: 30 }, vel: { x: 0, z: -80 }, physicsBody: { schemaVersion: 1, dynamic: true, material: 'debris' } };
  const player = { id: 1, type: 'ship', alive: true, radius: 6, pos: { x: 0, z: 0 } };
  const state = { playerId: 1, entities: new Map([[1, player], [2, cargo]]) };
  assert.equal(swarmPlacementIsClear(state, { x: 200, z: 0 }, 8), false);
  const arrival = findSwarmArrival(state, { x: 200, z: 0 }, 8);
  assert.ok(arrival); assert.equal(swarmPlacementIsClear(state, arrival, 8), true);
  cargo.physicsBody.material = 'massline_sensor';
  assert.equal(swarmPlacementIsClear(state, { x: 200, z: 0 }, 8), true);
});
