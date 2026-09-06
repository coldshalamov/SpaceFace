import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import {
  OPENING_SUBMISSION_PLAN_SCHEMA,
  FIRST_PLAYABLE_PIPELINE_SET_SCHEMA,
  collectOpeningSubmissionLeaves,
  combineOpeningProducerCensuses,
  contentHashForProducerManifest,
  createOpeningProducerCensus,
  createFirstPlayablePipelineSet,
  createOpeningSubmissionPlan,
  createOpeningSubmissionReceipt,
  openingProgramSubjectKey,
  stampOpeningSubmissionPackage,
  validateOpeningSubmissionReceipt,
} from '../src/render/openingSubmissionPlan.js';
import {
  collectOpeningEntityRootCandidates,
  collectOpeningShadowCasterRootCandidates,
} from '../src/render/renderer.js';
import { ensureOpeningGeneratedScenarioPropPackage } from '../src/render/precompile.js';
import { build47aScenarioProp } from '../src/render/scenarioProps47a.js';

const CONTENT_HASH = 'a'.repeat(64);

function productionMetadata(root, hash = CONTENT_HASH) {
  root.userData.flightRenderPackage = {
    schema: 'spaceface.flightRenderPackage.v1',
    assetId: 'test-opening-package',
    contentHash: hash,
    contentHashVerified: true,
  };
  return root;
}

function planOptions(root, key = 'opening', overrides = {}) {
  const census = createOpeningProducerCensus(root, {
    includeOffscreen: true,
    route: {
      shadow: overrides.shadows === true,
      target: overrides.route === 'bloom' || overrides.route === 'graph'
        ? 'hdr-scene-target' : 'screen',
    },
    textures: overrides.textures || [],
  });
  const combined = combineOpeningProducerCensuses([census]);
  return {
    ...overrides,
    candidates: [{ root, role: 'player' }],
    globalProgramKeys: combined.globalProgramKeys,
    openingProgramKeys: combined.openingProgramKeys,
    requiredContentHashes: combined.requiredContentHashes,
    producerCensus: combined,
    producerResourceIdentitySets: combined.resourceIdentitySets,
    // Keep the argument exercised in the test helper without treating a synthetic key as a
    // driver cache identity; producer census keys are the admission subjects.
    _testKey: key,
  };
}

function mesh(name, material = new THREE.MeshBasicMaterial()) {
  const value = new THREE.Mesh(new THREE.BoxGeometry(), material);
  value.name = name;
  return value;
}

test('opening submission plan freezes production boundary metadata and real leaf references', () => {
  const root = new THREE.Group();
  root.name = 'KestrelRoot';
  root.userData.assetId = 'GLTFKIT_KESTREL';
  productionMetadata(root);
  const leaf = mesh('KestrelHull');
  root.add(leaf);

  const plan = createOpeningSubmissionPlan({
    ...planOptions(root),
    candidates: [{
      root,
      role: 'player',
      startupRole: 'player-flight-package',
      reason: 'player-control-and-first-picture-identity',
    }],
  });

  assert.equal(plan.schema, OPENING_SUBMISSION_PLAN_SCHEMA);
  assert.equal(plan.complete, true);
  assert.equal(plan.roots[0].productionBoundary.packageIdentity, CONTENT_HASH);
  assert.equal(plan.drawLeaves[0].name, 'KestrelHull');
  assert.equal(plan.compileSubjects[0], leaf);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.roots));
  assert.ok(Object.isFrozen(plan.roots[0]));
  assert.equal(Object.isFrozen(leaf), false, 'live scene ownership must never be frozen by metadata admission');
  assert.throws(() => plan.roots.push({}), TypeError);
});

test('producer package hashes and censuses are sourced from real leaves, not counts', () => {
  assert.equal(
    contentHashForProducerManifest('abc'),
    '6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25',
  );
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0x334455 });
  const leaf = mesh('producer-leaf', material);
  root.add(leaf);
  stampOpeningSubmissionPackage(root, {
    producer: 'test-producer',
    recipe: { seed: 7, tier: 'mid' },
  }, { assetId: 'test-producer-root' });
  const census = createOpeningProducerCensus(root, { includeOffscreen: true });
  assert.equal(census.contentHashVerified, true);
  assert.match(census.contentHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(census.geometryBufferIds, [`uuid:${leaf.geometry.uuid}`]);
  assert.equal(census.blockingTextureIds.length, 0);
  assert.equal(census.programKeys.length, 1);
  assert.ok(census.programKeys[0].key.length > 0);
  const combined = combineOpeningProducerCensuses([census]);
  assert.equal(combined.contentHashesVerified, true);
  assert.deepEqual(combined.resourceIdentitySets.geometryBufferIds, [`uuid:${leaf.geometry.uuid}`]);
  assert.equal(combined.globalProgramKeys[0].contentHash, census.contentHash);
  const plan = createOpeningSubmissionPlan({
    candidates: [{ root, role: 'player', includeOffscreen: true }],
    globalProgramKeys: combined.globalProgramKeys,
    openingProgramKeys: combined.openingProgramKeys,
    requiredContentHashes: combined.requiredContentHashes,
    producerCensus: combined,
    producerResourceIdentitySets: combined.resourceIdentitySets,
  });
  assert.equal(plan.complete, true);
  assert.equal(plan.resourceIdentityCensusMatches, true);
});

test('opening submission plan filters hidden and empty pooled leaves', () => {
  const root = new THREE.Group();
  productionMetadata(root);
  const visible = mesh('visible');
  const hidden = mesh('hidden');
  hidden.visible = false;
  const emptyPool = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 4);
  emptyPool.name = 'empty-pool';
  emptyPool.count = 0;
  const emptyPoints = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial(),
  );
  emptyPoints.name = 'empty-points';
  emptyPoints.geometry.setDrawRange(0, 0);
  root.add(visible, hidden, emptyPool, emptyPoints);

  const leaves = collectOpeningSubmissionLeaves(root);
  assert.deepEqual(leaves, [visible]);
  const plan = createOpeningSubmissionPlan({
    ...planOptions(root),
    candidates: [{ root, role: 'firstFrameBackground' }],
  });
  assert.deepEqual(plan.drawLeaves.map((entry) => entry.name), ['visible']);
  assert.equal(plan.complete, true);
});

test('opening admission includes visible ordinary entity roots but defers hidden, offscreen, and unmounted roots', () => {
  const scene = new THREE.Scene();
  const makeRoot = (name, options = {}) => {
    const root = new THREE.Group();
    root.name = name;
    root.visible = options.visible !== false;
    const leaf = mesh(`${name}-leaf`);
    root.add(leaf);
    if (options.layer != null) leaf.layers.set(options.layer);
    if (options.mounted !== false) scene.add(root);
    return { root, leaf };
  };
  const visible = makeRoot('ordinary-visible');
  const hidden = makeRoot('ordinary-hidden', { visible: false });
  const offscreen = makeRoot('ordinary-offscreen');
  const deferred = makeRoot('ordinary-deferred', { mounted: false });
  productionMetadata(visible.root, CONTENT_HASH);
  const entities = new Map([
    ['player', { id: 'player', alive: true, type: 'ship' }],
    ['visible', { id: 'visible', alive: true, type: 'ship' }],
    ['hidden', { id: 'hidden', alive: true, type: 'ship' }],
    ['offscreen', { id: 'offscreen', alive: true, type: 'ship' }],
    ['deferred', { id: 'deferred', alive: true, type: 'ship' }],
  ]);
  const meshes = new Map([
    ['player', makeRoot('player').root],
    ['visible', visible.root],
    ['hidden', hidden.root],
    ['offscreen', offscreen.root],
    ['deferred', deferred.root],
  ]);
  const camera = {
    frustum: {
      intersectsObject(object) { return object !== offscreen.leaf; },
    },
    layers: { test(objectLayers) { return objectLayers && objectLayers.mask === 1; } },
  };
  visible.root.visible = false;
  assert.deepEqual(
    collectOpeningEntityRootCandidates(meshes, entities, {
      playerId: 'player',
      scene,
      camera,
    }),
    [],
    'a root hidden during loading stays deferred before the final picture boundary',
  );
  visible.root.visible = true;
  const candidates = collectOpeningEntityRootCandidates(meshes, entities, {
    playerId: 'player',
    scene,
    camera,
  });
  assert.deepEqual(candidates.map((candidate) => candidate.root.name), ['ordinary-visible']);
  assert.equal(candidates[0].role, 'opening-entity-root');

  const census = createOpeningProducerCensus(visible.root, { camera, includeOffscreen: true });
  const combined = combineOpeningProducerCensuses([census]);
  const plan = createOpeningSubmissionPlan({
    candidates,
    camera,
    globalProgramKeys: combined.globalProgramKeys,
    openingProgramKeys: combined.openingProgramKeys,
    requiredContentHashes: combined.requiredContentHashes,
    producerCensus: combined,
    producerResourceIdentitySets: combined.resourceIdentitySets,
  });
  assert.equal(plan.complete, true);
  assert.deepEqual(plan.roots.map((root) => root.name), ['ordinary-visible']);
  assert.deepEqual(plan.drawLeaves.map((leaf) => leaf.name), ['ordinary-visible-leaf']);
});

test('opening admission excludes entity leaves masked by the live camera layer contract', () => {
  const scene = new THREE.Scene();
  const visible = new THREE.Group();
  visible.name = 'layer-visible';
  visible.add(mesh('layer-visible-leaf'));
  const masked = new THREE.Group();
  masked.name = 'layer-masked';
  const maskedLeaf = mesh('layer-masked-leaf');
  maskedLeaf.layers.set(1);
  masked.add(maskedLeaf);
  scene.add(visible, masked);
  const entities = new Map([
    ['visible', { id: 'visible', alive: true, type: 'ship' }],
    ['masked', { id: 'masked', alive: true, type: 'ship' }],
  ]);
  const candidates = collectOpeningEntityRootCandidates(
    new Map([['visible', visible], ['masked', masked]]),
    entities,
    {
      scene,
      camera: {
        frustum: { intersectsObject: () => true },
        layers: { test(objectLayers) { return objectLayers && objectLayers.mask === 1; } },
      },
    },
  );
  assert.deepEqual(candidates.map((candidate) => candidate.root.name), ['layer-visible']);
});

test('opening admission adds off-camera roots that the first shadow pass will submit', () => {
  const scene = new THREE.Scene();
  const makeRoot = (name, { castShadow = true } = {}) => {
    const root = new THREE.Group();
    root.name = name;
    const leaf = mesh(`${name}-leaf`);
    leaf.castShadow = castShadow;
    root.add(leaf);
    scene.add(root);
    return { root, leaf };
  };
  const player = makeRoot('player');
  const cameraVisible = makeRoot('camera-visible');
  const corridorPin = makeRoot('helios-corridor-pin');
  const civilianPod = makeRoot('civilian-pod');
  const receiveOnly = makeRoot('receive-only', { castShadow: false });
  const outsideShadow = makeRoot('outside-shadow');
  const entities = new Map([
    ['player', { id: 'player', alive: true, type: 'ship' }],
    ['visible', { id: 'visible', alive: true, type: 'ship' }],
    ['pin', { id: 'pin', alive: true, type: 'fx' }],
    ['pod', { id: 'pod', alive: true, type: 'payload' }],
    ['receive', { id: 'receive', alive: true, type: 'fx' }],
    ['outside', { id: 'outside', alive: true, type: 'ship' }],
  ]);
  const meshes = new Map([
    ['player', player.root],
    ['visible', cameraVisible.root],
    ['pin', corridorPin.root],
    ['pod', civilianPod.root],
    ['receive', receiveOnly.root],
    ['outside', outsideShadow.root],
  ]);
  const mainCamera = {
    frustum: { intersectsObject: (object) => object === cameraVisible.leaf },
    layers: { test: () => true },
  };
  const shadowCamera = {
    frustum: {
      intersectsObject: (object) => object === corridorPin.leaf || object === civilianPod.leaf,
    },
    layers: { test: () => true },
  };
  const mainCandidates = collectOpeningEntityRootCandidates(meshes, entities, {
    playerId: 'player', scene, camera: mainCamera,
  });
  assert.deepEqual(mainCandidates.map((candidate) => candidate.root.name), ['camera-visible']);

  const shadowCandidates = collectOpeningShadowCasterRootCandidates(meshes, entities, {
    playerId: 'player', scene, camera: shadowCamera,
    alreadyIncluded: mainCandidates.map((candidate) => candidate.root),
  });
  assert.deepEqual(
    shadowCandidates.map((candidate) => candidate.root.name),
    ['helios-corridor-pin', 'civilian-pod'],
  );
  assert.ok(shadowCandidates.every((candidate) => (
    candidate.role === 'firstFrameShadowCaster'
      && candidate.includeOffscreen === true
      && candidate.reason === 'first-shadow-pass-caster-outside-main-camera'
  )));
});

test('the generated 47-A pod enters the shadow cohort with a verified producer recipe', () => {
  const pod = build47aScenarioProp({
    id: 'civilian-pod',
    type: 'payload',
    radius: 8,
    data: { assetRef: 'asset.slice.civilian_pod' },
  });
  const packageInfo = ensureOpeningGeneratedScenarioPropPackage(pod);
  assert.equal(packageInfo?.contentHashVerified, true);
  assert.match(packageInfo?.contentHash || '', /^[a-f0-9]{64}$/);
  assert.equal(packageInfo?.producer, 'scenario-47a-generated-prop');

  const census = createOpeningProducerCensus(pod, {
    includeOffscreen: true,
    route: { shadow: true, target: 'screen' },
  });
  const combined = combineOpeningProducerCensuses([census]);
  const plan = createOpeningSubmissionPlan({
    candidates: [{
      root: pod,
      role: 'firstFrameShadowCaster',
      startupRole: 'first-shadow-pass-caster',
      blocking: true,
      reason: 'first-shadow-pass-caster-outside-main-camera',
      includeOffscreen: true,
    }],
    shadows: true,
    globalProgramKeys: combined.globalProgramKeys,
    openingProgramKeys: combined.openingProgramKeys,
    requiredContentHashes: combined.requiredContentHashes,
    producerCensus: combined,
    producerResourceIdentitySets: combined.resourceIdentitySets,
  });
  assert.equal(plan.complete, true);
  assert.equal(plan.roots[0].productionBoundary.contentHashVerified, true);
  assert.equal(plan.drawLeaves.length, 6);
  assert.equal(plan.geometryBuffers.length, 6);
});

test('opening submission plan admits only camera-contributing production leaves', () => {
  const root = new THREE.Group();
  const near = mesh('near');
  const far = mesh('far');
  root.add(near, far);
  const camera = {
    frustum: {
      intersectsObject(object) { return object.name === 'near'; },
    },
  };
  assert.deepEqual(collectOpeningSubmissionLeaves(root, { camera }), [near]);
});

test('opening program subject keys keep family shaders distinct when maps differ', () => {
  const family = () => 'spaceface-common-rock-pbr';
  const mapA = new THREE.Texture();
  mapA.name = 'albedo-a';
  const mapB = new THREE.Texture();
  mapB.name = 'albedo-b';
  const a = new THREE.MeshStandardMaterial({ map: mapA });
  const b = new THREE.MeshStandardMaterial({ map: mapB });
  a.customProgramCacheKey = family;
  b.customProgramCacheKey = family;
  assert.notEqual(openingProgramSubjectKey(a), openingProgramSubjectKey(b));
});

test('first playable pipeline set is content-hash bound and defers global misses', () => {
  const set = createFirstPlayablePipelineSet({
    contentHash: CONTENT_HASH,
    contentHashVerified: true,
    globalProgramKeys: [
      { key: 'shared', contentHash: CONTENT_HASH },
      { key: 'late-global', contentHash: CONTENT_HASH },
      { key: 'stale', contentHash: 'old-package' },
    ],
    openingProgramKeys: [
      { key: 'shared', contentHash: CONTENT_HASH },
      { key: 'opening-only', contentHash: CONTENT_HASH },
    ],
  });
  assert.equal(set.schema, FIRST_PLAYABLE_PIPELINE_SET_SCHEMA);
  assert.equal(set.complete, true);
  assert.deepEqual(set.admittedProgramKeys.map((entry) => entry.key), ['shared']);
  assert.deepEqual(set.deferredGlobalProgramKeys.map((entry) => entry.key), ['late-global']);
  assert.ok(Object.isFrozen(set));
  assert.ok(Object.isFrozen(set.admittedProgramKeys));
});

test('opening submission plan remains incomplete when a blocking production root has no draw leaf', () => {
  const plan = createOpeningSubmissionPlan({
    candidates: [{ root: new THREE.Group(), role: 'player', blocking: true }],
  });
  assert.equal(plan.complete, false);
  assert.equal(plan.blockingReasons[0].reason, 'no-currently-instantiated-first-picture-draw-leaf');
});

test('opening submission plan fails closed when a blocking root has no verified content hash', () => {
  const root = new THREE.Group();
  root.add(mesh('background'));
  const plan = createOpeningSubmissionPlan({
    candidates: [{ root, role: 'firstFrameBackground' }],
    globalProgramKeys: [{ key: 'opening', contentHash: CONTENT_HASH }],
    openingProgramKeys: [{ key: 'opening', contentHash: CONTENT_HASH }],
  });
  assert.equal(plan.complete, false);
  assert.equal(plan.firstPlayablePipelineSet.complete, false);
  assert.equal(plan.firstPlayablePipelineSet.reason, 'missing-content-hash');
});

test('opening submission plan fails closed when one blocking root loses its boundary hash', () => {
  const verified = new THREE.Group();
  productionMetadata(verified, 'b'.repeat(64));
  verified.add(mesh('verified-background'));
  const missing = new THREE.Group();
  missing.add(mesh('missing-background'));
  const verifiedCensus = createOpeningProducerCensus(verified, { includeOffscreen: true });
  const combined = combineOpeningProducerCensuses([verifiedCensus, createOpeningProducerCensus(missing)]);
  const plan = createOpeningSubmissionPlan({
    candidates: [
      { root: verified, role: 'background' },
      { root: missing, role: 'parallax' },
    ],
    requiredContentHashes: combined.requiredContentHashes,
    globalProgramKeys: combined.globalProgramKeys,
    openingProgramKeys: combined.openingProgramKeys,
    producerCensus: combined,
    producerResourceIdentitySets: combined.resourceIdentitySets,
  });
  assert.equal(plan.complete, false);
  assert.ok(plan.blockingReasons.some((entry) => (
    entry.reason === 'missing-or-unverified-blocking-content-hash'
  )));
});

test('opening submission plan fails closed when producer resource census is replaced', () => {
  const root = new THREE.Group();
  productionMetadata(root);
  const leaf = mesh('census-leaf');
  root.add(leaf);
  const census = createOpeningProducerCensus(root, { includeOffscreen: true });
  const combined = combineOpeningProducerCensuses([census]);
  const wrongGeometry = [`uuid:${new THREE.BoxGeometry().uuid}`];
  const plan = createOpeningSubmissionPlan({
    candidates: [{ root, role: 'player', includeOffscreen: true }],
    requiredContentHashes: combined.requiredContentHashes,
    globalProgramKeys: combined.globalProgramKeys,
    openingProgramKeys: combined.openingProgramKeys,
    producerCensus: combined,
    producerResourceIdentitySets: {
      ...combined.resourceIdentitySets,
      geometryBufferIds: wrongGeometry,
    },
  });
  assert.equal(plan.resourceIdentityCensusMatches, false);
  assert.equal(plan.complete, false);
  assert.ok(plan.blockingReasons.some((entry) => (
    entry.reason === 'producer-resource-identity-census-mismatch'
  )));
});

test('producer package stamping cannot overwrite an existing producer boundary', () => {
  const root = new THREE.Group();
  const leaf = mesh('tamper-leaf');
  root.add(leaf);
  const original = stampOpeningSubmissionPackage(root, {
    producer: 'real-producer',
    recipe: { seed: 11 },
  }, { assetId: 'real-root', producer: 'real-producer' });
  const attempted = stampOpeningSubmissionPackage(root, {
    producer: 'renderer-bookkeeping',
    recipe: { seed: 99 },
  }, { assetId: 'tampered-root', producer: 'renderer-bookkeeping' });
  assert.equal(attempted, original);
  assert.equal(root.userData.openingSubmissionPackage.producer, 'real-producer');
  assert.equal(root.userData.openingSubmissionPackage.assetId, 'real-root');
});

test('opening submission receipt fails closed on an uncaptured first-draw resource', () => {
  const root = new THREE.Group();
  productionMetadata(root);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  material.customProgramCacheKey = () => 'opening';
  const leaf = mesh('background', material);
  leaf.castShadow = true;
  const postMaterial = new THREE.ShaderMaterial();
  const originalGeometry = leaf.geometry;
  root.add(leaf);
  const plan = createOpeningSubmissionPlan({
    ...planOptions(root, 'opening', { route: 'bloom', shadows: true }),
    route: 'bloom',
    candidates: [{ root, role: 'firstFrameBackground' }],
    shadows: true,
  });
  const bindings = new WeakMap([
    [material, {
      programs: new Map([['opening', {}]]),
      currentProgram: { cacheKey: 'opening' },
    }],
    [postMaterial, {
      programs: new Map([['opening-post', {}]]),
      currentProgram: { cacheKey: 'opening-post' },
    }],
  ]);
  const renderer = {
    info: {
      programs: [
        { cacheKey: 'opening' },
        { cacheKey: 'opening-depth' },
        { cacheKey: 'opening-post' },
        { cacheKey: 'retired-warmup-program' },
      ],
      memory: { geometries: 5, textures: 7 },
    },
    properties: { get: (value) => bindings.get(value) || {} },
  };
  const receipt = createOpeningSubmissionReceipt(renderer, plan, {
    programMaterials: [postMaterial],
    shadowProgramKeys: ['opening-depth'],
  });
  assert.deepEqual(receipt.required.programCacheKeys, [
    'opening',
    'opening-depth',
    'opening-post',
  ]);

  const accepted = validateOpeningSubmissionReceipt(receipt, renderer);
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.uncaptured, []);

  renderer.info.programs = [
    { cacheKey: 'opening' },
    { cacheKey: 'opening-depth' },
    { cacheKey: 'opening-post' },
  ];
  const retiredWarmup = validateOpeningSubmissionReceipt(receipt, renderer);
  assert.equal(retiredWarmup.ok, true, 'a non-plan warmup program may retire before first paint');

  renderer.info.programs = [{ cacheKey: 'opening-depth' }, { cacheKey: 'opening-post' }];
  const missingRequired = validateOpeningSubmissionReceipt(receipt, renderer);
  assert.equal(missingRequired.ok, false);
  assert.deepEqual(missingRequired.missingProgramKeys, ['opening']);

  renderer.info.programs = [
    { cacheKey: 'opening' },
    { cacheKey: 'opening-depth' },
    { cacheKey: 'opening-post' },
    { cacheKey: 'uncaptured-key' },
  ];
  const failed = validateOpeningSubmissionReceipt(receipt, renderer);
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.uncaptured, ['programs']);
  assert.deepEqual(failed.uncapturedProgramKeys, ['uncaptured-key']);

  renderer.info.programs = [
    { cacheKey: 'opening' },
    { cacheKey: 'opening-depth' },
    { cacheKey: 'opening-post' },
  ];
  leaf.geometry = new THREE.BoxGeometry();
  const geometryFailure = validateOpeningSubmissionReceipt(receipt, renderer);
  assert.equal(geometryFailure.ok, false, 'a replacement geometry must fail at unchanged count');
  assert.ok(geometryFailure.uncapturedGeometryBufferIds.length > 0);

  leaf.geometry = originalGeometry;
  leaf.material.map = new THREE.Texture();
  const textureFailure = validateOpeningSubmissionReceipt(receipt, renderer);
  assert.equal(textureFailure.ok, false, 'a replacement blocking texture must fail at unchanged count');
  assert.ok(textureFailure.uncapturedTextureIds.length > 0);

  leaf.material.map = null;
  leaf.geometry = new THREE.BoxGeometry();
  const shadowFailure = validateOpeningSubmissionReceipt(receipt, renderer);
  assert.equal(shadowFailure.ok, false, 'shadow resources have no arbitrary first-draw allowance');
  assert.ok(shadowFailure.uncapturedShadowResourceIds.length > 0);
});

test('opening submission receipt fails closed when an exact material has no live Three program binding', () => {
  const root = new THREE.Group();
  productionMetadata(root);
  const leaf = mesh('unprepared-opening-leaf');
  root.add(leaf);
  const plan = createOpeningSubmissionPlan(planOptions(root));
  const renderer = {
    info: { programs: [{ cacheKey: 'unrelated-warmup' }], memory: {} },
    properties: { get: () => ({}) },
  };

  const receipt = createOpeningSubmissionReceipt(renderer, plan);
  const validation = validateOpeningSubmissionReceipt(receipt, renderer);
  assert.equal(validation.ok, false);
  assert.equal(validation.reason, 'unprepared-opening-program-binding');
  assert.deepEqual(validation.missingProgramBindings, ['plan:0:material:0:unprepared-material']);
});

test('production startup no longer invokes a hidden opening discovery render or global loading compile', async () => {
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const readiness = await readFile(new URL('../src/render/pipelineReadiness.js', import.meta.url), 'utf8');
  const [partsLibrary, spaceBackground, parallaxLayers, vfx] = await Promise.all([
    readFile(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/spaceBackground.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/parallaxLayers.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/render/vfx.js', import.meta.url), 'utf8'),
  ]);
  const prepareStart = renderer.indexOf('state.render.prepareOpeningGpuResources =');
  const prepareEnd = renderer.indexOf('// Collision/socket/landing debug toggle', prepareStart);
  assert.ok(prepareStart >= 0 && prepareEnd > prepareStart);
  const prepare = renderer.slice(prepareStart, prepareEnd);
  assert.doesNotMatch(prepare, /_renderOpeningPostFrame\(/);
  assert.match(prepare, /openingSubmissionPlan/);
  assert.match(readiness, /captureOpeningSubmissionPlan/);
  assert.match(renderer, /opening-submission-plan-owns-first-picture/);
  assert.match(renderer, /firstPlayableContentHashes = producerCensus\.requiredContentHashes/);
  assert.match(renderer, /firstPlayableResourceIdentitySets = producerCensus\.resourceIdentitySets/);
  assert.doesNotMatch(renderer, /stampOpeningSubmissionPackage/);
  assert.match(partsLibrary, /stampOpeningSubmissionPackage\(root/);
  assert.match(spaceBackground, /_publishOpeningSubmissionPackage/);
  assert.match(parallaxLayers, /_publishOpeningSubmissionPackages/);
  assert.match(vfx, /_publishOpeningVfxPackage/);
  const drawStart = renderer.indexOf('drawPreparedFrame()');
  const gate = renderer.indexOf('openingSubmissionPreSubmitValidation', drawStart);
  const submit = renderer.indexOf('this._renderPostRoute(', gate);
  assert.ok(drawStart >= 0 && gate > drawStart && submit > gate);
  assert.match(renderer, /missing-opening-submission-receipt/);
  const firstDrawGuard = renderer.slice(drawStart, submit);
  assert.match(firstDrawGuard, /this\.state\.render\.openingSubmissionReceipt/);
  assert.doesNotMatch(firstDrawGuard, /(?<!\.)\bstate\.render\.openingSubmission/,
    'drawPreparedFrame must use its renderer instance state after Continue');
});
