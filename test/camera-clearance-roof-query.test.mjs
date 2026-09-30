// The chase camera's structural clearance query, exercised on plain mesh trees through a stub
// renderer owner. If this passes and the live camera still enters a station, the failure is in
// the station root's stamps (kind / authoredAssetState / geometryPending), not in the query.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  CAMERA_CLEARANCE_MARGIN_WU,
  cameraClearanceFloorAt,
  cameraRoofAt,
} from '../src/render/renderer.js';

function stubOwner(scene, roots) {
  const meshes = new Map();
  let id = 1;
  for (const root of roots) meshes.set(id++, root);
  return {
    scene,
    _meshes: meshes,
    _meshesVersion: 1,
    _clearanceMeshes: null,
    _clearanceMeshesVersion: -1,
    state: { playerId: 999, mode: 'flight' },
  };
}

function structure(kind, size, position, extra = {}) {
  const root = new THREE.Group();
  root.userData.kind = kind;
  root.userData.authoredAssetState = 'authored';
  Object.assign(root.userData, extra);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshStandardMaterial(),
  );
  // Authored places are centred on the origin by centerAuthoredPlaceRoot: the box spans ±h/2.
  root.add(body);
  root.position.set(position[0], 0, position[1]);
  root.updateMatrixWorld(true);
  return root;
}

test('a compact station reports its roof + margin across its footprint and nothing outside it', () => {
  const scene = new THREE.Scene();
  // Trade hub L: 180 × 79 × 160 WU after draw scale.
  const hub = structure('station', [180, 79, 160], [1000, -500]);
  scene.add(hub);
  const owner = stubOwner(scene, [hub]);
  const expectedRoof = 79 / 2 + CAMERA_CLEARANCE_MARGIN_WU;
  assert.ok(Math.abs(cameraRoofAt(owner, 1000, -500, 0) - expectedRoof) < 1e-6, 'centre column');
  assert.ok(Math.abs(cameraRoofAt(owner, 1000 + 80, -500, 0) - expectedRoof) < 1e-6, 'inside the footprint');
  assert.equal(cameraRoofAt(owner, 1000 + 900, -500, 0), -Infinity, 'far outside');
  // The camera's own floor: below the roof it must lift, above it nothing applies.
  assert.ok(Math.abs(cameraClearanceFloorAt(owner, 1000, -500, 30) - expectedRoof) < 1e-6);
  assert.equal(cameraClearanceFloorAt(owner, 1000, -500, 200), -Infinity);
});

test('a wide landmark (BVH window path) still roofs its centre column', () => {
  const scene = new THREE.Scene();
  // Wreck Cathedral scale: 609 × 221 × 252 WU — above CAMERA_CLEARANCE_GRID_MIN_SPAN_WU.
  const cathedral = structure('place', [609, 221, 252], [0, 0]);
  scene.add(cathedral);
  const owner = stubOwner(scene, [cathedral]);
  const roof = cameraRoofAt(owner, 0, 0, 0);
  assert.ok(Number.isFinite(roof), `wide root must report a roof at its centre, got ${roof}`);
  assert.ok(roof >= 221 / 2 + CAMERA_CLEARANCE_MARGIN_WU - 1e-3, `roof ${roof} must clear the top`);
  assert.equal(cameraRoofAt(owner, 2000, 0, 0), -Infinity);
});

test('a still-arriving structure has no roof; the committed body does', () => {
  const scene = new THREE.Scene();
  const pending = structure('station', [180, 79, 160], [0, 0], { authoredAssetState: 'awaiting-authored-admission' });
  scene.add(pending);
  const owner = stubOwner(scene, [pending]);
  assert.equal(cameraRoofAt(owner, 0, 0, 0), -Infinity, 'a pending stand-in must not lift the camera');
  pending.userData.authoredAssetState = 'authored';
  assert.ok(Number.isFinite(cameraRoofAt(owner, 0, 0, 0)), 'the committed body reports its roof');
});
