// Shared receipt-verification helpers for check-graphics-asset-receipts.mjs and its focused test.
// These functions are intentionally pure (no module-level state, no side effects) so the test can
// drive them against a temp root without touching real assets.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;

export function fileRecord(root, relPath) {
  const bytes = readFileSync(resolve(root, relPath));
  return {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase(),
  };
}

export function glbMetrics(root, relPath) {
  const buffer = readFileSync(resolve(root, relPath));
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${relPath} GLB magic`);
  if (buffer.readUInt32LE(16) !== JSON_CHUNK_TYPE) throw new Error(`${relPath} JSON chunk`);
  const jsonLength = buffer.readUInt32LE(12);
  const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').trim());
  let triangles = 0;
  const lods = { lod0: 0, lod1: 0, lod2: 0 };
  for (const [meshIndex, mesh] of (gltf.meshes || []).entries()) {
    const meshTriangles = (mesh.primitives || []).reduce((sum, primitive) => {
      if ((primitive.mode ?? 4) !== 4) return sum;
      const count = gltf.accessors?.[primitive.indices]?.count
        ?? gltf.accessors?.[primitive.attributes?.POSITION]?.count
        ?? 0;
      return sum + Math.floor(count / 3);
    }, 0);
    triangles += meshTriangles;
    const node = (gltf.nodes || []).find((candidate) => candidate.mesh === meshIndex);
    const match = /^LOD([012])_/i.exec(node?.name || '');
    if (match) lods[`lod${match[1]}`] += meshTriangles;
  }
  return {
    gltf,
    triangles,
    lods,
    materials: (gltf.materials || []).length,
    textures: (gltf.textures || []).length,
  };
}

// Verify one release-manifest asset against disk. Returns a per-asset result object so the caller
// can collect every failure (per-asset diagnostics, not one aggregate boolean) before failing.
//
// Verified properties (each named with the owning manifest in the failure detail):
//   - release_manifest sourceSha256 vs disk source GLB
//   - release_manifest sourceBytes  vs disk source GLB
//   - release_manifest releaseSha256 vs disk release GLB
//   - release_manifest releaseBytes  vs disk release GLB
//   - parts_manifest bytes (== release source bytes; the parts manifest `file` points at the live
//     source GLB the release manifest also records, so the two must agree on its byte count)
//   - parts_manifest tris — two live manifest conventions are accepted:
//       total across all LODs (helios/rocks/wasp/rcs era), or LOD0-only (newer authored places).
//     LOD0-only is accepted ONLY when the GLB actually tags LOD nodes (lod0 > 0), so an untagged
//     GLB can never "match" a bogus zero. Matching neither convention is a stale-row failure.
//
// A file that cannot be read is reported as a per-asset `sourceRead`/`releaseRead` failure rather
// than crashing the whole sweep, so one missing asset cannot hide the state of every other one.
//
// The returned `records` carry the disk bytes/sha actually measured, so callers can summarize
// without re-reading (and re-hashing) multi-MB GLBs.
export function verifyAssetReceipt(root, releaseEntry, partEntry) {
  const id = releaseEntry.id;
  const failures = [];
  const records = { source: null, release: null };
  const norm = (v) => String(v).toUpperCase();

  let src = null;
  try {
    src = fileRecord(root, releaseEntry.source);
    records.source = src;
  } catch (error) {
    failures.push({
      asset: id, manifest: 'release_manifest.json', field: 'sourceRead',
      path: releaseEntry.source, expected: 'readable file', actual: error.message,
    });
  }
  if (src) {
    if (src.sha256 !== norm(releaseEntry.sourceSha256)) {
      failures.push({
        asset: id, manifest: 'release_manifest.json', field: 'sourceSha256',
        path: releaseEntry.source, expected: norm(releaseEntry.sourceSha256), actual: src.sha256,
      });
    }
    if (src.bytes !== releaseEntry.sourceBytes) {
      failures.push({
        asset: id, manifest: 'release_manifest.json', field: 'sourceBytes',
        path: releaseEntry.source, expected: releaseEntry.sourceBytes, actual: src.bytes,
      });
    }
  }

  let rel = null;
  try {
    rel = fileRecord(root, releaseEntry.release);
    records.release = rel;
  } catch (error) {
    failures.push({
      asset: id, manifest: 'release_manifest.json', field: 'releaseRead',
      path: releaseEntry.release, expected: 'readable file', actual: error.message,
    });
  }
  if (rel) {
    if (rel.sha256 !== norm(releaseEntry.releaseSha256)) {
      failures.push({
        asset: id, manifest: 'release_manifest.json', field: 'releaseSha256',
        path: releaseEntry.release, expected: norm(releaseEntry.releaseSha256), actual: rel.sha256,
      });
    }
    if (rel.bytes !== releaseEntry.releaseBytes) {
      failures.push({
        asset: id, manifest: 'release_manifest.json', field: 'releaseBytes',
        path: releaseEntry.release, expected: releaseEntry.releaseBytes, actual: rel.bytes,
      });
    }
  }

  if (partEntry && src) {
    if (partEntry.bytes !== src.bytes) {
      failures.push({
        asset: id, manifest: 'parts_manifest.json', field: 'bytes',
        path: releaseEntry.source, expected: src.bytes, actual: partEntry.bytes,
        note: 'parts_manifest bytes must equal the live source GLB byte count',
      });
    }
    let metrics = null;
    try {
      metrics = glbMetrics(root, releaseEntry.source);
    } catch (error) {
      failures.push({
        asset: id, manifest: 'parts_manifest.json', field: 'tris',
        path: releaseEntry.source, expected: partEntry.tris, actual: `parse error: ${error.message}`,
      });
    }
    if (metrics) {
      const total = metrics.triangles;
      const lod0 = metrics.lods.lod0;
      const matchesTotal = partEntry.tris === total;
      const matchesLod0 = lod0 > 0 && partEntry.tris === lod0;
      if (!matchesTotal && !matchesLod0) {
        failures.push({
          asset: id, manifest: 'parts_manifest.json', field: 'tris',
          path: releaseEntry.source,
          expected: lod0 > 0 ? `${total} (total) or ${lod0} (lod0)` : total,
          actual: partEntry.tris,
          note: 'parts_manifest tris must equal the live source GLB total-LOD or LOD0 triangle count',
        });
      }
    }
  }

  return { id, ok: failures.length === 0, failures, records };
}

// Split sweep failures into real failures and pinned known-stale rows.
//
// A pin names one asset and the EXACT failure set (manifest, field, expected, actual) it is allowed
// to show. Pins self-expire in both directions:
//   - if the asset's failures differ in any way from the pin (asset re-exported, row edited, new
//     drift), the pin is violated and the failures stay REAL;
//   - if the asset now verifies clean, the obsolete pin is itself a violation, forcing its removal.
// So a pin can never silently absorb new corruption — it only acknowledges one frozen, already
// reported drift without letting it block coverage of every other asset.
export function partitionKnownStale(results, pins) {
  const realFailures = [];
  const pinnedWarnings = [];
  const pinViolations = [];
  const sig = (f) => `${f.manifest}|${f.field}|${String(f.expected)}|${String(f.actual)}`;
  for (const result of results) {
    const pin = pins[result.id];
    if (!pin) {
      realFailures.push(...result.failures);
      continue;
    }
    const want = new Set(pin.map(sig));
    const got = result.failures.map(sig);
    const exactMatch = got.length === want.size && got.every((s) => want.has(s));
    if (exactMatch && got.length > 0) {
      pinnedWarnings.push(...result.failures);
    } else if (result.failures.length === 0) {
      pinViolations.push({
        asset: result.id,
        reason: 'pinned stale parts row now verifies clean — remove the obsolete pin',
      });
    } else {
      pinViolations.push({
        asset: result.id,
        reason: 'failures no longer match the pinned stale values — new drift, investigate before re-pinning',
      });
      realFailures.push(...result.failures);
    }
  }
  return { realFailures, pinnedWarnings, pinViolations };
}

// Static gate for spaceBackground `stats().bakedTexMB`. The stat itself is runtime-only (it
// measures live render-target residency), so the deterministic check pins its SOURCE contract:
//   - texMB must be derived from the actual l0/l1/l2 render targets' width×height — real
//     residency — never from configured bake sizes. The configured-size formula is the known
//     regression: a counter blind to the deferred 1x1 nebula stand-ins that kept reading
//     "32.2 MB" no matter how much memory was reclaimed.
//   - RGBA (×4) with the ×1.34 mip tail, null-guarded per target, rounded to 0.1 MB.
// The extracted expression is returned as an executable `evaluate(targets)` so callers can PROVE
// the arithmetic against synthetic targets instead of only pattern-matching the source.
export function bakedTexMBReport(source) {
  const failures = [];
  const assignments = [...source.matchAll(/const texMB = ([\s\S]*?);/g)];
  if (assignments.length !== 1) {
    failures.push({
      field: 'texMB', expected: 'exactly one `const texMB =` assignment',
      actual: `${assignments.length} found`,
    });
    return { ok: false, failures, evaluate: null, expression: null };
  }
  const expression = assignments[0][1];
  for (const target of ['this.l0Target', 'this.l1Target', 'this.l2Target']) {
    if (!expression.includes(target)) {
      failures.push({
        field: 'texMB', expected: `formula reads ${target} (actual tile residency)`,
        actual: 'target not referenced',
      });
    }
  }
  if (!/\bt\s*\?\s*t\.width\s*\*\s*t\.height\s*\*\s*4\s*\*\s*1\.34\s*:\s*0\b/.test(expression)) {
    failures.push({
      field: 'texMB', expected: 'null-guarded `t ? t.width * t.height * 4 * 1.34 : 0` per target',
      actual: 'guarded RGBA+mip-tail term not found',
    });
  }
  if (/bakeSize|tierSize/i.test(expression)) {
    failures.push({
      field: 'texMB', expected: 'no configured-size inputs (bakeSizes/tierSizes)',
      actual: 'formula references configured sizes — the good-news-counter regression',
    });
  }
  if (!/bakedTexMB:\s*Math\.round\(texMB \* 10\) \/ 10/.test(source)) {
    failures.push({
      field: 'bakedTexMB', expected: 'stats() reports `bakedTexMB: Math.round(texMB * 10) / 10`',
      actual: 'rounded bakedTexMB field not found',
    });
  }
  const evaluate = (targets) => {
    const fn = new Function('self', `return ${expression.replaceAll('this.', 'self.')};`);
    return fn({ l0Target: targets[0], l1Target: targets[1], l2Target: targets[2] });
  };
  return { ok: failures.length === 0, failures, evaluate, expression };
}
