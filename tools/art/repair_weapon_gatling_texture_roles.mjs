#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { deriveNormalMapPng } from './lib/derivedNormalMap.mjs';
import { publishTwoFileTransaction } from './lib/twoFileTransaction.mjs';
import { auditEmbeddedTextureChannels } from './lib/textureChannelAudit.mjs';
import { parseStrictEmbeddedGlb } from './lib/strictGlbValidation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_PATH = resolve(ROOT, 'assets/ships/parts/weapons/weapon_gatling.glb');
const MANIFEST_PATH = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const APPLY = process.argv.includes('--apply');

function resolveImageIndex(gltf, textureIndex) {
  const texture = gltf.textures?.[textureIndex];
  return texture?.extensions?.KHR_texture_basisu?.source ?? texture?.source ?? null;
}

function imagePayload(gltf, binary, imageIndex) {
  const image = gltf.images?.[imageIndex];
  const view = gltf.bufferViews?.[image?.bufferView];
  if (!image || !view || image.uri || (view.buffer ?? 0) !== 0) {
    throw new Error(`image ${imageIndex} is not an embedded source image`);
  }
  const offset = view.byteOffset ?? 0;
  return binary.subarray(offset, offset + view.byteLength);
}

function appendImage(gltf, binary, payload, name) {
  const padding = (4 - (binary.length % 4)) % 4;
  const byteOffset = binary.length + padding;
  const packed = Buffer.concat([binary, Buffer.alloc(padding), Buffer.from(payload)]);
  const bufferView = gltf.bufferViews.length;
  gltf.bufferViews.push({
    buffer: 0,
    byteOffset,
    byteLength: payload.length,
  });
  const imageIndex = gltf.images.length;
  gltf.images.push({
    name,
    bufferView,
    mimeType: 'image/png',
  });
  gltf.buffers[0].byteLength = packed.length;
  return { binary: packed, imageIndex };
}

function serializeGlb(gltf, binary) {
  const jsonPayload = Buffer.from(JSON.stringify(gltf));
  const jsonPadding = (4 - (jsonPayload.length % 4)) % 4;
  const json = Buffer.concat([jsonPayload, Buffer.alloc(jsonPadding, 0x20)]);
  const binPadding = (4 - (binary.length % 4)) % 4;
  const bin = Buffer.concat([binary, Buffer.alloc(binPadding)]);
  const totalLength = 12 + 8 + json.length + 8 + bin.length;
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  let offset = 12;
  output.writeUInt32LE(json.length, offset);
  output.writeUInt32LE(0x4e4f534a, offset + 4);
  json.copy(output, offset + 8);
  offset += 8 + json.length;
  output.writeUInt32LE(bin.length, offset);
  output.writeUInt32LE(0x004e4942, offset + 4);
  bin.copy(output, offset + 8);
  return output;
}

function geometrySignature(gltf) {
  const payload = JSON.stringify({
    scenes: gltf.scenes,
    scene: gltf.scene,
    nodes: gltf.nodes,
    meshes: gltf.meshes,
    accessors: gltf.accessors,
    skins: gltf.skins,
    animations: gltf.animations,
  });
  return createHash('sha256').update(payload).digest('hex');
}

function materialByName(gltf, name) {
  const material = gltf.materials?.find((entry) => entry.name === name);
  if (!material) throw new Error(`missing ${name}`);
  return material;
}

async function deriveOrmPng(sourcePng, roughness, metallic) {
  const decoded = await sharp(sourcePng).greyscale().blur(0.7).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  const blue = Math.round(Math.max(0, Math.min(1, metallic)) * 255);
  const baseRoughness = Math.max(0, Math.min(1, roughness));
  const output = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const luminance = decoded.data[pixel * channels] / 255;
    const localRoughness = Math.max(0.08, Math.min(0.92, baseRoughness + (0.5 - luminance) * 0.25));
    const offset = pixel * 4;
    output[offset] = 255;
    output[offset + 1] = Math.round(localRoughness * 255);
    output[offset + 2] = blue;
    output[offset + 3] = 255;
  }
  return sharp(output, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const parsed = parseStrictEmbeddedGlb(readFileSync(SOURCE_PATH), 'weapon_gatling source');
if (parsed.gltf.asset?.extras?.sourceProvenance?.textureRoleCorrection === 'weapon-gatling-2026-07-27') {
  const existingReport = await auditEmbeddedTextureChannels(parsed, 'weapon_gatling current source');
  if (existingReport.summary.errors) {
    throw new Error('weapon_gatling carries the correction stamp but fails the texture-channel audit');
  }
  console.log(JSON.stringify({
    mode: 'already-repaired',
    sourceBytes: readFileSync(SOURCE_PATH).length,
    images: parsed.gltf.images?.length || 0,
    audit: existingReport.summary,
  }, null, 2));
  process.exit(0);
}
const gltf = structuredClone(parsed.gltf);
let binary = Buffer.from(parsed.binary.subarray(0, parsed.gltf.buffers[0].byteLength));
const beforeGeometry = geometrySignature(gltf);

const mechanical = materialByName(gltf, 'Material_Mechanical');
const accent = materialByName(gltf, 'Material_Accent');
const mechanicalBaseTexture = mechanical.pbrMetallicRoughness?.baseColorTexture?.index;
const mechanicalNormalTexture = mechanical.normalTexture?.index;
const mechanicalOrmTexture = mechanical.pbrMetallicRoughness?.metallicRoughnessTexture?.index;
const accentBaseTexture = accent.pbrMetallicRoughness?.baseColorTexture?.index;
for (const [label, index] of Object.entries({
  mechanicalBaseTexture,
  mechanicalNormalTexture,
  mechanicalOrmTexture,
  accentBaseTexture,
})) {
  if (!Number.isInteger(index)) throw new Error(`weapon_gatling is missing ${label}`);
}

const mechanicalBaseImage = resolveImageIndex(gltf, mechanicalBaseTexture);
const mechanicalOrmImage = resolveImageIndex(gltf, mechanicalOrmTexture);
const accentBaseImage = resolveImageIndex(gltf, accentBaseTexture);
const mechanicalBasePng = imagePayload(gltf, binary, mechanicalBaseImage);
const accentBasePng = imagePayload(gltf, binary, accentBaseImage);
const mechanicalMetadata = await sharp(mechanicalBasePng).metadata();
const accentMetadata = await sharp(accentBasePng).metadata();

const mechanicalNormalPng = await deriveNormalMapPng(mechanicalBasePng, {
  blurSigma: 0.75,
  strength: 0.95,
});
const accentNormalPng = await deriveNormalMapPng(accentBasePng, {
  blurSigma: 0.9,
  strength: 0.7,
});
const accentOrmPng = await deriveOrmPng(
  accentBasePng,
  accent.pbrMetallicRoughness.roughnessFactor ?? 0.32,
  accent.pbrMetallicRoughness.metallicFactor ?? 0.75,
);

let appended = appendImage(
  gltf,
  binary,
  mechanicalNormalPng,
  'weapon_gatling_mechanical_normal_1k',
);
binary = appended.binary;
gltf.textures[mechanicalNormalTexture] = {
  ...(gltf.textures[mechanicalNormalTexture] || {}),
  source: appended.imageIndex,
};
delete gltf.textures[mechanicalNormalTexture].extensions;

appended = appendImage(gltf, binary, accentNormalPng, 'weapon_gatling_accent_normal_1k');
binary = appended.binary;
const accentNormalTexture = gltf.textures.length;
gltf.textures.push({
  sampler: gltf.textures[accentBaseTexture]?.sampler ?? 0,
  source: appended.imageIndex,
});

appended = appendImage(gltf, binary, accentOrmPng, 'weapon_gatling_accent_orm_1k');
binary = appended.binary;
const accentOrmTexture = gltf.textures.length;
gltf.textures.push({
  sampler: gltf.textures[accentBaseTexture]?.sampler ?? 0,
  source: appended.imageIndex,
});

gltf.images[mechanicalBaseImage].name = 'weapon_gatling_mechanical_baseColor_1k';
gltf.images[mechanicalOrmImage].name = 'weapon_gatling_mechanical_orm_1k';
gltf.images[accentBaseImage].name = 'weapon_gatling_accent_baseColor_1k';
mechanical.occlusionTexture = { index: mechanicalOrmTexture };
accent.normalTexture = { index: accentNormalTexture };
accent.pbrMetallicRoughness.metallicRoughnessTexture = { index: accentOrmTexture };
accent.occlusionTexture = { index: accentOrmTexture };

gltf.asset.extras = {
  ...(gltf.asset.extras || {}),
  sourceProvenance: {
    ...(gltf.asset.extras?.sourceProvenance || {}),
    textureRoleContractVersion: 1,
    textureRoleMode: 'bound-base-normal-orm',
    textureRoleCorrection: 'weapon-gatling-2026-07-27',
  },
};

if (geometrySignature(gltf) !== beforeGeometry) {
  throw new Error('texture repair changed scene, node, mesh, accessor, skin, or animation structure');
}
const report = await auditEmbeddedTextureChannels({ gltf, binary }, 'weapon_gatling repaired source');
if (report.summary.errors) {
  throw new Error(`repaired source still has texture correctness errors:\n${JSON.stringify(report.findings, null, 2)}`);
}

const output = serializeGlb(gltf, binary);
const reparsed = parseStrictEmbeddedGlb(output, 'weapon_gatling repaired GLB');
if (geometrySignature(reparsed.gltf) !== beforeGeometry) {
  throw new Error('serialized texture repair changed geometry structure');
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const manifestEntry = manifest.parts?.find((part) => part.id === 'weapon_gatling');
if (!manifestEntry) throw new Error('parts manifest has no weapon_gatling row');
manifestEntry.bytes = output.length;
manifestEntry.note = `${manifestEntry.note} Texture-role correction 2026-07-27: trim and painted atlases retain color roles; `
  + 'OpenGL normals are derived from their actual surface detail; Mechanical and Accent use explicit shared ORM bindings.';
const manifestOutput = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  mode: APPLY ? 'apply' : 'dry-run',
  sourceBytesBefore: readFileSync(SOURCE_PATH).length,
  sourceBytesAfter: output.length,
  imagesBefore: parsed.gltf.images?.length || 0,
  imagesAfter: gltf.images.length,
  audit: report.summary,
  generatedMaps: {
    mechanicalNormal: `${mechanicalMetadata.width}x${mechanicalMetadata.height}`,
    accentNormal: `${accentMetadata.width}x${accentMetadata.height}`,
    accentOrm: `${accentMetadata.width}x${accentMetadata.height}`,
  },
}, null, 2));

if (APPLY) {
  await publishTwoFileTransaction({
    files: [
      {
        path: SOURCE_PATH,
        bytes: output,
        validate: async (_path, bytes) => {
          const staged = parseStrictEmbeddedGlb(bytes, 'weapon_gatling staged source');
          const stagedReport = await auditEmbeddedTextureChannels(staged, 'weapon_gatling staged source');
          if (stagedReport.summary.errors) throw new Error('staged source failed texture-channel audit');
          if (geometrySignature(staged.gltf) !== beforeGeometry) throw new Error('staged source changed geometry');
        },
      },
      {
        path: MANIFEST_PATH,
        bytes: manifestOutput,
        validate: async (_path, bytes) => {
          const staged = JSON.parse(bytes.toString('utf8'));
          const entry = staged.parts?.find((part) => part.id === 'weapon_gatling');
          if (entry?.bytes !== output.length) throw new Error('staged manifest byte count does not match source');
        },
      },
    ],
  });
  console.log('weapon_gatling source texture roles repaired');
}
