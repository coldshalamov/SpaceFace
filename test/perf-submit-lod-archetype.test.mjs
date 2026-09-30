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

test('LOD family admission: cold start keeps packaged LOD0; siblings load only when packaged-live', () => {
  // Pelican's lod1/lod2 siblings now carry compiled pilots — demotion resolves the real simplified
  // file, and only that tier enters the at-LOD demand plan. Cold start still admits LOD0 alone.
  const pelican = { type: 'ship', data: { defId: 'ship_pelican' } };
  assert.deepEqual(
    authoredPreloadPlanForEntity(pelican, { requiredWholeShip: true }).hull,
    ['wholeships/pelican_production_v1.glb'],
  );
  assert.equal(
    wholeShipLodFileForEntity(pelican, 'lod1', { requiredWholeShip: true }),
    'wholeships/pelican_production_v1_lod1.glb',
  );
  assert.equal(
    wholeShipLodFileForEntity(pelican, 'lod2', { requiredWholeShip: true }),
    'wholeships/pelican_production_v1_lod2.glb',
  );
  assert.deepEqual(
    authoredPreloadPlanForEntityAtLod(pelican, 'lod1', { requiredWholeShip: true }).hull,
    ['wholeships/pelican_production_v1_lod1.glb'],
  );

  // Ranger's lod1/lod2 siblings carry compiled pilots — demotion resolves the real simplified
  // file, and only that tier enters the at-LOD demand plan. Cold start still admits LOD0 alone.
  const ranger = { type: 'ship', data: { defId: 'ship_ranger' } };
  assert.deepEqual(
    authoredPreloadPlanForEntity(ranger, { requiredWholeShip: true }).hull,
    ['wholeships/ranger_production_v1.glb'],
  );
  assert.equal(
    wholeShipLodFileForEntity(ranger, 'lod1', { requiredWholeShip: true }),
    'wholeships/ranger_production_v1_lod1.glb',
  );
  assert.equal(
    wholeShipLodFileForEntity(ranger, 'lod2', { requiredWholeShip: true }),
    'wholeships/ranger_production_v1_lod2.glb',
  );
  assert.deepEqual(
    authoredPreloadPlanForEntityAtLod(ranger, 'lod1', { requiredWholeShip: true }).hull,
    ['wholeships/ranger_production_v1_lod1.glb'],
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

test('distant live ships prewarm the full body admission builds; no packaged sibling is ever decoded on the glass', () => {
  // OWNER RULING 2026-09-29 (wholeShipLodPolicy.js WHOLE_SHIP_LOD_RUNTIME_DEMOTION = false): the
  // game is top-down, nothing is far, and a second file admitted on screen was the "ship is a
  // box and then it's a ship" swap. Admission always builds LOD0, so prewarm decodes LOD0 — a
  // LOD2 prewarm for a far hull was a decode nobody drew, and the LOD0 decode then ran late
  // inside the serial admission lane while the ship sat on the glass as a stand-in.
  const farPelican = {
    type: 'ship',
    id: 9,
    alive: true,
    radius: 8,
    pos: { x: 4000, z: 0 },
    data: { defId: 'ship_pelican' },
  };
  const pelicanRequests = authoredPrewarmRequestsForEntities([farPelican], {
    playerId: 1,
    playerPos: { x: 0, z: 0 },
    viewportHeight: 800,
    includeSpawnableArchetypes: false,
    requiredWholeShip: true,
  });
  const pelicanHullUrls = pelicanRequests.filter((r) => r.slot === 'hull').map((r) => r.url);
  assert.ok(
    pelicanHullUrls.some((url) => url.endsWith('wholeships/pelican_production_v1.glb')),
    'a distant pelican prewarms the full-detail LOD0 its admission will build',
  );
  assert.equal(
    pelicanHullUrls.some((url) => /_lod[12]\.glb$/.test(url)),
    false,
    'no packaged LOD sibling is decoded for a live ship — the runtime file swap is off',
  );

  const farRanger = { ...farPelican, data: { defId: 'ship_ranger' } };
  const rangerRequests = authoredPrewarmRequestsForEntities([farRanger], {
    playerId: 1,
    playerPos: { x: 0, z: 0 },
    viewportHeight: 800,
    includeSpawnableArchetypes: false,
    requiredWholeShip: true,
  });
  const rangerHullUrls = rangerRequests.filter((r) => r.slot === 'hull').map((r) => r.url);
  assert.ok(
    rangerHullUrls.some((url) => url.endsWith('wholeships/ranger_production_v1.glb')),
    'a distant ranger prewarms the full-detail LOD0 its admission will build',
  );
  assert.equal(
    rangerHullUrls.some((url) => /_lod[12]\.glb$/.test(url)),
    false,
    'no packaged LOD sibling is decoded for a live ship — the runtime file swap is off',
  );

  // A ship without packaged LOD siblings keeps its packaged LOD0.
  const farDart = {
    type: 'ship',
    id: 11,
    alive: true,
    radius: 8,
    pos: { x: 4000, z: 0 },
    data: { silhouette: 'drone_swarm' },
  };
  const dartRequests = authoredPrewarmRequestsForEntities([farDart], {
    playerId: 1,
    playerPos: { x: 0, z: 0 },
    viewportHeight: 800,
    includeSpawnableArchetypes: false,
    requiredWholeShip: true,
  });
  const dartHullUrls = dartRequests.filter((r) => r.slot === 'hull').map((r) => r.url);
  assert.ok(
    dartHullUrls.some((url) => url.endsWith('wholeships/ashline_dart.glb')),
    'an archetype without packaged LOD siblings safely keeps packaged LOD0',
  );
});
