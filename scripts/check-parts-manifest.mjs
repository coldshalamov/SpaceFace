// SG-04 prefab-library manifest validator.
//
// This checks the committed modular ship-part GLBs against assets/ships/parts/parts_manifest.json.
// Procedurally-generated parts embed PNG textures; authored hulls (GR-9) embed KTX2/BasisU textures
// per the spacefaceAsset contract in assetLoader.js. Both texture pipelines are accepted here.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { collectEngineDriveSurface } from '../tools/art/lib/engineDriveSurfaceValidation.mjs';
import {
  allowsFactorOnlySource,
  isBlenderAuthoringMethod,
} from '../tools/art/lib/partProvenance.mjs';
import { validateSourceTextureRoleCoverage } from '../tools/art/lib/sourceTextureRoleValidation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART_ROOT = resolve(ROOT, 'assets/ships/parts');
const MANIFEST_PATH = resolve(PART_ROOT, 'parts_manifest.json');
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const EPS = 0.035;

let ok = 0;
let fail = 0;

function check(label, condition, detail = '') {
  if (condition) ok++;
  else {
    fail++;
    console.log(`FAIL  ${label}${detail ? '  -  ' + detail : ''}`);
  }
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const AUTHORING_PATH = resolve(ROOT, 'assets/ships/parts/blender/authoring.json');
const placeAuthoring = existsSync(AUTHORING_PATH)
  ? JSON.parse(readFileSync(AUTHORING_PATH, 'utf8'))
  : null;
const placeAuthoringEntries = placeAuthoring?.entries ?? {};

check('manifest schemaVersion pinned', manifest.schemaVersion === 1, `got ${manifest.schemaVersion}`);
check('manifest libraryId pinned', manifest.libraryId === 'SF_SHIP_PARTS_V1', `got ${manifest.libraryId}`);
check('manifest declares +X/+Y/+Z metre coordinates',
  manifest.coordinateSystem?.forward === '+X'
  && manifest.coordinateSystem?.up === '+Y'
  && manifest.coordinateSystem?.starboard === '+Z'
  && manifest.coordinateSystem?.unit === 'metre');
check('manifest declares texture contract',
  manifest.textureContract?.baseColor === 'sRGB'
  && manifest.textureContract?.normal === 'tangent OpenGL green-up'
  && manifest.textureContract?.orm === 'R=AO G=roughness B=metallic'
  && manifest.textureContract?.resolution === 1024);
check('manifest declares part budgets',
  Array.isArray(manifest.budgets?.trianglesPerPart)
  && manifest.budgets.trianglesPerPart.length === 2
  && Number.isFinite(manifest.budgets.maxBytesPerPart));
check('manifest has parts', Array.isArray(manifest.parts) && manifest.parts.length >= 20, `count=${manifest.parts && manifest.parts.length}`);

const manifestFiles = new Set();
const manifestIds = new Set();
const categoryCounts = new Map();
const filesByCategory = new Map();
const extrasByFile = new Map();
const triMin = manifest.budgets.trianglesPerPart[0];
const triMax = manifest.budgets.trianglesPerPart[1];
const maxBytes = manifest.budgets.maxBytesPerPart;
const runtimeSlots = manifest.runtimeSlots || {};
const requiredSlots = ['hull', 'cockpit', 'engine', 'fin', 'weapon', 'greeble', 'gear', 'pod', 'place'];
for (const slot of requiredSlots) {
  check(`manifest runtimeSlots declares ${slot}`, Array.isArray(runtimeSlots[slot]) && runtimeSlots[slot].length > 0,
    `count=${runtimeSlots[slot] && runtimeSlots[slot].length}`);
}
const runtimeFiles = new Set(Object.values(runtimeSlots).flat());

for (const part of manifest.parts || []) {
  const label = `${part.id || '<missing-id>'}`;
  check(`${label}: unique id`, typeof part.id === 'string' && part.id.length > 0 && !manifestIds.has(part.id));
  manifestIds.add(part.id);
  check(`${label}: unique file`, typeof part.file === 'string' && part.file.endsWith('.glb') && !part.file.includes('..') && !manifestFiles.has(part.file), `file=${part.file}`);
  manifestFiles.add(part.file);
  categoryCounts.set(part.category, (categoryCounts.get(part.category) || 0) + 1);
  if (!filesByCategory.has(part.category)) filesByCategory.set(part.category, new Set());
  filesByCategory.get(part.category).add(part.file);

  // Blocked assets are explicitly-acknowledged broken exports (e.g. accessory-only wholeships
  // missing their Material_Hull body). They are tracked in the manifest so they cannot hide as
  // ambiguous runtimeSlots entries, but they are NOT validated against the live asset contract —
  // they fail it by definition. check-asset-status.mjs separately enforces they stay unreached
  // from runtime code. A blocked entry must declare its reason.
  if (part.status === 'blocked') {
    check(`${label}: blocked entry has statusNote`, typeof part.statusNote === 'string' && part.statusNote.length > 20, `statusNote=${part.statusNote && part.statusNote.slice(0, 60)}`);
    check(`${label}: blocked entry has file path`, typeof part.file === 'string' && part.file.startsWith(`${part.category}/`), `category=${part.category} file=${part.file}`);
    continue;
  }

  check(`${label}: file path matches category`, typeof part.file === 'string' && part.file.startsWith(`${part.category}/`), `category=${part.category} file=${part.file}`);
  check(`${label}: priority is authored`, ['P0', 'P1', 'P2'].includes(part.priority), `priority=${part.priority}`);
  check(`${label}: mount origin`, part.mount === 'origin', `mount=${part.mount}`);
  check(`${label}: texture size matches manifest contract`, part.textureSize === manifest.textureContract.resolution, `textureSize=${part.textureSize}`);
  check(`${label}: triangle budget`, part.tris >= triMin && part.tris <= triMax, `tris=${part.tris}`);
  check(`${label}: byte budget`, part.bytes > 0 && part.bytes <= maxBytes, `bytes=${part.bytes}`);
  check(`${label}: bounds vectors declared`, vector3(part.bounds?.min) && vector3(part.bounds?.max) && vector3(part.bounds?.dimensionsM));

  check(`${label}: wired to a runtime slot`, runtimeFiles.has(part.file), `file=${part.file}`);

  let parsed = null;
  const abs = resolve(PART_ROOT, part.file);
  try {
    parsed = parseGlb(readFileSync(abs));
    ok++;
  } catch (error) {
    fail++;
    console.log(`FAIL  ${label}: GLB parses  -  ${error.message}`);
    continue;
  }

  const { gltf, bytes } = parsed;
  const extras = gltf.asset?.extras || {};
  extrasByFile.set(part.file, extras);
  const metrics = collectMetrics(gltf, parsed.binary);
  check(`${label}: glTF 2 asset`, gltf.asset?.version === '2.0', `version=${gltf.asset?.version}`);
  const authoringEntry = placeAuthoringEntries[part.id];
  const generator = String(gltf.asset?.generator || '');
  if (authoringEntry?.method === 'blender_mcp') {
    check(`${label}: Blender-authored generator`, generator.includes('author_place_archetype.py'), `generator=${generator}`);
    if (authoringEntry.blend_path) {
      check(`${label}: Blender source exists`, existsSync(resolve(ROOT, authoringEntry.blend_path)), `blend=${authoringEntry.blend_path}`);
    }
    if (authoringEntry.concept_path) {
      check(`${label}: concept reference exists`, existsSync(resolve(ROOT, authoringEntry.concept_path)), `concept=${authoringEntry.concept_path}`);
    }
    const minTris = authoringEntry.min_tris ?? placeAuthoring?.min_tris_blender_mcp ?? 1500;
    check(`${label}: Blender tri floor`, part.tris >= minTris, `tris=${part.tris} min=${minTris}`);
  } else if (authoringEntry?.method === 'blender_generic') {
    check(`${label}: generic Blender export/finalize provenance`,
      generator.includes('export_sprint_part.py')
      && generator.includes('spaceface_export.py')
      && generator.includes('finalize_part.mjs'),
      `generator=${generator}`);
    check(`${label}: generic Blender source exists`,
      typeof authoringEntry.blend_path === 'string' && existsSync(resolve(ROOT, authoringEntry.blend_path)),
      `blend=${authoringEntry.blend_path}`);
    check(`${label}: generic Blender exporter exists`,
      typeof authoringEntry.exporter_path === 'string' && existsSync(resolve(ROOT, authoringEntry.exporter_path)),
      `exporter=${authoringEntry.exporter_path}`);
    check(`${label}: generic Blender texture role owner`,
      authoringEntry.texture_role_owner === 'finalizer-v1',
      `owner=${authoringEntry.texture_role_owner}`);
    if (Number.isFinite(authoringEntry.min_tris)) {
      check(`${label}: generic Blender tri floor`, part.tris >= authoringEntry.min_tris,
        `tris=${part.tris} min=${authoringEntry.min_tris}`);
    }
  } else if (authoringEntry?.method === 'procedural_fallback') {
    check(`${label}: procedural fallback generator`, generator.includes('generate_ship_parts_library.py'), `generator=${generator}`);
    const triBand = placeAuthoring?.procedural_tri_band_max ?? 1000;
    check(`${label}: procedural tri band`, part.tris <= triBand, `tris=${part.tris} max=${triBand}`);
  } else {
    check(`${label}: generated by SpaceFace tool`, generator.includes('generate_ship_parts_library.py'), `generator=${generator}`);
  }
  check(`${label}: no unsupported mesh compression required`, !(gltf.extensionsRequired || []).some((name) =>
    name === 'KHR_draco_mesh_compression' || name === 'EXT_meshopt_compression'));
  check(`${label}: bytes match manifest`, bytes.length === part.bytes, `glb=${bytes.length} manifest=${part.bytes}`);
  check(`${label}: triangles match manifest`, metrics.triangles === part.tris, `glb=${metrics.triangles} manifest=${part.tris}`);
  check(`${label}: extras part id`, extras.partId === part.id, `extras=${extras.partId}`);
  check(`${label}: extras category`, extras.category === part.category, `extras=${extras.category}`);
  check(`${label}: extras priority`, extras.priority === part.priority, `extras=${extras.priority}`);
  check(`${label}: extras triangle count`, extras.triangleCount === part.tris, `extras=${extras.triangleCount}`);
  check(`${label}: extras texture size`, extras.textureSize === part.textureSize, `extras=${extras.textureSize}`);
  check(`${label}: extras coordinate contract`,
    extras.forwardAxis === '+X' && extras.upAxis === '+Y' && extras.starboardAxis === '+Z' && extras.unit === 'metre');
  // Procedural parts embed PNG textures; authored hulls embed KTX2/BasisU (KHR_texture_basisu) per
  // the spacefaceAsset texture contract. Both are valid: the assertion accepts either, requiring only
  // that all images share one format and that KTX2 images declare the basisu extension on every texture.
  const materialNames = new Set((gltf.materials || []).map((material) => material.name).filter(Boolean));
  const embeddedImages = gltf.images || [];
  const embeddedPng = embeddedImages.length >= 3 && embeddedImages.every((image) =>
    image.bufferView != null && !image.uri && (!image.mimeType || image.mimeType === 'image/png'));
  const embeddedKtx2 = embeddedImages.length >= 3 && embeddedImages.every((image) =>
    image.bufferView != null && !image.uri && image.mimeType === 'image/ktx2')
    && (gltf.textures || []).every((texture) => texture.extensions?.KHR_texture_basisu);
  const factorOnlyBlender = allowsFactorOnlySource(authoringEntry?.method, authoringEntry)
    && embeddedImages.length === 0
    && materialNames.size >= 1
    && (gltf.materials || []).every((material) => {
      const pbr = material.pbrMetallicRoughness || {};
      return Array.isArray(pbr.baseColorFactor) && pbr.baseColorFactor.length === 4;
    });
  const textureRoleContractVersion = extras.sourceProvenance?.textureRoleContractVersion;
  const textureRoleMode = extras.sourceProvenance?.textureRoleMode;
  if (textureRoleContractVersion != null) {
    check(`${label}: texture role contract version supported`, textureRoleContractVersion === 1,
      `version=${textureRoleContractVersion}`);
  }
  const strictTextureRoles = textureRoleContractVersion === 1;
  let textureRoleError = null;
  if (strictTextureRoles && textureRoleMode === 'bound-base-normal-orm' && (embeddedPng || embeddedKtx2)) {
    try {
      validateSourceTextureRoleCoverage(gltf, label);
    } catch (error) {
      textureRoleError = error.message;
    }
  }
  const strictTextureContractOk = textureRoleMode === 'factor-only'
    ? factorOnlyBlender
    : textureRoleMode === 'bound-base-normal-orm'
      && (embeddedPng || embeddedKtx2)
      && textureRoleError == null;
  const legacyTextureContractOk = embeddedPng || embeddedKtx2 || factorOnlyBlender;
  check(`${label}: embedded PNG or KTX2 textures${strictTextureRoles ? ' with bound roles' : ''}`,
    strictTextureRoles ? strictTextureContractOk : legacyTextureContractOk,
    factorOnlyBlender
      ? 'factor-only Blender materials'
      : (textureRoleError || `images=${embeddedImages.length} roleContract=${textureRoleContractVersion || 'legacy'}/${textureRoleMode || 'legacy'}`));
  const contractMaterials = new Set(Object.values(manifest.materialContract || {}));
  const extraMaterials = [...materialNames].filter((name) => !contractMaterials.has(name));
  check(`${label}: materials are contract-only (<=4)`, materialNames.size <= 4 && extraMaterials.length === 0,
    `materials=${[...materialNames].join(',')} extra=${extraMaterials.join(',')}`);
  for (const [role, materialName] of Object.entries(part.tintable || {})) {
    check(`${label}: tint role ${role} is in manifest material contract`, Object.values(manifest.materialContract || {}).includes(materialName), `material=${materialName}`);
    check(`${label}: tint material ${materialName} exists in GLB`, materialNames.has(materialName), `materials=${[...materialNames].join(',')}`);
  }

  for (const hook of part.hooks || []) {
    check(`${label}: hook ${hook} exists`, metrics.nodeNames.has(hook));
  }
  for (const socket of part.sockets || []) {
    check(`${label}: socket ${socket} exists`, metrics.nodeNames.has(socket));
  }
  if (part.category === 'engines') {
    const engineSurface = collectEngineDriveSurface(gltf);
    const declaredHooks = new Set(part.hooks || []);
    const twinLayout = ['core', 'fan', 'plume'].every((role) =>
      declaredHooks.has(`HOOK_DRIVE_${role.toUpperCase()}_P`)
      && declaredHooks.has(`HOOK_DRIVE_${role.toUpperCase()}_S`));
    if (twinLayout) {
      for (const role of ['core', 'fan', 'plume']) {
        for (const suffix of ['P', 'S']) {
          const hook = `HOOK_DRIVE_${role.toUpperCase()}_${suffix}`;
          check(`${label}: declares twin ${hook}`, declaredHooks.has(hook), `hooks=${[...declaredHooks].join(',')}`);
          check(`${label}: twin hook ${hook} exists`, metrics.nodeNames.has(hook));
        }
        const renderCount = engineSurface.driveRenderableCounts[role] || 0;
        check(`${label}: exposes paired renderables for ${role}`, renderCount === 2,
          `counts=${JSON.stringify(engineSurface.driveRenderableCounts)} nodes=${engineSurface.driveRenderableNodes.join(',')}`);
      }
    } else {
      for (const role of ['core', 'fan', 'plume']) {
        const hook = `HOOK_DRIVE_${role.toUpperCase()}`;
        const declared = declaredHooks.has(hook);
        const renderCount = engineSurface.driveRenderableCounts[role] || 0;
        check(`${label}: declares standard ${hook}`, declared, `hooks=${[...declaredHooks].join(',')}`);
        check(`${label}: exposes exactly one renderable ${hook}`, renderCount === 1,
          `counts=${JSON.stringify(engineSurface.driveRenderableCounts)} nodes=${engineSurface.driveRenderableNodes.join(',')}`);
      }
    }
    check(`${label}: exposes at least one LOD0/static engine render mesh`, engineSurface.staticRenderableCount > 0,
      `staticRenderableCount=${engineSurface.staticRenderableCount}`);
  }
  const undeclaredSockets = [...metrics.nodeNames].filter((name) => name.startsWith('SOCKET_') && !(part.sockets || []).includes(name));
  check(`${label}: all GLB sockets declared`, undeclaredSockets.length === 0, `undeclared=${undeclaredSockets.join(',')}`);

  const dimensions = dimensionsFromBounds(metrics.bounds);
  check(`${label}: computed dimensions match manifest`, sameVec(dimensions, part.bounds.dimensionsM),
    `computed=${dimensions.map((v) => v.toFixed(3)).join(',')} manifest=${part.bounds.dimensionsM.join(',')}`);
  check(`${label}: extras dimensions match manifest`, sameVec(extras.boundsDimensionsM, part.bounds.dimensionsM),
    `extras=${(extras.boundsDimensionsM || []).join(',')} manifest=${part.bounds.dimensionsM.join(',')}`);
}

const diskGlbFiles = collectGlbFiles(PART_ROOT);
// Whole-ship bodies (wholeships/*.glb) are authored single-mesh ships wired through the hull slot,
// not catalog parts — they have no parts_manifest entry and use the lenient legacy loader path.
const isWholeShipFile = (f) => String(f).startsWith('wholeships/');
for (const file of diskGlbFiles) {
  if (isWholeShipFile(file)) continue;
  check(`committed GLB ${file} is declared in manifest`, manifestFiles.has(file));
}
for (const file of manifestFiles) {
  check(`manifest GLB ${file} exists on disk`, diskGlbFiles.has(file));
}
for (const file of runtimeFiles) {
  check(`runtime slot GLB ${file} exists on disk`, diskGlbFiles.has(file));
}

for (const [category, count] of categoryCounts) {
  check(`category ${category} has at least one part`, count > 0);
}

for (const [slot, files] of Object.entries(runtimeSlots)) {
  for (const file of files) {
    if (isWholeShipFile(file)) continue; // authored whole-ship body, not a catalog part
    check(`runtime slot ${slot} file is declared in manifest`, manifestFiles.has(file), `file=${file}`);
    const category = categoryForSlot(slot);
    check(`runtime slot ${slot} file category matches`, !category || filesByCategory.get(category)?.has(file), `file=${file}`);
    const extras = extrasByFile.get(file);
    check(`runtime slot ${slot} file has loadable metadata`,
      hasRuntimeAssetMetadata(extras, slot), `file=${file}`);
  }
}

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);

function parseGlb(bytes) {
  if (bytes.length < 20) throw new Error('file too small');
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) throw new Error('bad magic');
  if (bytes.readUInt32LE(4) !== GLB_VERSION) throw new Error('unsupported glTF version');
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('header length does not match file size');

  let off = 12;
  let gltf = null;
  let binary = null;
  while (off < bytes.length) {
    const chunkLength = bytes.readUInt32LE(off);
    const chunkType = bytes.readUInt32LE(off + 4);
    const start = off + 8;
    const end = start + chunkLength;
    if (end > bytes.length) throw new Error('chunk overruns file');
    if (chunkType === CHUNK_JSON) {
      gltf = JSON.parse(bytes.subarray(start, end).toString('utf8').replace(/\0+$/, '').trim());
    } else if (chunkType === CHUNK_BIN) {
      binary = bytes.subarray(start, end);
    }
    off = end;
  }
  if (!gltf) throw new Error('missing JSON chunk');
  if (!binary) throw new Error('missing BIN chunk');
  return { bytes, gltf, binary };
}

function collectMetrics(gltf, binary) {
  const triangles = (gltf.meshes || []).reduce((sum, mesh) => {
    return sum + (mesh.primitives || []).reduce((meshSum, primitive) => {
      if ((primitive.mode ?? 4) !== 4) return meshSum;
      const indexAccessor = gltf.accessors?.[primitive.indices];
      const positionAccessor = gltf.accessors?.[primitive.attributes?.POSITION];
      const count = indexAccessor?.count ?? positionAccessor?.count ?? 0;
      return meshSum + Math.floor(count / 3);
    }, 0);
  }, 0);
  const nodeNames = new Set((gltf.nodes || []).map((node) => node.name).filter(Boolean));
  return {
    triangles,
    nodeNames,
    bounds: collectWorldBounds(gltf, binary),
  };
}

function collectWorldBounds(gltf, binary) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const identity = new THREE.Matrix4();
  const rootNodes = gltf.scenes?.[gltf.scene || 0]?.nodes || gltf.scenes?.[0]?.nodes || [];
  for (const nodeIndex of rootNodes) visitNode(gltf, binary, nodeIndex, identity, min, max);
  return { min: min.toArray(), max: max.toArray() };
}

function visitNode(gltf, binary, nodeIndex, parentMatrix, outMin, outMax) {
  const node = gltf.nodes?.[nodeIndex];
  if (!node) return;
  const world = parentMatrix.clone().multiply(nodeMatrix(node));
  if (node.mesh != null) {
    const mesh = gltf.meshes?.[node.mesh];
    for (const primitive of mesh?.primitives || []) {
      const accessor = gltf.accessors?.[primitive.attributes?.POSITION];
      if (!vector3(accessor?.min) || !vector3(accessor?.max)) continue;
      if (!expandByAccessorVertices(gltf, binary, primitive.attributes.POSITION, world, outMin, outMax)) {
        expandByAccessorBounds(accessor.min, accessor.max, world, outMin, outMax);
      }
    }
  }
  for (const child of node.children || []) visitNode(gltf, binary, child, world, outMin, outMax);
}

function nodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return new THREE.Matrix4().fromArray(node.matrix);
  const position = new THREE.Vector3().fromArray(node.translation || [0, 0, 0]);
  const quaternion = new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]);
  const scale = new THREE.Vector3().fromArray(node.scale || [1, 1, 1]);
  return new THREE.Matrix4().compose(position, quaternion, scale);
}

function expandByAccessorBounds(min, max, matrix, outMin, outMax) {
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const point = new THREE.Vector3(x, y, z).applyMatrix4(matrix);
        outMin.min(point);
        outMax.max(point);
      }
    }
  }
}

function expandByAccessorVertices(gltf, binary, accessorIndex, matrix, outMin, outMax) {
  const accessor = gltf.accessors?.[accessorIndex];
  const view = gltf.bufferViews?.[accessor?.bufferView];
  if (!accessor || !view || accessor.type !== 'VEC3' || accessor.componentType !== 5126 || accessor.sparse) return false;
  const stride = view.byteStride || 12;
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const point = new THREE.Vector3();
  for (let i = 0; i < accessor.count; i++) {
    const off = start + i * stride;
    point.set(
      data.getFloat32(off, true),
      data.getFloat32(off + 4, true),
      data.getFloat32(off + 8, true),
    ).applyMatrix4(matrix);
    outMin.min(point);
    outMax.max(point);
  }
  return true;
}

function dimensionsFromBounds(bounds) {
  if (!vector3(bounds.min) || !vector3(bounds.max)) return [NaN, NaN, NaN];
  return bounds.max.map((value, index) => value - bounds.min[index]);
}

function vector3(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function sameVec(actual, expected) {
  return vector3(actual) && vector3(expected) && actual.every((value, index) => Math.abs(value - expected[index]) <= EPS);
}

function collectGlbFiles(dir, prefix = '') {
  const files = new Set();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefix}${entry.name}`;
    const abs = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      for (const child of collectGlbFiles(abs, `${rel}/`)) files.add(child);
    } else if (entry.isFile() && entry.name.endsWith('.glb')) {
      files.add(rel);
    }
  }
  return files;
}

function categoryForSlot(slot) {
  if (slot === 'hull') return 'hulls';
  if (slot === 'cockpit') return 'cockpits';
  if (slot === 'engine') return 'engines';
  if (slot === 'fin') return 'fins';
  if (slot === 'weapon') return 'weapons';
  if (slot === 'greeble') return 'greebles';
  if (slot === 'gear') return 'gear';
  if (slot === 'pod') return 'pods';
  if (slot === 'place') return 'places';
  return null;
}

function hasRuntimeAssetMetadata(extras, slot) {
  if (!extras || typeof extras !== 'object') return false;
  const sf = extras.spacefaceAsset;
  if (sf && sf.contractVersion === 1 && sf.slot === slot && typeof sf.assetId === 'string') return true;
  return typeof extras.assetId === 'string'
    && categoryForSlot(slot) === extras.category
    && extras.forwardAxis === '+X'
    && extras.upAxis === '+Y'
    && extras.starboardAxis === '+Z'
    && (extras.unit === 'metre' || extras.unit === 'meter');
}
