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
import {
  createPackageDetachManifest,
  detachPackageTexture,
  dropPackageDetachManifest,
  isPackageTextureDetached,
  packageDetachDiagnostics,
  rehydrateDetachedPackages,
  resetPackageDetachManifestsForTests,
} from '../src/render/packageCpuDetach.js';
import {
  claimSharedImageTexture,
  imageSourceKeyAsync,
  resetImageSourceDedupeForTests,
  sharedImageTextureFor,
} from '../src/render/imageSourceDedupe.js';
import { prepareStartupGpuResidency } from '../src/render/startupGpuResidency.js';

const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function packageMetadata() {
  const metadata = {
    schema: RENDER_PACKAGE_SCHEMA,
    assetId: 'fixture.detach',
    kind: 'ship',
    compiler: { name: 'spaceface-render-package-compiler', version: '1.0.0' },
    contentHash: '0'.repeat(64),
    render: { uri: 'render.glb', sha256: '2'.repeat(64), bytes: 256 },
    provenance: {
      sourceGlb: { uri: 'fixture.glb', sha256: '3'.repeat(64), bytes: 512 },
      sourceManifest: null,
      semantics: { sha256: '4'.repeat(64) },
    },
    nodes: [{
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
    }],
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

function compressedBytes(byteLength) {
  return [{ data: new Uint8Array(byteLength), width: 4, height: 4 }];
}

// One decoded fixture = a compressed texture (mipmap payload) + a regular texture (source.data
// payload) on one material, mirroring a decoded render.glb's resource mix.
function decodedFixture() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setIndex([0, 1, 2]);

  const compressed = new THREE.CompressedTexture(compressedBytes(2048), 4, 4, THREE.RGBAFormat);
  compressed.name = 'HullKtx2';
  const regular = new THREE.DataTexture(new Uint8Array(64), 4, 4, THREE.RGBAFormat);
  regular.name = 'HullData';
  const empty = new THREE.Texture();
  empty.name = 'HullEmpty';

  const material = new THREE.MeshStandardMaterial({
    map: compressed,
    normalMap: regular,
    emissiveMap: empty,
  });
  material.name = 'HullMaterial';

  const root = new THREE.Group();
  root.name = 'FixtureScene';
  const hull = new THREE.Mesh(geometry, material);
  hull.name = 'Hull';
  hull.userData = semanticLocator('Hull', ['fixture.body']);
  root.add(hull);

  return { scene: root, geometry, material, compressed, regular, empty };
}

function stubRenderer() {
  const uploads = [];
  return {
    uploads,
    initTexture(texture) { uploads.push(texture); },
  };
}

function freshLoader(loadGlb, residency = createAssetResidencyRegistry()) {
  resetPackageDetachManifestsForTests();
  return createRenderPackageLoader({ residency, loadGlb });
}

test('package textures detach their CPU payloads after a proven residency upload', async () => {
  const decoded = decodedFixture();
  const loader = freshLoader(async () => decoded);
  const loaded = await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });

  for (const texture of [decoded.compressed, decoded.regular, decoded.empty]) {
    assert.equal(texture.userData.spacefaceCpuDetach.schema, 'spaceface.cpuDetach.v1');
  }

  const renderer = stubRenderer();
  const subject = loaded.createInstance().root;
  const receipt = await prepareStartupGpuResidency(renderer, subject, {
    includeGeometry: false,
    yieldToMain: async () => {},
  });

  assert.equal(receipt.textures, 3);
  assert.equal(renderer.uploads.length, 3);
  assert.equal(decoded.compressed.mipmaps.length, 0, 'compressed mips released post-upload');
  assert.equal(decoded.regular.source.data, null, 'source.data released post-upload');
  assert.equal(decoded.compressed.image.width, 4, 'compressed dimension stub survives detach');
  assert.equal(isPackageTextureDetached(decoded.compressed), true);
  assert.equal(isPackageTextureDetached(decoded.regular), true);
  // An empty texture had nothing to release and stays attached (no restore handling needed).
  assert.equal(isPackageTextureDetached(decoded.empty), false);

  const diag = loader.diagnostics().cpuDetach;
  assert.equal(diag.detachedTextures, 2);
  assert.equal(diag.detachedBytes, 2048 + 64);
  assert.equal(diag.packagesWithDetachedTextures, 1);
  loader.dispose();
});

test('a detached texture is treated as resident and never re-uploaded empty', async () => {
  const decoded = decodedFixture();
  const loader = freshLoader(async () => decoded);
  const loaded = await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  const subject = loaded.createInstance().root;

  const renderer = stubRenderer();
  await prepareStartupGpuResidency(renderer, subject, { includeGeometry: false, yieldToMain: async () => {} });
  assert.equal(renderer.uploads.length, 3);
  assert.equal(isPackageTextureDetached(decoded.compressed), true);

  // A version bump (needsUpdate) invalidates the stamp — the detached guard must still block
  // the empty upload that would otherwise overwrite the live GPU copy.
  decoded.compressed.needsUpdate = true;
  const receipt = await prepareStartupGpuResidency(renderer, subject, {
    includeGeometry: false,
    yieldToMain: async () => {},
  });
  assert.equal(renderer.uploads.length, 3, 'no texture re-uploaded while detached');
  assert.equal(receipt.residentTextures, 3);

  // A different renderer (fresh stamp map) still cannot push empty bytes onto a detached texture.
  const foreign = stubRenderer();
  const foreignReceipt = await prepareStartupGpuResidency(foreign, subject, {
    includeGeometry: false,
    yieldToMain: async () => {},
  });
  assert.equal(foreign.uploads.length, 1, 'only the never-detached empty texture uploads');
  assert.equal(foreignReceipt.residentTextures, 2);
  loader.dispose();
});

test('rehydrate re-decodes the immutable package and refills payloads in place', async () => {
  const first = decodedFixture();
  const second = decodedFixture();
  let decodeCount = 0;
  const loader = freshLoader(async () => {
    decodeCount += 1;
    return decodeCount === 1 ? first : second;
  });
  const loaded = await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  const subject = loaded.createInstance().root;

  const renderer = stubRenderer();
  await prepareStartupGpuResidency(renderer, subject, { includeGeometry: false, yieldToMain: async () => {} });
  assert.equal(isPackageTextureDetached(first.compressed), true);
  const compressedVersion = first.compressed.version;
  const regularVersion = first.regular.version;

  const receipt = await rehydrateDetachedPackages({ yieldToMain: async () => {} });
  assert.equal(receipt.packages, 1);
  assert.equal(receipt.textures, 2);
  assert.equal(decodeCount, 2, 'exactly one re-decode for the resident package');

  // Same live texture objects are refilled — never swapped — so every instance reference stays valid.
  assert.equal(first.compressed.mipmaps, second.compressed.mipmaps);
  assert.equal(first.regular.source.data, second.regular.source.data);
  assert.ok(first.compressed.version > compressedVersion, 'version bump invalidates the stale stamp');
  assert.ok(first.regular.version > regularVersion);
  assert.equal(isPackageTextureDetached(first.compressed), false);
  assert.equal(packageDetachDiagnostics().packagesWithDetachedTextures, 0);

  // Re-stamping through the residency pass uploads the real bytes and re-detaches them.
  const afterRestore = stubRenderer();
  await prepareStartupGpuResidency(afterRestore, subject, {
    includeGeometry: false,
    yieldToMain: async () => {},
    ignoreResidentStamps: true,
  });
  assert.equal(afterRestore.uploads.length, 3);
  assert.equal(isPackageTextureDetached(first.compressed), true, 'detached again after re-upload');
  loader.dispose();
});

test('rehydrate is a no-op with nothing detached and skips evicted packages', async () => {
  const decoded = decodedFixture();
  const residency = createAssetResidencyRegistry({ maxGpuBytes: 1 });
  let decodeCount = 0;
  const loader = freshLoader(async () => { decodeCount += 1; return decoded; }, residency);
  const loaded = await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });

  const emptyRun = await rehydrateDetachedPackages();
  assert.equal(emptyRun.skipped, true);
  assert.equal(decodeCount, 1);

  // Stamp textures via a synthetic subject so no instance owner pins the package against
  // the budget-eviction path under test.
  const renderer = stubRenderer();
  const subject = new THREE.Mesh(decoded.geometry, decoded.material);
  await prepareStartupGpuResidency(renderer, subject, {
    includeGeometry: false,
    yieldToMain: async () => {},
  });
  assert.ok(packageDetachDiagnostics().detachedTextures > 0);

  residency.enforceBudget();
  const evictedRun = await rehydrateDetachedPackages();
  assert.equal(evictedRun.packages, 0, 'evicted manifests are dropped, not rehydrated');
  assert.equal(decodeCount, 1, 'no decode storm for evicted packages');
  loader.dispose();
});

test('parser-cloned textures sharing one Source and mipmap buffers detach once, count once', async () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setIndex([0, 1, 2]);
  const base = new THREE.CompressedTexture(compressedBytes(4096), 4, 4, THREE.RGBAFormat);
  base.name = 'SharedKtx2';
  const clone = base.clone(); // parser sourceCache path: shared Source, sliced mipmap array
  const material = new THREE.MeshStandardMaterial({ map: base, normalMap: clone });
  const root = new THREE.Group();
  const hull = new THREE.Mesh(geometry, material);
  hull.name = 'Hull';
  hull.userData = semanticLocator('Hull', ['fixture.body']);
  root.add(hull);
  const decoded = { scene: root };

  let decodeCount = 0;
  const loader = freshLoader(async () => {
    decodeCount += 1;
    if (decodeCount === 1) return decoded;
    const freshBase = new THREE.CompressedTexture(compressedBytes(4096), 4, 4, THREE.RGBAFormat);
    freshBase.name = 'SharedKtx2';
    const freshClone = freshBase.clone();
    const freshMaterial = new THREE.MeshStandardMaterial({ map: freshBase, normalMap: freshClone });
    const freshRoot = new THREE.Group();
    const freshHull = new THREE.Mesh(geometry.clone(), freshMaterial);
    freshHull.name = 'Hull';
    freshHull.userData = semanticLocator('Hull', ['fixture.body']);
    freshRoot.add(freshHull);
    return { scene: freshRoot };
  });
  await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });

  const renderer = stubRenderer();
  await prepareStartupGpuResidency(renderer, root, { includeGeometry: false, yieldToMain: async () => {} });
  assert.equal(isPackageTextureDetached(base), true);
  assert.equal(isPackageTextureDetached(clone), true);
  // The shared mipmap payloads are freed once physically and counted once in diagnostics.
  assert.equal(packageDetachDiagnostics().detachedBytes, 4096);

  const receipt = await rehydrateDetachedPackages({ yieldToMain: async () => {} });
  assert.equal(receipt.textures, 2);
  assert.ok(base.mipmaps.length > 0 && clone.mipmaps.length > 0);
  loader.dispose();
});

test('a dedupe-shared payload is released only once its source has a single live user', async () => {
  resetImageSourceDedupeForTests();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setIndex([0, 1, 2]);

  // Package A's decode owns the dedupe entry; package B's byte-identical image resolves to a
  // clone sharing the same THREE.Source — its own mipmap array over the same mip records —
  // then carries its own colorSpace: a different WebGLTextures upload-cache key, so it needs
  // its own GPU upload from payload a shared-source detach must not have emptied.
  const owner = new THREE.CompressedTexture(compressedBytes(4096), 4, 4, THREE.RGBAFormat);
  owner.name = 'SharedAtlas';
  const key = await imageSourceKeyAsync(new Uint8Array([7, 7, 7]), 3, 'image/ktx2');
  claimSharedImageTexture(key, owner);
  const sibling = sharedImageTextureFor(key);
  sibling.colorSpace = THREE.SRGBColorSpace;
  assert.ok(sibling.mipmaps.length > 0, 'a live owner hands out a clone with real mips');
  assert.equal(sibling.source, owner.source, 'the clone shares the dedupe Source');

  const material = new THREE.MeshStandardMaterial({ map: owner });
  const root = new THREE.Group();
  const hull = new THREE.Mesh(geometry, material);
  hull.name = 'Hull';
  hull.userData = semanticLocator('Hull', ['fixture.body']);
  root.add(hull);
  const decoded = { scene: root };

  const loader = freshLoader(async () => decoded);
  const loaded = await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  const subject = loaded.createInstance().root;

  const renderer = stubRenderer();
  await prepareStartupGpuResidency(renderer, subject, {
    includeGeometry: false,
    yieldToMain: async () => {},
  });

  assert.equal(renderer.uploads.length, 1, 'the upload was proven');
  // The release defers while the sibling lives: emptying this array now would leave the
  // texture one fresh upload (different cache key, or a dispose/rebind whose entry was freed)
  // away from mipmaps[0].width on an empty array — and would free no bytes anyway, since the
  // sibling's array still holds the same mip records.
  assert.equal(isPackageTextureDetached(owner), false);
  assert.ok(owner.mipmaps.length > 0, 'payload retained while a shared-source sibling lives');

  // Once the sibling is gone the texture is the entry's last user — the next residency pass
  // releases the mirror (the bytes could not have left any earlier).
  sibling.dispose();
  await prepareStartupGpuResidency(renderer, subject, {
    includeGeometry: false,
    yieldToMain: async () => {},
  });
  assert.equal(isPackageTextureDetached(owner), true);
  assert.equal(owner.mipmaps.length, 0, 'sole live user releases its payload');
  loader.dispose();
});

test('manifest creation is idempotent and ordinal pairing is identity-checked', async () => {
  const decoded = decodedFixture();
  const loader = freshLoader(async () => decoded);
  const loaded = await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });

  const manifest = createPackageDetachManifest(loaded, {
    redecode: async () => decoded,
    collectResources: (root) => {
      const resources = new Set();
      root.traverse((object) => {
        if (object.material) {
          for (const value of Object.values(object.material)) {
            if (value && value.isTexture) resources.add(value);
          }
        }
      });
      return resources;
    },
  });
  assert.ok(manifest);
  assert.equal(manifest.entries.length, 3);

  // A clone carries a JSON-copied mark; the identity check keeps it ineligible for detach.
  const clone = decoded.compressed.clone();
  assert.equal(clone.userData.spacefaceCpuDetach.contentHash, manifest.contentHash);
  assert.equal(detachPackageTexture(clone), false);
  assert.equal(clone.mipmaps.length, 1, 'clone keeps its own payload');

  assert.equal(dropPackageDetachManifest(manifest.contentHash), true);
  assert.equal(detachPackageTexture(decoded.compressed), false, 'evicted manifests stop detaching');
  loader.dispose();
});
