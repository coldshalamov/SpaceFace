// Promote the PQ-136 wreck/aftermath and source-only everyday-space-kit bodies.
//
// All source GLBs remain read-only. The complete set is built under a temporary
// root, validated, and only then published with release_manifest.json as one
// file-set transaction. Release texture policy matches the canonical hull/place
// lanes: ETC1S color/ORM, UASTC normals, mipmaps, and Meshopt geometry.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
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
const RELEASE_MANIFEST = 'assets/ships/release/release_manifest.json';
const RELEASE_PLACES = 'assets/ships/release/parts/places';
const WRECK_REPORT = 'assets/incubator/wreck_aftermath_pack/evidence/build-report.json';
const WRECK_AUTHORED_DOWN = 'assets/incubator/wreck_aftermath_pack/authored_down';
const KIT_REPORT = 'assets/incubator/everyday_space_kit/evidence/build-report.json';
const KIT_SOURCE = 'assets/incubator/everyday_space_kit/source';

const EXPECTED_WRECK_SOURCE_COUNT = 37;
const EXPECTED_WRECK_AUTHORED_DOWN_COUNT = 7;
const EXPECTED_KIT_SOURCE_ONLY_COUNT = 30;
const EXPECTED_RELEASE_COUNT = 74;

const KIT_SOURCE_ONLY_STEMS = Object.freeze([
  'cargo_pod_hazmat',
  'cargo_pod_standard_breached',
  'ore_bulk_container',
  'container_rack_abandoned',
  'tanker_coupling',
  'drill_platform_cold',
  'crusher_module',
  'ore_sorter',
  'repair_scaffold',
  'repair_scaffold_bent',
  'construction_frame',
  'welding_drone',
  'parts_rack',
  'power_skid',
  'customs_pylon',
  'inspection_platform',
  'traffic_signal',
  'habitat_pod',
  'habitat_pod_derelict',
  'shuttle_dock',
  'observation_blister',
  'comms_array',
  'solar_array',
  'utility_module',
  'passenger_platform',
  'salvage_clamp',
  'hull_rack',
  'illicit_transfer_frame',
  'pirate_sensor_mast',
  'power_skid_patched',
]);

const WRECK_AUTHORED_DOWN_STEMS = Object.freeze([
  'aft_armor_slab',
  'deb_liner_hull_panel',
  'deb_ore_freighter_hopper_lid',
  'frag_grating_sheet',
  'wreck_liner_boatbay',
  'wreck_liner_bow',
  'wreck_ore_freighter_hopper',
]);

export const PACK_TEXTURE_PROFILES = Object.freeze({
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

export const PACK_RELEASE_ASSETS = Object.freeze(buildReleaseCatalog());

if (isMainModule()) {
  try {
    await buildPackReleaseAssets();
  } catch (error) {
    console.error(`[pack-release] FAIL: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

export async function buildPackReleaseAssets(options = {}) {
  const root = resolve(options.root || ROOT);
  const releaseManifestPath = resolve(root, RELEASE_MANIFEST);
  const manifestBytesBeforeBuild = readFileSync(releaseManifestPath);
  const manifestBeforeBuild = JSON.parse(manifestBytesBeforeBuild.toString('utf8'));
  const manifestSha256 = sha256(manifestBytesBeforeBuild);
  const initialReleaseHashes = Object.fromEntries(PACK_RELEASE_ASSETS.map((asset) => [
    asset.id,
    currentSha256(resolve(root, asset.release)),
  ]));
  const buildRoot = await mkdtemp(join(tmpdir(), 'spaceface-pack-release-'));
  const built = [];
  const failures = [];

  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });

  try {
    for (const [index, asset] of PACK_RELEASE_ASSETS.entries()) {
      try {
        const entry = await stageReleaseAsset(asset, {
          root,
          buildRoot,
          io,
        });
        built.push(entry);
        console.log(
          `[pack-release] ${index + 1}/${PACK_RELEASE_ASSETS.length} ${asset.id}: `
          + `${formatBytes(entry.sourceBytes)} -> ${formatBytes(entry.releaseBytes)} `
          + `(${sizeDelta(entry.sourceBytes, entry.releaseBytes)}; `
          + `ktx2=${entry.ktx2Textures}/${entry.textures}, `
          + `meshopt=${entry.meshoptBufferViews})`,
        );
      } catch (error) {
        failures.push({
          id: asset.id,
          family: asset.family,
          sourceClass: asset.sourceClass,
          source: asset.source,
          error: errorMessage(error),
        });
        console.error(
          `[pack-release] REFUSED ${asset.family}/${asset.sourceClass}/${asset.id}: `
          + `${errorMessage(error)}`,
        );
      }
    }

    if (failures.length) {
      throw new Error(
        `${failures.length}/${PACK_RELEASE_ASSETS.length} source model(s) could not be processed; `
        + `nothing was published\n${JSON.stringify(failures, null, 2)}`,
      );
    }

    validateCompletePackBuild(built);
    const nextManifest = patchPackManifestRows(manifestBeforeBuild, built);
    validatePatchedPackManifest(manifestBeforeBuild, nextManifest, built);
    const nextManifestBytes = Buffer.from(`${JSON.stringify(nextManifest, null, 2)}\n`);

    // Source files are read-only and are never transaction destinations. Bind publication to
    // the exact bytes used for the build immediately before the file-set transaction begins.
    assertSourceHashesUnchanged(built, root);

    await publishFileSetTransaction({
      files: [
        ...built.map((entry) => ({
          path: entry.releaseAbs,
          bytes: entry.releasePayload,
          expectedCurrentSha256: initialReleaseHashes[entry.id],
          validate: async (stagedPath, stagedBytes) => {
            validateStagedRelease(entry, stagedPath, stagedBytes, root);
          },
        })),
        {
          path: releaseManifestPath,
          bytes: nextManifestBytes,
          expectedCurrentSha256: manifestSha256,
          validate: async (_stagedPath, stagedBytes) => {
            const parsed = JSON.parse(Buffer.from(stagedBytes).toString('utf8'));
            validatePatchedPackManifest(manifestBeforeBuild, parsed, built);
          },
        },
      ],
    });

    const summary = buildSummary(built, manifestSha256);
    for (const family of summary.families) {
      console.log(
        `[pack-release] ${family.family}: ${family.count} released; `
        + `${formatBytes(family.sourceBytes)} source -> ${formatBytes(family.releaseBytes)} release `
        + `(${sizeDelta(family.sourceBytes, family.releaseBytes)})`,
      );
    }
    console.log(
      `[pack-release] published ${summary.count} GLBs + release_manifest.json transactionally: `
      + `${formatBytes(summary.sourceBytes)} source -> ${formatBytes(summary.releaseBytes)} release `
      + `(${sizeDelta(summary.sourceBytes, summary.releaseBytes)})`,
    );
    return summary;
  } finally {
    await rm(buildRoot, { recursive: true, force: true });
  }
}

async function stageReleaseAsset(asset, { root, buildRoot, io }) {
  const sourceAbs = resolve(root, asset.source);
  const releaseAbs = resolve(root, asset.release);
  const temporaryReleaseAbs = resolve(buildRoot, `${asset.id}.glb`);
  if (!existsSync(sourceAbs)) throw new Error(`missing source: ${asset.source}`);

  const sourcePayload = readFileSync(sourceAbs);
  const sourceSha256 = sha256(sourcePayload);
  const sourceInspection = inspectGlbReleaseCompression(asset.source, {
    root,
    releaseMode: false,
  });
  if (!sourceInspection.ok) throw new Error(`source GLB does not parse: ${asset.source}`);
  const sourceParsed = parseStrictEmbeddedGlb(sourcePayload, `${asset.id} source`);
  assertCatalogSourceIdentity(asset, sourcePayload, sourceSha256);

  const document = await io.read(sourceAbs);
  splitIncompatibleTextureSlots(document);
  const textureCount = Number(sourceInspection.metrics.textureCount) || 0;
  const transforms = [];
  if (textureCount > 0) {
    transforms.push(
      ktx2({
        slots: /^(baseColorTexture|emissiveTexture)$/,
        imageDecoder: decodeImage,
        ...PACK_TEXTURE_PROFILES.color.options,
        generateMipmap: true,
        needSupercompression: false,
        isPerceptual: true,
        isSetKTX2SRGBTransferFunc: true,
      }),
      ktx2({
        slots: /^(normalTexture|clearcoatNormalTexture)$/,
        imageDecoder: decodeImage,
        ...PACK_TEXTURE_PROFILES.normal.options,
        generateMipmap: true,
        isNormalMap: true,
        isPerceptual: false,
        isSetKTX2SRGBTransferFunc: false,
      }),
      ktx2({
        slots: /^(occlusionTexture|metallicRoughnessTexture|roughnessTexture|metalnessTexture|clearcoatTexture|clearcoatRoughnessTexture)$/,
        imageDecoder: decodeImage,
        ...PACK_TEXTURE_PROFILES.orm.options,
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
  stampPackReleaseIdentity(document, asset, {
    sourceGltf: sourceParsed.gltf,
    sourceSha256,
    textureCount,
  });
  const releasePayload = Buffer.from(await io.writeBinary(document));
  await writeFile(temporaryReleaseAbs, releasePayload);

  const parsedRelease = parseReleaseGlbPayload(releasePayload, `${asset.id} staged release`);
  const materialContractSignature = assertGltfMaterialContractParity(
    sourceParsed.gltf,
    parsedRelease.gltf,
    `${asset.id} staged release`,
  );
  const ktx2PayloadValidation = validateKtx2MaterialRolePayloads(
    parsedRelease.gltf,
    parsedRelease.binary,
    `${asset.id} staged release`,
  );
  validateEmbeddedReleaseIdentity(parsedRelease.gltf, asset, sourceSha256);

  const pair = inspectReleaseAssetPair(asset.source, temporaryReleaseAbs, { root });
  if (!pair.ok) {
    throw new Error(
      `release validation failed: ${asset.release}\n${JSON.stringify(pair.issues, null, 2)}`,
    );
  }

  return {
    ...asset,
    sourceAbs,
    releaseAbs,
    temporaryReleaseAbs,
    sourcePayload,
    sourceSha256,
    releasePayload,
    releaseSha256: sha256(releasePayload),
    sourceBytes: sourcePayload.length,
    releaseBytes: releasePayload.length,
    textures: pair.release.metrics.textureCount,
    ktx2Textures: pair.release.metrics.ktx2TextureCount,
    meshoptBufferViews: pair.release.metrics.meshoptBufferViewCount,
    contractNodeCount: pair.release.metrics.contractNodeNames.length,
    materialContractSignature,
    ktx2PayloadValidation,
  };
}

export function validateCompletePackBuild(builtEntries) {
  if (!Array.isArray(builtEntries) || builtEntries.length !== EXPECTED_RELEASE_COUNT) {
    throw new Error(
      `pack release build must contain all ${EXPECTED_RELEASE_COUNT} assets; `
      + `found ${Array.isArray(builtEntries) ? builtEntries.length : 0}`,
    );
  }
  const expectedIds = PACK_RELEASE_ASSETS.map((entry) => entry.id);
  const builtIds = builtEntries.map((entry) => entry?.id);
  if (new Set(builtIds).size !== builtIds.length
      || JSON.stringify(builtIds) !== JSON.stringify(expectedIds)) {
    throw new Error('pack release build order or membership differs from the canonical catalog');
  }
  for (const entry of builtEntries) {
    if (!Buffer.isBuffer(entry.sourcePayload)
        || entry.sourcePayload.length !== entry.sourceBytes
        || sha256(entry.sourcePayload) !== entry.sourceSha256) {
      throw new Error(`pack release source identity is incomplete for ${entry.id}`);
    }
    if (!Buffer.isBuffer(entry.releasePayload)
        || entry.releasePayload.length !== entry.releaseBytes
        || sha256(entry.releasePayload) !== entry.releaseSha256) {
      throw new Error(`pack release payload identity is incomplete for ${entry.id}`);
    }
    if (!Number.isInteger(entry.textures) || entry.textures < 0
        || entry.textures !== entry.ktx2Textures) {
      throw new Error(`pack release has non-KTX2 textures for ${entry.id}`);
    }
    if (!Number.isInteger(entry.meshoptBufferViews) || entry.meshoptBufferViews <= 0) {
      throw new Error(`pack release has no Meshopt buffer views for ${entry.id}`);
    }
    if (!/^[0-9a-f]{64}$/.test(entry.materialContractSignature || '')) {
      throw new Error(`pack release has no material-contract signature for ${entry.id}`);
    }
    if (entry.ktx2PayloadValidation?.textureCount !== entry.textures) {
      throw new Error(`pack release has incomplete KTX2 payload validation for ${entry.id}`);
    }
  }
  return true;
}

export function patchPackManifestRows(previousManifest, builtEntries) {
  if (!previousManifest || !Array.isArray(previousManifest.assets)) {
    throw new TypeError('release manifest requires an assets array');
  }
  validateCompletePackBuild(builtEntries);
  const next = structuredClone(previousManifest);
  assertUniqueManifestIds(next.assets, 'current release manifest');
  const indexById = new Map(next.assets.map((row, index) => [row.id, index]));
  for (const entry of builtEntries) {
    const row = packManifestRow(entry);
    if (indexById.has(entry.id)) {
      const index = indexById.get(entry.id);
      const existing = next.assets[index];
      if (existing.source !== entry.source || existing.release !== entry.release) {
        throw new Error(`existing manifest row has a different binding for ${entry.id}`);
      }
      next.assets[index] = row;
    } else {
      indexById.set(entry.id, next.assets.length);
      next.assets.push(row);
    }
  }
  return next;
}

export function validatePatchedPackManifest(previousManifest, nextManifest, builtEntries) {
  if (!previousManifest || !Array.isArray(previousManifest.assets)
      || !nextManifest || !Array.isArray(nextManifest.assets)) {
    throw new TypeError('pack manifest validation requires previous and next assets arrays');
  }
  assertUniqueManifestIds(previousManifest.assets, 'previous release manifest');
  assertUniqueManifestIds(nextManifest.assets, 'next release manifest');
  const builtById = new Map(builtEntries.map((entry) => [entry.id, entry]));
  if (builtById.size !== EXPECTED_RELEASE_COUNT) {
    throw new Error(`pack manifest patch requires ${EXPECTED_RELEASE_COUNT} unique built rows`);
  }

  const previousIds = previousManifest.assets.map((row) => row.id);
  const nextIds = nextManifest.assets.map((row) => row.id);
  const previousPackIds = new Set(previousIds.filter((id) => builtById.has(id)));
  const expectedIds = [
    ...previousIds,
    ...PACK_RELEASE_ASSETS.map((entry) => entry.id).filter((id) => !previousPackIds.has(id)),
  ];
  if (JSON.stringify(nextIds) !== JSON.stringify(expectedIds)) {
    throw new Error('pack manifest patch changed existing order or appended the wrong membership');
  }

  const previousById = new Map(previousManifest.assets.map((row) => [row.id, row]));
  for (const row of nextManifest.assets) {
    const built = builtById.get(row.id);
    if (built) {
      if (JSON.stringify(row) !== JSON.stringify(packManifestRow(built))) {
        throw new Error(`pack manifest row mismatch for ${row.id}`);
      }
    } else if (JSON.stringify(row) !== JSON.stringify(previousById.get(row.id))) {
      throw new Error(`pack manifest patch changed untouched row ${row.id}`);
    }
  }
  return true;
}

function buildReleaseCatalog() {
  const wreckReport = readJsonAtRoot(WRECK_REPORT);
  if (!Array.isArray(wreckReport.assets)
      || wreckReport.assets.length !== EXPECTED_WRECK_SOURCE_COUNT) {
    throw new Error(
      `wreck source report must enumerate ${EXPECTED_WRECK_SOURCE_COUNT} assets`,
    );
  }
  const wreckSources = wreckReport.assets.map((record) => {
    const donorId = String(record.id || '');
    return makeCatalogEntry({
      id: `place_aftermath_${donorId}`,
      family: 'wreck_aftermath_pack',
      sourceClass: 'source',
      donorId,
      role: String(record.reads || record.was || 'Wreck and aftermath donor body'),
      source: normalizeRel(record.file),
      expectedSourceSha256: String(record.sha256 || '').toLowerCase(),
      expectedSourceBytes: Number(record.bytes),
    });
  });

  const authoredDownOnDisk = readdirSync(resolve(ROOT, WRECK_AUTHORED_DOWN))
    .filter((name) => name.toLowerCase().endsWith('.glb'))
    .map((name) => basename(name, '.glb'))
    .sort();
  if (JSON.stringify(authoredDownOnDisk) !== JSON.stringify([...WRECK_AUTHORED_DOWN_STEMS].sort())
      || authoredDownOnDisk.length !== EXPECTED_WRECK_AUTHORED_DOWN_COUNT) {
    throw new Error('wreck authored_down inventory differs from the exact seven-file contract');
  }
  const authoredDown = authoredDownOnDisk.map((donorId) => makeCatalogEntry({
    id: `place_aftermath_${donorId}_authored_down`,
    family: 'wreck_aftermath_pack',
    sourceClass: 'authored_down',
    donorId,
    role: `Authored-down wreck dressing body derived from ${donorId}`,
    source: `${WRECK_AUTHORED_DOWN}/${donorId}.glb`,
  }));

  const kitReport = readJsonAtRoot(KIT_REPORT);
  const kitRecords = new Map((kitReport.assets || []).map((record) => [record.id, record]));
  if (KIT_SOURCE_ONLY_STEMS.length !== EXPECTED_KIT_SOURCE_ONLY_COUNT) {
    throw new Error(`everyday-space-kit source-only inventory must contain ${EXPECTED_KIT_SOURCE_ONLY_COUNT} stems`);
  }
  const kitSources = KIT_SOURCE_ONLY_STEMS.map((donorId) => {
    const record = kitRecords.get(donorId);
    if (!record) throw new Error(`everyday-space-kit report has no record for ${donorId}`);
    return makeCatalogEntry({
      id: `place_${donorId}`,
      family: 'everyday_space_kit',
      sourceClass: 'source',
      donorId,
      role: String(record.role || 'Everyday space infrastructure donor body'),
      source: `${KIT_SOURCE}/${donorId}.glb`,
      expectedSourceSha256: String(record.sha256 || '').toLowerCase(),
      expectedSourceBytes: Number(record.bytes),
    });
  });

  const catalog = [...wreckSources, ...authoredDown, ...kitSources];
  validateCatalog(catalog);
  return catalog;
}

function makeCatalogEntry(entry) {
  return Object.freeze({
    ...entry,
    kind: 'part:places',
    release: `${RELEASE_PLACES}/${entry.id}.glb`,
  });
}

function validateCatalog(catalog) {
  if (catalog.length !== EXPECTED_RELEASE_COUNT) {
    throw new Error(`pack release catalog must contain ${EXPECTED_RELEASE_COUNT} assets`);
  }
  for (const key of ['id', 'source', 'release']) {
    const values = catalog.map((entry) => entry[key]);
    if (new Set(values).size !== values.length) {
      throw new Error(`pack release catalog contains duplicate ${key} values`);
    }
  }
  const familyCounts = countBy(catalog, (entry) => entry.family);
  if (familyCounts.get('wreck_aftermath_pack') !== 44
      || familyCounts.get('everyday_space_kit') !== 30) {
    throw new Error('pack release catalog family membership must be wreck=44 and kit=30');
  }
  for (const entry of catalog) {
    if (!/^place_[a-z0-9_]+$/.test(entry.id)) {
      throw new Error(`invalid pack release id: ${entry.id}`);
    }
    if (!entry.source.startsWith('assets/incubator/') || !entry.source.endsWith('.glb')) {
      throw new Error(`pack source escaped its read-only incubator roots: ${entry.source}`);
    }
    if (!entry.release.startsWith(`${RELEASE_PLACES}/`) || !entry.release.endsWith('.glb')) {
      throw new Error(`pack release escaped the release place tree: ${entry.release}`);
    }
  }
}

function assertCatalogSourceIdentity(asset, sourcePayload, sourceSha256) {
  if (asset.expectedSourceBytes != null && sourcePayload.length !== asset.expectedSourceBytes) {
    throw new Error(
      `source byte count drift for ${asset.source}: `
      + `${asset.expectedSourceBytes} -> ${sourcePayload.length}`,
    );
  }
  if (asset.expectedSourceSha256
      && asset.expectedSourceSha256 !== sourceSha256) {
    throw new Error(
      `source SHA-256 drift for ${asset.source}: `
      + `${asset.expectedSourceSha256} -> ${sourceSha256}`,
    );
  }
}

function stampPackReleaseIdentity(document, asset, {
  sourceGltf,
  sourceSha256,
  textureCount,
}) {
  const root = document.getRoot();
  const materialNames = [...new Set((sourceGltf.materials || []).map((material) => material.name || ''))];
  const exportedLods = lodsDeclaredBy(sourceGltf);
  const contract = {
    contractVersion: 2,
    assetId: asset.id,
    partId: asset.id,
    liveId: asset.id,
    slot: 'place',
    category: 'places',
    family: asset.family,
    packet: 'PQ-136.00',
    donorAssetId: asset.donorId,
    sourceClass: asset.sourceClass,
    role: asset.role,
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    normalConvention: 'OpenGL',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'KTX2/BasisU+mips',
    textureProfiles: 'ETC1S-color+ORM/UASTC-normal',
    ...(textureCount === 0 ? { factorOnlyMaterials: materialNames } : {}),
    legacyPart: true,
    deliverableRole: exportedLods.length > 1
      ? 'production_multi_lod'
      : 'production_single_lod_preview',
    exportedLods,
    wiringStatus: 'promoted_release_unrouted',
    claims: {
      technicalRelease: true,
      routed: false,
      placed: false,
      visualAcceptance: 'not_claimed',
    },
    sourceIdentity: {
      path: asset.source,
      sha256: sourceSha256,
    },
  };

  const gltfAsset = root.getAsset();
  gltfAsset.extras = {
    ...(gltfAsset.extras || {}),
    assetId: asset.id,
    partId: asset.id,
    spacefaceAsset: contract,
  };
  for (const scene of root.listScenes()) {
    scene.setExtras({
      ...(scene.getExtras() || {}),
      assetId: asset.id,
      partId: asset.id,
      spacefaceAsset: contract,
    });
    for (const sceneRoot of scene.listChildren()) {
      sceneRoot.setExtras({
        ...(sceneRoot.getExtras() || {}),
        spacefaceAsset: contract,
        'spaceface.assetId': asset.id,
        'spaceface.partId': asset.id,
      });
    }
  }
}

function validateEmbeddedReleaseIdentity(gltf, asset, sourceSha256) {
  const expected = gltf.asset?.extras?.spacefaceAsset;
  validateContract(expected, asset, sourceSha256, `${asset.id} asset extras`);
  const scene = (gltf.scenes || [])[gltf.scene ?? 0];
  validateContract(scene?.extras?.spacefaceAsset, asset, sourceSha256, `${asset.id} scene extras`);
  const roots = scene?.nodes || [];
  if (roots.length === 0) throw new Error(`${asset.id} release has no default-scene roots`);
  for (const index of roots) {
    validateContract(
      gltf.nodes?.[index]?.extras?.spacefaceAsset,
      asset,
      sourceSha256,
      `${asset.id} root node ${index} extras`,
    );
  }
}

function validateContract(contract, asset, sourceSha256, label) {
  if (!contract || contract.contractVersion !== 2
      || contract.assetId !== asset.id
      || contract.partId !== asset.id
      || contract.slot !== 'place'
      || contract.forward !== '+X'
      || contract.up !== '+Y'
      || contract.starboard !== '+Z'
      || contract.unit !== 'metre'
      || contract.normalConvention !== 'OpenGL'
      || contract.ormChannels !== 'R=AO,G=Roughness,B=Metallic'
      || contract.textureCompression !== 'KTX2/BasisU+mips'
      || contract.sourceIdentity?.path !== asset.source
      || contract.sourceIdentity?.sha256 !== sourceSha256
      || contract.wiringStatus !== 'promoted_release_unrouted') {
    throw new Error(`${label} does not match the PQ-136 release identity contract`);
  }
}

function validateStagedRelease(entry, stagedPath, stagedBytes, root) {
  if (sha256(stagedBytes) !== entry.releaseSha256) {
    throw new Error(`staged release hash mismatch for ${entry.id}`);
  }
  const pair = inspectReleaseAssetPair(entry.source, stagedPath, { root });
  if (!pair.ok) {
    throw new Error(
      `staged release validation failed for ${entry.id}: ${JSON.stringify(pair.issues)}`,
    );
  }
  const parsedRelease = parseReleaseGlbPayload(stagedBytes, `${entry.id} publication release`);
  assertGltfMaterialContractParity(
    parseStrictEmbeddedGlb(
      readFileSync(entry.sourceAbs),
      `${entry.id} publication source`,
    ).gltf,
    parsedRelease.gltf,
    `${entry.id} publication release`,
  );
  validateKtx2MaterialRolePayloads(
    parsedRelease.gltf,
    parsedRelease.binary,
    `${entry.id} publication release`,
  );
  validateEmbeddedReleaseIdentity(parsedRelease.gltf, entry, entry.sourceSha256);
}

function assertSourceHashesUnchanged(builtEntries, root) {
  for (const entry of builtEntries) {
    const current = currentSha256(resolve(root, entry.source));
    if (current !== entry.sourceSha256) {
      throw new Error(
        `read-only source changed during release build: ${entry.source} `
        + `(${entry.sourceSha256} -> ${current ?? '<missing>'})`,
      );
    }
  }
}

function packManifestRow(entry) {
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

function buildSummary(builtEntries, manifestSha256BeforeBuild) {
  const familyNames = ['wreck_aftermath_pack', 'everyday_space_kit'];
  const families = familyNames.map((family) => {
    const entries = builtEntries.filter((entry) => entry.family === family);
    return Object.freeze({
      family,
      count: entries.length,
      sourceBytes: sumBytes(entries, 'sourceBytes'),
      releaseBytes: sumBytes(entries, 'releaseBytes'),
    });
  });
  return Object.freeze({
    count: builtEntries.length,
    sourceBytes: sumBytes(builtEntries, 'sourceBytes'),
    releaseBytes: sumBytes(builtEntries, 'releaseBytes'),
    manifestSha256BeforeBuild,
    families: Object.freeze(families),
    built: Object.freeze(builtEntries.map((entry) => Object.freeze({
      id: entry.id,
      family: entry.family,
      sourceClass: entry.sourceClass,
      source: entry.source,
      release: entry.release,
      sourceSha256: entry.sourceSha256,
      releaseSha256: entry.releaseSha256,
      sourceBytes: entry.sourceBytes,
      releaseBytes: entry.releaseBytes,
      textures: entry.textures,
      ktx2Textures: entry.ktx2Textures,
      meshoptBufferViews: entry.meshoptBufferViews,
    }))),
  });
}

function assertUniqueManifestIds(rows, label) {
  const ids = rows.map((row) => row?.id);
  if (ids.some((id) => typeof id !== 'string' || !id)
      || new Set(ids).size !== ids.length) {
    throw new Error(`${label} has missing or duplicate asset ids`);
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
    const clone = document.createTexture(normalTexture.getName() || 'normal_slot_clone')
      .setImage(image)
      .setMimeType(normalTexture.getMimeType());
    material.setNormalTexture(clone);
  }
}

function lodsDeclaredBy(gltf) {
  const lods = new Set();
  for (const node of gltf.nodes || []) {
    const match = /^LOD([012])(?:_|$)/i.exec(String(node.name || ''));
    if (match) lods.add(`lod${match[1]}`);
  }
  if (lods.size === 0) lods.add('lod0');
  return [...lods].sort();
}

function readJsonAtRoot(path) {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
}

function currentSha256(path) {
  return existsSync(path) ? sha256(readFileSync(path)) : null;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function countBy(values, keyFor) {
  const counts = new Map();
  for (const value of values) {
    const key = keyFor(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function sumBytes(entries, field) {
  return entries.reduce((sum, entry) => sum + Number(entry[field] || 0), 0);
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

function normalizeRel(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
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

function errorMessage(error) {
  return error && error.stack ? error.stack : String(error);
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
}
