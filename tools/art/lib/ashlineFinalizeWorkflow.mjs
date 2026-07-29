import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ASHLINE_ELIGIBLE_ARTIFACT_COUNTS,
  ASHLINE_SHIP_KEYS,
} from './ashlineEvidenceEpoch.mjs';

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

export const RIG_AUTHORED_MATERIALS = Object.freeze({
  Material_Hull: ['phosphate_coated_structural_steel'],
  Material_Mechanical: ['nitrided_cold_steel'],
  Material_Red_Paint: ['oxide_red_guard_coating', 'oxide_red_dielectric_coating'],
  Material_HeatMetal: ['nickel_hot_section_or_hardface'],
  Material_Refractory: ['dry_alumina_zirconia_ceramic', 'alumina_zirconia_refractory'],
  Material_Cyan: ['recessed_internal_indicator', 'protected_low_intensity_indicator'],
});

export const RIG_AUTHORED_TEXTURE_SIZE = 256;

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

export function sha256File(path) {
  return sha256Bytes(readFileSync(path));
}

export function parseGlbBytes(bytes, label = 'GLB') {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 20 || buffer.toString('utf8', 0, 4) !== 'glTF') {
    throw new Error(`not GLB: ${label}`);
  }
  let offset = 12;
  let json = null;
  let binary = Buffer.alloc(0);
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + length > buffer.length) {
      throw new Error(`truncated GLB chunk in ${label}`);
    }
    const chunk = buffer.subarray(offset, offset + length);
    if (type === JSON_CHUNK) {
      json = JSON.parse(chunk.toString('utf8').replace(/\0+$/u, '').trim());
    } else if (type === BIN_CHUNK) {
      binary = chunk;
    }
    offset += length;
  }
  if (!json) throw new Error(`no JSON chunk: ${label}`);
  return { buffer, json, binary };
}

export function inspectGlbBytes(bytes, label = 'GLB') {
  const { json } = parseGlbBytes(bytes, label);
  const images = json.images || [];
  const textures = json.textures || [];
  const bufferViews = json.bufferViews || [];
  const extensionsUsed = json.extensionsUsed || [];
  const ktx2ImageCount = images.filter((image) => {
    const mime = String(image.mimeType || '').toLowerCase();
    return mime.includes('ktx') || mime.includes('basis');
  }).length;
  const meshoptBufferViewCount = bufferViews.filter(
    (view) => view.extensions?.EXT_meshopt_compression,
  ).length;
  return {
    json,
    imageCount: images.length,
    textureCount: textures.length,
    ktx2ImageCount,
    meshoptBufferViewCount,
    extensionsUsed,
    hasMeshoptExt: extensionsUsed.includes('EXT_meshopt_compression'),
    hasBasisuExt: extensionsUsed.includes('KHR_texture_basisu'),
    nodeNames: (json.nodes || []).map((node) => node.name).filter(Boolean),
    materials: (json.materials || []).map((material) => material.name).filter(Boolean),
    assetId: json.asset?.extras?.spacefaceAsset?.assetId
      || json.asset?.extras?.assetId
      || null,
  };
}

export function inspectGlbFile(path) {
  const bytes = readFileSync(path);
  return {
    ...inspectGlbBytes(bytes, path),
    bytes: bytes.length,
    sha256: sha256Bytes(bytes),
  };
}

function relativePath(root, path) {
  return path.replace(/\\/g, '/').replace(`${root.replace(/\\/g, '/')}/`, '');
}

function finalizedRow({
  root,
  key,
  spec,
  source,
  candidate,
  sourceBytes,
  candidateBytes,
}) {
  const sourceFacts = {
    ...inspectGlbBytes(sourceBytes, source),
    bytes: sourceBytes.length,
    sha256: sha256Bytes(sourceBytes),
  };
  const candidateFacts = {
    ...inspectGlbBytes(candidateBytes, candidate),
    bytes: candidateBytes.length,
    sha256: sha256Bytes(candidateBytes),
  };
  if (candidateFacts.ktx2ImageCount > 0 || candidateFacts.hasBasisuExt) {
    inspectKtx2TextureGraph(candidateBytes, `${key} candidate`);
  }
  for (const [role, facts] of [['source', sourceFacts], ['candidate', candidateFacts]]) {
    if (facts.assetId && facts.assetId !== spec.assetId) {
      throw new Error(
        `${key} ${role} assetId mismatch: ${facts.assetId} != ${spec.assetId}`,
      );
    }
  }
  return {
    id: spec.id,
    key,
    assetId: sourceFacts.assetId || candidateFacts.assetId || spec.assetId,
    source: relativePath(root, source),
    candidate: relativePath(root, candidate),
    sourceBytes: sourceFacts.bytes,
    candidateBytes: candidateFacts.bytes,
    sourceSha256: sourceFacts.sha256,
    candidateSha256: candidateFacts.sha256,
    sourceTextureCount: sourceFacts.textureCount,
    releaseTextureCount: candidateFacts.textureCount,
    releaseImageCount: candidateFacts.imageCount,
    ktx2ImageCount: candidateFacts.ktx2ImageCount,
    meshoptBufferViewCount: candidateFacts.meshoptBufferViewCount,
    extensionsUsed: candidateFacts.extensionsUsed,
    materials: candidateFacts.materials,
    meshopt: candidateFacts.hasMeshoptExt ? 'EXT_meshopt_compression' : 'none',
    ktx2: candidateFacts.ktx2ImageCount > 0
      ? 'KHR_texture_basisu/KTX2'
      : 'none',
  };
}

export function buildCurrentFinalizedRows({
  root,
  family,
  ships,
  byteOverrides = new Map(),
}) {
  return Object.entries(ships).map(([key, spec]) => {
    const source = resolve(family, 'source/wholeships', `${spec.id}.glb`);
    const candidate = resolve(family, 'release_candidates/wholeships', `${spec.id}.glb`);
    return finalizedRow({
      root,
      key,
      spec,
      source,
      candidate,
      sourceBytes: Buffer.from(byteOverrides.get(source) || readFileSync(source)),
      candidateBytes: Buffer.from(byteOverrides.get(candidate) || readFileSync(candidate)),
    });
  });
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function evidenceEpochDigest(value) {
  const core = { ...value };
  delete core.epochDigest;
  return createHash('sha256').update(stableStringify(core)).digest('hex').toUpperCase();
}

export function canonicalizeEvidenceEpoch(epoch, finalized) {
  const rowByKey = new Map(finalized.map((row) => [row.key, row]));
  const canonical = structuredClone(epoch);
  canonical.sourceCandidatePairs = canonical.sourceCandidatePairs.map((pair) => {
    const row = rowByKey.get(pair.key);
    if (!row) throw new Error(`missing prospective finalized row for ${pair.key}`);
    for (const field of [
      'sourceSha256',
      'sourceBytes',
      'candidateSha256',
      'candidateBytes',
    ]) {
      if (pair[field] !== row[field]) {
        throw new Error(
          `prospective evidence ${pair.key}.${field}: ${pair[field]} != ${row[field]}`,
        );
      }
    }
    return {
      ...pair,
      source: row.source,
      candidate: row.candidate,
    };
  });
  canonical.epochDigest = evidenceEpochDigest(canonical);
  return canonical;
}

export function validateEvidenceEpochAgainstFinalized(epoch, finalized) {
  const failures = [];
  if (epoch.epochDigest !== evidenceEpochDigest(epoch)) failures.push('epochDigest');
  const pairs = Array.isArray(epoch.sourceCandidatePairs)
    ? epoch.sourceCandidatePairs
    : [];
  const validateKeys = (rows, label) => {
    const counts = new Map();
    for (const row of rows) {
      const key = row?.key;
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!ASHLINE_SHIP_KEYS.includes(key)) {
        failures.push(`${label}:unknown-key:${key || 'missing'}`);
      }
    }
    for (const key of ASHLINE_SHIP_KEYS) {
      const count = counts.get(key) || 0;
      if (count === 0) failures.push(`${label}:missing-key:${key}`);
      if (count > 1) failures.push(`${label}:duplicate-key:${key}:${count}`);
    }
  };
  validateKeys(pairs, 'pairs');
  validateKeys(finalized, 'finalized');
  const rowByKey = new Map(finalized.map((row) => [row.key, row]));
  for (const pair of pairs) {
    const row = rowByKey.get(pair.key);
    if (!row) {
      failures.push(`${pair.key}:missing-finalized-row`);
      continue;
    }
    for (const field of [
      'source',
      'sourceSha256',
      'sourceBytes',
      'candidate',
      'candidateSha256',
      'candidateBytes',
    ]) {
      if (pair[field] !== row[field]) failures.push(`${pair.key}.${field}`);
    }
  }
  if (pairs.length !== finalized.length) {
    failures.push('pair-count');
  }
  return { pass: failures.length === 0, failures };
}

export function assembleAshlineFinalizationTransaction(binaryFiles, receiptFiles) {
  const files = [...binaryFiles, ...receiptFiles];
  const destinations = files.map((file) => resolve(file.path).toLowerCase());
  if (files.length === 0 || new Set(destinations).size !== files.length) {
    throw new Error('Ashline finalization transaction requires distinct binary and receipt files');
  }
  return files;
}

export function buildAshlineEpochInputGuards({
  root,
  evidenceEpoch,
  receiptSnapshots = [],
  additionalInputSnapshots = [],
  outputShipKeys = [],
}) {
  const outputs = new Set(outputShipKeys);
  const guardsByPath = new Map();
  const addGuard = (path, expectedCurrentSha256, kind) => {
    const absolutePath = resolve(root, path);
    const key = absolutePath.toLowerCase();
    const existing = guardsByPath.get(key);
    if (existing) {
      if (existing.expectedCurrentSha256 !== expectedCurrentSha256) {
        throw new Error(
          `conflicting Ashline epoch guard hashes for ${absolutePath}: `
          + `${existing.expectedCurrentSha256} != ${expectedCurrentSha256}`,
        );
      }
      return;
    }
    guardsByPath.set(key, {
      path: absolutePath,
      expectedCurrentSha256,
      kind,
    });
  };

  for (const pair of evidenceEpoch.sourceCandidatePairs || []) {
    if (outputs.has(pair.key)) continue;
    addGuard(pair.source, pair.sourceSha256, `pair:${pair.key}:source`);
    addGuard(pair.candidate, pair.candidateSha256, `pair:${pair.key}:candidate`);
  }
  for (const tool of evidenceEpoch.tools || []) {
    addGuard(tool.path, tool.sha256, 'producer-tool');
  }
  for (const artifact of [
    ...(evidenceEpoch.eligibleArtifacts || []),
    ...(evidenceEpoch.legacyArtifacts || []),
  ]) {
    addGuard(
      artifact.path,
      artifact.sha256,
      artifact.eligible === true ? 'eligible-artifact' : 'legacy-artifact',
    );
  }
  for (const receipt of receiptSnapshots) {
    addGuard(
      receipt.absolutePath || receipt.path,
      receipt.expectedCurrentSha256,
      'artifact-receipt',
    );
  }
  for (const input of additionalInputSnapshots) {
    addGuard(
      input.absolutePath || input.path,
      input.expectedCurrentSha256,
      input.kind || 'epoch-input',
    );
  }
  return [...guardsByPath.values()].sort((left, right) => (
    left.path.localeCompare(right.path)
  ));
}

export function reconcileFinalizeReport({
  existing = {},
  finalized,
  evidenceEpoch,
  packet,
  isolation,
  evidenceDiagnostics = [],
}) {
  return {
    ...existing,
    schema: 'spaceface.m4AshlineSourceFamilyFinalize.v2',
    packet,
    family: 'ashline_v2',
    isolation,
    finalized,
    evidenceEpoch,
    evidenceDiagnostics: {
      excludedEligibleReceipts: evidenceDiagnostics,
      exactSourceRerenderRequired: evidenceDiagnostics
        .map((diagnostic) => diagnostic.shipKey)
        .sort(),
    },
  };
}

export function planAshlineEvidenceRefresh({
  root,
  family,
  ships,
  existing,
  evidenceEpoch,
  packet,
  isolation,
  evidenceDiagnostics = [],
}) {
  const finalized = buildCurrentFinalizedRows({
    root,
    family,
    ships,
  });
  const validation = validateEvidenceEpochAgainstFinalized(evidenceEpoch, finalized);
  if (!validation.pass) {
    throw new Error(
      `Ashline dry-run pair snapshot changed: ${validation.failures.join('; ')}`,
    );
  }
  return {
    status: 'complete',
    mode: 'dry-run-refresh-evidence-epoch',
    writes: [],
    finalized,
    report: reconcileFinalizeReport({
      existing,
      finalized,
      evidenceEpoch,
      packet,
      isolation,
      evidenceDiagnostics,
    }),
  };
}

export function reconcileAshlineBuildSummary({
  summary,
  row,
  evidenceEpoch,
  invalidation = null,
}) {
  const next = structuredClone(summary);
  const visualEvidenceCurrent =
    evidenceEpoch.currentAcceptance?.perShip?.[row.key] === true;
  next.sourceSha256 = row.sourceSha256;
  next.sourceBytes = row.sourceBytes;
  if (next.materialTruth && visualEvidenceCurrent) {
    next.materialTruth.sourceSha256 = row.sourceSha256;
    if (next.materialTruth.sourceHashBinding) {
      next.materialTruth.sourceHashBinding.sourceSha256 = row.sourceSha256;
    }
  }
  next.evidenceEpoch = {
    status: 'post-finalize-current',
    epochDigest: evidenceEpoch.epochDigest,
    visualEvidence: visualEvidenceCurrent
      ? 'current-exact-source-eligible'
      : 'requires-current-versioned-render',
    ...(invalidation ? {
      exclusionReason: invalidation.reason,
      requiredAction: invalidation.action,
    } : {}),
  };
  return next;
}

export function selectEligibleArtifactsForEpoch({
  receipts,
  selectedShipKeys = [],
  currentSourceSha256ByKey,
  expectedArtifactCounts = ASHLINE_ELIGIBLE_ARTIFACT_COUNTS,
}) {
  const selected = new Set(selectedShipKeys);
  const eligibleArtifacts = [];
  const diagnostics = [];
  for (const entry of receipts) {
    const { path, shipKey, receipt } = entry;
    if (receipt.schema !== 'spaceface.ashlineMaterialTruthArtifacts.v1'
        || !Array.isArray(receipt.artifacts)) {
      throw new Error(`invalid Ashline material-truth artifact receipt: ${path}`);
    }
    if (receipt.shipKey && receipt.shipKey !== shipKey) {
      throw new Error(`Ashline artifact receipt ship mismatch: ${path}`);
    }
    const expectedArtifactCount = expectedArtifactCounts[shipKey];
    if (!Number.isInteger(expectedArtifactCount)) {
      throw new Error(`missing Ashline eligible-artifact count contract for ${shipKey}`);
    }
    const currentSourceSha256 = currentSourceSha256ByKey.get(shipKey);
    const boundHashes = new Set([
      receipt.sourceSha256,
      ...receipt.artifacts.flatMap((artifact) => (
        Array.isArray(artifact.inputBindings)
          ? artifact.inputBindings
            .filter((binding) => binding.shipKey === shipKey)
            .map((binding) => binding.sourceSha256)
          : []
      )),
    ].filter(Boolean));
    const sourceMismatch = !currentSourceSha256
      || boundHashes.size !== 1
      || !boundHashes.has(currentSourceSha256);
    const artifactCountMismatch = receipt.artifacts.length !== expectedArtifactCount;
    const duplicateArtifactPaths =
      new Set(receipt.artifacts.map((artifact) => artifact.path)).size
      !== receipt.artifacts.length;
    if (sourceMismatch || artifactCountMismatch || duplicateArtifactPaths) {
      const selectedSourceChanged = selected.has(shipKey);
      diagnostics.push({
        shipKey,
        receiptPath: path,
        eligible: false,
        artifactCount: receipt.artifacts.length,
        receiptSourceSha256: receipt.sourceSha256 || null,
        boundSourceSha256: [...boundHashes].sort(),
        currentSourceSha256: currentSourceSha256 || null,
        ...(artifactCountMismatch ? {
          expectedArtifactCount,
          actualArtifactCount: receipt.artifacts.length,
        } : {}),
        reason: artifactCountMismatch
          ? 'eligible-artifact-count-mismatch-requires-complete-exact-source-rerender'
          : duplicateArtifactPaths
            ? 'eligible-artifact-path-duplicate-requires-complete-exact-source-rerender'
            : selectedSourceChanged
              ? 'selected-ship-source-changed-requires-complete-exact-source-rerender'
              : 'receipt-source-mismatch-requires-complete-exact-source-rerender',
        action: 'rerender-all-eligible-artifacts-from-finalized-source',
      });
      continue;
    }
    eligibleArtifacts.push(...receipt.artifacts);
  }
  return { eligibleArtifacts, diagnostics };
}

function embeddedImageBytes(gltf, binary, imageIndex, label, expectedMimeType) {
  const image = gltf.images?.[imageIndex];
  if (!image || !Number.isInteger(image.bufferView)) {
    throw new Error(`${label}: authored image must remain embedded`);
  }
  if (image.mimeType !== expectedMimeType) {
    throw new Error(
      `${label}: expected ${expectedMimeType}, got ${image.mimeType || 'missing'}`,
    );
  }
  const view = gltf.bufferViews?.[image.bufferView];
  if (!view) throw new Error(`${label}: missing image bufferView`);
  const start = view.byteOffset || 0;
  const end = start + view.byteLength;
  if (start < 0 || end > binary.length) {
    throw new Error(`${label}: embedded image bufferView is out of bounds`);
  }
  return {
    image,
    bytes: binary.subarray(start, end),
  };
}

function textureImageIndex(gltf, textureIndex, label) {
  const texture = gltf.textures?.[textureIndex];
  if (!texture) throw new Error(`${label}: missing texture ${textureIndex}`);
  if (texture.extensions?.KHR_texture_basisu) {
    throw new Error(`${label}: authored source texture must not use KHR_texture_basisu`);
  }
  const source = texture.source;
  if (!Number.isInteger(source)) throw new Error(`${label}: texture has no image source`);
  return source;
}

function pngDimensions(bytes, label) {
  if (bytes.length < 24
      || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || bytes.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`${label}: invalid PNG header`);
  }
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

const KTX2_IDENTIFIER = Buffer.from([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const KTX2_HEADER_BYTES = 80;
const KTX2_LEVEL_INDEX_BYTES = 24;

function uint64AsNumber(bytes, offset, label) {
  const value = bytes.readBigUInt64LE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label}: uint64 value exceeds safe range`);
  }
  return Number(value);
}

function checkedRange(offset, length, totalBytes, label, rangeName, {
  required = false,
  minimumOffset = 0,
} = {}) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)
      || offset < 0 || length < 0) {
    throw new Error(`${label}: invalid ${rangeName} range`);
  }
  if (required && length === 0) {
    throw new Error(`${label}: ${rangeName} range is empty`);
  }
  if (length === 0) {
    if (offset !== 0) {
      throw new Error(`${label}: empty ${rangeName} range has nonzero offset ${offset}`);
    }
    return null;
  }
  const end = offset + length;
  if (!Number.isSafeInteger(end)
      || offset < minimumOffset
      || end > totalBytes) {
    throw new Error(`${label}: ${rangeName} range is out of bounds`);
  }
  return { name: rangeName, start: offset, end };
}

export function inspectKtx2Payload(bytes, label = 'KTX2 payload') {
  const payload = Buffer.from(bytes);
  if (payload.length < KTX2_HEADER_BYTES) {
    throw new Error(
      `${label}: truncated KTX2 header ${payload.length}/${KTX2_HEADER_BYTES}`,
    );
  }
  if (!payload.subarray(0, KTX2_IDENTIFIER.length).equals(KTX2_IDENTIFIER)) {
    throw new Error(`${label}: invalid KTX2 identifier`);
  }
  const vkFormat = payload.readUInt32LE(12);
  const typeSize = payload.readUInt32LE(16);
  const width = payload.readUInt32LE(20);
  const height = payload.readUInt32LE(24);
  const depth = payload.readUInt32LE(28);
  const layerCount = payload.readUInt32LE(32);
  const faceCount = payload.readUInt32LE(36);
  const levelCount = payload.readUInt32LE(40);
  const supercompressionScheme = payload.readUInt32LE(44);
  if (vkFormat !== 0 || typeSize !== 1) {
    throw new Error(
      `${label}: expected Basis KTX2 vkFormat/typeSize 0/1, got `
      + `${vkFormat}/${typeSize}`,
    );
  }
  if (supercompressionScheme > 3) {
    throw new Error(
      `${label}: unsupported KTX2 supercompression scheme ${supercompressionScheme}`,
    );
  }
  if (width < 1 || height < 1) {
    throw new Error(`${label}: invalid KTX2 dimensions ${width}x${height}`);
  }
  if (depth !== 0 || layerCount !== 0 || faceCount !== 1) {
    throw new Error(
      `${label}: expected a 2D non-array KTX2 texture, got `
      + `depth=${depth}, layers=${layerCount}, faces=${faceCount}`,
    );
  }
  if (levelCount < 1) throw new Error(`${label}: KTX2 has no mip levels`);
  const levelIndexEnd = KTX2_HEADER_BYTES + levelCount * KTX2_LEVEL_INDEX_BYTES;
  if (!Number.isSafeInteger(levelIndexEnd) || levelIndexEnd > payload.length) {
    throw new Error(`${label}: truncated KTX2 level index`);
  }

  const occupied = [{ name: 'header-and-level-index', start: 0, end: levelIndexEnd }];
  const dfdRange = checkedRange(
    payload.readUInt32LE(48),
    payload.readUInt32LE(52),
    payload.length,
    label,
    'DFD',
    { required: true, minimumOffset: levelIndexEnd },
  );
  if (dfdRange) occupied.push(dfdRange);
  const kvdRange = checkedRange(
    payload.readUInt32LE(56),
    payload.readUInt32LE(60),
    payload.length,
    label,
    'KVD',
    { minimumOffset: levelIndexEnd },
  );
  if (kvdRange) occupied.push(kvdRange);
  const sgdRange = checkedRange(
    uint64AsNumber(payload, 64, `${label}: SGD offset`),
    uint64AsNumber(payload, 72, `${label}: SGD length`),
    payload.length,
    label,
    'SGD',
    { minimumOffset: levelIndexEnd },
  );
  if (sgdRange) occupied.push(sgdRange);

  const levels = [];
  for (let index = 0; index < levelCount; index++) {
    const entryOffset = KTX2_HEADER_BYTES + index * KTX2_LEVEL_INDEX_BYTES;
    const byteOffset = uint64AsNumber(
      payload,
      entryOffset,
      `${label}: level ${index} offset`,
    );
    const byteLength = uint64AsNumber(
      payload,
      entryOffset + 8,
      `${label}: level ${index} length`,
    );
    const uncompressedByteLength = uint64AsNumber(
      payload,
      entryOffset + 16,
      `${label}: level ${index} uncompressed length`,
    );
    if (uncompressedByteLength < 1) {
      throw new Error(`${label}: level ${index} has no uncompressed data`);
    }
    if (supercompressionScheme === 0 && uncompressedByteLength !== byteLength) {
      throw new Error(
        `${label}: uncompressed level ${index} length `
        + `${uncompressedByteLength} != ${byteLength}`,
      );
    }
    const range = checkedRange(
      byteOffset,
      byteLength,
      payload.length,
      label,
      `level ${index}`,
      { required: true, minimumOffset: levelIndexEnd },
    );
    occupied.push(range);
    levels.push({
      index,
      byteOffset,
      byteLength,
      uncompressedByteLength,
    });
  }

  occupied.sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < occupied.length; index++) {
    if (occupied[index].start < occupied[index - 1].end) {
      throw new Error(
        `${label}: ${occupied[index].name} overlaps ${occupied[index - 1].name}`,
      );
    }
  }
  return {
    width,
    height,
    vkFormat,
    typeSize,
    supercompressionScheme,
    levelCount,
    levels,
    sha256: sha256Bytes(payload),
  };
}

export function inspectKtx2TextureGraph(bytes, label = 'KTX2 GLB', {
  expectedWidth = null,
  expectedHeight = expectedWidth,
} = {}) {
  const { json, binary } = parseGlbBytes(bytes, label);
  if (!(json.extensionsUsed || []).includes('KHR_texture_basisu')) {
    throw new Error(`${label}: KHR_texture_basisu is not declared`);
  }
  if (!(json.extensionsRequired || []).includes('KHR_texture_basisu')) {
    throw new Error(`${label}: extension-only KTX2 graph must require KHR_texture_basisu`);
  }
  const images = json.images || [];
  const textures = json.textures || [];
  if (images.length < 1 || textures.length < 1) {
    throw new Error(`${label}: KTX2 candidate has no texture graph`);
  }
  const referenceCounts = new Array(images.length).fill(0);
  for (let textureIndex = 0; textureIndex < textures.length; textureIndex++) {
    const texture = textures[textureIndex];
    const imageIndex = texture?.extensions?.KHR_texture_basisu?.source;
    if (!Number.isInteger(imageIndex)
        || imageIndex < 0
        || imageIndex >= images.length) {
      throw new Error(
        `${label}: texture ${textureIndex} is not bound through KHR_texture_basisu`,
      );
    }
    if (Object.prototype.hasOwnProperty.call(texture, 'source')) {
      throw new Error(
        `${label}: texture ${textureIndex} retains a direct-source fallback binding`,
      );
    }
    referenceCounts[imageIndex]++;
  }
  const inspectedImages = images.map((image, imageIndex) => {
    if (referenceCounts[imageIndex] < 1) {
      throw new Error(`${label}: KTX2 image ${imageIndex} is unreferenced`);
    }
    const embedded = embeddedImageBytes(
      json,
      binary,
      imageIndex,
      `${label}: image ${imageIndex}`,
      'image/ktx2',
    );
    const payload = inspectKtx2Payload(
      embedded.bytes,
      `${label}: image ${imageIndex}`,
    );
    if (expectedWidth !== null
        && (payload.width !== expectedWidth || payload.height !== expectedHeight)) {
      throw new Error(
        `${label}: image ${imageIndex} dimensions ${payload.width}x${payload.height}`
        + ` != ${expectedWidth}x${expectedHeight}`,
      );
    }
    return {
      index: imageIndex,
      name: image.name || null,
      referenceCount: referenceCounts[imageIndex],
      ...payload,
    };
  });
  return {
    json,
    binary,
    textureCount: textures.length,
    imageCount: images.length,
    images: inspectedImages,
  };
}

function exactRigMaterialMap(json, label) {
  const expectedNames = Object.keys(RIG_AUTHORED_MATERIALS).sort();
  const materials = json.materials || [];
  if (materials.length !== expectedNames.length) {
    throw new Error(
      `${label}: material count ${materials.length} != ${expectedNames.length}`,
    );
  }
  const materialByName = new Map();
  for (const material of materials) {
    if (!expectedNames.includes(material.name)) {
      throw new Error(`${label}: unexpected material ${material.name || 'unnamed'}`);
    }
    if (materialByName.has(material.name)) {
      throw new Error(`${label}: duplicate material ${material.name}`);
    }
    materialByName.set(material.name, material);
  }
  for (const expectedName of expectedNames) {
    if (!materialByName.has(expectedName)) {
      throw new Error(`${label}: missing authored material ${expectedName}`);
    }
  }
  return materialByName;
}

function assertExactRigTextureImageCounts(json, label) {
  const expectedCount = Object.keys(RIG_AUTHORED_MATERIALS).length * 3;
  const textureCount = (json.textures || []).length;
  const imageCount = (json.images || []).length;
  if (textureCount !== expectedCount || imageCount !== expectedCount) {
    throw new Error(
      `${label}: expected exactly ${expectedCount} textures/images, got `
      + `${textureCount}/${imageCount}`,
    );
  }
}

function rigMaterialSlots(material, materialName, label) {
  const pbr = material.pbrMetallicRoughness || {};
  const slots = {
    baseColor: pbr.baseColorTexture?.index,
    normal: material.normalTexture?.index,
    orm: pbr.metallicRoughnessTexture?.index,
  };
  for (const [role, textureIndex] of Object.entries(slots)) {
    if (!Number.isInteger(textureIndex)) {
      throw new Error(`${label}: ${materialName} missing ${role} texture`);
    }
  }
  if (!Number.isInteger(material.occlusionTexture?.index)
      || material.occlusionTexture.index !== slots.orm) {
    throw new Error(
      `${label}: ${materialName} occlusion texture must be the authored ORM texture`,
    );
  }
  return slots;
}

export function inspectRigAuthoredTextureContract(bytes, label = 'Rig source GLB') {
  const { json, binary } = parseGlbBytes(bytes, label);
  if ((json.extensionsUsed || []).includes('KHR_texture_basisu')) {
    throw new Error(`${label}: authored source must contain PNG textures, not KTX2`);
  }
  const materialByName = exactRigMaterialMap(json, label);
  assertExactRigTextureImageCounts(json, label);
  const images = [];
  const usedTextureIndices = new Set();
  const usedImageIndices = new Set();
  for (const [materialName, allowedSurfaceClasses] of Object.entries(RIG_AUTHORED_MATERIALS)) {
    const material = materialByName.get(materialName);
    const surfaceClass = material.extras?.spacefaceMaterial?.surfaceClass;
    if (!allowedSurfaceClasses.includes(surfaceClass)) {
      throw new Error(
        `${label}: ${materialName} surfaceClass `
        + `${surfaceClass || 'missing'} is not one of ${allowedSurfaceClasses.join(', ')}`,
      );
    }
    const slots = rigMaterialSlots(material, materialName, label);
    for (const [role, textureIndex] of Object.entries(slots)) {
      if (usedTextureIndices.has(textureIndex)) {
        throw new Error(`${label}: texture ${textureIndex} is reused across material roles`);
      }
      usedTextureIndices.add(textureIndex);
      const imageIndex = textureImageIndex(json, textureIndex, `${label}: ${materialName}.${role}`);
      if (usedImageIndices.has(imageIndex)) {
        throw new Error(`${label}: authored image ${imageIndex} is reused across material roles`);
      }
      usedImageIndices.add(imageIndex);
      const embedded = embeddedImageBytes(
        json,
        binary,
        imageIndex,
        `${label}: ${materialName}.${role}`,
        'image/png',
      );
      const expectedImageName = `${materialName}_${role}`;
      if (embedded.image.name !== expectedImageName) {
        throw new Error(
          `${label}: ${materialName}.${role} image `
          + `${embedded.image.name || 'missing'} != ${expectedImageName}`,
        );
      }
      const dimensions = pngDimensions(
        embedded.bytes,
        `${label}: ${materialName}.${role}`,
      );
      if (dimensions.width !== RIG_AUTHORED_TEXTURE_SIZE
          || dimensions.height !== RIG_AUTHORED_TEXTURE_SIZE) {
        throw new Error(
          `${label}: ${materialName}.${role} dimensions `
          + `${dimensions.width}x${dimensions.height} != `
          + `${RIG_AUTHORED_TEXTURE_SIZE}x${RIG_AUTHORED_TEXTURE_SIZE}`,
        );
      }
      images.push({
        material: materialName,
        surfaceClass,
        role,
        imageName: embedded.image.name || null,
        width: dimensions.width,
        height: dimensions.height,
        sha256: sha256Bytes(embedded.bytes),
      });
    }
  }
  images.sort((left, right) => (
    `${left.material}:${left.role}`.localeCompare(`${right.material}:${right.role}`)
  ));
  return {
    materialCount: Object.keys(RIG_AUTHORED_MATERIALS).length,
    imageCount: images.length,
    textureSize: RIG_AUTHORED_TEXTURE_SIZE,
    images,
  };
}

export function inspectRigCompressedTextureContract(bytes, label = 'Rig candidate GLB') {
  const textureGraph = inspectKtx2TextureGraph(bytes, label, {
    expectedWidth: RIG_AUTHORED_TEXTURE_SIZE,
  });
  const { json } = textureGraph;
  const compressedImageByIndex = new Map(
    textureGraph.images.map((image) => [image.index, image]),
  );
  const materialByName = exactRigMaterialMap(json, label);
  assertExactRigTextureImageCounts(json, label);
  const images = [];
  const usedTextureIndices = new Set();
  const usedImageIndices = new Set();
  for (const [materialName, allowedSurfaceClasses] of Object.entries(RIG_AUTHORED_MATERIALS)) {
    const material = materialByName.get(materialName);
    const surfaceClass = material.extras?.spacefaceMaterial?.surfaceClass;
    if (!allowedSurfaceClasses.includes(surfaceClass)) {
      throw new Error(
        `${label}: ${materialName} surfaceClass `
        + `${surfaceClass || 'missing'} is not one of ${allowedSurfaceClasses.join(', ')}`,
      );
    }
    const slots = rigMaterialSlots(material, materialName, label);
    for (const [role, textureIndex] of Object.entries(slots)) {
      if (usedTextureIndices.has(textureIndex)) {
        throw new Error(`${label}: texture ${textureIndex} is reused across material roles`);
      }
      usedTextureIndices.add(textureIndex);
      const texture = json.textures?.[textureIndex];
      const imageIndex = texture?.extensions?.KHR_texture_basisu?.source;
      if (!Number.isInteger(imageIndex)) {
        throw new Error(
          `${label}: ${materialName}.${role} is not bound through KHR_texture_basisu`,
        );
      }
      if (usedImageIndices.has(imageIndex)) {
        throw new Error(`${label}: compressed image ${imageIndex} is reused across material roles`);
      }
      usedImageIndices.add(imageIndex);
      const compressedImage = compressedImageByIndex.get(imageIndex);
      if (!compressedImage) {
        throw new Error(`${label}: missing validated compressed image ${imageIndex}`);
      }
      const expectedImageName = `${materialName}_${role}`;
      if (compressedImage.name !== expectedImageName) {
        throw new Error(
          `${label}: ${materialName}.${role} image `
          + `${compressedImage.name || 'missing'} != ${expectedImageName}`,
        );
      }
      images.push({
        material: materialName,
        surfaceClass,
        role,
        imageName: compressedImage.name,
        width: compressedImage.width,
        height: compressedImage.height,
        sha256: compressedImage.sha256,
      });
    }
  }
  if (new Set(images.map((image) => image.sha256)).size !== images.length) {
    throw new Error(`${label}: compressed material-role image payloads are not distinct`);
  }
  images.sort((left, right) => (
    `${left.material}:${left.role}`.localeCompare(`${right.material}:${right.role}`)
  ));
  return {
    materialCount: Object.keys(RIG_AUTHORED_MATERIALS).length,
    imageCount: images.length,
    textureSize: RIG_AUTHORED_TEXTURE_SIZE,
    images,
  };
}

export function assertRigTextureContractPreserved(before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error('Rig builder-authored base/ORM/normal images changed during source finalization');
  }
}

export function fileSnapshot(path) {
  const bytes = readFileSync(path);
  return {
    bytes,
    sha256: sha256Bytes(bytes),
    size: statSync(path).size,
  };
}
