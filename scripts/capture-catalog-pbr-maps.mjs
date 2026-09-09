import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { PNG } from 'pngjs';

const input = resolve(process.argv[2] || 'assets/ships/parts/cockpits/cockpit_slab.glb');
const stem = basename(input, extname(input));
const output = resolve(process.argv[3] || `.devshots/graphics/catalog-pbr-maps/${stem}`);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const document = await io.read(input);
const textures = document.getRoot().listTextures();

await mkdir(output, { recursive: true });
const rows = [];
const ormChannels = [];
for (const [index, texture] of textures.entries()) {
  const sourceBytes = texture.getImage();
  const mimeType = texture.getMimeType();
  if (!sourceBytes || !['image/png', 'image/ktx2'].includes(mimeType)) {
    throw new Error(`${texture.getName() || index}: expected embedded PNG or KTX2, got ${mimeType || 'none'}`);
  }
  const name = sanitize(texture.getName() || `texture_${index}`);
  const prefix = `${String(index).padStart(2, '0')}_${name}`;
  const path = resolve(output, `${prefix}.png`);
  let decodedBytes = sourceBytes;
  let sourcePath = path;
  if (mimeType === 'image/ktx2') {
    sourcePath = resolve(output, `${prefix}.ktx2`);
    await writeFile(sourcePath, sourceBytes);
    const extraction = spawnSync('ktx', [
      'extract', '--transcode', 'rgba8', sourcePath, path,
    ], { encoding: 'utf8', windowsHide: true });
    if (extraction.status !== 0) {
      throw new Error(`KTX2 extraction failed (${extraction.status}) for ${name}: ${extraction.stderr || extraction.stdout}`);
    }
    decodedBytes = await readFile(path);
  } else {
    await writeFile(path, sourceBytes);
  }
  rows.push({
    index,
    name: texture.getName() || name,
    path,
    sourcePath,
    mimeType,
    bytes: sourceBytes.length,
    sha256: sha256(sourceBytes),
    decodedSha256: sha256(decodedBytes),
  });
  if (name.endsWith('_orm')) {
    const png = PNG.sync.read(Buffer.from(decodedBytes));
    for (const [channel, offset] of [['ao', 0], ['roughness', 1], ['metallic', 2]]) {
      const grayscale = new PNG({ width: png.width, height: png.height });
      const values = [];
      for (let pixel = 0; pixel < png.width * png.height; pixel++) {
        const value = png.data[pixel * 4 + offset];
        values.push(value);
        grayscale.data[pixel * 4] = value;
        grayscale.data[pixel * 4 + 1] = value;
        grayscale.data[pixel * 4 + 2] = value;
        grayscale.data[pixel * 4 + 3] = 255;
      }
      const channelPath = resolve(output, `${name}_${channel}.png`);
      await writeFile(channelPath, PNG.sync.write(grayscale));
      ormChannels.push({ texture: name, channel, path: channelPath, ...statistics(values) });
    }
  }
}

const contactSheet = resolve(output, `${stem}_pbr-contact.png`);
const montage = spawnSync('magick', [
  'montage',
  '-background', '#05070a',
  '-fill', '#e8edf2',
  '-pointsize', '18',
  '-label', '%t',
  ...rows.map((row) => row.path),
  '-tile', '3x',
  '-geometry', '512x512+14+34',
  contactSheet,
], { encoding: 'utf8', windowsHide: true });
if (montage.status !== 0) {
  throw new Error(`ImageMagick montage failed (${montage.status}): ${montage.stderr || montage.stdout}`);
}

const ormContactSheet = resolve(output, `${stem}_orm-channels-contact.png`);
const ormMontage = spawnSync('magick', [
  'montage',
  '-background', '#05070a',
  '-fill', '#e8edf2',
  '-pointsize', '18',
  '-label', '%t',
  ...ormChannels.map((row) => row.path),
  '-tile', '3x',
  '-geometry', '512x512+14+34',
  ormContactSheet,
], { encoding: 'utf8', windowsHide: true });
if (ormMontage.status !== 0) {
  throw new Error(`ImageMagick ORM montage failed (${ormMontage.status}): ${ormMontage.stderr || ormMontage.stdout}`);
}

const materialRoles = document.getRoot().listMaterials().map((material) => ({
  name: material.getName(),
  role: material.getExtras()?.spacefaceMaterialRole || null,
  surfaceRecipe: material.getExtras()?.spacefaceSurfaceRecipe || null,
  baseColorTexture: material.getBaseColorTexture()?.getName() || null,
  normalTexture: material.getNormalTexture()?.getName() || null,
  metallicRoughnessTexture: material.getMetallicRoughnessTexture()?.getName() || null,
  occlusionTexture: material.getOcclusionTexture()?.getName() || null,
}));
const audit = {
  schema: 'spaceface.catalogPbrMapEvidence.v2',
  input,
  inputSha256: sha256(await readFile(input)),
  textureCount: rows.length,
  textures: rows,
  ormChannels,
  materialRoles,
  contactSheet,
  ormContactSheet,
};
await writeFile(resolve(output, 'texture-audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);

function sanitize(value) {
  return String(value).replace(/[^a-z0-9_.-]+/gi, '_').replace(/^_+|_+$/g, '') || 'texture';
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function statistics(values) {
  let min = 255;
  let max = 0;
  let sum = 0;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
  }
  const mean = sum / Math.max(1, values.length);
  let variance = 0;
  for (const value of values) variance += (value - mean) ** 2;
  return {
    min,
    max,
    mean: Number(mean.toFixed(3)),
    standardDeviation: Number(Math.sqrt(variance / Math.max(1, values.length)).toFixed(3)),
  };
}
