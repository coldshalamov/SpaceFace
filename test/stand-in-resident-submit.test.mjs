import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { rootDrawsResidentStandIn } from '../src/render/renderer.js';
import { shouldSubmitEntityMesh } from '../src/render/entityMeshVisibility.js';

function residentGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.userData.spacefaceGpuResident = true;
  return g;
}

function pendingRoot({ markerResident = true, markerVisible = true, hullResident = false } = {}) {
  const root = new THREE.Group();
  const hull = new THREE.Mesh(hullResident ? residentGeometry() : new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  hull.visible = false;
  const marker = new THREE.Mesh(markerResident ? residentGeometry() : new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  marker.visible = markerVisible;
  root.add(hull, marker);
  root.userData.resolvingMarker = marker;
  root.userData.authoredAssetState = 'awaiting-authored-admission';
  return { root, hull, marker };
}

test('a visible resident marker keeps a latched pending root on the glass', () => {
  const { root } = pendingRoot();
  assert.equal(rootDrawsResidentStandIn(root), true);
  const base = { pipelinesPending: true, geometryPending: true, onLiveGlass: true };
  assert.equal(shouldSubmitEntityMesh(base), false);
  assert.equal(shouldSubmitEntityMesh({ ...base, standInResident: true }), true);
  assert.equal(shouldSubmitEntityMesh({ ...base, standInResident: true, onLiveGlass: false }), false,
    'glass verdict still applies');
});

test('no stand-in claim when the proxy itself would upload or is not drawn', () => {
  assert.equal(rootDrawsResidentStandIn(pendingRoot({ markerResident: false }).root), false);
  assert.equal(rootDrawsResidentStandIn(pendingRoot({ markerVisible: false }).root), false);
  const visibleHull = pendingRoot();
  visibleHull.hull.visible = true;
  assert.equal(rootDrawsResidentStandIn(visibleHull.root), false, 'a visible unresident authored body is not a stand-in');
  const settled = pendingRoot();
  settled.root.userData.authoredAssetState = 'ready';
  assert.equal(rootDrawsResidentStandIn(settled.root), false);
  assert.equal(rootDrawsResidentStandIn(null), false);
});
