// Focused test for the graphics asset-receipts verifier. Drives the shared lib helpers against a
// throwaway fixture root (never real assets), then proves END TO END that the real check goes red
// when a release-manifest row drifts, via the check's inert-by-default self-test poison pill.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  bakedTexMBReport,
  fileRecord,
  partitionKnownStale,
  verifyAssetReceipt,
} from '../scripts/lib/graphics-asset-receipts.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

// Minimal valid GLB: header + JSON chunk only, padded to 4 bytes. Enough for glbMetrics.
function buildGlb(gltf) {
  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const total = 12 + 8 + jsonChunk.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0); // 'glTF'
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  jsonChunk.copy(out, 20);
  return out;
}

// Two LOD-tagged meshes: LOD0 = 12 triangles, LOD1 = 4 triangles, total = 16.
const LOD_TAGGED_GLTF = {
  asset: { version: '2.0' },
  accessors: [{ count: 36 }, { count: 12 }],
  meshes: [{ primitives: [{ mode: 4, indices: 0 }] }, { primitives: [{ mode: 4, indices: 1 }] }],
  nodes: [{ mesh: 0, name: 'LOD0_body' }, { mesh: 1, name: 'LOD1_body' }],
};
// Untagged single mesh: 12 triangles, no LOD nodes (lod0 stays 0).
const UNTAGGED_GLTF = {
  asset: { version: '2.0' },
  accessors: [{ count: 36 }],
  meshes: [{ primitives: [{ mode: 4, indices: 0 }] }],
  nodes: [{ mesh: 0, name: 'body' }],
};

const root = mkdtempSync(join(tmpdir(), 'receipts-test-'));
try {
  const sourceGlb = buildGlb(LOD_TAGGED_GLTF);
  const releaseGlb = buildGlb({ ...LOD_TAGGED_GLTF, asset: { version: '2.0', generator: 'release' } });
  writeFileSync(join(root, 'asset_source.glb'), sourceGlb);
  writeFileSync(join(root, 'asset_release.glb'), releaseGlb);

  const src = fileRecord(root, 'asset_source.glb');
  const rel = fileRecord(root, 'asset_release.glb');
  const cleanEntry = {
    id: 'fixture_asset',
    source: 'asset_source.glb', sourceBytes: src.bytes, sourceSha256: src.sha256,
    release: 'asset_release.glb', releaseBytes: rel.bytes, releaseSha256: rel.sha256,
  };

  // 1. Clean asset, tris = total across LODs (legacy convention): verifies.
  let result = verifyAssetReceipt(root, cleanEntry, { id: 'fixture_asset', bytes: src.bytes, tris: 16 });
  assert.equal(result.ok, true, `clean asset must verify: ${JSON.stringify(result.failures)}`);
  assert.equal(result.records.source.sha256, src.sha256, 'result carries measured disk records');

  // 2. tris = LOD0-only (newer authored-place convention): also verifies.
  result = verifyAssetReceipt(root, cleanEntry, { id: 'fixture_asset', bytes: src.bytes, tris: 12 });
  assert.equal(result.ok, true, 'LOD0-only tris convention must verify on a LOD-tagged GLB');

  // 3. tris matching neither convention: stale-row failure with named diagnostics.
  result = verifyAssetReceipt(root, cleanEntry, { id: 'fixture_asset', bytes: src.bytes, tris: 13 });
  assert.equal(result.ok, false, 'tris matching neither convention must fail');
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].field, 'tris');
  assert.equal(result.failures[0].expected, '16 (total) or 12 (lod0)');
  assert.equal(result.failures[0].actual, 13);

  // 4. Untagged GLB: LOD0 convention must NOT let a bogus 0 pass; total still verifies.
  writeFileSync(join(root, 'untagged.glb'), buildGlb(UNTAGGED_GLTF));
  const unt = fileRecord(root, 'untagged.glb');
  const untaggedEntry = {
    id: 'fixture_untagged',
    source: 'untagged.glb', sourceBytes: unt.bytes, sourceSha256: unt.sha256,
    release: 'untagged.glb', releaseBytes: unt.bytes, releaseSha256: unt.sha256,
  };
  result = verifyAssetReceipt(root, untaggedEntry, { id: 'fixture_untagged', bytes: unt.bytes, tris: 0 });
  assert.equal(result.ok, false, 'tris=0 must not pass via a zero LOD0 on an untagged GLB');
  result = verifyAssetReceipt(root, untaggedEntry, { id: 'fixture_untagged', bytes: unt.bytes, tris: 12 });
  assert.equal(result.ok, true, 'total-tris convention must verify on an untagged GLB');

  // 5. Corrupt the source GLB (single byte flip, same length): sourceSha256 drift is caught and
  //    the diagnostic names the asset, manifest, row field, and both hashes.
  const corrupted = Buffer.from(sourceGlb);
  corrupted[corrupted.length - 1] ^= 0xff;
  writeFileSync(join(root, 'asset_source.glb'), corrupted);
  result = verifyAssetReceipt(root, cleanEntry, { id: 'fixture_asset', bytes: src.bytes, tris: 16 });
  assert.equal(result.ok, false, 'byte-flipped source must fail verification');
  const shaFailure = result.failures.find((f) => f.field === 'sourceSha256');
  assert.ok(shaFailure, 'corruption must be reported as a sourceSha256 failure');
  assert.equal(shaFailure.asset, 'fixture_asset');
  assert.equal(shaFailure.manifest, 'release_manifest.json');
  assert.equal(shaFailure.expected, src.sha256);
  assert.notEqual(shaFailure.actual, shaFailure.expected);
  writeFileSync(join(root, 'asset_source.glb'), sourceGlb); // restore

  // 6. Truncated release GLB: both releaseBytes and releaseSha256 drift.
  writeFileSync(join(root, 'asset_release.glb'), releaseGlb.subarray(0, releaseGlb.length - 4));
  result = verifyAssetReceipt(root, cleanEntry, null);
  assert.deepEqual(result.failures.map((f) => f.field).sort(), ['releaseBytes', 'releaseSha256']);
  writeFileSync(join(root, 'asset_release.glb'), releaseGlb); // restore

  // 7. Missing file: per-asset read failure, not a sweep-killing crash.
  result = verifyAssetReceipt(root, { ...cleanEntry, source: 'missing.glb' }, null);
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].field, 'sourceRead');

  // 8. Stale parts row bytes: caught against the live source GLB.
  result = verifyAssetReceipt(root, cleanEntry, { id: 'fixture_asset', bytes: src.bytes + 2016, tris: 16 });
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].field, 'bytes');
  assert.equal(result.failures[0].manifest, 'parts_manifest.json');

  // 9. Known-stale pins: exact match downgrades to warning; any drift beyond the pin stays a REAL
  //    failure plus a pin violation; a clean asset with a leftover pin is itself a violation.
  const staleResult = verifyAssetReceipt(root, cleanEntry, { id: 'fixture_asset', bytes: src.bytes + 2016, tris: 16 });
  const pin = {
    fixture_asset: [{
      manifest: 'parts_manifest.json', field: 'bytes', expected: src.bytes, actual: src.bytes + 2016,
    }],
  };
  let split = partitionKnownStale([staleResult], pin);
  assert.equal(split.realFailures.length, 0, 'exactly-pinned drift must not be a real failure');
  assert.equal(split.pinnedWarnings.length, 1);
  assert.equal(split.pinViolations.length, 0);

  const differentDrift = verifyAssetReceipt(root, cleanEntry, { id: 'fixture_asset', bytes: src.bytes + 9999, tris: 16 });
  split = partitionKnownStale([differentDrift], pin);
  assert.equal(split.realFailures.length, 1, 'drift beyond the pinned values must stay a real failure');
  assert.equal(split.pinViolations.length, 1);

  const cleanAgain = verifyAssetReceipt(root, cleanEntry, { id: 'fixture_asset', bytes: src.bytes, tris: 16 });
  split = partitionKnownStale([cleanAgain], pin);
  assert.equal(split.pinViolations.length, 1, 'an obsolete pin over a clean asset must be a violation');

  const unpinned = partitionKnownStale([staleResult], {});
  assert.equal(unpinned.realFailures.length, 1, 'without a pin the same drift is a real failure');
} finally {
  rmSync(root, { recursive: true, force: true });
}

// 10. bakedTexMB source gate: the live spaceBackground.js passes, and the extracted formula's
//     arithmetic is proven — 1x1 deferred stand-ins read ~0 MB, known dims read 28.1 MB.
const bgSource = readFileSync(join(REPO_ROOT, 'src/render/spaceBackground.js'), 'utf8');
const liveGate = bakedTexMBReport(bgSource);
assert.equal(liveGate.ok, true,
  `live spaceBackground.js must pass the bakedTexMB gate: ${JSON.stringify(liveGate.failures)}`);
assert.equal(Math.round(liveGate.evaluate([null, null, null]) * 10) / 10, 0);
assert.equal(Math.round(liveGate.evaluate([
  { width: 1, height: 1 }, { width: 1, height: 1 }, { width: 1, height: 1 },
]) * 10) / 10, 0, '1x1 stand-ins must read ~0 MB — the counter must see reclaimed memory');
assert.equal(Math.round(liveGate.evaluate([
  { width: 2048, height: 2048 }, { width: 1024, height: 1024 }, { width: 512, height: 512 },
]) * 10) / 10, 28.1, 'RGBA + 1.34 mip-tail arithmetic');

// 11. The good-news-counter regression (bakedTexMB derived from configured bake sizes instead of
//     actual target residency) must FAIL the gate.
const regressedSource = `
  stats() {
    const texMB = this.bakeSizes.reduce((bytes, s) => bytes + s * s * 4 * 1.34, 0) / (1024 * 1024);
    return { bakedTexMB: Math.round(texMB * 10) / 10 };
  }
`;
const regressedGate = bakedTexMBReport(regressedSource);
assert.equal(regressedGate.ok, false, 'configured-size formula must fail the gate');
assert.ok(regressedGate.failures.some((f) => /configured sizes/.test(String(f.actual))),
  'gate must name the configured-size regression');
assert.equal(bakedTexMBReport('function stats() { return {}; }').ok, false,
  'a source with no texMB assignment must fail the gate');

// 12. END TO END: the real check must go RED and name the row when a release-manifest row drifts.
//     SF_RECEIPTS_SELF_TEST_DRIFT poisons one in-memory row (no asset bytes, no manifest files are
//     touched) and the normal failure path must catch it.
const drifted = spawnSync(process.execPath, ['scripts/check-graphics-asset-receipts.mjs'], {
  cwd: REPO_ROOT,
  env: { ...process.env, SF_RECEIPTS_SELF_TEST_DRIFT: 'place_asteroid_rock_b' },
  encoding: 'utf8',
});
assert.equal(drifted.status, 1, 'check must exit 1 on a drifted release-manifest row\n' +
  `stdout: ${drifted.stdout}\nstderr: ${drifted.stderr}`);
assert.match(drifted.stderr, /place_asteroid_rock_b release_manifest\.json sourceSha256/,
  'check must name the drifted asset, manifest, and field');
assert.doesNotMatch(drifted.stdout, /Extended receipt coverage: PASS/,
  'a drifted row must never be reported as covered-and-passing');

console.log('graphics-asset-receipts test: PASS');
console.log('  fixture-root verification: clean/LOD conventions/corruption/truncation/missing/stale-row all behave');
console.log('  known-stale pins: exact-match warns, drift or obsolescence violates');
console.log('  bakedTexMB gate: live source passes, arithmetic proven, configured-size regression fails');
console.log('  end-to-end: injected sourceSha256 drift turns the real check RED (exit 1, row named)');
