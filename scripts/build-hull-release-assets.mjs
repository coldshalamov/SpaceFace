// Build the ten modular-hull release assets away from live paths, validate the
// complete batch, then publish all GLBs and their manifest rows as one file-set
// transaction. Source GLBs retain embedded PNG maps; releases use slot-aware
// KTX2/BasisU plus Meshopt.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import JPEG from 'jpeg-js';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';

import { inspectReleaseAssetPair } from '../src/contracts/assetReleaseValidation.js';
import { assertGltfMaterialContractParity } from '../tools/art/lib/gltfMaterialContract.mjs';
import {
  parseReleaseGlbPayload,
  validateKtx2MaterialRolePayloads,
} from '../tools/art/lib/ktx2MaterialRoleValidation.mjs';
import { publishFileSetTransaction } from '../tools/art/lib/multiFileTransaction.mjs';
import { parseStrictEmbeddedGlb } from '../tools/art/lib/strictGlbValidation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');

export const HULLS = Object.freeze([
  'hull_starter', 'hull_fighter', 'hull_miner', 'hull_freighter',
  'hull_interceptor', 'hull_corvette', 'hull_frigate', 'hull_capital',
  'hull_multirole', 'hull_gunship',
]);

// Evaluated hull profiles: ETC1S keeps color/data residency compact, while
// tangent-space normals retain UASTC's higher directional fidelity.
export const HULL_TEXTURE_PROFILES = Object.freeze({
  color: Object.freeze({
    codec: 'ETC1S',
    options: Object.freeze({
      isUASTC: false,
      qualityLevel: 224,
      compressionLevel: 4,
    }),
  }),
  normal: Object.freeze({
    codec: 'UASTC',
    options: Object.freeze({
      isUASTC: true,
      uastcLDRQualityLevel: 2,
      needSupercompression: true,
    }),
  }),
  orm: Object.freeze({
    codec: 'ETC1S',
    options: Object.freeze({
      isUASTC: false,
      qualityLevel: 255,
      compressionLevel: 5,
    }),
  }),
});

if (isMainModule()) {
  await buildHullReleaseAssets();
}

export async function buildHullReleaseAssets() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });
  const manifestBytesBeforeBuild = readFileSync(RELEASE_MANIFEST);
  const manifestBeforeBuild = JSON.parse(manifestBytesBeforeBuild.toString('utf8'));
  const liveTargets = HULLS.map((id) =>
    resolve(ROOT, `assets/ships/release/parts/hulls/${id}.glb`));
  const initialLiveHashes = new Map([
    ...liveTargets.map((path) => [path, currentSha256(path)]),
    [RELEASE_MANIFEST, sha256(manifestBytesBeforeBuild)],
  ]);
  const buildRoot = await mkdtemp(join(tmpdir(), 'spaceface-hull-release-'));
  const built = [];

  try {
    for (const [index, id] of HULLS.entries()) {
      const source = `assets/ships/parts/hulls/${id}.glb`;
      const release = `assets/ships/release/parts/hulls/${id}.glb`;
      const sourceAbs = resolve(ROOT, source);
      const releaseAbs = resolve(ROOT, release);
      const temporaryReleaseAbs = resolve(buildRoot, `${id}.glb`);
      if (!existsSync(sourceAbs)) throw new Error(`missing hull source: ${source}`);

      const sourceBytes = readFileSync(sourceAbs);
      const document = await io.read(sourceAbs);
      await document.transform(
        ktx2({
          slots: /^(baseColorTexture|emissiveTexture)$/,
          imageDecoder: decodeImage,
          ...HULL_TEXTURE_PROFILES.color.options,
          generateMipmap: true,
          needSupercompression: false,
          isPerceptual: true,
          isSetKTX2SRGBTransferFunc: true,
        }),
        ktx2({
          slots: /^(normalTexture|clearcoatNormalTexture)$/,
          imageDecoder: decodeImage,
          ...HULL_TEXTURE_PROFILES.normal.options,
          generateMipmap: true,
          isNormalMap: true,
          isPerceptual: false,
          isSetKTX2SRGBTransferFunc: false,
        }),
        ktx2({
          slots: /^(occlusionTexture|metallicRoughnessTexture|roughnessTexture|metalnessTexture|clearcoatTexture|clearcoatRoughnessTexture)$/,
          imageDecoder: decodeImage,
          ...HULL_TEXTURE_PROFILES.orm.options,
          generateMipmap: true,
          needSupercompression: false,
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
      const releaseBytes = Buffer.from(await io.writeBinary(document));
      await writeFile(temporaryReleaseAbs, releaseBytes);
      const parsedSource = parseStrictEmbeddedGlb(sourceBytes, `${id} source`);
      const parsedRelease = parseReleaseGlbPayload(releaseBytes, `${id} release`);
      const materialContractSignature = assertGltfMaterialContractParity(
        parsedSource.gltf,
        parsedRelease.gltf,
        `${id} release`,
      );
      const ktx2PayloadValidation = validateKtx2MaterialRolePayloads(
        parsedRelease.gltf,
        parsedRelease.binary,
        `${id} release`,
      );

      const pair = inspectReleaseAssetPair(source, temporaryReleaseAbs, { root: ROOT });
      if (!pair.ok) {
        throw new Error(
          `hull release validation failed: ${release}\n${JSON.stringify(pair.issues, null, 2)}`,
        );
      }

      built.push({
        id,
        kind: 'part:hulls',
        source,
        release,
        sourceAbs,
        releaseAbs,
        temporaryReleaseAbs,
        sourceSha256: sha256(sourceBytes),
        releaseSha256: sha256(releaseBytes),
        sourceBytes: sourceBytes.length,
        releaseBytes: releaseBytes.length,
        releasePayload: releaseBytes,
        textures: pair.release.metrics.textureCount,
        ktx2Textures: pair.release.metrics.ktx2TextureCount,
        meshoptBufferViews: pair.release.metrics.meshoptBufferViewCount,
        contractNodeCount: pair.release.metrics.contractNodeNames.length,
        materialContractSignature,
        ktx2PayloadValidation,
      });
      console.log(
        `[hull] ${index + 1}/${HULLS.length} ${id}: staged and validated `
        + `${formatBytes(sourceBytes.length)} -> ${formatBytes(releaseBytes.length)} `
        + `(${sizeDelta(sourceBytes.length, releaseBytes.length)}, `
        + `ktx2=${pair.release.metrics.ktx2TextureCount}/${pair.release.metrics.textureCount}, `
        + `meshopt=${pair.release.metrics.meshoptBufferViewCount})`,
      );
    }

    validateCompleteBuild(built);
    const nextManifest = patchHullManifestRows(manifestBeforeBuild, built);
    const nextManifestBytes = Buffer.from(`${JSON.stringify(nextManifest, null, 2)}\n`);
    validateManifestPayload(nextManifestBytes, built, manifestBeforeBuild);

    // Source files are not transaction destinations, so bind the complete batch
    // to the exact source bytes used to build it before entering publication.
    for (const entry of built) {
      const currentSourceSha256 = currentSha256(entry.sourceAbs);
      if (currentSourceSha256 !== entry.sourceSha256) {
        throw new Error(
          `hull source changed during release build: ${entry.source} `
          + `(${entry.sourceSha256} -> ${currentSourceSha256 ?? '<missing>'})`,
        );
      }
    }

    await publishFileSetTransaction({
      files: [
        ...built.map((entry) => ({
          path: entry.releaseAbs,
          bytes: entry.releasePayload,
          expectedCurrentSha256: initialLiveHashes.get(entry.releaseAbs),
          validate: async (stagedPath, stagedBytes) => {
            if (sha256(stagedBytes) !== entry.releaseSha256) {
              throw new Error(`staged release hash mismatch for ${entry.id}`);
            }
            const stagedPair = inspectReleaseAssetPair(entry.source, stagedPath, { root: ROOT });
            if (!stagedPair.ok) {
              throw new Error(
                `staged release validation failed for ${entry.id}: `
                + JSON.stringify(stagedPair.issues),
              );
            }
            const parsedStagedRelease = parseReleaseGlbPayload(
              stagedBytes,
              `${entry.id} staged release`,
            );
            assertGltfMaterialContractParity(
              parseStrictEmbeddedGlb(
                readFileSync(entry.sourceAbs),
                `${entry.id} publication source`,
              ).gltf,
              parsedStagedRelease.gltf,
              `${entry.id} staged release`,
            );
            validateKtx2MaterialRolePayloads(
              parsedStagedRelease.gltf,
              parsedStagedRelease.binary,
              `${entry.id} staged release`,
            );
          },
        })),
        {
          path: RELEASE_MANIFEST,
          bytes: nextManifestBytes,
          expectedCurrentSha256: initialLiveHashes.get(RELEASE_MANIFEST),
          validate: async (_stagedPath, stagedBytes) => {
            validateManifestPayload(stagedBytes, built, manifestBeforeBuild);
          },
        },
      ],
    });

    const totalSourceBytes = built.reduce((sum, entry) => sum + entry.sourceBytes, 0);
    const totalReleaseBytes = built.reduce((sum, entry) => sum + entry.releaseBytes, 0);
    console.log(
      `[hull] published ${built.length} GLBs + manifest transactionally: `
      + `${formatBytes(totalSourceBytes)} source -> ${formatBytes(totalReleaseBytes)} release `
      + `(${sizeDelta(totalSourceBytes, totalReleaseBytes)}); manifest order preserved`,
    );
  } finally {
    await rm(buildRoot, { recursive: true, force: true });
  }
}

export function patchHullManifestRows(manifest, builtEntries) {
  if (!manifest || !Array.isArray(manifest.assets)) {
    throw new TypeError('release manifest requires an assets array');
  }
  validateCompleteBuild(builtEntries);
  const next = structuredClone(manifest);
  for (const entry of builtEntries) {
    const matchingIndices = [];
    for (const [index, asset] of next.assets.entries()) {
      if (asset?.id === entry.id) matchingIndices.push(index);
    }
    if (matchingIndices.length !== 1) {
      throw new Error(
        `release manifest must contain exactly one row for ${entry.id}; `
        + `found ${matchingIndices.length}`,
      );
    }
    next.assets[matchingIndices[0]] = manifestRow(entry);
  }
  return next;
}

export function validateCompleteBuild(builtEntries) {
  if (!Array.isArray(builtEntries) || builtEntries.length !== HULLS.length) {
    throw new Error(`hull release build must contain all ${HULLS.length} assets`);
  }
  const actualIds = builtEntries.map((entry) => entry?.id);
  if (new Set(actualIds).size !== HULLS.length) {
    throw new Error('hull release build contains duplicate asset ids');
  }
  const missing = HULLS.filter((id) => !actualIds.includes(id));
  const unexpected = actualIds.filter((id) => !HULLS.includes(id));
  if (missing.length || unexpected.length) {
    throw new Error(
      `hull release build set mismatch; missing=${missing.join(',') || '<none>'} `
      + `unexpected=${unexpected.join(',') || '<none>'}`,
    );
  }
  for (const entry of builtEntries) {
    if (!Buffer.isBuffer(entry.releasePayload) || entry.releasePayload.length === 0) {
      throw new Error(`hull release build has no payload for ${entry.id}`);
    }
    if (entry.releasePayload.length !== entry.releaseBytes) {
      throw new Error(`hull release byte count mismatch for ${entry.id}`);
    }
    if (sha256(entry.releasePayload) !== entry.releaseSha256) {
      throw new Error(`hull release digest mismatch for ${entry.id}`);
    }
    if (entry.textures !== entry.ktx2Textures) {
      throw new Error(`hull release has non-KTX2 textures for ${entry.id}`);
    }
    if (!Number.isInteger(entry.meshoptBufferViews) || entry.meshoptBufferViews <= 0) {
      throw new Error(`hull release has no Meshopt buffer views for ${entry.id}`);
    }
    if (!/^[0-9a-f]{64}$/.test(entry.materialContractSignature || '')) {
      throw new Error(`hull release has no material-contract signature for ${entry.id}`);
    }
    if (entry.ktx2PayloadValidation?.textureCount !== entry.textures) {
      throw new Error(`hull release has incomplete KTX2 payload validation for ${entry.id}`);
    }
  }
}

function validateManifestPayload(bytes, builtEntries, previousManifest) {
  const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
  if (!Array.isArray(parsed.assets)) throw new Error('staged release manifest has no assets array');
  const previousIds = previousManifest.assets.map((asset) => asset?.id);
  const parsedIds = parsed.assets.map((asset) => asset?.id);
  if (JSON.stringify(parsedIds) !== JSON.stringify(previousIds)) {
    throw new Error('staged release manifest changed asset row order or membership');
  }
  const expectedRows = new Map(builtEntries.map((entry) => [entry.id, manifestRow(entry)]));
  for (const [index, previousRow] of previousManifest.assets.entries()) {
    if (expectedRows.has(previousRow?.id)) continue;
    if (JSON.stringify(parsed.assets[index]) !== JSON.stringify(previousRow)) {
      throw new Error(`staged release manifest changed untouched row ${previousRow?.id ?? index}`);
    }
  }
  for (const [id, expected] of expectedRows) {
    const rows = parsed.assets.filter((asset) => asset?.id === id);
    if (rows.length !== 1 || JSON.stringify(rows[0]) !== JSON.stringify(expected)) {
      throw new Error(`staged release manifest row mismatch for ${id}`);
    }
  }
}

function manifestRow(entry) {
  return {
    id: entry.id,
    kind: entry.kind,
    source: entry.source,
    release: entry.release,
    sourceSha256: entry.sourceSha256,
    releaseSha256: entry.releaseSha256,
    sourceBytes: entry.sourceBytes,
    releaseBytes: entry.releaseBytes,
    textures: entry.textures,
    ktx2Textures: entry.ktx2Textures,
    meshoptBufferViews: entry.meshoptBufferViews,
    contractNodeCount: entry.contractNodeCount,
    textureProfiles: {
      baseColorTexture: 'ETC1S quality=224 compression=4, mipmapped, sRGB transfer',
      normalTexture: 'UASTC level=2, mipmapped, zstd supercompressed, normal-map mode, linear',
      materialTextures: 'ETC1S quality=255 compression=5, mipmapped, linear ORM/material data',
    },
  };
}

function currentSha256(path) {
  return existsSync(path) ? sha256(readFileSync(path)) : null;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function decodeImage(buffer) {
  try {
    const png = PNG.sync.read(Buffer.from(buffer));
    return {
      width: png.width,
      height: png.height,
      data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
    };
  } catch {
    const jpeg = JPEG.decode(Buffer.from(buffer), { useTArray: true });
    return {
      width: jpeg.width,
      height: jpeg.height,
      data: new Uint8Array(jpeg.data.buffer, jpeg.data.byteOffset, jpeg.data.byteLength),
    };
  }
}

function stampReleaseTextureCompression(document) {
  const root = document.getRoot();
  const asset = root.getAsset();
  if (asset.extras?.spacefaceAsset) {
    asset.extras = {
      ...asset.extras,
      spacefaceAsset: {
        ...asset.extras.spacefaceAsset,
        textureCompression: 'KTX2/BasisU+mips',
        textureProfiles: 'ETC1S-color+ORM/UASTC-normal',
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
        textureCompression: 'KTX2/BasisU+mips',
        textureProfiles: 'ETC1S-color+ORM/UASTC-normal',
      },
    });
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function sizeDelta(sourceBytes, releaseBytes) {
  if (sourceBytes <= 0) return 'size delta unavailable';
  const percent = ((releaseBytes - sourceBytes) / sourceBytes) * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
}
