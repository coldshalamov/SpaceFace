import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import {
  ASTEROID_INSTANCE_TYPE_ID,
  ASTEROID_INSTANCE_VARIANT_COUNT,
  createAsteroidInstancePool,
  disposeAsteroidInstancePool,
  registerAsteroidBaseLeaf,
  runAsteroidInstanceCameraDirtyMicrobench,
  setAsteroidInstanceCameraCullExactCompare,
  syncAsteroidInstancePool,
} from '../src/render/asteroidInstancePool.js';

test('asteroid camera cull quantize reuses static path under micro jitter', () => {
  setAsteroidInstanceCameraCullExactCompare(false);
  const scene = new THREE.Scene();
  const pool = createAsteroidInstancePool(scene);
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshStandardMaterial();
  for (let id = 1; id <= 12; id++) {
    const variant = id % ASTEROID_INSTANCE_VARIANT_COUNT;
    const root = new THREE.Group();
    root.position.set(id * 8, 0, -id * 4);
    const leaf = new THREE.Mesh(geometry, material);
    leaf.userData.asteroidInstanceTypeId = ASTEROID_INSTANCE_TYPE_ID;
    leaf.userData.asteroidInstanceVariant = variant;
    root.userData.asteroidInstanceBody = leaf;
    root.add(leaf);
    scene.add(root);
    assert.equal(registerAsteroidBaseLeaf(pool, { id, type: 'asteroid' }, root), true);
  }
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 8000);
  camera.position.set(0, 100, 160);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  pool.dirty = true;
  assert.ok(syncAsteroidInstancePool(pool, { camera, recordsDirty: false }).submitted > 0);
  pool.dirty = false;

  camera.position.x += 0.05;
  camera.position.z += 0.03;
  camera.updateMatrixWorld(true);
  const micro = syncAsteroidInstancePool(pool, { camera, recordsDirty: false });
  assert.equal(micro.matrixEvaluations, 0, '0.05 WU drift stays in 0.25 WU cell → reuse');
  assert.ok(micro.matrixReuses > 0);

  camera.position.x += 2.0;
  camera.updateMatrixWorld(true);
  const large = syncAsteroidInstancePool(pool, { camera, recordsDirty: false });
  assert.ok(large.matrixEvaluations > 0, '2 WU pan dirties cull and re-evaluates');

  disposeAsteroidInstancePool(pool);
  geometry.dispose();
  material.dispose();
});

test('asteroid camera cull exact bench toggle restores always-dirty micro jitter', () => {
  const exact = runAsteroidInstanceCameraDirtyMicrobench({
    rockCount: 20, frames: 200, jitterWu: 0.05, exactCameraDirty: true,
  });
  const quant = runAsteroidInstanceCameraDirtyMicrobench({
    rockCount: 20, frames: 200, jitterWu: 0.05, exactCameraDirty: false,
  });
  assert.equal(exact.dirtyRate, 1);
  assert.ok(quant.dirtyRate < 0.5, `quantize dirtyRate ${quant.dirtyRate}`);
  assert.ok(exact.ms > quant.ms * 1.3, `exact ${exact.ms} should beat quant ${quant.ms}`);
  setAsteroidInstanceCameraCullExactCompare(false);
});
