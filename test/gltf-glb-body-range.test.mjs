// #168: the vendored GLTFLoader keeps the GLB BIN chunk as a range on the caller's buffer instead of
// copying it out up front. Everything handed downstream must be byte-identical to stock three r184.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader as StockGLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFLoader as VendoredGLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/addons/libs/meshopt_decoder.module.js';
import { registerEmbeddedKtx2Textures } from '../src/render/embeddedKtx2Textures.js';

const sha = (u8) => createHash('sha256').update(u8).digest('hex');
const bytesOf = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
const readAb = (rel) => {
  const b = readFileSync(new URL(rel, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

async function parseCollect(Loader, ab) {
  await MeshoptDecoder.ready;
  const ktx = [];
  let binary = null;
  const loader = new Loader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.register(registerEmbeddedKtx2Textures);
  loader.register((parser) => { binary = () => parser.extensions.KHR_binary_glTF; return { name: 'test-168-probe' }; });
  loader.setKTX2Loader({
    parse(buffer, onLoad) {
      ktx.push(`${sha(new Uint8Array(buffer))}:${buffer.byteLength}`);
      structuredClone(buffer, { transfer: [buffer] });
      onLoad(new THREE.CompressedTexture([], 4, 4));
    },
  });
  const gltf = await loader.parseAsync(ab, '');
  const geometry = [];
  gltf.scene.traverse((o) => {
    if (!o.geometry) return;
    for (const [name, a] of Object.entries(o.geometry.attributes).sort()) {
      const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array;
      geometry.push(`${o.name}:${name}:${a.itemSize}:${a.offset ?? ''}:${a.normalized}:${arr.constructor.name}:${sha(bytesOf(arr))}`);
    }
    if (o.geometry.index) geometry.push(`${o.name}:index:${sha(bytesOf(o.geometry.index.array))}`);
  });
  return { ktx: ktx.sort(), geometry, binary: binary() };
}

test('meshopt + KTX2 render package: identical downstream bytes and the GLB body is never copied', async () => {
  const rel = '../assets/ships/release/render-packages/aftermath-aft-weapon-spar/render.glb';
  const stock = await parseCollect(StockGLTFLoader, readAb(rel));
  const input = readAb(rel);
  const patched = await parseCollect(VendoredGLTFLoader, input);
  assert.ok(stock.ktx.length > 0 && stock.geometry.length > 0);
  assert.deepEqual(patched.ktx, stock.ktx);
  assert.deepEqual(patched.geometry, stock.geometry);
  assert.equal(patched.binary._body, null, 'body never materialized');
  assert.equal(patched.binary.bodySource, input, 'the body is a range on the caller\'s GLB');
  assert.equal(input.byteLength, readAb(rel).byteLength, 'the caller\'s GLB is not detached');
});

test('uncompressed GLB (plain accessor bufferViews): identical geometry, bufferViews still standalone copies', async () => {
  const rel = '../assets/ships/parts/wholeships/apron_shuttle.glb';
  globalThis.self ??= globalThis; // image path in node; the image decode itself fails the same way on both
  const stock = await parseCollect(StockGLTFLoader, readAb(rel));
  const input = readAb(rel);
  const patched = await parseCollect(VendoredGLTFLoader, input);
  assert.ok(stock.geometry.length > 0);
  assert.deepEqual(patched.geometry, stock.geometry);
  assert.equal(patched.binary._body, null);
});

test('body getter materializes exactly data.slice(chunk) lazily, and the parser then falls back to it', async () => {
  const ab = readAb('../assets/ships/release/render-packages/aftermath-aft-weapon-spar/render.glb');
  const dv = new DataView(ab);
  const jsonLength = dv.getUint32(12, true);
  const binOffset = 20 + jsonLength + 8;
  const binLength = dv.getUint32(20 + jsonLength, true);
  const expected = sha(new Uint8Array(ab.slice(binOffset, binOffset + binLength)));

  let parser = null;
  const loader = new VendoredGLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.register((p) => { parser = p; return { name: 'test-168-early-body' }; });
  loader.register(registerEmbeddedKtx2Textures);
  loader.setKTX2Loader({ parse(buffer, onLoad) { onLoad(new THREE.CompressedTexture([], 4, 4)); } });
  await MeshoptDecoder.ready;
  const pending = loader.parseAsync(ab, '');
  const binary = parser.extensions.KHR_binary_glTF;
  assert.equal(binary._body, null);
  assert.ok(parser.glbBodyRange(0, 0, 16));
  const body = await parser.getDependency('buffer', 0); // a consumer that wants the ArrayBuffer itself
  assert.ok(body instanceof ArrayBuffer);
  assert.equal(body.byteLength, binLength);
  assert.equal(sha(new Uint8Array(body)), expected);
  assert.equal(binary.body, body, 'materialized once');
  assert.equal(parser.glbBodyRange(0, 0, 16), null, 'ranges retire once the body exists');
  await pending;
});

test('range helpers refuse anything the stock path would treat differently', async () => {
  const ab = readAb('../assets/ships/release/render-packages/aftermath-aft-weapon-spar/render.glb');
  let parser = null;
  const loader = new VendoredGLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.register((p) => { parser = p; return { name: 'test-168-ranges' }; });
  loader.parse(ab, '', () => {}, () => {});
  const len = parser.extensions.KHR_binary_glTF.bodyByteLength;
  assert.equal(parser.glbBodyRange(1, 0, 4), null, 'only buffer 0 (the GLB body)');
  assert.equal(parser.glbBodyRange(0, len - 3, 4), null, 'views past the body keep the stock (throwing) path');
  assert.equal(parser.glbBodyRange(0, 1.5, 4), null);
  assert.equal(parser.glbBodyRange(0, -1, 4), null);
  const clamped = parser.glbBodySliceRange(0, len - 3, 10);
  assert.equal(clamped.byteLength, 3, 'slice ranges clamp at the body end like ArrayBuffer.prototype.slice');
  const past = parser.glbBodySliceRange(0, len + 5, 10);
  assert.equal(past.byteLength, 0);
});
