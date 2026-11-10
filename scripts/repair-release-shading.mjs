#!/usr/bin/env node
// Graphics bar: apply the cost-free shading repair (scripts/lib/glbShadingRepair.mjs) to the live
// release GLBs in place and restamp release_manifest.json. The release builders run the same
// transform before meshopt, so a rebuild from source reproduces the repair.
//   node scripts/repair-release-shading.mjs [--only=id,id] [--dry] [--report=path.json]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
import { publishFileSetTransaction } from '../tools/art/lib/multiFileTransaction.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

// Build the complete candidate before moving any live file. The transaction validates
// staged bytes, rejects concurrent source/release/manifest changes, and rolls back a
// later publication failure along with every already-promoted GLB.
export async function repairReleaseShading({ root = ROOT, only = null, dry = false, fileOps = {} } = {}) {
  root = resolve(root);
  const manifestPath = resolve(root, 'assets/ships/release/release_manifest.json');
  const manifestBefore = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBefore);
  await MeshoptDecoder.ready; await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const report = [], files = [], guards = new Map();
  for (const entry of manifest.assets) {
    if (only && !only.has(entry.id)) continue;
    // Lossless-position shell: never re-quantize it here.
    if (entry.id === 'place_ceres_second_measure') continue;
    const releasePath = resolve(root, entry.release);
    if (!existsSync(releasePath)) continue;
    const before = readFileSync(releasePath);
    const doc = await io.readBinary(before);
    const rows = repairDocumentShading(doc);
    if (!rows.length) continue;
    await doc.transform(meshopt({ encoder: MeshoptEncoder, ...RELEASE_MESHOPT_OPTIONS }));
    const bytes = await io.writeBinary(doc);
    const { json: gltf } = await io.binaryToJSON(bytes);
    entry.releaseSha256 = sha256(bytes);
    entry.releaseBytes = bytes.length;
    entry.meshoptBufferViews = (gltf.bufferViews || []).filter((view) =>
      view.extensions?.EXT_meshopt_compression || view.extensions?.KHR_meshopt_compression).length;
    report.push({ id: entry.id, release: entry.release, bytesBefore: before.length, bytesAfter: bytes.length, prims: rows });
    const sourcePath = resolve(root, entry.source);
    const hasSource = existsSync(sourcePath);
    if (hasSource) guards.set(sourcePath, { path: sourcePath, expectedCurrentSha256: sha256(readFileSync(sourcePath)) });
    files.push({
      path: releasePath, bytes, expectedCurrentSha256: sha256(before),
      validate(stagedPath, stagedBytes) {
        if (sha256(stagedBytes) !== entry.releaseSha256) throw new Error(`${entry.id}: staged release hash mismatch`);
        const check = hasSource
          ? inspectReleaseAssetPair(entry.source, stagedPath, { root })
          : inspectGlbReleaseCompression(stagedPath, { root, releaseMode: true });
        if (!check.ok) throw new Error(`${entry.id}: repaired release fails validation ${JSON.stringify(check.issues || []).slice(0, 600)}`);
      },
    });
  }
  if (files.length && !dry) {
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    files.push({
      path: manifestPath, bytes: manifestBytes, expectedCurrentSha256: sha256(manifestBefore),
      validate(_stagedPath, stagedBytes) {
        if (sha256(stagedBytes) !== sha256(manifestBytes)) throw new Error('staged release manifest hash mismatch');
      },
    });
    await publishFileSetTransaction({ files, guards: [...guards.values()], fileOps });
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true];
  }));
  const report = await repairReleaseShading({
    only: args.only ? new Set(String(args.only).split(',')) : null, dry: !!args.dry,
  });
  if (args.report) writeFileSync(args.report, JSON.stringify(report, null, 1));
  for (const row of report) console.log(`[shading] ${row.id}: ${row.prims.length} prims, ${row.bytesBefore} -> ${row.bytesAfter} bytes${args.dry ? ' (dry)' : ''}`);
  const sum = (k) => report.reduce((s, r) => s + r.prims.reduce((n, p) => n + (p[k] || 0), 0), 0);
  console.log(`[shading] files ${report.length}, degenerate tris removed ${sum('degenRemoved')}, collapsed-UV triangles reprojected ${sum('uvCollapsedFixed')}, coincident triangles dropped ${sum('zFightTrisDropped')}`);
}
