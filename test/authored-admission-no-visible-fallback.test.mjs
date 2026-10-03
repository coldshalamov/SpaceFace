import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  authoredBootstrapPreloadPlan,
  authoredCriticalVisualReadiness,
  buildAuthoredPlaceProp,
  buildAuthoredStationArchetype,
  collectFirstFlightCookEntities,
  isFirstFlightCookEntity,
  isInitialAuthoredCompositionEntity,
  isOpeningFlightGateEntity,
  resolvePlaceFileForEntity,
  upgradeAuthoredPlaceBoundaryForProbe,
  wrapShipWithAuthoredParts,
} from '../src/render/partsLibrary.js';
import { ILLUSTRATED_SURFACE_KEY } from '../src/render/illustratedSurface.js';
import { modelTruthRow } from '../src/data/modelTruth.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import {
  asteroidInstanceMembership,
  createAsteroidInstancePool,
  registerAsteroidBaseLeaf,
} from '../src/render/asteroidInstancePool.js';

function fallback(name) {
  const root = new THREE.Group();
  root.name = name;
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  return root;
}

test('required starter boundary fails closed instead of publishing its procedural body', () => {
  const procedural = fallback('ProceduralStarter');
  const boundary = wrapShipWithAuthoredParts({
    id: 1,
    type: 'ship',
    isPlayer: true,
    alive: true,
    data: { defId: 'ship_kestrel' },
  }, procedural, { releaseMode: true, requiredWholeShip: true });

  assert.equal(procedural.visible, false);
  assert.equal(boundary.userData.authoredAssetState, 'awaiting-authored-admission');
  assert.equal(boundary.userData.authoredVisualRoot, 'none-pending-admission');
  assert.equal(boundary.userData.renderContract.gracefulFallback, false);
});

test('an empty authored admission substrate can be demanded without a renderable trigger', () => {
  const substrate = new THREE.Group();
  substrate.name = 'DirectAuthoredAdmissionSubstrate';
  substrate.userData.authoredAdmissionSubstrate = true;
  const boundary = wrapShipWithAuthoredParts({
    id: 10,
    type: 'ship',
    isPlayer: true,
    alive: true,
    data: { defId: 'ship_kestrel' },
  }, substrate, { releaseMode: true, requiredWholeShip: true });

  assert.equal(typeof boundary.userData.requestAuthoredUpgrade, 'function');
  assert.equal(boundary.userData.authoredAssetState, 'awaiting-authored-admission');
  assert.equal(boundary.userData.authoredVisualRoot, 'none-pending-admission');
  let renderables = 0;
  boundary.traverse((object) => {
    if (object.isMesh || object.isLine || object.isPoints) renderables++;
  });
  assert.equal(renderables, 0, 'the direct authored boundary must allocate no temporary drawables');
});

test('the live direct-authored route skips bespoke and procedural ship construction', () => {
  let proceduralBuilds = 0;
  let heroBuilds = 0;
  const factory = {
    build() {
      proceduralBuilds++;
      return fallback('WrongProceduralIdentity');
    },
  };
  installVisualOverrides(factory, {
    releaseMode: true,
    directAuthoredMount: true,
    kestrelBuilder() {
      heroBuilds++;
      return fallback('ObsoleteHeroSubstrate');
    },
  });

  const boundary = factory.build({
    id: 11,
    type: 'ship',
    isPlayer: true,
    alive: true,
    data: { defId: 'ship_kestrel' },
  });

  assert.equal(heroBuilds, 0, 'resident authored ships must not construct the retired hero body');
  assert.equal(proceduralBuilds, 0, 'resident authored ships must not construct a generic body');
  assert.equal(boundary.userData.authoredAdmissionSubstrate, true);
  assert.equal(boundary.userData.authoredAdmissionTemporaryDrawables, 1,
    'direct admission diagnostics describe exactly the resolving marker the substrate carries');
  assert.equal(typeof boundary.userData.requestAuthoredUpgrade, 'function');
  const renderables = [];
  boundary.traverse((object) => {
    if (object.isMesh || object.isLine || object.isPoints) renderables.push(object);
  });
  // The only thing that may draw before the exact authored body is admitted is the resolving
  // marker — a shared-asset silhouette that cannot impersonate any ship identity. It stays
  // abstract so the authored commit is an enhancement, not a hull swap.
  assert.equal(renderables.length, 1, 'pending authored ships show a resolving marker, not nothing');
  assert.equal(renderables[0].name, 'AuthoredResolvingMarker');
  assert.equal(renderables[0].userData.authoredResolvingMarker, true);
  assert.equal(renderables[0].userData.spacefaceSharedAsset, true,
    'marker geometry/material are shared so teardown never disposes the singletons');
  assert.equal(renderables[0].material.isMeshStandardMaterial, true,
    'the marker uses the already-linked Standard family — no new program compiles inside bloomScene');
  assert.equal(renderables[0].visible, true);
});

test('direct authored mounting also skips ordinary NPC construction', () => {
  let proceduralBuilds = 0;
  const factory = {
    build() {
      proceduralBuilds++;
      return fallback('ProceduralNpc');
    },
  };
  installVisualOverrides(factory, { releaseMode: true, directAuthoredMount: true });

  const boundary = factory.build({
    id: 12,
    type: 'ship',
    alive: true,
    factionId: 'neutral',
    data: { defId: 'ship_mule' },
  });

  assert.equal(proceduralBuilds, 0);
  assert.equal(boundary.userData.shipConstruction, 'authored-direct');
  assert.equal(typeof boundary.userData.requestAuthoredUpgrade, 'function');
});

test('preview and precompile paths retain explicit procedural construction', () => {
  let previewBuilds = 0;
  const previewFactory = {
    build() {
      previewBuilds++;
      return fallback('PreviewShip');
    },
  };
  installVisualOverrides(previewFactory, { releaseMode: false, authoredShips: false });
  const preview = previewFactory.build({ id: 13, type: 'ship', alive: true, data: { defId: 'ship_mule' } });
  assert.equal(previewBuilds, 1);
  assert.equal(preview.name, 'PreviewShip');

  let precompileBuilds = 0;
  const precompileFactory = {
    build() {
      precompileBuilds++;
      return fallback('PrecompileShip');
    },
  };
  installVisualOverrides(precompileFactory, { releaseMode: false, directAuthoredMount: true });
  const probe = precompileFactory.build({
    id: 14,
    type: 'ship',
    alive: true,
    data: { defId: 'ship_mule', precompileProbe: true },
  });
  assert.equal(precompileBuilds, 1);
  assert.equal(probe.name, 'PrecompileShip');
});

test('authored world-place boundary does not publish the temporary box', () => {
  const boundary = buildAuthoredPlaceProp({
    id: 2,
    type: 'fx',
    alive: true,
    radius: 12,
    data: { placeId: 'place_nav_buoy' },
  }, { releaseMode: true });
  const temporary = boundary.children[0];

  assert.ok(temporary);
  assert.equal(temporary.visible, false);
  assert.equal(boundary.userData.authoredAssetState, 'awaiting-authored-admission');
  assert.equal(boundary.userData.authoredVisualRoot, 'none-pending-admission');
});

test('station fallbacks carry the global illustrated surface while place props stay empty', () => {
  // Graceful station fallbacks are player-visible when an authored GLB fails to load. They must
  // stay in the same Lacquer & Starlight light language as the fleet instead of flat physical
  // shading. A missing world-place prop publishes no fallback geometry at all (PIC-11).
  const litMaterials = (root) => {
    const list = [];
    root.traverse((object) => {
      if (!object?.isMesh) return;
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of mats) if (material?.isMeshStandardMaterial) list.push(material);
    });
    return list;
  };

  const placeBoundary = buildAuthoredPlaceProp({
    id: 3,
    type: 'fx',
    alive: true,
    radius: 12,
    data: { placeId: 'place_nav_buoy' },
  }, { releaseMode: true });
  const placeSurface = litMaterials(placeBoundary.children[0]);
  // PIC-11: a missing place prop keeps an empty substrate rather than publishing cube geometry.
  assert.equal(placeSurface.length, 0, 'place prop publishes no fallback surface');

  const stationBoundary = buildAuthoredStationArchetype({
    id: 'station_surface_contract',
    type: 'station',
    alive: true,
    radius: 34,
    pos: { x: 0, z: 0 },
    data: { archetypeGlb: 'place_station_military', dockRadius: 72, placeScale: 72 / 14 },
  }, { releaseMode: true });
  const stationSurface = litMaterials(stationBoundary.children[0]);
  assert.ok(stationSurface.length > 0, 'station fallback has a Standard material');
  for (const material of stationSurface) {
    assert.equal(material.userData.spacefaceIllustratedSurface, ILLUSTRATED_SURFACE_KEY, material.name);
  }
});

test('authored geology uses the place boundary only with an explicit radius-matched contract', () => {
  const explicit = {
    id: 20,
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
  const boundary = buildAuthoredPlaceProp(explicit, { releaseMode: true });

  assert.ok(boundary);
  assert.equal(resolvePlaceFileForEntity(explicit), 'places/place_asteroid_rock_a.glb');
  assert.equal(boundary.userData.placeTargetRadius, explicit.radius);
  assert.equal(boundary.userData.authoredGeologySkin, true);
  assert.equal(boundary.userData.authoredAssetState, 'awaiting-authored-admission');
  // Radius-matched geology skins share the authored body's envelope, so the procedural fallback
  // stays drawn for the whole admission window instead of blanking the rock until commit swaps it.
  assert.equal(boundary.children[0].visible, true);

  for (const data of [
    { placeId: 'place_asteroid_rock_a', placeTargetRadius: 15 },
    { authoredGeologySkin: true, placeId: 'place_asteroid_rock_a', placeTargetRadius: 14 },
  ]) {
    const generic = { ...explicit, data };
    assert.equal(resolvePlaceFileForEntity(generic), null);
    assert.equal(buildAuthoredPlaceProp(generic, { releaseMode: true }), null);
  }
});

test('authored geology never leaks its hidden procedural body into the asteroid instance pool', () => {
  const entity = {
    id: 28,
    type: 'asteroid',
    alive: true,
    radius: 14,
    collides: true,
    data: {
      typeId: 'ast_common_rock',
      authoredGeologySkin: true,
      placeId: 'place_asteroid_seamed',
      placeTargetRadius: 14,
    },
  };
  const semanticFallback = fallback('ProceduralCommonRock');
  const leaf = semanticFallback.children[0];
  leaf.userData.asteroidInstanceTypeId = 'ast_common_rock';
  leaf.userData.asteroidInstanceVariant = 0;
  semanticFallback.userData.asteroidInstanceBody = leaf;
  const boundary = buildAuthoredPlaceProp(entity, { releaseMode: true, fallbackRoot: semanticFallback });
  const scene = new THREE.Scene();
  const pool = createAsteroidInstancePool(scene);

  assert.equal(semanticFallback.userData.asteroidInstanceBody, leaf,
    'the hidden body remains available as a local terminal fallback');
  assert.equal(boundary.userData.asteroidInstanceBody, undefined,
    'the stable authored boundary must not advertise a poolable procedural leaf');
  assert.equal(registerAsteroidBaseLeaf(pool, entity, boundary), false);
  assert.equal(asteroidInstanceMembership(pool, entity.id).registered, false);
  assert.equal(leaf.visible, true, 'pool rejection must not mutate the hidden fallback leaf itself');
});

test('authored geology keeps the measured census scale of its adopted collision skin', async () => {
  const entity = {
    id: 23,
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
  const boundary = buildAuthoredPlaceProp(entity, { releaseMode: true });
  const fallbackRoot = boundary.children[0];
  const scene = new THREE.Scene();
  scene.add(boundary);
  const measured = modelTruthRow('place_asteroid_rock_a');
  assert.equal(measured.collider.kind, 'proxy');
  assert.equal(measured.proposedSkin.adopted, true);
  // Adopted geology draws with its measured collision skin. The entity radius remains the
  // gameplay footprint; stretching this GLB to 2*radius would detach it from its proxy.
  const record = {
    url: 'assets/ships/release/parts/places/place_asteroid_rock_a.glb',
    assetId: 'place_asteroid_rock_a',
    slot: 'place',
    bounds: measured.bounds,
    primitives: [{
      key: 'rock:0',
      name: 'Rock',
      geometry: new THREE.BoxGeometry(...measured.bounds.size),
      material: new THREE.MeshStandardMaterial(),
      matrix: new THREE.Matrix4(),
      tags: {},
    }],
    markers: [],
  };

  const swapped = await upgradeAuthoredPlaceBoundaryForProbe(
    boundary,
    fallbackRoot,
    entity,
    'places/place_asteroid_rock_a.glb',
    {},
    scene,
    { releaseMode: true, loadAuthoredPart: async () => record },
  );
  const authoredRoot = boundary.children.find((child) => child.name === 'GLTFKit_place_asteroid_rock_a');

  assert.equal(swapped, true);
  assert.ok(authoredRoot);
  assert.equal(entity.type, 'asteroid', 'presentation swap cannot rewrite simulation type');
  assert.equal(entity.collides, true, 'presentation swap cannot rewrite collision truth');
  assert.equal(authoredRoot.userData.placeTargetRadius, entity.radius);
  const measuredScale = measured.drawScale * (entity.radius / measured.gameplay.entityRadius);
  assert.equal(authoredRoot.userData.authoredWorldScale, measuredScale,
    'the adopted skin follows its census scale ahead of the broadphase radius target');
  assert.deepEqual(authoredRoot.userData.visualBounds.size,
    measured.bounds.size.map((size) => size * measuredScale));
});

test('visual overrides route only explicit geology asteroids through the authored place builder', () => {
  let authoredBuilds = 0;
  let fallbackBuilds = 0;
  const factory = {
    build() {
      fallbackBuilds++;
      return fallback('ProceduralAsteroid');
    },
  };
  installVisualOverrides(factory, {
    releaseMode: true,
    authoredPlaceBuilder() {
      authoredBuilds++;
      return fallback('AuthoredGeologyBoundary');
    },
  });

  const explicit = factory.build({
    id: 21, type: 'asteroid', alive: true, radius: 11,
    data: {
      typeId: 'ast_metallic',
      authoredGeologySkin: true,
      placeId: 'place_asteroid_rock_b',
      placeTargetRadius: 11,
    },
  });
  const generic = factory.build({
    id: 22, type: 'asteroid', alive: true, radius: 11,
    data: { typeId: 'ast_metallic', placeId: 'place_asteroid_rock_b', placeTargetRadius: 11 },
  });

  assert.equal(explicit.name, 'AuthoredGeologyBoundary');
  assert.equal(generic.name, 'ProceduralAsteroid');
  assert.equal(authoredBuilds, 1);
  assert.equal(fallbackBuilds, 2,
    'explicit geology eagerly constructs its matching procedural body but keeps it hidden unless admission fails');
});

test('authored geology settles on its same-semantic procedural body when loading is unavailable', async () => {
  const entity = {
    id: 24,
    type: 'asteroid',
    alive: true,
    radius: 15,
    collides: true,
    data: {
      typeId: 'ast_metallic',
      authoredGeologySkin: true,
      placeId: 'place_asteroid_rock_a',
      placeTargetRadius: 15,
    },
  };
  const semanticFallback = fallback('ProceduralMetallicAsteroid');
  semanticFallback.userData.kind = 'asteroid';
  const boundary = buildAuthoredPlaceProp(entity, { releaseMode: true, fallbackRoot: semanticFallback });
  const scene = new THREE.Scene();
  scene.add(boundary);

  const swapped = await upgradeAuthoredPlaceBoundaryForProbe(
    boundary,
    semanticFallback,
    entity,
    'places/place_asteroid_rock_a.glb',
    {},
    scene,
    { releaseMode: true, loadAuthoredPart: async () => null },
  );

  assert.equal(swapped, false);
  assert.equal(boundary.children.includes(semanticFallback), true);
  assert.equal(semanticFallback.visible, true);
  assert.equal(boundary.userData.hull, semanticFallback);
  assert.equal(boundary.userData.authoredAssetState, 'same-semantic-fallback');
  assert.equal(boundary.userData.authoredVisualRoot, 'procedural-geology-fallback');
  assert.equal(boundary.userData.authoredReadableFallbackRetained, true);
  assert.equal(boundary.userData.renderContract.gracefulFallback, true);
  assert.equal(entity.presentationAdmission, 'ready', 'the visible matching rock remains targetable');
});

test('authored geology returns to the matching procedural body when pipeline admission fails', async () => {
  const entity = {
    id: 25,
    type: 'asteroid',
    alive: true,
    radius: 12,
    collides: true,
    data: {
      typeId: 'ast_icy',
      authoredGeologySkin: true,
      placeId: 'place_asteroid_rock_b',
      placeTargetRadius: 12,
    },
  };
  const semanticFallback = fallback('ProceduralIceAsteroid');
  semanticFallback.userData.kind = 'asteroid';
  const boundary = buildAuthoredPlaceProp(entity, { releaseMode: true, fallbackRoot: semanticFallback });
  const scene = new THREE.Scene();
  scene.add(boundary);
  const record = {
    url: 'assets/ships/release/parts/places/place_asteroid_rock_b.glb',
    assetId: 'place_asteroid_rock_b',
    slot: 'place',
    bounds: { size: [8, 8, 8], center: [0, 0, 0] },
    primitives: [{
      key: 'ice:0', name: 'Ice', geometry: new THREE.BoxGeometry(8, 8, 8),
      material: new THREE.MeshStandardMaterial(), matrix: new THREE.Matrix4(), tags: {},
    }],
    markers: [],
  };

  const swapped = await upgradeAuthoredPlaceBoundaryForProbe(
    boundary,
    semanticFallback,
    entity,
    'places/place_asteroid_rock_b.glb',
    {},
    scene,
    {
      releaseMode: true,
      loadAuthoredPart: async () => record,
      prepareAuthoredPipelines: async () => { throw new Error('synthetic pipeline failure'); },
    },
  );

  assert.equal(swapped, false);
  assert.equal(semanticFallback.visible, true);
  assert.equal(boundary.userData.hull, semanticFallback);
  assert.equal(boundary.userData.authoredAssetState, 'same-semantic-fallback');
  assert.equal(entity.presentationAdmission, 'ready');
  assert.equal(boundary.children.some((child) => child.name === 'GLTFKit_place_asteroid_rock_b'), false);
});

test('authored place LODs remain under the stable boundary and switch by authored level', async () => {
  const entity = {
    id: 26,
    type: 'asteroid',
    alive: true,
    radius: 10,
    collides: true,
    data: {
      typeId: 'ast_crystalline',
      authoredGeologySkin: true,
      placeId: 'place_asteroid_rock_c',
      placeTargetRadius: 10,
    },
  };
  const boundary = buildAuthoredPlaceProp(entity, { releaseMode: true });
  const fallbackRoot = boundary.children[0];
  const scene = new THREE.Scene();
  scene.add(boundary);
  const material = new THREE.MeshStandardMaterial();
  const record = {
    url: 'assets/ships/release/parts/places/place_asteroid_rock_c.glb',
    assetId: 'place_asteroid_rock_c',
    slot: 'place',
    bounds: { size: [10, 10, 10], center: [0, 0, 0] },
    primitives: ['lod0', 'lod1', 'lod2'].map((lod, index) => ({
      key: `${lod}:0`,
      name: `${lod}_Rock`,
      geometry: new THREE.BoxGeometry(10 - index * 2, 10 - index * 2, 10 - index * 2),
      material,
      matrix: new THREE.Matrix4(),
      tags: { lod },
    })),
    markers: [],
  };

  const swapped = await upgradeAuthoredPlaceBoundaryForProbe(
    boundary,
    fallbackRoot,
    entity,
    'places/place_asteroid_rock_c.glb',
    {},
    scene,
    { releaseMode: true, loadAuthoredPart: async () => record },
  );
  const authoredRoot = boundary.userData.hull;
  const visibility = () => Object.fromEntries(['lod0', 'lod1', 'lod2'].map((lod) => {
    let visible = false;
    authoredRoot.traverse((object) => {
      if (object.userData?.spacefaceTags?.lod === lod && object.visible) visible = true;
    });
    return [lod, visible];
  }));

  assert.equal(swapped, true);
  assert.ok(boundary.userData.lod, 'the stable outer boundary owns screen-size LOD state');
  assert.equal(typeof boundary.userData.updateLod, 'function');
  assert.equal(typeof authoredRoot.userData.updateLod, 'function');
  assert.equal(authoredRoot.userData.opaqueDepthPrepass, undefined,
    'ordinary authored places do not pay the Cathedral-specific depth pass');
  assert.deepEqual(visibility(), { lod0: true, lod1: false, lod2: false });
  boundary.userData.updateLod('lod2');
  assert.equal(boundary.userData.hull, authoredRoot, 'LOD changes never replace the entity root');
  assert.deepEqual(visibility(), { lod0: false, lod1: false, lod2: true });
  boundary.userData.updateLod('lod1');
  assert.deepEqual(visibility(), { lod0: false, lod1: true, lod2: false });
});

test('authored station LOD requests reach the admitted root after the async swap', async () => {
  const entity = {
    id: 27,
    type: 'station',
    alive: true,
    radius: 34,
    pos: { x: 0, z: 0 },
    data: {
      stationId: 'station_helios',
      archetypeGlb: 'place_station_trade_hub',
      placeId: 'place_station_trade_hub',
      dockRadius: 72,
      placeScale: 72 / 14,
    },
  };
  const boundary = buildAuthoredStationArchetype(entity, { releaseMode: true });
  const fallbackRoot = boundary.children[0];
  const scene = new THREE.Scene();
  scene.add(boundary);
  const material = new THREE.MeshStandardMaterial();
  const record = {
    url: 'assets/ships/release/parts/places/place_station_trade_hub.glb',
    assetId: 'place_station_trade_hub',
    slot: 'place',
    bounds: { size: [28, 18, 28], center: [0, 0, 0] },
    primitives: ['lod0', 'lod1', 'lod2'].map((lod, index) => ({
      key: `${lod}:0`,
      name: `${lod}_TradeHub`,
      geometry: new THREE.BoxGeometry(28 - index * 4, 18 - index * 2, 28 - index * 4),
      material,
      matrix: new THREE.Matrix4(),
      tags: { lod },
    })),
    markers: [],
  };

  const swapped = await upgradeAuthoredPlaceBoundaryForProbe(
    boundary,
    fallbackRoot,
    entity,
    'places/place_station_trade_hub.glb',
    {},
    scene,
    { releaseMode: true, loadAuthoredPart: async () => record },
  );
  const authoredRoot = boundary.userData.hull;
  const visibility = () => Object.fromEntries(['lod0', 'lod1', 'lod2'].map((lod) => {
    let visible = false;
    authoredRoot.traverse((object) => {
      if (object.userData?.spacefaceTags?.lod === lod && object.visible) visible = true;
    });
    return [lod, visible];
  }));

  assert.equal(swapped, true);
  assert.equal(boundary.userData.hlod?.proxyDisabledReason, 'stable-authored-identity');
  assert.equal(boundary.userData.hull, authoredRoot, 'LOD forwarding preserves the admitted station root');
  assert.deepEqual(visibility(), { lod0: true, lod1: false, lod2: false });
  boundary.userData.updateLod('lod2');
  assert.equal(boundary.userData.hull, authoredRoot, 'LOD changes never replace the station identity');
  assert.deepEqual(visibility(), { lod0: false, lod1: false, lod2: true });
  boundary.userData.updateLod('lod1');
  assert.deepEqual(visibility(), { lod0: false, lod1: true, lod2: false });
});

test('station publication invokes its swap callback only after the authored root replaces fallback', async () => {
  const entity = {
    id: 271,
    type: 'station',
    alive: true,
    radius: 34,
    pos: { x: 0, z: 0 },
    data: {
      stationId: 'station_helios',
      archetypeGlb: 'place_station_trade_hub',
      placeId: 'place_station_trade_hub',
      dockRadius: 72,
      placeScale: 72 / 14,
    },
  };
  const record = {
    url: 'assets/ships/release/parts/places/place_station_trade_hub.glb',
    assetId: 'place_station_trade_hub',
    slot: 'place',
    bounds: { size: [28, 18, 28], center: [0, 0, 0] },
    primitives: [{
      key: 'lod0:callback',
      name: 'LOD0_TradeHubCallback',
      geometry: new THREE.BoxGeometry(28, 18, 28),
      material: new THREE.MeshStandardMaterial(),
      matrix: new THREE.Matrix4(),
      tags: { lod: 'lod0' },
    }],
    markers: [],
  };
  const swaps = [];
  const boundary = buildAuthoredStationArchetype(entity, {
    releaseMode: true,
    loadAuthoredPart: async () => record,
    onSwap: (payload) => swaps.push({
      ...payload,
      state: boundary.userData.authoredAssetState,
      admission: entity.presentationAdmission,
      fallbackAttached: boundary.children.includes(fallbackRoot),
    }),
  });
  const fallbackRoot = boundary.children[0];
  const scene = new THREE.Scene();
  scene.add(boundary);

  const completion = boundary.userData.requestAuthoredUpgrade({}, scene);
  assert.ok(completion && typeof completion.then === 'function');
  assert.equal(swaps.length, 0, 'a station callback cannot run while its fallback is still active');
  assert.equal(boundary.userData.authoredAssetState, 'loading');
  assert.equal(boundary.children.includes(fallbackRoot), true);

  const receipt = await completion;
  const authoredRoot = boundary.userData.hull;
  assert.equal(receipt.error, null);
  assert.equal(receipt.result, true);
  assert.equal(swaps.length, 1, 'the admitted station root notifies its consumer once');
  assert.equal(swaps[0].boundary, boundary);
  assert.equal(swaps[0].root, authoredRoot);
  assert.equal(swaps[0].authoredRoot, authoredRoot);
  assert.equal(swaps[0].entity, entity);
  assert.deepEqual(swaps[0].authoredParts, [record.url]);
  assert.equal(swaps[0].state, 'authored');
  assert.equal(swaps[0].admission, 'pending',
    'the callback marks the exact authored publication before the station reports ready');
  assert.equal(swaps[0].fallbackAttached, false, 'the callback never observes the station fallback as active');
  assert.equal(entity.presentationAdmission, 'ready');
});

test('the claim relay keeps exact closed surfaces while sampling its packed ORM once', async () => {
  const entity = {
    id: 28,
    type: 'fx',
    alive: true,
    radius: 6,
    data: {
      placeId: 'place_claim_outpost_relay',
      placeScale: 0.16,
      worldDressing: true,
    },
  };
  const boundary = buildAuthoredPlaceProp(entity, { releaseMode: true });
  const fallbackRoot = boundary.children[0];
  const scene = new THREE.Scene();
  scene.add(boundary);
  const packedOrm = new THREE.Texture();
  packedOrm.channel = 0;
  const sourceMaterial = new THREE.MeshStandardMaterial({
    side: THREE.DoubleSide,
    aoMap: packedOrm,
    roughnessMap: packedOrm,
    metalnessMap: packedOrm,
  });
  sourceMaterial.name = 'Material_Hull';
  sourceMaterial.userData.spacefaceMaterialRole = 'hull';
  const record = {
    url: 'assets/ships/release/parts/places/place_claim_outpost_relay.glb',
    assetId: 'place_claim_outpost_relay',
    slot: 'place',
    bounds: { size: [104, 55, 96], center: [0, 0, 0] },
    primitives: ['lod0', 'lod1', 'lod2'].map((lod, index) => ({
      key: `${lod}:0`,
      name: `${lod}_RelayHull`,
      geometry: new THREE.BoxGeometry(104 - index * 12, 55 - index * 6, 96 - index * 10),
      material: sourceMaterial,
      matrix: new THREE.Matrix4(),
      tags: { lod },
    })),
    markers: [],
  };

  const swapped = await upgradeAuthoredPlaceBoundaryForProbe(
    boundary,
    fallbackRoot,
    entity,
    'places/place_claim_outpost_relay.glb',
    {},
    scene,
    { releaseMode: true, loadAuthoredPart: async () => record },
  );
  const authoredRoot = boundary.userData.hull;
  const relayMaterials = new Set();
  const relayBatches = [];
  authoredRoot.traverse((object) => {
    if (!object.userData?.spacefaceStaticBatch) return;
    relayBatches.push(object);
    for (const material of [].concat(object.material || [])) relayMaterials.add(material);
  });

  assert.equal(swapped, true);
  assert.deepEqual(authoredRoot.userData.claimRelayMaterialPolicy, {
    assetId: 'place_claim_outpost_relay',
    surfaceContract: 'closed-authored-primitives-front-sided',
    packedOrmContract: 'one-shared-fetch-for-ao-roughness-metalness',
    materialCount: 1,
    packedOrmMaterialCount: 1,
    roles: ['hull'],
  });
  assert.equal(relayMaterials.size, 1, 'one specialized variant is shared by all three authored LODs');
  const [material] = relayMaterials;
  assert.notEqual(material, sourceMaterial);
  assert.equal(material.side, THREE.FrontSide,
    'the relay builder uses only closed primitives, so hidden back faces need no rasterization');
  assert.equal(material.userData.spacefaceClaimRelayClosedSurface, true);
  assert.equal(material.userData.spacefacePackedOrmSingleSample, true);
  assert.match(material.customProgramCacheKey(), /spaceface-packed-orm-single-sample-v1/);
  assert.equal(relayBatches.length, 3, 'the three authored LODs retain one static batch each');
  for (const batch of relayBatches) {
    assert.ok(batch.geometry.index, `${batch.userData.spacefaceTags.lod} retains indexed relay topology`);
    assert.equal(batch.geometry.getAttribute('position').count, 24,
      `${batch.userData.spacefaceTags.lod} does not duplicate one vertex per triangle index`);
    assert.equal(batch.geometry.index.count, 36,
      `${batch.userData.spacefaceTags.lod} retains every authored triangle index`);
  }
  const shader = {
    fragmentShader: [
      '#include <roughnessmap_fragment>',
      '#include <metalnessmap_fragment>',
      '#include <aomap_fragment>',
    ].join('\n'),
  };
  material.onBeforeCompile(shader, {});
  assert.equal((shader.fragmentShader.match(/texture2D/g) || []).length, 1);
  assert.match(shader.fragmentShader, /sfPackedOrmTexel\.r/);
  assert.match(shader.fragmentShader, /sfPackedOrmTexel\.g/);
  assert.match(shader.fragmentShader, /sfPackedOrmTexel\.b/);
  assert.equal(sourceMaterial.side, THREE.DoubleSide, 'the resident source material stays immutable');
  assert.equal(sourceMaterial.userData.spacefacePackedOrmSingleSample, undefined);
});

test('the Wreck Cathedral uses one depth-only opaque prepass per authored LOD', async () => {
  const entity = {
    id: 29,
    type: 'fx',
    alive: true,
    radius: 120,
    data: {
      placeId: 'place_landmark_wreck_cathedral',
      placeTargetRadius: 120,
    },
  };
  const boundary = buildAuthoredPlaceProp(entity, { releaseMode: true });
  const fallbackRoot = boundary.children[0];
  const scene = new THREE.Scene();
  scene.add(boundary);
  const materialRoles = [
    'hull',
    'heat_affected_alloy',
    'maintenance_mark',
    'mechanical',
    'exposed_alloy',
    'copper_coil',
    'signal',
    'warning',
  ];
  const authoredMaterials = new Map(materialRoles.map((role, index) => {
    const packedOrm = new THREE.Texture();
    packedOrm.name = `Texture_${role}_PackedOrm`;
    packedOrm.channel = 0;
    const material = new THREE.MeshStandardMaterial({
      color: 0x182430 + index * 0x10101,
      side: THREE.DoubleSide,
      aoMap: packedOrm,
      roughnessMap: packedOrm,
      metalnessMap: packedOrm,
    });
    material.name = `Material_${role}`;
    material.userData.spacefaceMaterialRole = role;
    return [role, material];
  }));
  const record = {
    url: 'assets/ships/release/parts/places/place_landmark_wreck_cathedral.glb',
    assetId: 'place_landmark_wreck_cathedral',
    slot: 'place',
    bounds: { size: [240, 80, 120], center: [0, 0, 0] },
    primitives: ['lod0', 'lod1', 'lod2'].flatMap((lod, index) => materialRoles.map((role, roleIndex) => {
      const box = new THREE.BoxGeometry(
        26 - index * 4,
        18 - index * 2,
        14 - index * 2,
      );
      let geometry = box;
      if (role === 'exposed_alloy') {
        const openSheet = new THREE.PlaneGeometry(8, 6);
        openSheet.translate(0, 22, 0);
        geometry = mergeGeometries([box, openSheet], false);
      }
      return {
        key: `${lod}:${roleIndex}`,
        name: `${lod}_Cathedral_${role}`,
        geometry,
        material: authoredMaterials.get(role),
        matrix: new THREE.Matrix4().makeTranslation(roleIndex * 28 - 98, 0, 0),
        tags: { lod },
      };
    })),
    markers: [],
  };

  const swapped = await upgradeAuthoredPlaceBoundaryForProbe(
    boundary,
    fallbackRoot,
    entity,
    'places/place_landmark_wreck_cathedral.glb',
    {},
    scene,
    { releaseMode: true, loadAuthoredPart: async () => record },
  );
  const authoredRoot = boundary.userData.hull;
  const sources = [];
  const prepasses = [];
  authoredRoot.traverse((object) => {
    if (object.userData?.spacefaceDepthPrepass) prepasses.push(object);
    else if (object.userData?.spacefaceStaticBatch) sources.push(object);
  });

  assert.equal(swapped, true);
  assert.equal(sources.length, 3);
  assert.equal(prepasses.length, 3, 'each LOD pays one closed-surface depth draw');
  for (const lod of ['lod0', 'lod1', 'lod2']) {
    const source = sources.find((candidate) => candidate.userData.spacefaceTags.lod === lod);
    const sourceMaterials = Array.isArray(source.material) ? source.material : [source.material];
    const closedPrepass = prepasses.find((candidate) => candidate.userData.spacefaceTags.lod === lod
      && candidate.userData.spacefaceDepthRole === 'closed-front');
    assert.ok(source.geometry.index, `${lod} retains the authored indexed topology`);
    assert.equal(source.geometry.getAttribute('position').count, materialRoles.length * 24 + 4,
      `${lod} does not expand every box index into a duplicate vertex`);
    assert.equal(source.geometry.index.count, materialRoles.length * 36 + 6,
      `${lod} retains every nonzero-area authored triangle index`);
    assert.notEqual(closedPrepass.geometry, source.geometry);
    assert.equal(closedPrepass.geometry.getAttribute('position'), source.geometry.getAttribute('position'),
      `${lod} closed depth shares the exact authored vertex buffer`);
    assert.deepEqual(Object.keys(closedPrepass.geometry.attributes), ['position'],
      `${lod} depth binds only the position buffer used by its minimal shader`);
    assert.equal(closedPrepass.geometry.index.count, materialRoles.length * 36,
      `${lod} closed depth includes the closed exposed-alloy box without adding a color draw`);
    assert.equal(closedPrepass.material.isShaderMaterial, true);
    assert.equal(closedPrepass.material.userData.spacefaceMinimalPositionDepthShader, true);
    assert.match(closedPrepass.material.vertexShader, /projectionMatrix \* modelViewMatrix/);
    assert.equal(closedPrepass.material.colorWrite, false);
    assert.equal(closedPrepass.material.depthTest, true);
    assert.equal(closedPrepass.material.depthWrite, true);
    assert.ok(closedPrepass.renderOrder < source.renderOrder);
    assert.equal(closedPrepass.castShadow, false);
    assert.equal(closedPrepass.receiveShadow, false);
    assert.equal(closedPrepass.material.side, THREE.FrontSide);
    const sourceByRole = new Map(sourceMaterials.map((material) => [
      material.userData.spacefaceMaterialRole,
      material,
    ]));
    assert.deepEqual([...sourceByRole.keys()].sort(), [...materialRoles].sort());
    for (const role of materialRoles) {
      const material = sourceByRole.get(role);
      assert.equal(material.userData.spacefacePackedOrmSingleSample, true,
        `${lod} ${role} compiles its shared packed ORM as one texture sample`);
      assert.equal(material.userData.spacefacePackedOrmTextureSamples, 1);
      assert.match(material.customProgramCacheKey(), /spaceface-packed-orm-single-sample-v1/);
      const shader = {
        fragmentShader: [
          '#include <roughnessmap_fragment>',
          '#include <metalnessmap_fragment>',
          '#include <aomap_fragment>',
        ].join('\n'),
      };
      material.onBeforeCompile(shader, {});
      assert.equal((shader.fragmentShader.match(/texture2D/g) || []).length, 1,
        `${lod} ${role} reuses one fetched ORM texel for AO, roughness, and metalness`);
      assert.match(shader.fragmentShader, /sfPackedOrmTexel\.r/);
      assert.match(shader.fragmentShader, /sfPackedOrmTexel\.g/);
      assert.match(shader.fragmentShader, /sfPackedOrmTexel\.b/);
      if (role === 'exposed_alloy') {
        assert.equal(material.side, THREE.DoubleSide, `${lod} retains open engine-bell interiors`);
        assert.equal(material.depthFunc, THREE.LessEqualDepth,
          `${lod} open shells use the ordinary opaque color/depth path`);
        assert.equal(material.depthWrite, true);
        assert.equal(material.userData.spacefaceCathedralEqualDepth, false);
        assert.equal(material.userData.spacefaceCathedralOrdinaryOpenDepth, true);
      } else {
        assert.equal(material.side, THREE.FrontSide, `${lod} culls the closed ${role} family`);
        assert.equal(material.depthFunc, THREE.EqualDepth, `${lod} reuses prepass depth for ${role}`);
        assert.equal(material.depthWrite, false, `${lod} does not rewrite prepass depth for ${role}`);
        assert.equal(material.userData.spacefaceCathedralClosedSurfaceCulled, true);
      }
    }
  }
  assert.deepEqual(authoredRoot.userData.opaqueDepthPrepass, {
    assetId: 'place_landmark_wreck_cathedral',
    drawables: 3,
    geometry: 'shared-authored-position-closed-indices',
    material: 'position-only-front-sided',
  });
  assert.equal(authoredRoot.userData.cathedralDepthTopology.geometry,
    'indexed-zero-area-pruned-closed-depth-open-color');
  for (const lod of ['lod0', 'lod1', 'lod2']) {
    assert.deepEqual(authoredRoot.userData.cathedralDepthTopology.byLod[lod], {
      sourceTriangles: 98,
      retainedTriangles: 98,
      removedDegenerateTriangles: 0,
      closedDepthTriangles: 96,
      ordinaryOpenColorTriangles: 2,
      closedExposedTriangles: 12,
      openExposedTriangles: 2,
      colorMaterialGroups: 8,
    });
  }
  assert.deepEqual(authoredRoot.userData.cathedralSurfaceCulling, {
    frontSideRoles: [
      'copper_coil',
      'heat_affected_alloy',
      'hull',
      'maintenance_mark',
      'mechanical',
      'signal',
      'warning',
    ],
    retainedDoubleSideRoles: ['exposed_alloy'],
    depthContract: 'closed-prepass-equal-open-color-depth',
  });
  for (const material of authoredMaterials.values()) {
    assert.equal(material.side, THREE.DoubleSide, `${material.name} source material stays immutable`);
    assert.equal(material.depthWrite, true);
    assert.equal(material.userData.spacefacePackedOrmSingleSample, undefined,
      `${material.name} source shader stays immutable`);
  }

  const visibility = () => Object.fromEntries(['lod0', 'lod1', 'lod2'].map((lod) => [
    lod,
    prepasses.filter((object) => object.userData.spacefaceTags.lod === lod && object.visible).length,
  ]));
  assert.deepEqual(visibility(), { lod0: 1, lod1: 0, lod2: 0 });
  boundary.userData.updateLod('lod2');
  assert.deepEqual(visibility(), { lod0: 0, lod1: 0, lod2: 1 });
});

test('a synchronous authored geology builder error keeps the procedural geology identity', () => {
  const entity = {
    id: 27, type: 'asteroid', alive: true, radius: 11, collides: true,
    data: {
      typeId: 'ast_metallic', authoredGeologySkin: true,
      placeId: 'place_asteroid_rock_a', placeTargetRadius: 11,
    },
  };
  const factory = { build() { return fallback('ProceduralMetallicAsteroid'); } };
  installVisualOverrides(factory, {
    releaseMode: true,
    authoredPlaceBuilder() { throw new Error('synthetic synchronous geology failure'); },
    onWarning() {},
  });

  const visual = factory.build(entity);
  assert.equal(visual.name, 'ProceduralMetallicAsteroid');
  assert.equal(visual.visible, true);
  assert.equal(visual.userData.authoredAssetState, 'same-semantic-fallback');
  assert.equal(visual.userData.renderContract.gracefulFallback, true);
  assert.equal(entity.presentationAdmission, 'ready');
});

test('an authored visual builder failure never publishes a different procedural identity', () => {
  let fallbackBuilds = 0;
  const factory = {
    build() {
      fallbackBuilds++;
      return fallback('WrongProceduralIdentity');
    },
  };
  installVisualOverrides(factory, {
    releaseMode: false,
    authoredPlaceBuilder() { throw new Error('synthetic authored place failure'); },
    onWarning() {},
  });

  const visual = factory.build({
    id: 3,
    type: 'fx',
    alive: true,
    data: { placeId: 'place_nav_buoy' },
  });

  assert.equal(fallbackBuilds, 0);
  assert.equal(visual.visible, false);
  assert.equal(visual.children.length, 0);
  assert.equal(visual.userData.authoredAssetState, 'unavailable');
  assert.equal(visual.userData.authoredVisualRoot, 'none-build-failed');
});

test('boot preload contains only the opening-shot identities', () => {
  const plan = authoredBootstrapPreloadPlan();
  const hulls = new Set(plan.hull || []);

  assert.deepEqual([...hulls], ['wholeships/kestrel.glb']);
  for (const file of [
    'wholeships/wasp_production_v1.glb',
    'wholeships/ashline_dart.glb',
    'wholeships/ashline_lode.glb',
    'wholeships/ashline_rig.glb',
    'wholeships/helios_lark.glb',
    'wholeships/helios_cradle.glb',
    'wholeships/helios_span.glb',
  ]) assert.equal(hulls.has(file), false, `deferred production body must not tax boot residency: ${file}`);

  assert.equal(plan.place, undefined,
    'boot residency stays limited to the player; the live Helios entity owns its exact place plan');

  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 } };
  const helios = {
    id: 'station_helios', alive: true, type: 'station', pos: { x: 9000, z: 0 },
    data: {
      stationId: 'station_helios', sectorId: 'sector_helios_prime',
      archetypeGlb: 'place_station_trade_hub',
    },
  };
  const state = { playerId: 1, entities: new Map([[1, player]]) };
  assert.equal(isInitialAuthoredCompositionEntity(helios, state), false,
    'a far critical hub remains a streamable place record rather than a boot decode');

  assert.equal([...hulls].some((file) => /_lod[12]\.glb$/.test(file)), false);
});

test('the default Helios relay settles inside the loading-time authored runway', () => {
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 } };
  const relay = {
    id: 'world_site_helios_relay',
    alive: true,
    type: 'fx',
    pos: { x: 120, z: 40 },
    data: {
      placeId: 'place_claim_outpost_relay',
      sectorId: 'sector_helios_prime',
    },
  };
  const leftoverHorizon = {
    ...relay,
    id: 'world_site_leftover_2400',
    pos: { x: 2400, z: 0 },
  };
  const outsideImmediateRunway = {
    ...relay,
    id: 'world_site_outside_opening_runway',
    pos: { x: 1001, z: 0 },
  };
  const state = {
    mode: 'loading',
    playerId: player.id,
    entities: new Map([[player.id, player], [relay.id, relay]]),
    world: { currentSectorId: 'sector_helios_prime' },
    camera: { zoom: 144 },
  };

  assert.equal(isInitialAuthoredCompositionEntity(relay, state), true,
    'an on-table opening relay must decode, compose, upload, and link before flight is exposed');
  assert.equal(isInitialAuthoredCompositionEntity(outsideImmediateRunway, state), false,
    'loading must not widen beyond the table opening runway');
  assert.equal(isInitialAuthoredCompositionEntity(leftoverHorizon, state), false,
    'loading must not keep the leftover 2400 WU ship horizon');

  const interceptor = {
    id: 7,
    alive: true,
    type: 'ship',
    pos: { x: 1760, z: 260 },
    data: { ai: { liveColdStartSafe: true } },
  };
  const stray = {
    id: 8,
    alive: true,
    type: 'ship',
    pos: { x: 1760, z: 260 },
    data: { ai: {} },
  };
  assert.equal(isInitialAuthoredCompositionEntity(interceptor, state), true,
    '47-A cold-start holding ships still compose at Helios load');
  assert.equal(isInitialAuthoredCompositionEntity(stray, state), false,
    'an ordinary ship at that hold is not an opening actor');
  const later = {
    ...state,
    mode: 'loading',
    world: { currentSectorId: 'sector_ceres_belt' },
  };
  assert.equal(isInitialAuthoredCompositionEntity(interceptor, later), false,
    'a later Continue does not keep composing far story ships');

  const spindle = {
    id: 9,
    alive: true,
    type: 'payload',
    pos: { x: 92, z: 0 },
    data: {
      scenarioActorId: 'evidence_spindle_47a',
      assetRef: 'asset.slice.47a_spindle',
    },
  };
  const nearbyWreck = {
    id: 10,
    alive: true,
    type: 'wreck',
    pos: { x: 300, z: 160 },
    data: { assetRef: 'asset.slice.bourse_carrier_wreck' },
  };
  const farWreck = {
    id: 13,
    alive: true,
    type: 'wreck',
    pos: { x: 7000, z: 0 },
    data: { assetRef: 'asset.slice.bourse_carrier_wreck' },
  };
  const nearbyDrone = {
    id: 17,
    alive: true,
    type: 'drone',
    pos: { x: -260, z: 40 },
    data: {},
  };
  assert.equal(isInitialAuthoredCompositionEntity(spindle, state), false,
    'the 47-A spindle stays out of the authored opening set');
  assert.equal(isFirstFlightCookEntity(spindle, state), true,
    'the on-table spindle must still cook before first flight bloom');
  const runwayWreck = {
    id: 18,
    alive: true,
    type: 'wreck',
    pos: { x: 800, z: 0 },
    data: {},
  };
  const runwayDrone = {
    id: 19,
    alive: true,
    type: 'drone',
    pos: { x: 0, z: -800 },
    data: {},
  };
  assert.equal(isInitialAuthoredCompositionEntity(nearbyWreck, state), true,
    'a wreck on the opening table owns a packaged body and must cook behind loading');
  assert.equal(isFirstFlightCookEntity(nearbyWreck, state), true,
    'the near carrier wreck is now a first-flight cook subject');
  assert.equal(isInitialAuthoredCompositionEntity(nearbyDrone, state), true,
    'a drone on the opening table joins the same startup set');
  assert.equal(isFirstFlightCookEntity(nearbyDrone, state), true);
  assert.equal(isInitialAuthoredCompositionEntity(runwayWreck, state), true,
    'a contact wreck closing inside the authored decode runway cooks before first flight');
  assert.equal(isFirstFlightCookEntity(runwayWreck, state), true,
    'the approaching runway wreck joins the first-flight cook set');
  assert.equal(isInitialAuthoredCompositionEntity(runwayDrone, state), true,
    'a contact drone on the approach runway joins the same startup set');
  assert.equal(isFirstFlightCookEntity(runwayDrone, state), true);
  assert.equal(isInitialAuthoredCompositionEntity(farWreck, state), false,
    'a far metadata wreck remains deferred');
  assert.equal(isFirstFlightCookEntity(farWreck, state), false,
    'a far wreck is not a first-flight cook subject');

  const nearRock = {
    id: 11, alive: true, type: 'asteroid', pos: { x: 40, z: 0 }, data: {},
  };
  const sameVariantRock = {
    id: 14, alive: true, type: 'asteroid', pos: { x: 50, z: 0 }, data: {},
  };
  const otherVariantRock = {
    id: 15, alive: true, type: 'asteroid', pos: { x: 80, z: 0 }, data: {},
  };
  const farRock = {
    id: 16, alive: true, type: 'asteroid', pos: { x: 2400, z: 0 }, data: {},
  };
  const rockState = {
    ...state,
    entityList: [player, spindle, nearbyWreck, nearRock, sameVariantRock, otherVariantRock, farRock],
    entities: new Map([
      [player.id, player],
      [spindle.id, spindle],
      [nearbyWreck.id, nearbyWreck],
      [nearRock.id, nearRock],
      [sameVariantRock.id, sameVariantRock],
      [otherVariantRock.id, otherVariantRock],
      [farRock.id, farRock],
    ]),
  };
  const cookedIds = collectFirstFlightCookEntities(rockState).map((entity) => entity.id);
  assert.equal(cookedIds.includes(spindle.id), true);
  assert.equal(cookedIds.includes(nearRock.id), true);
  assert.equal(cookedIds.includes(sameVariantRock.id), false,
    'a second rock of the same type and displacement variant is not a separate cook subject');
  assert.equal(cookedIds.includes(otherVariantRock.id), true,
    'the nearest unused displacement variant still cooks');
  assert.equal(cookedIds.includes(farRock.id), false);
  assert.equal(cookedIds.includes(nearbyWreck.id), true,
    'the on-table packaged wreck cooks with the opening composition');
});

test('the critical Helios hub joins the startup set inside the authored decode runway', () => {
  const player = {
    id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, maxSpeed: 174,
  };
  const hubData = {
    stationId: 'station_helios', sectorId: 'sector_helios_prime',
    archetypeGlb: 'place_station_trade_hub',
  };
  const hub = {
    id: 'station_helios', alive: true, type: 'station', pos: { x: 1280, z: -420 },
    radius: 42, data: hubData,
  };
  const state = {
    mode: 'loading', playerId: 1,
    entities: new Map([[1, player], [hub.id, hub]]),
    entityList: [player, hub],
    world: { currentSectorId: 'sector_helios_prime' },
  };
  assert.equal(isInitialAuthoredCompositionEntity(hub, state), true,
    'the spawn-approach hub cooks behind loading instead of cold-composing in flight');
  assert.equal(isOpeningFlightGateEntity(hub, state), true,
    'the same hub holds the opening flight gate while it approaches the table');

  const beyondRunway = { ...hub, pos: { x: 9000, z: 0 } };
  assert.equal(isInitialAuthoredCompositionEntity(beyondRunway, state), false,
    'a hub beyond the decode runway stays streamed');
  assert.equal(isOpeningFlightGateEntity(beyondRunway, state), false);

  const otherSector = {
    ...hub,
    homeSectorId: 'sector_ceres_belt',
    data: { ...hubData, sectorId: 'sector_ceres_belt' },
  };
  assert.equal(isInitialAuthoredCompositionEntity(otherSector, state), false,
    'a same-id hub in another sector is not the current startup hub');
  assert.equal(isOpeningFlightGateEntity(otherSector, state), false);

  const shellRecord = { id: 'station_helios', alive: true, type: 'station', data: hubData };
  assert.equal(isInitialAuthoredCompositionEntity(shellRecord, state), true,
    'a pose-less hub shell record still belongs to the startup composition');
  assert.equal(isOpeningFlightGateEntity(shellRecord, state), true);
});

test('a live wreck or drone on the opening table holds loading readiness until authored', () => {
  const player = {
    id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    maxSpeed: 174,
    data: {},
    mesh: { userData: { authoredAssetState: 'authored' } },
  };
  const wreck = {
    id: 30, alive: true, type: 'wreck', pos: { x: 230, z: 40 },
    data: {},
    mesh: { userData: { authoredAssetState: 'compiling-pipelines' } },
  };
  const drone = {
    id: 31, alive: true, type: 'drone', pos: { x: -300, z: -60 },
    data: {},
    mesh: { userData: { authoredAssetState: 'awaiting-authored-admission' } },
  };
  const farWreck = {
    id: 32, alive: true, type: 'wreck', pos: { x: 7000, z: 0 },
    data: { assetRef: 'asset.slice.bourse_carrier_wreck' },
    mesh: { userData: { authoredAssetState: 'awaiting-authored-admission' } },
  };
  const runwayWreck = {
    id: 33, alive: true, type: 'wreck', pos: { x: 800, z: 0 },
    data: {},
    mesh: { userData: { authoredAssetState: 'compiling-pipelines' } },
  };
  const runwayDrone = {
    id: 34, alive: true, type: 'drone', pos: { x: 0, z: -800 },
    data: {},
    mesh: { userData: { authoredAssetState: 'awaiting-authored-admission' } },
  };
  const state = {
    mode: 'loading', playerId: 1, simTime: 0,
    entities: new Map([
      [1, player], [30, wreck], [31, drone], [32, farWreck],
      [33, runwayWreck], [34, runwayDrone],
    ]),
    entityList: [player, wreck, drone, farWreck, runwayWreck, runwayDrone],
    world: { currentSectorId: 'sector_helios_prime' },
    camera: { zoom: 144 },
    render: {},
  };

  let readiness = authoredCriticalVisualReadiness(state);
  assert.equal(readiness.ready, false,
    'an on-table wreck or drone still inside its packaged pipeline blocks the shell release');
  const blockedIds = readiness.flightReadyBlockers
    .filter((entry) => entry.role === 'glassActors')
    .map((entry) => entry.metadata && entry.metadata.id)
    .sort();
  assert.deepEqual(blockedIds, [30, 31, 33, 34],
    'the near and approaching-runway wreck/drone bodies require the glass actor role');
  assert.equal(readiness.flightReadyBlockers.some((entry) => (
    entry.metadata && entry.metadata.id === 32
  )), false, 'a far metadata wreck never blocks');

  wreck.mesh.userData.authoredAssetState = 'authored';
  readiness = authoredCriticalVisualReadiness(state);
  assert.equal(readiness.ready, false, 'the drone must still finish its authored body');
  drone.mesh.userData.authoredAssetState = 'authored';
  readiness = authoredCriticalVisualReadiness(state);
  assert.equal(readiness.ready, false,
    'a contact wreck already inside the approach runway still gates the shell');
  runwayWreck.mesh.userData.authoredAssetState = 'authored';
  runwayDrone.mesh.userData.authoredAssetState = 'authored';
  readiness = authoredCriticalVisualReadiness(state);
  assert.equal(readiness.ready, true,
    'once every on-table contact body is authored the gate opens');

  const flight = { ...state, mode: 'flight' };
  wreck.mesh.userData.authoredAssetState = 'compiling-pipelines';
  readiness = authoredCriticalVisualReadiness(flight);
  assert.equal(readiness.ready, true,
    'the loading-only glass role releases once flight begins');
});
