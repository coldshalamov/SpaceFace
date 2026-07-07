#!/usr/bin/env node
/**
 * Rebuild release GLBs for specific manifest part IDs and patch release_manifest.json.
 * Usage: node scripts/rebuild-release-parts.mjs hull_fighter hull_miner
 */
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
import JPEG from 'jpeg-js';
import { PNG } from 'pngjs';

import {
  inspectGlbReleaseCompression,
  inspectReleaseAssetPair,
} from '../src/contracts/assetReleaseValidation.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!ids.length) {
  console.error('usage: rebuild-release-parts.mjs <partId> [partId...]');
  process.exit(2);
}

const partManifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'));
const releaseManifestPath = resolve(ROOT, 'assets/ships/release/release_manifest.json');
const releaseManifest = JSON.parse(readFileSync(releaseManifestPath, 'utf8'));

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

function decodePng(buffer) {
  const png = PNG.sync.read(Buffer.from(buffer));
  return {
    width: png.width,
    height: png.height,
    data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  };
}

function decodeImage(buffer) {
  const bytes = Buffer.from(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const jpeg = JPEG.decode(bytes, { useTArray: true });
    return { width: jpeg.width, height: jpeg.height, data: jpeg.data };
  }
  return decodePng(bytes);
}

function stampReleaseTextureCompression(document, sourceInspection) {
  const textureCount = sourceInspection?.metrics?.textureCount || 0;
  if (textureCount <= 0) return;
  const root = document.getRoot();
  const asset = root.getAsset();
  if (asset.extras?.spacefaceAsset) {
    asset.extras = {
      ...asset.extras,
      spacefaceAsset: { ...asset.extras.spacefaceAsset, textureCompression: 'KTX2/BasisU' },
    };
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const results = [];
for (const id of ids) {
  const part = partManifest.parts.find((p) => p.id === id);
  if (!part) {
    console.error(`unknown id: ${id}`);
    process.exit(2);
  }
  const source = `assets/ships/parts/${part.file}`;
  const release = `assets/ships/release/parts/${part.file}`;
  const sourceAbs = resolve(ROOT, source);
  const releaseAbs = resolve(ROOT, release);
  const sourceInspection = inspectGlbReleaseCompression(source, { root: ROOT, releaseMode: false });
  if (!sourceInspection.ok) throw new Error(`source parse fail: ${source}`);

  const document = await io.read(sourceAbs);
  const transforms = [];
  const sourceAlreadyKtx2 = sourceInspection.metrics.imageTextureCount > 0
    && sourceInspection.metrics.ktx2TextureCount === sourceInspection.metrics.imageTextureCount;
  if (sourceInspection.metrics.imageTextureCount > 0 && !sourceAlreadyKtx2) {
    const ktx2Opts = {
      imageDecoder: decodeImage,
      isUASTC: true,
      uastcLDRQualityLevel: 2,
      generateMipmap: true,
      needSupercompression: true,
    };
    transforms.push(
      ktx2({ slots: /^baseColorTexture$/, ...ktx2Opts, isPerceptual: true, isSetKTX2SRGBTransferFunc: true }),
      ktx2({ slots: /^normalTexture$/, ...ktx2Opts, isNormalMap: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false }),
      ktx2({ slots: /^(occlusionTexture|metallicRoughnessTexture|roughnessTexture|metalnessTexture)$/, ...ktx2Opts, isPerceptual: false, isSetKTX2SRGBTransferFunc: false }),
    );
  }
  transforms.push(meshopt({
    encoder: MeshoptEncoder,
    level: 'high',
    quantizePosition: 14,
    quantizeNormal: 10,
    quantizeTexcoord: 12,
    quantizeColor: 8,
    quantizeWeight: 8,
    quantizeGeneric: 12,
  }));

  await document.transform(...transforms);
  stampReleaseTextureCompression(document, sourceInspection);
  await mkdir(dirname(releaseAbs), { recursive: true });
  await io.write(releaseAbs, document);

  const pair = inspectReleaseAssetPair(source, release, { root: ROOT });
  if (!pair.ok) {
    console.error(JSON.stringify(pair.issues, null, 2));
    process.exit(1);
  }

  const sourceBytes = readFileSync(sourceAbs);
  const releaseBytes = readFileSync(releaseAbs);
  const entry = {
    id,
    kind: `part:${part.category}`,
    source,
    release,
    sourceSha256: sha256(sourceBytes),
    releaseSha256: sha256(releaseBytes),
    sourceBytes: sourceBytes.length,
    releaseBytes: releaseBytes.length,
    textures: pair.release.metrics.imageTextureCount,
    ktx2Textures: pair.release.metrics.ktx2TextureCount,
    meshoptBufferViews: pair.release.metrics.meshoptBufferViewCount,
    contractNodeCount: pair.release.metrics.contractNodeNames.length,
  };
  const idx = releaseManifest.assets.findIndex((a) => a.id === id);
  if (idx === -1) releaseManifest.assets.push(entry);
  else releaseManifest.assets[idx] = entry;
  results.push({ id, sourceBytes: sourceBytes.length, releaseBytes: releaseBytes.length, ok: true });
  console.log(`[rebuild] ${id}: ${sourceBytes.length} -> ${releaseBytes.length} bytes`);
}

writeFileSync(releaseManifestPath, `${JSON.stringify(releaseManifest, null, 2)}\n`);
console.log(JSON.stringify({ rebuilt: results.length, results }, null, 2));