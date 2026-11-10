import assert from 'node:assert/strict';
import test from 'node:test';

import sharp from 'sharp';

import {
  deriveOrmMap,
  deriveOrmMapPng,
} from '../tools/art/lib/derivedOrmMap.mjs';

async function rgbaPng(width, height, pixelAt) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const [red, green, blue, alpha = 255] = pixelAt(x, y);
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      pixels[offset + 3] = alpha;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function pixels(png) {
  return sharp(png).raw().toBuffer({ resolveWithObject: true });
}

test('copies authored AO red and packs exact scalar roughness and metallic channels', async () => {
  const reference = await rgbaPng(4, 2, (x, y) => [20 + x * 50, 30 + y * 100, 210]);
  const ao = await rgbaPng(4, 2, (x, y) => {
    const value = 24 + x * 31 + y * 7;
    return [value, 255 - value, 3];
  });

  const { png, metadata } = await deriveOrmMap(reference, {
    aoPng: ao,
    roughness: 0.6,
    metallic: 0.2,
  });
  const decoded = await pixels(png);

  assert.equal(decoded.info.width, 4);
  assert.equal(decoded.info.height, 2);
  for (let pixel = 0; pixel < 8; pixel++) {
    const x = pixel % 4;
    const y = Math.floor(pixel / 4);
    assert.equal(decoded.data[pixel * 4], 24 + x * 31 + y * 7);
    assert.equal(decoded.data[pixel * 4 + 1], 153);
    assert.equal(decoded.data[pixel * 4 + 2], 51);
    assert.equal(decoded.data[pixel * 4 + 3], 255);
  }
  assert.equal(metadata.channelSources.red, 'authored-ao-red');
  assert.equal(metadata.channelSources.green, 'explicit-roughness-scalar');
  assert.equal(metadata.channelSources.blue, 'explicit-metallic-scalar');
  assert.equal(metadata.ao.mode, 'authored-ao');
  assert.equal(metadata.ao.fallbackReason, null);
});

test('base-color and wear pixels cannot influence ORM channel values', async () => {
  const darkReference = await rgbaPng(4, 4, () => [0, 0, 0]);
  const loudReference = await rgbaPng(4, 4, (x, y) => [
    255 - x * 40,
    y * 60,
    (x + y) * 30,
  ]);
  const ao = await rgbaPng(4, 4, (x, y) => {
    const value = 80 + x * 9 + y * 11;
    return [value, value, value];
  });

  const first = await deriveOrmMapPng(darkReference, {
    aoPng: ao,
    wearPng: Buffer.from('not even an image'),
    roughness: 0.47,
    metallic: 0.73,
  });
  const second = await deriveOrmMapPng(loudReference, {
    aoPng: ao,
    wearPng: await rgbaPng(4, 4, (x, y) => [x * 80, y * 80, 255]),
    roughness: 0.47,
    metallic: 0.73,
  });

  assert.deepEqual(first, second);
  assert.equal(first.ormMetadata.ao.mode, 'authored-ao');
});

test('missing, invalid, and flat-black AO use neutral AO with explicit fallback metadata', async (t) => {
  const reference = await rgbaPng(3, 2, (x, y) => [20 + x, 40 + y, 60]);
  const cases = [
    ['missing-authored-ao', null],
    ['invalid-authored-ao', Buffer.from('not an image')],
    ['flat-black-authored-ao', await rgbaPng(3, 2, () => [0, 0, 0])],
  ];

  for (const [reason, aoPng] of cases) {
    await t.test(reason, async () => {
      const { png, metadata } = await deriveOrmMap(reference, {
        aoPng,
        roughness: 0.72,
        metallic: 0.12,
      });
      const decoded = await pixels(png);
      for (let pixel = 0; pixel < 6; pixel++) {
        assert.equal(decoded.data[pixel * 4], 255);
        assert.equal(decoded.data[pixel * 4 + 1], 184);
        assert.equal(decoded.data[pixel * 4 + 2], 31);
      }
      assert.equal(metadata.ao.mode, 'neutral-fallback');
      assert.equal(metadata.ao.fallbackReason, reason);
      assert.equal(metadata.recommendedTexturePolicy, 'neutral-ao-constant-material-class');
    });
  }
});

test('requires explicit physically valid material scalars', async () => {
  const reference = await rgbaPng(1, 1, () => [10, 20, 30]);
  await assert.rejects(
    () => deriveOrmMap(reference, { metallic: 0.2 }),
    /roughness must be an explicit finite scalar/,
  );
  await assert.rejects(
    () => deriveOrmMap(reference, { roughness: 0.5, metallic: 1.1 }),
    /metallic must be an explicit finite scalar in \[0, 1\]/,
  );
});
