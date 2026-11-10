// D157 — first-picture provenance for packaged bodies and generated roots.
// The opening census reads `spacefaceRenderPackage`/producer stamps as the production
// boundary. Packaged bodies mounted through the flat-primitive path used to publish no
// boundary at all, and purely procedural roots (beacons, lane freighters, world drones)
// carried no package either — both read as unverified blocking roots and kept
// opening.plan parked on `missing-or-unverified-blocking-content-hash`.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  combineOpeningProducerCensuses,
  createOpeningProducerCensus,
} from '../src/render/openingSubmissionPlan.js';
import { ensureOpeningGeneratedScenarioPropPackage } from '../src/render/precompile.js';
import {
  createVisualFactory,
  instantiatePackagedPrimitives,
  invalidateVisualFactoryCaches,
} from '../src/render/visualFactory.js';

const PACKAGE_HASH = '06dd640aee4efe12f4ce6273afab3c88c815fecdebcefae9923a9a4df1f01df8';

function packagedRecord(overrides = {}) {
  return {
    assetId: 'SF_POD_CARGO_CONTAINER',
    renderPackage: {
      assetId: 'sf.render.pod-cargo-container',
      contentHash: PACKAGE_HASH,
    },
    primitives: [
      {
        name: 'pod_body',
        geometry: new THREE.BoxGeometry(1, 1, 1),
        material: new THREE.MeshStandardMaterial({ name: 'hull' }),
      },
      {
        name: 'pod_band',
        geometry: new THREE.CylinderGeometry(0.4, 0.4, 0.2, 8),
        material: new THREE.MeshStandardMaterial({ name: 'band' }),
      },
    ],
    ...overrides,
  };
}

function boundaryFor(root) {
  const census = createOpeningProducerCensus(root, { includeOffscreen: true });
  return census;
}

test('packaged primitive mounts publish the record\'s package boundary', () => {
  const holder = new THREE.Group();
  holder.name = 'payload_PackagedBody';
  instantiatePackagedPrimitives(packagedRecord(), holder);
  assert.deepEqual(holder.userData.spacefaceRenderPackage, {
    assetId: 'sf.render.pod-cargo-container',
    contentHash: PACKAGE_HASH,
  });
  const census = boundaryFor(holder);
  assert.equal(census.contentHashVerified, true);
  assert.match(census.contentHash, /^[0-9a-f]{64}$/);
});

test('a package-less record still mounts primitives but stays honestly unverified', () => {
  const holder = new THREE.Group();
  instantiatePackagedPrimitives(packagedRecord({
    renderPackage: null,
    assetId: 'places/custom_unmanifested',
  }), holder);
  assert.deepEqual(holder.userData.spacefaceRenderPackage, {
    assetId: 'places/custom_unmanifested',
    contentHash: null,
  });
  const census = boundaryFor(holder);
  assert.equal(census.contentHashVerified, false, 'identity without a hash must fail closed');
});

test('the packaged mount never overwrites a boundary the instance route already owns', () => {
  const holder = new THREE.Group();
  holder.userData.spacefaceRenderPackage = {
    assetId: 'sf.render.instance-owned',
    contentHash: 'b'.repeat(64),
  };
  instantiatePackagedPrimitives(packagedRecord(), holder);
  assert.equal(holder.userData.spacefaceRenderPackage.assetId, 'sf.render.instance-owned');
});

test('factory-built beacons carry the generated producer marker', () => {
  globalThis.__SF_VISUAL_FACTORY_THROW__ = true;
  try {
    const root = createVisualFactory().build({ id: 'tb', type: 'beacon', radius: 10, data: {} });
    assert.ok(root, 'beacon must build');
    assert.equal(root.userData.generatedVisualProducer, 'visual-factory-procedural');
    assert.equal(root.userData.kind, 'beacon');
  } finally {
    invalidateVisualFactoryCaches();
    delete globalThis.__SF_VISUAL_FACTORY_THROW__;
  }
});

test('a marked generated root earns a verified recipe boundary at census ensure', () => {
  globalThis.__SF_VISUAL_FACTORY_THROW__ = true;
  let root;
  try {
    root = createVisualFactory().build({ id: 'tb2', type: 'beacon', radius: 10, data: {} });
  } finally {
    invalidateVisualFactoryCaches();
    delete globalThis.__SF_VISUAL_FACTORY_THROW__;
  }
  const packageInfo = ensureOpeningGeneratedScenarioPropPackage(root);
  assert.ok(packageInfo, 'marked generated root must publish a package');
  assert.equal(packageInfo.producer, 'visual-factory-procedural');
  assert.equal(packageInfo.contentHashVerified, true);
  assert.match(packageInfo.contentHash, /^[0-9a-f]{64}$/);
  const combined = combineOpeningProducerCensuses([boundaryFor(root)]);
  assert.equal(combined.contentHashesVerified, true);
});

test('unmarked runtime geometry stays unprovenanced (no census-side blessing)', () => {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  assert.equal(ensureOpeningGeneratedScenarioPropPackage(root), null);
  const census = boundaryFor(root);
  assert.equal(census.contentHashVerified, false);
});
