#!/usr/bin/env node
// Publish one staged place release GLB when full build is blocked on lock.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectReleaseAssetPair } from '../src/contracts/assetReleaseValidation.js';
import {
  parseReleaseGlbPayload,
  validateKtx2MaterialRolePayloads,
} from '../tools/art/lib/ktx2MaterialRoleValidation.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const partId = process.argv[2];
if (!partId || !partId.startsWith('place_')) {
  console.error('usage: patch-single-release-place.mjs <place_part_id>');
  process.exit(2);
}

const source = `assets/ships/parts/places/${partId}.glb`;
const release = `assets/ships/release/parts/places/${partId}.glb`;
const staged = `assets/ships/release.__building/parts/places/${partId}.glb`;
const manifestPath = resolve(ROOT, 'assets/ships/release/release_manifest.json');

if (!existsSync(resolve(ROOT, staged))) {
  console.error(`missing staged release: ${staged}`);
  process.exit(1);
}

// A place part staged through the generic sg04 pipeline encodes every texture slot UASTC;
// place releases require per-role profiles (albedo/emissive ETC1S+sRGB, ORM ETC1S+linear,
// normals UASTC). Refuse wrong-tool staging before it reaches the published tree — stage
// places exclusively through scripts/build-place-release-assets.mjs.
const stagedBytes = readFileSync(resolve(ROOT, staged));
try {
  const parsed = parseReleaseGlbPayload(stagedBytes, `staged release ${partId}`);
  validateKtx2MaterialRolePayloads(parsed.gltf, parsed.binary, `staged release ${partId}`);
} catch (err) {
  console.error(`${err && err.message ? err.message : err}`);
  console.error('place releases must be staged via scripts/build-place-release-assets.mjs');
  process.exit(1);
}

copyFileSync(resolve(ROOT, staged), resolve(ROOT, release));
const pair = inspectReleaseAssetPair(source, release, { root: ROOT });
if (!pair.ok) {
  console.error(JSON.stringify(pair.issues, null, 2));
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const sourceBytes = readFileSync(resolve(ROOT, source));
const releaseBytes = readFileSync(resolve(ROOT, release));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const entry = {
  id: partId,
  kind: 'part:places',
  source,
  release,
  sourceSha256: sha256(sourceBytes),
  releaseSha256: sha256(releaseBytes),
  sourceBytes: sourceBytes.length,
  releaseBytes: releaseBytes.length,
  textures: pair.release.metrics.textureCount,
  ktx2Textures: pair.release.metrics.ktx2TextureCount,
  meshoptBufferViews: pair.release.metrics.meshoptBufferViewCount,
  contractNodeCount: pair.release.metrics.contractNodeNames.length,
};
const assets = manifest.assets || [];
const idx = assets.findIndex((a) => a.id === partId);
if (idx >= 0) assets[idx] = entry;
else assets.push(entry);
manifest.assets = assets;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ partId, releaseBytes: releaseBytes.length, pairOk: pair.ok }, null, 2));