import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authoredHullJobs,
  getFlightRootTemplateCacheDiagnostics,
  runFlightKestrelTemplatePackageProbe,
  runFlightRootTemplateCacheProbe,
  collectFlightRootTemplateContextLossRoots,
} from '../src/render/partsLibrary.js';
import {
  createWebGlDisposeListenerProvenance,
  detachStaleWebGlDisposeListeners,
} from '../src/render/contextResourceLifecycle.js';
import * as THREE from 'three';
import {
  createPackageDetachManifest,
  detachPackageGeometry,
  isPackageGeometryDetached,
  resetPackageDetachManifestsForTests,
} from '../src/render/packageCpuDetach.js';

if (!globalThis.document) {
  const context = {
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  globalThis.document = { createElement: () => ({ width: 256, height: 256, getContext: () => context }) };
}

test('flight root template hits reuse geometry but rebind per-instance state', () => {
  let retiredDuringHeldEviction = null;
  const result = runFlightRootTemplateCacheProbe((phase) => {
    if (phase === 'evicted-held') retiredDuringHeldEviction = getFlightRootTemplateCacheDiagnostics();
  });
  assert.deepEqual(result, {
    distinctRoots: true,
    sharedGeometry: true,
    distinctMaterials: true,
    sharedBakeAliased: true,
    reboundHooks: true,
    geometryDisposedOnce: true,
    geometryBytesEstimated: true,
    weightedBudgetEvictsOldest: true,
    weightedBudgetRetainsLiveInstance: true,
    cacheBudgetRespected: true,
    oversizeCandidateRejectedSafely: true,
  });
  assert.ok(retiredDuringHeldEviction?.retiredLiveEntries > 0,
    'an evicted template with live instances remains in the context-loss retirement set');
  assert.ok(retiredDuringHeldEviction.retiredInstanceRefs > 0,
    'the diagnostic counts instance references keeping an evicted template alive');
  assert.ok(retiredDuringHeldEviction.retiredGeometryBytes > 0,
    'the diagnostic accounts for geometry retained by evicted live templates');
});

for (const lossPhase of ['cached', 'evicted-held']) {
  test(`context loss detaches old listener from ${lossPhase} flight template before final eviction`, () => {
    let oldCalls = 0, currentCalls = 0, foreignCalls = 0;
    const oldListener = () => { oldCalls++; };
    const currentListener = () => { currentCalls++; };
    const foreignListener = () => { foreignCalls++; };
    let geometry;
    runFlightRootTemplateCacheProbe((phase, root, templateGeometry) => {
      if (phase === 'cached') {
        geometry = templateGeometry;
        geometry.addEventListener('dispose', oldListener);
        geometry.addEventListener('dispose', foreignListener);
      }
      if (phase === lossPhase) {
        const roots = collectFlightRootTemplateContextLossRoots();
        assert.ok(roots.includes(root), 'the loss walk can reach the still-owned template');
        const provenance = createWebGlDisposeListenerProvenance();
        provenance.geometries.add(oldListener);
        const receipt = detachStaleWebGlDisposeListeners(roots, provenance);
        assert.equal(receipt.listenersDetached, 1);
        geometry.addEventListener('dispose', currentListener);
      }
      if (phase === 'one-held') {
        assert.ok(collectFlightRootTemplateContextLossRoots().includes(root));
        assert.equal(currentCalls, 0, 'an outstanding instance prevents disposal');
      }
      if (phase === 'finalized') {
        assert.ok(!collectFlightRootTemplateContextLossRoots().includes(root));
      }
    });
    assert.equal(oldCalls, 0);
    assert.equal(currentCalls, 1, 'the restored generation keeps its disposer');
    assert.equal(foreignCalls, 1, 'unrelated listeners remain intact');
  });
}

test('Kestrel package-path template hits rehydrate bindings and close ownership', () => {
  assert.deepEqual(runFlightKestrelTemplatePackageProbe(), {
    firstBuilt: true,
    secondCacheHit: true,
    packageRehydrated: true,
    bindingsRebound: true,
    visibleParity: true,
    packageCreates: true,
    packageDisposals: true,
    abandonedCacheHitReleased: true,
    releaseWasIdempotent: true,
    mutableMaterialIsolation: true,
    closureIsolation: true,
    driveIsolation: true,
    damageIsolation: true,
    lodIsolation: true,
    disposeRebuildValid: true,
    templateDisposed: true,
    detachedCloneGeometryDisposed: true,
  });
});

test('authored whole-ship job metadata survives retired merged geometry without cloning it', () => {
  resetPackageDetachManifestsForTests();
  const geometry = new THREE.BoxGeometry(1, 0.6, 0.8);
  const material = new THREE.MeshStandardMaterial();
  createPackageDetachManifest({
    assetId: 'fixture.authored-hull-jobs',
    contentHash: 'authored-hull-jobs-fixture',
    resources: [geometry],
  }, {
    redecode: async () => new THREE.BoxGeometry(1, 0.6, 0.8),
    collectResources: (donor) => [donor],
  });
  assert.equal(detachPackageGeometry(geometry), true);
  assert.equal(isPackageGeometryDetached(geometry), true);
  assert.equal(geometry.attributes.normal.array.length, 0, 'the fixture has retired package normals');

  let cloneAttempts = 0;
  const originalClone = geometry.clone;
  geometry.clone = () => {
    cloneAttempts += 1;
    throw new Error('authored job name lookup must not clone retired package geometry');
  };
  try {
    const jobs = authoredHullJobs({ primitives: [
      { name: 'Kestrel_Frame', geometry, material, tags: {}, matrix: new THREE.Matrix4() },
      { name: 'Kestrel_Mining_Drill', geometry, material, tags: {}, matrix: new THREE.Matrix4() },
      { name: 'Kestrel_Drill_Module', geometry, material, tags: { instance: false }, matrix: new THREE.Matrix4() },
    ] });
    assert.deepEqual([...jobs], ['SOCKET_Mining_Front'],
      'a later drill name in a mergeable bucket and a nonmergeable fallback name both preserve the authored job');
    assert.equal(cloneAttempts, 0);
  } finally {
    geometry.clone = originalClone;
    material.dispose();
    geometry.dispose();
    resetPackageDetachManifestsForTests();
  }
});
