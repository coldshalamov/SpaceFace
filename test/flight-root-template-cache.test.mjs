import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runFlightKestrelTemplatePackageProbe,
  runFlightRootTemplateCacheProbe,
  collectFlightRootTemplateContextLossRoots,
} from '../src/render/partsLibrary.js';
import {
  createWebGlDisposeListenerProvenance,
  detachStaleWebGlDisposeListeners,
} from '../src/render/contextResourceLifecycle.js';

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
  assert.deepEqual(runFlightRootTemplateCacheProbe(), {
    distinctRoots: true,
    sharedGeometry: true,
    distinctMaterials: true,
    sharedBakeAliased: true,
    reboundHooks: true,
    geometryDisposedOnce: true,
  });
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
