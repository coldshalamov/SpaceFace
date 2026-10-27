#!/usr/bin/env node
// Budget gate for the shipped asset tree.
//
// The 2026-10 audit found the asset layer had no ceiling at all: nothing failed when a
// new body shipped at 2x the triangles, 4x the texture VRAM, or with its render-package
// encoding silently regressed to lossless (see check-render-package-encoding.mjs, which
// caught a 1.75x retail payload regression). This is the missing ceiling.
//
// Budgets are per-shipped-file, checked against the worst offender, plus a total. They
// are set from today's measured tree with headroom, so ordinary authoring passes and a
// genuinely new heavy asset fails until someone writes down why it is worth its cost.
//
//   node scripts/check-asset-census.mjs
//   node scripts/check-asset-census.mjs --dir=assets/ships/release/parts/wholeships
//   node scripts/check-asset-census.mjs --json
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { censusAssets, categoryFor, walkGlbFiles } from './lib/assetCensus.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2);
const DIR = (argv.find((a) => a.startsWith('--dir=')) || '').slice('--dir='.length);
const JSON_OUT = argv.includes('--json');
const TARGET = path.resolve(ROOT, DIR || 'assets/ships/release');

// Measured 2026-10-27 over the full release tree, then given explicit headroom.
export const ASSET_BUDGET = Object.freeze({
  // One body. A station or landmark may be big; nothing needs more than this.
  maxFileTris: 300_000,
  maxFilePrims: 320,
  maxFileMaterials: 28,
  maxFileTextureVramBytes: 24 * 1024 * 1024,
  maxFileTextureDim: 2048,
  // The whole shipped tree. Growth here is what slows boot, sector entry and VRAM.
  maxTotalTriangles: 16_500_000,
  maxTotalPrimitives: 26_000,
  maxTotalTextureVramBytes: 3_800 * 1024 * 1024,
  maxTotalBytes: 700 * 1024 * 1024,
});

function mb(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const { rows, errors } = await censusAssets({ target: TARGET, root: ROOT });
if (!rows.length) {
  console.error(`FAIL asset-census: no readable GLBs under ${path.relative(ROOT, TARGET)}`);
  process.exit(1);
}

const totals = rows.reduce((acc, row) => ({
  tris: acc.tris + row.tris,
  prims: acc.prims + row.prims,
  vram: acc.vram + row.vram,
  bytes: acc.bytes + row.bytes,
}), { tris: 0, prims: 0, vram: 0, bytes: 0 });

const failures = [];

// A compilable body must be reachable from the runtime: an unreadable GLB is a hole in
// the census, so it fails the gate instead of being skipped silently.
if (errors.length) {
  failures.push(`${errors.length} shipped GLB(s) could not be read (a census that skips files is not a census)`);
}

for (const check of [
  ['tris', 'maxFileTris', 'triangles'],
  ['prims', 'maxFilePrims', 'primitives'],
  ['materials', 'maxFileMaterials', 'materials'],
  ['vram', 'maxFileTextureVramBytes', 'decoded texture VRAM'],
  ['maxDim', 'maxFileTextureDim', 'texture dimension'],
]) {
  const [rowKey, budgetKey, label] = check;
  const budget = ASSET_BUDGET[budgetKey];
  for (const row of rows) {
    if (row[rowKey] > budget) {
      failures.push(`${row.file}: ${label} ${row[rowKey].toLocaleString()} exceeds per-file budget ${budget.toLocaleString()}`);
    }
  }
}

for (const [key, budgetKey, label] of [
  ['tris', 'maxTotalTriangles', 'triangles'],
  ['prims', 'maxTotalPrimitives', 'primitives'],
  ['vram', 'maxTotalTextureVramBytes', 'decoded texture VRAM'],
  ['bytes', 'maxTotalBytes', 'on-disk bytes'],
]) {
  if (totals[key] > ASSET_BUDGET[budgetKey]) {
    failures.push(`tree total ${label} ${totals[key].toLocaleString()} exceeds budget ${ASSET_BUDGET[budgetKey].toLocaleString()}`);
  }
}

const byCategory = new Map();
for (const row of rows) {
  const category = categoryFor(row.file);
  const bucket = byCategory.get(category) || { files: 0, tris: 0, prims: 0, vram: 0 };
  bucket.files += 1;
  bucket.tris += row.tris;
  bucket.prims += row.prims;
  bucket.vram += row.vram;
  byCategory.set(category, bucket);
}

// Every shipped body must be declared by the release manifest. An undeclared GLB is dead
// weight in the retail copy that nothing loads and nothing can ever ask for: the tree carried
// `wholeships/pelican.glb` and `wholeships/wasp.glb` (9.7 MB) - blocked legacy originals
// superseded by `*_production_v1` - because a release build writes files but never deletes the
// ones a later blocking decision retired. Render-package payloads are exempt: they are bound by
// pilots.json, which check-render-package-encoding.mjs already verifies.
const RELEASE_ROOT = path.resolve(ROOT, 'assets/ships/release');
const manifestPath = path.join(RELEASE_ROOT, 'release_manifest.json');
let undeclared = [];
if (TARGET === RELEASE_ROOT) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const declared = new Set((manifest.assets || []).map((asset) => String(asset.release).replace(/\\/g, '/')));
  undeclared = walkGlbFiles(RELEASE_ROOT)
    .map((file) => path.relative(ROOT, file).replace(/\\/g, '/'))
    .filter((file) => !file.includes('/render-packages/'))
    .filter((file) => !declared.has(file));
  if (undeclared.length) {
    const bytes = undeclared.reduce((sum, file) => sum + readFileSync(path.resolve(ROOT, file)).length, 0);
    failures.push(`${undeclared.length} shipped GLB(s) are not declared by release_manifest.json (${mb(bytes)} of dead weight): ${undeclared.join(', ')}`);
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({
    schema: 'spaceface.assetCensusBudget.v1',
    target: path.relative(ROOT, TARGET).replace(/\\/g, '/'),
    files: rows.length,
    errors: errors.length,
    totals,
    budgets: ASSET_BUDGET,
    failures,
  }, null, 2));
} else {
  console.log(`asset-census: ${rows.length} shipped GLBs under ${path.relative(ROOT, TARGET).replace(/\\/g, '/')}`);
  console.log(`  ${totals.tris.toLocaleString()} triangles, ${totals.prims.toLocaleString()} primitives, `
    + `${mb(totals.vram)} decoded texture VRAM, ${mb(totals.bytes)} on disk`);
  const worstVram = [...rows].sort((a, b) => b.vram - a.vram)[0];
  const worstTris = [...rows].sort((a, b) => b.tris - a.tris)[0];
  const worstPrims = [...rows].sort((a, b) => b.prims - a.prims)[0];
  console.log(`  heaviest VRAM: ${worstVram.file} (${mb(worstVram.vram)})`);
  console.log(`  heaviest geometry: ${worstTris.file} (${worstTris.tris.toLocaleString()} tris)`);
  console.log(`  most draw groups: ${worstPrims.file} (${worstPrims.prims} primitives)`);
  for (const [category, bucket] of [...byCategory.entries()].sort((a, b) => b[1].vram - a[1].vram)) {
    console.log(`  ${category}: ${bucket.files} files, ${bucket.tris.toLocaleString()} tris, ${bucket.prims} prims, ${mb(bucket.vram)} VRAM`);
  }
}

if (failures.length) {
  console.error(`FAIL asset-census: ${failures.length} budget violation(s)`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log('PASS asset-census: shipped tree is inside its declared budget');
