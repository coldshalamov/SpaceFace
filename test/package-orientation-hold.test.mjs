import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createPackageDetachManifest,
  detachPackageGeometry,
  detachPackageTexture,
  isPackageGeometryDetached,
  noteOrientationDetachedHold,
  orientationDetachedHoldActive,
  presentedDetachRehydrateInFlight,
  queuePresentedDetachRehydrate,
  rehydrateDetachedPackages,
  resetPackageDetachManifestsForTests,
} from '../src/render/packageCpuDetach.js';

function detachedPackage(id, wait = null) {
  const geometry = new THREE.BoxGeometry();
  const texture = new THREE.DataTexture(new Uint8Array([20, 40, 60, 255]), 1, 1);
  texture.needsUpdate = true;
  const freshGeometry = geometry.clone();
  const freshTexture = new THREE.DataTexture(new Uint8Array([20, 40, 60, 255]), 1, 1);
  let decodes = 0;
  createPackageDetachManifest({ contentHash: id, assetId: id, resources: [geometry, texture] }, {
    redecode: async () => {
      decodes++;
      if (wait) await wait;
      return { resources: [freshGeometry, freshTexture] };
    },
    collectResources: value => value.resources,
  });
  assert.equal(detachPackageGeometry(geometry), true);
  assert.equal(detachPackageTexture(texture), true);
  return { geometry, texture, resources: { geometries: [geometry], textures: [texture] },
    decodes: () => decodes };
}

test('orientation refills the actual scene without waiting for an unrelated detached package', async () => {
  resetPackageDetachManifestsForTests();
  let releaseUnrelated;
  const wait = new Promise(resolve => { releaseUnrelated = resolve; });
  const unrelated = detachedPackage('cached-preview', wait);
  const current = detachedPackage('presented-hull');
  const renderer = {};
  try {
    noteOrientationDetachedHold(renderer, current.resources);
    const refill = queuePresentedDetachRehydrate(renderer, current.resources);
    await new Promise(setImmediate);
    assert.equal(orientationDetachedHoldActive(renderer), false,
      'a nonpresented cached decoder cannot park the current picture');
    await refill;
    assert.equal(current.decodes(), 1);
    assert.equal(unrelated.decodes(), 0);
    assert.equal(isPackageGeometryDetached(current.geometry), false);
    assert.equal(isPackageGeometryDetached(unrelated.geometry), true);
    // Context recovery still restores the complete registry, including that cached package.
    releaseUnrelated();
    const global = await rehydrateDetachedPackages();
    assert.equal(global.packages, 1);
    assert.equal(unrelated.decodes(), 1);
  } finally {
    releaseUnrelated();
    await presentedDetachRehydrateInFlight();
    resetPackageDetachManifestsForTests();
  }
});

test('concurrent orientation resource cohorts share one serial refill and exclude unrequested packages', async () => {
  resetPackageDetachManifestsForTests();
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const first = detachedPackage('flight-scene', wait);
  const second = detachedPackage('visible-preview');
  const unrelated = detachedPackage('cached-offscreen');
  const a = {}, b = {};
  try {
    noteOrientationDetachedHold(a, first.resources);
    const refill = presentedDetachRehydrateInFlight();
    await Promise.resolve();
    noteOrientationDetachedHold(b, second.resources);
    assert.equal(presentedDetachRehydrateInFlight(), refill);
    assert.equal(second.decodes(), 0, 'joining cannot start a parallel package decode');
    release();
    await refill;
    assert.equal(first.decodes(), 1);
    assert.equal(second.decodes(), 1);
    assert.equal(unrelated.decodes(), 0);
    assert.equal(orientationDetachedHoldActive(a), false);
    assert.equal(orientationDetachedHoldActive(b), false);
  } finally {
    release();
    await presentedDetachRehydrateInFlight();
    resetPackageDetachManifestsForTests();
  }
});

test('a shared texture clone and scene geometry select their one live package generation', async () => {
  resetPackageDetachManifestsForTests();
  const current = detachedPackage('shared-scene-package');
  const clone = current.texture.clone();
  const renderer = {};
  try {
    noteOrientationDetachedHold(renderer, { geometries: [], textures: [clone] });
    await presentedDetachRehydrateInFlight();
    assert.equal(current.decodes(), 1, 'a copied material mark selects its actual shared-source package');
    assert.equal(clone.source, current.texture.source);
    assert.equal(clone.source.data.data.length, 4, 'the shared canonical Source has its real payload again');
    assert.ok(current.geometry.attributes.normal.array.length > 0);
  } finally { resetPackageDetachManifestsForTests(); }
});

test('a cohort joining the settlement of an empty refill is not published ready without its bytes', async () => {
  resetPackageDetachManifestsForTests();
  const current = detachedPackage('late-visible-scene');
  const a = {}, b = {};
  try {
    noteOrientationDetachedHold(a, { geometries: [], textures: [] });
    const refill = presentedDetachRehydrateInFlight();
    await Promise.resolve();
    noteOrientationDetachedHold(b, current.resources);
    await refill;
    assert.equal(current.decodes(), 1);
    assert.equal(isPackageGeometryDetached(current.geometry), false);
    assert.equal(orientationDetachedHoldActive(b), false);
  } finally {
    await presentedDetachRehydrateInFlight();
    resetPackageDetachManifestsForTests();
  }
});

test('every renderer sharing a graphics refill resumes after it settles', async () => {
  resetPackageDetachManifestsForTests();
  const flightRenderer = {};
  const previewRenderer = {};
  noteOrientationDetachedHold(flightRenderer);
  const refill = presentedDetachRehydrateInFlight();
  noteOrientationDetachedHold(previewRenderer);
  assert.equal(presentedDetachRehydrateInFlight(), refill, 'both views share one decode');
  assert.equal(orientationDetachedHoldActive(flightRenderer), true);
  assert.equal(orientationDetachedHoldActive(previewRenderer), true);
  await refill;
  assert.equal(orientationDetachedHoldActive(flightRenderer), false);
  assert.equal(orientationDetachedHoldActive(previewRenderer), false);

  // An ordinary draw can initiate the shared refill before either view rotates.
  const nextRefill = queuePresentedDetachRehydrate();
  noteOrientationDetachedHold(previewRenderer);
  assert.equal(presentedDetachRehydrateInFlight(), nextRefill);
  await nextRefill;
  assert.equal(orientationDetachedHoldActive(previewRenderer), false);
  assert.equal(presentedDetachRehydrateInFlight(), null);
});
