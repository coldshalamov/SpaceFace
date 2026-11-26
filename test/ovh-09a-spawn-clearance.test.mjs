import assert from 'node:assert/strict';
import test from 'node:test';

import { mulberry32 } from '../src/core/rng.js';
import {
  findClearSpawnPoint,
  spawnClearanceRadius,
  spawnPointIsClear,
  SPAWN_PATH_PREDICT_S,
} from '../src/systems/spawnClearance.js';

function bodyRow(id, { type = 'asteroid', x, z, radius = 10, vx = 0, vz = 0 }) {
  return {
    id, type, alive: true, collides: true,
    pos: { x, z }, vel: { x: vx, z: vz },
    radius, mass: radius * radius * 40, data: {},
  };
}

// Minimal live-state seam: the contract reads state.entities (Map.values), the dormant
// asteroid-field shelf, and an optional state.rng — exactly the fields it is written for.
function fixtureState(obstacles = [], dormant = [], seed = 4242) {
  const entities = new Map();
  const entityList = [];
  for (const row of obstacles) {
    entities.set(row.id, row);
    entityList.push(row);
  }
  return {
    entities,
    entityList,
    world: {
      asteroidField: {
        schema: 'spaceface.asteroidField.v1',
        rocks: dormant.map((row, i) => ({
          id: 9000 + i, type: 'asteroid', fieldResident: true, alive: true,
          liveEntityId: null,
          pos: { x: row.x, z: row.z }, vel: { x: row.vx || 0, z: row.vz || 0 },
          radius: row.radius, mass: row.radius * row.radius * 40, data: {},
        })),
      },
    },
    rng: mulberry32(seed),
    simTime: 0,
    tick: 0,
  };
}

test('OVH-09a: a request onto an occupied point lands clear of the live body', () => {
  const state = fixtureState([bodyRow(1, { x: 0, z: 0, radius: 20 })]);
  const req = { x: 0, z: 0, radius: 10, vel: { x: 0, z: 0 } };
  assert.equal(spawnPointIsClear(state, req), false, 'the requested point is occupied');

  const seat = findClearSpawnPoint(state, { ...req, rng: mulberry32(7) });
  assert.ok(seat, 'a bounded retry found a seat');
  assert.ok(seat.x !== 0 || seat.z !== 0, 'the seat is not the occupied point');
  assert.ok(seat.attempt >= 1, 'attempt 0 was refused');
  assert.ok(
    spawnPointIsClear(state, { x: seat.x, z: seat.z, radius: req.radius, vel: req.vel }),
    'the admitted seat is itself clear under the contract',
  );
  const dist = Math.hypot(seat.x, seat.z);
  assert.ok(dist >= spawnClearanceRadius(req.radius) + 20 - 1e-6,
    'the seat honors the 2 × radius + 40 WU body footprint');
});

test('OVH-09a: the retry is deterministic for a seed', () => {
  const obstacles = [
    bodyRow(1, { x: 0, z: 0, radius: 20 }),
    bodyRow(2, { x: 150, z: 40, radius: 14, type: 'ship', vx: -30, vz: 0 }),
    bodyRow(3, { x: -90, z: -120, radius: 12 }),
  ];
  const a = findClearSpawnPoint(fixtureState(obstacles), {
    x: 0, z: 0, radius: 10, vel: { x: 0, z: 0 }, rng: mulberry32(99),
  });
  const b = findClearSpawnPoint(fixtureState(obstacles), {
    x: 0, z: 0, radius: 10, vel: { x: 0, z: 0 }, rng: mulberry32(99),
  });
  assert.ok(a && b, 'both seeded runs found a seat');
  assert.equal(a.x, b.x, 'same seed → same retry x');
  assert.equal(a.z, b.z, 'same seed → same retry z');
  assert.equal(a.attempt, b.attempt);
});

test('OVH-09a: an already-clear request is unchanged and draws no rng', () => {
  const state = fixtureState([bodyRow(1, { x: 900, z: 900, radius: 20 })]);
  let draws = 0;
  const seat = findClearSpawnPoint(state, {
    x: 500, z: -300, radius: 10, vel: { x: 0, z: 0 },
    rng: () => { draws += 1; return 0.5; },
  });
  assert.ok(seat);
  assert.equal(seat.x, 500, 'clear request keeps its x');
  assert.equal(seat.z, -300, 'clear request keeps its z');
  assert.equal(seat.attempt, 0, 'admitted on the first attempt');
  assert.equal(draws, 0, 'a clear request never touches the rng stream');
});

test('OVH-09a: a point on a 2 s collision course is refused', () => {
  // Hull inbound: reaches the request point inside the prediction horizon.
  const inbound = fixtureState([bodyRow(1, { type: 'ship', x: 200, z: 0, radius: 12, vx: -100, vz: 0 })]);
  assert.equal(
    spawnPointIsClear(inbound, { x: 0, z: 0, radius: 10, vel: { x: 0, z: 0 } }),
    false, 'a body arriving inside 2 s blocks the point',
  );
  // The same body moving AWAY never reaches it — the path check is directional, not radial.
  const outbound = fixtureState([bodyRow(1, { type: 'ship', x: 200, z: 0, radius: 12, vx: 100, vz: 0 })]);
  assert.equal(
    spawnPointIsClear(outbound, { x: 0, z: 0, radius: 10, vel: { x: 0, z: 0 } }),
    true, 'a body departing the horizon leaves the point clear',
  );
  // The spawn's OWN velocity counts: born moving into a hull is born on a collision course.
  const stillHull = fixtureState([bodyRow(1, { type: 'ship', x: 250, z: 0, radius: 12 })]);
  assert.equal(
    spawnPointIsClear(stillHull, { x: 0, z: 0, radius: 10, vel: { x: 150, z: 0 } }),
    false, 'a spawn born rushing a hull inside 2 s is refused',
  );
  assert.ok(SPAWN_PATH_PREDICT_S === 2, 'the shared horizon is the ruling-R11 two seconds');
});

test('OVH-09a: dormant field records count as bodies', () => {
  const state = fixtureState([], [{ x: 30, z: 0, radius: 30 }]);
  assert.equal(
    spawnPointIsClear(state, { x: 0, z: 0, radius: 10 }),
    false, 'a dormant shelf rock under the point blocks it',
  );
  const seat = findClearSpawnPoint(state, { x: 0, z: 0, radius: 10, rng: mulberry32(3) });
  assert.ok(seat, 'retry cleared the shelf record');
  assert.ok(spawnPointIsClear(state, { x: seat.x, z: seat.z, radius: 10 }));
});

test('OVH-09a: the bounded walk returns null when nothing is safe', () => {
  const state = fixtureState([bodyRow(1, { x: 0, z: 0, radius: 600 })]);
  const seat = findClearSpawnPoint(state, {
    x: 0, z: 0, radius: 10, vel: { x: 0, z: 0 },
    rng: mulberry32(5), attempts: 12,
  });
  assert.equal(seat, null, 'a body too large for the walk refuses admission outright');
});

test('OVH-09a: same-batch reservations measure bodies that are not entities yet', () => {
  const state = fixtureState();
  const reserved = [{ alive: true, pos: { x: 0, z: 0 }, radius: 15, vel: { x: 0, z: 0 } }];
  assert.equal(
    spawnPointIsClear(state, { x: 0, z: 0, radius: 10, reserved }),
    false, 'a reserved same-batch body blocks like a live one',
  );
  const seat = findClearSpawnPoint(state, { x: 0, z: 0, radius: 10, reserved, rng: mulberry32(11) });
  assert.ok(seat, 'retry cleared the reservation');
});
