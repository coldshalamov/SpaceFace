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
import { createUnreadyDrawableGuard } from '../src/render/bloom.js';
import {
  createPackageDetachManifest,
  detachPackageGeometry,
  detachPackageTexture,
  detachedGeometryUploadPending,
  detachedPresentedDrawBlocked,
  isPackageGeometryDetached,
  isPackageTextureDetached,
  noteGeometryGpuResident,
  noteOrientationDetachedHold,
  packageDetachDiagnostics,
  presentedDetachRehydrateInFlight,
  rehydrateDetachedGeometries,
  resetPackageDetachManifestsForTests,
} from '../src/render/packageCpuDetach.js';

const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function packageMetadata(assetId = 'fixture.detach-geometry') {
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

function semanticLocator(rawNodeName, recordIds) {
  return {
    [RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY]: {
      schema: RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA,
      recordIds,
      rawNodeName,
    },
  };
}

// A decoded fixture with a GLTF-style interleaved geometry: position(3) + normal(3) + uv(2)
// sharing ONE InterleavedBuffer, plus a standalone index — the package census shape (F2 §2).
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
  material.name = 'HullMaterial';
  const root = new THREE.Group();
  const hull = new THREE.Mesh(geometry, material);
  hull.name = 'Hull';
  hull.userData = semanticLocator('Hull', ['fixture.body']);
  root.add(hull);
  return { scene: root, geometry, material, sharedBuffer };
}

function stubRenderer() {
  return { initTexture() {}, properties: new Map() };
}

function freshLoader(loadGlb, residency = createAssetResidencyRegistry()) {
  resetPackageDetachManifestsForTests();
  return createRenderPackageLoader({ residency, loadGlb });
}

test('mark time deinterleaves position, caches bounds, and pairs ordinals by identity', async () => {
  const decoded = decodedFixture();
  const loader = freshLoader(async () => decoded);
  await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });

  const mark = decoded.geometry.userData.spacefaceCpuDetach;
  assert.equal(mark.schema, 'spaceface.cpuDetach.v1');
  assert.equal(mark.kind, 'geometry');
  assert.equal(mark.ordinal, 0);
  // Position left the shared interleaved buffer as a standalone BufferAttribute with the
  // same stride-copied slice; the sibling attrs still share the original buffer.
  const position = decoded.geometry.getAttribute('position');
  assert.equal(position.isInterleavedBufferAttribute !== true, true, 'position deinterleaved');
  assert.equal(position.count, 3);
  assert.equal(position.itemSize, 3);
  assert.deepEqual([...position.array], [0, 0, 0, 1, 0, 0, 0, 1, 0], 'position slice kept its values');
  assert.equal(decoded.geometry.getAttribute('normal').data, decoded.sharedBuffer);
  assert.ok(decoded.geometry.boundingSphere, 'bounds cached at mark for post-detach culls');
  assert.ok(decoded.geometry.boundingBox, 'bounding box cached at mark');
  loader.dispose();
});

test('detach empties released buffers once, keeps position and index, rejects clones', async () => {
  const decoded = decodedFixture();
  const loader = freshLoader(async () => decoded);
  await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  const geometry = decoded.geometry;
  const renderer = stubRenderer();

  assert.equal(detachPackageGeometry(geometry, renderer), true);
  assert.equal(isPackageGeometryDetached(geometry), true);
  // The shared interleaved array is an empty same-constructor array (never null), released once.
  assert.equal(decoded.sharedBuffer.array.byteLength, 0);
  assert.equal(decoded.sharedBuffer.array.constructor, Float32Array);
  assert.equal(geometry.getAttribute('position').array.byteLength, 36, 'position kept');
  assert.equal(geometry.index.array.byteLength, 6, 'index kept');
  // WeakSet dedupe: normal+uv share the buffer — freedBytes counts the array once, not per attr.
  const diag = packageDetachDiagnostics();
  assert.equal(diag.detachedGeometries, 1);
  assert.equal(diag.detachedGeometryBytes, 3 * 8 * 4, 'one shared interleaved buffer counted once');
  // Clone identity-reject: a copy carrying the copied mark is not the manifest's geometry.
  const clone = geometry.clone();
  assert.equal(isPackageGeometryDetached(clone), false);
  assert.equal(detachPackageGeometry(clone, renderer), false);
  loader.dispose();
});

test('the pending gate covers version bumps, dead records, and un-uploaded renderers', async () => {
  const decoded = decodedFixture();
  const loader = freshLoader(async () => decoded);
  await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  const geometry = decoded.geometry;
  const resident = stubRenderer();
  const foreign = stubRenderer();

  detachPackageGeometry(geometry, resident);
  assert.equal(detachedGeometryUploadPending(geometry, resident), false,
    'the renderer whose upload proved residency stays clear');
  assert.equal(detachedGeometryUploadPending(geometry, foreign), true,
    'a context that never uploaded post-detach state pends');
  noteGeometryGpuResident(geometry, foreign);
  assert.equal(detachedGeometryUploadPending(geometry, foreign), false,
    'noted compile/upload clears the ledger');

  // needsUpdate on any attr sharing the released buffer bumps its version → re-upload pending.
  geometry.getAttribute('normal').needsUpdate = true;
  assert.equal(detachedGeometryUploadPending(geometry, resident), true, 'moved version pends');

  // dispose() drops the renderer's attribute records → the next bind re-uploads.
  geometry.dispatchEvent({ type: 'dispose' });
  assert.equal(detachedGeometryUploadPending(geometry, resident), true, 'dead records pend');
  // Unmarked / attached geometry never pends.
  assert.equal(detachedGeometryUploadPending(new THREE.BufferGeometry(), resident), false);
  loader.dispose();
});

test('rehydrate refills released arrays from an ordinal-paired donor and bumps versions', async () => {
  const decoded = decodedFixture();
  let decodes = 0;
  const loader = freshLoader(async () => {
    decodes += 1;
    // A real re-decode produces a fresh parse with real arrays — mirror that, not the emptied one.
    return decodes === 1 ? decoded : decodedFixture();
  });
  await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  const geometry = decoded.geometry;
  const renderer = stubRenderer();

  detachPackageGeometry(geometry, renderer);
  const bufferVersionAfterDetach = decoded.sharedBuffer.version;
  assert.equal(decoded.sharedBuffer.array.byteLength, 0);

  const receipt = await rehydrateDetachedGeometries([geometry], { yieldToMain: async () => {} });
  assert.equal(receipt.packages, 1);
  assert.equal(receipt.geometries, 1);
  assert.equal(decodes, 2, 'one immutable re-decode refilled the manifest');
  assert.equal(decoded.sharedBuffer.array.byteLength, 3 * 8 * 4, 'interleaved array refilled');
  assert.equal(isPackageGeometryDetached(geometry), false);
  assert.ok(decoded.sharedBuffer.version > bufferVersionAfterDetach,
    'refilled buffers version-bump so live records re-upload real bytes');
  loader.dispose();
});

test('Mesh.raycast still intersects detached marked geometry (position+index kept)', async () => {
  const decoded = decodedFixture();
  const loader = freshLoader(async () => decoded);
  const loaded = await loader.load(packageMetadata(), { baseUrl: 'https://fixtures.test/' });
  detachPackageGeometry(decoded.geometry, stubRenderer());
  assert.equal(isPackageGeometryDetached(decoded.geometry), true);

  const mesh = loaded.createInstance().root.children.find((node) => node.isMesh);
  const raycaster = new THREE.Raycaster(new THREE.Vector3(0.25, 0.25, 1), new THREE.Vector3(0, 0, -1));
  const hits = [];
  mesh.raycast(raycaster, hits);
  assert.ok(hits.length > 0, 'raycast computes intersections on kept position/index');
  loader.dispose();
});

test('vendored-three contract: empty same-ctor arrays and shared-buffer version semantics hold', () => {
  const ib = new THREE.InterleavedBuffer(new Float32Array(24), 8);
  const a = new THREE.InterleavedBufferAttribute(ib, 3, 0);
  const b = new THREE.InterleavedBufferAttribute(ib, 2, 6);
  assert.equal(a.data, b.data, 'sibling interleaved attrs share the version-bearing buffer');
  const v = ib.version;
  a.needsUpdate = true;
  assert.equal(ib.version, v + 1, 'attr needsUpdate bumps the shared buffer version');
  ib.array = new ib.array.constructor(0);
  assert.equal(ib.array.byteLength, 0);
  assert.equal(ib.array.constructor, Float32Array);
  assert.equal(typeof ib.array.BYTES_PER_ELEMENT, 'number', 'itemSize reads stay intact');
});

test('source pins: every F2 gate/detach/ledger call site exists verbatim', () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const residency = read('src/render/startupGpuResidency.js');
  assert.match(residency, /noteGeometryGpuResident\(geometry, renderer\);\s*detachPackageGeometry\(geometry, renderer\);/,
    'post-stamp ledger+detach in the residency receipt');
  assert.equal(residency.match(/detachPackageGeometry\(geometry\);/g).length, 2,
    'stamped-skip detach retries in both work-item mints');
  assert.equal(residency.match(/detachPackageGeometry\(object\.geometry\);/g).length, 2,
    'stamped-skip detach retries in both instanced collectors');
  const admission = read('src/render/openingGpuAdmission.js');
  assert.equal(
    admission.match(/await reattachDetachedAdmissionGeometries\(ordered, options\.renderer, yieldToMain\);/g).length,
    2, 'geometry reattach invoked beside both texture reattach sites');
  const rendererSrc = read('src/render/renderer.js');
  assert.match(rendererSrc, /await reattachDetachedSubjectGeometries\(subject\);/);
  assert.match(rendererSrc, /await reattachDetachedSubjectGeometries\(this\.scene\);/);
  assert.match(rendererSrc, /await reattachDetachedSubjectGeometries\(units\.programSubjects\);/);
  assert.match(rendererSrc, /await rehydrateDetachedGeometries\(detachedPendingGeometry, { yieldToMain: admissionPaceYield }\);/,
    'exact-target seam rehydrates pending geometry before the touch');
  const preview = read('src/ui/shipPreviewMount.js');
  assert.match(preview, /detachedGeometryUploadPending\(geometry, renderer\)/);
  assert.match(preview, /armGeometryGpuResidentLedger\(drawable\);/,
    'post-draw arm replaces the compile-time ledger (W140-D1)');
  assert.match(preview, /dropGeometryGpuResidencyLedger\(renderer\);/,
    'context restore clears the stale uploadedOn stamps (W140-G4)');
  const spanner = read('src/ui/orrery/pipSpannerPreview.js');
  assert.match(spanner, /detachedGeometryUploadPending\(geometry, renderer\)/);
  assert.match(spanner, /armGeometryGpuResidentLedger\(drawable\);/);
  const asteroid = read('src/ui/asteroid/asteroidRenderer3d.js');
  assert.match(asteroid, /detachedGeometryUploadPending\(geometry, renderer\)/);
  assert.match(asteroid, /armGeometryGpuResidentLedger\(drawable\);/);
  assert.match(asteroid, /dropGeometryGpuResidencyLedger\(renderer\);/);
  const bloom = read('src/render/bloom.js');
  assert.match(bloom, /detachedPresentedDrawBlocked\(renderer, geometry, material\)/);
  assert.match(bloom, /queuePresentedDetachRehydrate\(renderer\)/);
  assert.match(rendererSrc, /noteOrientationDetachedHold\(this\.renderer\)/);
});

test('presented draw skips a detached upload and refills before the next one', async () => {
  const decoded = decodedFixture();
  const compressed = new THREE.CompressedTexture(
    [{ data: new Uint8Array(64), width: 4, height: 4 }],
    4, 4, THREE.RGBAFormat,
  );
  compressed.name = 'HullKtx2';
  decoded.material.map = compressed;
  let decodes = 0;
  const loader = freshLoader(async () => {
    decodes += 1;
    if (decodes === 1) return decoded;
    const fresh = decodedFixture();
    const freshMap = new THREE.CompressedTexture(
      [{ data: new Uint8Array(64), width: 4, height: 4 }],
      4, 4, THREE.RGBAFormat,
    );
    freshMap.name = 'HullKtx2';
    fresh.material.map = freshMap;
    return fresh;
  });
  await loader.load(packageMetadata('fixture.presented-draw'), { baseUrl: 'https://fixtures.test/' });
  const geometry = decoded.geometry;
  const material = decoded.material;
  let draws = 0;
  const renderer = {
    properties: new Map(),
    info: { programs: [] },
    renderBufferDirect() { draws += 1; },
  };
  renderer.properties.set(compressed, { __version: compressed.version });
  createUnreadyDrawableGuard(renderer);
  detachPackageGeometry(geometry, renderer);
  assert.equal(detachPackageTexture(compressed), true);
  assert.equal(geometry.getAttribute('normal').array.byteLength, 0);
  assert.equal(compressed.mipmaps.length, 0);
  assert.equal(detachedPresentedDrawBlocked(renderer, geometry, material), false,
    'a resident upload whose version still matches keeps drawing');
  renderer.renderBufferDirect(null, null, geometry, material, null, null);
  assert.equal(draws, 1);

  noteOrientationDetachedHold(renderer);
  assert.equal(detachedPresentedDrawBlocked(renderer, geometry, material), true);
  renderer.renderBufferDirect(null, null, geometry, material, null, null);
  assert.equal(draws, 1, 'aspect-flip hold skips the draw that would upload the empty mirror');
  const flight = presentedDetachRehydrateInFlight();
  assert.ok(flight, 'the skipped draw shares one refill');
  await flight;
  assert.equal(isPackageGeometryDetached(geometry), false);
  assert.equal(isPackageTextureDetached(compressed), false);
  assert.ok(geometry.getAttribute('normal').array.byteLength > 0, 'normal bytes restored');
  assert.ok(compressed.mipmaps.length > 0, 'compressed mip chain restored');
  assert.equal(detachedPresentedDrawBlocked(renderer, geometry, material), false);
  renderer.renderBufferDirect(null, null, geometry, material, null, null);
  assert.equal(draws, 2, 'the following frame draws the restored payload');
  loader.dispose();
});
