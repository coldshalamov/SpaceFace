#!/usr/bin/env node
// Build distinct world station/gate archetype source GLBs (Blender MCP fallback).
// Uses @gltf-transform (Node-safe). Contract: parts_manifest.json.
import { writeFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function buildDoc(parts) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mats = {
    Material_Hull: doc.createMaterial().setName('Material_Hull').setBaseColorFactor([0.54, 0.58, 0.66, 1]).setMetallicFactor(0.62).setRoughnessFactor(0.48),
    Material_Accent: doc.createMaterial().setName('Material_Accent').setBaseColorFactor([0.22, 0.82, 1, 1]).setMetallicFactor(0.35).setRoughnessFactor(0.35).setEmissiveFactor([0.07, 0.2, 0.27]),
    Material_Glass: doc.createMaterial().setName('Material_Glass').setBaseColorFactor([0.67, 0.83, 1, 0.55]).setMetallicFactor(0.1).setRoughnessFactor(0.08),
    Material_Mechanical: doc.createMaterial().setName('Material_Mechanical').setBaseColorFactor([0.35, 0.38, 0.41, 1]).setMetallicFactor(0.75).setRoughnessFactor(0.55),
  };
  const scene = doc.createScene('Scene');
  const root = doc.createNode('Root');
  scene.addChild(root);
  let primIdx = 0;
  for (const p of parts) {
    const base = boxVerts(p.w, p.h, p.d);
    const pos = transformVerts(base, p);
    const posAcc = doc.createAccessor(`pos_${primIdx}`).setType('VEC3').setArray(pos).setBuffer(buffer);
    const idxAcc = doc.createAccessor(`idx_${primIdx}`).setType('SCALAR').setArray(BOX_IDX).setBuffer(buffer);
    const prim = doc.createPrimitive().setAttribute('POSITION', posAcc).setIndices(idxAcc).setMaterial(mats[p.mat]);
    const mesh = doc.createMesh(`mesh_${primIdx}`).addPrimitive(prim);
    const node = doc.createNode(`part_${primIdx}`).setMesh(mesh);
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
      w: 0.25 + rnd() * 0.55,
      h: 0.15 + rnd() * 0.35,
      d: 0.25 + rnd() * 0.55,
      mat: rnd() > 0.65 ? 'Material_Accent' : 'Material_Mechanical',
      x: (rnd() - 0.5) * bounds[0],
      y: 0.5 + rnd() * bounds[1],
      z: (rnd() - 0.5) * bounds[2],
      rz: (rnd() - 0.5) * 0.4,
    });
  }
}

const ARCHETYPES = {
  place_station_trade_hub: [
    { w: 4.4, h: 8, d: 4.4, mat: 'Material_Hull', y: 4 },
    { w: 10, h: 0.6, d: 10, mat: 'Material_Mechanical', y: 1.2 },
    { w: 8, h: 0.4, d: 1.2, mat: 'Material_Accent', y: 3.5 },
    { w: 1.2, h: 0.5, d: 6, mat: 'Material_Glass', y: 7.5, z: 3.2 },
    { w: 1.2, h: 0.5, d: 6, mat: 'Material_Glass', y: 7.5, z: -3.2 },
  ],
  place_station_refinery: [
    { w: 14, h: 3, d: 10, mat: 'Material_Hull', y: 1.5 },
    { w: 2.2, h: 9, d: 2.2, mat: 'Material_Mechanical', x: -4, y: 6, z: -2 },
    { w: 1.8, h: 11, d: 1.8, mat: 'Material_Mechanical', x: 2, y: 7, z: 1.5 },
    { w: 1.4, h: 7, d: 1.4, mat: 'Material_Accent', x: 5, y: 5, z: -3 },
    { w: 16, h: 0.5, d: 2, mat: 'Material_Mechanical', y: 0.4, z: 5.5 },
  ],
  place_station_military: [
    { w: 8, h: 6, d: 12, mat: 'Material_Hull', y: 3 },
    { w: 3, h: 8, d: 3, mat: 'Material_Mechanical', x: -5, y: 4.5, rz: 0.35 },
    { w: 3, h: 8, d: 3, mat: 'Material_Mechanical', x: 5, y: 4.5, rz: -0.35 },
    { w: 5, h: 1.2, d: 5, mat: 'Material_Accent', y: 7.5 },
    { w: 12, h: 0.8, d: 14, mat: 'Material_Mechanical', y: 0.5 },
  ],
  place_station_blackmarket: [
    { w: 9, h: 4, d: 7, mat: 'Material_Hull', x: -2, y: 2, z: 1, rz: 0.25 },
    { w: 6, h: 5, d: 5, mat: 'Material_Hull', x: 4, y: 2.5, z: -2, rz: -0.4 },
    { w: 4, h: 3, d: 8, mat: 'Material_Mechanical', y: 1.8, z: 4, rz: 0.6 },
    { w: 2, h: 1.5, d: 3, mat: 'Material_Glass', x: 3, y: 4.2 },
    { w: 11, h: 0.4, d: 9, mat: 'Material_Mechanical', y: 0.3 },
  ],
  place_gate_jump_ring: [
    { w: 24, h: 2.4, d: 24, mat: 'Material_Accent', y: 6 },
    { w: 19, h: 1, d: 19, mat: 'Material_Hull', y: 6 },
    { w: 4, h: 12, d: 4, mat: 'Material_Mechanical', y: 6, z: 12 },
    { w: 4, h: 12, d: 4, mat: 'Material_Mechanical', y: 6, z: -12 },
    { w: 4, h: 2, d: 4, mat: 'Material_Accent', y: 6 },
  ],
  place_station_mining: [
    { w: 7, h: 3, d: 7, mat: 'Material_Hull', y: 1.5 },
    { w: 3, h: 4, d: 3, mat: 'Material_Mechanical', x: -3, y: 3.5 },
    { w: 2, h: 1, d: 5, mat: 'Material_Accent', x: 3, y: 2.5, z: 2 },
  ],
  place_station_fab: [
    { w: 12, h: 4, d: 8, mat: 'Material_Hull', y: 2 },
    { w: 6, h: 6, d: 6, mat: 'Material_Mechanical', x: -4, y: 4 },
    { w: 2, h: 5, d: 2, mat: 'Material_Accent', x: 5, y: 3, z: -2 },
  ],
  place_station_research: [
    { w: 6, h: 7, d: 6, mat: 'Material_Glass', y: 3.5 },
    { w: 9, h: 1, d: 9, mat: 'Material_Hull', y: 0.8 },
    { w: 2, h: 2, d: 2, mat: 'Material_Accent', y: 7.5 },
  ],
};

const io = new NodeIO();
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const built = [];

const GREEBLE_BOUNDS = {
  place_station_trade_hub: [9, 7, 9],
  place_station_refinery: [12, 8, 10],
  place_station_military: [10, 7, 12],
  place_station_blackmarket: [10, 6, 9],
  place_gate_jump_ring: [14, 8, 14],
  place_station_mining: [6, 5, 6],
  place_station_fab: [10, 6, 8],
  place_station_research: [7, 6, 7],
};

for (const [id, baseParts] of Object.entries(ARCHETYPES)) {
  const parts = [...baseParts];
  addGreebles(parts, 42, id.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7), GREEBLE_BOUNDS[id] || [8, 6, 8]);
  const file = `places/${id}.glb`;
  const outPath = resolve(OUT_DIR, `${id}.glb`);
  const doc = buildDoc(parts);
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
  const bounds = { min: [-8, 0, -12], max: [8, 10, 12], dimensionsM: [16, 10, 24] };
  built.push({ id, file, tris: Math.round(tris), bytes, bounds });
  console.log(`built ${id}: ${tris} tris, ${bytes} bytes`);
}

const existingIds = new Set(manifest.parts.map((p) => p.id));
const template = manifest.parts.find((p) => p.id === 'place_lane_beacon');
for (const b of built) {
  if (existingIds.has(b.id)) {
    const part = manifest.parts.find((p) => p.id === b.id);
    part.tris = b.tris;
    part.bytes = b.bytes;
    part.bounds = b.bounds;
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
    note: `World station archetype ${b.id} — story-grounded silhouette.`,
  });
  existingIds.add(b.id);
}

const placeSlot = manifest.runtimeSlots?.place || [];
for (const b of built) {
  if (!placeSlot.includes(b.file)) placeSlot.push(b.file);
}
manifest.runtimeSlots.place = placeSlot;

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nUpdated manifest with ${built.length} archetypes.`);