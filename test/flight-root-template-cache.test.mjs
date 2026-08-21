import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runFlightKestrelTemplatePackageProbe,
  runFlightRootTemplateCacheProbe,
} from '../src/render/partsLibrary.js';

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
    reboundHooks: true,
    geometryDisposedOnce: true,
  });
});

test('Kestrel package-path template hits rehydrate bindings and close ownership', () => {
  assert.deepEqual(runFlightKestrelTemplatePackageProbe(), {
    firstBuilt: true,
    secondCacheHit: true,
    packageRehydrated: true,
    bindingsRebound: true,
    visibleParity: true,
    packageCreates: true,
    packageDisposals: true,
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
