// glbPrepass (lane gltfworker): the worker's structural pre-pass must hand the parser bytes that are
// byte-identical to what the in-loader path produces — meshopt decodes equal decodeGltfBuffer output
// per view, image slices equal the body slice, and a parse fed the pre-passed maps produces the same
// scene graph as a stock parse. Failure discipline: no workers means the caller's buffer comes back
// untouched; a worker-side error still returns the GLB for the stock parse.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/addons/libs/meshopt_decoder.module.js';
import { registerEmbeddedKtx2Textures } from '../src/render/embeddedKtx2Textures.js';
import { prepassGlb } from '../src/render/glbPrepassWorker.js';
import { createGlbPrepasser } from '../src/render/glbPrepass.js';

const sha = (u8) => createHash('sha256').update(u8).digest('hex');
const readAb = (rel) => {
  const b = readFileSync(new URL(rel, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const PACKAGE = '../assets/ships/release/render-packages/aftermath-aft-weapon-spar/render.glb';

const ktx2Stub = {
  parse(bytes, onLoad) {
    onLoad(new THREE.CompressedTexture([], 4, 4));
  },
};

function fingerprint(root) {
  const out = [];
  root.traverse((o) => {
    const entry = [o.type, o.name, o.position.toArray(), o.quaternion.toArray(), o.scale.toArray()];
    if (o.geometry) {
      for (const [name, a] of Object.entries(o.geometry.attributes).sort()) {
        const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array;
        entry.push(`${name}:${a.itemSize}:${a.count}:${a.normalized}:${sha(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength))}`);
      }
      if (o.geometry.index) entry.push(`index:${sha(new Uint8Array(o.geometry.index.array.buffer))}`);
    }
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      entry.push(mats.map((m) => [m.type, m.name, m.color && m.color.getHexString(), m.metalness, m.roughness]).flat());
    }
    out.push(entry);
  });
  return out;
}

function newLoader() {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader(ktx2Stub);
  loader.register(registerEmbeddedKtx2Textures);
  return loader;
}

test('prepassGlb decodes byte-identical bufferViews and image slices', async () => {
  const glb = readAb(PACKAGE);
  const { decoded, images } = await prepassGlb(glb);
  const jsonLen = new DataView(glb).getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLen)));
  const binStart = 20 + jsonLen + 8;
  const decodedMap = new Map(decoded);

  let expectedViews = 0;
  (json.bufferViews || []).forEach((bv, index) => {
    const ext = bv.extensions && (bv.extensions.EXT_meshopt_compression || bv.extensions.KHR_meshopt_compression);
    if (!ext || ext.buffer !== 0) return;
    expectedViews++;
    const source = new Uint8Array(glb, binStart + (ext.byteOffset || 0), ext.byteLength);
    const want = new Uint8Array(ext.count * ext.byteStride);
    MeshoptDecoder.decodeGltfBuffer(want, ext.count, ext.byteStride, source, ext.mode, ext.filter);
    const got = decodedMap.get(index);
    assert.ok(got, `missing pre-decoded bufferView ${index}`);
    assert.equal(sha(new Uint8Array(got)), sha(want), `bufferView ${index} differs from stock decode`);
  });
  assert.ok(expectedViews > 0, 'package expected to contain meshopt bufferViews');
  assert.equal(decodedMap.size, expectedViews);

  const imageViewSet = new Set(images.map(([index]) => index));
  (json.images || []).forEach((image) => {
    if (image.uri !== undefined || image.bufferView === undefined) return;
    assert.ok(imageViewSet.has(image.bufferView), 'embedded image bufferView was not pre-sliced');
    const def = json.bufferViews[image.bufferView];
    const want = glb.slice(binStart + (def.byteOffset || 0), binStart + (def.byteOffset || 0) + def.byteLength);
    const got = new Map(images).get(image.bufferView);
    assert.equal(sha(new Uint8Array(got)), sha(new Uint8Array(want)), 'pre-sliced image bytes differ');
  });
});

test('parse fed the pre-pass maps produces the same scene graph as a stock parse', async () => {
  const stock = await newLoader().parseAsync(readAb(PACKAGE), '');
  const glb = readAb(PACKAGE);
  const { decoded, images } = await prepassGlb(glb);
  const loader = newLoader();
  loader.register((parser) => {
    parser.predecodedBufferViews = new Map(decoded);
    parser.preslicedSourceBytes = new Map(images);
    return { name: 'SpaceFaceGlbPrepass' };
  });
  const fed = await loader.parseAsync(glb, '');
  assert.deepEqual(fingerprint(fed.scene), fingerprint(stock.scene));
});

test('prepass passthrough: no Worker returns the input buffer untouched', async () => {
  const prepasser = createGlbPrepasser({ WorkerImpl: undefined });
  const glb = readAb(PACKAGE);
  const result = await prepasser.prepass(glb);
  assert.equal(result.glb, glb);
  assert.equal(glb.byteLength > 0, true, 'buffer must not be detached');
  assert.equal(result.bufferViews, null);
  assert.equal(result.sourceBytes, null);
});

test('prepass worker error reply hands the GLB back for the stock parse', async () => {
  class FailingWorker {
    constructor() { this.handlers = { message: [], error: [] }; }
    addEventListener(type, fn) { this.handlers[type].push(fn); }
    postMessage(data) {
      // Browser semantics: the transfer list detaches the buffer; a clean error reply returns it.
      const back = data.glb.slice(0);
      setTimeout(() => this.handlers.message.forEach((f) => f({ data: { id: data.id, ok: false, error: 'boom', glb: back } })), 0);
    }
    terminate() {}
  }
  const prepasser = createGlbPrepasser({ WorkerImpl: FailingWorker, workerUrl: 'x', cores: 8 });
  const glb = readAb(PACKAGE);
  const result = await prepasser.prepass(glb);
  assert.ok(result, 'error replies must still resolve a result');
  assert.equal(result.bufferViews, null);
  assert.ok(result.glb && result.glb.byteLength === glb.byteLength, 'caller must get the GLB back');
});
