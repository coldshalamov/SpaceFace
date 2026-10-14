import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';

const finiteVector = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
const close = (a, b, epsilon = 2e-4) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < epsilon);
const length = v => Math.hypot(...v);
const normalize = v => v.map(x => x / length(v));
function requireFact(condition, message) { if (!condition) throw new Error(message); }

/** Structural proof only. This does not grant visual or runtime acceptance. */
export async function validateAssetManifest(manifestPath) {
  const row = JSON.parse(await readFile(manifestPath, 'utf8'));
  const context = row.assetId || manifestPath;
  const check = (condition, message) => requireFact(condition, `${context}: ${message}`);
  check(typeof row.assetId === 'string' && /^[a-z0-9_-]+$/.test(row.assetId), 'invalid asset identity');
  check(row.unit === 'metre', 'units must be explicit metres');
  check(typeof row.description === 'string' && row.description.length > 0, 'missing usage description');
  check(finiteVector(row.bounds?.min, 3) && finiteVector(row.bounds?.max, 3), 'invalid bounds');
  check(row.bounds.min.every((x, i) => x <= row.bounds.max[i]), 'reversed bounds');
  check(Array.isArray(row.sockets), 'missing socket contract');
  check(new Set(row.sockets.map(s => s.name)).size === row.sockets.length, 'duplicate socket names');
  for (const s of row.sockets) {
    check(finiteVector(s.position, 3) && finiteVector(s.forward, 3) && finiteVector(s.up, 3), 'invalid socket vectors');
    check(Math.abs(length(s.forward) - 1) < 1e-5 && Math.abs(length(s.up) - 1) < 1e-5, 'socket basis must be normalized');
    check(Math.abs(s.forward.reduce((sum, x, i) => sum + x * s.up[i], 0)) < 1e-5, 'socket basis is degenerate');
  }
  check(['none', 'compound-boxes'].includes(row.collision?.type), 'unknown collision proxy contract');
  check(Array.isArray(row.collision.solids), 'missing collision solids');
  for (const solid of row.collision.solids) {
    check(solid.type === 'box' && finiteVector(solid.center, 3) && finiteVector(solid.size, 3), 'invalid collision box');
    check(solid.size.every(x => x > 0), 'nonpositive collision extent');
    check(finiteVector(solid.rotation, 4) && Math.abs(length(solid.rotation) - 1) < 1e-5, 'invalid collision orientation');
  }
  check(Array.isArray(row.lods) && row.lods.length === 3 && row.lods.every((l, i) => l.level === i), 'expected ordered LOD0/1/2');
  let previousTriangles = Infinity;
  const io = new NodeIO();
  for (const lod of row.lods) {
    check(typeof lod.file === 'string' && path.basename(lod.file) === lod.file && lod.file.endsWith('.glb'), 'unsafe LOD path');
    const bytes = await readFile(path.join(path.dirname(manifestPath), lod.file));
    check(bytes.length === lod.bytes, `LOD${lod.level} byte count differs`);
    check(createHash('sha256').update(bytes).digest('hex') === lod.sha256, `LOD${lod.level} hash differs`);
    const doc = await io.readBinary(bytes);
    const roots = doc.getRoot();
    let triangles = 0, draws = 0;
    for (const mesh of roots.listMeshes()) for (const primitive of mesh.listPrimitives()) {
      check(primitive.getMode() === 4, 'only triangle primitives supported');
      const positions = primitive.getAttribute('POSITION');
      check(positions && positions.getCount() > 0, 'empty geometry');
      check(Array.from(positions.getArray()).every(Number.isFinite), 'nonfinite vertex');
      const indices = primitive.getIndices();
      const count = indices ? indices.getCount() : positions.getCount();
      check(count % 3 === 0, 'incomplete triangle');
      if (indices) check(Array.from(indices.getArray()).every(i => i < positions.getCount()), 'index outside vertex buffer');
      triangles += count / 3; draws++;
      check(primitive.getMaterial(), 'unassigned material');
    }
    check(triangles > 0 && triangles === lod.triangles && draws === lod.draws, `LOD${lod.level} geometry receipt differs`);
    check(triangles <= previousTriangles, 'coarser LOD increases triangle count');
    previousTriangles = triangles;
    const nodes = roots.listNodes();
    for (const socket of row.sockets) {
      const matches = nodes.filter(n => n.getName() === socket.name);
      check(matches.length === 1, `LOD${lod.level} socket ${socket.name} absent or duplicated`);
      const matrix = matches[0].getWorldMatrix();
      check(close(matrix.slice(12, 15), socket.position), `socket ${socket.name} position disagrees with export`);
      check(close(normalize(matrix.slice(0, 3)), socket.forward), `socket ${socket.name} orientation disagrees with export`);
    }
  }
  return { assetId: row.assetId, category: row.category, lods: row.lods.length,
    triangles: row.lods.map(l => l.triangles), bytes: row.lods.reduce((n, l) => n + l.bytes, 0) };
}

export async function validateBank(root) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(p);
      else if (entry.isFile() && entry.name.endsWith('.json')) files.push(p);
    }
  }
  await visit(root);
  requireFact(files.length > 0, 'No model manifests found');
  const result = [];
  for (const file of files.sort()) result.push(await validateAssetManifest(file));
  requireFact(new Set(result.map(r => r.assetId)).size === result.length, 'Duplicate bank asset identity');
  return { assets: result.length, glbs: result.reduce((n, r) => n + r.lods, 0),
    bytes: result.reduce((n, r) => n + r.bytes, 0), results: result };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try { console.log(JSON.stringify(await validateBank(process.argv[2] || 'assets/models/asset-bank'), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
