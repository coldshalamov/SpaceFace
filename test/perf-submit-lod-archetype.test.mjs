import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authoredPreloadPlanForEntity,
  authoredPreloadPlanForEntityAtLod,
  authoredPrewarmRequestsForEntities,
  runMaterialSharingContractProbe,
  spawnableShipArchetypePrewarmUrls,
  wholeShipLodFileForEntity,
} from '../src/render/partsLibrary.js';
import * as THREE from 'three';

test('tintable hull variants with different base albedo still share after palette keying', () => {
  const probe = runMaterialSharingContractProbe(THREE);
  assert.equal(probe.hullShareMerged, true);
  assert.equal(probe.hullProgramFamilyShared, true);
});

test('wasp LOD family keeps packaged LOD0 on the live demand plan', () => {
  const entity = { type: 'ship', data: { defId: 'ship_wasp' } };
  const cold = authoredPreloadPlanForEntity(entity, { requiredWholeShip: true });
  assert.deepEqual(cold.hull, ['wholeships/wasp_production_v1.glb']);
  assert.equal(
    wholeShipLodFileForEntity(entity, 'lod1', { requiredWholeShip: true }),
    'wholeships/wasp_production_v1.glb',
  );
  assert.equal(
    wholeShipLodFileForEntity(entity, 'lod2', { requiredWholeShip: true }),
    'wholeships/wasp_production_v1.glb',
  );
  assert.deepEqual(
    authoredPreloadPlanForEntityAtLod(entity, 'lod1', { requiredWholeShip: true }).hull,
    ['wholeships/wasp_production_v1.glb'],
  );
});

test('sector prewarm requests include spawnable hostile and traffic archetype hulls', () => {
  const urls = spawnableShipArchetypePrewarmUrls();
  assert.ok(urls.includes('wholeships/ashline_dart.glb'));
  assert.ok(urls.includes('wholeships/helios_lark.glb'));
  assert.ok(urls.includes('wholeships/wasp_production_v1.glb'));

  const requests = authoredPrewarmRequestsForEntities([], { sectorId: 'test' });
  const hullUrls = requests.filter((r) => r.slot === 'hull').map((r) => r.url);
  assert.ok(hullUrls.some((url) => url.endsWith('wholeships/ashline_dart.glb')));
  assert.ok(hullUrls.some((url) => url.endsWith('wholeships/helios_span.glb')));
});

test('distant live ships keep a packaged LOD0 instead of an unpackaged remaster sibling', () => {
  const far = {
    type: 'ship',
    id: 9,
    alive: true,
    radius: 8,
    pos: { x: 4000, z: 0 },
    data: { defId: 'ship_wasp' },
  };
  const requests = authoredPrewarmRequestsForEntities([far], {
    playerId: 1,
    playerPos: { x: 0, z: 0 },
    viewportHeight: 800,
    includeSpawnableArchetypes: false,
    requiredWholeShip: true,
  });
  const hullUrls = requests.filter((r) => r.slot === 'hull').map((r) => r.url);
  assert.ok(hullUrls.some((url) => url.endsWith('wholeships/wasp_production_v1.glb')));
  assert.equal(
    hullUrls.some((url) => url.endsWith('wholeships/wasp_production_v1_lod2.glb')),
    false,
    'unpackaged Wasp LOD2 must never enter the live demand plan',
  );
});
