import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import * as THREE from 'three';

import {
  RENDER_PACKAGE_SCHEMA,
  RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY,
  RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA,
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
