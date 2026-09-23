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
  // Pelican's lod1/lod2 siblings exist on disk but have no compiled render-package pilot — an
  // unpackaged remaster sibling must never leave the live path, so demotion falls back to the
  // packaged LOD0.
  const pelican = { type: 'ship', data: { defId: 'ship_pelican' } };
  assert.deepEqual(
    authoredPreloadPlanForEntity(pelican, { requiredWholeShip: true }).hull,
    ['wholeships/pelican_production_v1.glb'],
  );
  for (const level of ['lod1', 'lod2']) {
    assert.equal(
      wholeShipLodFileForEntity(pelican, level, { requiredWholeShip: true }),
      'wholeships/pelican_production_v1.glb',
      `unpackaged pelican ${level} must fall back to packaged LOD0`,
    );
    assert.deepEqual(
      authoredPreloadPlanForEntityAtLod(pelican, level, { requiredWholeShip: true }).hull,
      ['wholeships/pelican_production_v1.glb'],
    );
  }

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

test('distant live ships keep a packaged LOD0 instead of an unpackaged remaster sibling', () => {
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
  assert.ok(pelicanHullUrls.some((url) => url.endsWith('wholeships/pelican_production_v1.glb')));
  assert.equal(
    pelicanHullUrls.some((url) => url.endsWith('wholeships/pelican_production_v1_lod2.glb')),
    false,
    'unpackaged Pelican LOD2 must never enter the live demand plan',
  );

  // The same far ship demotes to its packaged simplified sibling when one exists.
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
    rangerHullUrls.some((url) => url.endsWith('wholeships/ranger_production_v1_lod2.glb')),
    'a distant ranger requests its packaged simplified LOD2',
  );
  assert.equal(
    rangerHullUrls.some((url) => url.endsWith('wholeships/ranger_production_v1.glb')),
    false,
    'the packaged demotion must not also pin the full-detail LOD0',
  );
});
