// Exact co-location must still produce a usable contact normal so overlapping
// ships separate instead of remaining stacked forever.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';

const DT = 1 / 60;
const MAX_STEPS = 60; // one second of sim — the stacked pair must already be apart

function ship(id, pos, vel = { x: 0, z: 0 }) {
  const entity = makeEntity({
    type: 'ship',
    team: 0,
    pos: { x: pos.x, y: 0, z: pos.z },
    vel: { x: vel.x, y: 0, z: vel.z },
    radius: 8,
    mass: 10,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  entity.id = id;
  return entity;
}

function bootPair(a, b) {
  const entities = [a, b];
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    rng: () => 0.5,
    playerId: a.id,
    settings: { gameplay: { physicsBackend: 'custom' } },
    entities: new Map([[a.id, a], [b.id, b]]),
    entityList: entities,
    spatialHash: {
      diagnostics: { activeBuckets: 1 },
      rebuild() {},
      queryRadius(_x, _z, _r, out) {
        for (const entity of entities) out.push(entity);
        return out;
      },
    },
  };
  const bus = createBus();
  physics.init({ state, bus, helpers: {} });
  return { state, a, b };
}

function separation(a, b) {
  return Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
}

function stepUntilSeparated(harness, minSep) {
  for (let i = 0; i < MAX_STEPS; i++) {
    physics.update(DT, harness.state);
    harness.state.tick += 1;
    harness.state.simTime += DT;
    if (separation(harness.a, harness.b) >= minSep) return i + 1;
  }
  return null;
}

test('exact co-location: two ships at the same {x,z} separate within one second', () => {
  const a = ship(1, { x: 40, z: -12 });
  const b = ship(2, { x: 40, z: -12 });
  const harness = bootPair(a, b);
  const rsum = a.radius + b.radius;
  const steps = stepUntilSeparated(harness, rsum * 0.5);
  assert.ok(steps != null, `co-located ships must separate within ${MAX_STEPS} steps; still ${separation(a, b).toFixed(6)} apart`);
  assert.ok(separation(a, b) > 0, 'the contact normal must move at least one body');
});

test('exact co-location with relative velocity still unsticks and stays deterministic', () => {
  function run() {
    const a = ship(7, { x: 0, z: 0 }, { x: 0, z: 4 });
    const b = ship(9, { x: 0, z: 0 }, { x: 0, z: -1 });
    const harness = bootPair(a, b);
    // Collide before integrate so they are still bit-identical when the normal is formed.
    physics.collide(DT, harness.state);
    return {
      ax: a.pos.x, az: a.pos.z, bx: b.pos.x, bz: b.pos.z,
      sep: separation(a, b),
    };
  }
  const first = run();
  const second = run();
  assert.ok(first.sep > 0, 'relative-velocity co-location must still unstick');
  assert.ok(Math.abs(first.ax) < 1e-9 && Math.abs(first.bx) < 1e-9,
    'relative velocity along Z must win over the id-order +x axis');
  assert.ok(first.az > 0 && first.bz < 0, 'closing relative velocity separates along that axis');
  assert.deepEqual(first, second, 'fallback contact axis must be deterministic');
});

test('a real geometric axis is unchanged: slightly overlapped ships still split along +x', () => {
  const a = ship(1, { x: 0, z: 0 });
  const b = ship(2, { x: 1, z: 0 });
  const harness = bootPair(a, b);
  physics.update(DT, harness.state);
  assert.ok(a.pos.x < 0, 'lower-x ship is pushed further -x');
  assert.ok(b.pos.x > 1, 'higher-x ship is pushed further +x');
  assert.equal(a.pos.z, 0);
  assert.equal(b.pos.z, 0);
});
