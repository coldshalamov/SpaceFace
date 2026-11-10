// NXB-058: Shared render resources survive one consumer leaving and retire after the last one
// NXI-230: A rejected old-generation decode releases only its own resources

import assert from 'node:assert/strict';
import { test } from 'node:test';
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

const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function packageMetadata(assetId = 'fixture.ship', hashChar = '1') {
  const metadata = {
    schema: RENDER_PACKAGE_SCHEMA,
    assetId,
    kind: 'ship',
    compiler: { name: 'spaceface-render-package-compiler', version: '1.0.0' },
    contentHash: hashChar.repeat(64),
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
    ],
    anchors: [],
    dynamicGroups: [],
    geometry: [],
    materials: [],
    lods: [],
    hlods: [],
    collisions: [],
    spatialClusters: [{ id: 'body', nodeIds: ['fixture.body'], bounds: null }],
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
  root.add(hull);

  return { scene: root, geometry, material, texture };
}

test('NXB-058: Shared render resources survive one consumer leaving and retire after the last one', async () => {
  const disposals = { geometry: 0, material: 0, texture: 0 };
  const decoded = decodedFixture(disposals);
  const residency = createAssetResidencyRegistry();
  const loader = createRenderPackageLoader({
    residency,
    loadGlb: async () => ({ scene: decoded.scene }),
  });

  const metadata = packageMetadata();

  // Consumer 1 loads the package and creates an instance
  const pkgConsumer1 = await loader.load(metadata);
  const instance1 = pkgConsumer1.createInstance({ name: 'ship_consumer_1' });

  // Consumer 2 loads the package (hits cache, multi-consumer lease) and creates an instance
  const pkgConsumer2 = await loader.load(metadata);
  const instance2 = pkgConsumer2.createInstance({ name: 'ship_consumer_2' });

  assert.strictEqual(pkgConsumer1, pkgConsumer2, 'Both consumers share the same loaded package');

  // Consumer 1 leaves: releases its instance and its package lease
  assert.equal(instance1.dispose(), true, 'Consumer 1 instance disposed');
  assert.equal(pkgConsumer1.release('consumer-1-left'), true, 'Consumer 1 releases package lease');

  // Consumer 2 remains completely intact! Shared resources are NOT disposed!
  assert.deepEqual(disposals, { geometry: 0, material: 0, texture: 0 }, 'Shared resources survive consumer 1 leaving');
  assert.equal(instance2.disposed, false, 'Consumer 2 instance is still active');
  assert.ok(instance2.root.children.length > 0, 'Consumer 2 instance hierarchy is intact');

  // Consumer 2 can create another instance without throwing
  const instance2b = pkgConsumer2.createInstance({ name: 'ship_consumer_2b' });
  assert.ok(instance2b, 'Consumer 2 can still create instances');

  // Now Consumer 2 leaves: releases both its instances and package lease
  assert.equal(instance2.dispose(), true);
  assert.equal(instance2b.dispose(), true);
  assert.equal(pkgConsumer2.release('consumer-2-left'), true);

  // Assert: Final release retires the shared resources
  assert.deepEqual(disposals, { geometry: 1, material: 1, texture: 1 }, 'Shared resources retire on final consumer release');
  assert.equal(residency.canonicalDiagnostics().residentAssets, 0, 'Residency asset cleared after last consumer');
});

test('NXI-230: A superseded old-generation decode releases only its own resources without corrupting current generation', async () => {
  const disposalsGen1 = { geometry: 0, material: 0, texture: 0 };
  const decodedGen1 = decodedFixture(disposalsGen1);

  const disposalsGen2 = { geometry: 0, material: 0, texture: 0 };
  const decodedGen2 = decodedFixture(disposalsGen2);

  let resolveGen1;
  const gen1Promise = new Promise((resolve) => { resolveGen1 = resolve; });

  const residency = createAssetResidencyRegistry();
  const meta1 = packageMetadata('fixture.ship.gen1', '1');
  const meta2 = packageMetadata('fixture.ship.gen2', '2');

  const loader = createRenderPackageLoader({
    residency,
    loadGlb: async (_url, meta) => {
      if (meta.contentHash === meta1.contentHash) {
        return gen1Promise;
      }
      return { scene: decodedGen2.scene };
    },
  });

  // Start gen 1 load (pending in-flight decode)
  const pendingGen1 = loader.load(meta1);

  // Gen 2 loads and completes first
  const pkgGen2 = await loader.load(meta2);
  const instGen2 = pkgGen2.createInstance();
  assert.ok(instGen2, 'Gen 2 successfully resident');

  // Cancel/abort or supersede gen 1
  loader.release(meta1.contentHash, 'superseded');
  resolveGen1({ scene: decodedGen1.scene });
  await assert.rejects(pendingGen1);

  // Gen 1's private allocations are disposed and Gen 2 remains completely untouched
  assert.deepEqual(disposalsGen1, { geometry: 1, material: 1, texture: 1 }, 'Gen 1 private resources released');
  assert.deepEqual(disposalsGen2, { geometry: 0, material: 0, texture: 0 }, 'Gen 2 resources remain completely untouched');
  assert.equal(instGen2.disposed, false, 'Gen 2 instance remains active and undamaged');
});
