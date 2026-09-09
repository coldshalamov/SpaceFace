import assert from 'node:assert/strict';
import test from 'node:test';

import { createPresentationJournal } from '../src/core/presentationJournal.js';
import { createPresentationPublisher } from '../src/render/presentationPublisher.js';
import { createPresentationQueries } from '../src/render/presentationQueries.js';
import {
  createPresentationWorld,
  PRESENTATION_FLAGS,
} from '../src/render/presentationWorld.js';

function entity(id, {
  type = 'ship',
  x = 0,
  y = 0,
  z = 0,
  prevX = x,
  prevY = y,
  prevZ = z,
  rot = 0,
  prevRot = rot,
  bank = 0,
  prevBank = bank,
  pitch = 0,
  prevPitch = pitch,
  radius = 4,
  flags = {},
} = {}) {
  return {
    id,
    type,
    alive: true,
    pos: { x, y, z },
    prevPos: { x: prevX, y: prevY, z: prevZ },
    rot,
    prevRot,
    bank,
    prevBank,
    pitch,
    prevPitch,
    radius,
    flags,
    presentationVisualRevision: 0,
  };
}

function stateFor(entities) {
  return {
    entityList: entities,
    entities: new Map(entities.map((value) => [value.id, value])),
  };
}

function bind(world, value) {
  const handle = world.handleForEntityId(value.id);
  assert.ok(handle);
  const mesh = { userData: {} };
  assert.equal(world.bindMesh(handle, mesh, value, value.radius), true);
  return { handle, mesh };
}

test('PresentationWorld reuses dense slots without accepting stale handles', () => {
  const world = createPresentationWorld({ capacity: 16, cellSize: 64 });
  const first = entity(7, { x: 12 });
  const firstHandle = world.allocateEntity(first, 3);
  bind(world, first);

  assert.equal(world.activeCount, 1);
  assert.equal(world.boundCount, 1);
  assert.equal(world.isHandleValid(firstHandle), true);
  assert.equal(world.retire(first.id, 3), true);

  const replacement = entity(9, { x: -4 });
  const replacementHandle = world.allocateEntity(replacement, 1);
  assert.equal(replacementHandle.slot, firstHandle.slot);
  assert.notEqual(replacementHandle.generation, firstHandle.generation);
  assert.equal(world.isHandleValid(firstHandle), false);
  assert.equal(world.isHandleValid(replacementHandle), true);
  assert.equal(world.activeCount, 1);
});

test('PresentationWorld retains previous/current pose and settles interpolation from live state', () => {
  const world = createPresentationWorld({ capacity: 16 });
  const ship = entity(1, {
    x: 20,
    z: -8,
    prevX: 16,
    prevZ: -10,
    rot: 0.8,
    prevRot: 0.5,
    bank: 0.2,
    prevBank: 0.1,
  });
  const handle = world.allocateEntity(ship, 1);
  const slot = handle.slot;

  assert.equal(world.prevX[slot], 16);
  assert.equal(world.x[slot], 20);
  assert.equal(world.prevRot[slot], 0.5);
  assert.equal(world.rot[slot], 0.8);
  assert.equal(world.poseHasDelta(slot), true);

  ship.prevPos.x = ship.pos.x;
  ship.prevPos.z = ship.pos.z;
  ship.prevRot = ship.rot;
  ship.prevBank = ship.bank;
  assert.equal(world.refreshVisibleEntity(slot, ship), true);
  assert.equal(world.poseHasDelta(slot), false);
});

test('PresentationPublisher applies journal ranges idempotently and rebuilds generations', () => {
  const first = entity(1, { x: 2 });
  const second = entity(2, { type: 'asteroid', x: 8 });
  const state = stateFor([first, second]);
  const journal = createPresentationJournal(16);
  journal.recordSpawn(1, first);
  journal.recordSpawn(1, second);

  const world = createPresentationWorld({ capacity: 16 });
  const publisher = createPresentationPublisher(world, state, { journal });
  const frame = {
    journal,
    journalStart: 0,
    journalEnd: 2,
    journalFullRebuild: false,
    journalRebuildGeneration: 0,
    journalValid: true,
  };

  const published = publisher.consume(frame);
  assert.equal(published.applied, 2);
  assert.equal(published.spawnedCount, 2);
  assert.deepEqual(
    published.spawnedSlots.slice(0, published.spawnedCount).map((slot) => world.entityIds[slot]),
    [1, 2],
  );
  assert.equal(world.activeCount, 2);
  assert.equal(publisher.consume(frame).applied, 0);
  assert.equal(world.activeCount, 2);

  first.prevPos.x = first.pos.x;
  first.pos.x = 6;
  journal.recordTransform(2, first);
  frame.journalStart = 2;
  frame.journalEnd = 3;
  assert.equal(publisher.consume(frame).applied, 1);
  const firstSlot = world.getSlotForEntityId(first.id);
  assert.equal(world.prevX[firstSlot], 2);
  assert.equal(world.x[firstSlot], 6);

  journal.recordDestroy(3, second);
  second.alive = false;
  state.entities.delete(second.id);
  frame.journalStart = 3;
  frame.journalEnd = 4;
  assert.equal(publisher.consume(frame).applied, 1);
  assert.equal(world.activeCount, 1);

  assert.equal(journal.rebuildFrom(state.entityList, 4), true);
  frame.journalStart = journal.getLastRebuildStart();
  frame.journalEnd = journal.getLastRebuildEnd();
  frame.journalFullRebuild = true;
  frame.journalRebuildGeneration = journal.getRebuildGeneration();
  const rebuilt = publisher.consume(frame);
  assert.equal(rebuilt.rebuilt, true);
  assert.equal(rebuilt.applied, 1);
  assert.equal(world.activeCount, 1);
  assert.equal(world.getSlotForEntityId(first.id) >= 0, true);
});

test('PresentationQueries return deterministic visible handles and exact transitions', () => {
  const world = createPresentationWorld({ capacity: 16, cellSize: 64 });
  const forced = entity(30, { x: 1000, flags: { forceRender: true } });
  const first = entity(10, { x: -10 });
  const second = entity(20, { x: 12 });
  for (const value of [forced, first, second]) {
    world.allocateEntity(value, 1);
    bind(world, value);
  }
  const queries = createPresentationQueries(world);
  const options = {
    bounds: { x: 0, z: 0, halfX: 40, halfZ: 40 },
    origin: { x: 0, z: 0 },
    playerId: null,
  };

  const initial = queries.query(options);
  assert.deepEqual(
    initial.visibleSlots.map((slot) => world.entityIds[slot]),
    [10, 20, 30],
  );
  assert.equal(initial.newlyVisibleCount, 3);
  assert.equal(
    world.flags[world.getSlotForEntityId(forced.id)] & PRESENTATION_FLAGS.FORCE_RENDER,
    PRESENTATION_FLAGS.FORCE_RENDER,
  );

  second.prevPos.x = second.pos.x;
  second.pos.x = 500;
  world.refreshVisibleEntity(world.getSlotForEntityId(second.id), second);
  const movedOut = queries.query(options);
  assert.deepEqual(
    movedOut.visibleSlots.map((slot) => world.entityIds[slot]),
    [10, 30],
  );
  assert.deepEqual(
    movedOut.hiddenSlots.map((slot) => world.entityIds[slot]),
    [20],
  );

  assert.equal(queries.query(options).hiddenCount, 0);
  second.prevPos.x = second.pos.x;
  second.pos.x = 5;
  world.refreshVisibleEntity(world.getSlotForEntityId(second.id), second);
  const returned = queries.query(options);
  assert.deepEqual(
    returned.newlyVisibleSlots.map((slot) => world.entityIds[slot]),
    [20],
  );
});

test('PresentationWorld drops stale maximum radius after large-root churn', () => {
  const world = createPresentationWorld({ capacity: 16, cellSize: 64 });
  const near = entity(1, { x: 0, radius: 4 });
  const far = entity(2, { x: 500, radius: 4 });
  const transientLarge = entity(3, { x: 0, radius: 1000 });
  for (const value of [near, far, transientLarge]) {
    world.allocateEntity(value, 1);
    bind(world, value);
  }

  assert.equal(world.maxRadius, 1000);
  transientLarge.radius = 8;
  world.refreshVisibleEntity(world.getSlotForEntityId(transientLarge.id), transientLarge, transientLarge.radius);
  assert.equal(world.maxRadius, 8);
  transientLarge.radius = 1000;
  world.refreshVisibleEntity(world.getSlotForEntityId(transientLarge.id), transientLarge, transientLarge.radius);
  assert.equal(world.maxRadius, 1000);
  assert.equal(world.retire(transientLarge.id, 1), true);
  assert.equal(world.maxRadius, 4);

  const result = createPresentationQueries(world).query({
    bounds: { x: 0, z: 0, halfX: 20, halfZ: 20 },
    origin: { x: 0, z: 0 },
    playerId: null,
  });
  assert.equal(result.candidateCount, 1);
  assert.deepEqual(result.visibleSlots.map((slot) => world.entityIds[slot]), [near.id]);
});
