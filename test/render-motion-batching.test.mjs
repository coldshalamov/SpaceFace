import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  createOpaqueMaterialBatchState,
  syncOpaqueMaterialBatches,
} from '../src/render/opaqueMaterialBatch.js';
import { createRetainedRigidOpaqueBatchController } from '../src/render/rigidOpaqueBatch.js';

// Instance pools shard one pool into 64-instance InstancedMesh chunks that share pool.key.
// A batching slot must therefore be scoped to the chunk, not just pool|index|lane.
function makePoolChunk(pool, positions) {
  const capacity = Math.max(4, positions.length);
  const mesh = new THREE.InstancedMesh(pool.geometry, pool.material, capacity);
  positions.forEach(([x, z], index) => {
    mesh.setMatrixAt(index, new THREE.Matrix4().setPosition(x, 0, z));
  });
  mesh.count = positions.length;
  mesh.castShadow = true;
  mesh.visible = true;
  return {
    mesh,
    pool,
    visibleIndices: new Set(positions.map((_, index) => index)),
  };
}

function drawnInstancePositions(batch) {
  const result = [];
  for (const id of batch.instanceIds) {
    const matrix = new THREE.Matrix4();
    batch.mesh.getMatrixAt(id, matrix);
    result.push(matrix.elements[12]);
  }
  return result.sort((a, b) => a - b);
}

test('sibling chunks in one pool keep separate batch slots for the same local index', () => {
  const material = new THREE.MeshStandardMaterial({ color: 0x445566 });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const pool = { key: 'sharedPool', geometry, material };
  // Same chunk-local index 0 in both chunks, same cast lane — the pre-fix slot key collided.
  const a = makePoolChunk(pool, [[4, 0]]);
  const b = makePoolChunk(pool, [[8, 0]]);
  const scene = new THREE.Scene();
  const state = createOpaqueMaterialBatchState();
  const stats = syncOpaqueMaterialBatches(state, new Map([['p', { chunks: [a, b] }]]), {
    enabled: true,
    scene,
    playerX: 0,
    playerZ: 0,
  });
  assert.equal(stats.hiddenChunks, 2);
  assert.equal(state.slots.size, 2, 'same-index instances in sibling chunks must not share a slot');
  const batch = [...state.batches.values()].find((item) => item.used > 0);
  assert.ok(batch);
  assert.equal(batch.allocated, 2, 'each sibling instance needs its own BatchedMesh instance');
  assert.deepEqual(drawnInstancePositions(batch), [4, 8],
    'both chunks must keep their own drawn position — a shared slot silently drops one entity');

  const second = syncOpaqueMaterialBatches(state, new Map([['p', { chunks: [a, b] }]]), {
    enabled: true,
    scene,
    playerX: 0,
    playerZ: 0,
  });
  assert.equal(second.matrixWrites, 0, 'stable slots must not rewrite instance textures');
});

test('an ineligible sibling chunk does not release the live chunk\'s batch slots', () => {
  const material = new THREE.MeshStandardMaterial({ color: 0x556677 });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const pool = { key: 'flickerPool', geometry, material };
  const live = makePoolChunk(pool, [[4, 0]]);
  // Culled out this frame: stays in pool.chunks with empty visibleIndices, so sync takes the
  // restore branch for it every frame. Its slots must be the only ones released.
  const idle = makePoolChunk(pool, [[12, 0]]);
  idle.visibleIndices = new Set();
  idle.mesh.count = 0;
  const scene = new THREE.Scene();
  const state = createOpaqueMaterialBatchState();
  const pools = new Map([['p', { chunks: [live, idle] }]]);
  const stats = syncOpaqueMaterialBatches(state, pools, {
    enabled: true,
    scene,
    playerX: 0,
    playerZ: 0,
  });
  assert.equal(stats.hiddenChunks, 1);
  assert.equal(state.slots.size, 1, 'the live chunk keeps its slot while its sibling is idle');
  const slot = [...state.slots.values()][0];
  assert.equal(slot.batch.mesh.getVisibleAt(slot.instanceId), true);
  assert.equal(live.mesh.visible, false, 'the live chunk stays folded into the batch');

  const second = syncOpaqueMaterialBatches(state, pools, {
    enabled: true,
    scene,
    playerX: 0,
    playerZ: 0,
  });
  assert.equal(second.matrixWrites, 0, 'the surviving slot must not churn per frame');
  assert.equal([...state.slots.values()][0].instanceId, slot.instanceId);
});

test('a source hidden while retained stays hidden after the rollback', async () => {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const parent = new THREE.Group();
  root.add(parent);
  const material = new THREE.MeshStandardMaterial({ color: 0x667788 });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const sources = [];
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(i * 2, 0, 0);
    parent.add(mesh);
    sources.push(mesh);
  }
  scene.updateMatrixWorld(true);
  const controller = createRetainedRigidOpaqueBatchController({
    scene,
    prepare: () => Promise.resolve(true),
  });
  await controller.request([root]);
  assert.equal(controller.getDiagnostics().instances, 3);
  assert.equal(sources[0].layers.mask, 0, 'direct draw suppressed while retained');

  // A live owner hides the leaf while it is retained (damage state, scripted removal).
  sources[0].visible = false;
  await controller.request([root]);
  assert.equal(sources[0].visible, false,
    'rollback must not resurrect a source the live owner hid');
  assert.equal(sources[0].layers.mask, 1, 'source returns to the authored direct layer');
  assert.equal(controller.getDiagnostics().instances, 2,
    'the hidden source is not re-admitted into the rebuilt batch');
});
