#!/usr/bin/env node
// Promote one visually accepted M4 raw candidate into the compressed source lane.
import { createHash } from 'node:crypto';
import { copyFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureTransform } from '@gltf-transform/extensions';
import { meshopt, tangents } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import {
  generateTangents,
  ready as mikktspaceReady,
} from 'three/addons/libs/mikktspace.module.js';
import JPEG from 'jpeg-js';
import { PNG } from 'pngjs';

import { inspectGlbReleaseCompression } from '../src/contracts/assetReleaseValidation.js';
import { RELEASE_MESHOPT_OPTIONS } from './lib/releaseMeshoptProfile.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = {
  place_asteroid_rock_a: 'assets/ships/parts/places/place_asteroid_rock_a.glb',
  place_station_trade_hub: 'assets/ships/parts/places/place_station_trade_hub.glb',
};
const AUTHORING_BLENDS = {
  place_station_trade_hub: 'assets/ships/m4_helios_hub/blender/helios_hub_station_production.blend',
  place_asteroid_rock_a: 'assets/ships/m4_helios_hub/blender/helios_rock_a_production.blend',
};
const CONTRACTS = {
  place_asteroid_rock_a: {
    contractVersion: 2,
    assetId: 'SF_PLACE_ASTEROID_ROCK_A',
    partId: 'place_asteroid_rock_a',
    liveId: 'place_asteroid_rock_a',
    slot: 'place',
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    normalConvention: 'OpenGL',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'KTX2/BasisU+mips',
    family: 'resource_asteroid',
    role: 'starting_region_resource_rock',
    factorOnlyMaterials: [],
  },
  place_station_trade_hub: {
    contractVersion: 2,
    assetId: 'SF_PLACE_STATION_TRADE_HUB',
    partId: 'place_station_trade_hub',
    liveId: 'place_station_trade_hub',
    slot: 'place',
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    normalConvention: 'OpenGL',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'KTX2/BasisU+mips',
    factorOnlyMaterials: ['SF_AmberEmission', 'SF_CyanEmission'],
  },
};
const args = parseArgs(process.argv.slice(2));
const asset = String(args.asset || '');
if (!ASSETS[asset]) throw new Error(`--asset must be one of: ${Object.keys(ASSETS).join(', ')}`);
if (!args.candidate || !args.report) throw new Error('--candidate and --report are required');
const candidate = resolve(ROOT, args.candidate);
const reportPath = resolve(ROOT, args.report);
const target = resolve(ROOT, ASSETS[asset]);
const candidateRel = slash(relative(ROOT, candidate));
if (!candidateRel.startsWith('.devshots/graphics/surface-candidates/')
    && !candidateRel.startsWith('.devshots/graphics/helios-pbr-v3/')
    && !candidateRel.startsWith('.devshots/graphics/helios-golden-v4-export-')
    && !candidateRel.startsWith('assets/ships/m4_helios_hub/production/')) {
  throw new Error(`candidate must remain under an approved graphics candidate root: ${candidateRel}`);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const isGoldenStation = asset === 'place_station_trade_hub'
  && report.schema === 'spaceface.heliosGoldenStationExport.v1';
const isGoldenProduction = asset === 'place_station_trade_hub'
  && report.schema === 'spaceface.heliosGoldenProduction.v1';
const expectedRemaster = asset === 'place_station_trade_hub'
  ? (isGoldenProduction
    ? 'helios-golden-production-v1'
    : (isGoldenStation ? 'helios-golden-station-v4' : 'helios-functional-surfaces-v3'))
  : 'helios-golden-surfaces-v2';
const isRecipeReport = isGoldenStation || isGoldenProduction;
const reportedRemaster = isRecipeReport ? report.recipeId : report.remasterId;
const reportedGlb = isRecipeReport ? report.outputGlb : report.candidateGlb;
const reportedGlbSha256 = isRecipeReport ? report.outputGlbSha256 : report.candidateGlbSha256;
const reportedBlend = isGoldenProduction
  ? report.outputBlend
  : (isGoldenStation ? report.sourceBlend : report.candidateBlend);
const reportedBlendSha256 = isGoldenProduction
  ? report.outputBlendSha256
  : (isGoldenStation ? report.sourceBlendSha256 : report.candidateBlendSha256);
if (reportedRemaster !== expectedRemaster) throw new Error(`unexpected remaster id: ${reportedRemaster}`);
if (resolve(reportedGlb) !== candidate) throw new Error('report candidate path does not match --candidate');
if (sha256(readFileSync(candidate)) !== reportedGlbSha256) throw new Error('candidate hash does not match report');
const candidateBlend = resolve(reportedBlend || '');
const authoringBlend = resolve(ROOT, AUTHORING_BLENDS[asset]);
if (!reportedBlend || sha256(readFileSync(candidateBlend)) !== reportedBlendSha256) {
  throw new Error('candidate Blender source does not match report');
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await mikktspaceReady;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});
const rawInspection = inspectGlbReleaseCompression(candidateRel, { root: ROOT, releaseMode: false });
if (!rawInspection.ok) throw new Error('raw candidate does not parse');
const document = await io.read(candidate);
splitIncompatibleTextureSlots(document);
repairPackedOrmBindings(document);
stampAuthoringContract(document, asset);
unweldMissingTangentPrimitives(document);
await document.transform(tangents({ generateTangents, overwrite: false }));
repairTangentUnitVectors(document);
validateStrictSurfaceContract(document, asset);
const transforms = [];
if (rawInspection.metrics.textureCount > 0) {
  transforms.push(
    ktx2({
      slots: /^baseColorTexture$/, imageDecoder: decodeImage, isUASTC: true, uastcLDRQualityLevel: 2,
      generateMipmap: true, needSupercompression: true, isPerceptual: true,
      isSetKTX2SRGBTransferFunc: true,
    }),
    ktx2({
      slots: /^normalTexture$/, imageDecoder: decodeImage, isUASTC: true, uastcLDRQualityLevel: 2,
      generateMipmap: true, needSupercompression: true, isNormalMap: true, isPerceptual: false,
      isSetKTX2SRGBTransferFunc: false,
    }),
    ktx2({
      slots: /^(occlusionTexture|metallicRoughnessTexture|roughnessTexture|metalnessTexture)$/,
      imageDecoder: decodeImage, isUASTC: true, uastcLDRQualityLevel: 2,
      generateMipmap: true, needSupercompression: true, isPerceptual: false,
      isSetKTX2SRGBTransferFunc: false,
    }),
  );
}
transforms.push(meshopt({ encoder: MeshoptEncoder, ...RELEASE_MESHOPT_OPTIONS }));
await document.transform(...transforms);
stampAuthoringContract(document, asset);
validateStrictSurfaceContract(document, asset);

const temp = `${target}.surface-${process.pid}-${Date.now()}.tmp.glb`;
try {
  await io.write(temp, document);
  const tempRel = slash(relative(ROOT, temp));
  const optimized = inspectGlbReleaseCompression(tempRel, { root: ROOT, releaseMode: false });
  if (!optimized.ok) throw new Error('optimized source candidate does not parse');
  if (optimized.metrics.ktx2TextureCount !== optimized.metrics.textureCount) {
    throw new Error('optimized source candidate is not fully KTX2');
  }
  if (optimized.metrics.meshoptBufferViewCount <= 0) throw new Error('optimized source candidate lacks meshopt');
  if (optimized.metrics.primitiveCount !== rawInspection.metrics.primitiveCount) throw new Error('primitive count changed');
  const rawContracts = [...rawInspection.metrics.contractNodeNames].sort();
  const optimizedContracts = [...optimized.metrics.contractNodeNames].sort();
  if (JSON.stringify(rawContracts) !== JSON.stringify(optimizedContracts)) throw new Error('contract node names changed');
  await copyFile(temp, target);
  await copyFile(candidateBlend, authoringBlend);
  const promotion = {
    schema: 'spaceface.m4SurfacePromotion.v1',
    asset,
    remasterId: reportedRemaster,
    candidate: candidateRel,
    candidateSha256: reportedGlbSha256,
    source: ASSETS[asset],
    sourceSha256: sha256(readFileSync(target)),
    sourceBytes: readFileSync(target).length,
    authoringBlend: slash(relative(ROOT, authoringBlend)),
    authoringBlendSha256: sha256(readFileSync(authoringBlend)),
    textures: optimized.metrics.textureCount,
    ktx2Textures: optimized.metrics.ktx2TextureCount,
    meshoptBufferViews: optimized.metrics.meshoptBufferViewCount,
    contractNodeCount: optimized.metrics.contractNodeNames.length,
  };
  const output = resolve(dirname(reportPath), 'promotion-report.json');
  await writeFile(output, `${JSON.stringify(promotion, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, report: slash(relative(ROOT, output)), ...promotion }, null, 2));
} finally {
  await rm(temp, { force: true }).catch(() => {});
}

function decodeImage(buffer) {
  try {
    const png = PNG.sync.read(Buffer.from(buffer));
    return { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength) };
  } catch {
    const jpeg = JPEG.decode(Buffer.from(buffer), { useTArray: true });
    return { width: jpeg.width, height: jpeg.height, data: new Uint8Array(jpeg.data.buffer, jpeg.data.byteOffset, jpeg.data.byteLength) };
  }
}

function splitIncompatibleTextureSlots(document) {
  for (const material of document.getRoot().listMaterials()) {
    const base = material.getBaseColorTexture();
    const normal = material.getNormalTexture();
    if (!base || !normal || base !== normal || !normal.getImage()) continue;
    const clone = document.createTexture(`${normal.getName() || 'normal'}_normal_slot`)
      .setImage(normal.getImage())
      .setMimeType(normal.getMimeType());
    material.setNormalTexture(clone);
  }
}

function repairPackedOrmBindings(document) {
  const factorOnly = new Set(CONTRACTS[asset].factorOnlyMaterials);
  const transformExtension = document.createExtension(KHRTextureTransform);
  for (const material of document.getRoot().listMaterials()) {
    if (factorOnly.has(material.getName())) continue;
    const packedOrm = material.getMetallicRoughnessTexture();
    if (!packedOrm) throw new Error(`${material.getName()}: missing metallic-roughness texture`);
    if (material.getOcclusionTexture() !== packedOrm) material.setOcclusionTexture(packedOrm);
    const sourceInfo = material.getMetallicRoughnessTextureInfo();
    const targetInfo = material.getOcclusionTextureInfo();
    targetInfo.setTexCoord(sourceInfo.getTexCoord());
    const sourceTransform = sourceInfo.getExtension('KHR_texture_transform');
    targetInfo.setExtension('KHR_texture_transform', sourceTransform
      ? transformExtension.createTransform()
        .setOffset([...sourceTransform.getOffset()])
        .setRotation(sourceTransform.getRotation())
        .setScale([...sourceTransform.getScale()])
        .setTexCoord(sourceTransform.getTexCoord())
      : null);
  }
}

function unweldMissingTangentPrimitives(document) {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (!primitive.getMaterial()?.getNormalTexture()) continue;
      // Recompute every authored tangent after Blender-side triangulation. Donor tangents can
      // contain zero vectors on degenerate UV seam vertices even when most of the primitive is valid.
      primitive.setAttribute('TANGENT', null);
      const indices = primitive.getIndices();
      if (!indices) continue;
      const indexArray = indices.getArray();
      for (const semantic of primitive.listSemantics()) {
        primitive.setAttribute(semantic, expandAccessor(document, primitive.getAttribute(semantic), indexArray));
      }
      for (const target of primitive.listTargets()) {
        for (const semantic of target.listSemantics()) {
          target.setAttribute(semantic, expandAccessor(document, target.getAttribute(semantic), indexArray));
        }
      }
      primitive.setIndices(null);
    }
  }
}

function repairTangentUnitVectors(document) {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (!primitive.getMaterial()?.getNormalTexture()) continue;
      const tangent = primitive.getAttribute('TANGENT');
      const normal = primitive.getAttribute('NORMAL');
      if (!tangent || !normal) continue;
      const values = tangent.getArray();
      const normals = normal.getArray();
      for (let index = 0; index < tangent.getCount(); index++) {
        const offset = index * 4;
        let x = values[offset];
        let y = values[offset + 1];
        let z = values[offset + 2];
        let length = Math.hypot(x, y, z);
        if (!Number.isFinite(length) || length < 1e-6) {
          const normalOffset = index * 3;
          const nx = normals[normalOffset];
          const ny = normals[normalOffset + 1];
          const nz = normals[normalOffset + 2];
          // Choose the least-parallel reference axis, then build a stable orthogonal tangent.
          if (Math.abs(nz) < 0.9) {
            x = ny;
            y = -nx;
            z = 0;
          } else {
            x = 0;
            y = nz;
            z = -ny;
          }
          length = Math.max(Math.hypot(x, y, z), 1e-6);
        }
        values[offset] = x / length;
        values[offset + 1] = y / length;
        values[offset + 2] = z / length;
        values[offset + 3] = values[offset + 3] < 0 ? -1 : 1;
      }
      tangent.setArray(values);
    }
  }
}

function expandAccessor(document, source, indices) {
  const sourceArray = source.getArray();
  const elementSize = source.getElementSize();
  const ExpandedArray = sourceArray.constructor;
  const expanded = new ExpandedArray(indices.length * elementSize);
  for (let dstIndex = 0; dstIndex < indices.length; dstIndex++) {
    const srcOffset = indices[dstIndex] * elementSize;
    const dstOffset = dstIndex * elementSize;
    for (let component = 0; component < elementSize; component++) {
      expanded[dstOffset + component] = sourceArray[srcOffset + component];
    }
  }
  return document.createAccessor(`${source.getName() || 'attribute'}_unwelded`)
    .setType(source.getType())
    .setArray(expanded)
    .setNormalized(source.getNormalized())
    .setBuffer(source.getBuffer());
}

function stampAuthoringContract(document, assetId) {
  const contract = CONTRACTS[assetId];
  for (const property of [document.getRoot().getAsset(), ...document.getRoot().listScenes()]) {
    const extras = property.getExtras ? property.getExtras() || {} : property.extras || {};
    const next = {
      ...extras,
      assetId: contract.assetId,
      partId: contract.partId,
      spacefaceAsset: { ...(extras.spacefaceAsset || {}), ...contract },
    };
    if (property.setExtras) property.setExtras(next); else property.extras = next;
  }
}

function validateStrictSurfaceContract(document, assetId) {
  const factorOnly = new Set(CONTRACTS[assetId].factorOnlyMaterials);
  const errors = [];
  for (const material of document.getRoot().listMaterials()) {
    if (factorOnly.has(material.getName())) continue;
    if (!material.getBaseColorTexture()) errors.push(`${material.getName()}: missing baseColor texture`);
    if (!material.getNormalTexture()) errors.push(`${material.getName()}: missing normal texture`);
    const orm = material.getMetallicRoughnessTexture();
    if (!orm || material.getOcclusionTexture() !== orm) {
      errors.push(`${material.getName()}: ORM must be shared by occlusion and metallic-roughness slots`);
    } else if (!sameTextureInfoSampling(
      material.getOcclusionTextureInfo(),
      material.getMetallicRoughnessTextureInfo(),
    )) {
      errors.push(`${material.getName()}: ORM texture slots do not share one UV transform`);
    }
  }
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial();
      if (material?.getNormalTexture() && !primitive.getAttribute('TANGENT')) {
        errors.push(`${mesh.getName() || '<unnamed mesh>'}: missing authored tangent attribute`);
      }
    }
  }
  if (errors.length) throw new Error(`strict live surface contract failed:\n- ${errors.join('\n- ')}`);
}

function sameTextureInfoSampling(a, b) {
  if (!a || !b || a.getTexCoord() !== b.getTexCoord()) return false;
  const at = a.getExtension('KHR_texture_transform');
  const bt = b.getExtension('KHR_texture_transform');
  if (!at || !bt) return at === bt;
  return at.getRotation() === bt.getRotation()
    && at.getTexCoord() === bt.getTexCoord()
    && arraysEqual(at.getOffset(), bt.getOffset())
    && arraysEqual(at.getScale(), bt.getScale());
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= 1e-8);
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index++) {
    if (!values[index].startsWith('--')) continue;
    const key = values[index].slice(2);
    result[key] = values[index + 1] && !values[index + 1].startsWith('--') ? values[++index] : true;
  }
  return result;
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex').toUpperCase(); }
function slash(value) { return value.replace(/\\/g, '/'); }
