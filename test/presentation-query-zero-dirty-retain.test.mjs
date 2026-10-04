import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPresentationQueries,
  setPresentationQueryZeroDirtyRetainForBench,
  getPresentationQueryZeroDirtyRetainForBench,
} from '../src/render/presentationQueries.js';
import { createPresentationWorld } from '../src/render/presentationWorld.js';

function entity(id, { x = 0, z = 0, radius = 4, flags = {} } = {}) {
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
    radius,
    flags,
    presentationVisualRevision: 0,
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

test('zero-dirty identical cull rect retains visible set without transitions', () => {
  assert.equal(getPresentationQueryZeroDirtyRetainForBench(), true);
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
  assert.equal(first.newlyVisibleCount, 2);

  clearAllDirty(world);
  const retained = queries.query(options);
  assert.deepEqual(retained.visibleSlots.map((s) => world.entityIds[s]), [1, 2]);
  assert.equal(retained.newlyVisibleCount, 0);
  assert.equal(retained.hiddenCount, 0);
  assert.equal(retained.candidateCount, first.candidateCount);

  // Pose churn must miss retain and emit a hide.
  const mover = world.entityRefs[world.getSlotForEntityId(2)];
  mover.prevPos.x = mover.pos.x;
  mover.pos.x = 400;
  world.refreshVisibleEntity(world.getSlotForEntityId(2), mover);
  assert.ok((world.dirtyCount | 0) > 0);
  const moved = queries.query(options);
  assert.deepEqual(moved.visibleSlots.map((s) => world.entityIds[s]), [1]);
  assert.deepEqual(moved.hiddenSlots.map((s) => world.entityIds[s]), [2]);
});

test('bench toggle restores always-walk (transitions still correct)', () => {
  setPresentationQueryZeroDirtyRetainForBench(false);
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
    const a = queries.query(options);
    const aVisible = a.visibleSlots.map((s) => world.entityIds[s]);
    const aNew = a.newlyVisibleCount;
    clearAllDirty(world);
    const b = queries.query(options);
    assert.deepEqual(aVisible, [9]);
    assert.deepEqual(b.visibleSlots.map((s) => world.entityIds[s]), [9]);
    assert.equal(aNew, 1);
    // Always-walk still reports newlyVisible=0 on the second identical frame
    // (previousMarks seeded from visibleSlots). query() returns a retained result bag.
    assert.equal(b.newlyVisibleCount, 0);
    assert.equal(b.hiddenCount, 0);
  } finally {
    setPresentationQueryZeroDirtyRetainForBench(true);
  }
});
