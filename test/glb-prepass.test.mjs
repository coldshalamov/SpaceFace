// glbPrepass (lane gltfworker): the worker's structural pre-pass must hand the parser bytes that are
// byte-identical to what the in-loader path produces — meshopt decodes equal decodeGltfBuffer output
// per view, image slices equal the body slice, and a parse fed the pre-passed maps produces the same
// scene graph as a stock parse. Failure discipline: no workers means the caller's buffer comes back
// untouched; a worker-side error still returns the GLB for the stock parse.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInThisContext } from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from '../vendor/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from '../vendor/addons/libs/meshopt_decoder.module.js';
import { registerEmbeddedKtx2Textures } from '../src/render/embeddedKtx2Textures.js';
import { resetImageSourceDedupeForTests } from '../src/render/imageSourceDedupe.js';
import { fetchVerifiedRenderResources } from '../src/render/renderPackageLoader.js';
import { prepassGlb } from '../src/render/glbPrepassWorker.js';
import { createGlbPrepasser } from '../src/render/glbPrepass.js';

const sha = (u8) => createHash('sha256').update(u8).digest('hex');
const readAb = (rel) => {
  const b = readFileSync(new URL(rel, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};
const PACKAGE = '../assets/ships/release/render-packages/aftermath-aft-weapon-spar/render.glb';
const PACKAGE_URL = new URL(PACKAGE, import.meta.url);
const TEXTURE_SLOTS = ['map', 'normalMap', 'metalnessMap', 'roughnessMap', 'aoMap'];

let basisPending;
async function basisTranscoder() {
  if (!basisPending) {
    const source = readFileSync(new URL('../vendor/addons/libs/basis/basis_transcoder.js', import.meta.url), 'utf8');
    // The shipped Emscripten factory supports Node. Supply CommonJS bindings locally,
    // without installing browser globals or replacing the parser's image-loading methods.
    const factory = runInThisContext(
      `(function(require, __filename, __dirname) {\n${source}\nreturn BASIS;\n})`,
      { filename: 'glb-prepass-basis-fixture.js' },
    )(createRequire(import.meta.url), 'basis_transcoder.js', '.');
    basisPending = factory({
      wasmBinary: readFileSync(new URL('../vendor/addons/libs/basis/basis_transcoder.wasm', import.meta.url)),
    }).then((basis) => { basis.initializeBasis(); return basis; });
  }
  return basisPending;
}

function ktx2Decoder(basis, seen) {
  return { parse(bytes, onLoad, onError) {
    let file;
    try {
      seen.push(sha(new Uint8Array(bytes)));
      file = new basis.KTX2File(new Uint8Array(bytes));
      assert.ok(file.isValid(), 'the real KTX2 source must reach the transcoder');
      assert.equal(file.getFaces(), 1);
      assert.ok(file.getLayers() <= 1);
      assert.ok(file.startTranscoding());
      const mipmaps = [], format = KTX2Loader.TranscoderFormat.BC3;
      for (let mip = 0; mip < file.getLevels(); mip++) {
        const info = file.getImageLevelInfo(mip, 0, 0);
        const data = new Uint8Array(file.getImageTranscodedSizeInBytes(mip, 0, 0, format));
        assert.ok(data.byteLength > 0);
        assert.ok(file.transcodeImage(data, mip, 0, 0, format, 0, -1, -1));
        mipmaps.push({ data, width: info.origWidth, height: info.origHeight });
      }
      assert.ok(mipmaps.length > 0, 'parity must include populated decoded mip chains');
      const texture = new THREE.CompressedTexture(mipmaps, file.getWidth(), file.getHeight(),
        THREE.RGBA_S3TC_DXT5_Format, THREE.UnsignedByteType);
      texture.needsUpdate = true;
      structuredClone(bytes, { transfer: [bytes] }); // same detached-input contract as the worker
      onLoad(texture);
    } catch (error) {
      onError(error);
    } finally {
      file?.close(); file?.delete();
    }
  } };
}

async function verifiedResources() {
  const metadata = JSON.parse(readFileSync(new URL('render-package.json', PACKAGE_URL), 'utf8'));
  // Match the production decoder's verified sidecar registration. Native Node reads
  // the same published bytes locally instead of asking a browser to fetch file: URLs.
  return fetchVerifiedRenderResources(async (url) => new Response(readFileSync(new URL(url))),
    PACKAGE_URL.href, metadata);
}

function embedImages(glb, resources) {
  // The release package now shares external atlases. An exact-byte embedded variant
  // keeps the pre-sliced-image path covered without changing any mesh or image payload.
  const header = new DataView(glb), jsonLength = header.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength)));
  const binStart = 20 + jsonLength + 8;
  const chunks = [Buffer.from(glb, binStart, header.getUint32(binStart - 8, true))];
  let byteLength = chunks[0].byteLength;
  for (const image of json.images || []) {
    if (image.uri === undefined) continue;
    const bytes = resources.get(image.uri);
    assert.ok(bytes, `missing verified image ${image.uri}`);
    const padding = (4 - byteLength % 4) % 4;
    chunks.push(Buffer.alloc(padding), Buffer.from(bytes)); byteLength += padding;
    image.bufferView = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength });
    delete image.uri;
    byteLength += bytes.byteLength;
  }
  chunks.push(Buffer.alloc((4 - byteLength % 4) % 4));
  const binary = Buffer.concat(chunks);
  json.buffers[0].byteLength = binary.byteLength;
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const encodedJson = Buffer.concat([jsonBytes, Buffer.alloc((4 - jsonBytes.byteLength % 4) % 4, 0x20)]);
  const out = Buffer.alloc(12 + 8 + encodedJson.byteLength + 8 + binary.byteLength);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.byteLength, 8);
  out.writeUInt32LE(encodedJson.byteLength, 12); out.writeUInt32LE(0x4e4f534a, 16);
  encodedJson.copy(out, 20);
  const binaryHeader = 20 + encodedJson.byteLength;
  out.writeUInt32LE(binary.byteLength, binaryHeader); out.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(out, binaryHeader + 8);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

function textureFingerprint(texture) {
  assert.ok(texture?.isCompressedTexture, 'every material texture slot must remain populated');
  assert.ok(texture.image.width > 0 && texture.image.height > 0 && texture.mipmaps.length > 0);
  return [texture.name, texture.image.width, texture.image.height, texture.format, texture.type,
    texture.colorSpace, texture.flipY, texture.channel, texture.magFilter, texture.minFilter,
    texture.wrapS, texture.wrapT, texture.generateMipmaps, texture.offset.toArray(),
    texture.repeat.toArray(), texture.center.toArray(), texture.rotation,
    texture.mipmaps.map(m => {
      assert.ok(m.data.byteLength > 0, 'decoded mip payload cannot disappear from parity');
      return [m.width, m.height, sha(m.data)];
    })];
}

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
      entry.push(mats.map((m) => [m.type, m.name, m.color && m.color.getHexString(),
        m.metalness, m.roughness, m.side, m.opacity, m.alphaTest, m.normalScale.toArray(),
        m.aoMapIntensity, TEXTURE_SLOTS.map(slot => [slot, textureFingerprint(m[slot])])]).flat());
    }
    out.push(entry);
  });
  return out;
}

async function newLoader(resources, seen) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader(ktx2Decoder(await basisTranscoder(), seen));
  loader.register((parser) => {
    parser.verifiedExternalKtx2Resources = resources;
    return { name: 'SpaceFaceVerifiedExternalKtx2Resources' };
  });
  loader.register(registerEmbeddedKtx2Textures);
  return loader;
}

test('prepassGlb decodes byte-identical bufferViews and image slices', async () => {
  const glb = embedImages(readAb(PACKAGE), await verifiedResources());
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
  assert.ok(imageViewSet.size > 0, 'embedded-image slice coverage must not become vacuous');
  (json.images || []).forEach((image) => {
    if (image.uri !== undefined || image.bufferView === undefined) return;
    assert.ok(imageViewSet.has(image.bufferView), 'embedded image bufferView was not pre-sliced');
    const def = json.bufferViews[image.bufferView];
    const want = glb.slice(binStart + (def.byteOffset || 0), binStart + (def.byteOffset || 0) + def.byteLength);
    const got = new Map(images).get(image.bufferView);
    assert.equal(sha(new Uint8Array(got)), sha(new Uint8Array(want)), 'pre-sliced image bytes differ');
  });
});

for (const embedded of [false, true]) {
  test(`pre-pass preserves geometry, materials and real KTX2 mip payloads (${embedded ? 'embedded' : 'shared external'} images)`, async () => {
    const resources = await verifiedResources();
    assert.ok(resources.size > 0, 'the release package must exercise verified sidecars');
    const source = embedded ? embedImages(readAb(PACKAGE), resources) : readAb(PACKAGE);
    const expectedImages = [...resources.values()].map(sha).sort();
    const stockSeen = [], fedSeen = [];
    resetImageSourceDedupeForTests();
    const stockLoader = await newLoader(resources, stockSeen);
    const stock = await stockLoader.parseAsync(source.slice(0), '');
    const stockFingerprint = fingerprint(stock.scene);
    assert.deepEqual(stockSeen.sort(), expectedImages, 'stock parse must transcode every real source');
    // Neither parse may pass by borrowing the other's global decoded-image cache.
    resetImageSourceDedupeForTests();
    const glb = source.slice(0);
    const { decoded, images } = await prepassGlb(glb);
    const sourceBytes = new Map(images);
    const loader = await newLoader(resources, fedSeen);
    loader.register((parser) => {
      parser.predecodedBufferViews = new Map(decoded);
      parser.preslicedSourceBytes = sourceBytes;
      return { name: 'SpaceFaceGlbPrepass' };
    });
    const fed = await loader.parseAsync(glb, '');
    assert.deepEqual(fedSeen.sort(), expectedImages, 'pre-pass parse must transcode the same real sources');
    assert.deepEqual(fingerprint(fed.scene), stockFingerprint);
    if (embedded) assert.equal(sourceBytes.size, 0, 'the texture owner consumes the pre-sliced bytes');
  });
}

test('prepass passthrough: no Worker returns the input buffer untouched', async () => {
  const prepasser = createGlbPrepasser({ WorkerImpl: undefined });
  const glb = readAb(PACKAGE);
  const result = await prepasser.prepass(glb);
  assert.equal(result.glb, glb);
  assert.equal(glb.byteLength > 0, true, 'buffer must not be detached');
  assert.equal(result.bufferViews, null);
  assert.equal(result.sourceBytes, null);
});

test('prepass worker error reply hands the GLB back for the stock parse', async (t) => {
  class FailingWorker {
    constructor() { this.handlers = { message: [], error: [] }; }
    addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
    postMessage(data) {
      // Browser semantics: the transfer list detaches the buffer; a clean error reply returns it.
      const back = data.glb.slice(0);
      setTimeout(() => this.handlers.message.forEach((f) => f({ data: { id: data.id, ok: false, error: 'boom', glb: back } })), 0);
    }
    terminate() {}
  }
  const prepasser = createGlbPrepasser({ WorkerImpl: FailingWorker, workerUrl: 'x', cores: 8 });
  t.after(() => prepasser.dispose());
  const glb = readAb(PACKAGE);
  const result = await prepasser.prepass(glb);
  assert.ok(result, 'error replies must still resolve a result');
  assert.equal(result.bufferViews, null);
  assert.ok(result.glb && result.glb.byteLength === glb.byteLength, 'caller must get the GLB back');
});
