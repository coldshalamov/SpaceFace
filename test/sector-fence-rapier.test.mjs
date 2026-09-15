import assert from 'node:assert/strict';
import test from 'node:test';

import { physics } from '../src/core/physics.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

const DT = 1 / 60;

function ship(id, x, z, mass = 20) {
  return { id, type: 'ship', alive: true, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, mass, radius: 4 };
}

function stateWith(ships, bounds) {
  return { tick: 12, bounds, entityList: ships, entityIndex: null };
}

test('the sector soft fence reaches ships under SG-02 authority as a queued inward impulse', () => {
  const bounds = { center: { x: 0, z: 0 }, radius: 1000, hardRadius: 1500 };
  const inside = ship(1, 500, 0);
  const past = ship(2, 1250, 0);       // halfway between soft and hard radius
  const farPast = ship(3, 0, 3000);    // beyond the hard radius: full 60 WU/s^2
  const notAShip = { ...ship(4, 2000, 0), type: 'wreck' };
  const state = stateWith([inside, past, farPast, notAShip], bounds);

  physics._queueSectorFenceImpulses(DT, state);

  assert.equal(consumePhysicsCommand(inside), null, 'a ship inside the soft radius gets no fence impulse');
  assert.equal(consumePhysicsCommand(notAShip), null, 'the fence only herds ships');

  const half = consumePhysicsCommand(past);
  assert.ok(half && half.impulses.length === 1, 'one fence impulse per tick');
  const expectedHalf = -(60 * 0.5 * DT) * past.mass;
  assert.ok(Math.abs(half.impulses[0].x - expectedHalf) < 1e-9, `inward impulse ramps with overshoot (got ${half.impulses[0].x})`);
  assert.ok(Math.abs(half.impulses[0].z) < 1e-12);
  assert.equal(half.impulses[0].provenance, 'sector-fence');
  assert.equal(half.impulses[0].tick, 12);

  const full = consumePhysicsCommand(farPast);
  assert.ok(Math.abs(full.impulses[0].z - (-(60 * DT) * farPast.mass)) < 1e-9, 'past the hard radius the ramp saturates');
  assert.ok(Math.abs(full.impulses[0].x) < 1e-12);
});

test('the fence is a no-op without sector bounds', () => {
  const s = ship(1, 5000, 5000);
  physics._queueSectorFenceImpulses(DT, stateWith([s], null));
  assert.equal(consumePhysicsCommand(s), null);
});
