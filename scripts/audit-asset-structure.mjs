#!/usr/bin/env node
// Read-only GLB structure audit for the SpaceFace ship asset pipeline.
//
// This does not build, rewrite, optimize, or finalize assets. It measures the release-authored
// runtime assets so performance work can point at concrete mesh/material fragmentation instead of
// guessing or "fixing" by lowering visible quality.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART_MANIFEST_PATH = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const PART_MANIFEST = existsSync(PART_MANIFEST_PATH)
  ? JSON.parse(readFileSync(PART_MANIFEST_PATH, 'utf8'))
  : { parts: [] };
const MANIFEST_BY_FILE = new Map((PART_MANIFEST.parts || []).map((part) => [normalizeSlash(part.file), part]));
const argv = parseArgs(process.argv.slice(2));
const DEFAULT_ROOTS = [
  'assets/ships/release',
  'assets/ships/release.__building',
].filter((path) => existsSync(resolve(ROOT, path)));

const ROOTS = (argv.root && argv.root.length ? argv.root : DEFAULT_ROOTS)
  .map((path) => normalizeSlash(relative(ROOT, resolve(ROOT, path))));
const OUT = argv.out || '.devshots/perf/asset-structure-budget.json';
const MAX_PRIMITIVES_PER_PART = Number(argv.maxPrimitivesPerPart || argv['max-primitives-per-part'] || 12);
const MAX_PRIMITIVES_PER_WHOLESHIP = Number(argv.maxPrimitivesPerWholeship || argv['max-primitives-per-wholeship'] || 24);
const MAX_MATERIALS_PER_ASSET = Number(argv.maxMaterialsPerAsset || argv['max-materials-per-asset'] || 8);
const MAX_GENERIC_MATERIAL_ASSETS = Number(argv.maxGenericMaterialAssets || argv['max-generic-material-assets'] || 0);

if (!ROOTS.length) {
  console.error('[asset-structure] no roots found. Pass --root <path> or create assets/ships/release.');
  process.exit(2);
}

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const report = {
  schema: 'spaceface.assetStructureBudget.v1',
  generatedAt: new Date().toISOString(),
  roots: ROOTS,
  budgets: {
    maxPrimitivesPerPart: MAX_PRIMITIVES_PER_PART,
    maxPrimitivesPerWholeship: MAX_PRIMITIVES_PER_WHOLESHIP,
    maxMaterialsPerAsset: MAX_MATERIALS_PER_ASSET,
    maxGenericMaterialAssets: MAX_GENERIC_MATERIAL_ASSETS,
  },
  assets: [],
  summary: null,
};

for (const root of ROOTS) {
  const absRoot = resolve(ROOT, root);
  for (const file of listGlbs(absRoot)) {
    report.assets.push(await auditGlb(file, root));
  }
}

report.summary = summarize(report.assets);
mkdirSync(dirname(resolve(ROOT, OUT)), { recursive: true });
writeFileSync(resolve(ROOT, OUT), JSON.stringify(report, null, 2));
printSummary(report);

if (argv.strict && report.summary.requiredFailures.length) process.exitCode = 1;

async function auditGlb(absPath, auditRoot) {
  const rel = normalizeSlash(relative(ROOT, absPath));
  const stats = statSync(absPath);
  try {
    const doc = await io.read(absPath);
    const root = doc.getRoot();
    const materials = root.listMaterials();
    const meshes = root.listMeshes();
    const nodes = root.listNodes();
    const primitiveRows = [];
    let primitiveCount = 0;
    let triangleCount = 0;

    for (const mesh of meshes) {
      for (const primitive of mesh.listPrimitives()) {
        primitiveCount++;
        const triangles = primitiveTriangleCount(primitive);
        triangleCount += triangles;
        const material = primitive.getMaterial();
        primitiveRows.push({
          mesh: mesh.getName() || '(unnamed mesh)',
          material: materialName(material),
          materialRole: materialRole(material),
          triangles,
          mode: primitive.getMode(),
          attributes: {
            uv0: !!primitive.getAttribute('TEXCOORD_0'),
            uv1: !!primitive.getAttribute('TEXCOORD_1'),
            tangent: !!primitive.getAttribute('TANGENT'),
            normal: !!primitive.getAttribute('NORMAL'),
          },
        });
      }
    }

    const materialRows = materials.map((material) => materialSurfaceRow(material));
    const materialNameCounts = countBy(materialRows, (row) => row.name);
    const materialRoleCounts = countBy(materialRows, (row) => row.role);
    const primitiveMaterialCounts = countBy(primitiveRows, (row) => row.material);
    const primitiveRoleCounts = countBy(primitiveRows, (row) => row.materialRole);
    const semanticNodeCounts = countSemanticNodes(nodes);
    const surfaceAudit = auditSurfaces(materialRows, primitiveRows);
    const catalog = catalogEntryForPath(rel);
    const kind = classifyAsset(rel);
    const primitiveBudget = kind === 'wholeship' ? MAX_PRIMITIVES_PER_WHOLESHIP : MAX_PRIMITIVES_PER_PART;
    const genericMaterialNames = materialRows
      .map((row) => row.name)
      .filter((name) => /^(?:MeshStandardMaterial|Material|Scene_-_Root|Default|None|\(unnamed material\))$/i.test(name));
    const issues = [];
    if (primitiveCount > primitiveBudget) {
      issues.push({
        severity: 'required',
        code: 'primitive-budget',
        message: `exports ${primitiveCount} primitives; budget is ${primitiveBudget}`,
      });
    }
    if (materials.length > MAX_MATERIALS_PER_ASSET) {
      issues.push({
        severity: 'required',
        code: 'material-budget',
        message: `exports ${materials.length} materials; budget is ${MAX_MATERIALS_PER_ASSET}`,
      });
    }
    if (genericMaterialNames.length) {
      issues.push({
        severity: 'advisory',
        code: 'generic-material-name',
        message: `has generic material names: ${[...new Set(genericMaterialNames)].join(', ')}`,
      });
    }

    return {
      path: rel,
      auditRoot,
      kind,
      catalog,
      bytes: stats.size,
      meshes: meshes.length,
      primitives: primitiveCount,
      triangles: triangleCount,
      materials: materials.length,
      textures: root.listTextures().length,
      nodes: nodes.length,
      semanticNodes: semanticNodeCounts,
      materialNames: topCounts(materialNameCounts, 12),
      materialRoles: topCounts(materialRoleCounts, 12),
      primitiveMaterials: topCounts(primitiveMaterialCounts, 16),
      primitiveRoles: topCounts(primitiveRoleCounts, 16),
      duplicateMaterialNames: topCounts(materialNameCounts, 12).filter((entry) => entry.count > 1),
      materialSignatures: topCounts(countBy(materialRows, (row) => row.signature), 12),
      surfaceAudit,
      primitiveSamples: primitiveRows
        .sort((a, b) => b.triangles - a.triangles || a.mesh.localeCompare(b.mesh))
        .slice(0, 16),
      issues,
    };
  } catch (error) {
    return {
      path: rel,
      auditRoot,
      kind: classifyAsset(rel),
      bytes: stats.size,
      error: error && error.message ? error.message : String(error),
      issues: [{
        severity: 'required',
        code: 'parse-error',
        message: error && error.message ? error.message : String(error),
      }],
    };
  }
}

function summarize(assets) {
  const loaded = assets.filter((asset) => !asset.error);
  const requiredFailures = [];
  const advisoryIssues = [];
  for (const asset of assets) {
    for (const issue of asset.issues || []) {
      const row = { path: asset.path, code: issue.code, message: issue.message };
      if (issue.severity === 'required') requiredFailures.push(row);
      else advisoryIssues.push(row);
    }
  }
  const genericMaterialAssets = assets.filter((asset) => (asset.issues || []).some((issue) => issue.code === 'generic-material-name'));
  if (genericMaterialAssets.length > MAX_GENERIC_MATERIAL_ASSETS) {
    requiredFailures.push({
      path: '(collection)',
      code: 'generic-material-assets',
      message: `${genericMaterialAssets.length} assets use generic material names; budget is ${MAX_GENERIC_MATERIAL_ASSETS}`,
    });
  }

  return {
    pass: requiredFailures.length === 0,
    assetCount: assets.length,
    loadedAssetCount: loaded.length,
    roots: summarizeByRoot(assets),
    totalBytes: sum(loaded, 'bytes'),
    totalMeshes: sum(loaded, 'meshes'),
    totalPrimitives: sum(loaded, 'primitives'),
    totalTriangles: sum(loaded, 'triangles'),
    totalMaterials: sum(loaded, 'materials'),
    totalTextures: sum(loaded, 'textures'),
    completeOpaquePbrAssets: loaded.filter((asset) => asset.surfaceAudit?.completeOpaquePbr).length,
    surfaceRemasterRequiredAssets: loaded.filter((asset) => asset.surfaceAudit?.sourceRemasterRequired).length,
    averagePrimitivesPerAsset: round(avg(loaded.map((asset) => asset.primitives))),
    averageMaterialsPerAsset: round(avg(loaded.map((asset) => asset.materials))),
    worstByPrimitives: loaded.slice().sort((a, b) => b.primitives - a.primitives).slice(0, 12)
      .map(assetSummary),
    worstByMaterials: loaded.slice().sort((a, b) => b.materials - a.materials).slice(0, 12)
      .map(assetSummary),
    topMaterialNames: topCounts(mergeCounts(loaded.map((asset) => asset.materialNames)), 20),
    topMaterialRoles: topCounts(mergeCounts(loaded.map((asset) => asset.materialRoles)), 20),
    genericMaterialAssets: genericMaterialAssets.map(assetSummary),
    weakestSurfaces: loaded.slice()
      .sort((a, b) => (b.surfaceAudit?.riskScore || 0) - (a.surfaceAudit?.riskScore || 0)
        || a.path.localeCompare(b.path))
      .slice(0, 24)
      .map(surfaceSummary),
    recommendedRemasterOrder: remasterOrder(loaded),
    requiredFailures,
    advisoryIssues: advisoryIssues.slice(0, 50),
  };
}

function summarizeByRoot(assets) {
  const byRoot = new Map();
  for (const asset of assets) {
    if (!byRoot.has(asset.auditRoot)) byRoot.set(asset.auditRoot, []);
    byRoot.get(asset.auditRoot).push(asset);
  }
  return [...byRoot.entries()].map(([root, rootAssets]) => {
    const loaded = rootAssets.filter((asset) => !asset.error);
    const requiredIssues = rootAssets.flatMap((asset) => (asset.issues || [])
      .filter((issue) => issue.severity === 'required')
      .map((issue) => ({ path: asset.path, code: issue.code, message: issue.message })));
    return {
      root,
      pass: requiredIssues.length === 0,
      assetCount: rootAssets.length,
      loadedAssetCount: loaded.length,
      totalBytes: sum(loaded, 'bytes'),
      totalMeshes: sum(loaded, 'meshes'),
      totalPrimitives: sum(loaded, 'primitives'),
      totalTriangles: sum(loaded, 'triangles'),
      totalMaterials: sum(loaded, 'materials'),
      worstByPrimitives: loaded.slice().sort((a, b) => b.primitives - a.primitives).slice(0, 8)
        .map(assetSummary),
      requiredFailures: requiredIssues,
    };
  });
}

function printSummary(result) {
  const summary = result.summary;
  console.log(`[asset-structure] roots: ${result.roots.join(', ')}`);
  console.log(`[asset-structure] assets ${summary.loadedAssetCount}/${summary.assetCount}; primitives ${summary.totalPrimitives}; materials ${summary.totalMaterials}; triangles ${summary.totalTriangles}; bytes ${(summary.totalBytes / 1048576).toFixed(1)} MB`);
  console.log(`[asset-structure] budget: ${summary.pass ? 'PASS' : 'FAIL'} (${summary.requiredFailures.length} required issue${summary.requiredFailures.length === 1 ? '' : 's'})`);
  console.log(`[asset-structure] report: ${OUT}`);
  if (summary.requiredFailures.length) {
    console.log('[asset-structure] required issues:');
    for (const issue of summary.requiredFailures.slice(0, 20)) {
      console.log(`  - ${issue.path}: ${issue.code}: ${issue.message}`);
    }
  }
  console.log('[asset-structure] worst primitive counts:');
  for (const asset of summary.worstByPrimitives.slice(0, 8)) {
    console.log(`  - ${asset.path}: ${asset.primitives} primitives, ${asset.materials} materials, ${asset.triangles} tris`);
  }
  console.log('[asset-structure] top material roles:');
  for (const entry of summary.topMaterialRoles.slice(0, 10)) {
    console.log(`  - ${entry.key}: ${entry.count}`);
  }
  console.log(`[asset-structure] surface remaster candidates: ${summary.surfaceRemasterRequiredAssets}; complete opaque PBR assets: ${summary.completeOpaquePbrAssets}`);
  console.log('[asset-structure] weakest surface candidates:');
  for (const asset of summary.weakestSurfaces.slice(0, 10)) {
    console.log(`  - ${asset.path}: risk ${asset.riskScore}; ${asset.risks.join(', ') || 'no structural risk flags'}`);
  }
}

function listGlbs(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) out.push(path);
    }
  }
  return out.sort((a, b) => normalizeSlash(a).localeCompare(normalizeSlash(b)));
}

function primitiveTriangleCount(primitive) {
  const mode = primitive.getMode();
  const indices = primitive.getIndices();
  const position = primitive.getAttribute('POSITION');
  const count = indices ? indices.getCount() : (position ? position.getCount() : 0);
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (mode === 5 || mode === 6) return Math.max(0, count - 2);
  if (mode === 4 || mode == null) return Math.floor(count / 3);
  return 0;
}

function materialName(material) {
  return material && material.getName() || '(unnamed material)';
}

function materialRole(material) {
  const exported = safeCall(() => material.getExtras(), null)?.spacefaceMaterialRole;
  if (typeof exported === 'string' && exported.trim()) return exported.trim().toLowerCase();
  const name = materialName(material);
  if (/^DTL_/i.test(name)) return name.replace(/_(?:hull|thruster|none)(?:_[0-9A-Fa-f]{6})?(?:_mutable)?$/i, '');
  if (/Glass|Canopy/i.test(name)) return 'glass/canopy';
  if (/Emit|Emission|Glow|Nav|Thruster|Drive.?Core/i.test(name)) return 'emissive';
  if (/Hull/i.test(name)) return 'hull';
  if (/Armor/i.test(name)) return 'armor';
  if (/Accent/i.test(name)) return 'accent';
  if (/Warning|Hazard/i.test(name)) return 'warning';
  if (/Mech|Mechanical/i.test(name)) return 'mechanical';
  if (/^Material_/i.test(name)) return name.replace(/_(?:hull|thruster|none)(?:_[0-9A-Fa-f]{6})?(?:_mutable)?$/i, '');
  return name;
}

function materialSurfaceRow(material) {
  const textures = materialTextureSlots(material);
  const role = materialRole(material);
  const alphaMode = safeCall(() => material.getAlphaMode(), 'OPAQUE');
  const emissive = safeCall(() => material.getEmissiveFactor(), [0, 0, 0]);
  const structuralOpaque = alphaMode === 'OPAQUE'
    && !/emissive|emission|signal|drive|thruster|glow|glass|canopy|decal/i.test(role);
  return {
    name: materialName(material),
    role,
    signature: materialSignature(material),
    alphaMode,
    doubleSided: !!safeCall(() => material.getDoubleSided(), false),
    textures,
    factors: {
      baseColor: safeCall(() => material.getBaseColorFactor(), [1, 1, 1, 1]).map((value) => round(value, 4)),
      roughness: round(safeCall(() => material.getRoughnessFactor(), 1), 4),
      metallic: round(safeCall(() => material.getMetallicFactor(), 1), 4),
      emissive: emissive.map((value) => round(value, 4)),
    },
    structuralOpaque,
    pbr: {
      baseColor: textures.includes('baseColor'),
      normal: textures.includes('normal'),
      metallicRoughness: textures.includes('metallicRoughness'),
      occlusion: textures.includes('occlusion'),
      emissive: textures.includes('emissive'),
    },
  };
}

function auditSurfaces(materials, primitives) {
  const opaque = materials.filter((material) => material.structuralOpaque);
  const byName = new Map(materials.map((material) => [material.name, material]));
  const mappedPrimitives = primitives.filter((primitive) => {
    const material = byName.get(primitive.material);
    return material?.structuralOpaque && material.textures.length > 0;
  });
  const normalPrimitives = primitives.filter((primitive) => byName.get(primitive.material)?.pbr.normal);
  const complete = opaque.filter((material) => (
    material.pbr.baseColor && material.pbr.normal && material.pbr.metallicRoughness
  ));
  const riskCodes = [];
  let riskScore = 0;
  const addRisk = (code, weight) => {
    if (riskCodes.includes(code)) return;
    riskCodes.push(code);
    riskScore += weight;
  };
  if (opaque.length > 0 && complete.length < opaque.length) addRisk('incomplete-opaque-pbr', 4);
  if (opaque.some((material) => !material.pbr.normal)) addRisk('missing-normal-detail', 3);
  if (opaque.some((material) => !material.pbr.metallicRoughness)) addRisk('constant-roughness-metalness', 4);
  if (opaque.some((material) => !material.pbr.baseColor)) addRisk('factor-only-base-color', 2);
  if (opaque.some((material) => !material.pbr.occlusion)) addRisk('missing-ao', 1);
  if (mappedPrimitives.some((primitive) => !primitive.attributes.uv0)) addRisk('mapped-primitive-missing-uv0', 6);
  if (normalPrimitives.some((primitive) => !primitive.attributes.tangent)) addRisk('normal-mapped-primitive-missing-tangent', 5);
  const roughnessValues = [...new Set(opaque.map((material) => material.factors.roughness))];
  if (opaque.length > 1 && roughnessValues.length === 1
    && opaque.every((material) => !material.pbr.metallicRoughness)) {
    addRisk('uniform-roughness-across-roles', 3);
  }
  const roleTokens = new Set(opaque.map((material) => material.role));
  if (opaque.length > 1 && roleTokens.size <= 1) addRisk('single-structural-material-language', 3);
  if (opaque.some((material) => /^(?:material|default|none|\(unnamed material\))$/i.test(material.role))) {
    addRisk('missing-semantic-material-role', 2);
  }
  return {
    opaqueMaterialCount: opaque.length,
    completeOpaqueMaterialCount: complete.length,
    completeOpaquePbr: opaque.length > 0 && complete.length === opaque.length,
    sourceRemasterRequired: riskCodes.length > 0,
    riskScore,
    risks: riskCodes,
    uv: {
      mappedPrimitiveCount: mappedPrimitives.length,
      mappedMissingUv0: mappedPrimitives.filter((primitive) => !primitive.attributes.uv0).length,
      normalMappedPrimitiveCount: normalPrimitives.length,
      normalMappedMissingTangents: normalPrimitives.filter((primitive) => !primitive.attributes.tangent).length,
    },
    roles: opaque.map((material) => ({
      name: material.name,
      role: material.role,
      pbr: material.pbr,
      factors: material.factors,
    })),
  };
}

function materialSignature(material) {
  if (!material) return 'none';
  const color = safeCall(() => material.getBaseColorFactor(), [1, 1, 1, 1]).map((value) => round(value, 3)).join(',');
  const textureSlots = materialTextureSlots(material).sort().join('+') || 'no-texture';
  return [
    materialRole(material),
    safeCall(() => material.getAlphaMode(), 'OPAQUE'),
    safeCall(() => material.getDoubleSided(), false) ? 'double' : 'single',
    `base:${color}`,
    `rough:${round(safeCall(() => material.getRoughnessFactor(), 1), 3)}`,
    `metal:${round(safeCall(() => material.getMetallicFactor(), 1), 3)}`,
    textureSlots,
  ].join('|');
}

function materialTextureSlots(material) {
  if (!material) return [];
  const slots = [];
  if (safeCall(() => material.getBaseColorTexture(), null)) slots.push('baseColor');
  if (safeCall(() => material.getNormalTexture(), null)) slots.push('normal');
  if (safeCall(() => material.getMetallicRoughnessTexture(), null)) slots.push('metallicRoughness');
  if (safeCall(() => material.getOcclusionTexture(), null)) slots.push('occlusion');
  if (safeCall(() => material.getEmissiveTexture(), null)) slots.push('emissive');
  return slots;
}

function countSemanticNodes(nodes) {
  const counts = { sockets: 0, hooks: 0, mounts: 0, lod: 0 };
  for (const node of nodes) {
    const name = node.getName() || '';
    if (/^SOCKET_/i.test(name)) counts.sockets++;
    if (/^HOOK_/i.test(name)) counts.hooks++;
    if (/^MOUNT_/i.test(name)) counts.mounts++;
    if (/^LOD/i.test(name)) counts.lod++;
  }
  return counts;
}

function classifyAsset(relPath) {
  const rel = normalizeSlash(relPath);
  if (rel.includes('/wholeships/') || rel.includes('/kestrel/')) return 'wholeship';
  const match = rel.match(/\/parts\/([^/]+)\//);
  return match ? match[1] : 'asset';
}

function assetSummary(asset) {
  return {
    path: asset.path,
    kind: asset.kind,
    primitives: asset.primitives || 0,
    materials: asset.materials || 0,
    triangles: asset.triangles || 0,
    bytes: asset.bytes || 0,
    issues: (asset.issues || []).map((issue) => issue.code),
  };
}

function catalogEntryForPath(relPath) {
  const normalized = normalizeSlash(relPath);
  const marker = '/parts/';
  const index = normalized.lastIndexOf(marker);
  if (index < 0) return null;
  const file = normalized.slice(index + marker.length).replace(/_lod[12](?=\.glb$)/i, '');
  const part = MANIFEST_BY_FILE.get(file);
  if (!part) return null;
  return {
    id: part.id,
    category: part.category,
    priority: part.priority || null,
    file: part.file,
  };
}

function surfaceSummary(asset) {
  return {
    path: asset.path,
    kind: asset.kind,
    catalog: asset.catalog || null,
    riskScore: asset.surfaceAudit?.riskScore || 0,
    risks: asset.surfaceAudit?.risks || [],
    opaqueMaterials: asset.surfaceAudit?.opaqueMaterialCount || 0,
    completeOpaqueMaterials: asset.surfaceAudit?.completeOpaqueMaterialCount || 0,
    triangles: asset.triangles || 0,
    bytes: asset.bytes || 0,
  };
}

function remasterOrder(assets) {
  const grouped = new Map();
  for (const asset of assets) {
    const key = asset.catalog?.id || asset.path;
    let row = grouped.get(key);
    if (!row) {
      row = {
        id: asset.catalog?.id || key,
        priority: asset.catalog?.priority || null,
        category: asset.catalog?.category || asset.kind,
        paths: [],
        riskScore: 0,
        risks: new Set(),
      };
      grouped.set(key, row);
    }
    row.paths.push(asset.path);
    row.riskScore = Math.max(row.riskScore, asset.surfaceAudit?.riskScore || 0);
    for (const risk of asset.surfaceAudit?.risks || []) row.risks.add(risk);
  }
  const priorityWeight = { P0: 12, P1: 7, P2: 3 };
  return [...grouped.values()]
    .map((row) => ({
      id: row.id,
      priority: row.priority,
      category: row.category,
      remasterScore: row.riskScore + (priorityWeight[row.priority] || 0),
      surfaceRiskScore: row.riskScore,
      risks: [...row.risks],
      paths: row.paths.sort(),
    }))
    .filter((row) => row.surfaceRiskScore > 0)
    .sort((a, b) => b.remasterScore - a.remasterScore
      || b.surfaceRiskScore - a.surfaceRiskScore
      || a.id.localeCompare(b.id));
}

function countBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function mergeCounts(countLists) {
  const out = {};
  for (const counts of countLists) {
    for (const entry of counts || []) out[entry.key] = (out[entry.key] || 0) + entry.count;
  }
  return out;
}

function topCounts(counts, limit) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function sum(items, key) {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

function avg(values) {
  const nums = values.filter(Number.isFinite);
  return nums.length ? nums.reduce((total, value) => total + value, 0) / nums.length : 0;
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

function normalizeSlash(path) {
  return String(path).replace(/\\/g, '/');
}

function parseArgs(args) {
  const out = { root: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    const value = next && !next.startsWith('--') ? args[++i] : true;
    if (key === 'root') out.root.push(value);
    else out[key] = value;
  }
  return out;
}
