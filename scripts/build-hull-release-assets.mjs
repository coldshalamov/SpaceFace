// Build ONLY the 7 authored hull release assets and append their entries to release_manifest.json.
// Hulls are KTX2-native (no PNG re-encode), so this is fast. The 25 unchanged PNG parts + kestrel
// reference retain their existing release GLBs and manifest entries untouched.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

import { inspectReleaseAssetPair } from '../src/contracts/assetReleaseValidation.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_MANIFEST = resolve(ROOT, 'assets/ships/release/release_manifest.json');

const HULLS = [
  'hull_starter', 'hull_fighter', 'hull_miner', 'hull_freighter',
  'hull_interceptor', 'hull_corvette', 'hull_gunship',
];

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const manifest = JSON.parse(readFileSync(RELEASE_MANIFEST, 'utf8'));
// drop any pre-existing hull entries (idempotent re-run)
manifest.assets = manifest.assets.filter((a) => !HULLS.includes(a.id));

for (const id of HULLS) {
  const source = `assets/ships/parts/hulls/${id}.glb`;
  const release = `assets/ships/release/parts/hulls/${id}.glb`;
  const sourceAbs = resolve(ROOT, source);
  const releaseAbs = resolve(ROOT, release);
  if (!existsSync(sourceAbs)) throw new Error(`missing hull source: ${source}`);

  await mkdir(dirname(releaseAbs), { recursive: true });
  const document = await io.read(sourceAbs);
  // hulls are KTX2-native: meshopt only (no pngjs KTX2 re-encode)
  await document.transform(meshopt({
    encoder: MeshoptEncoder, level: 'high',
    quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12,
    quantizeColor: 8, quantizeWeight: 8, quantizeGeneric: 12,
  }));
  await io.write(releaseAbs, document);

  const pair = inspectReleaseAssetPair(source, release, { root: ROOT });
  if (!pair.ok) throw new Error(`hull release failed validation: ${release}\n${JSON.stringify(pair.issues)}`);

  const sourceBytes = readFileSync(sourceAbs);
  const releaseBytes = readFileSync(releaseAbs);
  manifest.assets.push({
    id, kind: 'part:hulls', source, release,
    sourceSha256: sha256(sourceBytes), releaseSha256: sha256(releaseBytes),
    sourceBytes: sourceBytes.length, releaseBytes: releaseBytes.length,
    textures: pair.release.metrics.textureCount,
    ktx2Textures: pair.release.metrics.ktx2TextureCount,
    meshoptBufferViews: pair.release.metrics.meshoptBufferViewCount,
    contractNodeCount: pair.release.metrics.contractNodeNames.length,
  });
  console.log(`[hull] ${id}: ${sourceBytes.length} -> ${releaseBytes.length} bytes (ktx2=${pair.release.metrics.ktx2TextureCount}/${pair.release.metrics.textureCount}, meshopt=${pair.release.metrics.meshoptBufferViewCount}, nodes=${pair.release.metrics.contractNodeNames.length})`);
}

// sort assets by id for deterministic output, then write
manifest.assets.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
await writeFile(RELEASE_MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`[hull] release manifest updated: ${manifest.assets.length} assets (${HULLS.length} hulls appended)`);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
