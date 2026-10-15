import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import {
  CAMERA_CLEARANCE_MARGIN_WU,
  cameraClearanceFloorAt,
  setCameraClearanceFloorRetainForBench,
} from '../src/render/renderer.js';
import { clearanceNeighborhoodRaw } from '../src/render/clearanceQuery.js';

function ownerWith(root) {
  return {
    _meshes: new Map([[1, root]]),
    _meshesVersion: 1,
    _clearanceMeshesVersion: -1,
  };
}

function stationRoot() {
  const root = new THREE.Group();
  root.position.set(1000, 0, -400);
  root.userData.kind = 'station';
  root.userData.authoredAssetState = 'authored';
  const geometry = new THREE.BoxGeometry(600, 180, 600, 4, 4, 4);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  root.add(mesh);
  root.updateMatrixWorld(true);
  return { root, mesh, geometry };
}

function floorAt(owner, root) {
  return cameraClearanceFloorAt(owner, root.position.x, root.position.z, -1000);
}

function freshFloor(root) {
  const box = new THREE.Box3().setFromObject(root);
  const hit = clearanceNeighborhoodRaw(root, {
    minX: box.min.x,
    minY: box.min.y,
    minZ: box.min.z,
    maxX: box.max.x,
    maxY: box.max.y,
    maxZ: box.max.z,
  }, root.position.x, root.position.z);
  assert.equal(hit.failed, false);
  assert.equal(hit.empty, false);
  return hit.raw + CAMERA_CLEARANCE_MARGIN_WU;
}

function countShapecasts(fn) {
  const original = MeshBVH.prototype.shapecast;
  let casts = 0;
  MeshBVH.prototype.shapecast = function count(...args) {
    casts += 1;
    return original.apply(this, args);
  };
  try {
    fn(() => casts);
  } finally {
    MeshBVH.prototype.shapecast = original;
  }
}

test('pure root translation retains relative BVH cells and applies lazy Y offset', () => {
  const { root } = stationRoot();
  const owner = ownerWith(root);
  const previous = setCameraClearanceFloorRetainForBench(false);
  try {
    countShapecasts((casts) => {
      const first = floorAt(owner, root);
      assert.equal(casts(), 1);
      root.position.x += 1.25;
      root.position.y += 7;
      root.updateMatrixWorld(true);
      const moved = floorAt(owner, root);
      assert.equal(casts(), 1, 'a pure root translation reuses the relative cell answer');
      assert.equal(moved, first + 7, 'the retained answer carries the root Y translation');
      assert.equal(moved, freshFloor(root), 'the retained roof matches a fresh BVH query');

      root.rotation.y = 0.15;
      root.updateMatrixWorld(true);
      floorAt(owner, root);
      assert.equal(casts(), 3, 'a root linear-pose change forces a fresh measurement');
    });
  } finally {
    setCameraClearanceFloorRetainForBench(previous);
  }
});

test('root rotation and scale setters invalidate before an explicit world-matrix update', () => {
  const { root } = stationRoot();
  const owner = ownerWith(root);
  const previous = setCameraClearanceFloorRetainForBench(false);
  try {
    countShapecasts((casts) => {
      floorAt(owner, root);
      assert.equal(casts(), 1);

      root.rotation.y = 0.2;
      floorAt(owner, root);
      assert.equal(casts(), 2, 'root quaternion mutation forces a fresh measurement');

      root.scale.set(1.15, 0.9, 1.1);
      floorAt(owner, root);
      assert.equal(casts(), 3, 'root scale mutation forces a fresh measurement');
    });
  } finally {
    setCameraClearanceFloorRetainForBench(previous);
  }
});

test('child pose and geometry revisions invalidate translated clearance cells', () => {
  const { root, mesh, geometry } = stationRoot();
  const owner = ownerWith(root);
  const previous = setCameraClearanceFloorRetainForBench(false);
  try {
    countShapecasts((casts) => {
      floorAt(owner, root);
      assert.equal(casts(), 1);

      mesh.rotation.y = 0.25;
      root.updateMatrixWorld(true);
      floorAt(owner, root);
      assert.equal(casts(), 2, 'child rotation forces a fresh measurement');

      mesh.scale.set(1.2, 0.9, 1.1);
      root.updateMatrixWorld(true);
      floorAt(owner, root);
      assert.equal(casts(), 3, 'child scale forces a fresh measurement');

      const position = geometry.attributes.position;
      position.setY(0, position.getY(0) + 35);
      position.needsUpdate = true;
      root.updateMatrixWorld(true);
      const afterGeometry = floorAt(owner, root);
      assert.equal(casts(), 4, 'a position attribute revision forces a fresh measurement');
      assert.equal(afterGeometry, freshFloor(root), 'the rebuilt roof matches a fresh BVH query');
    });
  } finally {
    setCameraClearanceFloorRetainForBench(previous);
  }
});
