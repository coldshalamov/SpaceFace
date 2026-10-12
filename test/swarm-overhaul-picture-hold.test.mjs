import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pictureHoldSubmit, projectEntityCenter } from '../src/render/pictureHold.js';

test('a shown root stays submitted after it leaves the picture', () => {
  const ud = {};
  assert.equal(pictureHoldSubmit(ud, false, false), false);
  assert.equal(ud.sfPictureHeld, undefined);
  assert.equal(pictureHoldSubmit(ud, true, true), true);
  assert.equal(ud.sfPictureHeld, true);
  assert.equal(pictureHoldSubmit(ud, false, false), true, 'an off-screen return must not be a hide');
  assert.equal(ud.sfPictureHeld, true);
  assert.equal(pictureHoldSubmit(null, false, true), false);
});

test('a center in front of the camera projects inside NDC and a center behind does not', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  camera.position.set(0, 0, 0);
  // Camera looks down local −z. (0,0,−1) is in front; +z is behind the lens.
  camera.lookAt(0, 0, -1);
  camera.updateMatrixWorld(true);
  const mesh = new THREE.Object3D();
  mesh.position.set(0, 0, -10);
  mesh.updateMatrixWorld(true);
  const out = { ok: false, x: 0, y: 0 };
  projectEntityCenter(camera, mesh, out);
  assert.equal(out.ok, true);
  assert.ok(Math.abs(out.x) < 0.05 && Math.abs(out.y) < 0.05, `ndc ${out.x}, ${out.y}`);
  mesh.position.set(0, 0, 10);
  mesh.updateMatrixWorld(true);
  projectEntityCenter(camera, mesh, out);
  assert.equal(out.ok, false, 'a point on the camera +z axis is behind the lens');
});
