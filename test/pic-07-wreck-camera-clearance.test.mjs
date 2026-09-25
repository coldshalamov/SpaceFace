import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { cameraClearanceFloorAt } from '../src/render/renderer.js';

const CAM_X = 300;
const CAM_Z = 0;
const CAM_Y = 10;
const MARGIN = 16;

function wreckRoot(spanX, spanY, spanZ) {
  const root = new THREE.Group();
  root.name = 'entity:wreck:test';
  root.position.set(CAM_X, 0, CAM_Z);
  root.userData.kind = 'wreck';
  if (spanX != null) {
    root.add(new THREE.Mesh(
      new THREE.BoxGeometry(spanX, spanY, spanZ),
      new THREE.MeshBasicMaterial(),
    ));
  }
  return root;
}

function structuralOwner(meshes) {
  return {
    _meshes: new Map(meshes.map((mesh, i) => [i + 1, mesh])),
    _meshesVersion: 1,
    _clearanceMeshesVersion: -1,
  };
}

test('a capital wreck is a camera-clearance structure at the station span bar', () => {
  const wreck = wreckRoot();
  wreck.userData.authoredAssetState = 'pending-admission';
  const owner = structuralOwner([wreck]);
  // Pre-authored substrate: a pending wreck is an empty marker and must not push the camera.
  assert.equal(cameraClearanceFloorAt(owner, CAM_X, CAM_Z, CAM_Y), -Infinity,
    'an empty pending substrate does not participate');

  // The authored body commits — the stamp changes with it, per the cache contract. A 200 WU
  // span is above the 120 WU bar shared with stations.
  wreck.userData.authoredAssetState = 'authored';
  wreck.add(new THREE.Mesh(new THREE.BoxGeometry(200, 60, 160), new THREE.MeshBasicMaterial()));
  const roof = 30 + MARGIN;
  assert.equal(cameraClearanceFloorAt(owner, CAM_X, CAM_Z, CAM_Y), roof,
    'a large wreck roofs the camera exactly like a station');
  assert.equal(cameraClearanceFloorAt(owner, CAM_X + 300, CAM_Z, CAM_Y), -Infinity,
    'the wreck floor is local to its own XZ footprint');

  // Cache invalidation: an authored stamp change recomputes instead of trusting the old box.
  wreck.scale.set(1, 2, 1);
  wreck.userData.authoredAssetState = 'authored-v2';
  assert.equal(cameraClearanceFloorAt(owner, CAM_X, CAM_Z, CAM_Y), 60 + MARGIN,
    'a grown wreck re-derives its clearance box on the stamp change');
});

test('small wrecks and non-structural kinds never push the chase camera', () => {
  const skiff = wreckRoot(80, 20, 80);
  const canister = new THREE.Mesh(new THREE.BoxGeometry(400, 400, 400), new THREE.MeshBasicMaterial());
  canister.position.set(CAM_X, 0, CAM_Z);
  canister.userData.kind = 'pickup';
  const owner = structuralOwner([skiff, canister]);
  assert.equal(cameraClearanceFloorAt(owner, CAM_X, CAM_Z, CAM_Y), -Infinity,
    'the span bar and the kinds gate stay the only admission rules');
});

// 2026-09-25: one asteroid body scale compounded to ±2e8; setFromObject then reported a
// ~1.4e8 roof and the chase camera went to orbit. Any non-finite bound, or a span larger than
// the camera's 14k far plane, cannot be a real structure — it is rejected, not raised.
test('a broken bound bigger than the camera far plane never pushes the camera', () => {
  const broken = wreckRoot(300, 300, 300);
  broken.children[0].scale.setScalar(2e8); // the compounded-scale failure shape
  const station = wreckRoot(300, 300, 300);
  station.userData.kind = 'station';
  const owner = structuralOwner([broken, station]);
  assert.equal(cameraClearanceFloorAt(owner, CAM_X, CAM_Z, CAM_Y), 150 + MARGIN,
    'the 2e8-scaled child is ignored; the sane 300 WU station still yields its roof');
  assert.equal(cameraClearanceFloorAt(owner, CAM_X + 5000, CAM_Z, CAM_Y), -Infinity,
    'off the footprint nothing reports — the broken box never becomes a floor');
});

test('a station that is still loading does not push the camera', () => {
  const loading = wreckRoot(400, 800, 400);
  loading.userData.kind = 'station';
  loading.userData.authoredAssetState = 'loading';
  const swapping = wreckRoot(400, 800, 400);
  swapping.userData.kind = 'station';
  swapping.position.set(CAM_X + 20, 0, CAM_Z);
  swapping.userData.authoredAssetState = 'orphaned-before-swap';
  const owner = structuralOwner([loading, swapping]);
  assert.equal(cameraClearanceFloorAt(owner, CAM_X, CAM_Z, CAM_Y), -Infinity,
    'a loading station has no roof yet');
  assert.equal(cameraClearanceFloorAt(owner, CAM_X + 20, CAM_Z, CAM_Y), -Infinity,
    'a model mid-swap does not report a roof');
});

test('a non-finite bound is rejected the same way', () => {
  const corrupt = wreckRoot(300, 300, 300);
  corrupt.children[0].position.y = Infinity;
  const owner = structuralOwner([corrupt]);
  assert.equal(cameraClearanceFloorAt(owner, CAM_X, CAM_Z, CAM_Y), -Infinity,
    'an infinite roof is not a structure the camera may clear');
});

test('the clearance kinds list names wrecks in the live owner', () => {
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const kinds = source.match(/const CAMERA_CLEARANCE_KINDS = new Set\(\[([^\]]*)\]\)/);
  assert.ok(kinds, 'the clearance kinds set stays a literal in renderer.js');
  const names = kinds[1].split(',').map((token) => token.trim().replaceAll("'", ''));
  assert.ok(names.includes('wreck'), `'wreck' is in the camera-clearance kinds: ${names}`);
});
