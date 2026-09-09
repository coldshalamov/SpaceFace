import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { isFarDetailSurface } from '../src/render/hlod.js';
import { attachLodState, createLodState, projectedWidthPx } from '../src/render/lod.js';
import { createVisualFactory } from '../src/render/visualFactory.js';

test('projectedWidthPx returns 0 instead of throwing when camera, pos, or viewport is missing', () => {
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 5000);
  cam.position.set(0, 80, -40);
  const vp = { width: 1920, height: 1080 };

  assert.equal(projectedWidthPx(null, 14, cam, vp), 0);
  assert.equal(projectedWidthPx({ x: 0, z: 0 }, 14, null, vp), 0);
  assert.equal(projectedWidthPx({ x: 0, z: 0 }, 14, {}, vp), 0);
  assert.equal(projectedWidthPx({ x: NaN, z: 4 }, 14, cam, vp), 0);
  assert.equal(projectedWidthPx({ x: 0, z: 0 }, 14, cam, null), 0);

  cam.position.set(NaN, NaN, NaN);
  assert.equal(projectedWidthPx({ x: 0, z: 0 }, 14, cam, vp), 0);
});

test('lod hysteresis ignores non-finite projected width instead of oscillating', () => {
  const lod = createLodState();
  assert.equal(lod.resolve(600), 'lod0');
  assert.equal(lod.resolve(NaN), 'lod0');
  assert.equal(lod.resolve(undefined), 'lod0');
  assert.equal(lod.lastPx, 600);
});

test('attachLodState does not throw on a missing mesh', () => {
  assert.equal(attachLodState(null), null);
  const mesh = new THREE.Group();
  mesh.userData = undefined;
  const attached = attachLodState(mesh);
  assert.equal(attached, mesh);
  assert.equal(typeof mesh.userData.lod.resolve, 'function');
});

test('asteroid lod2 hides live far-detail after static merge, not detached originals', () => {
  const vf = createVisualFactory();
  const asteroid = vf.build({
    id: 4242,
    type: 'asteroid',
    radius: 10,
    pos: { x: 0, z: 0 },
    data: { typeId: 'ast_crystalline' },
  });
  assert.ok(asteroid);
  assert.equal(typeof asteroid.userData.updateLod, 'function');

  asteroid.userData.updateLod('lod0');
  let visibleAtLod0 = 0;
  let farAtLod0 = 0;
  asteroid.traverse((object) => {
    if (object.visible === false) return;
    visibleAtLod0 += 1;
    if (isFarDetailSurface(object)) farAtLod0 += 1;
  });
  assert.ok(farAtLod0 > 0, 'crystalline rocks keep readable mineral detail at lod0');

  asteroid.userData.updateLod('lod2');
  let visibleAtLod2 = 0;
  let farVisibleAtLod2 = 0;
  let coreVisible = false;
  asteroid.traverse((object) => {
    if (object.visible === false) return;
    visibleAtLod2 += 1;
    if (isFarDetailSurface(object)) farVisibleAtLod2 += 1;
    if (object.isMesh && !isFarDetailSurface(object)) coreVisible = true;
  });
  assert.ok(visibleAtLod2 < visibleAtLod0);
  assert.equal(farVisibleAtLod2, 0, 'merged shard/vein draws must hide at lod2');
  assert.equal(coreVisible, true, 'core silhouette stays');
});
