import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { compactUniformNormalTextures } from '../scripts/lib/compactUniformNormal.mjs';

const sourcePath = new URL('../assets/ships/release/parts/engines/engine_ion_small.glb', import.meta.url);
const basisJs = new URL('../vendor/addons/libs/basis/basis_transcoder.js', import.meta.url);
const basisWasm = new URL('../vendor/addons/libs/basis/basis_transcoder.wasm', import.meta.url);
let normalBytes;
test.before(async () => {
  await MeshoptDecoder.ready;
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(fileURLToPath(sourcePath));
  normalBytes = doc.getRoot().listTextures().find((t) => t.getName() === 'spaceface_neutral_normal_1024').getImage();
});

function fixture({ alsoColor = false, modify = false, used = true } = {}) {
  const doc = new Document(), image = normalBytes.slice();
  if (modify) image[image.length - 1] ^= 1;
  const texture = doc.createTexture('legacy-normal').setMimeType('image/ktx2').setImage(image);
  if (used) {
    const material = doc.createMaterial('hull').setNormalTexture(texture);
    if (alsoColor) material.setBaseColorTexture(texture);
  }
  return { doc, texture, image };
}

test('only the exact normal-only payload is compacted, retaining its material binding', () => {
  const { doc, texture } = fixture();
  const material = doc.getRoot().listMaterials()[0];
  assert.equal(compactUniformNormalTextures(doc), 1);
  assert.equal(material.getNormalTexture(), texture);
  assert.equal(texture.getMimeType(), 'image/ktx2');
  assert.equal(texture.getName(), 'spaceface_neutral_normal_4x4');
  const bytes = Buffer.from(texture.getImage());
  assert.equal(bytes.readUInt32LE(20), 4);
  assert.equal(bytes.readUInt32LE(24), 4);
  assert.equal(bytes.readUInt32LE(40), 3);
  const descriptor = (input) => {
    const ktx = Buffer.from(input), offset = ktx.readUInt32LE(48), size = ktx.readUInt32LE(52);
    return ktx.subarray(offset, offset + size);
  };
  assert.deepEqual(descriptor(bytes), descriptor(normalBytes));
  assert.equal(bytes.readUInt32LE(44), Buffer.from(normalBytes).readUInt32LE(44));
  assert.equal(compactUniformNormalTextures(doc), 0);
});

test('mixed-use, modified and unreferenced images remain untouched', () => {
  for (const options of [{ alsoColor: true }, { modify: true }, { used: false }]) {
    const { doc, texture, image } = fixture(options);
    assert.equal(compactUniformNormalTextures(doc), 0);
    assert.deepEqual(texture.getImage(), image);
    assert.equal(texture.getName(), 'legacy-normal');
  }
});

test('an explicitly externalized legacy payload keeps its content-addressed identity', () => {
  const { doc, texture, image } = fixture();
  const legacy = 'd807ff9d413cdf8c3b4b2a1bbe28d2002f70a5e7f667bacebb23d132977e4be0';
  assert.equal(compactUniformNormalTextures(doc, { preserveKtx2Hashes: new Set([legacy]) }), 0);
  assert.deepEqual(texture.getImage(), image);
});

test('the compact payload reuses the fin package’s existing neutral image', async () => {
  const { doc, texture } = fixture();
  compactUniformNormalTextures(doc);
  const finPath = new URL('../assets/ships/release/render-packages/fin-wedge/render.glb', import.meta.url);
  const fin = await new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(fileURLToPath(finPath));
  const existing = fin.getRoot().listTextures().find((t) => t.getName().startsWith('spaceface_neutral_normal_4'));
  assert.ok(existing);
  assert.deepEqual(texture.getImage(), existing.getImage());
});

test('all mip levels decode to the same pixels and BC7 blocks as the existing normal map', async () => {
  const { doc, texture } = fixture();
  compactUniformNormalTextures(doc);
  const source = await readFile(basisJs, 'utf8');
  const factory = runInThisContext(`(function(require,__filename,__dirname){\n${source}\nreturn BASIS;\n})`,
    { filename: 'compact-normal-basis-fixture.js' })(createRequire(import.meta.url), 'basis_transcoder.js', '.');
  const basis = await factory({ wasmBinary: await readFile(basisWasm) });
  basis.initializeBasis();
  const units = (bytes, format, width) => {
    const file = new basis.KTX2File(new Uint8Array(bytes));
    try {
      assert.ok(file.isValid() && file.startTranscoding());
      const values = new Set();
      for (let level = 0; level < file.getLevels(); level++) {
        const data = new Uint8Array(file.getImageTranscodedSizeInBytes(level, 0, 0, format));
        assert.ok(file.transcodeImage(data, level, 0, 0, format, 0, -1, -1));
        for (let i = 0; i < data.length; i += width) values.add(Buffer.from(data.subarray(i, i + width)).toString('hex'));
      }
      return [...values];
    } finally { file.close(); file.delete(); }
  };
  for (const [format, unitWidth] of [[13, 4], [6, 16]]) { // RGBA32, BC7
    const before = units(normalBytes, format, unitWidth);
    assert.equal(before.length, 1, 'the source stays uniform across every mip');
    assert.deepEqual(units(texture.getImage(), format, unitWidth), before);
  }
});
