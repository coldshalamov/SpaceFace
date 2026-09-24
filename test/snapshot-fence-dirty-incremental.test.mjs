import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationWorld } from '../src/render/presentationWorld.js';
import {
  createSnapshotFence,
  packPresentationWorldToFence,
  snapshotIndexOf,
} from '../src/render/snapshotFence.js';

function seed(n) {
  const world = createPresentationWorld({ capacity: n });
  const entities = [];
  for (let i = 0; i < n; i++) {
    const entity = {
      id: i + 1,
      alive: true,
      type: 'ship',
      pos: { x: i * 10, y: 0, z: i },
      rot: i * 0.01,
      bank: 0,
      pitch: 0,
      radius: 4,
    };
    entities.push(entity);
    world.allocateEntity(entity, 0);
  }
  return { world, entities };
}

function move(world, entity, dx) {
  entity.pos.x += dx;
  world.applyTransform({
    entityId: entity.id,
    generation: 0,
    revision: (entity._rev = (entity._rev || 0) + 1),
    x: entity.pos.x,
    y: 0,
    z: entity.pos.z,
    rot: entity.rot,
    bank: 0,
    pitch: 0,
  }, entity);
}

function clearDirty(world) {
  const active = world.getDiagnostics().active;
  for (let i = 0; i < active; i++) world.clearDirty(world.activeSlots[i]);
}

test('layout-stable dirty incremental matches forceFull pack poses', () => {
  const { world, entities } = seed(48);
  const fenceInc = createSnapshotFence({ capacity: 48 });
  const fenceFull = createSnapshotFence({ capacity: 48 });
  for (let i = 0; i < 3; i++) {
    packPresentationWorldToFence(world, fenceInc, i, 1);
    packPresentationWorldToFence(world, fenceFull, i, 1);
    clearDirty(world);
  }
  move(world, entities[0], 5);
  move(world, entities[7], -3);
  packPresentationWorldToFence(world, fenceInc, 10, 1);
  packPresentationWorldToFence(world, fenceFull, 10, 1, { forceFull: true });
  const a = fenceInc.latestSnapshot();
  const b = fenceFull.latestSnapshot();
  assert.equal(a.count, b.count);
  for (let i = 0; i < a.count; i++) {
    const id = a.columns.entityId[i];
    assert.equal(id, b.columns.entityId[i]);
    const ia = snapshotIndexOf(a, id);
    const ib = snapshotIndexOf(b, id);
    assert.equal(ia, ib);
    const p = ia * 3;
    assert.ok(Math.abs(a.columns.position[p] - b.columns.position[p]) < 1e-5);
    assert.ok(Math.abs(a.columns.position[p + 2] - b.columns.position[p + 2]) < 1e-5);
  }
  // Moved entities landed at new x
  const p0 = snapshotIndexOf(a, entities[0].id) * 3;
  assert.ok(Math.abs(a.columns.position[p0] - entities[0].pos.x) < 1e-5);
});

test('membership change falls back to full pack and stays indexed', () => {
  const { world, entities } = seed(24);
  const fence = createSnapshotFence({ capacity: 32 });
  for (let i = 0; i < 3; i++) {
    packPresentationWorldToFence(world, fence, i, 1);
    clearDirty(world);
  }
  const layoutBefore = world.layoutVersion;
  world.retire(entities[5].id);
  assert.notEqual(world.layoutVersion, layoutBefore);
  const packed = packPresentationWorldToFence(world, fence, 20, 1);
  assert.equal(packed, 23);
  const snap = fence.latestSnapshot();
  assert.equal(snap.count, 23);
  assert.equal(snapshotIndexOf(snap, entities[5].id), -1);
  assert.ok(snapshotIndexOf(snap, entities[0].id) >= 0);
});
