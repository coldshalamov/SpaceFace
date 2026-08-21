import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  createAssetResidencyRegistry,
  estimateGpuResourceBytes,
} from '../src/render/assetResidency.js';

function resident(registry, key, resources, options = {}) {
  registry.registerAsset(key, resources, options);
  registry.retain(key, {}, { role: 'render-package-cache' });
  return registry.diagnostics({ includeEvents: false });
}

test('materials are known zero-byte wrappers and package bytes never enter GPU pressure', () => {
  const registry = createAssetResidencyRegistry({ maxGpuBytes: 1 });
  const material = new THREE.MeshStandardMaterial();
  const unknown = { userData: {}, dispose() {} };
  const snapshot = resident(registry, 'package:material', [material, unknown], {
    // This is intentionally larger than the GPU budget. It belongs to the encoded CPU package.
    cpuPackageBytes: 64 * 1024 * 1024,
    byteSize: 64 * 1024 * 1024,
  });

  assert.equal(estimateGpuResourceBytes(material).gpuResidentBytes, 0);
  assert.equal(snapshot.gpuResidentBytes, 0);
  assert.equal(snapshot.residentBytes, 0);
  assert.equal(snapshot.cpuPackageBytes, 64 * 1024 * 1024);
  assert.equal(snapshot.unaccountedResources, 1);
  assert.equal(snapshot.unaccountedBytes, null);
  assert.equal(registry.enforceBudget().budgetSatisfied, true);
});

test('CPU package pressure is independently evictable and never aliases GPU bytes', () => {
  const registry = createAssetResidencyRegistry({ maxCpuBytes: 1, maxGpuBytes: 1024 });
  const texture = new THREE.DataTexture(new Uint8Array(16), 2, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
  const snapshot = resident(registry, 'package:cpu', [texture], { cpuPackageBytes: 128 });
  assert.equal(snapshot.gpuResidentBytes, 16);
  assert.equal(snapshot.cpuPackageBytes, 128);

  const receipt = registry.enforceBudget('cpu');
  assert.equal(receipt.evictedBytes, 128);
  assert.equal(receipt.remainingBytes, 0);
  assert.equal(receipt.gpuResidentBytes, 0);
});

test('compressed mip payloads use exact bytes instead of an RGBA estimate', () => {
  const mipmaps = [
    { data: new Uint8Array(32), width: 8, height: 8 },
    { data: new Uint8Array(8), width: 4, height: 4 },
    { data: new Uint8Array(8), width: 2, height: 2 },
  ];
  const texture = new THREE.CompressedTexture(
    mipmaps,
    8,
    8,
    THREE.RGBA_S3TC_DXT1_Format,
  );
  assert.equal(estimateGpuResourceBytes(texture).gpuResidentBytes, 48);
});

test('ordinary RGBA mip chain accounts every level from its dimensions', () => {
  const texture = new THREE.Texture({ width: 8, height: 4 });
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.generateMipmaps = true;
  const expected = (8 * 4 + 4 * 2 + 2 * 1 + 1) * 4;
  assert.equal(estimateGpuResourceBytes(texture).gpuResidentBytes, expected);
});

test('cube, array, and multisample render-target multipliers are represented', () => {
  const cube = new THREE.CubeTexture(Array.from({ length: 6 }, () => ({
    width: 2,
    height: 2,
    data: new Uint8Array(16),
  })));
  cube.format = THREE.RGBAFormat;
  cube.type = THREE.UnsignedByteType;
  assert.equal(estimateGpuResourceBytes(cube).gpuResidentBytes, 6 * 16);

  const array = new THREE.DataArrayTexture(new Uint8Array(2 * 2 * 3 * 4), 2, 2, 3);
  array.format = THREE.RGBAFormat;
  array.type = THREE.UnsignedByteType;
  assert.equal(estimateGpuResourceBytes(array).gpuResidentBytes, 48);

  const target = new THREE.WebGLRenderTarget(2, 1, { samples: 4, depthBuffer: false });
  assert.equal(estimateGpuResourceBytes(target).gpuResidentBytes, 2 * 1 * 4 * 4);
  assert.equal(estimateGpuResourceBytes(target).unaccounted, false);
});

test('shared geometry backing buffers are counted once', () => {
  const backing = new ArrayBuffer(1024);
  const first = new THREE.BufferGeometry();
  const second = new THREE.BufferGeometry();
  first.setAttribute('position', new THREE.BufferAttribute(new Float32Array(backing, 0, 12), 3));
  second.setAttribute('position', new THREE.BufferAttribute(new Float32Array(backing, 256, 12), 3));

  const registry = createAssetResidencyRegistry();
  const snapshot = resident(registry, 'shared-geometry', [first, second]);
  assert.equal(snapshot.gpuResidentBytes, backing.byteLength);
  assert.equal(snapshot.unaccountedResources, 0);
});
