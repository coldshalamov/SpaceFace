import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SG04_RELEASE_ASSET_CONTRACT,
  validateReleaseAssetSet,
} from '../src/contracts/assetReleaseValidation.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART_MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const releaseMode = process.argv.includes('--release');

const partManifest = JSON.parse(readFileSync(PART_MANIFEST, 'utf8'));
const assetPaths = [
  'assets/ships/kestrel/kestrel_reference.glb',
  ...(partManifest.parts || []).map((part) => `assets/ships/parts/${part.file}`),
];

const result = validateReleaseAssetSet(assetPaths, { root: ROOT, releaseMode });

if (releaseMode) {
  if (!result.ok) {
    console.error(JSON.stringify({
      schema: result.schema,
      ok: false,
      releaseMode: true,
      issueCount: result.issues.length,
      issues: result.issues.slice(0, 20),
    }, null, 2));
    process.exit(1);
  }
  console.log(`SG-04 release asset gate OK (${assetPaths.length} assets)`);
  process.exit(0);
}

assert.equal(result.runtime.schema, 'spaceface.sg04RuntimeDecoderFiles.v1');
assert.equal(result.runtime.ok, true, 'SG-04 release decoder runtime files must be vendored');
assert.equal(result.ok, true, 'SG-04 dev audit should parse every current GLB');
assert.equal(
  result.runtime.files.length,
  SG04_RELEASE_ASSET_CONTRACT.requiredRuntimeFiles.length,
  'SG-04 runtime dependency list should stay aligned with the contract',
);

const releaseResult = validateReleaseAssetSet(assetPaths, { root: ROOT, releaseMode: true });
if (result.releaseReady) {
  assert.equal(releaseResult.ok, true, 'release-ready assets should pass release mode');
} else {
  assert.equal(releaseResult.ok, false, 'uncompressed dev assets must fail release mode');
  assert(
    releaseResult.issues.some((issue) => issue.rule === 'asset.releaseCompression'),
    'release failure should identify asset compression as the blocker',
  );
}

const devOnlyAssets = result.assets.filter((asset) => !asset.releaseReady);
for (const asset of devOnlyAssets) {
  const rules = new Set(asset.releaseIssues.map((issue) => issue.rule));
  assert(rules.has('release.textures.ktx2'), `${asset.assetPath} should be blocked by missing KTX2 textures`);
  assert(rules.has('release.mesh.compression'), `${asset.assetPath} should be blocked by missing mesh compression`);
}

console.log(`SG-04 release asset gate OK (${assetPaths.length} assets, releaseReady=${result.releaseReady})`);
