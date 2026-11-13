import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { compactUniformOrmTextures } from '../scripts/lib/compactUniformOrm.mjs';

let legacyBytes;
test.before(async () => {
  await MeshoptDecoder.ready;
  const path = new URL('../assets/ships/release/parts/cockpits/cockpit_dome.glb', import.meta.url);
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder }).read(fileURLToPath(path));
  legacyBytes = doc.getRoot().listTextures().find((t) => t.getName() === 'spaceface_neutral_orm_1024').getImage();
});

function fixture({ mixed = false, modified = false, used = true } = {}) {
  const doc = new Document(), image = legacyBytes.slice();
  if (modified) image[image.length - 1] ^= 1;
  const texture = doc.createTexture('legacy-orm').setMimeType('image/ktx2').setImage(image);
  if (used) {
    const material = doc.createMaterial('hull').setOcclusionTexture(texture).setMetallicRoughnessTexture(texture);
    if (mixed) material.setBaseColorTexture(texture);
  }
  return { doc, texture, image };
}

test('only the identical ORM image is reduced while both material bindings remain', () => {
  const { doc, texture } = fixture(), material = doc.getRoot().listMaterials()[0];
  assert.equal(compactUniformOrmTextures(doc), 1);
  assert.equal(material.getOcclusionTexture(), texture);
  assert.equal(material.getMetallicRoughnessTexture(), texture);
  assert.equal(texture.getName(), 'spaceface_neutral_orm_4x4');
  const bytes = Buffer.from(texture.getImage()), original = Buffer.from(legacyBytes);
  assert.equal(bytes.readUInt32LE(20), 4);
  assert.equal(bytes.readUInt32LE(24), 4);
  const descriptor = (input) => input.subarray(input.readUInt32LE(48), input.readUInt32LE(48) + input.readUInt32LE(52));
  assert.deepEqual(descriptor(bytes), descriptor(original));
  assert.equal(bytes.readUInt32LE(44), original.readUInt32LE(44));
  assert.equal(compactUniformOrmTextures(doc), 0);
});

test('mixed, altered, unreferenced and externally addressed images remain unchanged', () => {
  for (const options of [{ mixed: true }, { modified: true }, { used: false }]) {
    const { doc, texture, image } = fixture(options);
    assert.equal(compactUniformOrmTextures(doc), 0);
    assert.deepEqual(texture.getImage(), image);
  }
  const { doc, texture, image } = fixture();
  assert.equal(compactUniformOrmTextures(doc, { preserveKtx2Hashes: new Set([
    '3acbf9b454fbfcb76d2f87991cd340dc92c8899ad812a2720632e0f994cc58f3',
  ]) }), 0);
  assert.deepEqual(texture.getImage(), image);
});

test('all mip levels decode to the same RGBA pixels and BC7 blocks', async () => {
  const { doc, texture } = fixture();
  compactUniformOrmTextures(doc);
  const js = await readFile(new URL('../vendor/addons/libs/basis/basis_transcoder.js', import.meta.url), 'utf8');
  const factory = runInThisContext(`(function(require,__filename,__dirname){\n${js}\nreturn BASIS;\n})`,
    { filename: 'compact-orm-basis-fixture.js' })(createRequire(import.meta.url), 'basis_transcoder.js', '.');
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
  for (const [format, width] of [[13, 4], [6, 16]]) {
    const before = units(legacyBytes, format, width);
    assert.equal(before.length, 1);
    assert.deepEqual(units(texture.getImage(), format, width), before);
  }
});
