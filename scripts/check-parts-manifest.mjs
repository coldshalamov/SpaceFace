// SG-04 prefab-library manifest validator.
//
// This checks the committed modular ship-part GLBs against assets/ships/parts/parts_manifest.json.
// Procedurally-generated parts embed PNG textures; authored hulls (GR-9) embed KTX2/BasisU textures
// per the spacefaceAsset contract in assetLoader.js. Both texture pipelines are accepted here.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { collectEngineDriveSurface, validateEngineDriveSurface } from '../tools/art/lib/engineDriveSurfaceValidation.mjs';
import {
  allowsFactorOnlySource,
  isBlenderAuthoringMethod,
} from '../tools/art/lib/partProvenance.mjs';
import { validateSourceTextureRoleCoverage } from '../tools/art/lib/sourceTextureRoleValidation.mjs';
import {
  collectLodTriangleCounts,
  resolveTriangleMetric,
} from './lib/partsManifestMetrics.mjs';
import {
  decodedAccessorBounds,
  manifestPartPathMatchesCategory,
  resolveManifestAssetMetadata,
} from './lib/partsManifestAssetContract.mjs';
import { isPublishedPartsSourceFile } from './lib/partsManifestScope.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART_ROOT = resolve(ROOT, 'assets/ships/parts');
const MANIFEST_PATH = resolve(PART_ROOT, 'parts_manifest.json');
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const EPS = 0.035;
const SUPPORTED_REQUIRED_MESH_COMPRESSION = new Set([
  'KHR_draco_mesh_compression',
  'EXT_meshopt_compression',
  'KHR_meshopt_compression',
]);

let ok = 0;
let fail = 0;
let diagnostic = 0;

function check(label, condition, detail = '') {
  if (condition) ok++;
  else {
    fail++;
    console.log(`FAIL  ${label}${detail ? '  -  ' + detail : ''}`);
  }
}

function diagnose(label, condition, detail = '') {
  if (condition) return;
  diagnostic++;
  console.log(`DIAG  ${label}${detail ? '  -  ' + detail : ''}`);
}

function finitePositive(value) {
  return Number.isFinite(value) && value > 0;
}

function finiteRange(value) {
  return Array.isArray(value)
    && value.length === 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && value[0] <= value[1]
    ? value
    : null;
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
  && finitePositive(manifest.textureContract?.resolution));
// Historical library-wide budgets remain useful profiling context, but they are not loadability or
// quality contracts. Assets outside these ranges proceed to measured runtime and visual review.
const partTriProfile = finiteRange(manifest.budgets?.trianglesPerPart);
const landmarkTriProfile = finiteRange(manifest.budgets?.trianglesPerLandmark);
check('manifest has parts', Array.isArray(manifest.parts) && manifest.parts.length >= 20, `count=${manifest.parts && manifest.parts.length}`);

const manifestFiles = new Set();
const manifestIds = new Set();
const categoryCounts = new Map();
const filesByCategory = new Map();
const extrasByFile = new Map();
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
    check(`${label}: blocked entry has file path`, manifestPartPathMatchesCategory(part), `category=${part.category} file=${part.file}`);
    continue;
  }

  check(`${label}: file path matches category`, manifestPartPathMatchesCategory(part), `category=${part.category} file=${part.file}`);
  check(`${label}: priority is authored`, ['P0', 'P1', 'P2'].includes(part.priority), `priority=${part.priority}`);
  check(`${label}: mount origin`, part.mount === 'origin', `mount=${part.mount}`);
  const landmark = part.budgetClass === 'landmark';
  const expectedTextureSize = landmark
    ? manifest.budgets?.maxTextureEdgePerLandmark
    : manifest.textureContract?.resolution;
  const triProfile = landmark ? landmarkTriProfile : partTriProfile;
  check(`${label}: texture size is finite and positive`, finitePositive(part.textureSize),
    `textureSize=${part.textureSize}`);
  check(`${label}: triangle count is finite and non-empty`, finitePositive(part.tris), `tris=${part.tris}`);
  check(`${label}: byte count is finite and non-empty`, finitePositive(part.bytes), `bytes=${part.bytes}`);
  diagnose(`${label}: profiling class is outside known historical labels`, part.budgetClass == null || landmark,
    `budgetClass=${part.budgetClass}`);
  if (finitePositive(expectedTextureSize)) {
    diagnose(`${label}: texture profile differs`, part.textureSize === expectedTextureSize,
      `textureSize=${part.textureSize} profile=${expectedTextureSize}`);
  }
  if (triProfile) {
    diagnose(`${label}: triangle profile differs`, part.tris >= triProfile[0] && part.tris <= triProfile[1],
      `tris=${part.tris} profile=${triProfile.join('..')} class=${part.budgetClass || 'part'}`);
  }
  const productionWholeShip = part.category === 'wholeships'
    && placeAuthoringEntries[part.id]?.production_whole_ship === true;
  const byteProfile = productionWholeShip
    ? manifest.budgets?.maxBytesPerWholeShip
    : landmark ? manifest.budgets?.maxBytesPerLandmark : manifest.budgets?.maxBytesPerPart;
  if (finitePositive(byteProfile)) {
    diagnose(`${label}: byte profile exceeded`, part.bytes <= byteProfile,
      `bytes=${part.bytes} profileMax=${byteProfile}`);
  }
  check(`${label}: bounds vectors declared`, vector3(part.bounds?.min) && vector3(part.bounds?.max) && vector3(part.bounds?.dimensionsM));

  // runtimeSlots is a bounded preload/catalog declaration, not an inverse runtime inventory.
  // Place reachability is resolved by partsLibrary's place maps and checked by
  // check-atlas-integrity.mjs; keep the forward runtimeSlots -> manifest/disk checks below.

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
  const extras = resolveManifestAssetMetadata(gltf);
  extrasByFile.set(part.file, extras);
  const metrics = collectMetrics(gltf, parsed.binary);
  check(`${label}: glTF 2 asset`, gltf.asset?.version === '2.0', `version=${gltf.asset?.version}`);
  const authoringEntry = placeAuthoringEntries[part.id];
  const generator = String(gltf.asset?.generator || '');
  if (authoringEntry?.method === 'blender_mcp') {
    diagnose(`${label}: recorded generator differs from historical Blender tool`,
      generator.includes('author_place_archetype.py'), `generator=${generator}`);
    if (authoringEntry.blend_path) {
      check(`${label}: Blender source exists`, existsSync(resolve(ROOT, authoringEntry.blend_path)), `blend=${authoringEntry.blend_path}`);
    }
    if (authoringEntry.concept_path) {
      check(`${label}: concept reference exists`, existsSync(resolve(ROOT, authoringEntry.concept_path)), `concept=${authoringEntry.concept_path}`);
    }
    const minTris = authoringEntry.min_tris ?? placeAuthoring?.min_tris_blender_mcp ?? 1500;
    diagnose(`${label}: below historical Blender triangle profile`, part.tris >= minTris,
      `tris=${part.tris} profileMin=${minTris}`);
  } else if (authoringEntry?.method === 'blender_generic') {
    diagnose(`${label}: recorded generator differs from historical Blender chain`,
      authoringEntry.production_whole_ship === true
        ? generator.includes(String(authoringEntry.exporter_path || '').split('/').pop())
        : generator.includes('export_sprint_part.py')
          && generator.includes('spaceface_export.py')
          && generator.includes('finalize_part.mjs'),
      `generator=${generator}`);
    check(`${label}: generic Blender source exists`,
      typeof authoringEntry.blend_path === 'string' && existsSync(resolve(ROOT, authoringEntry.blend_path)),
      `blend=${authoringEntry.blend_path}`);
    check(`${label}: generic Blender exporter exists`,
      typeof authoringEntry.exporter_path === 'string' && existsSync(resolve(ROOT, authoringEntry.exporter_path)),
      `exporter=${authoringEntry.exporter_path}`);
    diagnose(`${label}: texture-role owner differs from historical chain`,
      authoringEntry.texture_role_owner === (authoringEntry.production_whole_ship === true ? 'blender-source-v1' : 'finalizer-v1'),
      `owner=${authoringEntry.texture_role_owner}`);
    if (authoringEntry.production_whole_ship === true) {
      check(`${label}: production whole-ship provenance exists`,
        typeof authoringEntry.provenance_path === 'string' && existsSync(resolve(ROOT, authoringEntry.provenance_path)),
        `provenance=${authoringEntry.provenance_path}`);
    }
    if (Number.isFinite(authoringEntry.min_tris)) {
      diagnose(`${label}: below reviewed Blender triangle profile`, part.tris >= authoringEntry.min_tris,
        `tris=${part.tris} profileMin=${authoringEntry.min_tris}`);
    }
  } else if (authoringEntry?.method === 'procedural_fallback') {
    diagnose(`${label}: procedural provenance tool differs`, generator.includes('generate_ship_parts_library.py'),
      `generator=${generator}`);
    const triBand = placeAuthoring?.procedural_tri_band_max ?? 1000;
    diagnose(`${label}: procedural triangle profile exceeded`, part.tris <= triBand,
      `tris=${part.tris} profileMax=${triBand}`);
  } else {
    diagnose(`${label}: generator is outside the historical SpaceFace tool chain`,
      generator.includes('generate_ship_parts_library.py'), `generator=${generator}`);
  }
  const requiredMeshCompression = (gltf.extensionsRequired || []).filter((name) =>
    /(?:draco|meshopt).*compression/i.test(name));
  const unsupportedMeshCompression = requiredMeshCompression.filter((name) =>
    !SUPPORTED_REQUIRED_MESH_COMPRESSION.has(name));
  check(`${label}: required mesh compression is supported by the runtime`, unsupportedMeshCompression.length === 0,
    `unsupported=${unsupportedMeshCompression.join(',')}`);
  check(`${label}: bytes match manifest`, bytes.length === part.bytes, `glb=${bytes.length} manifest=${part.bytes}`);
  const triangleMetric = resolveTriangleMetric(part, metrics);
  check(`${label}: triangle metric is supported`, triangleMetric.supported,
    `metric=${triangleMetric.metric}`);
  const triangleDetail = triangleMetric.metric === 'lod0'
    ? `metric=lod0 glb=${triangleMetric.measured} total=${triangleMetric.total} manifest=${part.tris}`
    : `glb=${triangleMetric.measured} manifest=${part.tris}`;
  check(`${label}: triangles match manifest`, triangleMetric.supported && triangleMetric.measured === part.tris,
    triangleDetail);
  check(`${label}: extras part id`, extras.partId === part.id, `extras=${extras.partId}`);
  const metadataCategory = String(extras.category || '').toLowerCase();
  const categoryMatches = extras.category === part.category
    || metadataCategory === String(part.category || '').toLowerCase()
    || (part.category === 'places' && part.id?.startsWith('place_works_') && metadataCategory === 'works')
    || (!metadataCategory && categoryForSlot(extras.slot) === part.category);
  check(`${label}: extras category`, categoryMatches, `extras=${extras.category || extras.slot}`);
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
  const activeMaterialContract = productionWholeShip
    ? manifest.wholeShipMaterialContract || {}
    : manifest.materialContract || {};
  const contractMaterials = new Set(Object.values(activeMaterialContract));
  const extraMaterials = [...materialNames].filter((name) => !contractMaterials.has(name));
  check(`${label}: has at least one material`, materialNames.size > 0,
    `materials=${[...materialNames].join(',')}`);
  diagnose(`${label}: additional semantic materials require visual/perf review`, extraMaterials.length === 0,
    `extra=${extraMaterials.join(',')}`);
  for (const [role, materialName] of Object.entries(part.tintable || {})) {
    check(`${label}: tint role ${role} is in manifest material contract`, Object.values(activeMaterialContract).includes(materialName), `material=${materialName}`);
    check(`${label}: tint material ${materialName} exists in GLB`, materialNames.has(materialName), `materials=${[...materialNames].join(',')}`);
  }

  for (const hook of part.hooks || []) {
    const hookExists = productionWholeShip
      ? [...metrics.nodeNames].some((name) => name.includes(hook))
      : metrics.nodeNames.has(hook);
    check(`${label}: hook ${hook} exists`, hookExists);
  }
  for (const socket of part.sockets || []) {
    check(`${label}: socket ${socket} exists`, metrics.nodeNames.has(socket));
  }
  if (part.category === 'engines') {
    const declaredHooks = new Set(part.hooks || []);
    let engineSurface;
    try {
      engineSurface = validateEngineDriveSurface(gltf, parsed.binary, part.id, part.hooks || []);
      check(`${label}: drive surfaces are backed by actual BIN storage`, true);
    } catch (error) {
      check(`${label}: drive surfaces are backed by actual BIN storage`, false, error.message);
      engineSurface = collectEngineDriveSurface(gltf, parsed.binary);
    }
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
  const manifestDimensions = part.bounds?.dimensionsM;
  check(`${label}: computed dimensions match manifest`, sameVec(dimensions, manifestDimensions),
    `computed=${dimensions.map((v) => v.toFixed(3)).join(',')} manifest=${(manifestDimensions || []).join(',')}`);
  check(`${label}: extras dimensions match manifest`, sameVec(extras.boundsDimensionsM, manifestDimensions),
    `extras=${(extras.boundsDimensionsM || []).join(',')} manifest=${(manifestDimensions || []).join(',')}`);
}

const diskGlbFiles = new Set([...collectGlbFiles(PART_ROOT)].filter(isPublishedPartsSourceFile));
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

console.log(`\n${ok} ok, ${fail} fail, ${diagnostic} diagnostics`);
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
    lodTriangles: collectLodTriangleCounts(gltf),
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
      const accessorBounds = decodedAccessorBounds(gltf, accessor);
      if (!vector3(accessorBounds?.min) || !vector3(accessorBounds?.max)) continue;
      if (!expandByAccessorVertices(gltf, binary, primitive.attributes.POSITION, world, outMin, outMax)) {
        expandByAccessorBounds(accessorBounds.min, accessorBounds.max, world, outMin, outMax);
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
  // EXT_meshopt stores compressed bytes in the GLB while the accessor's byteLength describes the
  // decoded view. The raw validator cannot index decoded offsets; fall back to the accessor's
  // required min/max bounds, which visitNode already transforms through every hierarchy matrix.
  if (view.extensions?.EXT_meshopt_compression) return false;
  const stride = view.byteStride || 12;
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const requiredEnd = start + Math.max(0, accessor.count - 1) * stride + 12;
  if (start < 0 || requiredEnd > binary.byteLength) return false;
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
  if (sf && (sf.contractVersion === 1 || sf.contractVersion === 2)
      && sf.slot === slot && typeof sf.assetId === 'string') return true;
  return typeof extras.assetId === 'string'
    && categoryForSlot(slot) === extras.category
    && extras.forwardAxis === '+X'
    && extras.upAxis === '+Y'
    && extras.starboardAxis === '+Z'
    && (extras.unit === 'metre' || extras.unit === 'meter');
}
