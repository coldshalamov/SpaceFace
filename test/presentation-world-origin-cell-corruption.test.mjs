import assert from 'node:assert/strict';
import test from 'node:test';

import { createPresentationWorld } from '../src/render/presentationWorld.js';

// The spatial grid stores cell coordinates in Int32Arrays with a -1 "not in grid" sentinel.
// Cell -1 is a legitimate cell: any position in [-cellSize, 0) on either axis lands there, and
// gameplay orbits the origin. A slot whose stored cell is (-1, cz) or (cx, -1) must still be
// unlinked by removeFromGrid, or its column head goes stale, chains cross-link, and a later
// re-insert into the same cell produces cellNext[slot] === slot — an infinite candidate walk
// that pushes until V8 throws "Invalid array length" (the Phase 0 headed-run frame errors).

function entity(id, x, z) {
  return {
    id,
    type: 'ship',
    alive: true,
    pos: { x, y: 0, z },
    prevPos: { x, y: 0, z },
    rot: 0,
    prevRot: 0,
    bank: 0,
    prevBank: 0,
    pitch: 0,
    prevPitch: 0,
    radius: 4,
    presentationVisualRevision: 0,
  };
}

function moveTo(world, value, x, z) {
  value.pos.x = x;
  value.pos.z = z;
  value.prevPos.x = x;
  value.prevPos.z = z;
  const slot = world.getSlotForEntityId(value.id);
  assert.ok(slot >= 0, `entity ${value.id} must be allocated`);
  world.refreshVisibleEntity(slot, value);
  return slot;
}

// Cycle detector that cannot hang: follows cellNext from every alive slot at most capacity+1
// steps. A legal chain never revisits a slot.
function assertNoChainCycles(world, label) {
  for (let start = 0; start < world.capacity; start++) {
    if (world.alive[start] !== 1) continue;
    let slot = start;
    let steps = 0;
    while (slot >= 0) {
      assert.ok(
        steps <= world.capacity,
        `${label}: cellNext chain from slot ${start} exceeded capacity (${world.capacity}) steps — cycle`,
      );
      assert.notEqual(world.cellNext[slot], slot, `${label}: slot ${slot} links to itself`);
      slot = world.cellNext[slot];
      steps++;
    }
  }
}

test('crossing the origin cell boundary does not leave stale grid links', () => {
  const world = createPresentationWorld({ initialCapacity: 8 });
  const ship = entity(1, -100, 100); // cell (-1, 0) with default cellSize 512
  world.allocateEntity(ship);
  const slot = world.getSlotForEntityId(1);

  // Cross into cell (0, 0): the slot must be unlinked from column -1.
  moveTo(world, ship, 100, 100);
  assertNoChainCycles(world, 'after crossing +x');
  const afterMove = world.collectSpatialBounds(-1024, 1024, -1024, 1024, []);
  assert.deepEqual(
    afterMove,
    [slot],
    'slot must appear exactly once after leaving cell -1 (stale head = duplicate)',
  );

  // Cross back into cell (-1, 0): with a stale head this produces cellNext[slot] === slot.
  moveTo(world, ship, -100, 100);
  assert.notEqual(world.cellNext[slot], slot, 'self-cycle after re-entering cell -1');
  assertNoChainCycles(world, 'after crossing back');
  const afterReturn = world.collectSpatialBounds(-1024, 1024, -1024, 1024, []);
  assert.deepEqual(afterReturn, [slot], 'slot must appear exactly once after returning');
});

test('the same holds on the z axis', () => {
  const world = createPresentationWorld({ initialCapacity: 8 });
  const ship = entity(2, 100, -100); // cell (0, -1)
  world.allocateEntity(ship);
  const slot = world.getSlotForEntityId(2);

  moveTo(world, ship, 100, 100);
  assertNoChainCycles(world, 'after crossing +z');
  moveTo(world, ship, 100, -100);
  assert.notEqual(world.cellNext[slot], slot, 'self-cycle after re-entering cell (0,-1)');
  assertNoChainCycles(world, 'after crossing back on z');
  assert.deepEqual(
    world.collectSpatialBounds(-1024, 1024, -1024, 1024, []),
    [slot],
    'slot must appear exactly once',
  );
});

test('retiring an entity parked in a negative origin cell fully unlinks it', () => {
  const world = createPresentationWorld({ initialCapacity: 8 });
  world.allocateEntity(entity(3, -100, -100)); // cell (-1, -1) — both axes collide with -1
  assert.equal(world.retire(3), true);
  assert.deepEqual(
    world.collectSpatialBounds(-1024, 1024, -1024, 1024, []),
    [],
    'grid must be empty after retiring the only entity',
  );

  // Slot reuse must not resurrect the stale link as a ghost/duplicate.
  world.allocateEntity(entity(4, 100, 100));
  const slot = world.getSlotForEntityId(4);
  assert.deepEqual(
    world.collectSpatialBounds(-1024, 1024, -1024, 1024, []),
    [slot],
    'reused slot must appear exactly once, only in its real cell',
  );
  assertNoChainCycles(world, 'after slot reuse');
});

test('multi-entity chains around the origin survive churn without cycles or duplicates', () => {
  const world = createPresentationWorld({ initialCapacity: 16 });
  const ships = [];
  for (let i = 0; i < 6; i++) {
    // All in cell (-1, -1) so they share one chain.
    const value = entity(10 + i, -10 - i * 20, -10 - i * 20);
    world.allocateEntity(value);
    ships.push(value);
  }
  // Shuffle them across the boundary and back in interleaved order.
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < ships.length; i++) {
      const sign = (i + round) % 2 === 0 ? 1 : -1;
      moveTo(world, ships[i], sign * (10 + i * 20), sign * (10 + i * 20));
      assertNoChainCycles(world, `round ${round} ship ${i}`);
    }
  }
  const collected = world.collectSpatialBounds(-2048, 2048, -2048, 2048, []).sort((a, b) => a - b);
  const expected = ships
    .map((value) => world.getSlotForEntityId(value.id))
    .sort((a, b) => a - b);
  assert.deepEqual(collected, expected, 'every ship exactly once after churn');
});

test('absurd finite coordinates cannot corrupt the grid (clamped cell indices)', () => {
  const world = createPresentationWorld({ initialCapacity: 8 });
  const far = entity(5, 2 ** 40, -(2 ** 40)); // cell index would overflow Int32
  world.allocateEntity(far);
  const slot = world.getSlotForEntityId(5);
  assert.deepEqual(
    world.collectSpatialBounds(far.pos.x, far.pos.x, far.pos.z, far.pos.z, []),
    [slot],
    'query cell normalization must match the clamped storage key',
  );
  // Round-trip through the origin and back out; no cycles, retire cleanly.
  moveTo(world, far, -100, 100);
  assertNoChainCycles(world, 'far entity at origin');
  moveTo(world, far, 2 ** 40, -(2 ** 40));
  assertNoChainCycles(world, 'far entity back out');
  assert.notEqual(world.cellNext[slot], slot, 'no self-cycle for far entity');
  moveTo(world, far, Number.MAX_VALUE, -Number.MAX_VALUE);
  assert.deepEqual(
    world.collectSpatialBounds(far.pos.x, far.pos.x, far.pos.z, far.pos.z, []),
    [slot],
    'maximum finite coordinates use one bounded boundary-cell lookup',
  );
  assert.equal(world.retire(5), true);
  assert.deepEqual(
    world.collectSpatialBounds(-1024, 1024, -1024, 1024, []),
    [],
    'grid empty after retiring far entity',
  );
});
