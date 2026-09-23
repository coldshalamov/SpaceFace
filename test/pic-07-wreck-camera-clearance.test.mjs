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

test('the clearance kinds list names wrecks in the live owner', () => {
  const source = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const kinds = source.match(/const CAMERA_CLEARANCE_KINDS = new Set\(\[([^\]]*)\]\)/);
  assert.ok(kinds, 'the clearance kinds set stays a literal in renderer.js');
  const names = kinds[1].split(',').map((token) => token.trim().replaceAll("'", ''));
  assert.ok(names.includes('wreck'), `'wreck' is in the camera-clearance kinds: ${names}`);
});
