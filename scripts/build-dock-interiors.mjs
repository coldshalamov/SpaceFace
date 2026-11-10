#!/usr/bin/env node
// Procedural shipyard dock-interior GLBs for the station ship-preview viewport.
// Contract: parts_manifest.json place category; finalize via tools/art/finalize_part.mjs.
import { writeFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { PNG } from 'pngjs';

import { Document, NodeIO } from '@gltf-transform/core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'assets/ships/parts/places');
const MANIFEST_PATH = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');

mkdirSync(OUT_DIR, { recursive: true });

function boxVerts(w, h, d) {
  const hw = w / 2; const hh = h / 2; const hd = d / 2;
  return new Float32Array([
    -hw, -hh, hd, hw, -hh, hd, hw, hh, hd, -hw, hh, hd,
    -hw, -hh, -hd, -hw, hh, -hd, hw, hh, -hd, hw, -hh, -hd,
    -hw, hh, hd, hw, hh, hd, hw, hh, -hd, -hw, hh, -hd,
    -hw, -hh, hd, -hw, -hh, -hd, hw, -hh, -hd, hw, -hh, hd,
    hw, -hh, hd, hw, -hh, -hd, hw, hh, -hd, hw, hh, hd,
    -hw, -hh, hd, -hw, hh, hd, -hw, hh, -hd, -hw, -hh, -hd,
  ]);
}
const BOX_IDX = new Uint16Array([
  0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11,
  12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23,
]);
const BOX_NORMALS = new Float32Array([
  0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
  0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
  1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
  -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
]);
const BOX_UVS = new Float32Array([
  0, 0, 1, 0, 1, 1, 0, 1,
  0, 0, 1, 0, 1, 1, 0, 1,
  0, 0, 1, 0, 1, 1, 0, 1,
  0, 0, 1, 0, 1, 1, 0, 1,
  0, 0, 1, 0, 1, 1, 0, 1,
  0, 0, 1, 0, 1, 1, 0, 1,
]);

function transformVerts(verts, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
  const out = new Float32Array(verts.length);
  const cx = Math.cos(rx); const sx = Math.sin(rx);
  const cy = Math.cos(ry); const sy = Math.sin(ry);
  const cz = Math.cos(rz); const sz = Math.sin(rz);
  for (let i = 0; i < verts.length; i += 3) {
    let px = verts[i]; let py = verts[i + 1]; let pz = verts[i + 2];
    let tx = px; let ty = cy * py - sy * pz; let tz = sy * py + cy * pz;
    px = cz * tx + sz * tz; py = ty; pz = -sz * tx + cz * tz;
    tx = px; ty = cx * py - sx * pz; tz = sx * py + cx * pz;
    out[i] = tx + x; out[i + 1] = ty + y; out[i + 2] = tz + z;
  }
  return out;
}

function transformNormals(normals, opts = {}) {
  const out = transformVerts(normals, { ...opts, x: 0, y: 0, z: 0 });
  for (let i = 0; i < out.length; i += 3) {
    const len = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= len;
    out[i + 1] /= len;
    out[i + 2] /= len;
  }
  return out;
}

function pngRgba(width, height, fillFn) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fillFn(x, y);
      const idx = (width * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

function makeDockTextures(seed) {
  const size = 256;
  const base = pngRgba(size, size, (x, y) => {
    const n = ((x + seed * 3) * 0.04 + Math.sin((y + seed) * 0.05) * 4) & 255;
    return [110 + (n % 18), 118 + (n % 14), 128 + (n % 12), 255];
  });
  const normal = pngRgba(size, size, () => [128, 128, 255, 255]);
  const orm = pngRgba(size, size, (x, y) => {
    const stripe = ((x + y + seed) % 17) < 2 ? 200 : 140;
    return [stripe, 170, 90, 255];
  });
  return { base, normal, orm };
}

function buildDoc(parts, matDefs, seed) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const textures = makeDockTextures(seed);
  const tex = {
    base: doc.createTexture('tex_base').setMimeType('image/png').setImage(textures.base),
    normal: doc.createTexture('tex_normal').setMimeType('image/png').setImage(textures.normal),
    orm: doc.createTexture('tex_orm').setMimeType('image/png').setImage(textures.orm),
  };
  const mats = {};
  for (const [name, spec] of Object.entries(matDefs)) {
    const mat = doc.createMaterial().setName(name)
      .setBaseColorFactor(spec.color)
      .setMetallicFactor(spec.metal)
      .setRoughnessFactor(spec.rough);
    if (spec.emissive) mat.setEmissiveFactor(spec.emissive);
    if (spec.textured) {
      mat.setBaseColorTexture(tex.base)
        .setNormalTexture(tex.normal)
        .setMetallicRoughnessTexture(tex.orm)
        .setOcclusionTexture(tex.orm);
    }
    mats[name] = mat;
  }
  const scene = doc.createScene('Scene');
  const root = doc.createNode('DockInterior_ROOT');
  scene.addChild(root);
  root.addChild(doc.createNode('HOOK_Emissive'));
  root.addChild(doc.createNode('SOCKET_Structure_Core'));
  let primIdx = 0;
  for (const p of parts) {
    const base = boxVerts(p.w, p.h, p.d);
    const pos = transformVerts(base, p);
    const posAcc = doc.createAccessor(`pos_${primIdx}`).setType('VEC3').setArray(pos).setBuffer(buffer);
    const normalAcc = doc.createAccessor(`normal_${primIdx}`).setType('VEC3')
      .setArray(transformNormals(BOX_NORMALS, p))
      .setBuffer(buffer);
    const uvAcc = doc.createAccessor(`uv_${primIdx}`).setType('VEC2').setArray(BOX_UVS).setBuffer(buffer);
    const idxAcc = doc.createAccessor(`idx_${primIdx}`).setType('SCALAR').setArray(BOX_IDX).setBuffer(buffer);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', posAcc)
      .setAttribute('NORMAL', normalAcc)
      .setAttribute('TEXCOORD_0', uvAcc)
      .setIndices(idxAcc)
      .setMaterial(mats[p.mat]);
    const mesh = doc.createMesh(`LOD0_${p.name || primIdx}`).addPrimitive(prim);
    const node = doc.createNode(p.name || `part_${primIdx}`).setMesh(mesh);
    root.addChild(node);
    primIdx++;
  }
  return doc;
}

function addGreebles(parts, count, seed, bounds) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
  for (let i = 0; i < count; i++) {
    parts.push({
      name: `Greeble_${i}`,
      w: 0.3 + rnd() * 0.7,
      h: 0.12 + rnd() * 0.45,
      d: 0.3 + rnd() * 0.7,
      mat: rnd() > 0.7 ? 'Material_Accent' : 'Material_Mechanical',
      x: (rnd() - 0.5) * bounds[0],
      y: 1 + rnd() * bounds[1],
      z: (rnd() - 0.5) * bounds[2],
      rz: (rnd() - 0.5) * 0.35,
    });
  }
}

/** Shared hangar shell — camera sits starboard-aft-above origin; ship turntable at pad centre. */
function dockShellParts() {
  return [
    { name: 'Deck_Main', w: 52, h: 0.45, d: 36, mat: 'Material_Mechanical', y: -4.2 },
    { name: 'Pad_Strip_X', w: 20, h: 0.1, d: 0.5, mat: 'Material_Accent', y: -3.88 },
    { name: 'Pad_Strip_Z', w: 0.5, h: 0.1, d: 20, mat: 'Material_Accent', y: -3.88 },
    { name: 'Pad_Corner_L', w: 3, h: 0.12, d: 3, mat: 'Material_Accent', y: -3.86, x: -9, z: -9 },
    { name: 'Pad_Corner_R', w: 3, h: 0.12, d: 3, mat: 'Material_Accent', y: -3.86, x: -9, z: 9 },
    { name: 'Pad_Corner_F', w: 3, h: 0.12, d: 3, mat: 'Material_Accent', y: -3.86, x: 9, z: -9 },
    { name: 'Pad_Corner_B', w: 3, h: 0.12, d: 3, mat: 'Material_Accent', y: -3.86, x: 9, z: 9 },
    { name: 'Wall_Port', w: 48, h: 15, d: 0.65, mat: 'Material_Hull', y: 3.5, z: -17 },
    { name: 'Wall_Stbd_A', w: 28, h: 15, d: 0.65, mat: 'Material_Hull', y: 3.5, z: 17, x: -10 },
    { name: 'Wall_Stbd_B', w: 14, h: 15, d: 0.65, mat: 'Material_Hull', y: 3.5, z: 17, x: 16 },
    { name: 'Bulkhead_Fwd', w: 0.65, h: 17, d: 34, mat: 'Material_Hull', x: 24, y: 4.5 },
    { name: 'Bay_Glass', w: 0.35, h: 11, d: 16, mat: 'Material_Glass', x: 23.6, y: 2.5 },
    { name: 'Gantry_A', w: 42, h: 0.85, d: 1.3, mat: 'Material_Mechanical', y: 12.5, z: -9 },
    { name: 'Gantry_B', w: 42, h: 0.85, d: 1.3, mat: 'Material_Mechanical', y: 12.5, z: 9 },
    { name: 'Gantry_C', w: 1.3, h: 0.85, d: 32, mat: 'Material_Mechanical', y: 12.5, x: -6 },
    { name: 'Crane_Boom', w: 10, h: 1.1, d: 1.6, mat: 'Material_Mechanical', y: 11.8, x: 6, z: -6 },
    { name: 'Crane_Tower', w: 1.6, h: 4.5, d: 1.6, mat: 'Material_Mechanical', y: 9.2, x: 11, z: -6 },
    { name: 'Clamp_Port', w: 2.2, h: 1.8, d: 4.5, mat: 'Material_Mechanical', x: -4, y: -1.2, z: -7 },
    { name: 'Clamp_Stbd', w: 2.2, h: 1.8, d: 4.5, mat: 'Material_Mechanical', x: -4, y: -1.2, z: 7 },
    { name: 'Light_Port', w: 42, h: 0.18, d: 0.35, mat: 'Material_Accent', y: 9, z: -16.5 },
    { name: 'Light_Stbd', w: 42, h: 0.18, d: 0.35, mat: 'Material_Accent', y: 9, z: 16.5 },
    { name: 'Pipe_A', w: 28, h: 0.4, d: 0.4, mat: 'Material_Accent', y: 10.8, z: -5 },
    { name: 'Pipe_B', w: 28, h: 0.4, d: 0.4, mat: 'Material_Accent', y: 10.8, z: 5 },
    { name: 'Catwalk', w: 32, h: 0.22, d: 0.55, mat: 'Material_Mechanical', y: 6.2, z: -15.8, x: -6 },
    { name: 'BaySil_A', w: 7, h: 5.5, d: 9, mat: 'Material_Mechanical', x: 19, y: -0.5, z: -11, ry: 0.12 },
    { name: 'BaySil_B', w: 5.5, h: 4.5, d: 7, mat: 'Material_Mechanical', x: 19, y: 0, z: 12, ry: -0.08 },
    { name: 'BaySil_C', w: 4, h: 3.5, d: 5, mat: 'Material_Hull', x: 20, y: 1.2, z: 0, ry: 0.05 },
    { name: 'Vent_A', w: 1.2, h: 2.5, d: 1.2, mat: 'Material_Mechanical', x: -14, y: 5, z: -14 },
    { name: 'Vent_B', w: 1.2, h: 2.5, d: 1.2, mat: 'Material_Mechanical', x: -14, y: 5, z: 14 },
  ];
}

const MATERIAL_PRESETS = {
  industrial: {
    Material_Hull: { color: [1, 1, 1, 1], metal: 0.62, rough: 0.48, textured: true },
    Material_Accent: { color: [0.22, 0.82, 1, 1], metal: 0.35, rough: 0.35, emissive: [0.07, 0.2, 0.27] },
    Material_Glass: { color: [0.67, 0.83, 1, 0.55], metal: 0.1, rough: 0.08 },
    Material_Mechanical: { color: [0.35, 0.38, 0.41, 1], metal: 0.75, rough: 0.55 },
  },
  military: {
    Material_Hull: { color: [1, 1, 1, 1], metal: 0.7, rough: 0.52, textured: true },
    Material_Accent: { color: [1, 0.55, 0.2, 1], metal: 0.4, rough: 0.4, emissive: [0.25, 0.1, 0.02] },
    Material_Glass: { color: [0.55, 0.65, 0.72, 0.45], metal: 0.15, rough: 0.1 },
    Material_Mechanical: { color: [0.28, 0.3, 0.33, 1], metal: 0.8, rough: 0.6 },
  },
  grit: {
    Material_Hull: { color: [1, 1, 1, 1], metal: 0.55, rough: 0.72, textured: true },
    Material_Accent: { color: [0.95, 0.38, 0.12, 1], metal: 0.3, rough: 0.5, emissive: [0.18, 0.05, 0.01] },
    Material_Glass: { color: [0.45, 0.4, 0.38, 0.35], metal: 0.05, rough: 0.2 },
    Material_Mechanical: { color: [0.22, 0.21, 0.2, 1], metal: 0.65, rough: 0.78 },
  },
};

const DOCK_VARIANTS = [
  { id: 'place_dock_interior', preset: 'industrial', note: 'Default trade/refinery/fab hangar bay for shipyard preview.' },
  { id: 'place_dock_interior_military', preset: 'military', note: 'Armored military dock — amber warning accents.' },
  { id: 'place_dock_interior_grit', preset: 'grit', note: 'Black-market grit dock — scuffed plates, dim heat lamps.' },
];

const io = new NodeIO();
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const template = manifest.parts.find((p) => p.id === 'place_lane_beacon');
const built = [];

for (const variant of DOCK_VARIANTS) {
  const parts = dockShellParts();
  addGreebles(parts, 24, variant.id.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 11), [44, 10, 30]);
  const outPath = resolve(OUT_DIR, `${variant.id}.glb`);
  const doc = buildDoc(parts, MATERIAL_PRESETS[variant.preset], variant.id.length * 17);
  await io.write(outPath, doc);
  const bytes = statSync(outPath).size;
  const root = doc.getRoot();
  let tris = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      if (idx) tris += idx.getCount() / 3;
    }
  }
  const bounds = { min: [-26, -5, -18], max: [25, 14, 18], dimensionsM: [51, 19, 36] };
  built.push({ ...variant, file: `places/${variant.id}.glb`, tris: Math.round(tris), bytes, bounds });
  console.log(`built ${variant.id}: ${tris} tris, ${bytes} bytes`);
}

const existingIds = new Set(manifest.parts.map((p) => p.id));
for (const b of built) {
  if (existingIds.has(b.id)) {
    const part = manifest.parts.find((p) => p.id === b.id);
    part.tris = b.tris;
    part.bytes = b.bytes;
    part.bounds = b.bounds;
    part.hooks = ['HOOK_Emissive'];
    part.sockets = ['SOCKET_Structure_Core'];
    continue;
  }
  manifest.parts.push({
    id: b.id,
    category: 'places',
    priority: 'P0',
    file: b.file,
    tris: b.tris,
    bytes: b.bytes,
    textureSize: 1024,
    tintable: { hull: 'Material_Hull', accent: 'Material_Accent' },
    factionAccentVariants: template?.factionAccentVariants || {},
    hooks: ['HOOK_Emissive'],
    sockets: ['SOCKET_Structure_Core'],
    mount: 'origin',
    bounds: b.bounds,
    note: b.note,
  });
  existingIds.add(b.id);
}

const placeSlot = manifest.runtimeSlots?.place || [];
for (const b of built) {
  if (!placeSlot.includes(b.file)) placeSlot.push(b.file);
}
manifest.runtimeSlots.place = placeSlot;

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nUpdated manifest with ${built.length} dock interiors.`);

for (const b of built) {
  const glbPath = resolve(OUT_DIR, `${b.id}.glb`);
  execSync(`node tools/art/finalize_part.mjs "${glbPath}" ${b.id} --method=procedural_fallback`, {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

console.log('\nDock interiors built and finalized. Run: npm run build:sg04:release-assets');
