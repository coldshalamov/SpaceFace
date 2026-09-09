// Focused test for the extended receipt-coverage verification.
// Proves verifyAssetReceipt passes on clean data and fails on a single corrupted byte,
// naming the exact asset, expected/actual hash, and owning manifest. Uses a temp copy so
// real assets are never corrupted in place.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileRecord, glbMetrics, verifyAssetReceipt } from '../scripts/lib/graphics-asset-receipts.mjs';

const ROOT = 'C:/sf-agents/fable-receipts-cov';
const SRC_GLB = 'assets/ships/parts/hulls/hull_starter.glb';
const REL_GLB = 'assets/ships/release/parts/hulls/hull_starter.glb';

function makeTempRoot() {
  const tmp = mkdtempSync(join(tmpdir(), 'receipts-cov-'));
  mkdirSync(join(tmp, 'assets/ships/parts/hulls'), { recursive: true });
  mkdirSync(join(tmp, 'assets/ships/release/parts/hulls'), { recursive: true });
  return tmp;
}

// --- Clean data passes ---
{
  const tmp = makeTempRoot();
  try {
    copyFileSync(join(ROOT, SRC_GLB), join(tmp, SRC_GLB));
    copyFileSync(join(ROOT, REL_GLB), join(tmp, REL_GLB));
    const src = fileRecord(tmp, SRC_GLB);
    const rel = fileRecord(tmp, REL_GLB);
    const tris = glbMetrics(tmp, SRC_GLB).triangles;
    const releaseEntry = {
      id: 'hull_starter', source: SRC_GLB, release: REL_GLB,
      sourceSha256: src.sha256, sourceBytes: src.bytes,
      releaseSha256: rel.sha256, releaseBytes: rel.bytes,
    };
    const partEntry = { id: 'hull_starter', bytes: src.bytes, tris };
    const result = verifyAssetReceipt(tmp, releaseEntry, partEntry);
    assert.equal(result.ok, true, 'clean data must pass with zero failures');
    assert.equal(result.failures.length, 0, 'clean data must produce no failure details');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- A single corrupted byte in the source GLB is caught by SHA, naming the asset + manifest ---
{
  const tmp = makeTempRoot();
  try {
    copyFileSync(join(ROOT, SRC_GLB), join(tmp, SRC_GLB));
    copyFileSync(join(ROOT, REL_GLB), join(tmp, REL_GLB));
    const src = fileRecord(tmp, SRC_GLB);
    const rel = fileRecord(tmp, REL_GLB);
    const tris = glbMetrics(tmp, SRC_GLB).triangles;

    // Corrupt the last byte of the source GLB (BIN data; JSON parsing still succeeds so tris stays
    // valid, but the SHA changes — exactly the silent corruption this check must catch).
    const srcPath = join(tmp, SRC_GLB);
    const buf = readFileSync(srcPath);
    buf[buf.length - 1] = buf[buf.length - 1] ^ 0xFF;
    writeFileSync(srcPath, buf);

    const corrupted = fileRecord(tmp, SRC_GLB);
    assert.notEqual(corrupted.sha256, src.sha256, 'test setup: corruption must change the SHA');
    assert.equal(corrupted.bytes, src.bytes, 'test setup: a byte flip must not change the byte count');

    const releaseEntry = {
      id: 'hull_starter', source: SRC_GLB, release: REL_GLB,
      sourceSha256: src.sha256, sourceBytes: src.bytes,
      releaseSha256: rel.sha256, releaseBytes: rel.bytes,
    };
    const partEntry = { id: 'hull_starter', bytes: src.bytes, tris };
    const result = verifyAssetReceipt(tmp, releaseEntry, partEntry);
    assert.equal(result.ok, false, 'a corrupted source byte must fail verification');
    const shaFailure = result.failures.find((f) => f.field === 'sourceSha256');
    assert.ok(shaFailure, 'the source SHA failure must be reported');
    assert.equal(shaFailure.asset, 'hull_starter', 'failure must name the exact asset');
    assert.equal(shaFailure.manifest, 'release_manifest.json', 'failure must name the owning manifest');
    assert.equal(shaFailure.expected, src.sha256, 'failure must report the expected hash');
    assert.equal(shaFailure.actual, corrupted.sha256, 'failure must report the actual hash');
    assert.equal(shaFailure.path, SRC_GLB, 'failure must report the file path');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- A corrupted release GLB is caught by release SHA ---
{
  const tmp = makeTempRoot();
  try {
    copyFileSync(join(ROOT, SRC_GLB), join(tmp, SRC_GLB));
    copyFileSync(join(ROOT, REL_GLB), join(tmp, REL_GLB));
    const src = fileRecord(tmp, SRC_GLB);
    const rel = fileRecord(tmp, REL_GLB);
    const tris = glbMetrics(tmp, SRC_GLB).triangles;

    const relPath = join(tmp, REL_GLB);
    const buf = readFileSync(relPath);
    buf[buf.length - 1] = buf[buf.length - 1] ^ 0xFF;
    writeFileSync(relPath, buf);

    const releaseEntry = {
      id: 'hull_starter', source: SRC_GLB, release: REL_GLB,
      sourceSha256: src.sha256, sourceBytes: src.bytes,
      releaseSha256: rel.sha256, releaseBytes: rel.bytes,
    };
    const partEntry = { id: 'hull_starter', bytes: src.bytes, tris };
    const result = verifyAssetReceipt(tmp, releaseEntry, partEntry);
    assert.equal(result.ok, false, 'a corrupted release byte must fail verification');
    const shaFailure = result.failures.find((f) => f.field === 'releaseSha256');
    assert.ok(shaFailure, 'the release SHA failure must be reported');
    assert.equal(shaFailure.asset, 'hull_starter');
    assert.equal(shaFailure.manifest, 'release_manifest.json');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- A stale parts-manifest byte count is caught (the rockB/rockC failure mode) ---
{
  const tmp = makeTempRoot();
  try {
    copyFileSync(join(ROOT, SRC_GLB), join(tmp, SRC_GLB));
    copyFileSync(join(ROOT, REL_GLB), join(tmp, REL_GLB));
    const src = fileRecord(tmp, SRC_GLB);
    const rel = fileRecord(tmp, REL_GLB);
    const tris = glbMetrics(tmp, SRC_GLB).triangles;
    const releaseEntry = {
      id: 'hull_starter', source: SRC_GLB, release: REL_GLB,
      sourceSha256: src.sha256, sourceBytes: src.bytes,
      releaseSha256: rel.sha256, releaseBytes: rel.bytes,
    };
    // Parts manifest claims a WRONG byte count (off by 1) — must be caught.
    const partEntry = { id: 'hull_starter', bytes: src.bytes + 1, tris };
    const result = verifyAssetReceipt(tmp, releaseEntry, partEntry);
    assert.equal(result.ok, false, 'a stale parts-manifest byte count must fail verification');
    const bytesFailure = result.failures.find((f) => f.field === 'bytes' && f.manifest === 'parts_manifest.json');
    assert.ok(bytesFailure, 'the parts-manifest bytes failure must be reported');
    assert.equal(bytesFailure.asset, 'hull_starter');
    assert.equal(bytesFailure.expected, src.bytes);
    assert.equal(bytesFailure.actual, src.bytes + 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log('check-graphics-asset-receipts coverage: PASS');
