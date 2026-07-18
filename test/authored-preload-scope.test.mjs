import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import * as partsLibrary from '../src/render/partsLibrary.js';
import { getAssetResidency } from '../src/render/assetResidency.js';

function residencyFixtureLoader(renderer, controls = {}) {
  const registry = getAssetResidency(renderer);
  const resources = new Map();
  const load = async (url, options = {}) => {
    if (typeof controls.beforeLoad === 'function') await controls.beforeLoad(url, options);
    const key = `${url}::${options.slot || '*'}`;
    let record = resources.get(key);
    if (!record) {
      const resource = { byteSize: 1024, userData: {}, dispose() {} };
      const handle = registry.registerAsset(key, [resource]);
      record = {
        url,
        assetId: url.endsWith('kestrel.glb') ? 'SF_K0_KESTREL_BORROWED_TIME' : 'fixture',
        residency: { key, generation: handle.generation, state: 'resident' },
      };
      resources.set(key, record);
    }
    if (options.residencyOwner) registry.retain(key, options.residencyOwner, {
      role: options.residencyRole,
      sectorId: options.sectorId,
    });
    return record;
  };
  return { registry, load, resources };
}

test('boot preload makes only the opening-shot Kestrel and Helios hub resident', async () => {
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

  assert.equal(maxInFlight, 2, 'the two opening-shot assets may decode in parallel');
  const expectedBootUrls = Object.entries(plan).flatMap(([slot, files]) => files.map((file) => ({
    url: `assets/ships/release/parts/${file}`,
    slot,
  })));
  assert.deepEqual(requested, expectedBootUrls);
  assert.equal(partsLibrary.isAuthoredPartLibraryUsable(library), true);

  for (let frame = 0; frame < 600; frame++) await Promise.resolve();
  assert.equal(requested.length, expectedBootUrls.length,
    'idle frames must not trigger any second-wave asset loads');

  assert.equal(typeof partsLibrary.preloadAuthoredAssetsForEntity, 'function');
  await partsLibrary.preloadAuthoredAssetsForEntity(renderer, {
    id: 'hostile-demand',
    type: 'ship',
    data: { defId: 'ship_wasp', lootTableId: 'wasp_swarmer' },
  }, { releaseMode: true, loadAuthoredPart });
  assert.equal(requested.some(({ url }) => url.endsWith('wholeships/ashline_dart.glb')), true,
    'later demand loads the exact hostile production body');
  assert.equal(requested.length, expectedBootUrls.length + 1,
    'later entity demand adds one exact body rather than the full catalog');
  assert.ok(maxInFlight <= 3, 'asset preparation must stay within the bounded decode lanes');
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
  assert.deepEqual(modular, {
    hull: ['hulls/hull_fighter.glb'],
    cockpit: ['cockpits/cockpit_recessed.glb'],
    engine: ['engines/engine_vector.glb'],
    fin: ['fins/fin_radiator_grid.glb'],
    weapon: ['weapons/weapon_pulse_cannon.glb'],
    pod: ['pods/pod_utility.glb'],
    gear: ['gear/skid_trio.glb'],
    greeble: ['greebles/greeble_nav_lights.glb', 'greebles/greeble_rcs.glb'],
  });
  assert.equal(Object.values(modular).flat().length, 9,
    'ordinary modular demand must decode only its exact live composition, not all 34 family files');
});

test('world-place upgrades share the same bounded authored admission queue', () => {
  const source = readFileSync(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
  assert.match(source, /enqueueBoundaryUpgrade\(scene,\s*{\s*boundary,\s*entity,\s*run:/s);
  assert.match(source, /typeof job\.run === 'function'/);
});

test('authored visual admission awaits the exact GPU pipeline compiler when available', async () => {
  assert.equal(typeof partsLibrary.prepareAuthoredVisualPipelines, 'function');
  const root = new THREE.Group();
  const calls = [];

  const result = await partsLibrary.prepareAuthoredVisualPipelines(root, {
    prepareAuthoredPipelines: async (subject) => {
      calls.push(subject);
      return { skipped: false, programCount: 12 };
    },
  });

  assert.deepEqual(calls, [root]);
  assert.deepEqual(result, { skipped: false, programCount: 12 });
  await assert.rejects(
    partsLibrary.prepareAuthoredVisualPipelines(root, {
      prepareAuthoredPipelines: async () => { throw new Error('pipeline rejected'); },
    }),
    /pipeline rejected/,
  );
});

test('startup readiness gates the opening shot without waiting on distant population', () => {
  assert.equal(typeof partsLibrary.authoredCriticalVisualReadiness, 'function');
  const player = { id: 1, type: 'ship', alive: true, mesh: { userData: { authoredAssetState: 'authored' } } };
  const hub = {
    id: 'station_helios', type: 'station', alive: true,
    data: { archetypeGlb: 'place_station_trade_hub' },
    mesh: { userData: { authoredAssetState: 'authored' } },
  };
  const npc = { id: 2, type: 'ship', alive: true, mesh: { userData: { authoredAssetState: 'loading' } } };
  const proceduralAsteroid = { id: 3, type: 'asteroid', alive: true, mesh: { userData: {} } };
  const state = {
    playerId: 1,
    entities: new Map([[1, player], [2, npc], [3, proceduralAsteroid], [hub.id, hub]]),
    entityList: [player, npc, proceduralAsteroid, hub],
    world: { currentSectorId: 'sector_helios_prime' },
  };
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, true,
    'an unresolved noncritical NPC stays hidden but must not hold the flight gate');
  player.mesh.userData.authoredAssetState = 'loading';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, false);
  player.mesh.userData.authoredAssetState = 'authored';
  hub.mesh.userData.authoredAssetState = 'procedural-fallback';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, false);
  hub.mesh.userData.authoredAssetState = 'authored';
  player.pos = { x: 0, z: 0 };
  npc.pos = { x: 320, z: 0 };
  npc.mesh.userData.authoredAssetState = 'loading';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, true);
  assert.deepEqual(partsLibrary.authoredCriticalVisualReadiness(state).openingAssets.map((entry) => entry.id),
    [1, 'station_helios'],
    'only opening-shot identities participate while deferred boundaries remain fail-closed');
  npc.pos.x = 1200;
  npc.mesh.userData.authoredAssetState = 'loading';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, true,
    'off-camera traffic remains deferred and cannot expose a substitute visual');
  npc.pos.x = 5000;
  npc.mesh.userData.authoredAssetState = 'loading';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, true,
    'distance-independent noncritical population does not expand the opening-shot contract');
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

test('an authored ship load failure remains invisible and reports unavailable identity', async () => {
  const renderer = {};
  const scene = new THREE.Scene();
  const entity = {
    id: 'failed-authored-ship',
    type: 'ship',
    alive: true,
    data: { defId: 'ship_wasp', lootTableId: 'wasp_swarmer' },
  };
  const provisional = new THREE.Group();
  provisional.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  const boundary = partsLibrary.wrapShipWithAuthoredParts(entity, provisional, {
    releaseMode: true,
    loadAuthoredPart: async () => { throw new Error('synthetic authored load failure'); },
  });
  entity.mesh = boundary;
  scene.add(boundary);
  boundary.userData.requestAuthoredUpgrade(renderer, scene);
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(provisional.visible, false);
  assert.equal(boundary.userData.authoredAssetState, 'unavailable');
  assert.equal(boundary.userData.authoredVisualRoot, 'none-build-failed');
  partsLibrary.invalidatePartsLibraryCaches(renderer);
});

test('departure while waiting in the admission lane is a quiet cancellation, not an incomplete asset failure', async () => {
  const renderer = {};
  const loaded = [];
  const loadAuthoredPart = async (url) => {
    loaded.push(url);
    return { url, assetId: url.endsWith('kestrel.glb') ? 'SF_K0_KESTREL_BORROWED_TIME' : 'fixture' };
  };
  await partsLibrary.preloadAuthoredPartLibrary(renderer, { releaseMode: true, loadAuthoredPart });
  const loadedAtBoot = loaded.length;

  let active = false;
  const library = await partsLibrary.preloadAuthoredAssetsForEntity(renderer, {
    id: 'departed-in-admission',
    type: 'ship',
    data: { defId: 'ship_wasp', lootTableId: 'wasp_swarmer' },
  }, {
    releaseMode: true,
    loadAuthoredPart,
    residencyOwner: {},
    isResidencyOwnerActive: () => active,
  });

  assert.ok(library instanceof Map, 'expected departure resolves as an ordinary cancelled demand');
  assert.equal(loaded.slice(0, loadedAtBoot).some((url) => url.endsWith('ashline_dart.glb')), false,
    'noncritical production bodies are excluded from opening-shot residency');
  assert.equal(loaded.length, loadedAtBoot,
    'departed demand must not begin a new decode after boot admission');
  partsLibrary.invalidatePartsLibraryCaches(renderer);
});

test('a boundary released while canonical bootstrap is pending cannot resurrect after the await', async () => {
  const renderer = {};
  let resolveHub;
  const hubGate = new Promise((resolve) => { resolveHub = resolve; });
  const fixture = residencyFixtureLoader(renderer, {
    beforeLoad: async (url) => {
      if (url.endsWith('place_station_trade_hub.glb')) await hubGate;
    },
  });
  const boundary = {};
  let active = true;
  const pending = partsLibrary.preloadAuthoredAssetsForEntity(renderer, {
    id: 'late-player-boundary',
    type: 'ship',
    isPlayer: true,
    alive: true,
    data: { defId: 'ship_kestrel' },
  }, {
    releaseMode: true,
    loadAuthoredPart: fixture.load,
    residencyOwner: boundary,
    residencyRole: 'player',
    sectorId: 'sector_helios_prime',
    isResidencyOwnerActive: () => active,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  active = false;
  fixture.registry.releaseOwner(boundary, 'boundary-detached-during-bootstrap');
  const before = fixture.registry.canonicalDiagnostics();
  resolveHub();
  await pending;
  const after = fixture.registry.canonicalDiagnostics();

  assert.equal(after.assets.some((asset) => asset.roles.includes('player')), false,
    'the departed boundary is absent from every residency record');
  assert.equal(after.ownerCount, 1, 'only the bootstrap owner remains');
  assert.equal(after.residentResources, before.residentResources + 1,
    'canonical completion adds only the pending bootstrap hub resource');
  assert.ok(after.assets.every((asset) => asset.refCount === 1));
  partsLibrary.invalidatePartsLibraryCaches(renderer);
});
