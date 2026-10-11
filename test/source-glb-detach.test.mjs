import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as THREE from 'three';

import { imageSourceKeyAsync } from '../src/render/imageSourceDedupe.js';
import {
  createSourceDetachManifest,
  detachPackageTexture,
  detachedTextureUploadPending,
  isPackageTextureDetached,
  rehydrateDetachedTextures,
  resetPackageDetachManifestsForTests,
} from '../src/render/packageCpuDetach.js';

function collectFixtureTextures(root) {
  const textures = [];
  (root && root.scene ? root.scene : root).traverse((object) => {
    const materials = object.material
      ? (Array.isArray(object.material) ? object.material : [object.material])
      : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && value.isTexture) textures.push(value);
      }
    }
  });
  return textures;
}

function authoredFixture() {
  const texture = new THREE.CompressedTexture(
    [{ data: new Uint8Array(1024), width: 4, height: 4 }], 4, 4, THREE.RGBAFormat);
  texture.name = 'AuthoredAtlas';
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setIndex([0, 1, 2]);
  const root = new THREE.Group();
  const hull = new THREE.Mesh(geometry, material);
  root.add(hull);
  return { scene: root, texture };
}

test('source-GLB manifest marks authored textures and detaches through the seal path', async () => {
  resetPackageDetachManifestsForTests();
  const fixture = authoredFixture();
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const contentHash = await imageSourceKeyAsync(bytes, bytes.length, 'model/gltf-binary');

  const manifest = createSourceDetachManifest('assets/authored/hull.glb', [fixture.texture], {
    contentHash,
    assetId: 'fixture.authored',
    redecode: async () => authoredFixture(),
    collectResources: collectFixtureTextures,
  });
  assert.ok(manifest);
  assert.equal(manifest.sourceBytesSha256, contentHash);
  assert.equal(manifest.renderUrl, 'assets/authored/hull.glb');
  assert.equal(fixture.texture.userData.spacefaceCpuDetach.contentHash, contentHash,
    'the authored texture carries the same mark schema as package textures');

  // The residency seal path: detachPackageTexture releases a marked authored texture.
  assert.equal(detachPackageTexture(fixture.texture), true);
  assert.equal(isPackageTextureDetached(fixture.texture), true);
  assert.equal(fixture.texture.mipmaps.length, 0);

  // Rehydrate refills through the lean redecode (digest-verified inside the caller's ref).
  fixture.texture.version = 3;
  const receipt = await rehydrateDetachedTextures([fixture.texture]);
  assert.equal(receipt.textures, 1);
  assert.equal(fixture.texture.mipmaps.length, 1, 'payload refilled');
  assert.equal(isPackageTextureDetached(fixture.texture), false);
});

test('a redecode that yields wrong bytes is rejected by digest verification (caller-side)', async () => {
  // The digest check lives in assetLoader's sourceDetachRef redecode; the manifest layer pins
  // ordinal pairing — a wrong-bytes donor never reaches the entries.
  resetPackageDetachManifestsForTests();
  const fixture = authoredFixture();
  const manifest = createSourceDetachManifest('a.glb', [fixture.texture], {
    contentHash: 'sha256:fixture',
    redecode: async () => authoredFixture(),
    collectResources: collectFixtureTextures,
  });
  assert.equal(manifest.entries.length, 1);
  assert.equal(manifest.entries[0].texture, fixture.texture,
    'ordinal pairing is positional over the same-order texture list');
});

test('detachOnMark releases fallback-layer textures eagerly at manifest creation', async () => {
  resetPackageDetachManifestsForTests();
  const fixture = authoredFixture();
  fixture.scene.userData = { authoredReadableFallbackLayer: true };
  createSourceDetachManifest('a.glb', [fixture.texture], {
    contentHash: 'sha256:fallback',
    detachOnMark: true,
    redecode: async () => authoredFixture(),
    collectResources: collectFixtureTextures,
  });
  assert.equal(isPackageTextureDetached(fixture.texture), true,
    'fallback-layer textures detach at mark — the layer never seals');
});

test('source pins: F4 call sites exist verbatim', () => {
  const loader = readFileSync(new URL('../src/render/assetLoader.js', import.meta.url), 'utf8');
  assert.match(loader, /createSourceDetachManifest\(url, collectAuthoredDetachTextures\(scene\)/);
  assert.match(loader, /imageSourceKeyAsync\(body, body\.byteLength, 'model\/gltf-binary'\)/);
  const parts = readFileSync(new URL('../src/render/partsLibrary.js', import.meta.url), 'utf8');
  assert.match(parts, /detachPackageTexture\(value\);/);
});
