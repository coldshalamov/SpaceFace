import assert from 'node:assert/strict';
import test from 'node:test';

import sharp from 'sharp';

import { deriveNormalMapPng } from '../tools/art/lib/derivedNormalMap.mjs';

async function sourcePng(width, height, pixelAt) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const value = pixelAt(x, y);
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

test('a flat source becomes a neutral OpenGL tangent-space normal', async () => {
  const source = await sourcePng(8, 8, () => 96);
  const normal = await deriveNormalMapPng(source, { blurSigma: 0, strength: 1 });
  const decoded = await sharp(normal).raw().toBuffer({ resolveWithObject: true });

  for (let offset = 0; offset < decoded.data.length; offset += decoded.info.channels) {
    assert.equal(decoded.data[offset], 128);
    assert.equal(decoded.data[offset + 1], 128);
    assert.equal(decoded.data[offset + 2], 255);
  }
});

test('a vertical surface edge produces horizontal normal variation while blue stays dominant', async () => {
  const source = await sourcePng(16, 16, (x) => x < 8 ? 24 : 224);
  const normal = await deriveNormalMapPng(source, { blurSigma: 0.6, strength: 0.8 });
  const stats = await sharp(normal).stats();

  assert.ok(stats.channels[0].stdev > 5, `red normal variation should represent the edge, got ${stats.channels[0].stdev}`);
  assert.ok(stats.channels[1].stdev < 1, `green should stay flat for a vertical edge, got ${stats.channels[1].stdev}`);
  assert.ok(stats.channels[2].mean > 220, `blue must remain dominant, got ${stats.channels[2].mean}`);
});
