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

test('boot preload is a bounded player plan; opening-runway entities retain their own assets', async () => {
  assert.equal(typeof partsLibrary.authoredBootstrapPreloadPlan, 'function');

  const plan = partsLibrary.authoredBootstrapPreloadPlan();
  assert.deepEqual(plan, {
    hull: ['wholeships/kestrel.glb'],
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
  ]);
  assert.equal(partsLibrary.isAuthoredPartLibraryUsable(library), true);

  for (let frame = 0; frame < 600; frame++) await Promise.resolve();
  assert.equal(requested.length, 1,
    'idle frames without entity demand must never drain the unused authored catalog');

  assert.equal(typeof partsLibrary.preloadAuthoredAssetsForEntity, 'function');
  await partsLibrary.preloadAuthoredAssetsForEntity(renderer, {
    id: 'hostile-demand',
    type: 'ship',
    data: { defId: 'ship_wasp', lootTableId: 'wasp_swarmer' },
  }, { releaseMode: true, loadAuthoredPart });
  assert.deepEqual(requested.slice(1).map((row) => row.url), [
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

test('startup readiness gates the authored opening runway without waiting on distant NPCs', () => {
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
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).pipelineReady, false);
  player.mesh.userData.authoredAssetState = 'compiling-pipelines';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, false);
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).pipelineReady, true,
    'staged authored roots may advance to the combined GPU admission gate without entering flight');
  player.mesh.userData.authoredAssetState = 'authored';
  hub.mesh.userData.authoredAssetState = 'procedural-fallback';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, false);
  hub.mesh.userData.authoredAssetState = 'authored';
  player.pos = { x: 0, z: 0 };
  hub.pos = { x: 1800, z: 0 };
  hub.mesh.userData.authoredAssetState = 'loading';
  npc.pos = { x: 3000, z: 0 };
  npc.mesh.userData.authoredAssetState = 'loading';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, true,
    'traffic beyond the authored runway streams after handoff without publishing placeholders');
  npc.pos.x = 1200;
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, false,
    'a ship inside the opening authored runway must settle before control begins');
  npc.mesh.userData.authoredAssetState = 'compiling-pipelines';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).pipelineReady, true);
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, false);
  npc.mesh.userData.authoredAssetState = 'authored';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, true);
  npc.pos.x = 3000;
  npc.mesh.userData.authoredAssetState = 'loading';
  assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, true,
    'a distant NPC remains an on-demand asset and must not extend startup');
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

test('departure while waiting in the admission lane is a quiet cancellation, not an incomplete asset failure', async () => {
  const renderer = {};
  const loaded = [];
  const loadAuthoredPart = async (url) => {
    loaded.push(url);
    return { url, assetId: url.endsWith('kestrel.glb') ? 'SF_K0_KESTREL_BORROWED_TIME' : 'fixture' };
  };
  await partsLibrary.preloadAuthoredPartLibrary(renderer, { releaseMode: true, loadAuthoredPart });

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
  assert.equal(loaded.some((url) => url.endsWith('ashline_dart.glb')), false,
    'departed queued demand must not begin its decode');
  partsLibrary.invalidatePartsLibraryCaches(renderer);
});

test('a boundary released while canonical bootstrap is pending cannot resurrect after the await', async () => {
  const renderer = {};
  let resolveKestrel;
  const kestrelGate = new Promise((resolve) => { resolveKestrel = resolve; });
  const fixture = residencyFixtureLoader(renderer, {
    beforeLoad: async (url) => {
      if (url.endsWith('kestrel.glb')) await kestrelGate;
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
  resolveKestrel();
  await pending;
  const after = fixture.registry.canonicalDiagnostics();

  assert.equal(after.assets.some((asset) => asset.roles.includes('player')), false,
    'the departed boundary is absent from every residency record');
  assert.equal(after.ownerCount, 1, 'only the bootstrap owner remains');
  assert.equal(after.residentResources, before.residentResources + 1,
    'canonical completion adds only the pending Kestrel bootstrap resource');
  assert.ok(after.assets.every((asset) => asset.refCount === 1));
  partsLibrary.invalidatePartsLibraryCaches(renderer);
});
