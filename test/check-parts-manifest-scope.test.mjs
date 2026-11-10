import assert from 'node:assert/strict';
import test from 'node:test';

import { isPublishedPartsSourceFile } from '../scripts/lib/partsManifestScope.mjs';

test('published parts source inventory excludes authoring and review GLBs', () => {
  assert.equal(isPublishedPartsSourceFile('places/place_station_trade_hub.glb'), true);
  assert.equal(isPublishedPartsSourceFile('works/place_works_refinery.glb'), true);

  assert.equal(isPublishedPartsSourceFile('blender/place_station_trade_hub_export_tmp.glb'), false);
  assert.equal(isPublishedPartsSourceFile('revamp-evidence/engine_vector/_export_tmp.glb'), false);
  assert.equal(isPublishedPartsSourceFile('places/evidence/graphics_3d/unit1/candidates/place_nav_buoy.glb'), false);
});

test('scope helper fails closed for non-GLB values', () => {
  assert.equal(isPublishedPartsSourceFile('places/place_station_trade_hub.gltf'), false);
  assert.equal(isPublishedPartsSourceFile(''), false);
  assert.equal(isPublishedPartsSourceFile(null), false);
});
