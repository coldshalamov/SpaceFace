import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPresentationQueries,
  setPresentationQueryZeroDirtyRetainForBench,
  setPresentationQueryPoseDirtyRetainForBench,
  getPresentationQueryPoseDirtyRetainForBench,
} from '../src/render/presentationQueries.js';
import { createPresentationWorld, PRESENTATION_DIRTY } from '../src/render/presentationWorld.js';

function entity(id, { x = 0, z = 0, radius = 4, flags = {} } = {}) {
  return {
    id, type: 'ship', alive: true,
    pos: { x, y: 0, z }, prevPos: { x, y: 0, z },
    rot: 0, prevRot: 0, bank: 0, prevBank: 0, pitch: 0, prevPitch: 0,
    radius, flags, presentationVisualRevision: 0,
  };
}
function bind(world, value) {
  const handle = world.handleForEntityId(value.id);
  const mesh = { userData: {}, position: { x: value.pos.x, y: 0, z: value.pos.z } };
  assert.equal(world.bindMesh(handle, mesh, value, value.radius), true);
}
function clearAllDirty(world) {
  const active = world.getDiagnostics().active;
  for (let a = 0; a < active; a++) world.clearDirty(world.activeSlots[a]);
}

test('pose-dirty retain skips full walk when TRANSFORM dirties stay visible', () => {
  assert.equal(getPresentationQueryPoseDirtyRetainForBench(), true);
  const world = createPresentationWorld({ capacity: 16, cellSize: 64 });
  for (const value of [entity(1, { x: -8 }), entity(2, { x: 8 }), entity(3, { x: 200 })]) {
    world.allocateEntity(value, 1);
    bind(world, value);
  }
  const queries = createPresentationQueries(world);
  const options = {
    bounds: { x: 0, z: 0, halfX: 40, halfZ: 40 },
    origin: { x: 0, z: 0 },
    playerId: null,
  };
  clearAllDirty(world);
  const first = queries.query(options);
  assert.deepEqual(first.visibleSlots.map((s) => world.entityIds[s]), [1, 2]);

  // Yaw / micro pose on already-visible root — dirty blocks zero-dirty retain,
  // but pose-dirty retain keeps the set without newlyVisible churn.
  const ship = world.entityRefs[world.getSlotForEntityId(2)];
  ship.rot += 0.05;
  world.refreshVisibleEntity(world.getSlotForEntityId(2), ship);
  assert.ok((world.dirtyCount | 0) > 0);
  const retained = queries.query(options);
  assert.deepEqual(retained.visibleSlots.map((s) => world.entityIds[s]), [1, 2]);
  assert.equal(retained.newlyVisibleCount, 0);
  assert.equal(retained.hiddenCount, 0);
});

test('pose-dirty retain hides a visible root that left the cull', () => {
  const world = createPresentationWorld({ capacity: 16, cellSize: 64 });
  for (const value of [entity(1, { x: -8 }), entity(2, { x: 8 })]) {
    world.allocateEntity(value, 1);
    bind(world, value);
  }
  const queries = createPresentationQueries(world);
  const options = {
    bounds: { x: 0, z: 0, halfX: 40, halfZ: 40 },
    origin: { x: 0, z: 0 },
    playerId: null,
  };
  clearAllDirty(world);
  queries.query(options);

  const mover = world.entityRefs[world.getSlotForEntityId(2)];
  mover.pos.x = 400;
  world.refreshVisibleEntity(world.getSlotForEntityId(2), mover);
  assert.ok((world.dirtyCount | 0) > 0);
  const moved = queries.query(options);
  assert.deepEqual(moved.visibleSlots.map((s) => world.entityIds[s]), [1]);
  assert.deepEqual(moved.hiddenSlots.map((s) => world.entityIds[s]), [2]);
});

test('pose-dirty retain fails open when a dirty root was not previously visible', () => {
  const world = createPresentationWorld({ capacity: 16, cellSize: 64 });
  for (const value of [entity(1, { x: -8 }), entity(2, { x: 200 })]) {
    world.allocateEntity(value, 1);
    bind(world, value);
  }
  const queries = createPresentationQueries(world);
  const options = {
    bounds: { x: 0, z: 0, halfX: 40, halfZ: 40 },
    origin: { x: 0, z: 0 },
    playerId: null,
  };
  clearAllDirty(world);
  const first = queries.query(options);
  assert.deepEqual(first.visibleSlots.map((s) => world.entityIds[s]), [1]);

  // Far entity walks into cull — not in prior visible → full walk admits it.
  const far = world.entityRefs[world.getSlotForEntityId(2)];
  far.pos.x = 8;
  world.refreshVisibleEntity(world.getSlotForEntityId(2), far);
  const entered = queries.query(options);
  assert.ok(entered.visibleSlots.map((s) => world.entityIds[s]).includes(2));
});

test('bench toggle disables pose-dirty retain (dirty forces full walk)', () => {
  setPresentationQueryPoseDirtyRetainForBench(false);
  try {
    const world = createPresentationWorld({ capacity: 8, cellSize: 64 });
    const ship = entity(9, { x: 0 });
    world.allocateEntity(ship, 1);
    bind(world, ship);
    const queries = createPresentationQueries(world);
    const options = {
      bounds: { x: 0, z: 0, halfX: 40, halfZ: 40 },
      origin: { x: 0, z: 0 },
      playerId: null,
    };
    clearAllDirty(world);
    queries.query(options);
    ship.rot += 0.1;
    world.refreshVisibleEntity(world.getSlotForEntityId(9), ship);
    // With pose-dirty retain off, dirtyCount>0 misses zero-dirty retain; full walk
    // still yields the same visible set (no transitions).
    const again = queries.query(options);
    assert.deepEqual(again.visibleSlots.map((s) => world.entityIds[s]), [9]);
    assert.equal(again.newlyVisibleCount, 0);
    assert.equal(again.hiddenCount, 0);
  } finally {
    setPresentationQueryPoseDirtyRetainForBench(true);
  }
});

test('zero-dirty retain still preferred when dirtyCount is 0', () => {
  setPresentationQueryZeroDirtyRetainForBench(true);
  setPresentationQueryPoseDirtyRetainForBench(true);
  const world = createPresentationWorld({ capacity: 8, cellSize: 64 });
  const ship = entity(4, { x: 0 });
  world.allocateEntity(ship, 1);
  bind(world, ship);
  const queries = createPresentationQueries(world);
  const options = {
    bounds: { x: 0, z: 0, halfX: 40, halfZ: 40 },
    origin: { x: 0, z: 0 },
    playerId: null,
  };
  clearAllDirty(world);
  queries.query(options);
  clearAllDirty(world);
  const retained = queries.query(options);
  assert.equal(retained.newlyVisibleCount, 0);
  assert.equal(retained.hiddenCount, 0);
  assert.equal((world.dirtyCount | 0), 0);
});
