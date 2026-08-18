#!/usr/bin/env node
// Measure whether a ship's hull is a closed shell, straight from the exported GLB.
//
// WHY THIS EXISTS
// ---------------
// Three independent reviewers rejected Hornet cycle 53 for the same defect, and one of them
// measured it the only way available at the time: masking render-background pixels that are
// enclosed by ship silhouette. It found 74 such regions covering 4.1% of the ship — daylight
// straight through both wings and through the engine collar.
//
// That measurement is correct but expensive and camera-dependent. The same defect is visible in
// the geometry itself: in a closed shell every edge is shared by exactly two triangles. An edge
// used by exactly one triangle is a boundary edge — an actual hole rim. Counting those needs no
// renderer, no Blender, and no camera, and it cannot be gamed by choosing a kinder angle.
//
// Running it on Hornet cycle 53 corrected the reviewer's mechanism: every shell IS watertight
// (0 boundary edges). The daylight is not torn geometry — it is SEPARATE closed bodies that do not
// touch. So the number that matters for "is this one hull or a cage" is the SHELL COUNT: how many
// disconnected pieces a mesh is made of. A continuous fuselage is 1. Four disjoint gloves are 4.
//
// This is a MEASUREMENT, not a pass/fail gate. Authored ships legitimately carry open surfaces and
// separate bodies — folded sheets, canopies, control surfaces. Reporting the numbers is what makes
// the form conversation concrete: "the hull mesh is 37 disconnected pieces" is a fact you can drive
// down, while "it looks like an open cage" is an opinion three reviewers have to relitigate.
//
// Usage:
//   node scripts/measure-hull-shell-closure.mjs <file.glb> [more.glb...]
//   node scripts/measure-hull-shell-closure.mjs --json <file.glb>

import { readFileSync } from 'node:fs';

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) json = JSON.parse(body.toString('utf8'));
    else if (type === BIN_CHUNK) bin = body;
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (!json) throw new Error(`${path} has no JSON chunk`);
  return { json, bin };
}

// Positions ARE needed. glTF splits a vertex wherever normals or UVs differ, so two triangles that
// share a geometric edge usually carry DIFFERENT indices for it. Matching edges by index reports
// every seam as a hole — the first version of this script called a 12-triangle collision box "open
// with 34 boundary edges", which is how that bug was caught. Weld by quantised position first.
function readIndices(json, bin, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const out = new Array(accessor.count);
  for (let i = 0; i < accessor.count; i++) {
    if (accessor.componentType === 5125) out[i] = bin.readUInt32LE(base + i * 4);
    else if (accessor.componentType === 5123) out[i] = bin.readUInt16LE(base + i * 2);
    else out[i] = bin.readUInt8(base + i);
  }
  return out;
}

function readPositions(json, bin, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const view = json.bufferViews[accessor.bufferView];
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const stride = view.byteStride || 12;
  const out = new Array(accessor.count);
  for (let i = 0; i < accessor.count; i++) {
    const at = base + i * stride;
    out[i] = [bin.readFloatLE(at), bin.readFloatLE(at + 4), bin.readFloatLE(at + 8)];
  }
  return out;
}

// Weld tolerance in metres. 0.1 mm is far below any authored feature here and far above float
// round-trip error through the exporter.
const WELD = 1e-4;

function weldMap(positions) {
  const byKey = new Map();
  const welded = new Array(positions.length);
  for (let i = 0; i < positions.length; i++) {
    const [x, y, z] = positions[i];
    const key = `${Math.round(x / WELD)}_${Math.round(y / WELD)}_${Math.round(z / WELD)}`;
    let id = byKey.get(key);
    if (id === undefined) { id = byKey.size; byKey.set(key, id); }
    welded[i] = id;
  }
  return welded;
}

function boundaryEdges(indices, welded) {
  // Undirected edge key over WELDED vertex ids. Winding is irrelevant: two triangles sharing an
  // edge close it whichever way they face, and a flipped normal is a different defect from a hole.
  const counts = new Map();
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const tri = [welded[indices[i]], welded[indices[i + 1]], welded[indices[i + 2]]];
    if (tri[0] === tri[1] || tri[1] === tri[2] || tri[0] === tri[2]) continue; // degenerate
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  let boundary = 0;
  let nonManifold = 0;
  for (const used of counts.values()) {
    if (used === 1) boundary++;
    else if (used > 2) nonManifold++;
  }
  return { edges: counts.size, boundary, nonManifold };
}

// How many disconnected pieces is this mesh? Union-find over welded vertex ids, joined by every
// triangle. One continuous hull returns 1.
function shellCount(indices, welded) {
  const parent = new Map();
  const find = (a) => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(a) !== r) { const next = parent.get(a); parent.set(a, r); a = next; }
    return r;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (let i = 0; i + 2 < indices.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const v = welded[indices[i + e]];
      if (!parent.has(v)) parent.set(v, v);
    }
    const a = welded[indices[i]];
    const b = welded[indices[i + 1]];
    const c = welded[indices[i + 2]];
    union(a, b);
    union(b, c);
  }
  const roots = new Set();
  for (const v of parent.keys()) roots.add(find(v));
  return roots.size;
}

function measure(path) {
  const { json, bin } = readGlb(path);
  const meshes = [];
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      if (prim.indices == null) continue;
      if (prim.attributes.POSITION == null) continue;
      const indices = readIndices(json, bin, prim.indices);
      const welded = weldMap(readPositions(json, bin, prim.attributes.POSITION));
      const stats = boundaryEdges(indices, welded);
      const shells = shellCount(indices, welded);
      meshes.push({
        name: mesh.name || '(unnamed)',
        triangles: indices.length / 3,
        ...stats,
        shells,
        closed: stats.boundary === 0 && stats.nonManifold === 0,
      });
    }
  }
  const totals = meshes.reduce((acc, m) => ({
    triangles: acc.triangles + m.triangles,
    boundary: acc.boundary + m.boundary,
    nonManifold: acc.nonManifold + m.nonManifold,
    shells: acc.shells + m.shells,
  }), { triangles: 0, boundary: 0, nonManifold: 0, shells: 0 });
  return { path, meshes, totals, closedMeshes: meshes.filter((m) => m.closed).length };
}

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const paths = argv.filter((a) => !a.startsWith('--'));
if (paths.length === 0) {
  console.error('usage: node scripts/measure-hull-shell-closure.mjs [--json] <file.glb> [...]');
  process.exit(2);
}

const results = paths.map(measure);
if (asJson) {
  console.log(JSON.stringify({ schema: 'spaceface.hullShellClosure.v1', results }, null, 2));
} else {
  for (const result of results) {
    console.log(result.path);
    for (const mesh of result.meshes) {
      const parts = [];
      if (mesh.boundary) parts.push(`${mesh.boundary} boundary`);
      if (mesh.nonManifold) parts.push(`${mesh.nonManifold} non-manifold`);
      const verdict = parts.length ? `OPEN (${parts.join(', ')})` : 'watertight';
      console.log(`  ${String(mesh.name).padEnd(24)} ${String(mesh.triangles).padStart(7)} tris  `
        + `${String(mesh.shells).padStart(4)} shell(s)  ${verdict}`);
    }
    console.log(`  TOTAL ${result.closedMeshes}/${result.meshes.length} meshes watertight, `
      + `${result.totals.shells} disconnected shells, `
      + `${result.totals.boundary} boundary edges, ${result.totals.nonManifold} non-manifold edges`);
  }
}
