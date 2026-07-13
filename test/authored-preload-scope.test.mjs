import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import * as partsLibrary from '../src/render/partsLibrary.js';

test('boot preload is a bounded player and starting-sector plan, not the whole catalog', async () => {
  assert.equal(typeof partsLibrary.authoredBootstrapPreloadPlan, 'function');

  const plan = partsLibrary.authoredBootstrapPreloadPlan();
  assert.deepEqual(plan, {
    hull: ['wholeships/kestrel.glb'],
    place: ['places/place_station_trade_hub.glb'],
  });

  let inFlight = 0;
  let maxInFlight = 0;
  const requested = [];
  const renderer = {};
  const loadAuthoredPart = async (url, options) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    requested.push({ url, slot: options.slot });
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight--;
    return { url, assetId: url.endsWith('kestrel.glb') ? 'SF_K0_KESTREL_BORROWED_TIME' : 'fixture' };
  };

  const library = await partsLibrary.preloadAuthoredPartLibrary(renderer, {
    releaseMode: true,
    loadAuthoredPart,
  });

  assert.equal(maxInFlight, 1, 'large GLBs must decode/upload serially during the boot gate');
  assert.deepEqual(requested.map((row) => row.url), [
    'assets/ships/release/parts/wholeships/kestrel.glb',
    'assets/ships/release/parts/places/place_station_trade_hub.glb',
  ]);
  assert.equal(partsLibrary.isAuthoredPartLibraryUsable(library), true);

  for (let frame = 0; frame < 600; frame++) await Promise.resolve();
  assert.equal(requested.length, 2,
    'idle frames without entity demand must never drain the unused authored catalog');

  assert.equal(typeof partsLibrary.preloadAuthoredAssetsForEntity, 'function');
  await partsLibrary.preloadAuthoredAssetsForEntity(renderer, {
    id: 'hostile-demand',
    type: 'ship',
    data: { defId: 'ship_wasp', lootTableId: 'wasp_swarmer' },
  }, { releaseMode: true, loadAuthoredPart });
  assert.deepEqual(requested.slice(2).map((row) => row.url), [
    'assets/ships/release/parts/wholeships/ashline_dart.glb',
  ]);
  assert.equal(maxInFlight, 1, 'demand loading must keep the same serial decode bound');
  partsLibrary.invalidatePartsLibraryCaches(renderer);
});

test('ship on-demand plans request only the exact body or one modular family', () => {
  assert.equal(typeof partsLibrary.authoredPreloadPlanForEntity, 'function');

  const hostile = partsLibrary.authoredPreloadPlanForEntity({
    id: 'hostile-1',
    type: 'ship',
    data: { defId: 'ship_wasp', lootTableId: 'wasp_swarmer' },
  });
  assert.deepEqual(hostile, { hull: ['wholeships/ashline_dart.glb'] });

  const modular = partsLibrary.authoredPreloadPlanForEntity({
    id: 'patrol-1',
    type: 'ship',
    data: { defId: 'ship_wasp' },
  });
  assert.deepEqual(modular.hull, ['hulls/hull_fighter.glb']);
  assert.equal(Object.hasOwn(modular, 'place'), false);
  assert.ok(Object.keys(modular).every((slot) => slot !== 'hull' || modular[slot].length === 1));
  assert.ok(
    Object.values(modular).reduce((sum, files) => sum + files.length, 0)
      < Object.values(partsLibrary.PART_LIBRARY_CONTRACT.slots).reduce((sum, files) => sum + files.length, 0),
    'one ship must never pull the complete authored catalog',
  );
});

test('world-place upgrades share the same bounded authored admission queue', () => {
  const source = readFileSync(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
  assert.match(source, /enqueueBoundaryUpgrade\(scene,\s*{\s*boundary,\s*entity,\s*run:/s);
  assert.match(source, /typeof job\.run === 'function'/);
});

test('startup readiness gates only the authored player and critical starting place', () => {
  assert.equal(typeof partsLibrary.authoredCriticalVisualReadiness, 'function');
  const player = { id: 1, type: 'ship', alive: true, mesh: { userData: { authoredAssetState: 'authored' } } };
  const hub = {
    id: 'station_helios', type: 'station', alive: true,
    data: { archetypeGlb: 'place_station_trade_hub' },
    mesh: { userData: { authoredAssetState: 'authored' } },
  };
  const npc = { id: 2, type: 'ship', alive: true, mesh: { userData: { authoredAssetState: 'loading' } } };
  const state = {
    playerId: 1,
    entities: new Map([[1, player], [2, npc], [hub.id, hub]]),
    entityList: [player, npc, hub],
    world: { currentSectorId: 'sector_helios_prime' },
  };
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, true,
    'noncritical NPC upgrades must not hold the flight gate');
  player.mesh.userData.authoredAssetState = 'loading';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, false);
  player.mesh.userData.authoredAssetState = 'authored';
  hub.mesh.userData.authoredAssetState = 'procedural-fallback';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, false);
});

test('a departed boundary is discarded before its asset can load', async () => {
  const source = readFileSync(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
  assert.match(source, /loadAuthoredPart: options\.loadAuthoredPart/,
    'boundary demand must preserve the injected loader used by the live admission path');

  const renderer = {};
  const scene = new THREE.Scene();
  const entity = { id: 'departed', type: 'ship', alive: true, data: { defId: 'ship_wasp', lootTableId: 'wasp_swarmer' } };
  const fallback = new THREE.Group();
  fallback.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  const requested = [];
  const boundary = partsLibrary.wrapShipWithAuthoredParts(entity, fallback, {
    releaseMode: true,
    loadAuthoredPart: async (url) => { requested.push(url); return { url }; },
  });
  entity.mesh = boundary;
  scene.add(boundary);
  boundary.userData.requestAuthoredUpgrade(renderer, scene);
  scene.remove(boundary);
  entity.alive = false;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(requested, [], 'detached/dead sector entity must be cancelled before decode');
  assert.deepEqual(partsLibrary.getAuthoredUpgradeQueueStats(scene), { pending: 0, running: false });
});
