// Build SG-04 release GLBs for an explicit part-id allowlist (faster than full manifest rebuild).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
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
} from '../../src/contracts/assetReleaseValidation.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PART_MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const partIds = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
if (!partIds.length) {
  console.error('usage: build_release_parts.mjs <partId> [<partId> ...]');
  process.exit(2);
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

const manifest = JSON.parse(readFileSync(PART_MANIFEST, 'utf8'));
const byId = new Map((manifest.parts || []).map((part) => [part.id, part]));

for (const partId of partIds) {
  const part = byId.get(partId);
  if (!part) throw new Error(`unknown part id: ${partId}`);
  const source = `assets/ships/parts/${part.file}`;
  const release = `assets/ships/release/parts/${part.file}`;
  const sourceAbs = resolve(ROOT, source);
  const releaseAbs = resolve(ROOT, release);
  if (!existsSync(sourceAbs)) throw new Error(`missing source: ${source}`);

  const sourceInspection = inspectGlbReleaseCompression(source, { root: ROOT, releaseMode: false });
  if (!sourceInspection.ok) throw new Error(`source does not parse: ${source}`);

  console.log(`[release] ${partId}: ${source} -> ${release}`);
  await mkdir(dirname(releaseAbs), { recursive: true });
  const document = await io.read(sourceAbs);
  splitIncompatibleTextureSlots(document);
  const transforms = [];
  const sourceAlreadyKtx2 = sourceInspection.metrics.textureCount > 0
    && sourceInspection.metrics.ktx2TextureCount === sourceInspection.metrics.textureCount;
  if (sourceInspection.metrics.textureCount > 0 && !sourceAlreadyKtx2) {
    transforms.push(
      ktx2({ slots: /^baseColorTexture$/, imageDecoder: decodeImage, isUASTC: true, uastcLDRQualityLevel: 2, generateMipmap: true, needSupercompression: true, isPerceptual: true, isSetKTX2SRGBTransferFunc: true }),
      ktx2({ slots: /^normalTexture$/, imageDecoder: decodeImage, isUASTC: true, uastcLDRQualityLevel: 2, generateMipmap: true, needSupercompression: true, isNormalMap: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false }),
      ktx2({ slots: /^(occlusionTexture|metallicRoughnessTexture|roughnessTexture|metalnessTexture)$/, imageDecoder: decodeImage, isUASTC: true, uastcLDRQualityLevel: 2, generateMipmap: true, needSupercompression: true, isPerceptual: false, isSetKTX2SRGBTransferFunc: false }),
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
  await io.write(releaseAbs, document);

  const normalizedSourceAbs = `${releaseAbs}.source-normalized.glb`;
  let normalizedSourcePath = source;
  try {
    const normalizedSourceDoc = await io.read(sourceAbs);
    splitIncompatibleTextureSlots(normalizedSourceDoc);
    await io.write(normalizedSourceAbs, normalizedSourceDoc);
    normalizedSourcePath = normalizedSourceAbs.slice(ROOT.length + 1).replace(/\\/g, '/');
  } catch (_) {}
  const pair = inspectReleaseAssetPair(normalizedSourcePath, release, { root: ROOT });
  try { unlinkSync(normalizedSourceAbs); } catch (_) {}
  if (!pair.ok) throw new Error(`release validation failed for ${partId}: ${JSON.stringify(pair.issues)}`);
  console.log(`[release] ${partId}: ok ${readFileSync(sourceAbs).length} -> ${readFileSync(releaseAbs).length} bytes`);
}

function decodePng(buffer) {
  const png = PNG.sync.read(Buffer.from(buffer));
  return {
    width: png.width,
    height: png.height,
    data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  };
}

function decodeImage(buffer) {
  try {
    return decodePng(buffer);
  } catch {
    const decoded = JPEG.decode(Buffer.from(buffer), { useTArray: true });
    return {
      width: decoded.width,
      height: decoded.height,
      data: new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
    };
  }
}

function splitIncompatibleTextureSlots(document) {
  const root = document.getRoot();
  for (const material of root.listMaterials()) {
    const baseTexture = material.getBaseColorTexture();
    const normalTexture = material.getNormalTexture();
    if (!baseTexture || !normalTexture || baseTexture !== normalTexture) continue;
    const image = normalTexture.getImage();
    if (!image) continue;
    const clone = document.createTexture(normalTexture.getName()
      ? `${normalTexture.getName()}_normal_slot`
      : 'normal_slot_clone')
      .setImage(image)
      .setMimeType(normalTexture.getMimeType());
    material.setNormalTexture(clone);
  }
}

function stampReleaseTextureCompression(document, sourceInspection) {
  const textureCount = sourceInspection && sourceInspection.metrics
    ? Number(sourceInspection.metrics.textureCount) || 0
    : 0;
  if (textureCount <= 0) return;
  const root = document.getRoot();
  const compression = 'KTX2/BasisU';
  const asset = root.getAsset();
  if (asset.extras && asset.extras.spacefaceAsset) {
    asset.extras = {
      ...asset.extras,
      spacefaceAsset: {
        ...asset.extras.spacefaceAsset,
        textureCompression: compression,
      },
    };
  }
  for (const scene of root.listScenes()) {
    const extras = scene.getExtras() || {};
    if (!extras.spacefaceAsset) continue;
    scene.setExtras({
      ...extras,
      spacefaceAsset: {
        ...extras.spacefaceAsset,
        textureCompression: compression,
      },
    });
  }
}