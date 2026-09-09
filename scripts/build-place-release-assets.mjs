// Build an explicitly selected set of place release assets away from live
// paths, validate the complete set, then publish all GLBs and the existing
// manifest rows as one file-set transaction.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import JPEG from 'jpeg-js';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';

import {
  inspectGlbReleaseCompression,
  inspectReleaseAssetPair,
} from '../src/contracts/assetReleaseValidation.js';
import { assertGltfMaterialContractParity } from '../tools/art/lib/gltfMaterialContract.mjs';
import {
  parseReleaseGlbPayload,
  validateKtx2MaterialRolePayloads,
} from '../tools/art/lib/ktx2MaterialRoleValidation.mjs';
import { publishFileSetTransaction } from '../tools/art/lib/multiFileTransaction.mjs';
import { parseStrictEmbeddedGlb } from '../tools/art/lib/strictGlbValidation.mjs';
import { RELEASE_MESHOPT_OPTIONS } from './lib/releaseMeshoptProfile.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const PLACE_TEXTURE_PROFILES = Object.freeze({
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
  if (process.argv.slice(2).some((arg) => arg === '--help' || arg === '-h')) {
    console.log([
      'Usage: node scripts/build-place-release-assets.mjs --ids <place_id[,place_id...]>',
      '',
      'Builds only the explicitly named, unblocked parts_manifest place assets.',
      'All selected release GLBs and release_manifest.json publish transactionally.',
    ].join('\n'));
  } else {
    try {
      const selectedIds = parseSelectedPlaceIds(process.argv.slice(2));
      await buildSelectedPlaceReleaseAssets(selectedIds);
    } catch (error) {
      console.error(`[place-release] FAIL: ${errorMessage(error)}`);
      process.exitCode = 1;
    }
  }
}

export function parseSelectedPlaceIds(args) {
  if (!Array.isArray(args)) throw new TypeError('place release arguments must be an array');
  const ids = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    let raw = null;
    if (arg === '--ids') {
      if (index + 1 >= args.length || String(args[index + 1]).startsWith('--')) {
        throw new Error('--ids requires a comma-separated place id list');
      }
      raw = args[++index];
    } else if (typeof arg === 'string' && arg.startsWith('--ids=')) {
      raw = arg.slice('--ids='.length);
    } else {
      throw new Error(`unknown argument: ${String(arg)}`);
    }
    for (const value of String(raw).split(',')) {
      const id = value.trim();
      if (!id) continue;
      if (!/^place_[a-z0-9_]+$/.test(id)) throw new Error(`invalid place id: ${id}`);
      if (ids.includes(id)) throw new Error(`duplicate place id: ${id}`);
      ids.push(id);
    }
  }
  if (!ids.length) {
    throw new Error('selected place release build requires --ids with at least one place id');
  }
  return ids;
}

export function resolveSelectedPlaceAssets(partManifest, selectedIds) {
  if (!partManifest || !Array.isArray(partManifest.parts)) {
    throw new TypeError('parts manifest requires a parts array');
  }
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    throw new Error('selected place release build requires at least one place id');
  }
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new Error('selected place release build contains duplicate place ids');
  }
  const byId = new Map();
  for (const part of partManifest.parts) {
    if (!part?.id) continue;
    if (byId.has(part.id)) throw new Error(`parts manifest contains duplicate id: ${part.id}`);
    byId.set(part.id, part);
  }
  return selectedIds.map((id) => {
    const part = byId.get(id);
    if (!part) throw new Error(`unknown place asset id: ${id}`);
    if (part.category !== 'places') {
      throw new Error(`selected id is not a place asset: ${id} (${part.category || 'uncategorized'})`);
    }
    if (part.status === 'blocked') throw new Error(`blocked place asset cannot be released: ${id}`);
    const file = String(part.file || '').replace(/\\/g, '/');
    // Works-scale hero places keep their authored source under `parts/works/` while
    // ordinary place props remain under `parts/places/`; both use this same release
    // transaction and validation path.
    if (!/^(?:places|works)\/[a-z0-9_/-]+\.glb$/.test(file) || file.includes('..')) {
      throw new Error(`invalid place source path for ${id}: ${part.file || '<missing>'}`);
    }
    return {
      id,
      kind: 'part:places',
      source: `assets/ships/parts/${file}`,
      release: `assets/ships/release/parts/${file}`,
    };
  });
}

export async function buildSelectedPlaceReleaseAssets(selectedIds, options = {}) {
  const root = resolve(options.root || ROOT);
  const partManifestPath = resolve(root, 'assets/ships/parts/parts_manifest.json');
  const releaseManifestPath = resolve(root, 'assets/ships/release/release_manifest.json');
  const partManifestBytesBeforeBuild = readFileSync(partManifestPath);
  const partManifest = JSON.parse(partManifestBytesBeforeBuild.toString('utf8'));
  const partManifestSha256 = sha256(partManifestBytesBeforeBuild);
  const selected = resolveSelectedPlaceAssets(partManifest, selectedIds);
  const manifestBytesBeforeBuild = readFileSync(releaseManifestPath);
  const manifestBeforeBuild = JSON.parse(manifestBytesBeforeBuild.toString('utf8'));
  const manifestSha256 = sha256(manifestBytesBeforeBuild);
  const currentReleaseSha256ById = Object.fromEntries(selected.map((asset) => [
    asset.id,
    currentSha256(resolve(root, asset.release)),
  ]));
  const buildRoot = await mkdtemp(join(tmpdir(), 'spaceface-place-release-'));
  const built = [];

  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });

  try {
    for (const [index, asset] of selected.entries()) {
      const sourceAbs = resolve(root, asset.source);
      const releaseAbs = resolve(root, asset.release);
      const temporaryReleaseAbs = resolve(buildRoot, `${asset.id}.glb`);
      if (!existsSync(sourceAbs)) throw new Error(`missing place source: ${asset.source}`);

      const sourceBytes = readFileSync(sourceAbs);
      const sourceSha256 = sha256(sourceBytes);
      const sourceInspection = inspectGlbReleaseCompression(asset.source, {
        root,
        releaseMode: false,
      });
      if (!sourceInspection.ok) {
        throw new Error(`place source does not parse before release build: ${asset.source}`);
      }

      const document = await io.read(sourceAbs);
      splitIncompatibleTextureSlots(document);
      const transforms = [];
      const textureCount = Number(sourceInspection.metrics.textureCount) || 0;
      const sourceAlreadyKtx2 = textureCount > 0
        && sourceInspection.metrics.ktx2TextureCount === textureCount;
      if (textureCount > 0 && !sourceAlreadyKtx2) {
        transforms.push(
          ktx2({
            slots: /^(baseColorTexture|emissiveTexture)$/,
            imageDecoder: decodeImage,
            ...PLACE_TEXTURE_PROFILES.color.options,
            generateMipmap: true,
            needSupercompression: false,
            isPerceptual: true,
            isSetKTX2SRGBTransferFunc: true,
          }),
          ktx2({
            slots: /^(normalTexture|clearcoatNormalTexture)$/,
            imageDecoder: decodeImage,
            ...PLACE_TEXTURE_PROFILES.normal.options,
            generateMipmap: true,
            isNormalMap: true,
            isPerceptual: false,
            isSetKTX2SRGBTransferFunc: false,
          }),
          ktx2({
            slots: /^(occlusionTexture|metallicRoughnessTexture|roughnessTexture|metalnessTexture|clearcoatTexture|clearcoatRoughnessTexture)$/,
            imageDecoder: decodeImage,
            ...PLACE_TEXTURE_PROFILES.orm.options,
            generateMipmap: true,
            needSupercompression: false,
            isPerceptual: false,
            isSetKTX2SRGBTransferFunc: false,
          }),
        );
      }
      transforms.push(meshopt({
        encoder: MeshoptEncoder,
        ...RELEASE_MESHOPT_OPTIONS,
      }));

      await document.transform(...transforms);
      stampReleaseContractMetadata(document, textureCount);
      const releasePayload = Buffer.from(await io.writeBinary(document));
      await writeFile(temporaryReleaseAbs, releasePayload);

      const parsedSource = parseStrictEmbeddedGlb(sourceBytes, `${asset.id} source`);
      const parsedRelease = parseReleaseGlbPayload(
        releasePayload,
        `${asset.id} staged release`,
      );
      const materialContractSignature = assertGltfMaterialContractParity(
        parsedSource.gltf,
        parsedRelease.gltf,
        `${asset.id} staged release`,
      );
      const ktx2PayloadValidation = validateKtx2MaterialRolePayloads(
        parsedRelease.gltf,
        parsedRelease.binary,
        `${asset.id} staged release`,
      );
      const pair = inspectReleaseAssetPair(asset.source, temporaryReleaseAbs, { root });
      if (!pair.ok) {
        throw new Error(
          `place release validation failed: ${asset.release}\n`
          + `${JSON.stringify(pair.issues, null, 2)}`,
        );
      }

      built.push({
        ...asset,
        sourceAbs,
        releaseAbs,
        temporaryReleaseAbs,
        sourceSha256,
        releaseSha256: sha256(releasePayload),
        sourceBytes: sourceBytes.length,
        sourcePayload: sourceBytes,
        releaseBytes: releasePayload.length,
        releasePayload,
        textures: pair.release.metrics.textureCount,
        ktx2Textures: pair.release.metrics.ktx2TextureCount,
        meshoptBufferViews: pair.release.metrics.meshoptBufferViewCount,
        contractNodeCount: pair.release.metrics.contractNodeNames.length,
        materialContractSignature,
        ktx2PayloadValidation,
      });
      console.log(
        `[place-release] ${index + 1}/${selected.length} ${asset.id}: staged and validated `
        + `${formatBytes(sourceBytes.length)} -> ${formatBytes(releasePayload.length)}; `
        + `ktx2=${pair.release.metrics.ktx2TextureCount}/${pair.release.metrics.textureCount} `
        + `meshopt=${pair.release.metrics.meshoptBufferViewCount}`,
      );
    }

    validateSelectedPlaceBuild(selected, built);
    const nextManifest = patchPlaceManifestRows(manifestBeforeBuild, built);
    validatePatchedPlaceManifest(manifestBeforeBuild, nextManifest, built);
    const nextManifestBytes = Buffer.from(`${JSON.stringify(nextManifest, null, 2)}\n`);

    assertPlaceSourceHashesUnchanged(
      built,
      Object.fromEntries(built.map((entry) => [
        entry.id,
        currentSha256(entry.sourceAbs),
      ])),
    );
    const bindings = buildPlacePublicationBindings(built, {
      manifestPath: releaseManifestPath,
      manifestSha256,
      partManifestPath,
      partManifestSha256,
      currentReleaseSha256ById,
    });
    const publicationGuards = buildPlacePublicationGuardDescriptors(built, {
      partManifestPath,
      partManifestSha256,
      partManifestPayload: partManifestBytesBeforeBuild,
    });

    await publishFileSetTransaction({
      files: [
        ...built.map((entry, index) => ({
          path: bindings.releases[index].path,
          bytes: entry.releasePayload,
          expectedCurrentSha256: bindings.releases[index].expectedCurrentSha256,
          validate: async (stagedPath, stagedBytes) => {
            if (sha256(stagedBytes) !== entry.releaseSha256) {
              throw new Error(`staged release hash mismatch for ${entry.id}`);
            }
            assertPlaceSourceHashesUnchanged([entry], {
              [entry.id]: currentSha256(entry.sourceAbs),
            });
            const stagedPair = inspectReleaseAssetPair(entry.source, stagedPath, { root });
            if (!stagedPair.ok) {
              throw new Error(
                `staged place release validation failed for ${entry.id}: `
                + JSON.stringify(stagedPair.issues),
              );
            }
            const parsedStagedRelease = parseReleaseGlbPayload(
              stagedBytes,
              `${entry.id} publication release`,
            );
            assertGltfMaterialContractParity(
              parseStrictEmbeddedGlb(
                readFileSync(entry.sourceAbs),
                `${entry.id} publication source`,
              ).gltf,
              parsedStagedRelease.gltf,
              `${entry.id} publication release`,
            );
            validateKtx2MaterialRolePayloads(
              parsedStagedRelease.gltf,
              parsedStagedRelease.binary,
              `${entry.id} publication release`,
            );
          },
        })),
        {
          path: bindings.manifest.path,
          bytes: nextManifestBytes,
          expectedCurrentSha256: bindings.manifest.expectedCurrentSha256,
          validate: async (_stagedPath, stagedBytes) => {
            const parsed = JSON.parse(Buffer.from(stagedBytes).toString('utf8'));
            validatePatchedPlaceManifest(manifestBeforeBuild, parsed, built);
          },
        },
        // Identity guards publish last. If a selected source or the parts manifest changes after
        // staged validation, its per-record current-hash check fails and the transaction rolls
        // back the release GLBs and release manifest already promoted earlier in this file set.
        ...publicationGuards,
      ],
    });

    console.log(
      `[place-release] published ${built.length} selected place GLB(s) + manifest `
      + `transactionally; manifest order and membership preserved`,
    );
    return {
      selectedIds: selected.map((asset) => asset.id),
      manifestSha256BeforeBuild: manifestSha256,
      built: built.map((entry) => ({
        id: entry.id,
        sourceSha256: entry.sourceSha256,
        releaseSha256: entry.releaseSha256,
        sourceBytes: entry.sourceBytes,
        releaseBytes: entry.releaseBytes,
      })),
    };
  } finally {
    await rm(buildRoot, { recursive: true, force: true });
  }
}

export function validateSelectedPlaceBuild(selectedAssets, builtEntries) {
  if (!Array.isArray(selectedAssets) || selectedAssets.length === 0) {
    throw new Error('selected place release build requires at least one selected asset');
  }
  if (!Array.isArray(builtEntries) || builtEntries.length !== selectedAssets.length) {
    throw new Error(
      `selected place release build must contain ${selectedAssets.length} assets; `
      + `found ${Array.isArray(builtEntries) ? builtEntries.length : 0}`,
    );
  }
  const selectedIds = selectedAssets.map((entry) => entry?.id);
  const builtIds = builtEntries.map((entry) => entry?.id);
  if (new Set(selectedIds).size !== selectedIds.length
      || new Set(builtIds).size !== builtIds.length) {
    throw new Error('selected place release build contains duplicate asset ids');
  }
  const missing = selectedIds.filter((id) => !builtIds.includes(id));
  const unexpected = builtIds.filter((id) => !selectedIds.includes(id));
  if (missing.length || unexpected.length) {
    throw new Error(
      `selected place release build set mismatch; missing=${missing.join(',') || '<none>'} `
      + `unexpected=${unexpected.join(',') || '<none>'}`,
    );
  }
  const selectedById = new Map(selectedAssets.map((entry) => [entry.id, entry]));
  for (const entry of builtEntries) {
    const selected = selectedById.get(entry.id);
    if (entry.kind !== 'part:places') {
      throw new Error(`selected place release has invalid kind for ${entry.id}: ${entry.kind}`);
    }
    if (entry.source !== selected.source) {
      throw new Error(
        `selected place release source binding mismatch for ${entry.id}: `
        + `${selected.source} -> ${entry.source}`,
      );
    }
    if (entry.release !== selected.release) {
      throw new Error(
        `selected place release destination binding mismatch for ${entry.id}: `
        + `${selected.release} -> ${entry.release}`,
      );
    }
    if (!Buffer.isBuffer(entry.releasePayload) || entry.releasePayload.length === 0) {
      throw new Error(`selected place release has no payload for ${entry.id}`);
    }
    if (!Buffer.isBuffer(entry.sourcePayload) || entry.sourcePayload.length === 0) {
      throw new Error(`selected place release has no source payload for ${entry.id}`);
    }
    if (entry.sourcePayload.length !== entry.sourceBytes) {
      throw new Error(`selected place release source byte count mismatch for ${entry.id}`);
    }
    if (sha256(entry.sourcePayload) !== entry.sourceSha256) {
      throw new Error(`selected place release source digest mismatch for ${entry.id}`);
    }
    if (entry.releasePayload.length !== entry.releaseBytes) {
      throw new Error(`selected place release byte count mismatch for ${entry.id}`);
    }
    if (sha256(entry.releasePayload) !== entry.releaseSha256) {
      throw new Error(`selected place release digest mismatch for ${entry.id}`);
    }
    if (!Number.isInteger(entry.textures) || entry.textures < 0
        || entry.textures !== entry.ktx2Textures) {
      throw new Error(`selected place release has non-KTX2 textures for ${entry.id}`);
    }
    if (!Number.isInteger(entry.meshoptBufferViews) || entry.meshoptBufferViews <= 0) {
      throw new Error(`selected place release has no Meshopt buffer views for ${entry.id}`);
    }
    if (!/^[0-9a-f]{64}$/.test(entry.sourceSha256 || '')
        || !/^[0-9a-f]{64}$/.test(entry.releaseSha256 || '')
        || !/^[0-9a-f]{64}$/.test(entry.materialContractSignature || '')) {
      throw new Error(`selected place release has incomplete digest bindings for ${entry.id}`);
    }
    if (entry.ktx2PayloadValidation?.textureCount !== entry.textures) {
      throw new Error(`selected place release has incomplete KTX2 payload validation for ${entry.id}`);
    }
  }
  return true;
}

export function patchPlaceManifestRows(manifest, builtEntries) {
  if (!manifest || !Array.isArray(manifest.assets)) {
    throw new TypeError('release manifest requires an assets array');
  }
  if (!Array.isArray(builtEntries) || builtEntries.length === 0) {
    throw new Error('place manifest patch requires at least one built entry');
  }
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
    next.assets[matchingIndices[0]] = placeManifestRow(entry);
  }
  return next;
}

export function validatePatchedPlaceManifest(previousManifest, nextManifest, builtEntries) {
  if (!previousManifest || !Array.isArray(previousManifest.assets)
      || !nextManifest || !Array.isArray(nextManifest.assets)) {
    throw new TypeError('place manifest validation requires previous and next assets arrays');
  }
  const previousIds = previousManifest.assets.map((asset) => asset?.id);
  const nextIds = nextManifest.assets.map((asset) => asset?.id);
  if (JSON.stringify(nextIds) !== JSON.stringify(previousIds)) {
    throw new Error('patched release manifest changed asset row order or membership');
  }
  const expectedRows = new Map(builtEntries.map((entry) => [entry.id, placeManifestRow(entry)]));
  if (expectedRows.size !== builtEntries.length) {
    throw new Error('patched release manifest build contains duplicate ids');
  }
  for (const [index, previousRow] of previousManifest.assets.entries()) {
    const expected = expectedRows.get(previousRow?.id);
    if (expected) {
      if (JSON.stringify(nextManifest.assets[index]) !== JSON.stringify(expected)) {
        throw new Error(`patched release manifest row mismatch for ${previousRow.id}`);
      }
    } else if (JSON.stringify(nextManifest.assets[index]) !== JSON.stringify(previousRow)) {
      throw new Error(`patched release manifest changed untouched row ${previousRow?.id ?? index}`);
    }
  }
  return true;
}

export function assertPlaceSourceHashesUnchanged(builtEntries, currentSourceSha256ById) {
  if (!currentSourceSha256ById || typeof currentSourceSha256ById !== 'object') {
    throw new TypeError('current source hash bindings are required');
  }
  for (const entry of builtEntries || []) {
    if (!Object.prototype.hasOwnProperty.call(currentSourceSha256ById, entry.id)) {
      throw new Error(`missing current source hash binding for ${entry.id}`);
    }
    const current = currentSourceSha256ById[entry.id];
    if (current !== entry.sourceSha256) {
      throw new Error(
        `place source changed during release build: ${entry.source} `
        + `(${entry.sourceSha256} -> ${current ?? '<missing>'})`,
      );
    }
  }
  return true;
}

export function buildPlacePublicationBindings(builtEntries, {
  manifestPath,
  manifestSha256,
  partManifestPath,
  partManifestSha256,
  currentReleaseSha256ById,
} = {}) {
  if (typeof manifestPath !== 'string' || manifestPath.length === 0) {
    throw new TypeError('manifest publication path is required');
  }
  assertSha256OrNull(manifestSha256, 'current manifest hash', false);
  if (typeof partManifestPath !== 'string' || partManifestPath.length === 0) {
    throw new TypeError('parts manifest guard path is required');
  }
  assertSha256OrNull(partManifestSha256, 'current parts manifest hash', false);
  if (!currentReleaseSha256ById || typeof currentReleaseSha256ById !== 'object') {
    throw new TypeError('current release hash bindings are required');
  }
  return {
    releases: (builtEntries || []).map((entry) => {
      if (!Object.prototype.hasOwnProperty.call(currentReleaseSha256ById, entry.id)) {
        throw new Error(`missing current release hash binding for ${entry.id}`);
      }
      const expectedCurrentSha256 = currentReleaseSha256ById[entry.id];
      assertSha256OrNull(expectedCurrentSha256, `current release hash for ${entry.id}`, true);
      return {
        id: entry.id,
        path: entry.releaseAbs,
        expectedCurrentSha256,
      };
    }),
    manifest: {
      path: manifestPath,
      expectedCurrentSha256: manifestSha256,
    },
    sources: (builtEntries || []).map((entry) => ({
      id: entry.id,
      path: entry.sourceAbs,
      expectedCurrentSha256: entry.sourceSha256,
    })),
    partManifest: {
      path: partManifestPath,
      expectedCurrentSha256: partManifestSha256,
    },
  };
}

export function buildPlacePublicationGuardDescriptors(builtEntries, {
  partManifestPath,
  partManifestSha256,
  partManifestPayload,
} = {}) {
  if (!Array.isArray(builtEntries) || builtEntries.length === 0) {
    throw new Error('place publication guards require at least one built source');
  }
  if (typeof partManifestPath !== 'string' || partManifestPath.length === 0) {
    throw new TypeError('parts manifest guard path is required');
  }
  assertSha256OrNull(partManifestSha256, 'current parts manifest hash', false);
  const partBytes = Buffer.isBuffer(partManifestPayload)
    ? partManifestPayload
    : Buffer.from(partManifestPayload || '');
  if (partBytes.length === 0 || sha256(partBytes) !== partManifestSha256) {
    throw new Error('parts manifest guard payload does not match its current SHA-256');
  }
  JSON.parse(partBytes.toString('utf8'));

  const sourceGuards = builtEntries.map((entry) => {
    if (typeof entry.sourceAbs !== 'string' || entry.sourceAbs.length === 0) {
      throw new TypeError(`place source guard path is required for ${entry.id}`);
    }
    assertSha256OrNull(entry.sourceSha256, `place source hash for ${entry.id}`, false);
    if (!Buffer.isBuffer(entry.sourcePayload)
        || sha256(entry.sourcePayload) !== entry.sourceSha256) {
      throw new Error(`place source guard payload does not match current SHA-256 for ${entry.id}`);
    }
    return {
      path: entry.sourceAbs,
      bytes: entry.sourcePayload,
      expectedCurrentSha256: entry.sourceSha256,
      validate: async (_stagedPath, stagedBytes) => {
        if (sha256(stagedBytes) !== entry.sourceSha256) {
          throw new Error(`staged source guard hash mismatch for ${entry.id}`);
        }
      },
    };
  });
  return [
    ...sourceGuards,
    {
      path: partManifestPath,
      bytes: partBytes,
      expectedCurrentSha256: partManifestSha256,
      validate: async (_stagedPath, stagedBytes) => {
        if (sha256(stagedBytes) !== partManifestSha256) {
          throw new Error('staged parts manifest guard hash mismatch');
        }
        JSON.parse(Buffer.from(stagedBytes).toString('utf8'));
      },
    },
  ];
}

function placeManifestRow(entry) {
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

function splitIncompatibleTextureSlots(document) {
  const root = document.getRoot();
  for (const material of root.listMaterials()) {
    const baseTexture = material.getBaseColorTexture();
    const normalTexture = material.getNormalTexture();
    if (!baseTexture || !normalTexture || baseTexture !== normalTexture) continue;
    const image = normalTexture.getImage();
    if (!image) continue;
    const clone = document.createTexture(normalTexture.getName() || 'normal_slot_clone')
      .setImage(image)
      .setMimeType(normalTexture.getMimeType());
    material.setNormalTexture(clone);
  }
}

export function stampReleaseContractMetadata(document, textureCount) {
  const root = document.getRoot();
  const asset = root.getAsset();
  if (!asset.extras?.spacefaceAsset) {
    throw new Error('place release requires an asset-level spacefaceAsset contract');
  }
  const releaseContract = (source) => ({
    ...source,
    ...(textureCount > 0 ? {
      textureCompression: 'KTX2/BasisU+mips',
      textureProfiles: 'ETC1S-color+ORM/UASTC-normal',
    } : {}),
    deliverableRole: releaseDeliverableRole(source),
    wiringStatus: 'promoted_live_place',
  });
  asset.extras = {
    ...asset.extras,
    spacefaceAsset: releaseContract(asset.extras.spacefaceAsset),
  };
  let sceneContracts = 0;
  for (const scene of root.listScenes()) {
    const extras = scene.getExtras() || {};
    if (!extras.spacefaceAsset) continue;
    scene.setExtras({
      ...extras,
      spacefaceAsset: releaseContract(extras.spacefaceAsset),
    });
    sceneContracts += 1;
  }
  let nodeContracts = 0;
  for (const node of root.listNodes()) {
    const extras = node.getExtras() || {};
    if (!extras.spacefaceAsset) continue;
    node.setExtras({
      ...extras,
      spacefaceAsset: releaseContract(extras.spacefaceAsset),
    });
    nodeContracts += 1;
  }
  if (sceneContracts === 0 || nodeContracts === 0) {
    throw new Error(
      `place release requires scene and canonical-root spacefaceAsset contracts; `
      + `found scenes=${sceneContracts} nodes=${nodeContracts}`,
    );
  }
  return { assetContracts: 1, sceneContracts, nodeContracts };
}

function releaseDeliverableRole(source) {
  const declaredLods = Array.isArray(source?.exportedLods)
    ? source.exportedLods
    : (Array.isArray(source?.lods) ? source.lods : null);
  if (declaredLods) {
    const lods = declaredLods.map((value) => String(value).toLowerCase());
    if (lods.length === 1 && lods[0] === 'lod0') return 'production_single_lod_preview';
    if (lods.length > 1 || lods.some((value) => value === 'lod1' || value === 'lod2')) {
      return 'production_multi_lod';
    }
  }
  if (source?.deliverableRole === 'production_single_lod_preview') {
    return 'production_single_lod_preview';
  }
  return source?.deliverableRole === 'production_multi_lod'
    ? source.deliverableRole
    : 'production_multi_lod';
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

function currentSha256(path) {
  return existsSync(path) ? sha256(readFileSync(path)) : null;
}

function assertSha256OrNull(value, label, allowNull) {
  if (allowNull && value === null) return;
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new TypeError(`${label} must be a SHA-256 digest${allowNull ? ' or null' : ''}`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function errorMessage(error) {
  return error && error.stack ? error.stack : String(error);
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
}
