import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { compactUniformWhiteAlbedoTextures } from '../scripts/lib/compactUniformWhiteAlbedo.mjs';

let legacyBytes;
test.before(async () => {
  await MeshoptDecoder.ready;
  const path = new URL('../assets/ships/release/parts/engines/engine_plasma_ring.glb', import.meta.url);
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(fileURLToPath(path));
  legacyBytes = doc.getRoot().listTextures().find((t) => t.getName() === 'spaceface_neutral_baseColor_1024').getImage();
});

function fixture({ mixed = false, modified = false, used = true } = {}) {
  const doc = new Document(), image = legacyBytes.slice();
  if (modified) image[image.length - 1] ^= 1;
  const texture = doc.createTexture('legacy-white').setMimeType('image/ktx2').setImage(image);
  if (used) {
    const material = doc.createMaterial('hull').setBaseColorTexture(texture);
    if (mixed) material.setEmissiveTexture(texture);
  }
  return { doc, texture, image };
}

test('only the reviewed white base-color image is reduced while its material binding stays intact', () => {
  const { doc, texture } = fixture(), material = doc.getRoot().listMaterials()[0];
  assert.equal(compactUniformWhiteAlbedoTextures(doc), 1);
  assert.equal(material.getBaseColorTexture(), texture);
  assert.equal(texture.getName(), 'spaceface_neutral_baseColor_4x4');
  const bytes = Buffer.from(texture.getImage()), original = Buffer.from(legacyBytes);
  assert.equal(bytes.readUInt32LE(20), 4);
  assert.equal(bytes.readUInt32LE(24), 4);
  const descriptor = (input) => input.subarray(input.readUInt32LE(48), input.readUInt32LE(48) + input.readUInt32LE(52));
  assert.deepEqual(descriptor(bytes), descriptor(original));
  assert.equal(bytes[bytes.readUInt32LE(48) + 14], 2, 'retain sRGB transfer');
  assert.equal(bytes.readUInt32LE(44), original.readUInt32LE(44));
  assert.equal(compactUniformWhiteAlbedoTextures(doc), 0);
});

test('mixed, altered, unreferenced and externally addressed images remain unchanged', () => {
  for (const options of [{ mixed: true }, { modified: true }, { used: false }]) {
    const { doc, texture, image } = fixture(options);
    assert.equal(compactUniformWhiteAlbedoTextures(doc), 0);
    assert.deepEqual(texture.getImage(), image);
  }
  const { doc, texture, image } = fixture();
  assert.equal(compactUniformWhiteAlbedoTextures(doc, { preserveKtx2Hashes: new Set([
    '2c2dead0a956ce7e89a03dd239c3a4fee7819db6b39eed54f519395a8e5e57ca',
  ]) }), 0);
  assert.deepEqual(texture.getImage(), image);
});

test('every mip retains identical opaque white pixels and GPU-compressed blocks', async () => {
  const { doc, texture } = fixture();
  compactUniformWhiteAlbedoTextures(doc);
  const js = await readFile(new URL('../vendor/addons/libs/basis/basis_transcoder.js', import.meta.url), 'utf8');
  const factory = runInThisContext(`(function(require,__filename,__dirname){\n${js}\nreturn BASIS;\n})`,
    { filename: 'compact-white-albedo-basis-fixture.js' })(createRequire(import.meta.url), 'basis_transcoder.js', '.');
  const basis = await factory({ wasmBinary: await readFile(new URL('../vendor/addons/libs/basis/basis_transcoder.wasm', import.meta.url)) });
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
  for (const [format, width] of [[13, 4], [3, 16], [6, 16], [10, 16], [1, 16]]) {
    const before = units(legacyBytes, format, width);
    assert.equal(before.length, 1);
    assert.deepEqual(units(texture.getImage(), format, width), before);
    if (format === 13) assert.deepEqual(before, ['ffffffff']);
  }
});
