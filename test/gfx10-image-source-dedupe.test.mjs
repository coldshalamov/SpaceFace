import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  adoptSharedImageSourceClone,
  claimSharedImageTexture,
  imageSourceDedupeStats,
  imageSourceKeyAsync,
  resetImageSourceDedupeForTests,
  sharedImageTextureFor,
} from '../src/render/imageSourceDedupe.js';

function bytes(seed, length = 64) {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (seed * 31 + i * 17) & 0xff;
  return out;
}

function decodedTexture(seed) {
  const texture = new THREE.Texture();
  texture.name = `decoded-${seed}`;
  // Decodes always resolve with a populated source; a bare Texture has source.data === null,
  // which is exactly what a CPU-detached package texture looks like — dedupe would (correctly)
  // refuse to hand out its payload, so the fixture must carry one.
  texture.image = { width: 4, height: 4, seed };
  return texture;
}

test.beforeEach(() => resetImageSourceDedupeForTests());

test('identical embedded bytes share one image source across documents', async () => {
  const key = await imageSourceKeyAsync(bytes(7), 64, 'image/ktx2');
  const first = claimSharedImageTexture(key, decodedTexture(1));
  const second = claimSharedImageTexture(key, decodedTexture(2));

  assert.notEqual(second, first, 'the second GLB receives a clone, not the owner object');
  assert.equal(second.source, first.source, 'the clone shares the cached THREE.Source');
  assert.equal(imageSourceDedupeStats().entries, 1);
  assert.equal(imageSourceDedupeStats().hits, 1);
  assert.equal(imageSourceDedupeStats().misses, 1);
});

test('different bytes, lengths, or mime types never share a source', async () => {
  const a = claimSharedImageTexture(await imageSourceKeyAsync(bytes(1), 64, 'image/ktx2'), decodedTexture(1));
  const b = claimSharedImageTexture(await imageSourceKeyAsync(bytes(2), 64, 'image/ktx2'), decodedTexture(2));
  const c = claimSharedImageTexture(await imageSourceKeyAsync(bytes(1), 32, 'image/ktx2'), decodedTexture(3));
  const d = claimSharedImageTexture(await imageSourceKeyAsync(bytes(1), 64, 'image/png'), decodedTexture(4));

  for (const texture of [b, c, d]) assert.notEqual(texture.source, a.source);
  assert.equal(imageSourceDedupeStats().entries, 4);
});

test('disposing one GLB texture keeps the shared source for remaining users', async () => {
  const key = await imageSourceKeyAsync(bytes(9), 64, 'image/ktx2');
  const owner = claimSharedImageTexture(key, decodedTexture(1));
  const clone = sharedImageTextureFor(key);

  let ownerDisposed = 0;
  owner.addEventListener('dispose', () => { ownerDisposed++; });

  owner.dispose();
  assert.equal(ownerDisposed, 1, 'the tracked wrapper still reaches the real dispose');
  assert.equal(imageSourceDedupeStats().entries, 1, 'entry survives while a clone still uses it');

  clone.dispose();
  assert.equal(imageSourceDedupeStats().entries, 0, 'entry drops once every user disposed');
});

test('in-document clones of a shared source adopt the same refcount', async () => {
  const key = await imageSourceKeyAsync(bytes(11), 64, 'image/ktx2');
  const owner = claimSharedImageTexture(key, decodedTexture(1));
  const docClone = adoptSharedImageSourceClone(owner.clone());

  assert.equal(docClone.source, owner.source);
  owner.dispose();
  assert.equal(imageSourceDedupeStats().entries, 1, 'the document clone still references the entry');
  docClone.dispose();
  assert.equal(imageSourceDedupeStats().entries, 0);
});

test('a rebuilt decode after full disposal registers a fresh entry', async () => {
  const key = await imageSourceKeyAsync(bytes(13), 64, 'image/ktx2');
  const first = claimSharedImageTexture(key, decodedTexture(1));
  first.dispose();
  assert.equal(imageSourceDedupeStats().entries, 0);

  const second = claimSharedImageTexture(key, decodedTexture(2));
  assert.notEqual(second.source, first.source, 'a re-decode owns a new source, not a disposed one');
});

function fakeParsedGltf({ imageBytes, mimeType = 'image/png', extraTexture = null }) {
  const body = new ArrayBuffer(imageBytes.byteLength);
  new Uint8Array(body).set(imageBytes);
  const texture = new THREE.Texture();
  texture.source = new THREE.Source({ width: 4, height: 4 });
  const material = new THREE.MeshStandardMaterial({ map: texture });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  const scene = new THREE.Group();
  scene.add(mesh);
  const json = {
    buffers: [{ byteLength: body.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: imageBytes.byteLength }],
    images: [{ mimeType, bufferView: 0 }],
    textures: [{ source: 0 }],
  };
  const associations = new Map([[texture, { textures: 0 }]]);
  if (extraTexture) associations.set(extraTexture, { textures: 0 });
  const parser = {
    json,
    associations,
    extensions: { KHR_binary_glTF: { body } },
  };
  return { parser, scene, scenes: [scene], texture, material };
}

test('post-parse pass shares one source for identical embedded PNG bytes', async () => {
  const { dedupeGltfTextureSources } = await import('../src/render/imageSourceDedupe.js');
  const imageBytes = bytes(21, 96);
  const a = fakeParsedGltf({ imageBytes });
  const b = fakeParsedGltf({ imageBytes: imageBytes.slice() });
  b.texture.colorSpace = THREE.SRGBColorSpace;
  b.texture.flipY = true;
  a.texture.colorSpace = THREE.LinearSRGBColorSpace;

  await dedupeGltfTextureSources(a);
  await dedupeGltfTextureSources(b);

  assert.equal(b.texture.source, a.texture.source, 'identical bytes collapse onto one Source');
  assert.equal(b.texture.colorSpace, THREE.SRGBColorSpace, 'the second document keeps its colorSpace');
  assert.equal(b.texture.flipY, true, 'the second document keeps its sampler flags');
  assert.equal(a.texture.colorSpace, THREE.LinearSRGBColorSpace);

  a.texture.dispose();
  assert.equal(imageSourceDedupeStats().entries, 1, 'entry lives while the second GLB uses it');
  b.texture.dispose();
  assert.equal(imageSourceDedupeStats().entries, 0);
});

test('post-parse pass never shares different bytes and skips compressed textures', async () => {
  const { dedupeGltfTextureSources } = await import('../src/render/imageSourceDedupe.js');
  const a = fakeParsedGltf({ imageBytes: bytes(31, 96) });
  const b = fakeParsedGltf({ imageBytes: bytes(47, 96) });
  const compressed = new THREE.CompressedTexture([], 4, 4);
  compressed.source = new THREE.Source([]);
  const c = fakeParsedGltf({ imageBytes: bytes(31, 96), extraTexture: compressed });

  await dedupeGltfTextureSources(a);
  await dedupeGltfTextureSources(b);
  await dedupeGltfTextureSources(c);

  assert.notEqual(b.texture.source, a.texture.source, 'different bytes keep separate sources');
  assert.equal(c.texture.source, a.texture.source, 'same bytes still share');
  assert.notEqual(compressed.source, a.texture.source, 'compressed textures are left to the KTX2 path');
});

test('a payload-released owner is a miss: clones of empty mips would crash the uploader', async () => {
  const key = await imageSourceKeyAsync(bytes(41), 64, 'image/ktx2');
  const owner = claimSharedImageTexture(key, decodedTexture(1));
  // packageCpuDetach releases the CPU mirror after a proven GPU upload; source.data is then null
  // while the texture still reports its dimensions. Cloning that state mints a texture that
  // throws inside three's upload (mipmaps[0].width / image.width) instead of drawing.
  owner.source.data = null;

  assert.equal(sharedImageTextureFor(key), null,
    'a detached owner must behave as a miss so callers decode real bytes');

  const fresh = decodedTexture(2);
  const adopted = claimSharedImageTexture(key, fresh);
  assert.equal(adopted, fresh,
    'a fresh decode is adopted as a user, not retired for a clone of the dead owner');
  assert.ok(adopted.source && adopted.source.data, 'the adopted texture keeps its own pixels');
});

test('a payload-released owner keeps later PNG adopters on their own source', async () => {
  const { dedupeGltfTextureSources } = await import('../src/render/imageSourceDedupe.js');
  const imageBytes = bytes(43, 96);
  const a = fakeParsedGltf({ imageBytes });
  const b = fakeParsedGltf({ imageBytes: imageBytes.slice() });

  await dedupeGltfTextureSources(a);
  const ownSource = b.texture.source;
  // Same release as packageCpuDetach's source.data drop: the shared Source dies with it.
  a.texture.source.data = null;
  await dedupeGltfTextureSources(b);

  assert.equal(b.texture.source, ownSource,
    'a document must not adopt a source whose payload was already released');
  assert.ok(b.texture.source.data, 'the adopter keeps its own decoded pixels');
});
