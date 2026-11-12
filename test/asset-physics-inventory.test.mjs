import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  buildAssetPhysicsInventory,
  buildReleaseAssetInventory,
  loadAssetPhysicsSources,
  polygonPhysicsMetrics,
  selectReleaseAssetIds,
  selectAssetPhysicsShipIds,
} from '../scripts/lib/assetPhysicsInventory.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('uniform polygon metrics include centroid and origin-based yaw moment', () => {
  const metrics = polygonPhysicsMetrics([
    { x: -1, z: -1 },
    { x: 1, z: -1 },
    { x: 1, z: 1 },
    { x: -1, z: 1 },
  ], 2);
  assert.equal(metrics.vertexCount, 4);
  assert.equal(metrics.areaWu2, 16);
  assert.deepEqual(metrics.centroidWu, { x: 0, z: 0 });
  assert.equal(metrics.yawInertiaPerMassWu2, 8 / 3);
  assert.equal(polygonPhysicsMetrics([{ x: 0, z: 0 }, { x: 1, z: 1 }]), null);
});

test('canonical ship inventory joins measured proxy, derived mass, package identity, and stable shards', async () => {
  const { partsManifest, releaseManifest } = await loadAssetPhysicsSources(repoRoot);
  const inventory = buildAssetPhysicsInventory({
    partsManifest,
    releaseManifest,
    shipIds: ['ship_kestrel'],
  });
  const [row] = inventory.rows;
  assert.equal(row.shipId, 'ship_kestrel');
  assert.equal(row.physics.collisionProxy.measured, true);
  assert.equal(row.physics.collisionProxy.geometryKind, 'planarPolygon');
  assert.equal(row.physics.mass.defaultOperationalMass, 18);
  assert.ok(row.physics.yawInertia.geometricUniformAreaEstimate > 0);
  assert.ok(row.physics.yawInertia.derivedFlightModel > 0);
  assert.equal(row.renderSelection.wholeShip.assetIdentity.identityResolved, true);
  assert.ok(row.renderSelection.wholeShip.runtimePackage.expectedContentHash);
  assert.ok(row.sourceIdentity.modelTruth.sourceBounds);
  assert.deepEqual(inventory.summary.missingWholeShipIdentity, []);
  assert.equal(inventory.summary.catalogShipCount, 15);
  assert.deepEqual(selectAssetPhysicsShipIds(['a', 'b', 'c', 'd'], { shardIndex: 1, shardCount: 2 }), ['b', 'd']);
});

test('release inventory groups authored LODs and keeps decorative physics unknown', () => {
  const source = (name) => `assets/ships/parts/places/${name}.glb`;
  const release = (id, name) => ({
    id,
    kind: 'part:places',
    source: source(name),
    release: `assets/ships/release/parts/places/${name}.glb`,
    sourceSha256: 'source-hash',
    releaseSha256: 'release-hash',
    sourceBytes: 120,
    releaseBytes: 100,
  });
  const base = release('place_test_beacon', 'test_beacon');
  const lod1 = release('place_test_beacon_lod1', 'test_beacon_lod1');
  const pilot = {
    key: 'test-beacon', assetId: 'sf.render.test-beacon', runtimeAssetId: 'SF_TEST_BEACON',
    kind: 'place', slot: 'place', sourceUrl: base.release, sourceSha256: 'release-hash',
    expectedContentHash: 'expected-content', metadataUrl: 'package.json',
  };
  const sourceMetadataByPath = new Map([base, lod1].map((row) => [row.source, {
    glbJsonPresent: true,
    gltfVersion: '2.0',
    gltfAsset: { extras: { spacefaceAsset: { assetId: 'sf.render.test-beacon' } } },
    materialChannels: [{ index: 0, name: 'Paint', channels: ['baseColor', 'normal'] }],
    materialCount: 1, nodeCount: 1, meshCount: 1, primitiveCount: 1, animationCount: 0,
    lodTriangles: { lod0: 24, lod1: 0, lod2: 0 },
    releaseStatBytes: 100,
  }]));
  const inventory = buildReleaseAssetInventory({
    partsManifest: { parts: [{
      id: 'place_test_beacon', category: 'places', file: 'places/test_beacon.glb',
      lodFamily: { lod0: 'places/test_beacon.glb', lod1: 'places/test_beacon_lod1.glb' },
      bounds: { dimensionsM: [2, 3, 4] },
    }] },
    releaseManifest: { assets: [base, lod1] },
    modelTruthRows: [{ id: 'test-beacon', url: base.source, status: 'green', bounds: { size: [2, 3, 4] } }],
    packagePilotManifest: { pilots: [pilot] },
    runtimePilots: [pilot],
    flightStaticManifest: { packages: ['test-beacon'] },
    sourceMetadataByPath,
    packageMetadataBySource: new Map([[base.source, {
      metadataPresent: true, metadataContentHash: 'stale-content', metadataRuntimeHash: null,
      metadataRuntimeUrl: 'runtime.glb', metadataRuntimeSlot: 'place',
    }]]),
  });
  assert.equal(inventory.rows.length, 2);
  assert.equal(inventory.families.length, 1);
  assert.deepEqual(inventory.families[0].variants.map((item) => item.variant), ['lod0', 'lod1']);
  assert.equal(inventory.rows[0].physics.mass, null);
  assert.equal(inventory.rows[0].physics.centerOfMass, null);
  assert.equal(inventory.rows.find((row) => row.id === base.id).runtimePackageEligibility.status, 'indexed-package-hash-mismatch');
  assert.equal(inventory.rows.find((row) => row.id === lod1.id).runtimePackageEligibility.status, 'not-indexed');
  assert.equal(inventory.rows[0].playerReachability, 'not-established-by-asset-indices');
  assert.deepEqual(inventory.rows[0].sourceMetadata.materialChannels[0].channels, ['baseColor', 'normal']);
  assert.deepEqual(selectReleaseAssetIds([base, lod1], null, { index: 1, count: 2 }), [lod1.id]);
});

test('release inventory recognizes a canonical ship through its runtime-selected release path', () => {
  const inventory = buildReleaseAssetInventory({
    partsManifest: { parts: [] },
    releaseManifest: { assets: [{
      id: 'release-only-drifter', kind: 'part:wholeships',
      source: 'assets/ships/parts/wholeships/drifter_production_v1.glb',
      release: 'assets/ships/release/parts/wholeships/drifter_production_v1.glb',
      sourceSha256: 'source', releaseSha256: 'release', sourceBytes: 2, releaseBytes: 2,
    }] },
  });
  const [row] = inventory.rows;
  assert.equal(row.role, 'player-ship');
  assert.equal(row.physics.canonicalShipId, 'ship_drifter');
  assert.equal(row.playerReachability, 'not-established-by-asset-indices');
});
