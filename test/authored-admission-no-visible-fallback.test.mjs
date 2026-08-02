import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  authoredBootstrapPreloadPlan,
  buildAuthoredPlaceProp,
  isInitialAuthoredCompositionEntity,
  resolvePlaceFileForEntity,
  upgradeAuthoredPlaceBoundaryForProbe,
  wrapShipWithAuthoredParts,
} from '../src/render/partsLibrary.js';
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
  assert.equal(boundary.userData.authoredAdmissionTemporaryDrawables, 0,
    'direct admission diagnostics must describe the retired substrate without polluting the authored render contract');
  assert.equal(typeof boundary.userData.requestAuthoredUpgrade, 'function');
  let renderables = 0;
  boundary.traverse((object) => {
    if (object.isMesh || object.isLine || object.isPoints) renderables++;
  });
  assert.equal(renderables, 0, 'nothing can draw before the exact authored body is admitted');
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
  assert.equal(boundary.children[0].visible, false);

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

test('authored geology composes its GLB envelope to the simulation asteroid radius', async () => {
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
  const record = {
    url: 'assets/ships/release/parts/places/place_asteroid_rock_a.glb',
    assetId: 'place_asteroid_rock_a',
    slot: 'place',
    bounds: { size: [10, 8, 6], center: [1, 0, -2] },
    primitives: [{
      key: 'rock:0',
      name: 'Rock',
      geometry: new THREE.BoxGeometry(10, 8, 6),
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
  assert.equal(authoredRoot.userData.authoredWorldScale, 3,
    'a radius-15 asteroid uses diameter 30 over the authored 10-unit maximum envelope');
  assert.deepEqual(authoredRoot.userData.visualBounds.size, [30, 24, 18]);
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
  authoredRoot.traverse((object) => {
    if (!object.userData?.spacefaceStaticBatch) return;
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
    id: 'station_helios', alive: true, type: 'station', pos: { x: 600, z: 0 },
    data: {
      stationId: 'station_helios', sectorId: 'sector_helios_prime',
      archetypeGlb: 'place_station_trade_hub',
    },
  };
  const state = { playerId: 1, entities: new Map([[1, player]]) };
  assert.equal(isInitialAuthoredCompositionEntity(helios, state), true,
    'the critical starting hub remains an exact loading-gated authored boundary');

  assert.equal([...hulls].some((file) => /_lod[12]\.glb$/.test(file)), false);
});
