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
import { disposeObjectNode } from '../src/render/renderer.js';
import { createRenderPackageLoader } from '../src/render/renderPackageLoader.js';
import { createReadyPackagedBodyCache } from '../src/render/readyPackagedBodies.js';
import {
  detachPackageGeometry,
  detachedGeometryUploadPending,
  detachedPresentedDrawBlocked,
  isPackageGeometryDetached,
  noteGeometryGpuResident,
  packageDetachDiagnostics,
  presentedDetachRehydrateInFlight,
  resetPackageDetachManifestsForTests,
} from '../src/render/packageCpuDetach.js';
import { resetImageSourceDedupeForTests } from '../src/render/imageSourceDedupe.js';

const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function packageMetadata(assetId = 'fixture.fragment-lifetime') {
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

// Same GLTF-style shape as the package census: position+normal+uv share ONE
// InterleavedBuffer, plus a standalone index. Two mounted fragments of one hull
// draw this exact geometry object — Object3D.clone shares .geometry.
function decodedFixture() {
  const stride = 8;
  const interleaved = new Float32Array(3 * stride);
  interleaved.set([0, 0, 0, 0, 0, 1, 0, 0], 0 * stride);
  interleaved.set([1, 0, 0, 0, 0, 1, 1, 0], 1 * stride);
  interleaved.set([0, 1, 0, 0, 0, 1, 0, 1], 2 * stride);
  const sharedBuffer = new THREE.InterleavedBuffer(interleaved, stride);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(sharedBuffer, 3, 0));
  geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(sharedBuffer, 3, 3));
  geometry.setAttribute('uv', new THREE.InterleavedBufferAttribute(sharedBuffer, 2, 6));
  geometry.setIndex([0, 1, 2]);
  const material = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
  const hull = new THREE.Mesh(geometry, material);
  hull.name = 'Hull';
  hull.userData = {
    [RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY]: {
      schema: RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA,
      recordIds: ['fixture.body'],
      rawNodeName: 'Hull',
    },
  };
  root.add(hull);
  return { scene: root, geometry, material, sharedBuffer };
}

function stubRenderer() {
  return { initTexture() {}, properties: new Map() };
}

function freshLoader(loadGlb, residency = createAssetResidencyRegistry()) {
  resetPackageDetachManifestsForTests();
  resetImageSourceDedupeForTests();
  return createRenderPackageLoader({ residency, loadGlb });
}

test('a retiring fragment twin cannot poison the surviving body draw gate', async () => {
  const decoded = decodedFixture();
  const loader = freshLoader(async () => decoded);
  await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  const geometry = decoded.geometry;
  const renderer = stubRenderer();

  // Residency seal: the package's upload proof stamps the ledger. The mirror
  // release stays deferred here (a CPU-composition lease / later sealed pass),
  // so the geometry is marked but NOT yet detached.
  noteGeometryGpuResident(geometry, renderer);
  assert.equal(isPackageGeometryDetached(geometry), false);

  // Retirement: a fragment twin tears down and disposes the shared package
  // geometry — disposeObjectNode's call into the detach ledger. Three's
  // attribute records die; the manifest's recordsDied flag goes up.
  geometry.dispatchEvent({ type: 'dispose' });

  // The surviving instance's next draw re-uploads from live CPU arrays — the
  // armed ledger's note IS that re-upload. The death certificate is now stale.
  noteGeometryGpuResident(geometry, renderer);

  // The deferred release lands (stamped-skip retry — called without a renderer,
  // exactly like collectUnresidentInstancedDrawables / createGeometryWorkItems).
  assert.equal(detachPackageGeometry(geometry), true);
  assert.equal(isPackageGeometryDetached(geometry), true);
  assert.equal(decoded.sharedBuffer.array.byteLength, 0, 'non-kept mirror released');

  // The records the dispose destroyed were re-created by the noted draw, and
  // the upload ledger still names this renderer — the next presented draw must
  // NOT be gated into a full-package re-decode.
  assert.equal(detachedGeometryUploadPending(geometry, renderer), false,
    'a noted post-dispose re-upload clears the stale death flag');
  assert.equal(detachedPresentedDrawBlocked(renderer, geometry, decoded.material), false);
  assert.equal(presentedDetachRehydrateInFlight(), null,
    'no breakup-time re-decode is queued for live records');

  // Safety stays: a REAL death after detach (no re-upload note) still pends.
  geometry.dispatchEvent({ type: 'dispose' });
  assert.equal(detachedGeometryUploadPending(geometry, renderer), true,
    'dead post-detach records still block the presented draw');

  loader.dispose();
});

// Baseline proof for the uncached-mount path: registered package geometry is residency-
// fenced (protectSharedGpuResource — dispose is a no-op while the asset entry lives and
// the record carries spacefaceSharedAsset), so per-node retirement teardown cannot kill
// the shared GPU buffers, and the real dispose fires only at the zero-owner eviction.
test('uncaptured mounts share one geometry: mount teardown never disposes, final owner release does', async () => {
  const decoded = decodedFixture();
  let decodes = 0;
  const residency = createAssetResidencyRegistry();
  const loader = freshLoader(async () => { decodes += 1; return decoded; }, residency);
  const loaded = await loader.load(packageMetadata('fixture.fragment-shared-mounts'), {
    baseUrl: 'https://fixtures.test/',
  });
  const geometry = decoded.geometry;
  let disposals = 0;
  geometry.addEventListener('dispose', () => { disposals += 1; });

  // Two uncached mounts of the same package generation — clone(false) shares the record's
  // geometry, exactly like two fracture fragments before readyBodies capture lands (or
  // after a capture rejection: armed onAfterRender, instanced/skinned node, oversize).
  const mountA = loaded.createInstance();
  const mountB = loaded.createInstance();
  assert.equal(mountB.planNodes[1].geometry, geometry, 'the second mount draws the same record');

  // The real per-node teardown grammar retires the first mount while the second still draws,
  // then its instance-level owner release — the package stays owned by the surviving mount
  // and the loader cache lease, so no 'dispose' may dispatch.
  for (const node of mountA.planNodes) disposeObjectNode(node);
  mountA.dispose('fragment-retired');
  assert.equal(disposals, 0, 'a retiring mount cannot kill buffers a surviving body still draws');
  assert.equal(loaded.evicted, false);

  for (const node of mountB.planNodes) disposeObjectNode(node);
  mountB.dispose('fragment-retired');
  assert.equal(disposals, 0, 'the cache lease still owns the package — no premature disposal');

  // The final owner release: dropping the package lease leaves zero owners, evictIfUnowned
  // finalizes the resource and the real dispose dispatches exactly once.
  loaded.release('breakup-cleared');
  assert.equal(disposals, 1, 'the last owner release disposes the records exactly once');
  assert.equal(loaded.evicted, true);

  // And the documented cost: a fresh mount after a full eviction pays one real re-decode —
  // that is the only path that should decode the GLB again, not per-mount retirement.
  const reloaded = await loader.load(packageMetadata('fixture.fragment-shared-mounts'), {
    baseUrl: 'https://fixtures.test/',
  });
  assert.equal(decodes, 2, 'a genuinely evicted package re-decodes on next load');
  assert.ok(reloaded);
  loader.dispose();
});

test('instance.dispose alone releases the owner without touching shared records', async () => {
  const decoded = decodedFixture();
  const loader = freshLoader(async () => decoded);
  const loaded = await loader.load(packageMetadata('fixture.fragment-instance-release'), {
    baseUrl: 'https://fixtures.test/',
  });
  const geometry = decoded.geometry;
  let disposals = 0;
  geometry.addEventListener('dispose', () => { disposals += 1; });

  const mountA = loaded.createInstance();
  const mountB = loaded.createInstance();
  mountA.dispose('flight-unmounted');
  assert.equal(disposals, 0, 'instance release alone leaves the survivor drawing');
  mountB.dispose('flight-unmounted');
  assert.equal(disposals, 0, 'the loader cache lease still owns the package');
  loaded.release('round-over');
  assert.equal(disposals, 1, 'the final owner release disposes the records');

  loader.dispose();
});

test('a ready-body acquire mount survives exemplar and cache retirement until the package evicts', async () => {
  const decoded = decodedFixture();
  const residency = createAssetResidencyRegistry();
  const loader = freshLoader(async () => decoded, residency);
  const loaded = await loader.load(packageMetadata('fixture.fragment-ready-mount'), {
    baseUrl: 'https://fixtures.test/',
  });
  const geometry = decoded.geometry;
  let disposals = 0;
  geometry.addEventListener('dispose', () => { disposals += 1; });

  const cache = createReadyPackagedBodyCache({ residency });
  const exemplar = loaded.createInstance();
  const generation = cache.generation;
  assert.equal(cache.capture('fixture.frag|dead|residual', exemplar.root, {
    record: { assetId: 'fixture.frag', residency: { key: loaded.residencyKey }, renderPackage: loaded },
    fitRadius: 10,
    motionBank: null,
    gpuAdmitted: true,
    admissionGeneration: generation,
  }), true, 'the exemplar captures a live template');

  const ready = cache.acquire('fixture.frag|dead|residual', { fitRadius: 12, patchMaterial: () => {} });
  assert.ok(ready, 'a mount is minted from the captured template');
  assert.equal(ready.root.children[0].geometry === geometry || ready.root.geometry === geometry, true,
    'the minted mount shares the template geometry');

  // The exemplar retires; the template owner + acquire owner still hold the package.
  for (const node of exemplar.planNodes) disposeObjectNode(node);
  exemplar.dispose('fragment-retired');
  assert.equal(disposals, 0, 'template + live acquire keep the records alive');
  ready.release();
  assert.equal(disposals, 0, 'release of the minted mount leaves owners alive');
  cache.clear('round-over');
  assert.equal(disposals, 0, 'template retirement still leaves the package cache lease');
  loaded.release('round-over');
  assert.equal(disposals, 1, 'the last owner release disposes the records exactly once');

  loader.dispose();
});

test('fragment retirement drops only the retiring generation manifest', async () => {
  const decoded = decodedFixture();
  const residency = createAssetResidencyRegistry();
  const loader = freshLoader(async () => decoded, residency);
  const loaded = await loader.load(packageMetadata('fixture.fragment-retire'), {
    baseUrl: 'https://fixtures.test/',
  });
  const instance = loaded.createInstance();
  assert.ok(packageDetachDiagnostics().manifests >= 1);

  loader.dispose('runtime-retired');
  // Instance retirement is the residency eviction path into
  // dropPackageDetachManifest — the manifest must not outlive its generation.
  instance.dispose('flight-unmounted');
  assert.equal(packageDetachDiagnostics().manifests, 0,
    'the last owner retiring the package drops its detach manifest');
});
