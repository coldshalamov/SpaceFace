import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { readFile } from 'node:fs/promises';
import {
  applyInstanceChunkSubmitPolicy,
  isOpaqueInstancePoolMaterial,
  nearestSubmittedInstanceDistanceSq,
  shouldInstanceChunkCastShadow,
} from '../src/render/instanceChunkSubmitPolicy.js';
import { SHADOW_CAST_RADIUS_SQ } from '../src/render/shadowCasterPolicy.js';

function chunkAt(x, z, options = {}) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0x8899aa,
    transparent: options.transparent === true,
    opacity: options.opacity == null ? 1 : options.opacity,
  });
  if (options.depthWrite === false) material.depthWrite = false;
  const mesh = new THREE.InstancedMesh(geometry, material, 4);
  const matrix = new THREE.Matrix4().setPosition(x, 0, z);
  mesh.setMatrixAt(0, matrix);
  mesh.count = 1;
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return {
    mesh,
    pool: { material },
    visibleIndices: new Set([0]),
  };
}

test('opaque nearby instances keep casting; far and empty chunks drop out of the shadow map', () => {
  assert.equal(isOpaqueInstancePoolMaterial({ transparent: false, depthWrite: true, opacity: 1 }), true);
  assert.equal(isOpaqueInstancePoolMaterial({ transparent: true, depthWrite: true, opacity: 1 }), false);
  assert.equal(shouldInstanceChunkCastShadow({
    opaque: true,
    submittedCount: 1,
    nearestDistanceSq: SHADOW_CAST_RADIUS_SQ,
  }), true);
  assert.equal(shouldInstanceChunkCastShadow({
    opaque: true,
    submittedCount: 1,
    nearestDistanceSq: SHADOW_CAST_RADIUS_SQ + 1,
  }), false);
  assert.equal(shouldInstanceChunkCastShadow({
    opaque: true,
    submittedCount: 0,
    nearestDistanceSq: 0,
  }), false);
  assert.equal(shouldInstanceChunkCastShadow({
    opaque: false,
    submittedCount: 4,
    nearestDistanceSq: 0,
  }), false);
});

test('nearest submitted instance uses the instance translation, not the origin mesh', () => {
  const chunk = chunkAt(0, 400);
  assert.equal(nearestSubmittedInstanceDistanceSq(chunk, 0, 0), 400 * 400);
  assert.equal(nearestSubmittedInstanceDistanceSq(chunk, 0, 400), 0);
});

test('apply policy hides empty chunks, enables frustum bounds, and turns off far shadows', () => {
  const far = chunkAt(0, 800);
  assert.equal(applyInstanceChunkSubmitPolicy(far, {
    count: 1,
    playerX: 0,
    playerZ: 0,
    refreshBounds: true,
  }), true);
  assert.equal(far.mesh.castShadow, false);
  assert.equal(far.mesh.visible, true);
  assert.equal(far.mesh.frustumCulled, true);
  assert.ok(far.mesh.boundingSphere);

  const near = chunkAt(10, 10);
  applyInstanceChunkSubmitPolicy(near, {
    count: 1,
    playerX: 0,
    playerZ: 0,
    refreshBounds: true,
  });
  assert.equal(near.mesh.castShadow, true);

  const empty = chunkAt(0, 0);
  empty.visibleIndices.clear();
  empty.mesh.count = 0;
  applyInstanceChunkSubmitPolicy(empty, { count: 0, playerX: 0, playerZ: 0 });
  assert.equal(empty.mesh.visible, false);
  assert.equal(empty.mesh.castShadow, false);
});

test('live instance finalize refreshes bounds when the camera/origin moved', async () => {
  const source = await readFile(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
  assert.match(source, /refreshBounds:\s*dirty\s*\|\|\s*!!\(context\s*&&\s*context\.cameraDirty\)/);
});
