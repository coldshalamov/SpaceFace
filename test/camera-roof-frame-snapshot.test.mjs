// The glide's per-frame roof snapshot must answer exactly like the always-validating walk, and must
// never carry a validated record into the next frame after a mesh moved.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  beginCameraRoofFrame,
  cameraRoofAt,
  endCameraRoofFrame,
} from '../src/render/cameraClearanceGuard.js';

function stubOwner(roots) {
  const scene = new THREE.Scene();
  const meshes = new Map();
  roots.forEach((root, i) => {
    meshes.set(i + 1, root);
    scene.add(root);
  });
  return {
    scene,
    _meshes: meshes,
    _meshesVersion: 1,
    _clearanceMeshes: null,
    _clearanceMeshesVersion: -1,
    state: { playerId: 999, mode: 'flight' },
  };
}

function structure(kind, size, position) {
  const root = new THREE.Group();
  root.userData.kind = kind;
  root.userData.authoredAssetState = 'authored';
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshStandardMaterial(),
  ));
  root.position.set(position[0], 0, position[1]);
  root.updateMatrixWorld(true);
  return root;
}

function sampleColumns() {
  const columns = [];
  for (let x = -1400; x <= 1400; x += 37) {
    for (let z = -1100; z <= 1100; z += 41) columns.push([x, z]);
  }
  return columns;
}

test('roof answers inside a frame match the always-validating walk column for column', () => {
  const hub = structure('station', [180, 79, 160], [1000, -500]);
  const cathedral = structure('place', [609, 221, 252], [-600, 200]);
  const owner = stubOwner([hub, cathedral]);
  const columns = sampleColumns();
  const outside = columns.map(([x, z]) => cameraRoofAt(owner, x, z, 12));

  beginCameraRoofFrame();
  try {
    const inside = columns.map(([x, z]) => cameraRoofAt(owner, x, z, 12));
    const insideAgain = columns.map(([x, z]) => cameraRoofAt(owner, x, z, 12));
    assert.deepEqual(inside, outside, 'frame answers must match the plain walk');
    assert.deepEqual(insideAgain, outside, 'repeat queries in one frame must not drift');
  } finally {
    endCameraRoofFrame();
  }
});

test('a structure that moves between frames is re-validated, not replayed from the old frame', () => {
  const hub = structure('station', [180, 79, 160], [1000, -500]);
  const owner = stubOwner([hub]);
  beginCameraRoofFrame();
  try {
    assert.ok(Number.isFinite(cameraRoofAt(owner, 1000, -500, 0)), 'roof at the original footprint');
  } finally {
    endCameraRoofFrame();
  }
  hub.position.set(5000, 0, 5000);
  hub.updateMatrixWorld(true);
  beginCameraRoofFrame();
  try {
    assert.equal(cameraRoofAt(owner, 1000, -500, 0), -Infinity, 'old footprint is clear after the move');
    assert.ok(Number.isFinite(cameraRoofAt(owner, 5000, 5000, 0)), 'new footprint carries the roof');
  } finally {
    endCameraRoofFrame();
  }
});

test('a closed frame leaves no snapshot behind for plain queries', () => {
  const hub = structure('station', [180, 79, 160], [0, 0]);
  const owner = stubOwner([hub]);
  beginCameraRoofFrame();
  cameraRoofAt(owner, 0, 0, 0);
  endCameraRoofFrame();
  hub.position.set(4000, 0, 0);
  hub.updateMatrixWorld(true);
  assert.equal(cameraRoofAt(owner, 0, 0, 0), -Infinity, 'plain query sees the current pose');
});
