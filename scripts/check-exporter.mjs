#!/usr/bin/env node
// SPEC3-37 §2 step 1 acceptance: golden part round-trips exporter contract; broken fixtures fail
// with named assertions. Node validation mirrors tools/blender/spaceface_export.py headless path.
import { spawnSync as spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXPORTER_PY = resolve(ROOT, 'tools/blender/spaceface_export.py');
const EXPORT_STATE_TEST_PY = resolve(ROOT, 'test/spaceface-export-state.test.py');

// Mirrors tools/blender/spaceface_export.py. If quality work changes one, update both.
const KIND_BUDGETS = Object.freeze({
  part: { triBudget: 15000, minHullTris: 0 },
  wholeship: { triBudget: 20000, minHullTris: 800 },
  prop: { triBudget: 3000, minHullTris: 0 },
  landmark: { triBudget: 10000, minHullTris: 0 },
});

const REQUIRED_MAPS = ['ao', 'roughness'];
const ACCESSORY_MESH_TOKENS = ['antenna', 'decal', 'canopy', 'lens', 'clamp', 'brace', 'identity', 'cockpit'];
const HULL_MATERIAL_TOKENS = ['material_hull', 'hull'];
const MERGED_ROLE_TOKENS = Object.freeze({
  merged_material_hull: 'hull',
  merged_material_accent: 'accent',
  merged_material_mechanical: 'mechanical',
  merged_material_glass: 'glass',
});

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;

let ok = 0;
let fail = 0;

function check(label, condition, detail = '') {
  if (condition) {
    ok++;
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail ? `  -  ${detail}` : ''}`);
  }
}

function parseGlb(bytes) {
  if (bytes.length < 20) throw new Error('file too small');
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) throw new Error('bad magic');
  if (bytes.readUInt32LE(4) !== GLB_VERSION) throw new Error('bad version');
  let off = 12;
  let gltf = null;
  while (off < bytes.length) {
    const len = bytes.readUInt32LE(off);
    const type = bytes.readUInt32LE(off + 4);
    const start = off + 8;
    if (type === CHUNK_JSON) {
      gltf = JSON.parse(bytes.subarray(start, start + len).toString('utf8').replace(/\0+$/, '').trim());
    }
    off = start + len;
  }
  if (!gltf) throw new Error('missing JSON chunk');
  return gltf;
}

function meshTris(gltf, mesh) {
  let count = 0;
  for (const prim of mesh.primitives || []) {
    if ((prim.mode ?? 4) !== 4) continue;
    const ia = gltf.accessors?.[prim.indices];
    const pa = gltf.accessors?.[prim.attributes?.POSITION];
    count += Math.floor((ia?.count ?? pa?.count ?? 0) / 3);
  }
  return count;
}

function meshToken(gltf, mesh) {
  const materials = gltf.materials || [];
  const names = [];
  for (const prim of mesh.primitives || []) {
    const mat = materials[prim.material];
    if (mat?.name) names.push(mat.name.toLowerCase());
  }
  return `${(mesh.name || '').toLowerCase()} ${names.join(' ')}`;
}

function nodeRoleToken(nodeName) {
  return (nodeName || '').toLowerCase();
}

function isHullMesh(gltf, mesh, nodeName) {
  const token = `${nodeRoleToken(nodeName)} ${meshToken(gltf, mesh)}`;
  if (ACCESSORY_MESH_TOKENS.some((acc) => token.includes(acc))) return false;
  return HULL_MATERIAL_TOKENS.some((h) => token.includes(h))
    || (nodeRoleToken(nodeName).includes('lod0_') && nodeRoleToken(nodeName).includes('_main'));
}

function validateGltfDocument(gltf, spec) {
  const errors = [];
  const assetId = spec.id || spec.assetId || 'asset';
  const kind = spec.kind || 'part';
  const budget = spec.triBudget ?? KIND_BUDGETS[kind]?.triBudget ?? 1200;
  const minHullTris = spec.minHullTris ?? KIND_BUDGETS[kind]?.minHullTris ?? 0;
  const skipMaps = spec.skipMaps === true;

  const extras = gltf.asset?.extras || {};
  const sf = extras.spacefaceAsset;
  const legacyMeta = typeof extras.assetId === 'string'
    && extras.forwardAxis === '+X'
    && extras.upAxis === '+Y'
    && (extras.unit === 'metre' || extras.unit === 'meter');
  if (!sf && !legacyMeta && !spec.allowMissingMetadata) {
    errors.push(`${assetId}: missing spacefaceAsset extras`);
  }

  const images = gltf.images || [];
  const materials = gltf.materials || [];
  const hasMaps = images.length >= 3 || (
    materials.length > 0
    && materials.every((m) => Array.isArray(m.pbrMetallicRoughness?.baseColorFactor))
  );
  if (!hasMaps && !skipMaps) {
    for (const role of REQUIRED_MAPS) {
      errors.push(`${assetId}: missing baked map '${role}'`);
    }
  }

  let totalTris = 0;
  let hullTris = 0;
  const meshByIdx = Object.fromEntries((gltf.meshes || []).map((m, i) => [i, m]));

  for (const node of gltf.nodes || []) {
    if (node.mesh == null) continue;
    const mesh = meshByIdx[node.mesh] || {};
    const tris = meshTris(gltf, mesh);
    totalTris += tris;
    const name = node.name || '';
    const nodeExtras = node.extras?.spaceface || {};
    if (isHullMesh(gltf, mesh, name)) hullTris += tris;

    if (nodeExtras.chamfered !== true && !spec.skipChamfer) {
      if (nodeRoleToken(name).includes('lod0_') || nodeRoleToken(name).startsWith('merged_material_')) {
        errors.push(`${assetId}: unchamfered hard edge at ${name}`);
      }
    }

    const lname = name.toLowerCase();
    if (lname.startsWith('merged_material_')) {
      const expected = MERGED_ROLE_TOKENS[lname];
      const geo = (mesh.name || '').toLowerCase();
      if (expected === 'hull' && !isHullMesh(gltf, mesh, name)) {
        errors.push(`wholeship:merged material node mesh mismatch: ${name}`);
      } else if (expected === 'glass' && !geo.includes('glass') && !geo.includes('canopy')) {
        errors.push(`wholeship:merged material node mesh mismatch: ${name}`);
      } else if (expected === 'accent' && !geo.includes('accent') && !geo.includes('antenna') && !geo.includes('decal')) {
        errors.push(`wholeship:merged material node mesh mismatch: ${name}`);
      } else if (expected === 'mechanical' && (!geo.includes('mechanical') && !geo.includes('engine') && !geo.includes('brace') || geo.includes('decal'))) {
        errors.push(`wholeship:merged material node mesh mismatch: ${name}`);
      }
    }
  }

  if (totalTris > budget) {
    errors.push(`${assetId}: tri budget exceeded: ${totalTris} tris > ${budget}`);
  }
  if (kind === 'wholeship' && hullTris < minHullTris) {
    const meshNames = (gltf.meshes || []).map((m, i) => m.name || `mesh#${i}`);
    errors.push(`wholeship:missing hull body: hull triangles=${hullTris} < ${minHullTris}; meshes=${meshNames.join(', ')}`);
  }

  return errors;
}

function buildBrokenFixture(kind) {
  const gltf = {
    asset: { version: '2.0', generator: 'check-exporter-fixture' },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'LOD0_BROKEN_MAIN', extras: { spaceface: { lod: 'lod0' } } }],
    meshes: [{
      name: 'LOD0_BROKEN_MAIN',
      primitives: [{
        attributes: { POSITION: 0 },
        indices: 1,
        mode: 4,
      }],
    }],
    accessors: [
      { componentType: 5126, count: 3, type: 'VEC3', max: [1, 1, 1], min: [0, 0, 0] },
      { componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [{ buffer: 0, byteLength: 48 }],
    buffers: [{ byteLength: 48 }],
  };
  if (kind === 'metadata') {
    gltf.asset.extras = {};
  } else if (kind === 'chamfer') {
    gltf.nodes[0].extras.spaceface.chamfered = false;
  } else if (kind === 'tris') {
    gltf.accessors[1].count = 60000;
  }
  const json = Buffer.from(JSON.stringify(gltf));
  const pad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(pad)]);
  const bin = Buffer.alloc(48);
  const total = 12 + 8 + jsonChunk.length + 8 + bin.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(GLB_VERSION, 4);
  out.writeUInt32LE(total, 8);
  let off = 12;
  out.writeUInt32LE(jsonChunk.length, off);
  out.writeUInt32LE(CHUNK_JSON, off + 4);
  jsonChunk.copy(out, off + 8);
  off += 8 + jsonChunk.length;
  out.writeUInt32LE(bin.length, off);
  out.writeUInt32LE(0x004e4942, off + 4);
  bin.copy(out, off + 8);
  return out;
}

function runPythonValidate(path, spec) {
  const args = [
    EXPORTER_PY,
    '--validate-only', path,
    '--kind', spec.kind || 'part',
    '--id', spec.id || 'asset',
  ];
  if (spec.assetId) args.push('--asset-id', spec.assetId);
  const result = spawn('python', args, { cwd: ROOT, encoding: 'utf8' });
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}

// --- golden part round-trip (Blender-authored place archetype + legacy modular part) ---
const goldenAuthoredPath = resolve(ROOT, 'assets/ships/parts/places/place_station_trade_hub.glb');
const goldenLegacyPath = resolve(ROOT, 'assets/ships/parts/fins/fin_wedge.glb');
check('golden authored part exists', existsSync(goldenAuthoredPath), goldenAuthoredPath);
check('golden legacy part exists', existsSync(goldenLegacyPath), goldenLegacyPath);
if (existsSync(goldenAuthoredPath)) {
  const goldenErrors = validateGltfDocument(parseGlb(readFileSync(goldenAuthoredPath)), {
    kind: 'landmark',
    id: 'place_station_trade_hub',
    assetId: 'SF_PLACE_STATION_TRADE_HUB',
    triBudget: KIND_BUDGETS.landmark.triBudget,
  });
  check('golden authored part passes exporter contract', goldenErrors.length === 0, goldenErrors.join('; '));
}
if (existsSync(goldenLegacyPath)) {
  const legacyErrors = validateGltfDocument(parseGlb(readFileSync(goldenLegacyPath)), {
    kind: 'part',
    id: 'fin_wedge',
    skipChamfer: true,
  });
  check('golden legacy part passes exporter contract', legacyErrors.length === 0, legacyErrors.join('; '));
}
const goldenPath = goldenAuthoredPath;

// --- deliberately broken fixtures must fail with named assertions ---
const tmp = mkdtempSync(join(tmpdir(), 'sf-exporter-'));
try {
  const brokenMeta = join(tmp, 'broken-meta.glb');
  writeFileSync(brokenMeta, buildBrokenFixture('metadata'));
  const metaErrors = validateGltfDocument(parseGlb(readFileSync(brokenMeta)), {
    kind: 'fixture', id: 'broken-meta', allowMissingMetadata: false, skipMaps: true, skipChamfer: true,
  });
  check('broken fixture fails missing spacefaceAsset', metaErrors.some((e) => e.includes('missing spacefaceAsset extras')),
    metaErrors.join('; '));

  const brokenChamfer = join(tmp, 'broken-chamfer.glb');
  writeFileSync(brokenChamfer, buildBrokenFixture('chamfer'));
  const chamferErrors = validateGltfDocument(parseGlb(readFileSync(brokenChamfer)), {
    kind: 'part', id: 'broken-chamfer', skipMaps: true, allowMissingMetadata: true,
  });
  check('broken fixture fails unchamfered hard edge', chamferErrors.some((e) => e.includes('unchamfered hard edge')),
    chamferErrors.join('; '));

  const brokenTris = join(tmp, 'broken-tris.glb');
  writeFileSync(brokenTris, buildBrokenFixture('tris'));
  const trisErrors = validateGltfDocument(parseGlb(readFileSync(brokenTris)), {
    kind: 'part', id: 'broken-tris', triBudget: KIND_BUDGETS.part.triBudget, skipMaps: true, skipChamfer: true, allowMissingMetadata: true,
  });
  check('broken fixture fails tri budget exceeded', trisErrors.some((e) => e.includes('tri budget exceeded')),
    trisErrors.join('; '));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// --- whole-ship hull diagnosis: kestrel must fail hull-body assertion ---
const kestrelPath = resolve(ROOT, 'assets/ships/parts/wholeships/kestrel.glb');
if (existsSync(kestrelPath)) {
  const kestrelErrors = validateGltfDocument(parseGlb(readFileSync(kestrelPath)), {
    kind: 'wholeship',
    id: 'kestrel',
    assetId: 'SF_WHOLESHIP_KESTREL',
    skipChamfer: true,
  });
  check('kestrel fails wholeship:missing hull body (diagnosis)', kestrelErrors.some((e) => e.includes('wholeship:missing hull body')),
    `expected hull failure; got: ${kestrelErrors.join('; ')}`);
  check('kestrel fails merged material mismatch', kestrelErrors.some((e) => e.includes('merged material node mesh mismatch')),
    kestrelErrors.join('; '));
}

// --- optional Python parity when python is available ---
if (existsSync(EXPORTER_PY)) {
  const py = runPythonValidate(goldenPath, { kind: 'landmark', id: 'place_station_trade_hub', assetId: 'SF_PLACE_STATION_TRADE_HUB' });
  const pyOk = py.status === 0;
  if (py.status === 127 || /not found/i.test(py.stderr)) {
    check('python exporter parity (skipped — python unavailable)', true);
  } else {
    check('python exporter validates golden part', pyOk, py.stderr || py.stdout);
  }

  const stateRestore = spawn('python', [EXPORT_STATE_TEST_PY], { cwd: ROOT, encoding: 'utf8' });
  if (stateRestore.status === 127 || /not found/i.test(stateRestore.stderr || '')) {
    check('python exporter restores Blender state on failure (skipped — python unavailable)', true);
  } else {
    check(
      'python exporter restores selection, active object, and visibility on failure',
      stateRestore.status === 0,
      stateRestore.stderr || stateRestore.stdout,
    );
  }
}

console.log(`\n${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
