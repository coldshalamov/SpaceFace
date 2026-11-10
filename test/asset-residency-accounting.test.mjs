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

function markRenderTargetLayout(target, multisampleLayout) {
  target.userData = {
    ...(target.userData || {}),
    spacefaceRenderTargetResidency: { multisampleLayout },
  };
  return target;
}

function backendRenderer({ extension, useRenderToTexture } = {}) {
  return {
    capabilities: { isWebGL2: true, maxSamples: 4 },
    extensions: { has: () => extension === true },
    properties: { get: () => ({
      ...(typeof useRenderToTexture === 'boolean' ? { __useRenderToTexture: useRenderToTexture } : {}),
    }) },
  };
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
  const receipt = registry.enforceBudget();
  assert.equal(receipt.budgetSatisfied, false);
  assert.equal(receipt.indeterminate, true);
  assert.equal(receipt.gpuAccountingAuthoritative, false);
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

test('distinct DataTextures do not dedupe GPU allocations through one source array', () => {
  const source = new Uint8Array(16);
  const first = new THREE.DataTexture(source, 2, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
  const second = new THREE.DataTexture(source, 2, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
  const registry = createAssetResidencyRegistry();
  registry.registerAsset('texture-a', [first]);
  registry.registerAsset('texture-b', [second]);
  assert.equal(registry.diagnostics({ includeEvents: false }).gpuResidentBytes, 32);
});

test('ordinary RGBA mip chain accounts every level from its dimensions', () => {
  const texture = new THREE.Texture({ width: 8, height: 4 });
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.generateMipmaps = true;
  const expected = (8 * 4 + 4 * 2 + 2 * 1 + 1) * 4;
  assert.equal(estimateGpuResourceBytes(texture).gpuResidentBytes, expected);
});

test('manual mipmaps replace the base image allocation', () => {
  const texture = new THREE.Texture({ width: 8, height: 4 });
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.generateMipmaps = true;
  texture.mipmaps = [{ data: new Uint8Array(32), width: 4, height: 2 }];
  assert.equal(estimateGpuResourceBytes(texture).gpuResidentBytes, 32);
});

test('cube, array, and multisample render-target multipliers are represented', () => {
  const cube = new THREE.CubeTexture(Array.from({ length: 6 }, () => ({
    width: 2,
    height: 2,
    data: new Uint8Array(16),
  })));
  cube.format = THREE.RGBAFormat;
  cube.type = THREE.UnsignedByteType;
  cube.generateMipmaps = false;
  assert.equal(estimateGpuResourceBytes(cube).gpuResidentBytes, 6 * 16);

  const generatedCube = new THREE.CubeTexture(Array.from({ length: 6 }, () => ({
    width: 4,
    height: 2,
  })));
  generatedCube.format = THREE.RGBAFormat;
  generatedCube.type = THREE.UnsignedByteType;
  generatedCube.generateMipmaps = true;
  assert.equal(estimateGpuResourceBytes(generatedCube).gpuResidentBytes, 6 * (32 + 8 + 4));

  const array = new THREE.DataArrayTexture(new Uint8Array(2 * 2 * 3 * 4), 2, 2, 3);
  array.format = THREE.RGBAFormat;
  array.type = THREE.UnsignedByteType;
  assert.equal(estimateGpuResourceBytes(array).gpuResidentBytes, 48);

  const target = markRenderTargetLayout(
    new THREE.WebGLRenderTarget(2, 1, { samples: 4, depthBuffer: false }),
    'resolve',
  );
  assert.equal(estimateGpuResourceBytes(target).gpuResidentBytes, 2 * 1 * 4 * (4 + 1));
  assert.equal(estimateGpuResourceBytes(target).unaccounted, false);

  const directTarget = markRenderTargetLayout(
    new THREE.WebGLRenderTarget(2, 1, { samples: 4, depthBuffer: false }),
    'direct',
  );
  assert.equal(estimateGpuResourceBytes(directTarget).gpuResidentBytes, 2 * 1 * 4 * 4);
  assert.equal(estimateGpuResourceBytes(directTarget).unaccounted, false);

  const unknownTarget = new THREE.WebGLRenderTarget(2, 1, { samples: 4, depthBuffer: false });
  assert.equal(estimateGpuResourceBytes(unknownTarget).gpuResidentBytes, 0);
  assert.equal(estimateGpuResourceBytes(unknownTarget).unaccounted, true);

  const depthTarget = markRenderTargetLayout(
    new THREE.WebGLRenderTarget(2, 1, { samples: 4, depthBuffer: true }),
    'resolve',
  );
  assert.equal(estimateGpuResourceBytes(depthTarget).gpuResidentBytes, 2 * 1 * 4 * (4 + 1) * 2,
    'color and implicit depth attachments both include resolve and multisample storage');
  assert.equal(estimateGpuResourceBytes(depthTarget).unaccounted, false);

  const directDepthTarget = markRenderTargetLayout(
    new THREE.WebGLRenderTarget(2, 1, { samples: 4, depthBuffer: true }),
    'direct',
  );
  assert.equal(estimateGpuResourceBytes(directDepthTarget).gpuResidentBytes, 2 * 1 * 4 * 4 * 2,
    'direct MSAA has one multisampled color and one multisampled depth allocation');
  assert.equal(estimateGpuResourceBytes(directDepthTarget).unaccounted, false);

  const depthTextureTarget = markRenderTargetLayout(
    new THREE.WebGLRenderTarget(2, 1, { samples: 4, depthBuffer: true }),
    'resolve',
  );
  depthTextureTarget.depthTexture = new THREE.DepthTexture(2, 1);
  assert.equal(estimateGpuResourceBytes(depthTextureTarget).gpuResidentBytes, 2 * 1 * 4 * (4 + 1) * 2);
  assert.equal(estimateGpuResourceBytes(depthTextureTarget).unaccounted, false);

  const directDepthTextureTarget = markRenderTargetLayout(
    new THREE.WebGLRenderTarget(2, 1, { samples: 4, depthBuffer: true }),
    'direct',
  );
  directDepthTextureTarget.depthTexture = new THREE.DepthTexture(2, 1);
  assert.equal(estimateGpuResourceBytes(directDepthTextureTarget).gpuResidentBytes, 2 * 1 * 4 * 4 * 2);
  assert.equal(estimateGpuResourceBytes(directDepthTextureTarget).unaccounted, false);

  const stencilTarget = markRenderTargetLayout(
    new THREE.WebGLRenderTarget(2, 1, { samples: 4, depthBuffer: true, stencilBuffer: true }),
    'resolve',
  );
  assert.equal(estimateGpuResourceBytes(stencilTarget).gpuResidentBytes, 2 * 1 * 4 * (4 + 1) * 2,
    'standard depth/stencil uses one resolve and one multisample attachment');
});

test('render-target accounting follows the renderer backend layout decision', () => {
  const directTarget = new THREE.WebGLRenderTarget(2, 1, { samples: 4, depthBuffer: false });
  const directRegistry = createAssetResidencyRegistry({ renderer: backendRenderer({ extension: true }) });
  directRegistry.registerAsset('extension-direct', [directTarget]);
  assert.equal(directRegistry.diagnostics({ includeEvents: false }).gpuResidentBytes, 2 * 1 * 4 * 4);
  assert.equal(directRegistry.diagnostics({ includeEvents: false }).unaccountedResources, 0);

  const standardTarget = new THREE.WebGLRenderTarget(2, 1, { samples: 4, depthBuffer: false });
  const standardRegistry = createAssetResidencyRegistry({ renderer: backendRenderer({ extension: false }) });
  standardRegistry.registerAsset('webgl2-resolve', [standardTarget]);
  assert.equal(standardRegistry.diagnostics({ includeEvents: false }).gpuResidentBytes, 2 * 1 * 4 * (4 + 1));
  assert.equal(standardRegistry.diagnostics({ includeEvents: false }).unaccountedResources, 0);

  const forcedResolveTarget = new THREE.WebGLRenderTarget(2, 1, { samples: 4, depthBuffer: false });
  const forcedResolveRegistry = createAssetResidencyRegistry({
    renderer: backendRenderer({ extension: true, useRenderToTexture: false }),
  });
  forcedResolveRegistry.registerAsset('extension-forced-resolve', [forcedResolveTarget]);
  assert.equal(forcedResolveRegistry.diagnostics({ includeEvents: false }).gpuResidentBytes, 2 * 1 * 4 * (4 + 1));
  assert.equal(forcedResolveRegistry.diagnostics({ includeEvents: false }).unaccountedResources, 0);
});

test('separate BufferAttributes count uploaded view bytes, not the global backing buffer', () => {
  const backing = new ArrayBuffer(1024);
  const first = new THREE.BufferGeometry();
  const second = new THREE.BufferGeometry();
  first.setAttribute('position', new THREE.BufferAttribute(new Float32Array(backing, 0, 12), 3));
  second.setAttribute('position', new THREE.BufferAttribute(new Float32Array(backing, 256, 12), 3));

  const registry = createAssetResidencyRegistry();
  const snapshot = resident(registry, 'shared-geometry', [first, second]);
  assert.equal(snapshot.gpuResidentBytes, 2 * 12 * Float32Array.BYTES_PER_ELEMENT);
  assert.equal(snapshot.unaccountedResources, 0);
});

test('interleaved attributes share one Three upload while ordinary attributes do not', () => {
  const backing = new ArrayBuffer(256);
  const first = new THREE.BufferGeometry();
  const second = new THREE.BufferGeometry();
  first.setAttribute('position', new THREE.BufferAttribute(new Float32Array(backing, 0, 8), 2));
  second.setAttribute('position', new THREE.BufferAttribute(new Float32Array(backing, 64, 8), 2));
  const registry = createAssetResidencyRegistry();
  registry.registerAsset('ordinary-attributes', [first, second]);
  assert.equal(registry.diagnostics({ includeEvents: false }).gpuResidentBytes, 64,
    'two ordinary BufferAttributes count their uploaded view ranges separately');

  const interleaved = new THREE.InterleavedBuffer(new Float32Array(backing), 4);
  const a = new THREE.BufferGeometry();
  const b = new THREE.BufferGeometry();
  a.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
  b.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 1));
  const sharedRegistry = createAssetResidencyRegistry();
  sharedRegistry.registerAsset('interleaved-attributes', [a, b]);
  assert.equal(sharedRegistry.diagnostics({ includeEvents: false }).gpuResidentBytes, backing.byteLength,
    'attributes backed by one InterleavedBuffer share the upload/cache identity');
});
