// "all" means every source mesh primitive, including the authored LODs. This is
// source catalog metadata, not a runtime draw-count or performance measurement.
export function measureSourceGlbMetadata(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) {
    throw new Error('Invalid source GLB header');
  }
  const length = bytes.readUInt32LE(12);
  if (20 + length > bytes.length) throw new Error('Truncated source GLB JSON');
  const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString('utf8').trim());
  let tris = 0;
  for (const mesh of gltf.meshes || []) for (const p of mesh.primitives || []) {
    if ((p.mode ?? 4) !== 4) throw new Error('Source all-triangle metric refuses non-triangle primitive');
    const accessor = gltf.accessors?.[p.indices ?? p.attributes?.POSITION];
    if (!accessor || !Number.isSafeInteger(accessor.count) || accessor.count < 0 || accessor.count % 3) {
      throw new Error('Invalid source triangle accessor count');
    }
    tris += accessor.count / 3;
  }
  if (!tris) throw new Error('Empty source triangle geometry');
  return { bytes: bytes.length, tris, partId: gltf.asset?.extras?.spacefaceAsset?.partId };
}
export function assertSourceManifestMetadata(row, bytes) {
  const measured = measureSourceGlbMetadata(bytes);
  if (row.id !== measured.partId || row.triangleMetric !== 'all' || row.bytes !== measured.bytes || row.tris !== measured.tris) {
    throw new Error(`${row.id}: stale source manifest bytes/triangles or wrong asset identity`);
  }
  return measured;
}
