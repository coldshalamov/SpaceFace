#!/usr/bin/env node
// Build SG-04 release copies for dock-interior parts only (patch release_manifest.json).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';

import { inspectGlbReleaseCompression, inspectReleaseAssetPair } from '../src/contracts/assetReleaseValidation.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');
const DOCK_IDS = [
  'place_dock_interior',
  'place_dock_interior_military',
  'place_dock_interior_grit',
];

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function decodePng(buffer) {
  return PNG.sync.read(Buffer.from(buffer));
}

function stampReleaseTextureCompression(document) {
  const root = document.getRoot();
  const compression = 'KTX2/BasisU';
  const asset = root.getAsset();
  if (asset.extras?.spacefaceAsset) {
    asset.extras = {
      ...asset.extras,
      spacefaceAsset: { ...asset.extras.spacefaceAsset, textureCompression: compression },
    };
  }
  for (const scene of root.listScenes()) {
    const extras = scene.getExtras() || {};
    if (!extras.spacefaceAsset) continue;
    scene.setExtras({
      ...extras,
      spacefaceAsset: { ...extras.spacefaceAsset, textureCompression: compression },
    });
  }
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

const built = [];
for (const id of DOCK_IDS) {
  const source = `assets/ships/parts/places/${id}.glb`;
  const release = `assets/ships/release/parts/places/${id}.glb`;
  const sourceAbs = resolve(ROOT, source);
  const releaseAbs = resolve(ROOT, release);
  if (!existsSync(sourceAbs)) throw new Error(`missing source ${source}`);

  const sourceInspection = inspectGlbReleaseCompression(source, { root: ROOT, releaseMode: false });
  if (!sourceInspection.ok) throw new Error(`source invalid: ${source}`);

  const document = await io.read(sourceAbs);
  await document.transform(
    ktx2({
      slots: /^baseColorTexture$/,
      imageDecoder: decodePng,
      isUASTC: true,
      uastcLDRQualityLevel: 2,
      generateMipmap: true,
      needSupercompression: true,
      isPerceptual: true,
      isSetKTX2SRGBTransferFunc: true,
    }),
    ktx2({
      slots: /^normalTexture$/,
      imageDecoder: decodePng,
      isUASTC: true,
      uastcLDRQualityLevel: 2,
      generateMipmap: true,
      needSupercompression: true,
      isNormalMap: true,
      isPerceptual: false,
      isSetKTX2SRGBTransferFunc: false,
    }),
    ktx2({
      slots: /^(occlusionTexture|metallicRoughnessTexture|roughnessTexture|metalnessTexture)$/,
      imageDecoder: decodePng,
      isUASTC: true,
      uastcLDRQualityLevel: 2,
      generateMipmap: true,
      needSupercompression: true,
      isPerceptual: false,
      isSetKTX2SRGBTransferFunc: false,
    }),
    meshopt({
      encoder: MeshoptEncoder,
      level: 'high',
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeColor: 8,
      quantizeWeight: 8,
      quantizeGeneric: 12,
    }),
  );
  stampReleaseTextureCompression(document);
  await mkdir(dirname(releaseAbs), { recursive: true });
  await io.write(releaseAbs, document);

  const pair = inspectReleaseAssetPair(source, release, { root: ROOT });
  if (!pair.ok) {
    throw new Error(`release validation failed for ${release}: ${JSON.stringify(pair.issues)}`);
  }
  const sourceBytes = readFileSync(sourceAbs);
  const releaseBytes = readFileSync(releaseAbs);
  built.push({
    id,
    kind: 'part:places',
    source,
    release,
    sourceSha256: sha256(sourceBytes),
    releaseSha256: sha256(releaseBytes),
    sourceBytes: sourceBytes.length,
    releaseBytes: releaseBytes.length,
    textures: pair.release.metrics.textureCount,
    ktx2Textures: pair.release.metrics.ktx2TextureCount,
    meshoptBufferViews: pair.release.metrics.meshoptBufferViewCount,
    contractNodeCount: pair.release.metrics.contractNodeNames.length,
  });
  console.log(`[dock-release] ${id}: ${sourceBytes.length} -> ${releaseBytes.length} bytes`);
}

const manifest = JSON.parse(readFileSync(RELEASE_MANIFEST, 'utf8'));
const assets = Array.isArray(manifest.assets) ? manifest.assets.slice() : [];
for (const entry of built) {
  const index = assets.findIndex((asset) => asset && asset.id === entry.id);
  if (index >= 0) assets[index] = entry;
}
const missing = built.filter((entry) => !assets.some((asset) => asset && asset.id === entry.id));
if (missing.length) {
  const insertAfter = assets.findIndex((asset) => asset && asset.id === 'place_conveyor_barge');
  const insertAt = insertAfter >= 0 ? insertAfter + 1 : assets.length;
  assets.splice(insertAt, 0, ...missing);
}
manifest.assets = assets;
writeFileSync(RELEASE_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[dock-release] patched ${RELEASE_MANIFEST} (+${built.length} dock assets)`);
