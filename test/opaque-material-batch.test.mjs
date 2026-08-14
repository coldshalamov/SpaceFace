import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  createOpaqueMaterialBatchState,
  materialBatchAttrKey,
  opaqueBatchLane,
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
  const materialA = new THREE.MeshStandardMaterial({ color: 0x445566 });
  const materialB = materialA.clone();
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
});
