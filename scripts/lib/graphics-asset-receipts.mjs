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
//   - parts_manifest tris (== glbMetrics(source).triangles; matches the existing check's pattern
//     for helios/rockA/wasp/rcs, where parts.tris is the total triangle count across all LODs)
export function verifyAssetReceipt(root, releaseEntry, partEntry) {
  const id = releaseEntry.id;
  const failures = [];
  const norm = (v) => String(v).toUpperCase();

  const src = fileRecord(root, releaseEntry.source);
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

  const rel = fileRecord(root, releaseEntry.release);
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

  if (partEntry) {
    if (partEntry.bytes !== src.bytes) {
      failures.push({
        asset: id, manifest: 'parts_manifest.json', field: 'bytes',
        path: releaseEntry.source, expected: src.bytes, actual: partEntry.bytes,
        note: 'parts_manifest bytes must equal the live source GLB byte count',
      });
    }
    let diskTris = null;
    try {
      diskTris = glbMetrics(root, releaseEntry.source).triangles;
    } catch (error) {
      failures.push({
        asset: id, manifest: 'parts_manifest.json', field: 'tris',
        path: releaseEntry.source, expected: partEntry.tris, actual: `parse error: ${error.message}`,
      });
    }
    if (diskTris !== null && partEntry.tris !== diskTris) {
      failures.push({
        asset: id, manifest: 'parts_manifest.json', field: 'tris',
        path: releaseEntry.source, expected: diskTris, actual: partEntry.tris,
        note: 'parts_manifest tris must equal the total triangle count of the live source GLB',
      });
    }
  }

  return { id, ok: failures.length === 0, failures };
}
