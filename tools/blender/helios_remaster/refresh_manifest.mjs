// Refresh only named source rows after an accepted Blender export. No geometry or budgets change.
// node tools/blender/helios_remaster/refresh_manifest.mjs --files=wholeships/kestrel.glb,...
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { readGlbJson } from '../../../scripts/lib/renderPackageRuntimeTable.mjs';
import { collectLodTriangleCounts, nodeLod, resolveTriangleMetric } from '../../../scripts/lib/partsManifestMetrics.mjs';
import { decodedAccessorBounds } from '../../../scripts/lib/partsManifestAssetContract.mjs';

const arg = process.argv.find((value) => value.startsWith('--files='));
if (!arg) throw new Error('Explicit --files= relative source paths required');
const files = new Set(arg.slice(8).split(',').filter(Boolean));
if (!files.size) throw new Error('No source files selected');
const manifestPath = resolve('assets/ships/parts/parts_manifest.json');
const text = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(text);
const selected = manifest.parts.filter((part) => files.has(part.file));
if (selected.length !== files.size) throw new Error('Every selected source must have exactly one manifest row');

for (const part of selected) {
  if (!['all', 'lod0'].includes(part.boundsMetric || 'all')) throw new Error(`${part.id}: unsupported bounds metric`);
  const bytes = readFileSync(resolve('assets/ships/parts', part.file));
  const gltf = readGlbJson(bytes);
  const binStart = 20 + bytes.readUInt32LE(12) + 8;
  const binary = bytes.subarray(binStart);
  const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const triangles = (gltf.meshes || []).reduce((sum, mesh) => sum + mesh.primitives.reduce((n, p) =>
    n + ((p.mode ?? 4) === 4 ? Math.floor((gltf.accessors[p.indices ?? p.attributes.POSITION]?.count || 0) / 3) : 0), 0), 0);
  const triangleMetric = resolveTriangleMetric(part, { triangles, lodTriangles: collectLodTriangleCounts(gltf) });
  if (!triangleMetric.supported) throw new Error(`${part.id}: unsupported triangle metric`);
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  const visit = (index, parent, inheritedLod) => {
    const node = gltf.nodes[index];
    const local = node.matrix ? new THREE.Matrix4().fromArray(node.matrix) : new THREE.Matrix4().compose(
      new THREE.Vector3().fromArray(node.translation || [0, 0, 0]),
      new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
      new THREE.Vector3().fromArray(node.scale || [1, 1, 1]));
    const world = parent.clone().multiply(local);
    const lod = nodeLod(node) || inheritedLod;
    if (node.mesh != null && (part.boundsMetric !== 'lod0' || lod === 'lod0')) {
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        const accessor = gltf.accessors[primitive.attributes.POSITION];
        const view = gltf.bufferViews[accessor.bufferView];
        const fallback = decodedAccessorBounds(gltf, accessor);
        const stride = view?.byteStride || 12;
        const start = (view?.byteOffset || 0) + (accessor.byteOffset || 0);
        if (view && accessor.componentType === 5126 && !accessor.sparse && !view.extensions?.EXT_meshopt_compression
            && start + Math.max(0, accessor.count - 1) * stride + 12 <= binary.byteLength) {
          for (let vertex = 0; vertex < accessor.count; vertex++) {
            const offset = start + vertex * stride;
            bounds.expandByPoint(point.set(data.getFloat32(offset, true), data.getFloat32(offset + 4, true),
              data.getFloat32(offset + 8, true)).applyMatrix4(world));
          }
        } else if (fallback) {
          for (const x of [fallback.min[0], fallback.max[0]]) for (const y of [fallback.min[1], fallback.max[1]])
            for (const z of [fallback.min[2], fallback.max[2]]) bounds.expandByPoint(point.set(x, y, z).applyMatrix4(world));
        } else throw new Error(`${part.id}: missing position bounds`);
      }
    }
    for (const child of node.children || []) visit(child, world, lod);
  };
  for (const root of gltf.scenes[gltf.scene || 0].nodes) visit(root, new THREE.Matrix4(), null);
  if (bounds.isEmpty()) throw new Error(`${part.id}: empty source bounds`);
  part.bytes = bytes.length;
  part.tris = triangleMetric.measured;
  const round = (values) => values.map((value) => Number(value.toFixed(6)));
  part.bounds = { min: round(bounds.min.toArray()), max: round(bounds.max.toArray()),
    dimensionsM: round(bounds.getSize(new THREE.Vector3()).toArray()) };
}
// Do not overwrite a concurrent manifest writer while reading large geometry buffers.
if (readFileSync(manifestPath, 'utf8') !== text) throw new Error('Parts manifest changed during refresh; retry with fresh rows');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Refreshed ${selected.length} exact source metric rows`);
