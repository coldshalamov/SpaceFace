import assert from 'node:assert/strict';
import test from 'node:test';

import { loadGltfDocument } from '../src/render/assetLoader.js';

test('whole-ship validation and GLTF parsing share one network response', async () => {
  const buffer = wholeShipFixture();
  let fetches = 0;
  let parses = 0;
  const expected = { scene: { isObject3D: true } };
  const loader = {
    loadAsync() {
      throw new Error('whole ships must not issue a second loader request');
    },
    async parseAsync(received, path) {
      parses++;
      assert.equal(received, buffer);
      assert.equal(path, 'assets/ships/release/parts/wholeships/');
      return expected;
    },
  };

  const result = await loadGltfDocument(
    'assets/ships/release/parts/wholeships/kestrel.glb',
    loader,
    async (_url, options) => {
      fetches++;
      assert.deepEqual(options, { cache: 'no-cache' });
      return { ok: true, arrayBuffer: async () => buffer };
    },
  );

  assert.equal(result, expected);
  assert.equal(fetches, 1);
  assert.equal(parses, 1);
});

test('ordinary modular assets retain the standard GLTFLoader path', async () => {
  let fetches = 0;
  let loads = 0;
  const expected = {};
  const result = await loadGltfDocument('assets/ships/release/parts/hulls/hull_fighter.glb', {
    async loadAsync(url) {
      loads++;
      assert.match(url, /hull_fighter\.glb$/);
      return expected;
    },
  }, async () => {
    fetches++;
    throw new Error('ordinary assets should be loaded by GLTFLoader');
  });

  assert.equal(result, expected);
  assert.equal(loads, 1);
  assert.equal(fetches, 0);
});

function wholeShipFixture() {
  const document = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'HullBody', mesh: 0 }],
    meshes: [{ name: 'HullBody', primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ count: 3, type: 'VEC3', componentType: 5126 }],
  };
  const encoded = new TextEncoder().encode(JSON.stringify(document));
  const paddedLength = Math.ceil(encoded.length / 4) * 4;
  const buffer = new ArrayBuffer(12 + 8 + paddedLength);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, paddedLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  const bytes = new Uint8Array(buffer, 20, paddedLength);
  bytes.fill(0x20);
  bytes.set(encoded);
  return buffer;
}
