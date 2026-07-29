#!/usr/bin/env node
/**
 * Finalize isolated M4 Ashline V2 source-adapted wholeships into release_candidates/ with
 * real EXT_meshopt_compression (MeshoptEncoder) + KTX2/BasisU textures,
 * matching the SG04 release pattern.
 *
 * Does NOT write into assets/ships/parts or assets/ships/release (default play).
 *
 * Usage:
 *   node tools/art/finalize_m4_ashline_v2_candidate.mjs
 *   node tools/art/finalize_m4_ashline_v2_candidate.mjs dart
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import JPEG from 'jpeg-js';
import { PNG } from 'pngjs';
import { makeAshlineSurfaceMaps } from './lib/ashlineSurfaceMaps.mjs';
import {
  buildAshlineEvidenceEpoch,
  validateAshlineEvidenceEpoch,
} from './lib/ashlineEvidenceEpoch.mjs';
import {
  assertRigTextureContractPreserved,
  assembleAshlineFinalizationTransaction,
  buildAshlineEpochInputGuards,
  buildCurrentFinalizedRows,
  canonicalizeEvidenceEpoch,
  fileSnapshot,
  inspectGlbBytes,
  inspectKtx2TextureGraph,
  inspectRigAuthoredTextureContract,
  inspectRigCompressedTextureContract,
  planAshlineEvidenceRefresh,
  reconcileAshlineBuildSummary,
  reconcileFinalizeReport,
  RIG_AUTHORED_TEXTURE_SIZE,
  selectEligibleArtifactsForEpoch,
  validateEvidenceEpochAgainstFinalized,
} from './lib/ashlineFinalizeWorkflow.mjs';
import { publishFileSetTransaction } from './lib/multiFileTransaction.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAMILY = resolve(ROOT, 'assets/ships/m4_ashline_v2');
const PACKET = 'M4-ASHLINE-SOURCE-FAMILY-V2-001';
const TEXTURE_SIZE = 1024;
const ISOLATION = Object.freeze({
  defaultPlayWired: false,
  partsManifestTouched: false,
  releasePartsTouched: false,
  k0HeliosUntouched: true,
});

const SHIPS = Object.freeze({
  dart: Object.freeze({
    id: 'ashline_v2_dart',
    assetId: 'SF_WHOLESHIP_ASHLINE_V2_DART',
    partId: 'wholeship_ashline_v2_dart',
    role: 'flyby_interceptor',
  }),
  lode: Object.freeze({
    id: 'ashline_v2_lode',
    assetId: 'SF_WHOLESHIP_ASHLINE_V2_LODE',
    partId: 'wholeship_ashline_v2_lode',
    role: 'heavy_brawler',
  }),
  rig: Object.freeze({
    id: 'ashline_v2_rig',
    assetId: 'SF_WHOLESHIP_ASHLINE_V2_RIG',
    partId: 'wholeship_ashline_v2_rig',
    role: 'tether_control_raider',
  }),
});

const EVIDENCE_TOOL_PATHS = Object.freeze([
  'tools/blender/build_m4_ashline_v2.py',
  'tools/art/lib/ashlineSurfaceMaps.mjs',
  'tools/art/lib/ashlineEvidenceEpoch.mjs',
  'tools/art/lib/ashlineFinalizeWorkflow.mjs',
  'tools/art/lib/multiFileTransaction.mjs',
  'tools/art/finalize_m4_ashline_v2_candidate.mjs',
  'tools/blender/render_m4_ashline_material_truth.py',
  'tools/blender/render_m4_ashline_lode_material_truth.py',
  'tools/blender/render_m4_ashline_rig_material_truth.py',
]);

const LEGACY_RENDER_NAMES = Object.freeze([
  'forward_34.png',
  'rear_34.png',
  'top_ortho.png',
  'side_ortho.png',
  'readability_close.png',
  'readability_under45px.png',
  'readability_120px.png',
  'silhouette_gray_45px.png',
  'silhouette_gray_120px.png',
  'gamesky_forward_34.png',
]);

const LEGACY_ARTIFACTS = Object.freeze([
  ...Object.keys(SHIPS).flatMap((key) => LEGACY_RENDER_NAMES.map(
    (name) => `assets/ships/m4_ashline_v2/evidence/${key}/renders/${name}`,
  )),
  'assets/ships/m4_ashline_v2/evidence/family/runtime_lineup.png',
  'assets/ships/m4_ashline_v2/evidence/family/distance_readability_contact.png',
  'assets/ships/m4_ashline_v2/evidence/family/surface_review_dart.png',
  'assets/ships/m4_ashline_v2/evidence/family/surface_review_lode.png',
  'assets/ships/m4_ashline_v2/evidence/family/surface_review_rig.png',
]);

function sourcePath(id) {
  return resolve(FAMILY, 'source/wholeships', `${id}.glb`);
}

function candidatePath(id) {
  return resolve(FAMILY, 'release_candidates/wholeships', `${id}.glb`);
}

function rel(abs) {
  return abs.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '');
}

function stampGeneratorOnce(current) {
  const marker = 'SpaceFace tools/art/finalize_m4_ashline_v2_candidate.mjs';
  const tokens = String(current || '')
    .split(';')
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.includes(marker)) tokens.push(marker);
  return tokens.join('; ');
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

async function prepareSourceContract(abs, spec, io, shipKey) {
  const originalBytes = readFileSync(abs);
  const rigTextureContract = shipKey === 'rig'
    ? inspectRigAuthoredTextureContract(originalBytes, `${spec.id} builder source`)
    : null;
  const document = await io.readBinary(originalBytes);
  const root = document.getRoot();
  normalizeContractNodeTags(root);
  if (shipKey !== 'rig') {
    applyContractTextures(document, root, spec, shipKey);
  }
  await document.transform(prune({
    propertyTypes: [PropertyType.TEXTURE],
    keepSolidTextures: true,
    keepExtras: true,
  }));
  const asset = root.getAsset();
  asset.generator = stampGeneratorOnce(asset.generator);
  const extras = { ...(asset.extras || {}) };
  const textureSize = shipKey === 'rig' ? RIG_AUTHORED_TEXTURE_SIZE : TEXTURE_SIZE;
  extras.textureSize = textureSize;
  extras.spacefaceAsset = {
    ...(extras.spacefaceAsset || {}),
    assetId: spec.assetId,
    partId: spec.partId,
    family: 'ashline_v2',
    role: spec.role,
    packet: PACKET,
    textureCompression: 'PNG-source',
    textureResolution: `${textureSize}x${textureSize}`,
    surfaceTreatment: 'ashline-v2-service-history-2026-07-27',
  };
  asset.extras = extras;
  const sourceBytes = Buffer.from(await io.writeBinary(document));
  if (rigTextureContract) {
    const finalizedRigTextureContract = inspectRigAuthoredTextureContract(
      sourceBytes,
      `${spec.id} finalized source`,
    );
    assertRigTextureContractPreserved(rigTextureContract, finalizedRigTextureContract);
  }
  return { sourceBytes, rigTextureContract };
}

function normalizeContractNodeTags(root) {
  for (const node of root.listNodes()) {
    const name = node.getName() || '';
    const extras = { ...(node.getExtras() || {}) };
    const sf = { ...(extras.spaceface || {}) };
    if (/HOOK_DRIVE_/i.test(name) || sf.drive) {
      if (String(sf.damageRole || '').toLowerCase() === 'drive') delete sf.damageRole;
      if (String(extras.damageRole || '').toLowerCase() === 'drive') delete extras.damageRole;
    }
    extras.spaceface = sf;
    node.setExtras(extras);
  }
}

function applyContractTextures(document, root, spec, shipKey) {
  let index = 0;
  for (const material of root.listMaterials()) {
    const name = material.getName() || `Material_${index}`;
    const maps = makeAshlineSurfaceMaps({
      shipKey,
      materialName: name,
      size: TEXTURE_SIZE,
    });
    const alpha = material.getBaseColorFactor()?.[3] ?? 1;
    const base = document.createTexture(`${spec.id}_${safeName(name)}_baseColor`)
      .setImage(maps.baseColor)
      .setMimeType('image/png');
    const normal = document.createTexture(`${spec.id}_${safeName(name)}_normal`)
      .setImage(maps.normal)
      .setMimeType('image/png');
    const orm = document.createTexture(`${spec.id}_${safeName(name)}_orm`)
      .setImage(maps.orm)
      .setMimeType('image/png');
    material
      .setBaseColorFactor([1, 1, 1, alpha])
      .setBaseColorTexture(base)
      .setNormalTexture(normal)
      .setNormalScale(1)
      .setOcclusionTexture(orm)
      .setOcclusionStrength(1)
      .setMetallicRoughnessTexture(orm)
      .setRoughnessFactor(1)
      .setMetallicFactor(1);
    index++;
  }
}

function safeName(value) {
  return String(value || 'material').replace(/[^a-z0-9_]+/gi, '_').replace(/^_+|_+$/g, '') || 'material';
}

function markContractNodes(document, sourceCollisionBounds = null) {
  for (const node of document.getRoot().listNodes()) {
    const name = node.getName() || '';
    const extras = { ...(node.getExtras() || {}) };
    const sf = { ...(extras.spaceface || {}) };
    if (name.startsWith('SOCKET_')) {
      sf.socket = true;
      sf.keep = true;
      extras.socket = true;
      extras.spaceface = sf;
      node.setExtras(extras);
    }
    if (name === 'COLLISION_HULL' || sf.collision || extras.collision) {
      sf.collision = true;
      sf.helper = true;
      sf.nonRender = true;
      sf.role = 'collision';
      if (sourceCollisionBounds && !sf.bounds) sf.bounds = sourceCollisionBounds;
      extras.collision = true;
      extras.nonRender = true;
      extras.spaceface = sf;
      if (sourceCollisionBounds && !extras.bounds) extras.bounds = sourceCollisionBounds;
      node.setExtras(extras);
    }
  }
}

function countTextures(document) {
  return document.getRoot().listTextures().length;
}

function stampReleaseMeta(document, spec, sourceTextureCount, proof, sourceSf = {}) {
  const root = document.getRoot();
  const asset = root.getAsset();
  asset.generator = stampGeneratorOnce(asset.generator);
  const extras = { ...(asset.extras || {}) };
  const sf = { ...(sourceSf || {}), ...(extras.spacefaceAsset || {}) };
  // Preserve float axis proof through quantization (accessor min/max become unusable)
  if (sourceSf.lod0AabbSize) sf.lod0AabbSize = sourceSf.lod0AabbSize;
  if (sourceSf.collisionBounds) sf.collisionBounds = sourceSf.collisionBounds;
  sf.assetId = sf.assetId || spec.assetId;
  sf.partId = sf.partId || spec.partId;
  sf.role = sf.role || spec.role;
  sf.family = 'ashline_v2';
  sf.packet = PACKET;
  sf.wiringStatus = 'production_candidate';
  sf.surfaceTreatment = 'ashline-v2-service-history-2026-07-27';
  sf.textureCompression = sourceTextureCount > 0 ? 'KTX2/BasisU' : (sf.textureCompression || 'none');
  sf.finalize = {
    meshopt: proof.meshoptApplied,
    ktx2: proof.ktx2Applied,
    meshoptBufferViews: proof.meshoptBufferViewCount,
    ktx2Images: proof.ktx2ImageCount,
    sourceTextureCount,
    releaseTextureCount: proof.textureCount,
    tool: 'finalize_m4_ashline_v2_candidate.mjs',
    pattern: 'SG04 MeshoptEncoder + ktx2-encoder',
  };
  extras.spacefaceAsset = sf;
  extras.assetId = spec.assetId;
  extras.partId = spec.partId;
  asset.extras = extras;

  for (const scene of root.listScenes()) {
    const se = scene.getExtras() || {};
    const base = se.spacefaceAsset || sourceSf || {};
    scene.setExtras({
      ...se,
      spacefaceAsset: {
        ...base,
        textureCompression: sf.textureCompression,
        packet: PACKET,
        lod0AabbSize: sf.lod0AabbSize || base.lod0AabbSize,
        collisionBounds: sf.collisionBounds || base.collisionBounds,
      },
    });
  }
}

function validateCandidateContract(candidateBytes, spec, sourceTextureCount, shipKey) {
  const releaseRaw = inspectGlbBytes(candidateBytes, `${spec.id} release candidate`);
  for (const need of [
    'SOCKET_Weapon_Front',
    'SOCKET_Mining_Front',
    'SOCKET_Engine_Main',
    'SOCKET_Trail_Main',
    'SOCKET_Utility_Dorsal',
    'SOCKET_Cargo_Ventral',
    'SOCKET_Camera_Focus',
    'SOCKET_RCS_Port',
    'SOCKET_RCS_Starboard',
  ]) {
    if (!releaseRaw.nodeNames.includes(need)) {
      throw new Error(`${spec.id}: missing contract node after finalize: ${need}`);
    }
  }
  const collisionNodes = releaseRaw.nodeNames.filter((name) => name.startsWith('COLLISION_HULL_'));
  if (collisionNodes.length < 3) {
    throw new Error(
      `${spec.id}: compound collision helpers dropped after finalize: ${collisionNodes.length}/3`,
    );
  }
  if (!releaseRaw.hasMeshoptExt || releaseRaw.meshoptBufferViewCount < 1) {
    throw new Error(
      `${spec.id}: EXT_meshopt_compression not present after finalize `
      + `(views=${releaseRaw.meshoptBufferViewCount}, `
      + `used=${JSON.stringify(releaseRaw.extensionsUsed)})`,
    );
  }
  if (sourceTextureCount > 0) {
    if (releaseRaw.textureCount < sourceTextureCount) {
      throw new Error(
        `${spec.id}: texture count dropped ${sourceTextureCount} → ${releaseRaw.textureCount}`,
      );
    }
    if (releaseRaw.ktx2ImageCount !== releaseRaw.imageCount || releaseRaw.imageCount < 1) {
      throw new Error(
        `${spec.id}: not all release images are KTX2 `
        + `(ktx2=${releaseRaw.ktx2ImageCount}/${releaseRaw.imageCount})`,
      );
    }
    if (shipKey === 'rig') {
      inspectRigCompressedTextureContract(candidateBytes, `${spec.id} release candidate`);
    } else {
      inspectKtx2TextureGraph(candidateBytes, `${spec.id} release candidate`, {
        expectedWidth: TEXTURE_SIZE,
      });
    }
  }
  return releaseRaw;
}

async function buildFinalizedPair(key, spec, io, {
  sourceFile = sourcePath(spec.id),
  candidateFile = candidatePath(spec.id),
} = {}) {
  const src = resolve(sourceFile);
  const dst = resolve(candidateFile);
  if (!existsSync(src)) {
    throw new Error(`missing source GLB: ${src}`);
  }
  const sourceSnapshot = fileSnapshot(src);
  const candidateSnapshot = existsSync(dst) ? fileSnapshot(dst) : null;
  const prepared = await prepareSourceContract(src, spec, io, key);
  const sourceBytes = prepared.sourceBytes;
  const sourceRaw = inspectGlbBytes(sourceBytes, `${spec.id} finalized source`);
  const sourceTextureCount = sourceRaw.textureCount;
  const sourceSf = sourceRaw.json?.asset?.extras?.spacefaceAsset || {};

  const document = await io.readBinary(sourceBytes);
  markContractNodes(document, sourceSf.collisionBounds || null);
  splitIncompatibleTextureSlots(document);

  const transforms = [];
  let ktx2Applied = false;
  if (sourceTextureCount > 0) {
    // Already-KTX2 sources skip re-encode (pngjs cannot read KTX2).
    const alreadyKtx2 = sourceRaw.ktx2ImageCount > 0
      && sourceRaw.ktx2ImageCount === sourceRaw.imageCount;
    if (!alreadyKtx2) {
      transforms.push(
        ktx2({
          slots: /^baseColorTexture$/,
          imageDecoder: decodeImage,
          isUASTC: true,
          uastcLDRQualityLevel: 2,
          generateMipmap: true,
          needSupercompression: true,
          isPerceptual: true,
          isSetKTX2SRGBTransferFunc: true,
        }),
        ktx2({
          slots: /^normalTexture$/,
          imageDecoder: decodeImage,
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
          imageDecoder: decodeImage,
          isUASTC: true,
          uastcLDRQualityLevel: 2,
          generateMipmap: true,
          needSupercompression: true,
          isPerceptual: false,
          isSetKTX2SRGBTransferFunc: false,
        }),
      );
      ktx2Applied = true;
    } else {
      ktx2Applied = true; // already native
    }
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

  // Re-mark after transforms (some paths may rewrite extras)
  markContractNodes(document, sourceSf.collisionBounds || null);

  // Pre-write texture count from document graph
  const docTextureCount = countTextures(document);

  const proofStub = {
    meshoptApplied: true,
    ktx2Applied,
    meshoptBufferViewCount: 0,
    ktx2ImageCount: 0,
    textureCount: docTextureCount,
  };
  stampReleaseMeta(document, spec, sourceTextureCount, proofStub, sourceSf);
  const provisionalCandidateBytes = Buffer.from(await io.writeBinary(document));
  const releaseRaw = validateCandidateContract(
    provisionalCandidateBytes,
    spec,
    sourceTextureCount,
    key,
  );

  // Re-stamp with proven raw metrics only (no unprovable claims)
  const document2 = await io.readBinary(provisionalCandidateBytes);
  stampReleaseMeta(document2, spec, sourceTextureCount, {
    meshoptApplied: true,
    ktx2Applied,
    meshoptBufferViewCount: releaseRaw.meshoptBufferViewCount,
    ktx2ImageCount: releaseRaw.ktx2ImageCount,
    textureCount: releaseRaw.textureCount,
  }, sourceSf);
  const candidateBytes = Buffer.from(await io.writeBinary(document2));
  const finalRaw = validateCandidateContract(candidateBytes, spec, sourceTextureCount, key);

  return {
    key,
    sourceBytes: sourceBytes.length,
    candidateBytes: candidateBytes.length,
    sourceTextureCount,
    releaseTextureCount: finalRaw.textureCount,
    releaseImageCount: finalRaw.imageCount,
    ktx2ImageCount: finalRaw.ktx2ImageCount,
    meshoptBufferViewCount: finalRaw.meshoptBufferViewCount,
    files: [
      {
        path: src,
        bytes: sourceBytes,
        expectedCurrentSha256: sourceSnapshot.sha256,
        validate: async (_stagedPath, bytes) => {
          inspectGlbBytes(bytes, `${spec.id} staged source`);
          if (prepared.rigTextureContract) {
            const stagedContract = inspectRigAuthoredTextureContract(
              bytes,
              `${spec.id} staged source`,
            );
            assertRigTextureContractPreserved(prepared.rigTextureContract, stagedContract);
          }
        },
      },
      {
        path: dst,
        bytes: candidateBytes,
        expectedCurrentSha256: candidateSnapshot?.sha256 ?? null,
        validate: async (_stagedPath, bytes) => {
          validateCandidateContract(bytes, spec, sourceTextureCount, key);
        },
      },
    ],
  };
}

async function createFinalizerIo() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });
}

export async function finalizeAshlinePairToMemory({
  key,
  spec,
  sourceFile,
  candidateFile,
}) {
  if (!key || !spec || !sourceFile || !candidateFile) {
    throw new TypeError(
      'finalizeAshlinePairToMemory requires key, spec, sourceFile, and candidateFile',
    );
  }
  const io = await createFinalizerIo();
  return buildFinalizedPair(key, spec, io, { sourceFile, candidateFile });
}

function readJsonSnapshot(path) {
  const snapshot = fileSnapshot(path);
  return {
    value: JSON.parse(snapshot.bytes.toString('utf8')),
    expectedCurrentSha256: snapshot.sha256,
  };
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function optionalInputSnapshot(path, kind) {
  const absolutePath = resolve(ROOT, path);
  return {
    epochPath: path,
    absolutePath,
    expectedCurrentSha256: existsSync(absolutePath)
      ? fileSnapshot(absolutePath).sha256
      : null,
    kind,
  };
}

function diagnosticForShip(diagnostics, key) {
  return diagnostics.find((diagnostic) => diagnostic.shipKey === key) || null;
}

function receiptUpdates(results, evidenceEpoch, diagnostics) {
  const updates = [];
  const byKey = new Map(results.map((row) => [row.key, row]));
  for (const [key, row] of byKey) {
    const base = resolve(FAMILY, 'evidence', key);
    const summaryPath = resolve(base, 'build_summary.json');
    const metricsPath = resolve(base, 'production_metrics.json');
    const invalidation = diagnosticForShip(diagnostics, key);
    if (existsSync(summaryPath)) {
      const summarySnapshot = readJsonSnapshot(summaryPath);
      const summary = reconcileAshlineBuildSummary({
        summary: summarySnapshot.value,
        row,
        evidenceEpoch,
        invalidation,
      });
      updates.push({
        path: summaryPath,
        value: summary,
        expectedCurrentSha256: summarySnapshot.expectedCurrentSha256,
      });
    }
    if (existsSync(metricsPath)) {
      const metricsSnapshot = readJsonSnapshot(metricsPath);
      const metrics = metricsSnapshot.value;
      metrics.sha256_source = row.sourceSha256;
      metrics.evidenceEpoch = {
        status: 'post-finalize-current',
        epochDigest: evidenceEpoch.epochDigest,
        renderEligibility: evidenceEpoch.currentAcceptance?.perShip?.[key] === true
          ? 'current-exact-source-eligible'
          : 'requires-complete-exact-source-rerender',
        ...(invalidation ? {
          exclusionReason: invalidation.reason,
          requiredAction: invalidation.action,
        } : {}),
      };
      if (metrics.report) {
        metrics.report.bytes = row.sourceBytes;
        metrics.report.sha256 = row.sourceSha256;
        metrics.report.evidenceScope = 'geometry-and-structure; visual evidence bound separately';
      }
      updates.push({
        path: metricsPath,
        value: metrics,
        expectedCurrentSha256: metricsSnapshot.expectedCurrentSha256,
      });
    }
  }

  const familyMetricsPath = resolve(FAMILY, 'evidence/family/family_metrics.json');
  if (existsSync(familyMetricsPath)) {
    const familyMetricsSnapshot = readJsonSnapshot(familyMetricsPath);
    const familyMetrics = familyMetricsSnapshot.value;
    for (const ship of familyMetrics.ships || []) {
      const row = byKey.get(ship.key);
      if (!row) continue;
      ship.sha256 = row.sourceSha256;
      ship.sourceBytes = row.sourceBytes;
      ship.evidenceEpoch = {
        status: 'post-finalize-current',
        epochDigest: evidenceEpoch.epochDigest,
        ...(diagnosticForShip(diagnostics, ship.key) ? {
          exclusionReason: diagnosticForShip(diagnostics, ship.key).reason,
          requiredAction: diagnosticForShip(diagnostics, ship.key).action,
        } : {}),
      };
    }
    familyMetrics.evidenceEpoch = {
      epochDigest: evidenceEpoch.epochDigest,
      historicalRendersEligible: false,
      requiresCurrentVersionedRenders:
        evidenceEpoch.currentAcceptance?.requiresCurrentRender === true,
    };
    updates.push({
      path: familyMetricsPath,
      value: familyMetrics,
      expectedCurrentSha256: familyMetricsSnapshot.expectedCurrentSha256,
    });
  }
  return updates;
}

function evidenceReceiptFiles({
  finalizeReport,
  finalizeReportExpectedCurrentSha256,
  results,
  evidenceEpoch,
  diagnostics,
  requireLivePairMatch = false,
}) {
  const updates = [
    {
      path: evidencePath,
      value: finalizeReport,
      expectedCurrentSha256: finalizeReportExpectedCurrentSha256,
    },
    ...receiptUpdates(results, evidenceEpoch, diagnostics),
  ];
  return updates.map(({ path, value, expectedCurrentSha256 }) => ({
    path,
    bytes: jsonBytes(value),
    expectedCurrentSha256,
    validate: async (_stagedPath, bytes) => {
      const parsed = JSON.parse(bytes.toString('utf8'));
      if (parsed.evidenceEpoch?.epochDigest !== evidenceEpoch.epochDigest) {
        throw new Error(`receipt ${path} is not bound to ${evidenceEpoch.epochDigest}`);
      }
      if (path === evidencePath) {
        const finalizedByKey = new Map(
          (parsed.finalized || []).map((row) => [row.key, row]),
        );
        for (const pair of evidenceEpoch.sourceCandidatePairs) {
          const row = finalizedByKey.get(pair.key);
          if (row?.sourceSha256 !== pair.sourceSha256
              || row?.candidateSha256 !== pair.candidateSha256
              || row?.sourceBytes !== pair.sourceBytes
              || row?.candidateBytes !== pair.candidateBytes) {
            throw new Error(`finalize report ${pair.key} row is not current`);
          }
        }
        if (requireLivePairMatch) {
          const liveRows = buildCurrentFinalizedRows({
            root: ROOT,
            family: FAMILY,
            ships: SHIPS,
          });
          const liveValidation = validateEvidenceEpochAgainstFinalized(
            evidenceEpoch,
            liveRows,
          );
          if (!liveValidation.pass) {
            throw new Error(
              `live Ashline pair changed during refresh: `
              + `${liveValidation.failures.join('; ')}`,
            );
          }
        }
      }
    },
  }));
}

async function publishEvidenceReceiptSet(options) {
  const { guards = [], ...receiptOptions } = options;
  await publishFileSetTransaction({
    files: evidenceReceiptFiles(receiptOptions),
    guards,
  });
}

function evidenceReceipts() {
  const receiptPaths = [
    {
      shipKey: 'dart',
      path: resolve(FAMILY, 'evidence/material_truth_v2/eligible_artifacts.json'),
    },
    {
      shipKey: 'lode',
      path: resolve(FAMILY, 'evidence/material_truth_v2/eligible_artifacts_lode.json'),
    },
    {
      shipKey: 'rig',
      path: resolve(FAMILY, 'evidence/material_truth_v2/eligible_artifacts_rig.json'),
    },
  ];
  const receipts = [];
  const snapshots = [];
  for (const { path, shipKey } of receiptPaths) {
    if (existsSync(path)) {
      const snapshot = readJsonSnapshot(path);
      receipts.push({
        path: rel(path),
        absolutePath: path,
        expectedCurrentSha256: snapshot.expectedCurrentSha256,
        shipKey,
        receipt: snapshot.value,
      });
      snapshots.push({
        absolutePath: path,
        expectedCurrentSha256: snapshot.expectedCurrentSha256,
      });
    } else {
      snapshots.push({
        absolutePath: path,
        expectedCurrentSha256: null,
      });
    }
  }
  return { receipts, snapshots };
}

async function evidenceEpochForPairFamily({
  pairFamily,
  finalized,
  selectedShipKeys = [],
  outputShipKeys = [],
}) {
  const currentSourceSha256ByKey = new Map(
    finalized.map((row) => [row.key, row.sourceSha256]),
  );
  const receiptInputs = evidenceReceipts();
  const legacyInputs = LEGACY_ARTIFACTS.map((path) => (
    optionalInputSnapshot(path, 'legacy-artifact')
  ));
  const selectedEvidence = selectEligibleArtifactsForEpoch({
    receipts: receiptInputs.receipts,
    selectedShipKeys,
    currentSourceSha256ByKey,
  });
  const pairEpoch = await buildAshlineEvidenceEpoch({
    root: ROOT,
    family: pairFamily,
    ships: Object.entries(SHIPS).map(([key, value]) => ({ key, id: value.id })),
    toolPaths: EVIDENCE_TOOL_PATHS,
    eligibleArtifacts: selectedEvidence.eligibleArtifacts,
    legacyArtifacts: legacyInputs
      .filter((input) => input.expectedCurrentSha256 !== null)
      .map((input) => input.epochPath),
  });
  const validation = await validateAshlineEvidenceEpoch(pairEpoch, { root: ROOT });
  if (!validation.pass) {
    throw new Error(`Ashline evidence epoch rejected: ${validation.failures.join('; ')}`);
  }
  const evidenceEpoch = canonicalizeEvidenceEpoch(pairEpoch, finalized);
  const prospectiveValidation = validateEvidenceEpochAgainstFinalized(
    evidenceEpoch,
    finalized,
  );
  if (!prospectiveValidation.pass) {
    throw new Error(
      `Ashline prospective epoch rejected: ${prospectiveValidation.failures.join('; ')}`,
    );
  }
  const guards = buildAshlineEpochInputGuards({
    root: ROOT,
    evidenceEpoch,
    receiptSnapshots: receiptInputs.snapshots,
    additionalInputSnapshots: legacyInputs,
    outputShipKeys,
  });
  return {
    evidenceEpoch,
    diagnostics: selectedEvidence.diagnostics,
    guards,
  };
}

async function currentEvidenceEpoch({
  selectedShipKeys = Object.keys(SHIPS),
  outputShipKeys = [],
} = {}) {
  const finalized = buildCurrentFinalizedRows({
    root: ROOT,
    family: FAMILY,
    ships: SHIPS,
  });
  return evidenceEpochForPairFamily({
    pairFamily: FAMILY,
    finalized,
    selectedShipKeys,
    outputShipKeys,
  });
}

async function prospectiveEvidenceEpoch({
  finalized,
  selectedShipKeys,
  byteOverrides,
}) {
  const scratchRoot = mkdtempSync(resolve(tmpdir(), 'spaceface-ashline-finalize-'));
  const scratchFamily = resolve(scratchRoot, 'm4_ashline_v2');
  try {
    for (const spec of Object.values(SHIPS)) {
      for (const role of ['source', 'candidate']) {
        const canonicalPath = role === 'source'
          ? sourcePath(spec.id)
          : candidatePath(spec.id);
        const scratchPath = resolve(
          scratchFamily,
          role === 'source' ? 'source/wholeships' : 'release_candidates/wholeships',
          `${spec.id}.glb`,
        );
        mkdirSync(dirname(scratchPath), { recursive: true });
        writeFileSync(
          scratchPath,
          byteOverrides.get(canonicalPath) || readFileSync(canonicalPath),
        );
      }
    }
    return await evidenceEpochForPairFamily({
      pairFamily: scratchFamily,
      finalized,
      selectedShipKeys,
      outputShipKeys: selectedShipKeys,
    });
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
}

const evidencePath = resolve(FAMILY, 'evidence/family/finalize_report.json');

async function main() {
const rawArgs = process.argv.slice(2).map((arg) => arg.toLowerCase());
const evidenceOnly = rawArgs.includes('--evidence-only');
if (evidenceOnly) {
  console.error(
    '[m4-finalize] --evidence-only is retired: the historical inputs are not bound '
    + 'to the current source epoch. Use the versioned exact-source evidence renderer.',
  );
  process.exit(2);
}
const refreshEvidenceEpoch = rawArgs.includes('--refresh-evidence-epoch');
const dryRunRefreshEvidenceEpoch = rawArgs.includes('--dry-run-refresh-evidence-epoch');
const unknownFlags = rawArgs.filter((arg) => (
  arg.startsWith('--')
  && arg !== '--refresh-evidence-epoch'
  && arg !== '--dry-run-refresh-evidence-epoch'
));
if (unknownFlags.length > 0) {
  console.error(`[m4-finalize] unknown option(s): ${unknownFlags.join(', ')}`);
  process.exit(2);
}
if (refreshEvidenceEpoch && dryRunRefreshEvidenceEpoch) {
  console.error('[m4-finalize] choose refresh or dry-run refresh, not both');
  process.exit(2);
}
const selected = rawArgs.filter((arg) => !arg.startsWith('--'));
if ((refreshEvidenceEpoch || dryRunRefreshEvidenceEpoch) && selected.length > 0) {
  console.error('[m4-finalize] evidence refresh is family-wide and accepts no ship selection');
  process.exit(2);
}
if (refreshEvidenceEpoch || dryRunRefreshEvidenceEpoch) {
  if (!existsSync(evidencePath)) {
    console.error('[m4-finalize] no finalize report exists to refresh');
    process.exit(2);
  }
  const existing = readJsonSnapshot(evidencePath);
  const currentEvidence = await currentEvidenceEpoch();
  const refreshPlan = planAshlineEvidenceRefresh({
    root: ROOT,
    family: FAMILY,
    ships: SHIPS,
    existing: existing.value,
    evidenceEpoch: currentEvidence.evidenceEpoch,
    packet: PACKET,
    isolation: ISOLATION,
    evidenceDiagnostics: currentEvidence.diagnostics,
  });
  const { finalized, report: out } = refreshPlan;
  if (dryRunRefreshEvidenceEpoch) {
    console.log(JSON.stringify({
      ...refreshPlan,
      wouldPublish: [
        rel(evidencePath),
        ...receiptUpdates(
          finalized,
          currentEvidence.evidenceEpoch,
          currentEvidence.diagnostics,
        ).map(({ path }) => rel(path)),
      ],
    }, null, 2));
    process.exit(0);
  }
  await publishEvidenceReceiptSet({
    finalizeReport: out,
    finalizeReportExpectedCurrentSha256: existing.expectedCurrentSha256,
    results: finalized,
    evidenceEpoch: currentEvidence.evidenceEpoch,
    diagnostics: currentEvidence.diagnostics,
    requireLivePairMatch: true,
    guards: currentEvidence.guards,
  });
  console.log(JSON.stringify({
    status: 'complete',
    mode: 'refresh-evidence-epoch',
    epochDigest: currentEvidence.evidenceEpoch.epochDigest,
  }, null, 2));
  process.exit(0);
}

const keys = selected.length ? selected : Object.keys(SHIPS);
for (const k of keys) {
  if (!SHIPS[k]) {
    console.error(`Unknown ship "${k}". Expected: ${Object.keys(SHIPS).join(', ')}`);
    process.exit(2);
  }
}

const io = await createFinalizerIo();

const builds = [];
for (const k of keys) {
  const r = await buildFinalizedPair(k, SHIPS[k], io);
  builds.push(r);
}

const binaryFiles = builds.flatMap((build) => build.files);
const byteOverrides = new Map(binaryFiles.map((file) => [resolve(file.path), file.bytes]));
const finalized = buildCurrentFinalizedRows({
  root: ROOT,
  family: FAMILY,
  ships: SHIPS,
  byteOverrides,
});
const currentEvidence = await prospectiveEvidenceEpoch({
  finalized,
  selectedShipKeys: keys,
  byteOverrides,
});
for (const diagnostic of currentEvidence.diagnostics) {
  console.warn(
    `[m4-finalize] ${diagnostic.shipKey} evidence excluded: ${diagnostic.reason}; `
    + `${diagnostic.action}`,
  );
}
const existing = existsSync(evidencePath)
  ? readJsonSnapshot(evidencePath)
  : { value: {}, expectedCurrentSha256: null };
const out = reconcileFinalizeReport({
  existing: existing.value,
  finalized,
  evidenceEpoch: currentEvidence.evidenceEpoch,
  packet: PACKET,
  isolation: ISOLATION,
  evidenceDiagnostics: currentEvidence.diagnostics,
});

const receiptFiles = evidenceReceiptFiles({
  finalizeReport: out,
  finalizeReportExpectedCurrentSha256: existing.expectedCurrentSha256,
  results: finalized,
  evidenceEpoch: currentEvidence.evidenceEpoch,
  diagnostics: currentEvidence.diagnostics,
});

await publishFileSetTransaction({
  files: assembleAshlineFinalizationTransaction(binaryFiles, receiptFiles),
  guards: currentEvidence.guards,
});

const publishedEpochValidation = await validateAshlineEvidenceEpoch(
  currentEvidence.evidenceEpoch,
  { root: ROOT },
);
if (!publishedEpochValidation.pass) {
  throw new Error(
    `published Ashline evidence epoch rejected: `
    + `${publishedEpochValidation.failures.join('; ')}`,
  );
}
for (const r of builds) {
  console.log(
    `[m4-finalize] ${r.key}: ${r.sourceBytes} → ${r.candidateBytes} bytes `
    + `(meshoptViews=${r.meshoptBufferViewCount}, ktx2=${r.ktx2ImageCount}/${r.releaseImageCount}, `
    + `tex ${r.sourceTextureCount}→${r.releaseTextureCount})`,
  );
}
console.log(JSON.stringify(out, null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]).toLowerCase() : null;
if (invokedPath === fileURLToPath(import.meta.url).toLowerCase()) {
  await main();
}
