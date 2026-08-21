import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import * as THREE from 'three';

import {
  RENDER_PACKAGE_SCHEMA,
  RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY,
  RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA,
  computeRenderPackageRuntimeHash,
  renderPackageContentIdentity,
  stableJsonStringify,
} from '../src/contracts/renderPackage.js';
import { createAssetResidencyRegistry } from '../src/render/assetResidency.js';
import { createRenderPackageLoader } from '../src/render/renderPackageLoader.js';

const HASH = '1'.repeat(64);
const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function packageMetadata() {
  const metadata = {
    schema: RENDER_PACKAGE_SCHEMA,
    assetId: 'fixture.ship',
    kind: 'ship',
    compiler: { name: 'spaceface-render-package-compiler', version: '1.0.0' },
    contentHash: HASH,
    render: { uri: 'render.glb', sha256: '2'.repeat(64), bytes: 256 },
    provenance: {
      sourceGlb: { uri: 'fixture.glb', sha256: '3'.repeat(64), bytes: 512 },
      sourceManifest: null,
      semantics: { sha256: '4'.repeat(64) },
    },
    nodes: [
      {
        id: 'fixture.body',
        nodeName: 'Hull',
        nodePath: [0],
        role: 'immutable',
        parentId: null,
        localTransform: [...IDENTITY],
        worldTransform: [...IDENTITY],
        materialPipelineKey: 'opaque:front',
        spatialClusterId: 'body',
        mergeBoundary: 'body',
      },
      {
        id: 'fixture.turret',
        nodeName: 'Turret',
        nodePath: [1],
        role: 'dynamic',
        parentId: null,
        localTransform: [...IDENTITY],
        worldTransform: [...IDENTITY],
        materialPipelineKey: 'opaque:front',
        spatialClusterId: 'body',
        mergeBoundary: 'turret',
      },
    ],
    anchors: [{
      id: 'fixture.trail.left',
      nodeName: 'FX_Trail_Left',
      nodePath: [0, 0],
      kind: 'trail',
      parentNodeId: 'fixture.body',
      localTransform: [...IDENTITY],
      worldTransform: [...IDENTITY],
    }],
    dynamicGroups: [{
      id: 'fixture.turret.group',
      nodeId: 'fixture.turret',
      kind: 'moving-part',
    }],
    geometry: [],
    materials: [],
    lods: [],
    hlods: [],
    collisions: [],
    spatialClusters: [{ id: 'body', nodeIds: ['fixture.body', 'fixture.turret'], bounds: null }],
  };
  metadata.contentHash = createHash('sha256')
    .update(stableJsonStringify(renderPackageContentIdentity(metadata)))
    .digest('hex');
  return metadata;
}

function semanticLocator(rawNodeName, recordIds) {
  return {
    [RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY]: {
      schema: RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA,
      recordIds,
      rawNodeName,
    },
  };
}

function decodedFixture(disposals = null) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ], 3));
  geometry.setIndex([0, 1, 2]);
  const texture = new THREE.Texture();
  texture.name = 'HullBaseColor';
  const material = new THREE.MeshStandardMaterial({ map: texture });
  material.name = 'HullMaterial';
  if (disposals) {
    geometry.dispose = () => { disposals.geometry++; };
    material.dispose = () => { disposals.material++; };
    texture.dispose = () => { disposals.texture++; };
  }

  const root = new THREE.Group();
  root.name = 'FixtureScene';
  const hull = new THREE.Mesh(geometry, material);
  hull.name = 'Hull';
  hull.userData = semanticLocator('Hull', ['fixture.body']);
  const anchor = new THREE.Object3D();
  anchor.name = 'FX_Trail_Left';
  anchor.userData = semanticLocator('FX_Trail_Left', ['fixture.trail.left']);
  hull.add(anchor);
  const turret = new THREE.Mesh(geometry, material);
  turret.name = 'Turret';
  turret.userData = semanticLocator('Turret', ['fixture.turret']);
  root.add(hull, turret);

  return { scene: root, geometry, material, texture };
}

function flightPackageMetadata() {
  const metadata = packageMetadata();
  // The flight-static route is only eligible for a package with no dynamic-group ownership. The
  // decoded fixture still contains a turret node so the generic plan has meaningful parity work;
  // for this focused static fixture it is authored as an immutable primitive instead.
  metadata.nodes = metadata.nodes.map((node) => ({ ...node, role: 'immutable' }));
  metadata.dynamicGroups = [];
  metadata.contentHash = createHash('sha256')
    .update(stableJsonStringify(renderPackageContentIdentity(metadata)))
    .digest('hex');
  return metadata;
}

function preparedFlightFixture(decoded) {
  return Object.freeze({
    url: 'render.glb',
    assetId: 'fixture.ship',
    slot: 'ship',
    primitives: Object.freeze([Object.freeze({
      key: 'render.glb#Hull',
      name: 'Hull',
      geometry: decoded.geometry,
      material: decoded.material,
      matrix: new THREE.Matrix4(),
      tags: Object.freeze({ lod: 'lod0', instance: true }),
    })]),
    markers: Object.freeze([Object.freeze({
      name: 'FX_Trail_Left',
      matrix: new THREE.Matrix4().makeTranslation(1, 2, 3),
      tags: Object.freeze({ socket: true }),
      userData: Object.freeze({ name: 'FX_Trail_Left' }),
    })]),
  });
}

function objectCount(root) {
  let count = 0;
  root.traverse(() => { count++; });
  return count;
}

test('loader decodes once per content hash and creates lightweight instances sharing immutable resources', async () => {
  const decoded = decodedFixture();
  let decodeCount = 0;
  const loader = createRenderPackageLoader({
    loadGlb: async (url, metadata) => {
      decodeCount++;
      assert.equal(url, 'https://assets.example/render/fixture/render.glb');
      assert.equal(metadata.assetId, 'fixture.ship');
      return { scene: decoded.scene };
    },
  });
  const metadata = packageMetadata();

  const firstLoad = await loader.load(metadata, { baseUrl: 'https://assets.example/render/fixture/' });
  const secondLoad = await loader.load(structuredClone(metadata), { baseUrl: 'https://assets.example/render/fixture/' });
  assert.strictEqual(firstLoad, secondLoad);
  assert.equal(decodeCount, 1);

  const first = firstLoad.createInstance();
  const second = firstLoad.createInstance();
  assert.notStrictEqual(first.root, second.root);
  assert.notStrictEqual(first.nodes.get('fixture.body'), second.nodes.get('fixture.body'));
  assert.strictEqual(first.nodes.get('fixture.body').geometry, second.nodes.get('fixture.body').geometry);
  assert.strictEqual(first.nodes.get('fixture.body').material, second.nodes.get('fixture.body').material);
  assert.strictEqual(first.nodes.get('fixture.body').material.map, second.nodes.get('fixture.body').material.map);
  assert.strictEqual(first.nodes.get('fixture.body').geometry, decoded.geometry);
  assert.strictEqual(first.nodes.get('fixture.body').material, decoded.material);
  assert.strictEqual(first.nodes.get('fixture.body').material.map, decoded.texture);

  assert.equal(first.anchors.get('fixture.trail.left').name, 'FX_Trail_Left');
  assert.strictEqual(first.dynamicGroups.get('fixture.turret.group'), first.nodes.get('fixture.turret'));
  first.dynamicGroups.get('fixture.turret.group').rotation.y = 1.25;
  assert.equal(second.dynamicGroups.get('fixture.turret.group').rotation.y, 0);

  for (const resource of [decoded.geometry, decoded.material, decoded.texture]) {
    assert.equal(resource.userData.spacefaceRenderPackageImmutable, true);
    assert.equal(resource.userData.spacefaceSharedAsset, true);
  }
});

test('flight-static instances materialise one root per prepared primitive and marker while sharing resources', async () => {
  const decoded = decodedFixture();
  const prepared = preparedFlightFixture(decoded);
  const loader = createRenderPackageLoader({
    residency: createAssetResidencyRegistry(),
    loadGlb: async () => decoded,
    prepareDecoded: async () => prepared,
  });
  const loaded = await loader.load(flightPackageMetadata(), { baseUrl: 'https://fixtures.test/' });

  assert.equal(typeof loaded.createFlightInstance, 'function');
  const first = loaded.createFlightInstance();
  const second = loaded.createFlightInstance();
  assert.equal(objectCount(first.root), 1 + prepared.primitives.length + prepared.markers.length);
  assert.equal(objectCount(second.root), 1 + prepared.primitives.length + prepared.markers.length);
  assert.notStrictEqual(first.root, second.root);

  const firstObjects = [];
  first.root.traverse((object) => firstObjects.push(object));
  const firstMesh = firstObjects.find((object) => object.isMesh === true);
  const firstMarker = firstObjects.find((object) => object.name === 'FX_Trail_Left');
  assert.equal(
    firstObjects.filter((object) => object.isMesh === true).length,
    prepared.primitives.length,
    'flight instance has one Mesh per prepared primitive',
  );
  assert.equal(
    firstObjects.filter((object) => object !== first.root && object.isMesh !== true).length,
    prepared.markers.length,
    'flight instance has one Object3D per prepared marker',
  );
  assert.ok(firstMesh?.isMesh, 'prepared primitive becomes a Mesh');
  assert.ok(firstMarker?.isObject3D && !firstMarker.isMesh, 'prepared marker becomes an Object3D');

  const secondObjects = [];
  second.root.traverse((object) => secondObjects.push(object));
  const secondMesh = secondObjects.find((object) => object.isMesh === true);
  assert.ok(secondMesh?.isMesh);
  assert.notStrictEqual(firstMesh, secondMesh, 'flight instances have independent Mesh objects');
  assert.strictEqual(firstMesh.geometry, secondMesh.geometry, 'flight instances share geometry');
  assert.strictEqual(firstMesh.material, secondMesh.material, 'flight instances share material');

  // The generic route remains the full load-time plan, including the anchor and turret nodes.
  const generic = loaded.createInstance();
  assert.equal(generic.planNodes.length, loaded.planNodeCount);
  assert.equal(objectCount(generic.root), loaded.planNodeCount);
  assert.ok(objectCount(first.root) < generic.planNodes.length,
    'flight-static route is smaller than generic plan cloning');

  first.dispose();
  second.dispose();
  generic.dispose();
  loader.dispose();
});

test('flight-static instance creation rejects missing preparation and dynamic-group packages', async () => {
  const decoded = decodedFixture();
  const unpreparedLoader = createRenderPackageLoader({
    residency: createAssetResidencyRegistry(),
    loadGlb: async () => decoded,
  });
  const unprepared = await unpreparedLoader.load(flightPackageMetadata(), { baseUrl: 'https://fixtures.test/' });
  assert.throws(
    () => unprepared.createFlightInstance(),
    /no prepared flight records|prepared flight/i,
  );
  unpreparedLoader.dispose();

  const prepared = preparedFlightFixture(decoded);
  const dynamicLoader = createRenderPackageLoader({
    residency: createAssetResidencyRegistry(),
    loadGlb: async () => decoded,
    prepareDecoded: async () => prepared,
  });
  const dynamic = await dynamicLoader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  assert.throws(
    () => dynamic.createFlightInstance(),
    /dynamic groups/i,
  );
  dynamicLoader.dispose();
});

test('runtime-table hash and expected binding fail closed while legacy packages remain valid', async () => {
  const runtimeMetadata = packageMetadata();
  runtimeMetadata.runtime = {
    schema: 'spaceface.runtime.fixture.v3',
    primitives: [{ name: 'Hull', planIndex: 1 }],
    markers: [{ name: 'FX_Trail_Left', planIndex: 2 }],
  };
  runtimeMetadata.runtimeHash = await computeRenderPackageRuntimeHash(runtimeMetadata);

  const trustedLoader = createRenderPackageLoader({
    residency: createAssetResidencyRegistry(),
    loadGlb: async () => decodedFixture(),
  });
  const trusted = await trustedLoader.load(runtimeMetadata, {
    baseUrl: 'https://fixtures.test/',
    expectedRuntimeHash: runtimeMetadata.runtimeHash,
  });
  assert.equal(trusted.assetId, 'fixture.ship');
  trustedLoader.dispose();

  const mutated = structuredClone(runtimeMetadata);
  mutated.runtime.primitives[0].name = 'TamperedHull';
  const mutationLoader = createRenderPackageLoader({
    residency: createAssetResidencyRegistry(),
    loadGlb: async () => decodedFixture(),
  });
  await assert.rejects(
    mutationLoader.load(mutated, { expectedRuntimeHash: runtimeMetadata.runtimeHash }),
    /runtime hash mismatch/i,
  );
  mutationLoader.dispose();

  const rebound = structuredClone(mutated);
  rebound.runtimeHash = await computeRenderPackageRuntimeHash(rebound);
  const expectedBindingLoader = createRenderPackageLoader({
    residency: createAssetResidencyRegistry(),
    loadGlb: async () => decodedFixture(),
  });
  await assert.rejects(
    expectedBindingLoader.load(rebound, { expectedRuntimeHash: runtimeMetadata.runtimeHash }),
    /runtime trust-anchor mismatch/i,
  );
  expectedBindingLoader.dispose();

  const legacyLoader = createRenderPackageLoader({
    residency: createAssetResidencyRegistry(),
    loadGlb: async () => decodedFixture(),
  });
  const legacy = await legacyLoader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  assert.equal(legacy.assetId, 'fixture.ship', 'v2 packages without a runtime hash remain loadable');
  legacyLoader.dispose();
});

test('loader exposes one prepared blueprint and lets a render boundary own instance residency', async () => {
  const decoded = decodedFixture();
  const residency = createAssetResidencyRegistry();
  const prepared = Object.freeze({ route: 'prepared-blueprint' });
  let prepareCount = 0;
  const loader = createRenderPackageLoader({
    residency,
    loadGlb: async () => ({ scene: decoded.scene }),
    prepareDecoded(value, metadata, renderUrl) {
      prepareCount++;
      assert.strictEqual(value.scene, decoded.scene);
      assert.equal(metadata.assetId, 'fixture.ship');
      assert.equal(renderUrl, 'render.glb');
      return prepared;
    },
  });

  const loaded = await loader.load(packageMetadata());
  assert.equal(prepareCount, 1);
  assert.strictEqual(loaded.prepared, prepared);
  assert.match(loaded.residencyKey, /^render-package:/);

  const boundary = new THREE.Group();
  assert.equal(loaded.retain(boundary, { role: 'live-boundary' }), true);
  assert.equal(residency.canonicalDiagnostics().assets[0].refCount, 2);
  const instance = loaded.createInstance({
    residencyOwner: boundary,
    residencyRole: 'live-boundary',
  });
  assert.equal(residency.canonicalDiagnostics().assets[0].refCount, 2,
    'an already-retained external owner is shared instead of creating an untracked instance owner');
  assert.equal(instance.dispose(), true);
  assert.equal(residency.canonicalDiagnostics().assets[0].refCount, 2,
    'disposing one hierarchy cannot release the boundary-wide asset hold');
  assert.equal(residency.releaseOwner(boundary, 'fixture-boundary-removed'), 1);
  assert.equal(residency.canonicalDiagnostics().assets[0].refCount, 1);
});

test('loader validates metadata and declared content identity before decoding', async () => {
  let decodeCount = 0;
  const decoded = decodedFixture();
  const loader = createRenderPackageLoader({
    loadGlb: async () => {
      decodeCount++;
      return { scene: decoded.scene };
    },
  });

  const invalid = packageMetadata();
  invalid.dynamicGroups[0].nodeId = 'missing.node';
  await assert.rejects(loader.load(invalid), /render package validation failed.*reference/i);
  assert.equal(decodeCount, 0);

  const accepted = packageMetadata();
  await assert.rejects(
    loader.load(accepted, {
      baseUrl: 'https://assets.example/render/fixture/',
      expectedContentHash: '',
    }),
    /expectedContentHash must be lowercase SHA-256/i,
  );
  await assert.rejects(
    loader.load(accepted, {
      baseUrl: 'https://assets.example/render/fixture/',
      expectedContentHash: '5'.repeat(64),
    }),
    /trust-anchor mismatch/i,
  );
  assert.equal(decodeCount, 0);

  const acceptedLoad = await loader.load(accepted, {
    baseUrl: 'https://assets.example/render/fixture/',
    expectedContentHash: accepted.contentHash,
  });
  assert.equal(Object.isFrozen(acceptedLoad.metadata), true);
  assert.equal(Object.isFrozen(acceptedLoad.metadata.nodes[0]), true);
  assert.throws(() => { acceptedLoad.metadata = packageMetadata(); }, TypeError);
  assert.throws(() => { acceptedLoad.metadata.nodes[0].nodeName = 'Turret'; }, TypeError);
  const acceptedInstance = acceptedLoad.createInstance();
  assert.equal(acceptedInstance.nodes.get('fixture.body').name, 'Hull');
  acceptedInstance.dispose();

  const relocated = packageMetadata();
  relocated.render.uri = 'relocated.glb';
  relocated.provenance.sourceGlb.uri = 'sources/relocated-fixture.glb';
  assert.strictEqual(
    await loader.load(relocated, { baseUrl: 'https://cdn.example/render/fixture/' }),
    acceptedLoad,
    'relocatable provenance and transport URIs do not create another decoded generation',
  );
  const tampered = packageMetadata();
  tampered.render.sha256 = '9'.repeat(64);
  await assert.rejects(
    loader.load(tampered, { baseUrl: 'https://assets.example/render/fixture/' }),
    /content hash mismatch/i,
  );
  assert.equal(decodeCount, 1);
});

test('loader disposes decoded resources when semantic template validation fails before registration', async () => {
  const disposals = { geometry: 0, material: 0, texture: 0 };
  const decoded = decodedFixture(disposals);
  decoded.scene.children[0].userData[RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY].rawNodeName = 'WrongHull';
  const loader = createRenderPackageLoader({
    loadGlb: async () => ({ scene: decoded.scene }),
  });

  await assert.rejects(loader.load(packageMetadata()), /names WrongHull instead of Hull/i);
  assert.deepEqual(disposals, { geometry: 1, material: 1, texture: 1 });
  assert.equal(loader.diagnostics().residency.residentAssets, 0);
  assert.equal(loader.diagnostics().cacheEntries, 0);
});

test('loader rejects missing and duplicate compiler-owned semantic IDs', async () => {
  const missing = decodedFixture();
  delete missing.scene.children[0].children[0].userData[RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY];
  const missingLoader = createRenderPackageLoader({
    loadGlb: async () => ({ scene: missing.scene }),
  });
  await assert.rejects(missingLoader.load(packageMetadata()), /fixture\.trail\.left is missing/i);

  const duplicate = decodedFixture();
  duplicate.scene.children[1].userData[RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY].recordIds.push('fixture.body');
  const duplicateLoader = createRenderPackageLoader({
    loadGlb: async () => ({ scene: duplicate.scene }),
  });
  await assert.rejects(duplicateLoader.load(packageMetadata()), /fixture\.body is duplicated/i);
});

test('package and instance owners dispose shared resources only at the final residency release', async () => {
  const disposals = { geometry: 0, material: 0, texture: 0 };
  const decoded = decodedFixture(disposals);
  const residency = createAssetResidencyRegistry();
  const loader = createRenderPackageLoader({
    residency,
    loadGlb: async () => ({ scene: decoded.scene }),
  });
  const metadata = packageMetadata();
  const loaded = await loader.load(metadata);
  const first = loaded.createInstance();
  const second = loaded.createInstance();

  assert.equal(residency.canonicalDiagnostics().assets[0].refCount, 3);
  assert.equal(loaded.release('fixture-package-released'), true);
  assert.equal(residency.canonicalDiagnostics().assets[0].refCount, 2);
  assert.deepEqual(disposals, { geometry: 0, material: 0, texture: 0 });
  assert.throws(() => loaded.createInstance(), /must be retained/i);

  assert.strictEqual(await loader.load(structuredClone(metadata)), loaded);
  assert.equal(residency.canonicalDiagnostics().assets[0].refCount, 3);
  assert.equal(loaded.release('fixture-package-released-again'), true);
  assert.equal(first.dispose(), true);
  assert.equal(first.dispose(), false);
  assert.deepEqual(disposals, { geometry: 0, material: 0, texture: 0 });
  assert.equal(second.dispose(), true);
  assert.deepEqual(disposals, { geometry: 1, material: 1, texture: 1 });
  assert.equal(residency.canonicalDiagnostics().residentAssets, 0);
  assert.equal(loader.diagnostics().cacheEntries, 0);
  assert.throws(() => loaded.createInstance(), /must be retained/i);
});

test('loader disposal cancels an in-flight package generation and releases decoded resources', async () => {
  const disposals = { geometry: 0, material: 0, texture: 0 };
  const decoded = decodedFixture(disposals);
  let resolveDecode;
  let markDecodeStarted;
  const decodeStarted = new Promise((resolve) => { markDecodeStarted = resolve; });
  const loader = createRenderPackageLoader({
    loadGlb: async () => {
      markDecodeStarted();
      return new Promise((resolve) => { resolveDecode = resolve; });
    },
  });

  const pending = loader.load(packageMetadata());
  await decodeStarted;
  assert.equal(loader.dispose('fixture-loader-disposed'), true);
  resolveDecode({ scene: decoded.scene });
  await assert.rejects(pending, /released before decode completed/i);
  assert.deepEqual(disposals, { geometry: 1, material: 1, texture: 1 });
  assert.equal(loader.diagnostics().residency.residentAssets, 0);
  await assert.rejects(loader.load(packageMetadata()), /loader has been disposed/i);
});

test('loader disposal during content hashing cannot admit a later decode', async () => {
  const metadata = packageMetadata();
  let decodeCount = 0;
  let resolveDigest;
  let markDigestStarted;
  const digestStarted = new Promise((resolve) => { markDigestStarted = resolve; });
  const loader = createRenderPackageLoader({
    contentDigest: async () => {
      markDigestStarted();
      return new Promise((resolve) => { resolveDigest = resolve; });
    },
    loadGlb: async () => {
      decodeCount++;
      return decodedFixture();
    },
  });

  const pending = loader.load(metadata);
  await digestStarted;
  assert.equal(loader.dispose('fixture-loader-disposed-during-hash'), true);
  resolveDigest(metadata.contentHash);
  await assert.rejects(pending, /loader has been disposed/i);
  assert.equal(decodeCount, 0);
  assert.equal(loader.diagnostics().cacheEntries, 0);
});

test('source fallback is explicit, diagnostic, and never changes the ordinary package route silently', async () => {
  const decoded = decodedFixture();
  let decodeCount = 0;
  let fallbackCount = 0;
  const sourceValue = Object.freeze({ source: 'fixture.glb' });
  const loader = createRenderPackageLoader({
    loadGlb: async () => {
      decodeCount++;
      return { scene: decoded.scene };
    },
    loadSourceFallback: async ({ packageError }) => {
      fallbackCount++;
      assert.match(packageError.message, /content hash mismatch/i);
      return sourceValue;
    },
  });
  const tampered = packageMetadata();
  tampered.nodes[0].mergeBoundary = 'forged-boundary';

  await assert.rejects(loader.load(tampered), /content hash mismatch/i);
  assert.equal(fallbackCount, 0, 'ordinary loading must remain fail-closed');
  const fallback = await loader.loadWithSourceFallback(tampered);
  assert.equal(fallback.route, 'source-fallback');
  assert.strictEqual(fallback.value, sourceValue);
  assert.strictEqual(fallback.source, sourceValue);
  assert.equal(fallback.renderPackage, null);
  assert.match(fallback.packageError.message, /content hash mismatch/i);
  assert.equal(decodeCount, 0);
  assert.equal(fallbackCount, 1);

  const packageRoute = await loader.loadWithSourceFallback(packageMetadata());
  assert.equal(packageRoute.route, 'render-package');
  assert.strictEqual(packageRoute.value, packageRoute.renderPackage);
  assert.equal(packageRoute.source, null);
  assert.equal(fallbackCount, 1);
  assert.equal(decodeCount, 1);
});

test('loader preserves absolute, rooted, protocol-relative, and parent-relative render URLs', async () => {
  const cases = [
    {
      baseUrl: 'packages/fixture/',
      uri: 'render.glb',
      expected: 'packages/fixture/render.glb',
    },
    {
      baseUrl: '../packages/fixture/',
      uri: 'render.glb',
      expected: '../packages/fixture/render.glb',
    },
    {
      baseUrl: 'packages/fixture/',
      uri: 'https://cdn.example/fixture/render.glb',
      expected: 'https://cdn.example/fixture/render.glb',
    },
    {
      baseUrl: 'packages/fixture/',
      uri: '//cdn.example/fixture/render.glb',
      expected: '//cdn.example/fixture/render.glb',
    },
    {
      baseUrl: 'packages/fixture/',
      uri: '/fixture/render.glb',
      expected: '/fixture/render.glb',
    },
    {
      baseUrl: 'https://assets.example/packages/fixture/',
      uri: '//cdn.example/fixture/render.glb',
      expected: 'https://cdn.example/fixture/render.glb',
    },
    {
      baseUrl: 'https://assets.example/packages/fixture/',
      uri: '/fixture/render.glb',
      expected: 'https://assets.example/fixture/render.glb',
    },
  ];

  for (const fixture of cases) {
    const decoded = decodedFixture();
    const metadata = packageMetadata();
    metadata.render.uri = fixture.uri;
    const loader = createRenderPackageLoader({
      loadGlb: async (url) => {
        assert.equal(url, fixture.expected);
        return { scene: decoded.scene };
      },
    });
    const loaded = await loader.load(metadata, { baseUrl: fixture.baseUrl });
    assert.equal(loaded.assetId, 'fixture.ship');
    loader.dispose('url-fixture-complete');
  }
});

test('loader revalidates package URLs so a stale Electron cache cannot pin Hitch', async () => {
  const decoded = decodedFixture();
  const current = packageMetadata();
  const stale = packageMetadata();
  stale.render.sha256 = '9'.repeat(64);
  stale.contentHash = createHash('sha256')
    .update(stableJsonStringify(renderPackageContentIdentity(stale)))
    .digest('hex');

  const fetches = [];
  const loader = createRenderPackageLoader({
    fetchImpl: async (url, options) => {
      fetches.push({ url, cache: options && options.cache });
      assert.equal(url, 'assets/ships/release/render-packages/kestrel/render-package.json');
      return {
        ok: true,
        json: async () => (options && options.cache === 'reload' ? current : stale),
      };
    },
    loadGlb: async () => ({ scene: decoded.scene }),
  });

  const loaded = await loader.load(
    'assets/ships/release/render-packages/kestrel/render-package.json',
    { expectedContentHash: current.contentHash },
  );
  assert.equal(loaded.metadata.contentHash, current.contentHash);
  assert.deepEqual(fetches.map((entry) => entry.cache), ['no-cache', 'reload']);
});

test('loader preserves parent traversal when metadata itself is loaded by relative URL', async () => {
  const decoded = decodedFixture();
  const metadata = packageMetadata();
  const loader = createRenderPackageLoader({
    fetchImpl: async (url) => {
      assert.equal(url, '../packages/fixture/render-package.json');
      return { ok: true, json: async () => metadata };
    },
    loadGlb: async (url) => {
      assert.equal(url, '../packages/fixture/render.glb');
      return { scene: decoded.scene };
    },
  });

  const loaded = await loader.load('../packages/fixture/render-package.json');
  assert.equal(loaded.assetId, 'fixture.ship');
});

test('loader resolves relative render URLs from the final redirected metadata response URL', async () => {
  const decoded = decodedFixture();
  const metadata = packageMetadata();
  const loader = createRenderPackageLoader({
    fetchImpl: async (url) => {
      assert.equal(url, 'https://assets.example/releases/latest/render-package.json');
      return {
        ok: true,
        url: 'https://cdn.example/packages/fixture/render-package.json',
        json: async () => metadata,
      };
    },
    loadGlb: async (url) => {
      assert.equal(url, 'https://cdn.example/packages/fixture/render.glb');
      return { scene: decoded.scene };
    },
  });

  const loaded = await loader.load('https://assets.example/releases/latest/render-package.json');
  assert.equal(loaded.assetId, 'fixture.ship');
});

test('flat-plan instances are structurally identical to a recursive SkeletonUtils clone', async () => {
  // The flat instance plan replaced `SkeletonUtils.clone()` + a semantic re-traversal. The bar for
  // that swap is not "it runs" but "the resulting graph is indistinguishable". Build one instance
  // through the loader and one through the old recursive route from the SAME template, walk both
  // depth-first, and compare every property an instance is allowed to differ in.
  const { clone: cloneObjectGraph } = await import('three/addons/utils/SkeletonUtils.js');
  const decoded = decodedFixture();
  const loader = createRenderPackageLoader({
    loadGlb: async () => decoded,
    residency: createAssetResidencyRegistry(),
  });
  const loaded = await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  const instance = loaded.createInstance();

  const legacyRoot = cloneObjectGraph(decoded.scene);

  const walk = (object, out, parentName) => {
    out.push({
      name: object.name,
      ctor: object.constructor.name,
      parentName,
      isMesh: object.isMesh === true,
      matrix: [...object.matrix.elements],
      position: object.position.toArray(),
      quaternion: object.quaternion.toArray(),
      scale: object.scale.toArray(),
      visible: object.visible,
      castShadow: object.castShadow,
      receiveShadow: object.receiveShadow,
      frustumCulled: object.frustumCulled,
      renderOrder: object.renderOrder,
      layers: object.layers.mask,
      geometry: object.geometry || null,
      material: object.material || null,
      userData: JSON.stringify(object.userData),
    });
    for (const child of object.children) walk(child, out, object.name);
    return out;
  };

  const fromPlan = walk(instance.root, [], null);
  const fromClone = walk(legacyRoot, [], null);

  assert.equal(fromPlan.length, fromClone.length, 'same node count');
  for (let i = 0; i < fromPlan.length; i++) {
    const a = fromPlan[i];
    const b = fromClone[i];
    // The root's name and userData are deliberately rewritten by createInstance (instance name and
    // the spacefaceRenderPackage stamp), so those two fields are compared for every node but the
    // root. Everything else must match exactly, including traversal ORDER.
    assert.equal(a.ctor, b.ctor, `node ${i} constructor`);
    assert.equal(a.parentName, b.parentName, `node ${i} parent`);
    assert.equal(a.isMesh, b.isMesh, `node ${i} isMesh`);
    assert.deepEqual(a.matrix, b.matrix, `node ${i} matrix`);
    assert.deepEqual(a.position, b.position, `node ${i} position`);
    assert.deepEqual(a.quaternion, b.quaternion, `node ${i} quaternion`);
    assert.deepEqual(a.scale, b.scale, `node ${i} scale`);
    assert.equal(a.visible, b.visible, `node ${i} visible`);
    assert.equal(a.castShadow, b.castShadow, `node ${i} castShadow`);
    assert.equal(a.receiveShadow, b.receiveShadow, `node ${i} receiveShadow`);
    assert.equal(a.frustumCulled, b.frustumCulled, `node ${i} frustumCulled`);
    assert.equal(a.renderOrder, b.renderOrder, `node ${i} renderOrder`);
    assert.equal(a.layers, b.layers, `node ${i} layers`);
    if (i > 0) {
      assert.equal(a.name, b.name, `node ${i} name`);
      assert.equal(a.userData, b.userData, `node ${i} userData`);
    }
    // Immutable resources must be SHARED with the template, not copied, on both routes.
    assert.equal(a.geometry, b.geometry, `node ${i} shares geometry`);
    assert.equal(a.material, b.material, `node ${i} shares material`);
  }

  // planNodes is the same set, in the same depth-first pre-order, as walking the graph.
  assert.deepEqual(
    instance.planNodes.map((object) => object.name),
    fromPlan.map((entry) => entry.name),
    'planNodes matches depth-first pre-order',
  );

  // Semantic maps resolve to the same objects the graph walk found.
  assert.equal(instance.nodes.get('fixture.body').name, 'Hull');
  assert.equal(instance.nodes.get('fixture.turret').name, 'Turret');
  assert.equal(instance.anchors.get('fixture.trail.left').name, 'FX_Trail_Left');
  assert.equal(instance.dynamicGroups.get('fixture.turret.group'), instance.nodes.get('fixture.turret'));
  // …and they are this instance's objects, never the shared template's.
  assert.notEqual(instance.nodes.get('fixture.body'), decoded.scene.children[0]);

  instance.dispose();
  loader.dispose();
});

test('createNode hook substitutes plan objects without changing plan or semantic-map identity', async () => {
  const decoded = decodedFixture();
  const loader = createRenderPackageLoader({
    loadGlb: async () => decoded,
    residency: createAssetResidencyRegistry(),
  });
  const loaded = await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  const calls = [];
  let bodyProxy = null;
  const instance = loaded.createInstance({
    createNode({ source, planIndex, parentIndex }) {
      calls.push({ name: source.name, planIndex, parentIndex });
      if (source.name !== 'Hull') return null;
      bodyProxy = new THREE.Object3D().copy(source, false);
      bodyProxy.geometry = source.geometry;
      bodyProxy.material = source.material;
      bodyProxy.userData.spacefaceInstanceProxy = true;
      return bodyProxy;
    },
  });

  assert.deepEqual(calls, [
    { name: 'FixtureScene', planIndex: 0, parentIndex: -1 },
    { name: 'Hull', planIndex: 1, parentIndex: 0 },
    { name: 'FX_Trail_Left', planIndex: 2, parentIndex: 1 },
    { name: 'Turret', planIndex: 3, parentIndex: 0 },
  ]);
  assert.strictEqual(instance.planNodes[1], bodyProxy);
  assert.strictEqual(instance.nodes.get('fixture.body'), bodyProxy,
    'semantic nodes map retains the exact hook-created object');
  assert.strictEqual(instance.anchors.get('fixture.trail.left').parent, bodyProxy,
    'recorded parent index attaches later plan nodes to the substitute');
  assert.strictEqual(instance.dynamicGroups.get('fixture.turret.group'), instance.planNodes[3]);
  assert.strictEqual(bodyProxy.geometry, decoded.geometry);
  assert.strictEqual(bodyProxy.material, decoded.material);
  assert.deepEqual(instance.planNodes.map((object) => object.name), [
    'FixtureScene', 'Hull', 'FX_Trail_Left', 'Turret',
  ]);

  instance.dispose();
  loader.dispose();
});

test('createNode hook rejects non-objects, template nodes, aliases, descendants, and attached objects', async () => {
  const decoded = decodedFixture();
  const loader = createRenderPackageLoader({
    loadGlb: async () => decoded,
    residency: createAssetResidencyRegistry(),
  });
  const loaded = await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });

  assert.throws(
    () => loaded.createInstance({ createNode: () => ({}) }),
    /must return an Object3D or null/i,
  );
  assert.throws(
    () => loaded.createInstance({ createNode: ({ source }) => source }),
    /cannot return a template node/i,
  );
  const reused = new THREE.Object3D();
  assert.throws(
    () => loaded.createInstance({ createNode: () => reused }),
    /must return a unique Object3D/i,
  );
  const childBearing = new THREE.Object3D();
  childBearing.add(new THREE.Object3D());
  assert.throws(
    () => loaded.createInstance({ createNode: () => childBearing }),
    /must return an Object3D without children/i,
  );
  const parent = new THREE.Group();
  const attached = new THREE.Object3D();
  parent.add(attached);
  assert.throws(
    () => loaded.createInstance({ createNode: () => attached }),
    /must return an unattached Object3D/i,
  );

  assert.equal(decoded.scene.children[0].parent, decoded.scene,
    'rejected hooks never reparent the decoded template graph');
  loader.dispose();
});

test('two instances of one package are independent in transform and shared in resources', async () => {
  const decoded = decodedFixture();
  const loader = createRenderPackageLoader({
    loadGlb: async () => decoded,
    residency: createAssetResidencyRegistry(),
  });
  const loaded = await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  const a = loaded.createInstance();
  const b = loaded.createInstance();

  assert.notEqual(a.root, b.root);
  assert.notEqual(a.nodes.get('fixture.turret'), b.nodes.get('fixture.turret'));

  a.nodes.get('fixture.turret').position.set(5, 6, 7);
  assert.deepEqual(b.nodes.get('fixture.turret').position.toArray(), [0, 0, 0],
    'moving one instance must not move another');
  assert.deepEqual(decoded.scene.children[1].position.toArray(), [0, 0, 0],
    'moving an instance must not move the template');

  assert.equal(a.nodes.get('fixture.body').geometry, b.nodes.get('fixture.body').geometry,
    'geometry stays shared across instances');
  assert.equal(a.nodes.get('fixture.body').material, b.nodes.get('fixture.body').material,
    'material stays shared across instances');

  a.dispose();
  b.dispose();
  loader.dispose();
});

test('a package containing skinned content is rejected rather than silently deep-cloned', async () => {
  // Falling back to a recursive clone for skinned content would reintroduce the exact per-instance
  // cost the flat plan removes, and would do it invisibly. Fail loudly instead.
  const decoded = decodedFixture();
  const skinned = new THREE.SkinnedMesh(decoded.geometry, decoded.material);
  skinned.name = 'SkinnedIntruder';
  decoded.scene.add(skinned);

  const loader = createRenderPackageLoader({
    loadGlb: async () => decoded,
    residency: createAssetResidencyRegistry(),
  });
  await assert.rejects(
    loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' }),
    /is a skinned mesh; render packages must contain only rigid/,
  );
  loader.dispose();
});
