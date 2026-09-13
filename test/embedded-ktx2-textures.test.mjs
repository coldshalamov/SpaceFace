import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
  EmbeddedKtx2TexturePlugin,
  registerEmbeddedKtx2Textures,
} from '../src/render/embeddedKtx2Textures.js';

function fakeParser({ images, textures, samplers, ktx2Loader, extensionsRequired } = {}) {
  const bufferViews = new Map();
  const parser = {
    json: { images, textures, samplers, extensionsRequired },
    options: { ktx2Loader },
    textureCache: {},
    sourceCache: {},
    associations: new Map(),
    dependencyCalls: [],
    delegated: [],
    getDependency(type, index) {
      parser.dependencyCalls.push([type, index]);
      if (!bufferViews.has(index)) bufferViews.set(index, new Uint8Array([0xab, 0x4b, 0x54, 0x58, index]).buffer);
      return Promise.resolve(bufferViews.get(index));
    },
    loadTextureImage(textureIndex, sourceIndex, loader) {
      parser.delegated.push({ textureIndex, sourceIndex, loader });
      return Promise.resolve('stock-path');
    },
    cachedBufferView: (index) => bufferViews.get(index),
  };
  return parser;
}

function fakeKtx2Loader() {
  const parsed = [];
  return {
    parsed,
    parse(buffer, onLoad) {
      parsed.push(buffer.byteLength);
      // The real loader transfers the buffer to its worker, which detaches it on this thread.
      structuredClone(buffer, { transfer: [buffer] });
      onLoad(new THREE.CompressedTexture([], 4, 4));
    },
  };
}

test('an embedded KTX2 image goes straight to KTX2Loader.parse with the stock texture settings', async () => {
  const ktx2Loader = fakeKtx2Loader();
  const parser = fakeParser({
    ktx2Loader,
    images: [{ bufferView: 3, mimeType: 'image/ktx2', extras: { role: 'hull' } }],
    textures: [{ source: 0, sampler: 0, name: 'hull_basecolor', extensions: { KHR_texture_basisu: { source: 0 } } }],
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 10497 }],
  });
  const plugin = new EmbeddedKtx2TexturePlugin(parser);

  const texture = await plugin.loadTexture(0);

  assert.ok(texture instanceof THREE.CompressedTexture);
  assert.deepEqual(parser.dependencyCalls, [['bufferView', 3]]);
  assert.deepEqual(ktx2Loader.parsed, [5], 'the transcoder received the bufferView bytes');
  assert.equal(parser.cachedBufferView(3).byteLength, 5, 'the parser-cached bufferView is not detached');
  assert.equal(texture.flipY, false);
  assert.equal(texture.name, 'hull_basecolor');
  assert.equal(texture.magFilter, THREE.LinearFilter);
  assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(texture.wrapS, THREE.ClampToEdgeWrapping);
  assert.equal(texture.wrapT, THREE.RepeatWrapping);
  assert.equal(texture.generateMipmaps, false, 'compressed textures never generate mipmaps');
  assert.equal(texture.userData.mimeType, 'image/ktx2');
  assert.equal(texture.userData.role, 'hull');
  assert.deepEqual(parser.associations.get(texture), { textures: 0 });
  assert.equal(parser.delegated.length, 0, 'no Blob/object-URL stock path for embedded bytes');
});

test('texture and source caches behave like the stock parser', async () => {
  const ktx2Loader = fakeKtx2Loader();
  const parser = fakeParser({
    ktx2Loader,
    images: [{ bufferView: 1, mimeType: 'image/ktx2' }],
    textures: [
      { source: 0, sampler: 0, extensions: { KHR_texture_basisu: { source: 0 } } },
      { source: 0, sampler: 1, extensions: { KHR_texture_basisu: { source: 0 } } },
    ],
    samplers: [{}, { magFilter: 9728, minFilter: 9728 }],
  });
  const plugin = new EmbeddedKtx2TexturePlugin(parser);

  const first = plugin.loadTexture(0);
  assert.equal(plugin.loadTexture(0), first, 'same image and sampler share one texture promise');
  const [a, b] = await Promise.all([first, plugin.loadTexture(1)]);

  assert.deepEqual(ktx2Loader.parsed, [5], 'one image source is transcoded once');
  assert.notEqual(a, b, 'a second sampler gets a clone of the decoded source');
  assert.equal(b.magFilter, THREE.NearestFilter);
  assert.equal(b.minFilter, THREE.NearestFilter);
  assert.equal(a.minFilter, THREE.LinearMipmapLinearFilter);
});

test('non-basisu textures, URI images and a missing loader follow the stock rules', async () => {
  const ktx2Loader = fakeKtx2Loader();
  const parser = fakeParser({
    ktx2Loader,
    images: [{ uri: 'hull.ktx2', mimeType: 'image/ktx2' }],
    textures: [
      { source: 0 },
      { source: 0, extensions: { KHR_texture_basisu: { source: 0 } } },
    ],
  });
  const plugin = new EmbeddedKtx2TexturePlugin(parser);

  assert.equal(plugin.loadTexture(0), null, 'textures without the extension are not ours');
  assert.equal(await plugin.loadTexture(1), 'stock-path', 'URI images keep the stock loader');
  assert.equal(parser.delegated[0].loader, ktx2Loader);

  const noLoader = new EmbeddedKtx2TexturePlugin(fakeParser({
    images: [{ bufferView: 0, mimeType: 'image/ktx2' }],
    textures: [{ source: 0, extensions: { KHR_texture_basisu: { source: 0 } } }],
  }));
  assert.equal(noLoader.loadTexture(0), null, 'optional extension without a loader falls back');
  const required = new EmbeddedKtx2TexturePlugin(fakeParser({
    extensionsRequired: ['KHR_texture_basisu'],
    images: [{ bufferView: 0, mimeType: 'image/ktx2' }],
    textures: [{ source: 0, extensions: { KHR_texture_basisu: { source: 0 } } }],
  }));
  assert.throws(() => required.loadTexture(0), /setKTX2Loader must be called/);
});

test('registered on the vendored GLTFLoader it replaces the built-in KHR_texture_basisu handler', async () => {
  const loader = new GLTFLoader();
  loader.register(registerEmbeddedKtx2Textures);
  loader.register(registerEmbeddedKtx2Textures);
  assert.equal(
    loader.pluginCallbacks.filter((callback) => callback === registerEmbeddedKtx2Textures).length,
    1,
    'repeated registration from each runtime is de-duplicated',
  );
  const gltf = await loader.parseAsync(JSON.stringify({ asset: { version: '2.0' } }), '');
  assert.ok(
    gltf.parser.plugins.KHR_texture_basisu instanceof EmbeddedKtx2TexturePlugin,
    'the parser resolves KHR_texture_basisu to this plugin',
  );
});
