import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

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
  claimSharedImageTexture,
  resetImageSourceDedupeForTests,
  sharedImageSourceEntry,
  releaseSharedImageSource,
} from '../src/render/imageSourceDedupe.js';
import {
  detachPackageTexture,
  detachedTextureUploadPending,
  isPackageTextureDetached,
  resetPackageDetachManifestsForTests,
} from '../src/render/packageCpuDetach.js';
import { textureGpuResident } from '../src/render/startupGpuResidency.js';

const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function packageMetadata(assetId = 'fixture.shared-release') {
  const metadata = {
    schema: RENDER_PACKAGE_SCHEMA,
    assetId,
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
      id: 'fixture.body', nodeName: 'Hull', nodePath: [0], role: 'immutable',
      parentId: null, localTransform: [...IDENTITY], worldTransform: [...IDENTITY],
      materialPipelineKey: 'opaque:front', spatialClusterId: 'body', mergeBoundary: 'body',
    }],
    anchors: [], dynamicGroups: [], geometry: [], materials: [], lods: [], hlods: [],
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
      schema: RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA, recordIds, rawNodeName,
    },
  };
}

// Two marked package textures adopted onto one canonical dedupe source — the F3 shape.
function sharedFixture() {
  const canonical = new THREE.Source(new ImageBitmapShim(4, 4));
  const a = new THREE.Texture(); a.name = 'SharedA'; a.source = canonical;
  const b = new THREE.Texture(); b.name = 'SharedB'; b.source = canonical;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setIndex([0, 1, 2]);
  const material = new THREE.MeshStandardMaterial({ map: a });
  const root = new THREE.Group();
  const hull = new THREE.Mesh(geometry, material);
  hull.userData = semanticLocator('Hull', ['fixture.body']);
  root.add(hull);
  const aUser = claimSharedImageTexture('fixture.shared.key', a); // owner — a itself
  const bUser = claimSharedImageTexture('fixture.shared.key', b); // adopted clone (b is retired)
  return { scene: root, a, aUser, bUser, canonical, geometry };
}

// DataTexture.source.data only needs {width,height} semantics for these tests.
function ImageBitmapShim(width, height) {
  return { width, height, close() { this.closed = true; } };
}

function freshLoader(loadGlb, residency = createAssetResidencyRegistry()) {
  return createRenderPackageLoader({ residency, loadGlb });
}

function stampedRenderer() {
  const renderer = { initTexture() {}, properties: new Map(), _versions: new Map() };
  return renderer;
}

test('shared canonical source releases only once every live user is GPU-resident', async () => {
  resetPackageDetachManifestsForTests();
  resetImageSourceDedupeForTests();
  const fixture = sharedFixture();
  const loader = freshLoader(async () => fixture);
  await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  const renderer = stampedRenderer();

  // Neither user stamped → no release, and the solo detach still defers.
  assert.equal(detachPackageTexture(fixture.a), false, 'shared-user detach defers');
  const resident = (u) => textureGpuResident(u, renderer);
  assert.equal(releaseSharedImageSource(fixture.a, resident), false);
  assert.ok(fixture.canonical.data, 'canonical payload retained while a user is unstamped');

  const stamps = new Set();
  const residentStub = (u) => stamps.has(u);
  assert.equal(releaseSharedImageSource(fixture.a, residentStub), false);
  stamps.add(fixture.aUser);
  assert.equal(releaseSharedImageSource(fixture.a, residentStub), false);
  stamps.add(fixture.bUser);
  assert.equal(releaseSharedImageSource(fixture.a, residentStub), true, 'all users resident → release');
  assert.equal(fixture.canonical.data, null, 'canonical source.data released once');
  assert.equal(sharedImageSourceEntry(fixture.a).sourceReleased, true);
  // The marked texture now reads as released through its shared-entry flag.
  assert.equal(isPackageTextureDetached(fixture.a), true);
  fixture.a.version = 7; // simulate a proven upload (version>0 arms the gate)
  const props = new Map([[fixture.a, { __version: fixture.a.version }]]);
  assert.equal(detachedTextureUploadPending(fixture.a, props), false,
    'released but version-matched bind stays live');
  assert.equal(detachedTextureUploadPending(fixture.a, new Map()), true,
    'a renderer with no upload record pends the gate');
  fixture.a.needsUpdate = true;
  assert.equal(detachedTextureUploadPending(fixture.a, props), true,
    'a moved version on a released shared source pends the gate');
  loader.dispose();
});

test('resident KTX2-clone users release their mip array eagerly, not the canonical check', async () => {
  resetImageSourceDedupeForTests();
  resetPackageDetachManifestsForTests();
  const mips = [{ data: new Uint8Array(128), width: 4, height: 4 }];
  const owner = new THREE.CompressedTexture(mips, 4, 4, THREE.RGBAFormat);
  resetImageSourceDedupeForTests();
  claimSharedImageTexture('ktx2.key', owner);
  const clone = owner.clone(); // shares the mip records, slices the array
  const entry = sharedImageSourceEntry(owner);
  entry.users.add(clone);

  const stamps = new Set([owner]);
  const resident = (u) => stamps.has(u);
  assert.equal(releaseSharedImageSource(owner, resident), false,
    'clone not resident → canonical stays, but owner mips release eagerly');
  assert.equal(owner.mipmaps.length, 0, 'resident user mips cleared');
  assert.equal(clone.mipmaps.length, 1, 'non-resident clone keeps the shared records');
  assert.equal(entry.releasedUsers.has(owner), true);
});

test('source pins: F3 release call sites exist verbatim', () => {
  const residency = readFileSync(new URL('../src/render/startupGpuResidency.js', import.meta.url), 'utf8');
  assert.equal(
    residency.match(/releaseSharedImageSource\(texture, \(user\) => textureGpuResident\(user, renderer\)\);/g).length,
    3, 'release attempt beside all three detachPackageTexture sites');
  const detach = readFileSync(new URL('../src/render/packageCpuDetach.js', import.meta.url), 'utf8');
  assert.match(detach, /sharedImageSourceEntry\(texture\)/);
});
