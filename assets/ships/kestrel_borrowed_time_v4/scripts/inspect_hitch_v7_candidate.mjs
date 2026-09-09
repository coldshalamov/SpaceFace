#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Matrix4, Vector3 } from 'three';
import { MeshoptDecoder } from 'meshoptimizer';

const FAMILY = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

function boundsForNodes(nodes) {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const corner = new Vector3();
  for (const node of nodes) {
    const matrix = new Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of node.getMesh().listPrimitives()) {
      const accessor = primitive.getAttribute('POSITION');
      if (!accessor) continue;
      const localMin = accessor.getMin([]);
      const localMax = accessor.getMax([]);
      for (const x of [localMin[0], localMax[0]]) {
        for (const y of [localMin[1], localMax[1]]) {
          for (const z of [localMin[2], localMax[2]]) {
            corner.set(x, y, z).applyMatrix4(matrix);
            min.min(corner);
            max.max(corner);
          }
        }
      }
    }
  }
  return [max.x - min.x, max.y - min.y, max.z - min.z];
}

const rows = [];
for (const lod of [0, 1, 2]) {
  const path = resolve(FAMILY, `source_candidates/hitch_polish_v7/wholeships/kestrel_borrowed_time_v4_lod${lod}.glb`);
  const document = await io.read(path);
  const nodes = document.getRoot().listNodes();
  const visible = boundsForNodes(nodes.filter((node) => node.getMesh() && node.getName() !== 'COLLISION_HULL'));
  const collision = boundsForNodes(nodes.filter((node) => node.getName() === 'COLLISION_HULL'));
  const materials = document.getRoot().listMaterials().map((material) => ({
    name: material.getName(),
    base: !!material.getBaseColorTexture(),
    normal: !!material.getNormalTexture(),
    orm: !!material.getMetallicRoughnessTexture(),
    occlusion: !!material.getOcclusionTexture(),
  }));
  rows.push({
    lod,
    bytes: readFileSync(path).length,
    materials: materials.map((row) => row.name).sort(),
    mapped: materials.filter((row) => row.base || row.normal || row.orm),
    factorLike: materials.filter((row) => !row.base && !row.normal && !row.orm).map((row) => row.name),
    visible,
    collision,
    ratios: collision.map((value, index) => Number((value / visible[index]).toFixed(4))),
    hooks: nodes.map((node) => node.getName()).filter((name) => name.includes('HOOK_')),
    canopy: nodes.map((node) => node.getName()).filter((name) => /canopy/i.test(name)),
    sockets: nodes.map((node) => node.getName()).filter((name) => name.startsWith('SOCKET_')),
  });
}
process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
