// W2-C / O22: the legacy collision path divided by Math.max(0.1, e.mass), which is NaN when a body
// never declared a mass; the NaN then rode pushApart/impulse into positions and velocities.
import test from 'node:test';
import assert from 'node:assert/strict';

import { physics } from '../src/core/physics.js';
import { createGameState } from '../src/core/gameState.js';

function body({ id, type = 'ship', x, vx = 0, mass }) {
  const b = {
    id, type, alive: true, collides: true, collisionMask: 0xffff,
    pos: { x, z: 0 }, vel: { x: vx, z: 0 }, radius: 10, team: 0, flags: {}, data: {},
  };
  if (mass !== undefined) b.mass = mass;
  return b;
}

function collide(a, b) {
  const state = createGameState(22000);
  state.mode = 'flight';
  state.playerId = 99;
  const bus = { emit() {} };
  const host = Object.create(physics);
  host._pairMaterialScratch = {};
  host._impactOptionsScratch = {
    backend: 'custom', tick: 0, normal: { x: 0, z: 0 }, causalActorId: null, preSolveClosingSpeed: 0,
  };
  const dx = b.pos.x - a.pos.x;
  host.resolvePair(a, b, Math.abs(dx), dx, 0, bus, state);
}

const finite = (v) => Number.isFinite(v.x) && Number.isFinite(v.z);

test('two ships with no declared mass collide without NaN positions or velocities', () => {
  const a = body({ id: 1, x: 0, vx: 40 });
  const b = body({ id: 2, x: 15 });
  collide(a, b);
  assert.ok(finite(a.pos) && finite(b.pos), 'positions stay finite');
  assert.ok(finite(a.vel) && finite(b.vel), 'velocities stay finite');
  assert.ok(a.vel.x < 40, 'the exchange still happened (a slowed)');
  assert.ok(b.vel.x > 0, 'the exchange still happened (b picked up speed)');
});

test('an undeclared mass reads as 1: it trades momentum like a declared mass-1 hull', () => {
  const a = body({ id: 1, x: 0, vx: 40 });
  const b = body({ id: 2, x: 15 });
  const refA = body({ id: 1, x: 0, vx: 40, mass: 1 });
  const refB = body({ id: 2, x: 15, mass: 1 });
  collide(a, b);
  collide(refA, refB);
  assert.deepEqual(a.vel, refA.vel);
  assert.deepEqual(b.vel, refB.vel);
});

test('a declared mass still weighs the exchange, and a station stays immovable', () => {
  const heavy = body({ id: 1, x: 0, vx: 40, mass: 200 });
  const light = body({ id: 2, x: 15, mass: 5 });
  collide(heavy, light);
  assert.ok(light.vel.x > heavy.vel.x, 'the light hull took more of the exchange');

  const ship = body({ id: 3, x: 0, vx: 40 });
  const station = body({ id: 4, type: 'station', x: 15 });
  collide(ship, station);
  assert.ok(finite(ship.vel) && finite(station.vel));
  assert.equal(station.vel.x, 0, 'a station does not move');
  assert.ok(ship.vel.x <= 0, 'the ship bounced back');
});
