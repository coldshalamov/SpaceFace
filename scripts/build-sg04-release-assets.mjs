import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';

import {
  inspectGlbReleaseCompression,
  inspectReleaseAssetPair,
} from '../src/contracts/assetReleaseValidation.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART_MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const RELEASE_ROOT = resolve(ROOT, 'assets/ships/release');
const RELEASE_MANIFEST = resolve(RELEASE_ROOT, 'release_manifest.json');
const argv = new Set(process.argv.slice(2));

if (!RELEASE_ROOT.startsWith(resolve(ROOT, 'assets/ships'))) {
  throw new Error(`refusing to write release assets outside assets/ships: ${RELEASE_ROOT}`);
}

const partManifest = JSON.parse(readFileSync(PART_MANIFEST, 'utf8'));
const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const assets = [
  {
    id: 'ship_kestrel_reference',
    kind: 'ship-reference',
    source: 'assets/ships/kestrel/kestrel_reference.glb',
    release: 'assets/ships/release/kestrel/kestrel_reference.glb',
  },
  ...(partManifest.parts || []).map((part) => ({
    id: part.id,
    kind: `part:${part.category}`,
    source: `assets/ships/parts/${part.file}`,
    release: `assets/ships/release/parts/${part.file}`,
  })),
];

if (!argv.has('--no-clean')) {
  await rm(RELEASE_ROOT, { recursive: true, force: true });
}
await mkdir(RELEASE_ROOT, { recursive: true });

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

const manifestAssets = [];
for (let index = 0; index < assets.length; index++) {
  const asset = assets[index];
  const sourceAbs = resolve(ROOT, asset.source);
  const releaseAbs = resolve(ROOT, asset.release);
  if (!existsSync(sourceAbs)) throw new Error(`missing SG-04 source asset: ${asset.source}`);

  const sourceInspection = inspectGlbReleaseCompression(asset.source, { root: ROOT, releaseMode: false });
  if (!sourceInspection.ok) {
    throw new Error(`source asset does not parse before release build: ${asset.source}`);
  }

  await mkdir(dirname(releaseAbs), { recursive: true });
  const document = await io.read(sourceAbs);
  const transforms = [];
  // Sources that already ship KTX2/BasisU textures (e.g. authored hull GLBs) are KTX2-native and
  // must skip the pngjs decode → re-encode path: re-encoding would be lossy and pngjs can't read KTX2.
  // They only need meshopt geometry compression to satisfy the release contract.
  const sourceAlreadyKtx2 = sourceInspection.metrics.textureCount > 0
    && sourceInspection.metrics.ktx2TextureCount === sourceInspection.metrics.textureCount;
  if (sourceInspection.metrics.textureCount > 0 && !sourceAlreadyKtx2) {
    transforms.push(
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
  await io.write(releaseAbs, document);

  const pair = inspectReleaseAssetPair(asset.source, asset.release, { root: ROOT });
  if (!pair.ok) {
    throw new Error(`release asset failed SG-04 validation: ${asset.release}\n${JSON.stringify(pair.issues, null, 2)}`);
  }

  const sourceBytes = readFileSync(sourceAbs);
  const releaseBytes = readFileSync(releaseAbs);
  manifestAssets.push({
    id: asset.id,
    kind: asset.kind,
    source: asset.source,
    release: asset.release,
    sourceSha256: sha256(sourceBytes),
    releaseSha256: sha256(releaseBytes),
    sourceBytes: sourceBytes.length,
    releaseBytes: releaseBytes.length,
    textures: pair.release.metrics.textureCount,
    ktx2Textures: pair.release.metrics.ktx2TextureCount,
    meshoptBufferViews: pair.release.metrics.meshoptBufferViewCount,
    contractNodeCount: pair.release.metrics.contractNodeNames.length,
  });
  console.log(`[sg04] ${index + 1}/${assets.length} ${asset.id}: ${sourceBytes.length} -> ${releaseBytes.length} bytes`);
}

const devDeps = packageJson.devDependencies || {};
await writeFile(RELEASE_MANIFEST, `${JSON.stringify({
  schemaVersion: 1,
  releaseRoot: 'assets/ships/release',
  generatedBy: 'scripts/build-sg04-release-assets.mjs',
  contract: {
    textureContainer: 'KTX2/BasisU via KHR_texture_basisu',
    meshCompression: 'EXT_meshopt_compression',
    semanticParity: 'SOCKET_*, HOOK_*, MOUNT_*, and LOD* node names preserved',
  },
  toolchain: {
    '@gltf-transform/core': devDeps['@gltf-transform/core'],
    '@gltf-transform/extensions': devDeps['@gltf-transform/extensions'],
    '@gltf-transform/functions': devDeps['@gltf-transform/functions'],
    'ktx2-encoder': devDeps['ktx2-encoder'],
    meshoptimizer: devDeps.meshoptimizer,
    pngjs: devDeps.pngjs,
  },
  textureProfiles: {
    baseColorTexture: 'UASTC KTX2, mipmapped, zstd supercompressed, sRGB transfer',
    normalTexture: 'UASTC KTX2, mipmapped, zstd supercompressed, normal-map mode, linear',
    materialTextures: 'UASTC KTX2, mipmapped, zstd supercompressed, linear ORM/material data',
  },
  assets: manifestAssets,
}, null, 2)}\n`);

console.log(`[sg04] release manifest wrote ${relativeToRoot(RELEASE_MANIFEST)} (${manifestAssets.length} assets)`);

function decodePng(buffer) {
  const png = PNG.sync.read(Buffer.from(buffer));
  return {
    width: png.width,
    height: png.height,
    data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function relativeToRoot(path) {
  return path.replace(ROOT, '').replace(/^[/\\]/, '').replace(/\\/g, '/');
}
