#!/usr/bin/env node
/**
 * Headlessly finalize the isolated Hitch V7 polish candidates.
 *
 * This script performs only deterministic source/release processing. It never
 * launches a browser, captures presentation evidence, mutates live assets, or
 * promotes a manifest row.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import JPEG from 'jpeg-js';
import { PNG } from 'pngjs';

import { RELEASE_MESHOPT_OPTIONS } from '../../../../scripts/lib/releaseMeshoptProfile.mjs';
import {
  validateKtx2MaterialRolePayloads,
} from '../../../../tools/art/lib/ktx2MaterialRoleValidation.mjs';
import { auditEmbeddedTextureChannels } from '../../../../tools/art/lib/textureChannelAudit.mjs';
import {
  validateSourceTextureRoleCoverage,
} from '../../../../tools/art/lib/sourceTextureRoleValidation.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const DIR = dirname(SCRIPT);
const FAMILY = resolve(DIR, '..');
const ROOT = resolve(FAMILY, '../../..');
const PACKET = 'SF-K0-HITCH-POLISH-V7-001';
const BUILD_REPORT = resolve(FAMILY, 'evidence/hitch_polish_v7/build_report.json');
const FINALIZE_REPORT = resolve(FAMILY, 'evidence/hitch_polish_v7/finalize_report.json');
const SOURCE = [0, 1, 2].map((lod) => resolve(
  FAMILY,
  `source_candidates/hitch_polish_v7/wholeships/kestrel_borrowed_time_v4_lod${lod}.glb`,
));
const CANONICAL_SOURCE = [0, 1, 2].map((lod) => resolve(
  FAMILY,
  `source/wholeships/kestrel_borrowed_time_v4_lod${lod}.glb`,
));
const RELEASE = [0, 1, 2].map((lod) => resolve(
  FAMILY,
  `release_candidates/hitch_polish_v7/wholeships/kestrel_borrowed_time_v4_lod${lod}.glb`,
));
const REQUIRED_SOCKETS = Object.freeze({
  SOCKET_Weapon_Front: { position: [12.62, 1.43, 0], role: 'weapon_muzzle', forward: [1, 0, 0] },
  SOCKET_Mining_Front: { position: [12.26, -1.08, 0], role: 'mining_emitter', forward: [1, 0, 0] },
  SOCKET_Engine_Main: { position: [-13.85, 0, 0], role: 'engine_exhaust', forward: [-1, 0, 0] },
  SOCKET_Trail_Main: { position: [-14.05, 0, 0], role: 'engine_trail', forward: [-1, 0, 0] },
  SOCKET_Utility_Dorsal: { position: [-1.45, 1.95, -3.8], role: 'utility_dorsal', forward: [0, 1, 0] },
  SOCKET_Cargo_Ventral: { position: [-0.8, -2.1, 0], role: 'cargo_ventral', forward: [0, -1, 0] },
  SOCKET_Camera_Focus: { position: [0, 0.35, 0], role: 'camera_focus', forward: [1, 0, 0] },
  SOCKET_RCS_Port: { position: [1.6, 0.45, -6.6], role: 'rcs_port', forward: [0, 0, -1] },
  SOCKET_RCS_Starboard: { position: [1.6, 0.45, 6.6], role: 'rcs_starboard', forward: [0, 0, 1] },
});
const FACTOR_ONLY_MATERIALS = new Set([
  'Material_Emissive_Cyan',
  'Material_Emissive_DriveCore',
  'Material_Emissive_Orange',
  'Material_Glass_Canopy',
  'Material_V6_MarkingIvory',
]);
const TRIANGLE_RANGES = Object.freeze([
  [36_000, 38_000],
  [15_000, 16_500],
  [9_400, 10_400],
]);

const sha256Buffer = (buffer) => createHash('sha256').update(buffer).digest('hex').toUpperCase();
const sha256 = (path) => sha256Buffer(readFileSync(path));
const rel = (path) => path.replace(/\\/g, '/').replace(`${ROOT.replace(/\\/g, '/')}/`, '');
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

function raw(path) {
  const bytes = readFileSync(path);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error(`not GLB v2: ${path}`);
  }
  let offset = 12;
  let doc = null;
  let bin = Buffer.alloc(0);
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = bytes.subarray(offset, offset + length);
    offset += length;
    if (type === 0x4e4f534a) doc = JSON.parse(chunk.toString('utf8').replace(/\0+$/, '').trim());
    if (type === 0x004e4942) bin = chunk;
  }
  if (!doc) throw new Error(`GLB JSON missing: ${path}`);
  return { bytes, doc, bin };
}

function rootMetadata(doc) {
  const assetMetadata = doc.asset?.extras?.spacefaceAsset;
  if (assetMetadata) return assetMetadata;
  for (const node of doc.nodes || []) {
    if (node.extras?.spacefaceAsset) return node.extras.spacefaceAsset;
  }
  return null;
}

function accessorPayload(parsed, accessorIndex) {
  const accessor = parsed.doc.accessors?.[accessorIndex];
  if (!accessor || accessor.bufferView == null) return Buffer.alloc(0);
  const view = parsed.doc.bufferViews?.[accessor.bufferView];
  if (!view) return Buffer.alloc(0);
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const end = (view.byteOffset || 0) + view.byteLength;
  return Buffer.concat([
    Buffer.from(JSON.stringify({
      componentType: accessor.componentType,
      count: accessor.count,
      type: accessor.type,
      normalized: accessor.normalized === true,
    })),
    parsed.bin.subarray(start, end),
  ]);
}

function collisionFingerprint(parsed) {
  const node = (parsed.doc.nodes || []).find((candidate) => candidate.name === 'COLLISION_HULL');
  if (!node || node.mesh == null) throw new Error('COLLISION_HULL node missing');
  const mesh = parsed.doc.meshes?.[node.mesh];
  if (!mesh?.primitives?.length) throw new Error('COLLISION_HULL mesh missing');
  const hash = createHash('sha256');
  hash.update(JSON.stringify({
    translation: node.translation || [0, 0, 0],
    rotation: node.rotation || [0, 0, 0, 1],
    scale: node.scale || [1, 1, 1],
  }));
  for (const primitive of mesh.primitives) {
    hash.update(accessorPayload(parsed, primitive.attributes?.POSITION));
    hash.update(accessorPayload(parsed, primitive.indices));
  }
  return hash.digest('hex').toUpperCase();
}

function visibleTriangles(doc) {
  let total = 0;
  for (const node of doc.nodes || []) {
    if (node.mesh == null || /collision/i.test(node.name || '')) continue;
    for (const primitive of doc.meshes?.[node.mesh]?.primitives || []) {
      const accessor = doc.accessors?.[primitive.indices];
      if (accessor) total += Math.floor(accessor.count / 3);
    }
  }
  return total;
}

function visibleDraws(doc) {
  let draws = 0;
  for (const node of doc.nodes || []) {
    if (node.mesh == null || /collision/i.test(node.name || '')) continue;
    draws += doc.meshes?.[node.mesh]?.primitives?.length || 0;
  }
  return draws;
}

function vectorClose(actual, expected, epsilon = 1e-4) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => (
      Number.isFinite(value) && Math.abs(value - expected[index]) <= epsilon
    ));
}

function validateSockets(doc) {
  const rows = [];
  for (const [name, expected] of Object.entries(REQUIRED_SOCKETS)) {
    const node = (doc.nodes || []).find((candidate) => candidate.name === name);
    if (!node) throw new Error(`missing socket ${name}`);
    const actual = {
      position: node.translation || [0, 0, 0],
      role: node.extras?.spaceface?.role || null,
      forward: node.extras?.spaceface?.forward || null,
    };
    if (!vectorClose(actual.position, expected.position)
        || actual.role !== expected.role
        || !vectorClose(actual.forward, expected.forward)) {
      throw new Error(`socket contract mismatch ${name}: ${JSON.stringify(actual)}`);
    }
    rows.push({ name, ...actual });
  }
  return rows;
}

function validateMaterialCoverage(doc) {
  const errors = [];
  const usedMaterialIndices = new Set();
  for (const mesh of doc.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      if (primitive.material != null) usedMaterialIndices.add(primitive.material);
      if (primitive.attributes?.POSITION != null && primitive.attributes?.TEXCOORD_0 == null) {
        const material = doc.materials?.[primitive.material];
        const textured = material?.pbrMetallicRoughness?.baseColorTexture
          || material?.pbrMetallicRoughness?.metallicRoughnessTexture
          || material?.normalTexture
          || material?.occlusionTexture
          || material?.emissiveTexture;
        if (textured) errors.push(`textured primitive lacks TEXCOORD_0:${material?.name || primitive.material}`);
      }
    }
  }
  const usedNames = new Set(
    [...usedMaterialIndices].map((index) => doc.materials?.[index]?.name || `material_${index}`),
  );
  if (usedNames.has('Material_Decal_BorrowedTime')) {
    errors.push('legacy BORROWED identity material remains used');
  }
  if (!usedNames.has('Material_V6_MarkingIvory')) {
    errors.push('DIE LAUGHING identity material missing');
  }
  if ((doc.nodes || []).some((node) => /Borrowed/i.test(node.name || ''))) {
    errors.push('legacy BORROWED identity node remains visible');
  }
  for (const index of [...usedMaterialIndices].sort((a, b) => a - b)) {
    const material = doc.materials?.[index];
    const name = material?.name || `material_${index}`;
    if (FACTOR_ONLY_MATERIALS.has(name)) continue;
    if (!material?.pbrMetallicRoughness?.baseColorTexture) errors.push(`${name}:baseColorTexture`);
    if (!material?.normalTexture) errors.push(`${name}:normalTexture`);
    if (!material?.pbrMetallicRoughness?.metallicRoughnessTexture) {
      errors.push(`${name}:metallicRoughnessTexture`);
    }
    if (!material?.occlusionTexture) errors.push(`${name}:occlusionTexture`);
  }
  if (errors.length) throw new Error(`material coverage: ${errors.join(', ')}`);
  return [...usedNames].sort();
}

function validateMappedVertexContracts(document, lod) {
  const defects = [];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const material = primitive.getMaterial();
      const mapped = material && (
        material.getBaseColorTexture()
        || material.getNormalTexture()
        || material.getMetallicRoughnessTexture()
        || material.getOcclusionTexture()
      );
      if (!mapped) continue;
      const uvAccessor = primitive.getAttribute('TEXCOORD_0');
      if (!uvAccessor
          || !primitive.getAttribute('NORMAL')
          || !primitive.getAttribute('TANGENT')) {
        defects.push(`${mesh.getName()}/${material.getName()}:missing-vertex-role`);
        continue;
      }
      const uv = uvAccessor.getArray();
      const indicesAccessor = primitive.getIndices();
      const indices = indicesAccessor?.getArray();
      const count = indicesAccessor?.getCount() ?? uvAccessor.getCount();
      for (let offset = 0; offset < count; offset += 3) {
        const ia = indices ? indices[offset] : offset;
        const ib = indices ? indices[offset + 1] : offset + 1;
        const ic = indices ? indices[offset + 2] : offset + 2;
        const ax = uv[ia * 2];
        const ay = uv[ia * 2 + 1];
        const bx = uv[ib * 2];
        const by = uv[ib * 2 + 1];
        const cx = uv[ic * 2];
        const cy = uv[ic * 2 + 1];
        const uvArea = Math.abs(
          (bx - ax) * (cy - ay) - (by - ay) * (cx - ax),
        ) * 0.5;
        if (!(uvArea > 1e-10)) {
          defects.push(
            `${mesh.getName()}/${material.getName()}:triangle-${offset / 3}:${uvArea}`,
          );
        }
      }
    }
  }
  if (defects.length) {
    throw new Error(`mapped vertex contract failed LOD${lod}: ${defects.join(', ')}`);
  }
  return { degenerateMappedUvTriangles: 0 };
}

function splitTextureSlots(document) {
  for (const material of document.getRoot().listMaterials()) {
    const base = material.getBaseColorTexture();
    const normal = material.getNormalTexture();
    if (!base || !normal || base !== normal || !normal.getImage()) continue;
    const clone = document.createTexture(`${normal.getName() || 'normal'}_slot`)
      .setImage(normal.getImage())
      .setMimeType(normal.getMimeType());
    material.setNormalTexture(clone);
  }
}

function stamp(document, lod, build) {
  const asset = document.getRoot().getAsset();
  const rootNode = document.getRoot().listNodes().find(
    (node) => node.getExtras()?.spacefaceAsset,
  );
  const sourceMetadata = rootNode?.getExtras()?.spacefaceAsset || {};
  asset.generator = `${asset.generator || ''}; SpaceFace finalize_hitch_polish_v7.mjs`;
  asset.extras = {
    ...(asset.extras || {}),
    spacefaceAsset: {
      ...sourceMetadata,
      contractVersion: 2,
      packet: PACKET,
      generationFingerprint: build.generationFingerprint,
      textureCompression: 'KTX2/BasisU+mips',
      meshCompression: 'EXT_meshopt_compression',
      factorOnlyMaterials: [...FACTOR_ONLY_MATERIALS].sort(),
      wiringStatus: 'isolated_candidate_no_promote',
      acceptanceClaim: false,
      lod: `lod${lod}`,
    },
  };
  for (const node of document.getRoot().listNodes()) {
    const expected = REQUIRED_SOCKETS[node.getName()];
    if (!expected) continue;
    node.setTranslation(expected.position);
    node.setExtras({
      ...(node.getExtras() || {}),
      socket: true,
      spaceface: { socket: true, role: expected.role, forward: expected.forward },
    });
  }
}

async function optimizeOne(io, source, target, lod, build) {
  const document = await io.read(source);
  splitTextureSlots(document);
  stamp(document, lod, build);
  await document.transform(
    ktx2({
      slots: /^(baseColorTexture|emissiveTexture)$/,
      imageDecoder: decodeImage,
      isUASTC: false,
      qualityLevel: 224,
      compressionLevel: 4,
      generateMipmap: true,
      needSupercompression: false,
      isPerceptual: true,
      isSetKTX2SRGBTransferFunc: true,
    }),
    ktx2({
      slots: /^(normalTexture|clearcoatNormalTexture)$/,
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
      isUASTC: false,
      qualityLevel: 255,
      compressionLevel: 5,
      generateMipmap: true,
      needSupercompression: false,
      isPerceptual: false,
      isSetKTX2SRGBTransferFunc: false,
    }),
    meshopt({ encoder: MeshoptEncoder, ...RELEASE_MESHOPT_OPTIONS }),
  );
  await io.write(target, document);
}

function validateRelease(path, sourceMetrics, build, lod) {
  const parsed = raw(path);
  const metadata = rootMetadata(parsed.doc);
  if (metadata?.generationFingerprint !== build.generationFingerprint) {
    throw new Error(`release generation fingerprint mismatch LOD${lod}`);
  }
  if (metadata?.acceptanceClaim !== false || metadata?.wiringStatus !== 'isolated_candidate_no_promote') {
    throw new Error(`release candidate overclaims acceptance LOD${lod}`);
  }
  const meshoptViews = (parsed.doc.bufferViews || []).filter(
    (view) => view.extensions?.EXT_meshopt_compression,
  ).length;
  if (meshoptViews === 0) throw new Error(`release lacks Meshopt LOD${lod}`);
  const images = parsed.doc.images || [];
  if (images.some((image) => !/ktx2/i.test(image.mimeType || ''))) {
    throw new Error(`release contains non-KTX2 images LOD${lod}`);
  }
  const ktx2MaterialRoles = validateKtx2MaterialRolePayloads(
    parsed.doc,
    parsed.bin,
    `Hitch V7 staged release LOD${lod}`,
  );
  const triangles = visibleTriangles(parsed.doc);
  const draws = visibleDraws(parsed.doc);
  if (triangles !== sourceMetrics.triangles || draws !== sourceMetrics.draws) {
    throw new Error(`release structure drift LOD${lod}`);
  }
  validateSockets(parsed.doc);
  const usedMaterials = validateMaterialCoverage(parsed.doc);
  return {
    path: rel(path),
    bytes: statSync(path).size,
    sha256: sha256(path),
    triangles,
    draws,
    meshoptViews,
    imageCount: images.length,
    allImagesKtx2: true,
    ktx2MaterialRoles,
    identityMaterial: usedMaterials.includes('Material_V6_MarkingIvory'),
  };
}

async function main() {
  if (!existsSync(BUILD_REPORT)) throw new Error('V7 build report missing');
  const build = JSON.parse(readFileSync(BUILD_REPORT, 'utf8'));
  if (build.status !== 'complete' || build.candidateOnly !== true || build.livePromotion !== false) {
    throw new Error(`V7 build is not a complete isolated candidate: ${build.status}`);
  }
  if (sha256(resolve(FAMILY, build.productionBlend)) !== build.productionBlendSha256) {
    throw new Error('V7 production blend hash does not match build receipt');
  }
  for (const [path, expected] of Object.entries(build.generation?.scriptSha256 || {})) {
    if (sha256(resolve(FAMILY, path)) !== expected) throw new Error(`stale build script hash: ${path}`);
  }
  if (build.generationFingerprint !== build.generation?.generationFingerprint) {
    throw new Error('build generation fingerprint disagreement');
  }

  writeFileSync(FINALIZE_REPORT, `${JSON.stringify({
    schema: 'spaceface.hitchPolishV7.finalize.v1',
    status: 'building',
    generationFingerprint: build.generationFingerprint,
    finalizer: { path: rel(SCRIPT), sha256: sha256(SCRIPT) },
    candidateOnly: true,
    livePromotion: false,
  }, null, 2)}\n`);

  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });

  const sourceReports = [];
  for (let lod = 0; lod < 3; lod += 1) {
    if (!existsSync(SOURCE[lod])) throw new Error(`missing V7 source LOD${lod}`);
    if (sha256(SOURCE[lod]) !== build.lods[lod].sha256) throw new Error(`source hash mismatch LOD${lod}`);
    const parsed = raw(SOURCE[lod]);
    const metadata = rootMetadata(parsed.doc);
    if (metadata?.generationFingerprint !== build.generationFingerprint) {
      throw new Error(`source generation fingerprint mismatch LOD${lod}`);
    }
    validateSockets(parsed.doc);
    const usedMaterials = validateMaterialCoverage(parsed.doc);
    validateSourceTextureRoleCoverage(parsed.doc, `Hitch V7 LOD${lod}`);
    const textureAudit = await auditEmbeddedTextureChannels(
      { gltf: parsed.doc, binary: parsed.bin },
      `Hitch V7 LOD${lod}`,
    );
    if (textureAudit.summary.errors) {
      throw new Error(
        `texture-channel audit errors LOD${lod}: `
        + textureAudit.findings
          .filter((finding) => finding.severity === 'error')
          .map((finding) => finding.code)
          .join(', '),
      );
    }
    const vertexContract = validateMappedVertexContracts(await io.read(SOURCE[lod]), lod);
    const collision = collisionFingerprint(parsed);
    const triangles = visibleTriangles(parsed.doc);
    const [minimumTriangles, maximumTriangles] = TRIANGLE_RANGES[lod];
    if (triangles < minimumTriangles || triangles > maximumTriangles) {
      throw new Error(
        `source triangle count outside admitted range LOD${lod}: `
        + `${triangles} not in ${minimumTriangles}-${maximumTriangles}`,
      );
    }
    sourceReports.push({
      lod,
      path: rel(SOURCE[lod]),
      bytes: statSync(SOURCE[lod]).size,
      sha256: sha256(SOURCE[lod]),
      triangles,
      draws: visibleDraws(parsed.doc),
      collisionFingerprint: collision,
      identityMaterial: usedMaterials.includes('Material_V6_MarkingIvory'),
      textureAudit: {
        summary: textureAudit.summary,
        findings: textureAudit.findings,
      },
      vertexContract,
    });
  }
  if (!(sourceReports[0].triangles > sourceReports[1].triangles
      && sourceReports[1].triangles > sourceReports[2].triangles)) {
    throw new Error(`LOD triangle order invalid: ${sourceReports.map((row) => row.triangles)}`);
  }
  if (new Set(sourceReports.map((row) => row.collisionFingerprint)).size !== 1) {
    throw new Error(`collision fingerprint must match across LODs: ${sourceReports.map((row) => row.collisionFingerprint)}`);
  }

  const staging = mkdtempSync(join(tmpdir(), 'spaceface-hitch-v7-finalize-'));
  try {
    const staged = [];
    for (let lod = 0; lod < 3; lod += 1) {
      const target = resolve(staging, `kestrel_borrowed_time_v4_lod${lod}.glb`);
      await optimizeOne(io, SOURCE[lod], target, lod, build);
      staged.push(target);
    }
    const releaseReports = [];
    for (let lod = 0; lod < 3; lod += 1) {
      const release = validateRelease(staged[lod], sourceReports[lod], build, lod);
      release.vertexContract = validateMappedVertexContracts(await io.read(staged[lod]), lod);
      releaseReports.push(release);
    }
    for (let lod = 0; lod < 3; lod += 1) {
      mkdirSync(dirname(RELEASE[lod]), { recursive: true });
      if (existsSync(RELEASE[lod])) unlinkSync(RELEASE[lod]);
      renameSync(staged[lod], RELEASE[lod]);
      releaseReports[lod].path = rel(RELEASE[lod]);
    }
    const result = {
      schema: 'spaceface.hitchPolishV7.finalize.v1',
      status: 'complete',
      packet: PACKET,
      generationFingerprint: build.generationFingerprint,
      finalizer: { path: rel(SCRIPT), sha256: sha256(SCRIPT) },
      sources: sourceReports,
      releases: releaseReports,
      browserCapture: { value: null, requiresHeaded: true },
      electronCapture: { value: null, requiresHeaded: true },
      runtimePerformance: { value: null, requiresHeaded: true },
      independentG7: { value: null, requiresHuman: true },
      candidateOnly: true,
      livePromotion: false,
    };
    const stagedReport = resolve(staging, 'hitch_polish_v7_finalize_report.json');
    writeFileSync(stagedReport, `${JSON.stringify(result, null, 2)}\n`);
    renameSync(stagedReport, FINALIZE_REPORT);
    process.stdout.write(`HITCH_POLISH_V7_FINALIZE=${JSON.stringify(result)}\n`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
