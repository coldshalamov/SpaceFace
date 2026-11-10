import assert from 'node:assert/strict';
import test from 'node:test';

import sharp from 'sharp';

import { auditEmbeddedTextureChannels } from '../tools/art/lib/textureChannelAudit.mjs';

async function png(width, height, pixelAt) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const [red, green, blue, alpha = 255] = pixelAt(x, y);
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = alpha;
    }
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function fixtureDocument(images, material, policiesByImage = {}) {
  const chunks = [];
  const bufferViews = [];
  let byteOffset = 0;
  for (const image of images) {
    chunks.push(image);
    bufferViews.push({ buffer: 0, byteOffset, byteLength: image.length });
    byteOffset += image.length;
  }
  return {
    binary: Buffer.concat(chunks),
    gltf: {
      bufferViews,
      images: images.map((_, index) => ({
        name: `fixture_${index}`,
        bufferView: index,
        mimeType: 'image/png',
        ...(policiesByImage[index]
          ? { extras: { spacefaceTexturePolicy: policiesByImage[index] } }
          : {}),
      })),
      textures: images.map((_, index) => ({ source: index })),
      materials: [material],
    },
  };
}

test('reports a near-flat tangent-space normal and flat ORM channels as advisories', async () => {
  const base = await png(4, 4, (x, y) => [30 + x * 20, 40 + y * 20, 50 + (x + y) * 8]);
  const normal = await png(4, 4, () => [128, 128, 255]);
  const orm = await png(4, 4, () => [255, 180, 12]);
  const fixture = fixtureDocument([base, normal, orm], {
    name: 'Material_Hull',
    pbrMetallicRoughness: {
      baseColorTexture: { index: 0 },
      metallicRoughnessTexture: { index: 2 },
    },
    normalTexture: { index: 1 },
    occlusionTexture: { index: 2 },
  });

  const report = await auditEmbeddedTextureChannels(fixture, 'flat-data-fixture');
  assert.equal(report.summary.errors, 0);
  assert.ok(report.findings.some((finding) => finding.code === 'near-flat-normal'));
  assert.ok(report.findings.some((finding) => finding.code === 'flat-orm'));
});

test('reports declared neutral normal and neutral-AO material-class maps as info', async () => {
  const base = await png(4, 4, (x, y) => [30 + x * 20, 40 + y * 20, 50 + (x + y) * 8]);
  const normal = await png(4, 4, () => [128, 128, 255]);
  const orm = await png(4, 4, () => [255, 180, 12]);
  const fixture = fixtureDocument(
    [base, normal, orm],
    {
      name: 'Material_Hull',
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicRoughnessTexture: { index: 2 },
      },
      normalTexture: { index: 1 },
      occlusionTexture: { index: 2 },
    },
    {
      1: ['neutral-normal-no-authored-height'],
      2: ['neutral-ao-constant-material-class'],
    },
  );

  const report = await auditEmbeddedTextureChannels(fixture, 'declared-neutral-fixture');
  assert.equal(report.summary.errors, 0);
  assert.equal(
    report.findings.some((finding) => finding.severity === 'warning'
      && ['near-flat-normal', 'flat-orm'].includes(finding.code)),
    false,
  );
  assert.ok(report.findings.some((finding) => finding.severity === 'info'
    && finding.code === 'declared-neutral-normal'
    && finding.policy === 'neutral-normal-no-authored-height'));
  assert.ok(report.findings.some((finding) => finding.severity === 'info'
    && finding.code === 'declared-neutral-orm'
    && finding.policy === 'neutral-ao-constant-material-class'));
});

test('a policy label cannot suppress a flat map that does not match its declared neutral data', async () => {
  const base = await png(4, 4, (x, y) => [30 + x * 20, 40 + y * 20, 50 + (x + y) * 8]);
  const invalidNormal = await png(4, 4, () => [0, 0, 0]);
  const blackOrm = await png(4, 4, () => [0, 180, 12]);
  const fixture = fixtureDocument(
    [base, invalidNormal, blackOrm],
    {
      name: 'Material_Hull',
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        metallicRoughnessTexture: { index: 2 },
      },
      normalTexture: { index: 1 },
      occlusionTexture: { index: 2 },
    },
    {
      1: ['neutral-normal-no-authored-height'],
      2: ['neutral-ao-constant-material-class'],
    },
  );

  const report = await auditEmbeddedTextureChannels(fixture, 'misdeclared-neutral-fixture');
  assert.ok(report.findings.some((finding) => finding.severity === 'warning'
    && finding.code === 'near-flat-normal'));
  assert.ok(report.findings.some((finding) => finding.severity === 'warning'
    && finding.code === 'flat-orm'));
});

test('detects identical bytes occupying incompatible color and data roles', async () => {
  const aliased = await png(4, 4, (x, y) => [20 + x * 30, 80 + y * 20, 120]);
  const orm = await png(4, 4, (x, y) => [255, 100 + x, 30 + y]);
  const fixture = fixtureDocument([aliased, aliased, orm], {
    name: 'Material_Aliased',
    pbrMetallicRoughness: {
      baseColorTexture: { index: 0 },
      metallicRoughnessTexture: { index: 2 },
    },
    normalTexture: { index: 1 },
    occlusionTexture: { index: 2 },
  });

  const report = await auditEmbeddedTextureChannels(fixture, 'alias-fixture');
  assert.equal(report.summary.errors, 1);
  assert.match(
    report.findings.find((finding) => finding.code === 'incompatible-role-alias')?.message || '',
    /baseColor.*normal/,
  );
});

test('surfaces incomplete per-material texture role coverage as a correctness error', async () => {
  const base = await png(4, 4, (x, y) => [20 + x * 30, 80 + y * 20, 120]);
  const fixture = fixtureDocument([base], {
    name: 'Material_BaseOnly',
    pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
  });

  const report = await auditEmbeddedTextureChannels(fixture, 'partial-role-fixture');
  assert.equal(report.summary.errors, 1);
  assert.match(
    report.findings.find((finding) => finding.code === 'incomplete-material-role-coverage')?.message || '',
    /Material_BaseOnly.*normal.*metallicRoughness.*occlusion/s,
  );
});

test('reports unbound embedded images without turning an advisory into a failing error', async () => {
  const base = await png(4, 4, (x) => [40 + x, 50, 60]);
  const normal = await png(4, 4, (x) => [126 + x, 128, 250]);
  const orm = await png(4, 4, (x, y) => [240 - x, 120 + y, 15 + x + y]);
  const orphan = await png(4, 4, () => [2, 4, 8]);
  const fixture = fixtureDocument([base, normal, orm, orphan], {
    name: 'Material_Hull',
    pbrMetallicRoughness: {
      baseColorTexture: { index: 0 },
      metallicRoughnessTexture: { index: 2 },
    },
    normalTexture: { index: 1 },
    occlusionTexture: { index: 2 },
  });

  const report = await auditEmbeddedTextureChannels(fixture, 'orphan-fixture');
  assert.equal(report.summary.errors, 0);
  assert.ok(report.findings.some((finding) => finding.code === 'unbound-embedded-image' && finding.imageIndex === 3));
});
