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
  detachPackageGeometry,
  detachedGeometryUploadPending,
  detachedPresentedDrawBlocked,
  isPackageGeometryDetached,
  noteGeometryGpuResident,
  resetPackageDetachManifestsForTests,
} from '../src/render/packageCpuDetach.js';
import { resetImageSourceDedupeForTests } from '../src/render/imageSourceDedupe.js';

const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function packageMetadata(assetId = 'fixture.residency-dispose') {
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
// InterleavedBuffer, plus a standalone index.
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

test('a dispose while attached voids every renderer stamp — a survivor draw unblocks only its own context', async () => {
  const decoded = decodedFixture();
  const loader = freshLoader(async () => decoded);
  await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  const geometry = decoded.geometry;
  const rendererA = stubRenderer();
  const rendererB = stubRenderer();

  // Both contexts drew the shared package geometry while attached — each holds
  // live attribute records and an honest residency stamp in uploadedOn.
  noteGeometryGpuResident(geometry, rendererA);
  noteGeometryGpuResident(geometry, rendererB);

  // A retiring twin disposes the shared geometry. Three registers a per-renderer
  // onGeometryDispose on the object, so this ONE dispatch kills BOTH contexts'
  // attribute records; the manifest's recordsDied flag goes up.
  geometry.dispatchEvent({ type: 'dispose' });

  // The world-mounted survivor draws again on rendererA — the armed ledger's
  // note IS that re-upload (records actually recreated). rendererB never
  // redraws before the release lands, so its records stay dead.
  noteGeometryGpuResident(geometry, rendererA);

  // The deferred release lands (stamped-skip retry — no renderer, exactly like
  // collectUnresidentInstancedDrawables / createGeometryWorkItems).
  assert.equal(detachPackageGeometry(geometry), true);
  assert.equal(isPackageGeometryDetached(geometry), true);
  assert.equal(decoded.sharedBuffer.array.byteLength, 0, 'non-kept mirror released');

  // rendererA actually re-uploaded post-dispose: its presented draw proceeds on
  // live records — the stale-flag repair must keep it unblocked.
  assert.equal(detachedGeometryUploadPending(geometry, rendererA), false,
    'the re-uploading renderer keeps its honest stamp');
  assert.equal(detachedPresentedDrawBlocked(rendererA, geometry, decoded.material), false);

  // rendererB's records are still dead. Its pre-dispose stamp described them, so
  // it must NOT satisfy the pending gate: without the stamp void, the survivor's
  // recordsDied clear would unblock a draw that creates zero-length VBOs from
  // the emptied arrays ("Vertex buffer is not big enough").
  assert.equal(detachedGeometryUploadPending(geometry, rendererB), true,
    'a stale pre-dispose stamp must not unblock a renderer whose records died');
  assert.equal(detachedPresentedDrawBlocked(rendererB, geometry, decoded.material), true,
    'the dead-records context stays gated into the rehydrate path');

  loader.dispose();
});

test('a stamp-less context never inherited a death waiver', async () => {
  const decoded = decodedFixture();
  const loader = freshLoader(async () => decoded);
  await loader.load(packageMetadata('fixture.residency-dispose-late'), {
    baseUrl: 'https://fixtures.test/',
  });
  const geometry = decoded.geometry;
  const rendererA = stubRenderer();
  const rendererC = stubRenderer();

  // Only rendererA ever drew it, pre-dispose. Dispose, survivor re-upload on A,
  // then detach — the sequence that clears recordsDied.
  noteGeometryGpuResident(geometry, rendererA);
  geometry.dispatchEvent({ type: 'dispose' });
  noteGeometryGpuResident(geometry, rendererA);
  assert.equal(detachPackageGeometry(geometry), true);

  // A context that never uploaded is gated regardless of the flag's history.
  assert.equal(detachedGeometryUploadPending(geometry, rendererC), true);
  assert.equal(detachedGeometryUploadPending(geometry, rendererA), false);

  loader.dispose();
});
