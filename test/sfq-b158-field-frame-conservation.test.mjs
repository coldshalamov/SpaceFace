import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { FIELD_FLAGS, FIELD_KINDS } from '../src/data/fields.js';
import { fields } from '../src/systems/fields.js';

const coatedHull = { id: 1, type: 'ship', mass: 20, coated: true };
const inside = { x: 40, z: 0 };

function boundary(frame) {
  return normalizeField({
    id: 'moving-boundary', kind: FIELD_KINDS.BOUNDARY,
    center: { x: 0, z: 0 }, radius: 180, strength: 14, damping: 1.5, frame,
  });
}

test('a coated hull is damped relative to the moving boundary', () => {
  const state = createGameState(4242);
  const frame = { x: 12, z: -5 };
  const velocity = { x: 22, z: 4 };
  const relative = { x: velocity.x - frame.x, z: velocity.z - frame.z };
  const moving = sampleFieldAcceleration(inside, velocity, [boundary(frame)], state.simTime, coatedHull);
  const stationary = sampleFieldAcceleration(inside, relative, [boundary({ x: 0, z: 0 })], state.simTime, coatedHull);
  assert.deepEqual(moving, stationary, 'the same relative motion must receive the same damping');
  assert.deepEqual(moving, { ax: -15, az: -13.5 });
  const matched = sampleFieldAcceleration(inside, frame, [boundary(frame)], state.simTime, coatedHull);
  assert.deepEqual(matched, { ax: 0, az: 0 }, 'a hull moving with the field needs no damping');
  assert.deepEqual(velocity, { x: 22, z: 4 });
  assert.deepEqual(frame, { x: 12, z: -5 });
});

test('stationary and unframed boundaries keep the existing damping numbers', () => {
  const state = createGameState(4242);
  const velocity = { x: 10, z: 4 };
  for (const frame of [{ x: 0, z: 0 }, undefined]) {
    const acceleration = sampleFieldAcceleration(inside, velocity, [boundary(frame)], state.simTime, coatedHull);
    assert.deepEqual(acceleration, { ax: -15, az: -6 });
  }
});

function laneFixture() {
  const sim = createSimulation({ seed: 4242, systems: [fields] });
  sim.state.mode = 'flight';
  sim.state.input.actions = {};
  const system = sim.registry.get('fields');
  const lane = system.registerExternal({
    id: 'corner-lane', kind: FIELD_KINDS.LANE,
    center: { x: 0, z: 0 }, dir: { x: 0.6, z: 0.8 },
    radius: 100, halfWidth: 100, strength: 18,
  });
  const shipAt = (along, sideways) => sim.spawn({
    type: 'ship', team: 0, radius: 2, collides: true,
    pos: { x: along * lane.dir.x - sideways * lane.dir.z,
      z: along * lane.dir.z + sideways * lane.dir.x },
    vel: { x: 0, z: 0 }, hull: 200, hullMax: 200,
    physicsBody: { schemaVersion: 1, dynamic: true, radius: 2, mass: 20,
      inertiaY: 40, material: 'ship', revision: 0 },
  });
  const corner = shipAt(0.9 * lane.radius, 0.8 * lane.halfWidth);
  const middle = shipAt(0.5 * lane.radius, 0);
  const outside = shipAt(0.9 * lane.radius, 1.01 * lane.halfWidth);
  assert.ok(Math.hypot(corner.pos.x, corner.pos.z) > lane.radius + corner.radius);
  return { sim, system, lane, corner, middle, outside };
}

test('lane candidates include corridor corners and exclude ships beside the lane', () => {
  const { sim, system, lane, corner, middle, outside } = laneFixture();
  const candidates = system._collectFieldCandidates(lane, sim.state, []);
  assert.ok(candidates.includes(corner), 'a ship inside the rectangular corner must be a candidate');
  assert.ok(candidates.includes(middle));
  assert.ok(!candidates.includes(outside));
});

test('fields update delivers the same lane push at the corner as in the middle', () => {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    const { sim, corner, middle, outside } = laneFixture();
    sim.step();
    const cornerCommand = consumePhysicsCommand(corner);
    const middleCommand = consumePhysicsCommand(middle);
    assert.ok(cornerCommand?.impulses.length, 'the corner ship must receive a lane impulse');
    assert.ok(middleCommand?.impulses.length);
    const impulse = cornerCommand.impulses[0];
    assert.ok(Math.abs(impulse.x / (20 * SIM_DT) - 18 * 0.6) < 1e-12);
    assert.ok(Math.abs(impulse.z / (20 * SIM_DT) - 18 * 0.8) < 1e-12);
    assert.equal(impulse.x, middleCommand.impulses[0].x);
    assert.equal(impulse.z, middleCommand.impulses[0].z);
    assert.equal(consumePhysicsCommand(outside), null, 'ships beside the lane receive no push');
    assert.deepEqual([corner.vel.x, corner.vel.y, corner.vel.z], [0, 0, 0], 'the field leaves velocity writes to physics');
  } finally {
    FIELD_FLAGS.enabled = previous;
  }
});
