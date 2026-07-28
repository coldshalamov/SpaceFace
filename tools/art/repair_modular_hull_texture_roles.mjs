#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { deriveOrmMap } from './lib/derivedOrmMap.mjs';
import { publishFileSetTransaction } from './lib/multiFileTransaction.mjs';
import { validateSourceTextureRoleCoverage } from './lib/sourceTextureRoleValidation.mjs';
import {
  accessorContentSignature,
  repairNormalMappedTangents,
} from './lib/tangentAccessorRepair.mjs';
import {
  assertTextureInfoPreserved,
  replaceTextureInfoIndex,
} from './lib/textureInfoContract.mjs';
import { auditEmbeddedTextureChannels } from './lib/textureChannelAudit.mjs';
import { parseStrictEmbeddedGlb } from './lib/strictGlbValidation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PARTS_MANIFEST_PATH = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const VALIDATE_KHRONOS = APPLY || process.argv.includes('--validate-khronos');
const inputArg = process.argv.find((arg) => arg.startsWith('--input='));
const inputDirArg = process.argv.find((arg) => arg.startsWith('--input-dir='));
const INPUT_PATH = inputArg ? resolve(ROOT, inputArg.slice('--input='.length)) : null;
const INPUT_DIR = inputDirArg ? resolve(ROOT, inputDirArg.slice('--input-dir='.length)) : null;
if (INPUT_PATH && INPUT_DIR) throw new Error('--input and --input-dir are mutually exclusive');
const CORRECTION_ID = 'modular-hulls-2026-07-27-v2';
const FINALIZER_ALGORITHM = 'neutral-normal-authored-ao-uv0-material-class-v2';
const FINALIZER_GENERATOR = 'SpaceFace tools/art/repair_modular_hull_texture_roles.mjs v2';
const HULL_IDS = [
  'hull_starter',
  'hull_fighter',
  'hull_miner',
  'hull_freighter',
  'hull_interceptor',
  'hull_corvette',
  'hull_frigate',
  'hull_capital',
  'hull_multirole',
  'hull_gunship',
];
const requestedIds = process.argv
  .filter((arg) => arg.startsWith('--id='))
  .map((arg) => arg.slice('--id='.length));
const selectedIds = requestedIds.length ? requestedIds : HULL_IDS;
const unknownIds = selectedIds.filter((id) => !HULL_IDS.includes(id));
if (unknownIds.length) throw new Error(`unknown modular hull id(s): ${unknownIds.join(', ')}`);
if (INPUT_PATH && selectedIds.length !== 1) {
  throw new Error('--input requires exactly one --id');
}

const ROUGHNESS_BY_MATERIAL = {
  Material_Hull: 0.7,
  Material_Mechanical: 0.56,
  Material_Accent: 0.48,
};
const BASE_COLOR_FACTOR_BY_MATERIAL = {
  Material_Hull: [0.42, 0.4, 0.38, 1],
  Material_Mechanical: [0.35, 0.38, 0.41, 1],
  Material_Accent: [0.55, 0.28, 0.18, 1],
};
const PARTS_MANIFEST_SHA256_BEFORE = sha256(readFileSync(PARTS_MANIFEST_PATH));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function geometrySignature(gltf) {
  return sha256(Buffer.from(JSON.stringify({
    scenes: gltf.scenes,
    scene: gltf.scene,
    nodes: gltf.nodes,
    meshes: gltf.meshes,
    accessors: gltf.accessors,
    skins: gltf.skins,
    animations: gltf.animations,
  })));
}

function materialPreservationSignature(gltf) {
  return sha256(Buffer.from(JSON.stringify((gltf.materials || []).map((material) => {
    const pbr = structuredClone(material.pbrMetallicRoughness || {});
    delete pbr.baseColorFactor;
    delete pbr.baseColorTexture;
    delete pbr.metallicRoughnessTexture;
    delete pbr.roughnessFactor;
    delete pbr.metallicFactor;
    return {
      name: material.name,
      alphaMode: material.alphaMode,
      alphaCutoff: material.alphaCutoff,
      doubleSided: material.doubleSided,
      emissiveFactor: material.emissiveFactor,
      emissiveTexture: material.emissiveTexture,
      extensions: material.extensions,
      extras: material.extras,
      pbr,
    };
  }))));
}

function materialSemanticSignature(gltf) {
  return sha256(Buffer.from(JSON.stringify(gltf.materials || [])));
}

function materialSamplingSummary(gltf) {
  const sampling = (info) => {
    if (!info) return null;
    const result = structuredClone(info);
    delete result.index;
    return result;
  };
  return (gltf.materials || []).map((material, index) => ({
    material: material.name || `material_${index}`,
    baseColor: sampling(material.pbrMetallicRoughness?.baseColorTexture),
    normal: sampling(material.normalTexture),
    metallicRoughness: sampling(material.pbrMetallicRoughness?.metallicRoughnessTexture),
    occlusion: sampling(material.occlusionTexture),
  }));
}

function assertRawAoSampling(info, label) {
  if ((info?.texCoord ?? 0) !== 0 || info?.extensions?.KHR_texture_transform) {
    throw new Error(`${label} authored AO bake must use untransformed TEXCOORD_0 sampling`);
  }
}

function appendImage(gltf, binary, payload, name, mimeType = 'image/png', extras = undefined) {
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
    mimeType,
    ...(extras ? { extras: structuredClone(extras) } : {}),
  });
  gltf.buffers[0].byteLength = packed.length;
  return { binary: packed, imageIndex };
}

function addTexture(gltf, imageIndex, name, sampler = 0) {
  const textureIndex = gltf.textures.length;
  gltf.textures.push({ name, sampler, source: imageIndex });
  return textureIndex;
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

function collectReferencedBufferViews(value, into = new Set()) {
  if (!value || typeof value !== 'object') return into;
  if (Array.isArray(value)) {
    for (const entry of value) collectReferencedBufferViews(entry, into);
    return into;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'bufferView' && Number.isInteger(child)) into.add(child);
    else collectReferencedBufferViews(child, into);
  }
  return into;
}

function compactDiscardedImagePayloads(gltf, binary, discardedViews) {
  const documentWithoutBufferViews = structuredClone(gltf);
  delete documentWithoutBufferViews.bufferViews;
  const liveReferences = collectReferencedBufferViews(documentWithoutBufferViews);
  const stillReferenced = [...discardedViews].filter((view) => liveReferences.has(view));
  if (stillReferenced.length) {
    throw new Error(`discarded image bufferViews remain referenced: ${stillReferenced.join(', ')}`);
  }

  const chunks = [];
  let byteOffset = 0;
  for (const [index, view] of gltf.bufferViews.entries()) {
    if (discardedViews.has(index)) {
      gltf.bufferViews[index] = {
        buffer: 0,
        byteOffset: 0,
        byteLength: 4,
      };
      continue;
    }
    const sourceOffset = view.byteOffset ?? 0;
    const sourceEnd = sourceOffset + view.byteLength;
    if (sourceOffset < 0 || sourceEnd > binary.length) {
      throw new Error(`bufferView ${index} exceeds embedded BIN data`);
    }
    const padding = (4 - (byteOffset % 4)) % 4;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      byteOffset += padding;
    }
    const payload = Buffer.from(binary.subarray(sourceOffset, sourceEnd));
    chunks.push(payload);
    gltf.bufferViews[index] = {
      ...view,
      byteOffset,
    };
    byteOffset += payload.length;
  }
  const compacted = Buffer.concat(chunks);
  gltf.buffers[0].byteLength = compacted.length;
  return compacted;
}

function assertNoUnsupportedTextureBindings(gltf, label) {
  const unsupported = [];
  for (const [index, material] of (gltf.materials || []).entries()) {
    if (material.emissiveTexture) unsupported.push(`${material.name || index}.emissiveTexture`);
    for (const [extensionName, extension] of Object.entries(material.extensions || {})) {
      const textureLike = JSON.stringify(extension).match(/Texture/g);
      if (textureLike) unsupported.push(`${material.name || index}.${extensionName}`);
    }
  }
  if (unsupported.length) {
    throw new Error(`${label} has texture roles this focused finalizer does not own: ${unsupported.join(', ')}`);
  }
}

function authoredImage(path) {
  if (!existsSync(path)) throw new Error(`missing authored texture input: ${path}`);
  return readFileSync(path);
}

async function authoredPng(path) {
  return sharp(authoredImage(path))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

function sourcePaths(id) {
  const textureDir = resolve(ROOT, 'assets/ships/parts/textures', id);
  return {
    source: resolve(ROOT, 'assets/ships/parts/hulls', `${id}.glb`),
    inputSource: INPUT_PATH || (INPUT_DIR
      ? resolve(INPUT_DIR, `${id}.glb`)
      : resolve(ROOT, 'assets/ships/parts/hulls', `${id}.glb`)),
    trim: resolve(textureDir, `${id}_trim_sheet_1k.jpg`),
    aoFor: (materialName) => resolve(textureDir, `${materialName}_ao_1k.png`),
  };
}

function authoredInputRecord(paths, materialNames) {
  const textures = {
    trim: sha256(authoredImage(paths.trim)),
  };
  for (const materialName of materialNames) {
    const path = paths.aoFor(materialName);
    textures[`ao:${materialName}`] = existsSync(path) ? sha256(authoredImage(path)) : null;
  }
  const fingerprint = sha256(Buffer.from(JSON.stringify({
    algorithm: FINALIZER_ALGORITHM,
    textures,
  })));
  return {
    algorithm: FINALIZER_ALGORITHM,
    fingerprint,
    textures,
  };
}

function loadKhronosValidator() {
  const require = createRequire(import.meta.url);
  const explicit = process.env.SF_GLTF_VALIDATOR_MODULE;
  const candidates = [
    explicit,
    'gltf-validator',
    'C:/Users/93rob/AppData/Local/Temp/spaceface-gltf-validator/node_modules/gltf-validator',
  ].filter(Boolean);
  const failures = [];
  for (const candidate of candidates) {
    try {
      return { validator: require(candidate), module: candidate };
    } catch (error) {
      failures.push(`${candidate}: ${error.code || error.message}`);
    }
  }
  throw new Error(
    'Khronos glTF Validator is required for --apply. Install gltf-validator or set '
      + `SF_GLTF_VALIDATOR_MODULE. Attempts: ${failures.join('; ')}`,
  );
}

async function validateKhronosGlb(bytes, label) {
  const { validator, module } = loadKhronosValidator();
  const report = await validator.validateBytes(new Uint8Array(bytes), {
    uri: label,
    format: 'glb',
    writeTimestamp: false,
    maxIssues: 0,
  });
  const counts = {
    errors: report.issues?.numErrors ?? 0,
    warnings: report.issues?.numWarnings ?? 0,
    infos: report.issues?.numInfos ?? 0,
    hints: report.issues?.numHints ?? 0,
  };
  if (counts.errors || counts.warnings) {
    const messages = (report.issues?.messages || [])
      .filter((message) => message.severity <= 1)
      .slice(0, 12)
      .map((message) => `${message.code}: ${message.message}`)
      .join('; ');
    throw new Error(
      `${label} failed Khronos glTF validation (${counts.errors} errors, `
        + `${counts.warnings} warnings): ${messages}`,
    );
  }
  return {
    module,
    version: validator.version(),
    counts,
  };
}

async function repairHull(id) {
  const paths = sourcePaths(id);
  if (!existsSync(paths.inputSource)) throw new Error(`missing finalizer input: ${paths.inputSource}`);
  if (!existsSync(paths.source)) throw new Error(`missing canonical hull target: ${paths.source}`);
  const sourceBytes = readFileSync(paths.inputSource);
  const targetBytesBefore = readFileSync(paths.source);
  const parsed = parseStrictEmbeddedGlb(sourceBytes, `${id} source`);
  const materialNames = (parsed.gltf.materials || [])
    .map((material, index) => material.name || `material_${index}`);
  const authoredInputs = authoredInputRecord(paths, materialNames);
  const currentAudit = await auditEmbeddedTextureChannels(parsed, `${id} current source`);
  const priorFinalizer = parsed.gltf.asset?.extras?.sourceProvenance?.modularHullFinalizer;
  const priorGenerator = priorFinalizer?.priorGenerator || parsed.gltf.asset?.generator || null;
  const inputDiffersFromCanonical = sha256(sourceBytes) !== sha256(targetBytesBefore);
  if (
    !FORCE
    && parsed.gltf.asset?.extras?.sourceProvenance?.textureRoleCorrection === CORRECTION_ID
    && priorFinalizer?.algorithm === FINALIZER_ALGORITHM
    && priorFinalizer?.authoredInputFingerprint === authoredInputs.fingerprint
    && parsed.gltf.asset?.generator === FINALIZER_GENERATOR
  ) {
    if (currentAudit.summary.errors || currentAudit.summary.warnings) {
      throw new Error(`${id} carries ${CORRECTION_ID} but still has texture audit findings`);
    }
    validateSourceTextureRoleCoverage(parsed.gltf, `${id} already-repaired source`);
    const khronosValidation = VALIDATE_KHRONOS
      ? await validateKhronosGlb(sourceBytes, `${id} already-repaired GLB`)
      : null;
    const tangentCheck = repairNormalMappedTangents(
      parsed.gltf,
      parsed.binary,
      `${id} already-repaired GLB`,
    );
    if (tangentCheck.changedTangentCount !== 0) {
      throw new Error(
        `${id} carries ${CORRECTION_ID} but still has `
          + `${tangentCheck.changedTangentCount} invalid tangent elements`,
      );
    }
    return {
      id,
      path: paths.source,
      inputPath: paths.inputSource,
      mode: 'already-repaired',
      publishSource: inputDiffersFromCanonical,
      output: sourceBytes,
      targetSha256Before: sha256(targetBytesBefore),
      sourceBytesBefore: sourceBytes.length,
      sourceBytesAfter: sourceBytes.length,
      sourceSha256Before: sha256(sourceBytes),
      sourceSha256After: sha256(sourceBytes),
      materials: parsed.gltf.materials?.length || 0,
      auditBefore: currentAudit.summary,
      auditAfter: currentAudit.summary,
      geometrySignature: geometrySignature(parsed.gltf),
      materialPreservationSignature: materialPreservationSignature(parsed.gltf),
      materialSemanticSignature: materialSemanticSignature(parsed.gltf),
      materialSampling: materialSamplingSummary(parsed.gltf),
      authoredInputs,
      assetGenerator: parsed.gltf.asset.generator,
      priorGenerator,
      khronosValidation,
      tangentRepair: {
        ...tangentCheck,
        binary: undefined,
      },
      nonTangentAccessorSignature: accessorContentSignature(
        parsed.gltf,
        parsed.binary,
        { excludeAccessorIndices: tangentCheck.tangentAccessorIndexes },
      ),
    };
  }

  assertNoUnsupportedTextureBindings(parsed.gltf, id);
  const gltf = structuredClone(parsed.gltf);
  let binary = Buffer.from(parsed.binary.subarray(0, parsed.gltf.buffers[0].byteLength));
  const beforeGeometry = geometrySignature(gltf);
  const beforeMaterialPreservation = materialPreservationSignature(gltf);
  const discardedViews = new Set(
    (gltf.images || [])
      .map((image) => image.bufferView)
      .filter(Number.isInteger),
  );
  const sampler = gltf.textures?.find((texture) => Number.isInteger(texture.sampler))?.sampler ?? 0;
  const priorFactors = gltf.asset?.extras?.sourceProvenance?.materialFactorsBeforeCorrection || {};
  gltf.images = [];
  gltf.textures = [];

  const baseColorInput = await authoredPng(paths.trim);
  const normalPng = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 128, g: 128, b: 255, alpha: 1 },
    },
  }).png({ compressionLevel: 9 }).toBuffer();

  let appended = appendImage(
    gltf,
    binary,
    baseColorInput,
    `${id}_baseColor_1k`,
  );
  binary = appended.binary;
  const baseTexture = addTexture(gltf, appended.imageIndex, `${id}_baseColor_1k`, sampler);

  appended = appendImage(
    gltf,
    binary,
    normalPng,
    `${id}_neutral_normal`,
    'image/png',
    { spacefaceTexturePolicy: ['neutral-normal-no-authored-height'] },
  );
  binary = appended.binary;
  const normalTexture = addTexture(gltf, appended.imageIndex, `${id}_normal_1k`, sampler);
  const materialFactorsBeforeCorrection = {};
  const physicalMapSources = {};

  for (const [materialIndex, material] of (gltf.materials || []).entries()) {
    const materialName = material.name || `material_${materialIndex}`;
    const pbr = material.pbrMetallicRoughness || {};
    const priorBaseColorInfo = pbr.baseColorTexture;
    const priorNormalInfo = material.normalTexture;
    const priorMetallicRoughnessInfo = pbr.metallicRoughnessTexture;
    const priorOcclusionInfo = material.occlusionTexture;
    const storedFactors = priorFactors[materialName] || {};
    const authoredAoPath = paths.aoFor(materialName);
    const authoredAoInput = existsSync(authoredAoPath) ? authoredImage(authoredAoPath) : null;
    const roughness = Number.isFinite(storedFactors.roughness)
      ? storedFactors.roughness
      : Number.isFinite(pbr.roughnessFactor) && pbr.roughnessFactor < 0.99
        ? pbr.roughnessFactor
      : (ROUGHNESS_BY_MATERIAL[materialName] ?? 0.66);
    const metallic = Number.isFinite(storedFactors.metallic)
      ? storedFactors.metallic
      : Number.isFinite(pbr.metallicFactor) ? pbr.metallicFactor : 0;
    const baseColorFactor = Array.isArray(storedFactors.baseColorFactor)
      ? storedFactors.baseColorFactor
      : Array.isArray(pbr.baseColorFactor)
        ? pbr.baseColorFactor
        : (BASE_COLOR_FACTOR_BY_MATERIAL[materialName] || [1, 1, 1, 1]);
    materialFactorsBeforeCorrection[materialName] = {
      baseColorFactor,
      roughness,
      metallic,
    };
    const ormResult = await deriveOrmMap(baseColorInput, {
      aoPng: authoredAoInput,
      roughness,
      metallic,
    });
    physicalMapSources[materialName] = {
      ...ormResult.metadata,
      aoSampling: 'untransformed-texcoord-0',
    };

    const slug = materialName.replace(/^Material_/, '').toLowerCase();
    appended = appendImage(
      gltf,
      binary,
      ormResult.png,
      `${id}_${slug}_orm_1k`,
      'image/png',
      ormResult.metadata.recommendedTexturePolicy
        ? { spacefaceTexturePolicy: [ormResult.metadata.recommendedTexturePolicy] }
        : undefined,
    );
    binary = appended.binary;
    const ormTexture = addTexture(gltf, appended.imageIndex, `${id}_${slug}_orm_1k`, sampler);
    const nextBaseColorInfo = replaceTextureInfoIndex(priorBaseColorInfo, baseTexture);
    const nextNormalInfo = replaceTextureInfoIndex(priorNormalInfo, normalTexture, { scale: 0.9 });
    const nextMetallicRoughnessInfo = replaceTextureInfoIndex(
      priorMetallicRoughnessInfo,
      ormTexture,
    );
    const nextOcclusionInfo = {
      index: ormTexture,
      strength: priorOcclusionInfo?.strength ?? 0.85,
    };

    material.pbrMetallicRoughness = {
      ...pbr,
      baseColorFactor,
      baseColorTexture: nextBaseColorInfo,
      metallicRoughnessTexture: nextMetallicRoughnessInfo,
      roughnessFactor: 1,
      metallicFactor: 1,
    };
    material.normalTexture = nextNormalInfo;
    material.occlusionTexture = nextOcclusionInfo;
    assertTextureInfoPreserved(
      material.pbrMetallicRoughness.baseColorTexture,
      priorBaseColorInfo,
      baseTexture,
      {},
      `${id}.${materialName}.baseColorTexture`,
    );
    assertTextureInfoPreserved(
      material.normalTexture,
      priorNormalInfo,
      normalTexture,
      { scale: 0.9 },
      `${id}.${materialName}.normalTexture`,
    );
    assertTextureInfoPreserved(
      material.pbrMetallicRoughness.metallicRoughnessTexture,
      priorMetallicRoughnessInfo,
      ormTexture,
      {},
      `${id}.${materialName}.metallicRoughnessTexture`,
    );
    assertRawAoSampling(material.occlusionTexture, `${id}.${materialName}.occlusionTexture`);
  }

  gltf.asset.generator = FINALIZER_GENERATOR;
  gltf.asset.extras = {
    ...(gltf.asset.extras || {}),
    sourceProvenance: {
      ...(gltf.asset.extras?.sourceProvenance || {}),
      textureRoleContractVersion: 1,
      textureRoleMode: 'bound-base-normal-orm',
      textureRoleCorrection: CORRECTION_ID,
      physicalMapPolicy: 'neutral-normal-authored-ao-and-explicit-material-class',
      materialFactorsBeforeCorrection,
      physicalMapSources,
      modularHullFinalizer: {
        algorithm: FINALIZER_ALGORITHM,
        priorGenerator,
        authoredInputFingerprint: authoredInputs.fingerprint,
        authoredTextureSha256: authoredInputs.textures,
        inputSourceSha256: sha256(sourceBytes),
      },
    },
  };

  const binaryBeforeTangentRepair = binary;
  const tangentRepair = repairNormalMappedTangents(
    gltf,
    binaryBeforeTangentRepair,
    `${id} repaired source`,
  );
  const nonTangentAccessorSignature = accessorContentSignature(
    gltf,
    binaryBeforeTangentRepair,
    { excludeAccessorIndices: tangentRepair.tangentAccessorIndexes },
  );
  binary = tangentRepair.binary;
  binary = compactDiscardedImagePayloads(gltf, binary, discardedViews);
  if (geometrySignature(gltf) !== beforeGeometry) {
    throw new Error(`${id} texture repair changed scene, node, mesh, accessor, skin, or animation structure`);
  }
  if (accessorContentSignature(
    gltf,
    binary,
    { excludeAccessorIndices: tangentRepair.tangentAccessorIndexes },
  ) !== nonTangentAccessorSignature) {
    throw new Error(`${id} texture repair changed non-tangent accessor payloads`);
  }
  if (materialPreservationSignature(gltf) !== beforeMaterialPreservation) {
    throw new Error(`${id} texture repair changed non-owned material semantics`);
  }
  const audit = await auditEmbeddedTextureChannels({ gltf, binary }, `${id} repaired source`);
  if (audit.summary.errors || audit.summary.warnings) {
    throw new Error(`${id} repaired source still has texture findings:\n${JSON.stringify(audit.findings, null, 2)}`);
  }
  validateSourceTextureRoleCoverage(gltf, `${id} repaired source`);

  const output = serializeGlb(gltf, binary);
  const reparsed = parseStrictEmbeddedGlb(output, `${id} repaired GLB`);
  if (geometrySignature(reparsed.gltf) !== beforeGeometry) {
    throw new Error(`${id} serialized repair changed geometry structure`);
  }
  const finalMaterialSemanticSignature = materialSemanticSignature(gltf);
  if (materialSemanticSignature(reparsed.gltf) !== finalMaterialSemanticSignature) {
    throw new Error(`${id} serialized repair changed material semantics`);
  }
  if (accessorContentSignature(
    reparsed.gltf,
    reparsed.binary,
    { excludeAccessorIndices: tangentRepair.tangentAccessorIndexes },
  ) !== nonTangentAccessorSignature) {
    throw new Error(`${id} serialized repair changed non-tangent accessor payloads`);
  }
  const khronosValidation = VALIDATE_KHRONOS
    ? await validateKhronosGlb(output, `${id} repaired GLB`)
    : null;
  return {
    id,
    path: paths.source,
    inputPath: paths.inputSource,
    mode: 'repaired',
    publishSource: true,
    output,
    targetSha256Before: sha256(targetBytesBefore),
    sourceBytesBefore: sourceBytes.length,
    sourceBytesAfter: output.length,
    sourceSha256Before: sha256(sourceBytes),
    sourceSha256After: sha256(output),
    materials: gltf.materials?.length || 0,
    images: gltf.images.length,
    auditBefore: currentAudit.summary,
    auditAfter: audit.summary,
    geometrySignature: beforeGeometry,
    materialPreservationSignature: beforeMaterialPreservation,
    materialSemanticSignature: finalMaterialSemanticSignature,
    materialSampling: materialSamplingSummary(reparsed.gltf),
    authoredInputs,
    assetGenerator: reparsed.gltf.asset.generator,
    priorGenerator,
    khronosValidation,
    tangentRepair: {
      primitiveCount: tangentRepair.primitiveCount,
      tangentAccessorCount: tangentRepair.tangentAccessorCount,
      tangentElementCount: tangentRepair.tangentElementCount,
      changedTangentCount: tangentRepair.changedTangentCount,
      normalizedTangentCount: tangentRepair.normalizedTangentCount,
      orthogonalizedTangentCount: tangentRepair.orthogonalizedTangentCount,
      replacedTangentCount: tangentRepair.replacedTangentCount,
      canonicalizedHandednessCount: tangentRepair.canonicalizedHandednessCount,
      tangentAccessorIndexes: tangentRepair.tangentAccessorIndexes,
      repairedAccessorIndexes: tangentRepair.repairedAccessorIndexes,
    },
    nonTangentAccessorSignature,
  };
}

const results = [];
for (const id of selectedIds) results.push(await repairHull(id));

const manifest = JSON.parse(readFileSync(PARTS_MANIFEST_PATH, 'utf8'));
for (const result of results) {
  const entry = manifest.parts?.find((part) => part.id === result.id);
  if (!entry) throw new Error(`parts manifest is missing ${result.id}`);
  entry.bytes = result.sourceBytesAfter;
  const originalNote = entry.note.replace(/\s+Texture-role correction 2026-07-27\b.*$/u, '');
  entry.note = `${originalNote} Texture-role correction 2026-07-27 — authored trim retained as base color; `
    + 'a declared neutral OpenGL normal is used where no authored surface-height bake exists; packed ORM uses '
    + 'the Blender AO bake on untransformed UV0 when valid plus explicit material roughness/metalness classes; '
    + 'all roles are bound.';
}
const manifestOutput = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);

const report = {
  schema: 'spaceface.modularHullTextureRoleRepair.v1',
  mode: APPLY ? 'apply' : 'dry-run',
  correctionId: CORRECTION_ID,
  selectedIds,
  repaired: results.filter((result) => result.mode === 'repaired').length,
  alreadyRepaired: results.filter((result) => result.mode === 'already-repaired').length,
  totals: {
    errorsBefore: results.reduce((sum, result) => sum + result.auditBefore.errors, 0),
    warningsBefore: results.reduce((sum, result) => sum + result.auditBefore.warnings, 0),
    errorsAfter: results.reduce((sum, result) => sum + result.auditAfter.errors, 0),
    warningsAfter: results.reduce((sum, result) => sum + result.auditAfter.warnings, 0),
    sourceBytesBefore: results.reduce((sum, result) => sum + result.sourceBytesBefore, 0),
    sourceBytesAfter: results.reduce((sum, result) => sum + result.sourceBytesAfter, 0),
  },
  hulls: results.map(({ output, path, ...result }) => ({
    ...result,
    path: path.slice(ROOT.length + 1).replace(/\\/g, '/'),
    inputPath: result.inputPath.slice(ROOT.length + 1).replace(/\\/g, '/'),
  })),
};

if (APPLY) {
  const sourcePublicationResults = results.filter((entry) => entry.publishSource);
  for (const result of sourcePublicationResults) {
    if (sha256(readFileSync(result.inputPath)) !== result.sourceSha256Before) {
      throw new Error(`${result.id} finalizer input changed before publication`);
    }
    const materialNames = Object.keys(result.authoredInputs.textures)
      .filter((key) => key.startsWith('ao:'))
      .map((key) => key.slice('ao:'.length));
    const currentAuthoredInputs = authoredInputRecord(sourcePaths(result.id), materialNames);
    if (currentAuthoredInputs.fingerprint !== result.authoredInputs.fingerprint) {
      throw new Error(`${result.id} authored texture inputs changed before publication`);
    }
  }
  const descriptors = sourcePublicationResults.map((result) => ({
      path: result.path,
      bytes: result.output,
      expectedCurrentSha256: result.targetSha256Before,
      validate: async (_stagedPath, bytes) => {
        const staged = parseStrictEmbeddedGlb(bytes, `${result.id} staged source`);
        const stagedAudit = await auditEmbeddedTextureChannels(staged, `${result.id} staged source`);
        if (stagedAudit.summary.errors || stagedAudit.summary.warnings) {
          throw new Error(`${result.id} staged source failed the texture-channel audit`);
        }
        if (geometrySignature(staged.gltf) !== result.geometrySignature) {
          throw new Error(`${result.id} staged source changed geometry`);
        }
        if (materialSemanticSignature(staged.gltf) !== result.materialSemanticSignature) {
          throw new Error(`${result.id} staged source changed material semantics`);
        }
        if (accessorContentSignature(
          staged.gltf,
          staged.binary,
          { excludeAccessorIndices: result.tangentRepair.tangentAccessorIndexes },
        ) !== result.nonTangentAccessorSignature) {
          throw new Error(`${result.id} staged source changed non-tangent accessor payloads`);
        }
        const tangentCheck = repairNormalMappedTangents(
          staged.gltf,
          staged.binary,
          `${result.id} staged source`,
        );
        if (tangentCheck.changedTangentCount !== 0) {
          throw new Error(`${result.id} staged source has invalid tangent elements`);
        }
        await validateKhronosGlb(bytes, `${result.id} staged source`);
      },
    }));
  descriptors.push({
    path: PARTS_MANIFEST_PATH,
    bytes: manifestOutput,
    expectedCurrentSha256: PARTS_MANIFEST_SHA256_BEFORE,
    validate: async (_stagedPath, bytes) => {
      const staged = JSON.parse(bytes.toString('utf8'));
      for (const result of results) {
        const entry = staged.parts?.find((part) => part.id === result.id);
        if (entry?.bytes !== result.sourceBytesAfter) {
          throw new Error(`${result.id} manifest byte count does not match staged source`);
        }
      }
    },
  });
  await publishFileSetTransaction({ files: descriptors });
}

console.log(JSON.stringify(report, null, 2));
