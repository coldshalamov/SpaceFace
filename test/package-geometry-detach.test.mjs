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
import { touchSubjectOnExactTarget } from '../src/render/openingGpuAdmission.js';
import {
  claimSharedImageTexture,
  resetImageSourceDedupeForTests,
  restoreSharedCompressedMips,
  sharedImageTextureFor,
} from '../src/render/imageSourceDedupe.js';
import {
  createPackageDetachManifest,
  assertPackageGeometryRefillReady,
  detachPackageGeometry,
  detachPackageTexture,
  detachedGeometryUploadPending,
  detachedPresentedDrawBlocked,
  isPackageGeometryDetached,
  isPackageTextureDetached,
  noteGeometryGpuResident,
  noteOrientationDetachedHold,
  packageDetachDiagnostics,
  packageGeometryUploadDiagnostics,
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

function decodedPairFixture({ secondColorLength = 9 } = {}) {
  const first = decodedFixture();
  const second = decodedFixture();
  second.geometry.setAttribute('color', new THREE.Float32BufferAttribute(
    new Float32Array(secondColorLength), 3,
  ));
  second.scene.children[0].name = 'SecondHull';
  second.scene.children[0].userData = {};
  first.scene.add(second.scene.children[0]);
  return {
    scene: first.scene,
    geometry: first.geometry,
    secondGeometry: second.geometry,
    material: first.material,
  };
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

test('a preview loader cannot retire a live same-hash package generation', async () => {
  resetPackageDetachManifestsForTests();
  const metadata = packageMetadata('fixture.same-hash-generation');
  const decodedA = decodedFixture();
  const decodedARefill = decodedFixture();
  const decodedB = decodedFixture();
  let decodesA = 0;
  const residencyA = createAssetResidencyRegistry();
  const residencyB = createAssetResidencyRegistry();
  // This test deliberately uses two real loaders and registries. freshLoader() resets the global
  // manifest table, which would hide the cross-loader retirement race this covers.
  const loaderA = createRenderPackageLoader({
    residency: residencyA,
    loadGlb: async () => (decodesA++ === 0 ? decodedA : decodedARefill),
  });
  const loaderB = createRenderPackageLoader({
    residency: residencyB,
    loadGlb: async () => decodedB,
  });

  const loadedA = await loaderA.load(metadata, { baseUrl: 'https://fixtures.test/' });
  const liveInstance = loadedA.createInstance();
  await loaderB.load(metadata, { baseUrl: 'https://fixtures.test/' });
  assert.notEqual(
    decodedA.geometry.userData.spacefaceCpuDetach.manifestId,
    decodedB.geometry.userData.spacefaceCpuDetach.manifestId,
    'same bytes in separate registries receive separate generation marks',
  );

  const renderer = stubRenderer();
  assert.equal(detachPackageGeometry(decodedA.geometry, renderer), true);
  assert.equal(packageDetachDiagnostics().manifests, 2);

  loaderB.dispose('preview-closed');
  assert.equal(packageDetachDiagnostics().manifests, 1,
    'preview retirement drops only its own generation manifest');
  assert.equal(isPackageGeometryDetached(decodedA.geometry), true,
    'the live mounted generation remains detached');
  assert.equal(detachedGeometryUploadPending(decodedA.geometry, renderer), false,
    'the live renderer residency stamp remains valid');

  noteOrientationDetachedHold(renderer);
  assert.equal(detachedPresentedDrawBlocked(renderer, decodedA.geometry, decodedA.material), true,
    'the draw guard still protects the live detached generation');
  const refill = presentedDetachRehydrateInFlight();
  assert.ok(refill, 'the live generation remains refillable after preview disposal');
  await refill;
  assert.equal(isPackageGeometryDetached(decodedA.geometry), false,
    'the live generation refills from its own immutable decode');
  assert.ok(decodedA.geometry.getAttribute('normal').array.byteLength > 0,
    'refill restores the released attribute bytes');
  assert.equal(detachedPresentedDrawBlocked(renderer, decodedA.geometry, decodedA.material), false,
    'the draw guard clears after the live generation refills');

  loaderA.dispose('runtime-retired');
  assert.equal(packageDetachDiagnostics().manifests, 1,
    'disposing the loader keeps the exact manifest while its instance is still live');
  liveInstance.dispose('flight-unmounted');
  assert.equal(packageDetachDiagnostics().manifests, 0,
    'final residency retirement releases the last generation manifest');
});

test('reentrant residency retirement rejects the load without an orphan detach manifest', async () => {
  resetPackageDetachManifestsForTests();
  const decoded = decodedFixture();
  let registry = null;
  let retired = false;
  registry = createAssetResidencyRegistry({
    onEvent(event) {
      if (event.type !== 'asset-retained' || retired) return;
      retired = true;
      registry.disposeAll('reentrant-runtime-retirement');
    },
  });
  const loader = freshLoader(async () => decoded, registry);

  await assert.rejects(
    loader.load(packageMetadata('fixture.reentrant-retirement'), { baseUrl: 'https://fixtures.test/' }),
    'a synchronous registry retirement after commit rejects the dead generation',
  );
  assert.equal(retired, true, 'the regression exercised the real asset-retained event');
  assert.equal(packageDetachDiagnostics().manifests, 0,
    'an evicted decode cannot leave a manifest after its registry entry is gone');

  loader.dispose('post-reentrant-cleanup');
  assert.equal(packageDetachDiagnostics().manifests, 0,
    'loader disposal remains idempotent after the cache entry was evicted');
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
  assert.deepEqual(assertPackageGeometryRefillReady([geometry], receipt), {
    ready: true,
    restoredGeometries: 1,
    unrelatedEvidence: { geometryMismatches: [], errors: [] },
  }, 'an exact shape donor clears the admission gate normally');
  assert.ok(decoded.sharedBuffer.version > bufferVersionAfterDetach,
    'refilled buffers version-bump so live records re-upload real bytes');
  loader.dispose();
});

test('an unrelated LOD donor mismatch remains evidence without blocking the requested geometry', async () => {
  const original = decodedPairFixture();
  const changedDonor = decodedPairFixture({ secondColorLength: 12 });
  let decodes = 0;
  const loader = freshLoader(async () => (++decodes === 1 ? original : changedDonor));
  await loader.load(packageMetadata('fixture.unrelated-lod-mismatch'), { baseUrl: 'https://fixtures.test/' });
  const requested = original.geometry;
  const unrelated = original.secondGeometry;
  const renderer = stubRenderer();

  assert.equal(detachPackageGeometry(requested, renderer), true);
  assert.equal(detachPackageGeometry(unrelated, renderer), true);
  const receipt = await rehydrateDetachedGeometries([requested], { yieldToMain: async () => {} });
  assert.equal(receipt.geometries, 1, 'the requested source geometry refilled');
  assert.equal(isPackageGeometryDetached(requested), false);
  assert.equal(isPackageGeometryDetached(unrelated), true, 'the unrelated incompatible LOD stays detached');
  assert.equal(receipt.geometryMismatches.length, 1);
  assert.equal(receipt.geometryMismatches[0].geometryOrdinal, unrelated.userData.spacefaceCpuDetach.ordinal);

  const readiness = assertPackageGeometryRefillReady([requested], receipt);
  assert.equal(readiness.ready, true, 'a mismatch in another LOD does not refuse valid requested buffers');
  assert.equal(readiness.unrelatedEvidence.geometryMismatches.length, 1,
    'unrelated package mismatch evidence remains available to diagnostics');
  assert.equal(readiness.unrelatedEvidence.geometryMismatches[0].assetId, 'fixture.unrelated-lod-mismatch');
  loader.dispose();
});

test('rehydrate rejects an ordinal donor with a resized non-position attribute', async () => {
  const original = decodedFixture();
  original.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(3 * 3), 3));
  const changedDonor = decodedFixture();
  changedDonor.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(4 * 3), 3));
  let decodes = 0;
  const loader = freshLoader(async () => (++decodes === 1 ? original : changedDonor));
  await loader.load(packageMetadata('fixture.resized-donor'), { baseUrl: 'https://fixtures.test/' });
  const geometry = original.geometry;
  const color = geometry.getAttribute('color');
  const renderer = stubRenderer();

  detachPackageGeometry(geometry, renderer);
  assert.equal(color.array.length, 0, 'the non-position CPU array was released');
  const mismatchesBefore = packageDetachDiagnostics().mismatches;
  const receipt = await rehydrateDetachedGeometries([geometry], { yieldToMain: async () => {} });

  assert.equal(receipt.geometries, 0, 'a donor with incompatible attribute length is not installed');
  assert.equal(packageDetachDiagnostics().mismatches, mismatchesBefore + 1);
  assert.equal(receipt.geometryMismatches.length, 1);
  assert.equal(receipt.geometryMismatches[0].assetId, 'fixture.resized-donor');
  assert.equal(receipt.geometryMismatches[0].geometryOrdinal, 0);
  assert.equal(receipt.geometryMismatches[0].expected.bufferShapes.color.length, 9);
  assert.equal(receipt.geometryMismatches[0].actual.bufferShapes.color.length, 12);
  assert.equal(receipt.geometryMismatches[0].assetId, 'fixture.resized-donor');
  assert.equal(color.array.length, 0, 'the released BufferAttribute identity is not resized under its old GPU record');
  assert.equal(isPackageGeometryDetached(geometry), true, 'the geometry remains draw-gated for a safe retry');
  assert.throws(() => assertPackageGeometryRefillReady([geometry], receipt), (error) => {
    assert.equal(error.code, 'SF_PACKAGE_GEOMETRY_REFILL_INCOMPLETE');
    assert.equal(error.geometryRefill.geometryMismatches[0].geometryOrdinal, 0);
    assert.equal(error.geometryRefill.geometryMismatches[0].expected.bufferShapes.color.byteLength, 36);
    assert.equal(error.geometryRefill.geometryMismatches[0].actual.bufferShapes.color.byteLength, 48);
    assert.equal(error.geometryRefill.unresolved[0].contentHash,
      geometry.userData.spacefaceCpuDetach.contentHash);
    assert.equal(error.geometryRefill.unresolved[0].current.bufferShapes.color.length, 0);
    return true;
  }, 'exact-target admission must not render or admit a geometry whose CPU refill did not complete');
  loader.dispose();
});

test('exact-target geometry diagnostics name a live resized attribute even after detach clears', async () => {
  const decoded = decodedFixture();
  decoded.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  const loader = freshLoader(async () => decoded);
  await loader.load(packageMetadata('fixture.live-buffer-diagnostic'), { baseUrl: 'https://fixtures.test/' });
  const color = decoded.geometry.getAttribute('color');
  color.array = new Float32Array(12);
  color.needsUpdate = true;

  assert.equal(isPackageGeometryDetached(decoded.geometry), false,
    'the captured resize is outside the CPU-detached state');
  const diagnostic = packageGeometryUploadDiagnostics([decoded.geometry]);
  assert.equal(diagnostic.total, 1);
  assert.equal(diagnostic.rows[0].manifestShapeMatches, false);
  assert.equal(diagnostic.rows[0].mark.assetId, 'fixture.live-buffer-diagnostic');
  assert.equal(diagnostic.rows[0].expected.bufferShapes.color.byteLength, 36);
  assert.equal(diagnostic.rows[0].current.bufferShapes.color.byteLength, 48);
  assert.equal(diagnostic.rows[0].currentAttributes.color.version, color.version);
  loader.dispose();
});

test('rehydrate rejects a same-count ordinal donor with a different index type', async () => {
  const original = decodedFixture();
  const changedDonor = decodedFixture();
  changedDonor.geometry.setIndex(new THREE.Uint32BufferAttribute(new Uint32Array([0, 1, 2]), 1));
  let decodes = 0;
  const loader = freshLoader(async () => (++decodes === 1 ? original : changedDonor));
  await loader.load(packageMetadata('fixture.index-type-drift'), { baseUrl: 'https://fixtures.test/' });
  const geometry = original.geometry;

  detachPackageGeometry(geometry, stubRenderer());
  const receipt = await rehydrateDetachedGeometries([geometry], { yieldToMain: async () => {} });

  assert.equal(receipt.geometries, 0, 'same index count does not make a differently typed donor compatible');
  assert.equal(receipt.geometryMismatches.length, 1);
  assert.equal(receipt.geometryMismatches[0].assetId, 'fixture.index-type-drift');
  assert.equal(receipt.geometryMismatches[0].geometryOrdinal, 0);
  assert.equal(receipt.geometryMismatches[0].expected.indexShape.arrayType, 'Uint16Array');
  assert.equal(receipt.geometryMismatches[0].actual.indexShape.arrayType, 'Uint32Array');
  assert.equal(isPackageGeometryDetached(geometry), true, 'an incompatible source remains draw-gated');
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
  assert.match(bloom, /preparePresentedDraw\(renderer, geometry, material\)/);
  assert.match(bloom, /queuePresentedDetachRehydrate\(renderer\)/);
  assert.match(bloom, /const orientationHold = orientationDetachedHoldActive\(renderer\)/);
  assert.match(bloom, /if \(!orientationHold && unreadyProgramsPending !== true/);
  assert.match(bloom, /orientationHoldHidesDrawable\(renderer, object\)/);
  assert.match(rendererSrc, /this\._drawBufferAspectClass = aspectClassFromSize\(_drawSize\)/);
  assert.match(
    rendererSrc,
    /_applySize\(\) \{[\s\S]*?noteOrientationDetachedHold\(this\.renderer\);[\s\S]*?const drawSize = applyRendererSize\(this\.renderer, this\.state\)/,
    'the aspect hold arms before setSize, so the first phone rotation is not treated as the initial size',
  );
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

test('orientation hold hides a detached mesh after the readiness walk has gone steady', async () => {
  const decoded = decodedFixture();
  let decodes = 0;
  const loader = freshLoader(async () => {
    decodes += 1;
    return decodes === 1 ? decoded : decodedFixture();
  });
  await loader.load(packageMetadata('fixture.orientation-hide'), { baseUrl: 'https://fixtures.test/' });
  const geometry = decoded.geometry;
  const hull = decoded.scene.children[0];
  const prop = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  prop.name = 'LooseProp';
  decoded.scene.add(prop);
  const readyProgram = { isReady() { return true; }, program: { id: 1 } };
  const renderer = {
    properties: { get() { return { currentProgram: readyProgram }; } },
    info: { programs: [readyProgram] },
    getContext() { return null; },
  };
  const guard = createUnreadyDrawableGuard(renderer);
  assert.equal(detachPackageGeometry(geometry, renderer), true);
  assert.equal(geometry.getAttribute('normal').array.byteLength, 0);

  guard.hide(decoded.scene);
  guard.restore();
  assert.equal(hull.visible, true, 'a ready program does not hide the ship');
  guard.hide(decoded.scene);
  guard.restore();
  assert.equal(hull.visible, true, 'steady-state detached draws keep the live GPU copy');

  noteOrientationDetachedHold(renderer);
  guard.hide(decoded.scene);
  assert.equal(hull.visible, false, 'the first aspect flip hides the ship before projectObject uploads');
  assert.equal(prop.visible, true, 'an ordinary mesh stays on screen through the hold');
  guard.restore();
  assert.equal(hull.visible, true, 'the hide lasts one pass');

  const flight = presentedDetachRehydrateInFlight();
  assert.ok(flight, 'the hold starts one refill');
  await flight;
  assert.equal(isPackageGeometryDetached(geometry), false);
  assert.ok(geometry.getAttribute('normal').array.byteLength > 0, 'normal bytes restored');
  guard.hide(decoded.scene);
  guard.restore();
  assert.equal(hull.visible, true, 'the refill drops the hold and the ship draws again');
  prop.geometry.dispose();
  loader.dispose();
});

test('orientation hold journals and restores every detached mesh beyond the ordinary cap', async () => {
  const decoded = decodedFixture();
  const loader = freshLoader(async () => decoded);
  await loader.load(packageMetadata('fixture.orientation-cap'), { baseUrl: 'https://fixtures.test/' });
  const geometry = decoded.geometry;
  const meshes = [decoded.scene.children[0]];
  for (let i = 1; i < 513; i++) {
    const mesh = new THREE.Mesh(geometry, decoded.material);
    mesh.name = `DetachedMesh${i}`;
    decoded.scene.add(mesh);
    meshes.push(mesh);
  }
  const readyProgram = { isReady() { return true; }, program: { id: 1 } };
  const renderer = {
    properties: { get() { return { currentProgram: readyProgram }; } },
    info: { programs: [readyProgram] },
    getContext() { return null; },
  };
  const guard = createUnreadyDrawableGuard(renderer);
  assert.equal(detachPackageGeometry(geometry, renderer), true);
  noteOrientationDetachedHold(renderer);

  guard.hide(decoded.scene);
  assert.equal(meshes.length, 513);
  assert.equal(meshes.filter((mesh) => mesh.visible).length, 0,
    'the orientation hold hides every detached mesh, including the 513th');
  guard.restore();
  assert.equal(meshes.filter((mesh) => mesh.visible).length, 513,
    'restoration re-shows every journaled detached mesh');

  loader.dispose();
});

test('exact-target touch skips a detached mesh while the orientation hold is set', async () => {
  const decoded = decodedFixture();
  let decodes = 0;
  const loader = freshLoader(async () => {
    decodes += 1;
    return decodes === 1 ? decoded : decodedFixture();
  });
  await loader.load(packageMetadata('fixture.orientation-touch'), { baseUrl: 'https://fixtures.test/' });
  const geometry = decoded.geometry;
  const hull = decoded.scene.children[0];
  const prop = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  decoded.scene.add(prop);
  const scene = new THREE.Scene();
  scene.add(decoded.scene);
  assert.equal(detachPackageGeometry(geometry, {}), true);
  const seen = [];
  const renderer = {
    autoClear: true,
    setRenderTarget() {},
    getRenderTarget() { return null; },
    render() {
      seen.push({ hull: hull.visible, prop: prop.visible });
    },
  };
  const camera = new THREE.PerspectiveCamera();
  noteOrientationDetachedHold(renderer);
  touchSubjectOnExactTarget(renderer, null, hull, camera, scene);
  assert.deepEqual(seen, [{ hull: false, prop: false }],
    'the touch hides the released hull and leaves the rest of the scene undrawn');
  const flight = presentedDetachRehydrateInFlight();
  assert.ok(flight);
  await flight;
  assert.equal(hull.visible, true, 'the touch restores the hull after the draw');
  prop.geometry.dispose();
  loader.dispose();
});

test('exact-target touch does not draw a released mesh before the phone turns', async () => {
  const decoded = decodedFixture();
  const loader = freshLoader(async () => decoded);
  await loader.load(packageMetadata('fixture.touch-detached'), { baseUrl: 'https://fixtures.test/' });
  const hull = decoded.scene.children[0];
  const scene = new THREE.Scene();
  scene.add(decoded.scene);
  assert.equal(detachPackageGeometry(decoded.geometry, {}), true);
  const seen = [];
  const renderer = {
    autoClear: true,
    setRenderTarget() {},
    getRenderTarget() { return null; },
    render() { seen.push(hull.visible); },
  };
  touchSubjectOnExactTarget(renderer, null, hull, new THREE.PerspectiveCamera(), scene);
  assert.deepEqual(seen, [false], 'a released hull is hidden for the admission draw');
  assert.equal(hull.visible, true, 'the hull is visible again for the presented frame');
  assert.equal(presentedDetachRehydrateInFlight(), null, 'a steady released hull does not decode the fleet');
  loader.dispose();
});

test('an emptied shared atlas borrows the sibling mip chain before upload', () => {
  resetImageSourceDedupeForTests();
  const owner = new THREE.CompressedTexture([{ data: new Uint8Array(16), width: 4, height: 4 }], 4, 4);
  owner.name = 'forge_panel_albedo';
  claimSharedImageTexture('fixture-panel-albedo', owner);
  const sibling = sharedImageTextureFor('fixture-panel-albedo');
  assert.ok(sibling);
  assert.ok(sibling.mipmaps.length > 0);
  owner.mipmaps = [];
  assert.equal(restoreSharedCompressedMips(owner), true);
  assert.ok(owner.mipmaps.length > 0);
  assert.equal(owner.mipmaps[0].width, 4);
  sibling.dispose();
  owner.dispose();
});
