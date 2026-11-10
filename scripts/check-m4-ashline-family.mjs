#!/usr/bin/env node
/**
 * Focused production checks for the live M4 Ashline hostile ship family.
 *
 * Strengthened gates (consolidated repair):
 *  - World-space socket axes/positions and forwards
 *  - COLLISION_HULL measurable bounds + non-render extras
 *  - Source/release texture-count parity; all release textures KTX2
 *  - EXT_meshopt_compression bufferViews + extensionsUsed
 *  - Damage roles (drive/gun/tether) preserved
 *  - LOD monotonicity (lod0 > lod1 > lod2 triangles)
 *  - Canonical source/release publication and hostile runtime selection
 *
 * Usage: node scripts/check-m4-ashline-family.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FAMILY = resolve(ROOT, 'assets/ships/m4_ashline');

globalThis.document = {
  createElement: () => ({ getContext: () => null, style: {} }),
  getElementById: () => null,
  addEventListener() {},
};
globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
const {
  PART_LIBRARY_CONTRACT,
  resolveRequiredWholeShipRecord,
  wholeShipVisualForEntity,
} = await import('../src/render/partsLibrary.js');

const REQUIRED_SOCKETS = [
  'SOCKET_Weapon_Front',
  'SOCKET_Mining_Front',
  'SOCKET_Engine_Main',
  'SOCKET_Trail_Main',
  'SOCKET_Utility_Dorsal',
  'SOCKET_Cargo_Ventral',
  'SOCKET_Camera_Focus',
  'SOCKET_RCS_Port',
  'SOCKET_RCS_Starboard',
];

/** Expected world-space socket contracts (runtime/glTF axes). */
const SOCKET_AXIS_RULES = {
  SOCKET_Weapon_Front: {
    forward: [1, 0, 0],
    // must be forward of origin on +X
    pos: (t) => t[0] > 1.0,
    label: 'Weapon front +X position, forward +X',
  },
  SOCKET_Mining_Front: {
    forward: [1, 0, 0],
    pos: (t) => t[0] > 1.0,
    label: 'Mining front +X position, forward +X',
  },
  SOCKET_Engine_Main: {
    forward: [-1, 0, 0],
    pos: (t) => t[0] < -1.0,
    label: 'Engine aft -X position, forward -X',
  },
  SOCKET_Trail_Main: {
    forward: [-1, 0, 0],
    pos: (t) => t[0] < -1.0,
    label: 'Trail aft -X position, forward -X',
  },
  SOCKET_Utility_Dorsal: {
    forward: [0, 1, 0],
    pos: (t) => t[1] > 0.4,
    label: 'Utility dorsal +Y position, forward +Y',
  },
  SOCKET_Cargo_Ventral: {
    forward: [0, -1, 0],
    pos: (t) => t[1] < -0.3,
    label: 'Cargo ventral -Y position, forward -Y',
  },
  SOCKET_Camera_Focus: {
    forward: [1, 0, 0],
    pos: () => true,
    label: 'Camera focus forward +X',
  },
  SOCKET_RCS_Port: {
    forward: [0, 0, -1],
    pos: (t) => t[2] < -0.5,
    label: 'RCS Port -Z side, outward -Z',
  },
  SOCKET_RCS_Starboard: {
    forward: [0, 0, 1],
    pos: (t) => t[2] > 0.5,
    label: 'RCS Starboard +Z side, outward +Z',
  },
};

const SHIPS = [
  { key: 'dart', id: 'ashline_dart', assetId: 'SF_WHOLESHIP_ASHLINE_DART', role: 'flyby_interceptor', enemyIds: ['wasp_swarmer'] },
  { key: 'lode', id: 'ashline_lode', assetId: 'SF_WHOLESHIP_ASHLINE_LODE', role: 'heavy_brawler', enemyIds: ['bruiser_brawler'] },
  { key: 'rig', id: 'ashline_rig', assetId: 'SF_WHOLESHIP_ASHLINE_RIG', role: 'tether_control_raider', enemyIds: ['reaver_pirate', 'corsair_raider'] },
];

const FORBIDDEN_TOUCH = [
  'assets/ships/parts/wholeships/kestrel.glb',
  'assets/ships/parts/wholeships/pelican.glb',
  'assets/ships/parts/wholeships/wasp.glb',
];

const errors = [];
const warnings = [];
const info = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function ok(msg) {
  info.push(msg);
}

function mustExist(rel, label = rel) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) {
    fail(`missing ${label}: ${rel}`);
    return null;
  }
  return abs;
}

function nearly(a, b, eps = 1e-3) {
  return Math.abs(a - b) <= eps;
}

function vecNear(a, b, eps = 1e-3) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => nearly(Number(v), Number(b[i]), eps));
}

function readGlbJson(abs) {
  const buf = readFileSync(abs);
  if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error(`not GLB: ${abs}`);
  let off = 12;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    off += 8;
    if (type === 0x4e4f534a) {
      const json = buf.subarray(off, off + len).toString('utf8').replace(/\0+$/, '').trim();
      return JSON.parse(json);
    }
    off += len;
  }
  throw new Error(`no JSON chunk: ${abs}`);
}

function meshTris(doc, mesh) {
  let total = 0;
  const accessors = doc.accessors || [];
  for (const prim of mesh.primitives || []) {
    if ((prim.mode ?? 4) !== 4) continue;
    if (prim.indices != null) total += Math.floor((accessors[prim.indices].count || 0) / 3);
    else {
      const pos = prim.attributes?.POSITION;
      if (pos != null) total += Math.floor((accessors[pos].count || 0) / 3);
    }
  }
  return total;
}

function nodeWorldTranslation(doc, nodeIndex, cache = new Map()) {
  if (cache.has(nodeIndex)) return cache.get(nodeIndex);
  const nodes = doc.nodes || [];
  const node = nodes[nodeIndex];
  if (!node) return [0, 0, 0];
  let t = node.translation ? [...node.translation] : [0, 0, 0];
  // Find parent
  let parentIdx = -1;
  for (let i = 0; i < nodes.length; i++) {
    const kids = nodes[i].children || [];
    if (kids.includes(nodeIndex)) {
      parentIdx = i;
      break;
    }
  }
  if (parentIdx >= 0) {
    const pt = nodeWorldTranslation(doc, parentIdx, cache);
    t = [t[0] + pt[0], t[1] + pt[1], t[2] + pt[2]];
  }
  cache.set(nodeIndex, t);
  return t;
}

function lod0AabbSize(doc) {
  const nodes = doc.nodes || [];
  const meshes = doc.meshes || [];
  const accessors = doc.accessors || [];
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const node of nodes) {
    const name = (node.name || '').toLowerCase();
    if (!(name.startsWith('lod0') || name.includes('lod0_'))) continue;
    if (node.mesh == null) continue;
    const mesh = meshes[node.mesh];
    for (const prim of mesh.primitives || []) {
      const pos = prim.attributes?.POSITION;
      if (pos == null) continue;
      const a = accessors[pos];
      if (!a?.min || !a?.max) continue;
      any = true;
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], a.min[i]);
        max[i] = Math.max(max[i], a.max[i]);
      }
    }
  }
  if (!any) return null;
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}

function textureMetrics(doc) {
  const images = doc.images || [];
  const textures = doc.textures || [];
  let ktx2 = 0;
  for (const img of images) {
    const mime = (img.mimeType || '').toLowerCase();
    if (mime.includes('ktx') || mime.includes('basis')) ktx2 += 1;
  }
  const bvs = doc.bufferViews || [];
  const meshoptViews = bvs.filter((bv) => bv.extensions?.EXT_meshopt_compression).length;
  return {
    imageCount: images.length,
    textureCount: textures.length,
    ktx2ImageCount: ktx2,
    meshoptBufferViewCount: meshoptViews,
    extensionsUsed: doc.extensionsUsed || [],
  };
}

function auditGlb(abs, ship, { isRelease = false, sourceMetrics = null } = {}) {
  const doc = readGlbJson(abs);
  const assetExtras = doc.asset?.extras || {};
  const sf = assetExtras.spacefaceAsset || doc.scenes?.[0]?.extras?.spacefaceAsset || {};
  const materials = (doc.materials || []).map((m) => m.name);
  const nodes = doc.nodes || [];
  const meshes = doc.meshes || [];
  const sockets = nodes.map((n) => n.name).filter((n) => n && n.startsWith('SOCKET_') && !n.includes('.'));
  const label = isRelease ? `${ship.id}[release]` : `${ship.id}[source]`;

  let totalTris = 0;
  let hullTris = 0;
  let tangents = 0;
  let uvs = 0;
  let prims = 0;
  const lodTris = { lod0: 0, lod1: 0, lod2: 0 };
  const damageRoles = new Set();
  let hasDrive = false;
  let hasGun = false;
  let hasMining = false;
  let hasTether = false;
  let collisionNode = null;

  for (const mesh of meshes) totalTris += meshTris(doc, mesh);

  const worldCache = new Map();
  nodes.forEach((node, idx) => {
    const name = node.name || '';
    const extras = node.extras || {};
    const nsf = extras.spaceface || {};

    if (name === 'COLLISION_HULL' || nsf.collision || extras.collision) {
      collisionNode = { node, idx, extras, nsf };
    }

    if (node.mesh == null) return;
    const mesh = meshes[node.mesh];
    const lname = name.toLowerCase();
    const matNames = (mesh.primitives || []).map((p) => {
      if (p.material == null) return '';
      return (doc.materials[p.material]?.name || '').toLowerCase();
    }).join(' ');
    const token = `${lname} ${(mesh.name || '').toLowerCase()} ${matNames}`;
    const tris = meshTris(doc, mesh);

    if (token.includes('material_hull') && !/(antenna|decal|canopy|lens|clamp|brace|identity|cockpit|collision)/.test(token)) {
      hullTris += tris;
    }

    let lod = nsf.lod;
    if (!lod) {
      if (lname.startsWith('lod0') || lname.includes('lod0_')) lod = 'lod0';
      else if (lname.startsWith('lod1') || lname.includes('lod1_')) lod = 'lod1';
      else if (lname.startsWith('lod2') || lname.includes('lod2_')) lod = 'lod2';
    }
    if (lod && lodTris[lod] != null) lodTris[lod] += tris;

    if (nsf.damageRole) damageRoles.add(nsf.damageRole);
    if (nsf.drive || lname.includes('hook_drive')) hasDrive = true;
    if (lname.includes('gun_assembly') || nsf.damageRole === 'secondary') hasGun = true;
    if (lname.includes('mining_emitter') || nsf.damageRole === 'mining') hasMining = true;
    if (lname.includes('hook_tether') || lname.includes('tether_emitter') || nsf.tether) hasTether = true;

    for (const prim of mesh.primitives || []) {
      prims += 1;
      const attrs = prim.attributes || {};
      if (attrs.TANGENT != null) tangents += 1;
      if (attrs.TEXCOORD_0 != null) uvs += 1;
    }
  });

  // --- identity ---
  if (sf.assetId !== ship.assetId && assetExtras.assetId !== ship.assetId) {
    fail(`${label}: spacefaceAsset.assetId expected ${ship.assetId}, got ${sf.assetId || assetExtras.assetId}`);
  }
  if (totalTris < 1000) fail(`${label}: totalTriangles too low (${totalTris})`);
  if (hullTris < 800) fail(`${label}: hullTriangles ${hullTris} < 800 (accessory-only trap)`);

  // --- sockets present ---
  for (const s of REQUIRED_SOCKETS) {
    if (!sockets.includes(s)) fail(`${label}: missing socket ${s}`);
  }

  // --- socket world axes / positions / forwards ---
  nodes.forEach((node, idx) => {
    const name = node.name || '';
    if (!REQUIRED_SOCKETS.includes(name)) return;
    const rule = SOCKET_AXIS_RULES[name];
    if (!rule) return;
    const world = nodeWorldTranslation(doc, idx, worldCache);
    const extras = node.extras || {};
    const nsf = extras.spaceface || {};
    const forward = extras.forward || nsf.forward;
    if (!forward || !vecNear(forward, rule.forward)) {
      fail(`${label}: ${name} forward expected ${JSON.stringify(rule.forward)}, got ${JSON.stringify(forward)}`);
    }
    if (!rule.pos(world)) {
      fail(`${label}: ${name} world position ${world.map((v) => Number(v).toFixed(3))} fails rule (${rule.label})`);
    } else {
      ok(`${label}: ${name} @ [${world.map((v) => Number(v).toFixed(2)).join(',')}] fwd=${JSON.stringify(forward)}`);
    }
  });

  // Port must be more negative Z than Starboard
  const portNode = nodes.find((n) => n.name === 'SOCKET_RCS_Port');
  const stbdNode = nodes.find((n) => n.name === 'SOCKET_RCS_Starboard');
  if (portNode && stbdNode) {
    const pi = nodes.indexOf(portNode);
    const si = nodes.indexOf(stbdNode);
    const pt = nodeWorldTranslation(doc, pi, worldCache);
    const st = nodeWorldTranslation(doc, si, worldCache);
    if (!(pt[2] < st[2])) {
      fail(`${label}: RCS Port Z (${pt[2]}) must be < Starboard Z (${st[2]})`);
    }
  }

  // --- materials ---
  for (const m of ['Material_Hull', 'Material_Mechanical', 'Material_Cyan']) {
    if (!materials.includes(m)) fail(`${label}: missing material ${m}`);
  }

  // --- LOD set + monotonicity ---
  if (lodTris.lod0 <= 0 || lodTris.lod1 <= 0 || lodTris.lod2 <= 0) {
    fail(`${label}: incomplete LOD tris ${JSON.stringify(lodTris)}`);
  } else if (!(lodTris.lod0 > lodTris.lod1 && lodTris.lod1 > lodTris.lod2)) {
    fail(`${label}: LOD not monotonic lod0>lod1>lod2: ${JSON.stringify(lodTris)}`);
  } else {
    ok(`${label}: LOD monotonic ${lodTris.lod0}>${lodTris.lod1}>${lodTris.lod2}`);
  }

  // --- LOD0 AABB: length X dominant, height Y, beam Z ---
  // Prefer stamped float bounds (survive meshopt quantization); accessor min/max are
  // unusable when KHR_mesh_quantization is present (they report quantized integer range).
  const quantized = (doc.extensionsUsed || []).includes('KHR_mesh_quantization');
  const stampedAabb = Array.isArray(sf.lod0AabbSize) ? sf.lod0AabbSize.map(Number) : null;
  let aabb = stampedAabb && stampedAabb.length === 3 && stampedAabb.every((v) => Number.isFinite(v) && v > 0)
    ? stampedAabb
    : null;
  if (!aabb && !quantized) aabb = lod0AabbSize(doc);
  if (!aabb && quantized && sourceMetrics?.lod0AabbSize) {
    aabb = sourceMetrics.lod0AabbSize;
  }
  if (!aabb) {
    fail(`${label}: could not measure LOD0 AABB (stamped lod0AabbSize missing; quantized=${quantized})`);
  } else {
    const [lenX, heightY, beamZ] = aabb;
    if (!(lenX > heightY && lenX > beamZ)) {
      fail(`${label}: LOD0 AABB length not dominant on X: L=${lenX.toFixed(3)} H=${heightY.toFixed(3)} B=${beamZ.toFixed(3)}`);
    } else {
      ok(`${label}: LOD0 AABB Lx=${lenX.toFixed(2)} Hy=${heightY.toFixed(2)} Bz=${beamZ.toFixed(2)}`);
    }
    if (heightY < 0.5) fail(`${label}: LOD0 height Y too small (${heightY})`);
    if (beamZ < 0.5) fail(`${label}: LOD0 beam Z too small (${beamZ})`);
  }

  // --- collision hull ---
  if (!collisionNode) {
    fail(`${label}: missing COLLISION_HULL helper`);
  } else {
    const { node, nsf, extras } = collisionNode;
    if (!(nsf.collision || extras.collision)) {
      fail(`${label}: COLLISION_HULL missing collision extras`);
    }
    if (!(nsf.nonRender || extras.nonRender || nsf.helper)) {
      fail(`${label}: COLLISION_HULL missing nonRender/helper extras`);
    }
    if (node.mesh == null) {
      fail(`${label}: COLLISION_HULL has no mesh (not measurable)`);
    } else {
      // Prefer stamped float bounds (quantize-safe)
      let size = null;
      const stamped = nsf.bounds?.size || extras.bounds?.size || sf.collisionBounds?.size;
      if (Array.isArray(stamped) && stamped.length === 3) {
        size = stamped.map(Number);
      } else if (!quantized) {
        const mesh = meshes[node.mesh];
        let mins = [Infinity, Infinity, Infinity];
        let maxs = [-Infinity, -Infinity, -Infinity];
        let okBounds = false;
        for (const prim of mesh.primitives || []) {
          const pos = prim.attributes?.POSITION;
          if (pos == null) continue;
          const a = doc.accessors[pos];
          if (!a?.min || !a?.max) continue;
          okBounds = true;
          for (let i = 0; i < 3; i++) {
            mins[i] = Math.min(mins[i], a.min[i]);
            maxs[i] = Math.max(maxs[i], a.max[i]);
          }
        }
        if (okBounds) size = [maxs[0] - mins[0], maxs[1] - mins[1], maxs[2] - mins[2]];
      }
      if (!size) {
        fail(`${label}: COLLISION_HULL has no measurable float bounds (need extras.bounds under quantization)`);
      } else if (size.some((s) => s < 0.2)) {
        fail(`${label}: COLLISION_HULL bounds too small: ${size.map((s) => s.toFixed(3))}`);
      } else {
        ok(`${label}: COLLISION_HULL size ${size.map((s) => s.toFixed(2)).join('×')}`);
      }
    }
  }

  // --- damage / keep-separate roles ---
  if (!hasDrive) fail(`${label}: missing drive keep-separate role (HOOK_DRIVE_*)`);
  if (!hasGun) fail(`${label}: missing gun keep-separate role`);
  if (ship.key === 'rig' && !hasTether) fail(`${label}: missing tether keep-separate role`);

  if (uvs < prims) fail(`${label}: only ${uvs}/${prims} prims have TEXCOORD_0`);
  if (tangents < prims) warn(`${label}: only ${tangents}/${prims} prims have TANGENT`);

  // --- textures / meshopt (release-specific) ---
  const tex = textureMetrics(doc);
  if (isRelease) {
    if (!tex.extensionsUsed.includes('EXT_meshopt_compression')) {
      fail(`${label}: extensionsUsed missing EXT_meshopt_compression`);
    }
    if (tex.meshoptBufferViewCount < 1) {
      fail(`${label}: no meshopt-compressed bufferViews (${tex.meshoptBufferViewCount})`);
    } else {
      ok(`${label}: meshopt bufferViews=${tex.meshoptBufferViewCount}`);
    }
    if (sourceMetrics) {
      if (tex.textureCount !== sourceMetrics.textureCount) {
        fail(`${label}: texture count mismatch source=${sourceMetrics.textureCount} release=${tex.textureCount}`);
      } else {
        ok(`${label}: texture count parity ${tex.textureCount}`);
      }
    }
    if (tex.textureCount > 0) {
      if (tex.ktx2ImageCount !== tex.imageCount) {
        fail(`${label}: non-KTX2 release textures: ktx2=${tex.ktx2ImageCount}/${tex.imageCount}`);
      } else {
        ok(`${label}: all ${tex.ktx2ImageCount} images KTX2`);
      }
    } else if (sourceMetrics && sourceMetrics.textureCount > 0) {
      fail(`${label}: release lost all textures (source had ${sourceMetrics.textureCount})`);
    }
  } else {
    if (tex.textureCount < 1) fail(`${label}: source has no textures`);
    else ok(`${label}: source textures=${tex.textureCount} images=${tex.imageCount}`);
  }

  ok(`${label}: tris=${totalTris} hull=${hullTris} sockets=${sockets.length} mats=${materials.length}`);
  return {
    totalTris,
    hullTris,
    sockets,
    materials,
    lodTris,
    tangents,
    uvs,
    prims,
    bytes: statSync(abs).size,
    aabb,
    lod0AabbSize: aabb,
    textureMetrics: tex,
    damageRoles: [...damageRoles],
    hasDrive,
    hasGun,
    hasMining,
    hasTether,
  };
}

// --- Reproducible authoring + evidence ---
mustExist('assets/ships/m4_ashline/DESIGN.md');
mustExist('assets/ships/m4_ashline/PROVENANCE.json');
mustExist('tools/blender/build_m4_ashline_family.py');
mustExist('tools/art/finalize_m4_ashline_candidate.mjs');
mustExist('assets/ships/m4_ashline/blender/ashline_family_kit.blend');

// Reject stale .blend1 backups under family tree
function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}
const blend1s = walkFiles(FAMILY).filter((p) => p.endsWith('.blend1'));
if (blend1s.length) {
  fail(`stale .blend1 backups present: ${blend1s.map((p) => p.replace(ROOT + '\\', '').replace(ROOT + '/', '')).join(', ')}`);
} else {
  ok('no stale .blend1 backups');
}

for (const ship of SHIPS) {
  const blend = mustExist(`assets/ships/m4_ashline/blender/${ship.id}_production.blend`);
  const source = mustExist(`assets/ships/m4_ashline/source/wholeships/${ship.id}.glb`);
  const candidate = mustExist(`assets/ships/m4_ashline/release_candidates/wholeships/${ship.id}.glb`);
  const canonicalSource = mustExist(`assets/ships/parts/wholeships/${ship.id}.glb`);
  const canonicalRelease = mustExist(`assets/ships/release/parts/wholeships/${ship.id}.glb`);
  const metrics = mustExist(`assets/ships/m4_ashline/evidence/${ship.key}/production_metrics.json`);
  const summary = mustExist(`assets/ships/m4_ashline/evidence/${ship.key}/build_summary.json`);
  const rendersDir = resolve(FAMILY, `evidence/${ship.key}/renders`);
  if (!existsSync(rendersDir)) {
    fail(`missing renders dir for ${ship.id}`);
  } else {
    const pngs = readdirSync(rendersDir).filter((f) => f.endsWith('.png') && !f.startsWith('.'));
    if (pngs.length < 5) fail(`${ship.id}: expected ≥5 evidence PNGs, got ${pngs.length}`);
    else ok(`${ship.id}: ${pngs.length} evidence renders`);
    for (const need of ['forward_34.png', 'readability_under45px.png', 'readability_120px.png', 'gamesky_forward_34.png']) {
      if (!pngs.includes(need)) fail(`${ship.id}: missing render ${need}`);
    }
  }
  let sourceAudit = null;
  if (source) sourceAudit = auditGlb(source, ship, { isRelease: false });
  if (candidate) {
    auditGlb(candidate, ship, {
      isRelease: true,
      sourceMetrics: {
        ...(sourceAudit?.textureMetrics || {}),
        lod0AabbSize: sourceAudit?.lod0AabbSize || sourceAudit?.aabb || null,
      },
    });
  }
  if (canonicalSource) {
    auditGlb(canonicalSource, ship, { isRelease: false });
    if (statSync(canonicalSource).size >= 100_000_000) fail(`${ship.id}: canonical source >=100MB`);
  }
  if (canonicalRelease) {
    auditGlb(canonicalRelease, ship, {
      isRelease: true,
      sourceMetrics: {
        ...(sourceAudit?.textureMetrics || {}),
        lod0AabbSize: sourceAudit?.lod0AabbSize || sourceAudit?.aabb || null,
      },
    });
    if (statSync(canonicalRelease).size >= 100_000_000) fail(`${ship.id}: canonical release >=100MB`);
  }
  if (summary) {
    const s = JSON.parse(readFileSync(summary, 'utf8'));
    if (!s.gateOk) fail(`${ship.id}: build_summary gateOk=false: ${(s.gateErrors || []).join('; ')}`);
  }
  if (metrics) {
    const m = JSON.parse(readFileSync(metrics, 'utf8'));
    if (m.spec?.role !== ship.role) fail(`${ship.id}: metrics role mismatch`);
  }
  if (blend) ok(`blend present: ${ship.id}_production.blend (${statSync(blend).size} bytes)`);
}

// Silhouette distinctness proxy
const summaries = SHIPS.map((s) => {
  const p = resolve(FAMILY, `evidence/${s.key}/build_summary.json`);
  if (!existsSync(p)) return null;
  return { ...s, ...JSON.parse(readFileSync(p, 'utf8')) };
}).filter(Boolean);
if (summaries.length === 3) {
  const triSet = new Set(summaries.map((s) => s.totalTriangles));
  if (triSet.size < 2) warn('all three ships have identical total triangle counts — silhouettes may not be distinct enough');
  else ok(`triangle diversity across family: ${[...triSet].join(', ')}`);
}

// Forbidden path integrity
for (const rel of FORBIDDEN_TOUCH) {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) {
    if (rel.includes('kestrel') || rel.includes('parts_manifest') || rel.includes('partsLibrary')) {
      fail(`protected path missing (unexpected): ${rel}`);
    } else {
      warn(`protected path absent (ok if historical): ${rel}`);
    }
  } else {
    ok(`protected untouched path exists: ${rel}`);
  }
}

const partsManifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'));
const releaseManifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/release/release_manifest.json'), 'utf8'));
const partsSource = readFileSync(resolve(ROOT, 'src/render/partsLibrary.js'), 'utf8');
for (const ship of SHIPS) {
  const file = `wholeships/${ship.id}.glb`;
  if (!(partsManifest.runtimeSlots?.hull || []).includes(file)) fail(`${ship.id}: source runtime hull slot missing`);
  if (!PART_LIBRARY_CONTRACT.slots.hull.includes(file)) fail(`${ship.id}: live preload hull slot missing`);
  if (!partsManifest.parts?.some((part) => part.file === file && part.id === `wholeship_${ship.id}`)) {
    fail(`${ship.id}: source manifest entry missing`);
  }
  if (!releaseManifest.assets?.some((asset) => String(asset.source || '').endsWith(`/parts/${file}`)
    && String(asset.release || '').endsWith(`/release/parts/${file}`))) {
    fail(`${ship.id}: release manifest entry missing`);
  }
  if (!partsSource.includes(file)) fail(`${ship.id}: partsLibrary file mapping missing`);
  for (const enemyId of ship.enemyIds) {
    if (!partsSource.includes(enemyId)) fail(`${ship.id}: live enemy mapping missing ${enemyId}`);
    const selected = wholeShipVisualForEntity({ type: 'ship', data: { lootTableId: enemyId } });
    if (selected?.file !== file || selected?.assetId !== ship.assetId || selected?.required !== true) {
      fail(`${ship.id}: runtime resolver mismatch for ${enemyId}: ${JSON.stringify(selected)}`);
    }
    const record = { url: `assets/ships/release/parts/${file}`, assetId: ship.assetId };
    if (resolveRequiredWholeShipRecord(
      { type: 'ship', data: { lootTableId: enemyId } }, [record], { releaseMode: true },
    ) !== record) fail(`${ship.id}: authored composition did not resolve ${enemyId}`);
  }
}

// Family metrics
const familyMetrics = mustExist('assets/ships/m4_ashline/evidence/family/family_metrics.json');
if (familyMetrics) {
  const fm = JSON.parse(readFileSync(familyMetrics, 'utf8'));
  if ((fm.ships || []).length < 3) fail('family_metrics ships < 3');
  if (fm.promotion?.defaultPlayWired !== true) fail('family_metrics default-play promotion missing');
  if (fm.promotion?.overwritesK0OrHelios) fail('family_metrics claims K0/Helios overwrite');
  ok('family_metrics promotion flags clean');
}

const finalizeReport = resolve(FAMILY, 'evidence/family/finalize_report.json');
if (existsSync(finalizeReport)) {
  const fr = JSON.parse(readFileSync(finalizeReport, 'utf8'));
  for (const f of fr.finalized || []) {
    if (f.meshopt !== 'EXT_meshopt_compression' && f.meshoptBufferViewCount < 1) {
      fail(`finalize_report ${f.id}: meshopt not proven`);
    }
    if (f.sourceTextureCount > 0 && f.ktx2ImageCount < 1) {
      fail(`finalize_report ${f.id}: no KTX2 images reported`);
    }
  }
  ok('finalize_report present and checked');
} else {
  fail('missing evidence/family/finalize_report.json — run finalize_m4_ashline_candidate.mjs');
}

const report = {
  schema: 'spaceface.m4AshlineCheck.v1',
  packet: 'M4-ASHLINE-HOSTILE-VISUAL-FAMILY-001',
  ok: errors.length === 0,
  errorCount: errors.length,
  warningCount: warnings.length,
  errors,
  warnings,
  info,
};

console.log(JSON.stringify(report, null, 2));
if (errors.length) {
  console.error(`\ncheck-m4-ashline-family: FAIL (${errors.length} errors)`);
  process.exit(1);
}
console.error(`\ncheck-m4-ashline-family: PASS (${warnings.length} warnings)`);
process.exit(0);
