import test from 'node:test';
import assert from 'node:assert/strict';

import { WORLD_SITE_ASSET_BINDINGS } from '../src/data/worldSiteAssetBindings.js';
import {
  PART_LIBRARY_CONTRACT,
  resolvePlaceFileForEntity,
} from '../src/render/partsLibrary.js';

test('every immutable World Site asset binding is admitted through the authored place route', () => {
  const admittedPlaceFiles = new Set(PART_LIBRARY_CONTRACT.slots.place);

  for (const placeId of Object.keys(WORLD_SITE_ASSET_BINDINGS).sort()) {
    const expectedFile = `places/${placeId}.glb`;
    const entity = { type: 'fx', data: { placeId } };

    assert.equal(resolvePlaceFileForEntity(entity), expectedFile, placeId);
    assert.ok(admittedPlaceFiles.has(expectedFile), `${placeId} missing from place slot`);
  }
});
