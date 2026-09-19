import test from 'node:test';
import assert from 'node:assert/strict';
import { Document } from '@gltf-transform/core';
import { PNG } from 'pngjs';
import { cachedKtx2, textureEncodingKey } from '../scripts/lib/cachedKtx2.mjs';

test('texture cache binds source bytes, encoder settings and decoder, independently of slot selection', () => {
  const image = Buffer.from('original-paint');
  const options = { isUASTC: true, isPerceptual: true, slots: /baseColorTexture/ };
  const key = textureEncodingKey(image, options);
  assert.equal(key, textureEncodingKey(image, { ...options, slots: /emissiveTexture/ }));
  assert.notEqual(key, textureEncodingKey(Buffer.from('changed-paint'), options));
  assert.notEqual(key, textureEncodingKey(image, { ...options, isPerceptual: false }));
  assert.notEqual(key, textureEncodingKey(image, { ...options, generateMipmap: true }));
  assert.notEqual(key, textureEncodingKey(image, { ...options, imageDecoder: () => 1 }));
});

test('cached encoding preserves excluded slots and produces identical KTX2 across documents', async () => {
  const png = new PNG({ width: 4, height: 4 });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([30 + i, 120, 180, 255], i);
  const image = PNG.sync.write(png);
  const options = {
    slots: /^baseColorTexture$/, isUASTC: true, uastcLDRQualityLevel: 0,
    generateMipmap: true, isPerceptual: true, isSetKTX2SRGBTransferFunc: true,
    imageDecoder: async (bytes) => {
      const decoded = PNG.sync.read(Buffer.from(bytes));
      return { data: decoded.data, width: decoded.width, height: decoded.height };
    },
  };
  const make = () => {
    const document = new Document();
    const paint = document.createTexture('paint').setImage(image).setMimeType('image/png');
    const normal = document.createTexture('normal').setImage(image).setMimeType('image/png');
    document.createMaterial().setBaseColorTexture(paint).setNormalTexture(normal);
    return { document, paint, normal };
  };
  const first = make(), second = make();
  await first.document.transform(cachedKtx2(options));
  await second.document.transform(cachedKtx2(options));
  assert.equal(first.paint.getMimeType(), 'image/ktx2');
  assert.equal(first.normal.getMimeType(), 'image/png');
  assert.deepEqual(first.normal.getImage(), image);
  assert.deepEqual(first.paint.getImage(), second.paint.getImage());
  assert.ok(first.document.getRoot().listExtensionsRequired().some((extension) => extension.extensionName === 'KHR_texture_basisu'));
});
