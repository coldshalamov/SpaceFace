import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  buildFallbackPlaceProp,
  buildAuthoredPlaceProp,
} from '../src/render/partsLibrary.js';

test('PIC-11: A missing place does not appear as a published cube', () => {
  const entity = {
    id: 'prop_test_missing',
    type: 'fx',
    radius: 12,
    data: {
      placeId: 'place_dead_hulk',
      landmark: true,
    },
  };

  const fallback = buildFallbackPlaceProp(entity, 'places/place_dead_hulk.glb');
  assert.ok(fallback, 'fallback prop must exist');
  assert.ok(fallback.isObject3D, 'fallback prop must be an Object3D');
  assert.equal(fallback.children.length, 0, 'fallback prop must keep an empty substrate/marker, not a published cube mesh');
  assert.equal(fallback.userData.kind, 'place');
  assert.equal(fallback.userData.placeId, 'place_dead_hulk');
  assert.equal(fallback.userData.renderContract?.gracefulFallback, true);

  // When built through authored place prop boundary
  const boundary = buildAuthoredPlaceProp(entity, { releaseMode: true });
  assert.ok(boundary, 'boundary should be created');
  const meshes = [];
  boundary.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  assert.equal(meshes.length, 0, 'no fallback cube meshes should be published in the authored asset boundary');
});
