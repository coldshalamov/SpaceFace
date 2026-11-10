import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { authoredPendingBoundarySubmitsStandIn } from '../src/render/renderer.js';
import { buildAuthoredPlaceProp } from '../src/render/partsLibrary.js';

function geologyEntity() {
  return {
    id: 901,
    type: 'asteroid',
    alive: true,
    radius: 15,
    collides: true,
    data: {
      typeId: 'ast_common_rock',
      authoredGeologySkin: true,
      placeId: 'place_asteroid_rock_a',
      placeTargetRadius: 15,
    },
  };
}

function fallbackRoot(name = 'SemanticGeologyFallback') {
  const root = new THREE.Group();
  root.name = name;
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  return root;
}

function pendingStandIn(boundary) {
  const state = boundary.userData.authoredAssetState;
  return (state === 'loading'
    || state === 'awaiting-authored-admission'
    || state === 'compiling-pipelines')
    && authoredPendingBoundarySubmitsStandIn(boundary);
}

test('geology fallback draws only after its own admission and stops at authored swap', () => {
  const fallback = fallbackRoot();
  const boundary = buildAuthoredPlaceProp(geologyEntity(), {
    releaseMode: true,
    fallbackRoot: fallback,
  });

  assert.ok(boundary);
  assert.equal(fallback.visible, true);
  assert.equal(boundary.userData.authoredFallbackActive, true);
  assert.equal(boundary.userData.authoredFallbackAdmittedOnce, false);

  // A later authored admission must not reveal an uncompiled or nonresident fallback merely
  // because the prior program stamp exists.
  boundary.userData.authoredAssetState = 'compiling-pipelines';
  boundary.userData.pipelinesPending = true;
  boundary.userData.sfAdmittedOnce = true;
  assert.equal(pendingStandIn(boundary), false);

  // The renderer sets this only after compile, residency, and exact-target touch all settle.
  boundary.userData.authoredFallbackAdmittedOnce = true;
  assert.equal(pendingStandIn(boundary), true);

  // The authored graft retires the fallback proof and replaces the mounted child atomically.
  const authored = new THREE.Group();
  authored.name = 'AuthoredGeologyRoot';
  boundary.remove(fallback);
  boundary.add(authored);
  boundary.userData.hull = authored;
  boundary.userData.authoredFallbackActive = false;
  boundary.userData.authoredFallbackAdmittedOnce = false;
  boundary.userData.authoredAssetState = 'authored';
  boundary.userData.pipelinesPending = false;
  assert.equal(pendingStandIn(boundary), false);
});

test('ordinary procedural roots cannot opt into the semantic geology fallback path', () => {
  const boundary = new THREE.Group();
  const fallback = fallbackRoot('ProceduralOnly');
  boundary.add(fallback);
  boundary.userData = {
    authoredAssetState: 'compiling-pipelines',
    authoredPendingFallbackDrawn: true,
    authoredGeologySkin: false,
    authoredFallbackActive: true,
    authoredFallbackAdmittedOnce: true,
    sfAdmittedOnce: true,
    pipelinesPending: true,
    hull: fallback,
  };
  assert.equal(authoredPendingBoundarySubmitsStandIn(boundary), false);

  const ordinaryAsteroid = geologyEntity();
  ordinaryAsteroid.data = {
    typeId: 'ast_common_rock',
    placeId: 'place_asteroid_rock_a',
    placeTargetRadius: 15,
  };
  assert.equal(buildAuthoredPlaceProp(ordinaryAsteroid, { releaseMode: true }), null);
});
