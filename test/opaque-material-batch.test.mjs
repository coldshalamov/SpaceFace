import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  createOpaqueMaterialBatchState,
  OPAQUE_BATCH_MAX_VERTS,
  materialBatchAttrKey,
  opaqueBatchLane,
  refreshBatchWorldBounds,
  shouldConsolidateInstanceChunk,
  supportsOpaqueMaterialBatch,
  syncOpaqueMaterialBatches,
} from '../src/render/opaqueMaterialBatch.js';
import { SHADOW_CAST_RADIUS_SQ } from '../src/render/shadowCasterPolicy.js';

function makeChunk(x, z, options = {}) {
  const geometry = options.geometry || new THREE.BoxGeometry(1, 1, 1);
  const material = options.material || new THREE.MeshStandardMaterial({ color: 0x8899aa });
  const mesh = new THREE.InstancedMesh(geometry, material, 4);
  mesh.setMatrixAt(0, new THREE.Matrix4().setPosition(x, 0, z));
  mesh.count = 1;
  mesh.castShadow = true;
  mesh.visible = true;
  return {
    mesh,
    pool: {
      key: options.key || `box|${material.uuid}`,
      geometry,
      material,
    },
    visibleIndices: new Set([0]),
  };
}

test('lane and eligibility keep far plates out of the shadow batch', () => {
  assert.equal(opaqueBatchLane(0), 'cast');
  assert.equal(opaqueBatchLane(SHADOW_CAST_RADIUS_SQ), 'cast');
  assert.equal(opaqueBatchLane(SHADOW_CAST_RADIUS_SQ + 1), 'nocast');
  const near = makeChunk(0, 0);
  assert.equal(shouldConsolidateInstanceChunk(near), true);
  const glass = makeChunk(0, 0, {
    material: new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 }),
  });
  assert.equal(shouldConsolidateInstanceChunk(glass), false);
  assert.equal(supportsOpaqueMaterialBatch(null), false);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const unindexed = new THREE.BufferGeometry();
  unindexed.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  assert.notEqual(materialBatchAttrKey(box), '');
  assert.equal(materialBatchAttrKey(box), materialBatchAttrKey(box.clone()));
  assert.notEqual(materialBatchAttrKey(box), materialBatchAttrKey(unindexed));
});

test('two unique plates that share a material become one hidden-source batch', () => {
  const materialA = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.4, metalness: 0.2 });
  const materialB = new THREE.MeshStandardMaterial({ color: 0xaa5533, roughness: 0.4, metalness: 0.2 });
  const a = makeChunk(4, 0, { material: materialA, key: 'plateA', geometry: new THREE.BoxGeometry(1, 1, 1) });
  const b = makeChunk(0, 900, { material: materialB, key: 'plateB', geometry: new THREE.BoxGeometry(1.2, 0.4, 0.8) });
  const scene = new THREE.Scene();
  const pools = new Map([['shared', { chunks: [a, b] }]]);
  const state = createOpaqueMaterialBatchState();
  const stats = syncOpaqueMaterialBatches(state, pools, {
    enabled: true,
    scene,
    playerX: 0,
    playerZ: 0,
  });
  assert.equal(stats.hiddenChunks, 2);
  assert.equal(stats.instances, 2);
  assert.equal(stats.batches, 2, 'cloned same-look materials collapse to one cast lane and one far lane');
  assert.equal(a.mesh.visible, false);
  assert.equal(b.mesh.visible, false);
  assert.equal(a.mesh.castShadow, false);
  const live = [...state.batches.values()].filter((batch) => batch.used > 0);
  assert.ok(live.some((batch) => batch.lane === 'cast' && batch.mesh.castShadow === true));
  assert.ok(live.some((batch) => batch.lane === 'nocast' && batch.mesh.castShadow === false));
  assert.equal(live.every((batch) => batch.mesh.parent === scene), true);
  assert.equal(live.every((batch) => batch.mesh.frustumCulled === false), true);
  assert.equal(live.every((batch) => batch.mesh.perObjectFrustumCulled === true), true);
  assert.equal(live.every((batch) => !!(batch.mesh.boundingSphere)), true);
});

test('disabling after consolidation restores source chunks and hides retained batches', () => {
  const material = new THREE.MeshStandardMaterial({ color: 0x445566 });
  const chunk = makeChunk(4, 0, { material, key: 'togglePlate' });
  const scene = new THREE.Scene();
  const pools = new Map([['toggle', { chunks: [chunk] }]]);
  const state = createOpaqueMaterialBatchState();
  syncOpaqueMaterialBatches(state, pools, {
    enabled: true,
    scene,
    playerX: 0,
    playerZ: 0,
  });
  assert.equal(chunk.mesh.visible, false);
  assert.equal(chunk.mesh.castShadow, false);
  assert.ok([...state.batches.values()].some((batch) => batch.mesh.visible));

  const stats = syncOpaqueMaterialBatches(state, pools, { enabled: false, scene });
  assert.equal(stats.batches, 0);
  assert.equal(stats.instances, 0);
  assert.equal(chunk.mesh.visible, true);
  assert.equal(chunk.mesh.castShadow, true);
  assert.equal(chunk.consolidated, false);
  assert.equal([...state.batches.values()].every((batch) => batch.mesh.visible === false), true);
});

test('batch world bounds follow instance matrices after a large origin shift', () => {
  const material = new THREE.MeshStandardMaterial({ color: 0x334455 });
  const near = makeChunk(4, 0, { material, key: 'nearPlate' });
  const scene = new THREE.Scene();
  const pools = new Map([['shift', { chunks: [near] }]]);
  const state = createOpaqueMaterialBatchState();
  syncOpaqueMaterialBatches(state, pools, {
    enabled: true,
    scene,
    playerX: 0,
    playerZ: 0,
  });
  const batch = [...state.batches.values()].find((item) => item.used > 0);
  assert.ok(batch);
  const before = batch.mesh.boundingSphere.center.clone();
  near.mesh.setMatrixAt(0, new THREE.Matrix4().setPosition(9000, 0, 9000));
  syncOpaqueMaterialBatches(state, pools, {
    enabled: true,
    scene,
    playerX: 9000,
    playerZ: 9000,
    refreshBounds: true,
  });
  const after = batch.mesh.boundingSphere.center;
  assert.ok(after.distanceTo(before) > 1000, 'stale origin sphere would hide the batch after rebase');
  assert.equal(refreshBatchWorldBounds(batch.mesh), true);
});

test('live batches allocate the full vertex ceiling once', () => {
  const material = new THREE.MeshStandardMaterial({ color: 0x778899 });
  const chunk = makeChunk(0, 0, { material, key: 'ceiling' });
  const scene = new THREE.Scene();
  const state = createOpaqueMaterialBatchState();
  syncOpaqueMaterialBatches(state, new Map([['ceiling', { chunks: [chunk] }]]), {
    enabled: true,
    scene,
    playerX: 0,
    playerZ: 0,
  });
  const batch = [...state.batches.values()].find((item) => item.used > 0);
  assert.ok(batch);
  assert.equal(batch.mesh._maxVertexCount, OPAQUE_BATCH_MAX_VERTS);
});
