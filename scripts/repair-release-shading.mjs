#!/usr/bin/env node
// Graphics bar: apply the cost-free shading repair (scripts/lib/glbShadingRepair.mjs) to the live
// release GLBs in place and restamp release_manifest.json. The release builders run the same
// transform before meshopt, so a rebuild from source reproduces the repair.
//   node scripts/repair-release-shading.mjs [--only=id,id] [--dry] [--report=path.json]
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { RELEASE_MESHOPT_OPTIONS } from './lib/releaseMeshoptProfile.mjs';
import { repairDocumentShading } from './lib/glbShadingRepair.mjs';
import { inspectReleaseAssetPair, inspectGlbReleaseCompression } from '../src/contracts/assetReleaseValidation.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const only = args.only ? new Set(String(args.only).split(',')) : null;
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const report = [];
for (const entry of manifest.assets) {
  if (only && !only.has(entry.id)) continue;
  // Lossless-position shell (releaseStrictClearancePrecision.mjs): never re-quantize it here.
  if (entry.id === 'place_ceres_second_measure') continue;
  const rel = resolve(ROOT, entry.release);
  if (!existsSync(rel)) continue;
  const doc = await io.read(rel);
  const rows = repairDocumentShading(doc);
  if (!rows.length) continue;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, ...RELEASE_MESHOPT_OPTIONS }));
  const before = readFileSync(rel).length;
  const bytes = await io.writeBinary(doc);
  report.push({ id: entry.id, release: entry.release, bytesBefore: before, bytesAfter: bytes.length, prims: rows });
  if (args.dry) continue;
  const tmp = rel + '.repair.tmp';
  writeFileSync(tmp, bytes); renameSync(tmp, rel);
  const check = existsSync(resolve(ROOT, entry.source))
    ? inspectReleaseAssetPair(entry.source, entry.release, { root: ROOT })
    : { ok: inspectGlbReleaseCompression(entry.release, { root: ROOT, releaseMode: true }).ok, release: null };
  if (!check.ok) throw new Error(`${entry.id}: repaired release fails validation ${JSON.stringify(check.issues || []).slice(0, 600)}`);
  entry.releaseSha256 = sha256(bytes);
  entry.releaseBytes = bytes.length;
  if (check.release?.metrics?.meshoptBufferViewCount != null) entry.meshoptBufferViews = check.release.metrics.meshoptBufferViewCount;
  console.log(`[shading] ${entry.id}: ${rows.length} prims, ${before} -> ${bytes.length} bytes`);
}
if (!args.dry) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
if (args.report) writeFileSync(args.report, JSON.stringify(report, null, 1));
const sum = (k) => report.reduce((s, r) => s + r.prims.filter((p) => p[k]).length, 0);
const uvFixed = report.reduce((s, r) => s + r.prims.reduce((t, p) => t + (p.uvCollapsedFixed || 0), 0), 0);
console.log(`[shading] collapsed-UV triangles reprojected ${uvFixed}`);
console.log(`[shading] files ${report.length}, prims ${report.reduce((s, r) => s + r.prims.length, 0)}, faceted ${sum('facetedCurve')}, flipped ${report.reduce((s, r) => s + r.prims.filter((p) => p.flippedFrac > 0.02).length, 0)}, degenerate tris removed ${report.reduce((s, r) => s + r.prims.reduce((t, p) => t + (p.degenRemoved || 0), 0), 0)}`);
