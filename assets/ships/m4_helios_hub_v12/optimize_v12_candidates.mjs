/** Lossless-appearance meshopt packaging for the isolated V12 candidate GLBs. */
import { existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = resolve(HERE, 'release_candidates/places');
const FILES = [
  'place_station_trade_hub.glb', 'place_gate_jump_ring.glb',
  'place_asteroid_rock_a.glb', 'place_asteroid_rock_b.glb', 'place_asteroid_rock_c.glb',
];
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const results = [];
for (const file of FILES) {
  const src = resolve(CANDIDATES, file), tmp = src + '.meshopt.tmp.glb';
  if (!existsSync(src)) throw new Error(`${file}: candidate missing`);
  const before = statSync(src).size, beforeHash = sha256(src);
  const document = await io.read(src);
  await document.transform(
    dedup(), weld(), prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 14,
      quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8,
      quantizeWeight: 8, quantizeGeneric: 12 }),
  );
  await io.write(tmp, document);
  const after = statSync(tmp).size;
  if (after < 10_000 || readFileSync(tmp).subarray(0,4).toString('ascii') !== 'glTF') {
    unlinkSync(tmp); throw new Error(`${file}: optimized output invalid`);
  }
  unlinkSync(src); renameSync(tmp, src);
  results.push({ file: basename(src), beforeBytes: before, afterBytes: after,
    ratio: Number((after / before).toFixed(4)), beforeSha256: beforeHash,
    afterSha256: sha256(src), compression: 'EXT_meshopt_compression' });
  console.log(`[v12-meshopt] ${file} ${before} -> ${after}`);
}

// Refresh byte receipts while retaining Blender structural metrics.
const validationPath = resolve(HERE, 'validation_report.json');
const validation = JSON.parse(readFileSync(validationPath, 'utf8'));
for (const item of validation.exports || []) {
  const path = resolve(HERE, item.file);
  item.bytes = statSync(path).size;
  item.meshCompression = 'EXT_meshopt_compression';
  item.sha256 = sha256(path);
}
validation.packaging = { tool: '@gltf-transform/functions meshopt', appearancePolicy: 'no geometry deletion or simplification', results };
writeFileSync(validationPath, JSON.stringify(validation, null, 2));
writeFileSync(resolve(HERE, 'meshopt_report.json'), JSON.stringify({ schema: 'spaceface.meshoptReceipt.v1', results }, null, 2));
console.log(`[v12-meshopt] complete ${results.length}/${FILES.length}`);
