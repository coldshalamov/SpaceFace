import { readFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { validateAssetContract, inspectAssetDocument } from './lib/reusableAssetContract.mjs';

function requireFact(condition, message) { if (!condition) throw new Error(message); }

/** Structural proof only. This does not grant visual or runtime acceptance. */
export async function validateAssetManifest(manifestPath) {
  const row = JSON.parse(await readFile(manifestPath, 'utf8'));
  const context = row?.assetId || manifestPath;
  validateAssetContract(row, context);
  const check = (condition, message) => requireFact(condition, `${context}: ${message}`);
  let previousTriangles = Infinity;
  const io = new NodeIO();
  const measuredBounds = [];
  for (const lod of row.lods) {
    const file = path.join(path.dirname(manifestPath), lod.file);
    // A safe basename alone does not stop a symlink escaping the bank directory.
    check((await lstat(file)).isFile(), `LOD${lod.level} must be a regular file, not a symlink`);
    const bytes = await readFile(file);
    check(bytes.length === lod.bytes, `LOD${lod.level} byte count differs`);
    check(createHash('sha256').update(bytes).digest('hex') === lod.sha256, `LOD${lod.level} hash differs`);
    const doc = await io.readBinary(bytes);
    const measured = inspectAssetDocument(doc, row, lod.level);
    check(measured.triangles === lod.triangles && measured.draws === lod.draws, `LOD${lod.level} geometry receipt differs`);
    check(measured.triangles <= previousTriangles, 'coarser LOD increases triangle count');
    previousTriangles = measured.triangles;
    measuredBounds.push(measured.bounds);
  }
  return { assetId: row.assetId, category: row.category, lods: row.lods.length,
    triangles: row.lods.map(l => l.triangles), draws: row.lods.map(l => l.draws),
    bounds: measuredBounds, bytes: row.lods.reduce((n, l) => n + l.bytes, 0) };
}

export async function validateBank(root) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      // Export review receipts are not model sidecars; match the catalog's evidence boundary.
      if (entry.isDirectory() && entry.name !== 'evidence') await visit(p);
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
