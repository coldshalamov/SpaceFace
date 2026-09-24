import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createAssetResidencyRegistry } from '../src/render/assetResidency.js';

function seed(registry, key) {
  const tex = new THREE.DataTexture(
    new Uint8Array(16),
    2,
    2,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  registry.registerAsset(key, [tex], { cpuPackageBytes: 16 });
  registry.retain(key, { type: 'live-boundary', name: key }, {
    role: 'glass',
    presentationTier: 'R0_GLASS',
    sectorId: 'ceres',
  });
}

test('canonicalDiagnostics reuses the same object while residency is quiet', () => {
  const registry = createAssetResidencyRegistry({ maxGpuBytes: 1e12 });
  seed(registry, 'package:a');
  seed(registry, 'package:b');
  const first = registry.canonicalDiagnostics();
  const second = registry.canonicalDiagnostics();
  assert.equal(second, first, 'quiet republish must reuse the cached snapshot');
  assert.equal(first.residentAssets, 2);
  assert.equal(first.schema, 'spaceface.assetResidency.v2');
  assert.deepEqual(first.events, []);
});

test('canonicalDiagnostics rebuilds after retain/release mutation', () => {
  const registry = createAssetResidencyRegistry({ maxGpuBytes: 1e12 });
  seed(registry, 'package:a');
  const before = registry.canonicalDiagnostics();
  seed(registry, 'package:b');
  const afterRetain = registry.canonicalDiagnostics();
  assert.notEqual(afterRetain, before);
  assert.equal(afterRetain.residentAssets, before.residentAssets + 1);

  const owner = { type: 'live-boundary', name: 'solo' };
  const tex = new THREE.DataTexture(new Uint8Array(16), 2, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
  registry.registerAsset('package:c', [tex], { cpuPackageBytes: 16 });
  registry.retain('package:c', owner, { role: 'glass' });
  const mid = registry.canonicalDiagnostics();
  registry.release('package:c', owner, 'test-release');
  const afterRelease = registry.canonicalDiagnostics();
  assert.notEqual(afterRelease, mid);
  assert.equal(afterRelease.residentAssets, mid.residentAssets - 1);
});

test('sector rotate invalidates the canonical snapshot', () => {
  const registry = createAssetResidencyRegistry({ maxGpuBytes: 1e12 });
  seed(registry, 'package:a');
  const before = registry.canonicalDiagnostics();
  registry.rotateSector('ceres');
  const after = registry.canonicalDiagnostics();
  assert.notEqual(after, before);
  assert.equal(after.currentSectorId, 'ceres');
  assert.equal(after.residentAssets, before.residentAssets);
});
