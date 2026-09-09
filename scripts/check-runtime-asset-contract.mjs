#!/usr/bin/env node
// Runtime asset contract — inspect release GLBs for real-time discipline (LOD, compression,
// material sharing, normals). Does not rewrite assets or punish authored detail; fails only on
// structural hazards that explode draw/material work at runtime.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

import { PART_LIBRARY_CONTRACT } from '../src/render/partsLibrary.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_PARTS_ROOT = resolve(ROOT, 'assets/ships/release/parts');
const MANIFEST_PATH = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;

// Historical profiles provide triage signals only. Measured frame/load/memory evidence owns hard
// performance acceptance; generic counts must not silently cap authored visual quality.
const HISTORICAL_TEXTURE_EDGE_PROFILE = 2048;
const HISTORICAL_SMALL_PART_MATERIAL_PROFILE = 16;
const HISTORICAL_STATION_MATERIAL_PROFILE = 28;

const HULL_FILES = new Set((PART_LIBRARY_CONTRACT.slots.hull || []).map(normalizeRel));
const STATION_FILES = new Set([
  'places/place_station_trade_hub.glb',
  'places/place_station_refinery.glb',
  'places/place_station_military.glb',
  'places/place_station_blackmarket.glb',
  'places/place_station_fab.glb',
  'places/place_station_mining.glb',
  'places/place_station_research.glb',
  'places/place_gate_jump_ring.glb',
]);
const SMALL_PART_CATEGORIES = new Set(['cockpits', 'engines', 'fins', 'weapons', 'greebles', 'gear', 'pods']);

const argv = new Set(process.argv.slice(2));
const STRICT = !argv.has('--report-only');

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

assert.ok(existsSync(RELEASE_PARTS_ROOT), `release parts root missing: ${RELEASE_PARTS_ROOT}`);

const manifest = existsSync(MANIFEST_PATH)
  ? JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  : { parts: [], textureContract: {} };
const manifestByFile = new Map();
const blockedFiles = new Set();
for (const part of manifest.parts || []) {
  if (part.file) manifestByFile.set(normalizeRel(part.file), part);
  if (part.status === 'blocked' && part.file) blockedFiles.add(normalizeRel(part.file));
}

const assets = [];
for (const absPath of listGlbs(RELEASE_PARTS_ROOT)) {
  const rel = normalizeRel(relative(ROOT, absPath));
  if (!rel.startsWith('assets/ships/release/parts/')) continue;
  const partRel = rel.replace(/^assets\/ships\/release\/parts\//, '');
  if (blockedFiles.has(partRel)) continue;
  assets.push(await inspectReleaseGlb(absPath, partRel));
}

const requiredFailures = assets.flatMap((asset) => (asset.issues || [])
  .filter((issue) => issue.severity === 'required')
  .map((issue) => ({ path: asset.path, code: issue.code, message: issue.message })));
const advisories = assets.flatMap((asset) => (asset.issues || [])
  .filter((issue) => issue.severity === 'advisory')
  .map((issue) => ({ path: asset.path, code: issue.code, message: issue.message })));

printReport(assets, requiredFailures, advisories);

if (STRICT && requiredFailures.length) process.exit(1);

async function inspectReleaseGlb(absPath, partRel) {
  const category = partRel.split('/')[0] || 'asset';
  const manifestPart = manifestByFile.get(partRel) || null;
  const row = {
    path: partRel,
    category,
    bytes: 0,
    meshes: 0,
    primitives: 0,
    materials: 0,
    textures: 0,
    maxTextureEdge: 0,
    lod: { lod0: 0, lod1: 0, lod2: 0 },
    repeatedMaterialNames: [],
    duplicateMaterialGroups: 0,
    uncompressedTextures: 0,
    missingNormals: 0,
    issues: [],
  };

  try {
    row.bytes = readFileSync(absPath).length;
    const gltfJson = parseGlbJson(readFileSync(absPath));
    const doc = await io.read(absPath);
    const root = doc.getRoot();
    const materials = root.listMaterials();
    const meshes = root.listMeshes();
    const textures = root.listTextures();
    const nodes = root.listNodes();

    row.meshes = meshes.length;
    row.textures = textures.length;
    row.materials = materials.length;
    row.primitives = meshes.reduce((sum, mesh) => sum + mesh.listPrimitives().length, 0);
    row.lod = countLodMarkers(nodes, meshes, gltfJson);
    row.maxTextureEdge = maxTextureEdge(gltfJson, manifestPart);
    row.uncompressedTextures = countUncompressedTextures(gltfJson);
    row.repeatedMaterialNames = repeatedNames(materials.map((mat) => materialName(mat)));
    row.duplicateMaterialGroups = countDuplicateMaterialGroups(materials);
    row.missingNormals = countMissingNormals(meshes);

    evaluateContract(row, manifestPart);
    return row;
  } catch (error) {
    row.issues.push({
      severity: 'required',
      code: 'parse-error',
      message: error && error.message ? error.message : String(error),
    });
    return row;
  }
}

function evaluateContract(row, manifestPart) {
  const { path, category, lod, materials, missingNormals, uncompressedTextures, maxTextureEdge: maxEdge } = row;

  if (HULL_FILES.has(path)) {
    if (!lod.lod0 || !lod.lod1 || !lod.lod2) {
      pushIssue(row, 'required', 'missing-hull-lods',
        `hull requires LOD0/LOD1/LOD2 markers; got ${lod.lod0}/${lod.lod1}/${lod.lod2}`);
    }
  }

  if (STATION_FILES.has(path)) {
    if (!lod.lod0) {
      pushIssue(row, 'advisory', 'missing-station-lod0',
        'station-scale asset has no LOD0 marker — add authorship LOD chain for distance readability');
    } else if (!lod.lod1 || !lod.lod2) {
      pushIssue(row, 'advisory', 'missing-station-distance-lods',
        `station-scale asset should expose distance LODs; got ${lod.lod0}/${lod.lod1}/${lod.lod2}`);
    }
  }

  if (SMALL_PART_CATEGORIES.has(category) && materials > HISTORICAL_SMALL_PART_MATERIAL_PROFILE) {
    pushIssue(row, 'advisory', 'small-part-material-profile',
      `${materials} materials exceeds historical small-part profile (${HISTORICAL_SMALL_PART_MATERIAL_PROFILE}); measure draw cost and merge only redundant roles`);
  }

  if (STATION_FILES.has(path) && materials > HISTORICAL_STATION_MATERIAL_PROFILE) {
    pushIssue(row, 'advisory', 'station-material-profile',
      `${materials} materials exceeds historical station profile (${HISTORICAL_STATION_MATERIAL_PROFILE}); measure draw cost and batch only compatible roles`);
  }

  if (row.duplicateMaterialGroups > 0) {
    pushIssue(row, 'required', 'duplicate-material-signatures',
      `${row.duplicateMaterialGroups} identical material signature group(s) should be shared, not duplicated`);
  }

  if (missingNormals > 0) {
    pushIssue(row, 'required', 'missing-normals',
      `${missingNormals} lit primitive(s) missing NORMAL attribute`);
  }

  if (uncompressedTextures > 0) {
    pushIssue(row, 'required', 'uncompressed-textures',
      `${uncompressedTextures} texture(s) use PNG/JPEG instead of KTX2/BasisU — compress for release`);
  }

  if (maxEdge > HISTORICAL_TEXTURE_EDGE_PROFILE) {
    pushIssue(row, 'advisory', 'texture-resolution-profile',
      `max texture edge ${maxEdge}px exceeds historical ${HISTORICAL_TEXTURE_EDGE_PROFILE}px profile; accept by measured memory/load evidence`);
  }

  const genericNames = row.repeatedMaterialNames
    .filter((entry) => /^(?:MeshStandardMaterial|Material|Scene_-_Root|Default|None|\(unnamed material\))$/i.test(entry.name));
  if (genericNames.length) {
    pushIssue(row, 'advisory', 'generic-material-names',
      `generic material names: ${genericNames.map((entry) => entry.name).join(', ')}`);
  }

  if (manifestPart && manifestPart.textureSize && maxEdge > manifestPart.textureSize * 2) {
    pushIssue(row, 'advisory', 'texture-manifest-drift',
      `max texture edge ${maxEdge}px drifts from manifest textureSize ${manifestPart.textureSize}`);
  }
}

function pushIssue(row, severity, code, message) {
  row.issues.push({ severity, code, message });
}

function countLodMarkers(nodes, meshes, gltfJson) {
  const counts = { lod0: 0, lod1: 0, lod2: 0 };
  const names = [];
  for (const node of nodes) names.push(node.getName() || '');
  for (const mesh of meshes) names.push(mesh.getName() || '');
  for (const entry of gltfJson.nodes || []) {
    const tag = entry.extras && entry.extras.spaceface && entry.extras.spaceface.lod;
    if (tag === 'lod0' || tag === 'lod1' || tag === 'lod2') counts[tag]++;
  }
  for (const entry of gltfJson.meshes || []) {
    const tag = entry.extras && entry.extras.spaceface && entry.extras.spaceface.lod;
    if (tag === 'lod0' || tag === 'lod1' || tag === 'lod2') counts[tag]++;
  }
  for (const name of names) {
    if (/^LOD0_/i.test(name)) counts.lod0++;
    if (/^LOD1_/i.test(name)) counts.lod1++;
    if (/^LOD2_/i.test(name)) counts.lod2++;
  }
  return counts;
}

function countMissingNormals(meshes) {
  let missing = 0;
  for (const mesh of meshes) {
    // Collision helpers are explicitly non-rendered contract geometry, not lit surface meshes.
    if (/collision/i.test(mesh.getName() || '')) continue;
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position || position.getCount() <= 0) continue;
      const normal = primitive.getAttribute('NORMAL');
      const material = primitive.getMaterial();
      if (!normal && needsNormals(material)) missing++;
    }
  }
  return missing;
}

function needsNormals(material) {
  if (!material) return true;
  const alpha = safeCall(() => material.getAlphaMode(), 'OPAQUE');
  if (alpha === 'MASK' || alpha === 'BLEND') return false;
  if (safeCall(() => material.getEmissiveTexture(), null)) return false;
  const emissive = safeCall(() => material.getEmissiveFactor(), [0, 0, 0]);
  const emissiveStrength = Math.max(emissive[0], emissive[1], emissive[2]);
  if (emissiveStrength > 0.05) return false;
  return true;
}

function countDuplicateMaterialGroups(materials) {
  const bySignature = new Map();
  for (const material of materials) {
    const signature = materialSignature(material);
    const bucket = bySignature.get(signature) || [];
    bucket.push(materialName(material));
    bySignature.set(signature, bucket);
  }
  let groups = 0;
  for (const names of bySignature.values()) {
    if (names.length > 1) groups++;
  }
  return groups;
}

function countUncompressedTextures(gltfJson) {
  const textures = gltfJson.textures || [];
  const images = gltfJson.images || [];
  let count = 0;
  for (let i = 0; i < textures.length; i++) {
    const texture = textures[i];
    const usesKtx2 = !!(texture.extensions && texture.extensions.KHR_texture_basisu);
    if (usesKtx2) continue;
    const imageIndex = texture.source;
    const image = Number.isInteger(imageIndex) ? images[imageIndex] : null;
    const mime = image && image.mimeType ? String(image.mimeType) : '';
    if (/image\/png|image\/jpe?g/i.test(mime)) count++;
  }
  return count;
}

function maxTextureEdge(gltfJson, manifestPart) {
  let maxEdge = 0;
  const fallback = manifestPart && manifestPart.textureSize
    ? manifestPart.textureSize
    : (manifest.textureContract && manifest.textureContract.resolution) || 0;
  for (const image of gltfJson.images || []) {
    const extras = image.extras || {};
    const spaceface = extras.spaceface || {};
    const width = Number(extras.width || spaceface.width || spaceface.textureWidth || fallback);
    const height = Number(extras.height || spaceface.height || spaceface.textureHeight || fallback);
    if (Number.isFinite(width)) maxEdge = Math.max(maxEdge, width);
    if (Number.isFinite(height)) maxEdge = Math.max(maxEdge, height);
  }
  if (!maxEdge && (gltfJson.images || []).length) maxEdge = fallback;
  return maxEdge;
}

function materialName(material) {
  return material && material.getName() || '(unnamed material)';
}

function materialSignature(material) {
  if (!material) return 'none';
  const color = safeCall(() => material.getBaseColorFactor(), [1, 1, 1, 1]).map((v) => round(v, 3)).join(',');
  const slots = [];
  if (safeCall(() => material.getBaseColorTexture(), null)) slots.push('base');
  if (safeCall(() => material.getNormalTexture(), null)) slots.push('normal');
  if (safeCall(() => material.getMetallicRoughnessTexture(), null)) slots.push('mr');
  if (safeCall(() => material.getOcclusionTexture(), null)) slots.push('ao');
  if (safeCall(() => material.getEmissiveTexture(), null)) slots.push('emit');
  return [
    materialName(material).replace(/_[0-9A-Fa-f]{6}(?:_mutable)?$/i, ''),
    safeCall(() => material.getAlphaMode(), 'OPAQUE'),
    safeCall(() => material.getDoubleSided(), false) ? 'double' : 'single',
    `base:${color}`,
    `rough:${round(safeCall(() => material.getRoughnessFactor(), 1), 3)}`,
    `metal:${round(safeCall(() => material.getMetallicFactor(), 1), 3)}`,
    slots.sort().join('+') || 'no-texture',
  ].join('|');
}

function repeatedNames(names) {
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) || 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function printReport(assets, requiredFailures, advisories) {
  const loaded = assets.filter((asset) => !asset.issues.some((issue) => issue.code === 'parse-error'));
  const summary = {
    assets: assets.length,
    loaded: loaded.length,
    meshes: sum(loaded, 'meshes'),
    primitives: sum(loaded, 'primitives'),
    materials: sum(loaded, 'materials'),
    textures: sum(loaded, 'textures'),
    bytesMb: round(sum(loaded, 'bytes') / 1048576, 1),
  };

  console.log('[runtime-assets] release parts contract');
  console.log(`[runtime-assets] scanned ${summary.assets} GLBs (${summary.loaded} parsed)`);
  console.log(`[runtime-assets] totals: ${summary.meshes} meshes, ${summary.primitives} primitives, ${summary.materials} materials, ${summary.textures} textures, ${summary.bytesMb} MB`);
  console.log(`[runtime-assets] result: ${requiredFailures.length ? 'FAIL' : 'PASS'} (${requiredFailures.length} required, ${advisories.length} advisory)`);

  const offenders = assets
    .map((asset) => ({
      asset,
      score: (asset.issues || []).filter((issue) => issue.severity === 'required').length,
      advisory: (asset.issues || []).filter((issue) => issue.severity === 'advisory').length,
    }))
    .filter((row) => row.score || row.advisory)
    .sort((a, b) => b.score - a.score || b.advisory - a.advisory
      || b.asset.materials - a.asset.materials || a.asset.path.localeCompare(b.asset.path));

  if (offenders.length) {
    console.log('\n[runtime-assets] top offenders');
    console.log(padRow(['path', 'mesh', 'prim', 'mat', 'tex', 'maxTex', 'LOD0/1/2', 'issues']));
    console.log(padRow(['----', '----', '----', '---', '---', '------', '--------', '------']));
    for (const { asset } of offenders.slice(0, 20)) {
      const lod = `${asset.lod.lod0}/${asset.lod.lod1}/${asset.lod.lod2}`;
      const issueText = (asset.issues || []).map((issue) => issue.code).join(', ');
      console.log(padRow([
        asset.path,
        asset.meshes,
        asset.primitives,
        asset.materials,
        asset.textures,
        asset.maxTextureEdge || '—',
        lod,
        issueText || '—',
      ]));
    }
  }

  if (requiredFailures.length) {
    console.log('\n[runtime-assets] required failures');
    for (const issue of requiredFailures.slice(0, 30)) {
      console.log(`  - ${issue.path}: ${issue.code}: ${issue.message}`);
    }
  }

  if (advisories.length) {
    console.log('\n[runtime-assets] advisories (compression/LOD/material sharing targets)');
    for (const issue of advisories.slice(0, 20)) {
      console.log(`  - ${issue.path}: ${issue.code}: ${issue.message}`);
    }
  }

  const disciplineHints = [
    'Prefer KTX2/BasisU textures + meshopt/Draco geometry in release builds.',
    'Share material roles across primitives; duplicate signatures are merge candidates.',
    'Ship hulls require authored LOD0/LOD1/LOD2 chains — not fewer triangles by default.',
    'Station-scale assets should add distance LODs; do not delete detail to pass this check.',
  ];
  console.log('\n[runtime-assets] discipline (not downgrade)');
  for (const hint of disciplineHints) console.log(`  - ${hint}`);
}

function padRow(cells) {
  const widths = [42, 5, 5, 4, 4, 7, 9, 28];
  return cells.map((cell, index) => String(cell).slice(0, widths[index]).padEnd(widths[index])).join(' ');
}

function listGlbs(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) out.push(path);
    }
  }
  return out.sort((a, b) => normalizeRel(a).localeCompare(normalizeRel(b)));
}

function parseGlbJson(bytes) {
  if (bytes.length < 20) throw new Error('file too small to be a GLB');
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) throw new Error('bad GLB magic');
  if (bytes.readUInt32LE(4) !== GLB_VERSION) throw new Error('unsupported glTF version');
  let off = 12;
  while (off < bytes.length) {
    const chunkLength = bytes.readUInt32LE(off);
    const chunkType = bytes.readUInt32LE(off + 4);
    const start = off + 8;
    if (chunkType === CHUNK_JSON) {
      return JSON.parse(bytes.subarray(start, start + chunkLength).toString('utf8').replace(/\0+$/, '').trim());
    }
    off = start + chunkLength;
  }
  throw new Error('missing JSON chunk');
}

function sum(items, key) {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function safeCall(fn, fallback) {
  try {
    const value = fn();
    return value == null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function normalizeRel(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
}
