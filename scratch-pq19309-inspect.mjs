#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const ROOT = resolve(import.meta.dirname || '.');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const files = [
  'assets/ships/foundry/fleet_breadth_20260720/variants/var_station_trade_hub_free_overlay_v01.glb',
  'assets/ships/foundry/fleet_breadth_20260720/variants/var_station_trade_hub_mts_overlay_v01.glb',
  'assets/ships/foundry/fleet_breadth_20260720/variants/var_station_trade_hub_scn_overlay_v01.glb',
];

function aabb(document) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  const p = [0, 0, 0];
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const matrix = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, p);
        const x = matrix[0] * p[0] + matrix[4] * p[1] + matrix[8] * p[2] + matrix[12];
        const y = matrix[1] * p[0] + matrix[5] * p[1] + matrix[9] * p[2] + matrix[13];
        const z = matrix[2] * p[0] + matrix[6] * p[1] + matrix[10] * p[2] + matrix[14];
        min = [Math.min(min[0], x), Math.min(min[1], y), Math.min(min[2], z)];
        max = [Math.max(max[0], x), Math.max(max[1], y), Math.max(max[2], z)];
      }
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

function tris(document) {
  let n = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      n += idx ? Math.floor(idx.getCount() / 3) : 0;
    }
  }
  return n;
}

for (const rel of files) {
  const abs = resolve(ROOT, rel);
  const document = await io.read(abs);
  const root = document.getRoot();
  const names = root.listNodes().map((n) => n.getName());
  const sceneKids = (root.getDefaultScene() || root.listScenes()[0]).listChildren().map((n) => n.getName());
  const extras = root.getAsset().extras || {};
  const varNames = names.filter((n) => /VAR_|OVERLAY_|overlay/i.test(n));
  const roots = names.filter((n) => /ROOT|LOD0/i.test(n));
  console.log(JSON.stringify({
    file: rel.split('/').pop(),
    bytes: readFileSync(abs).length,
    nodes: names.length,
    tris: tris(document),
    bounds: aabb(document),
    sceneKids,
    roots,
    varSample: varNames.slice(0, 12),
    varCount: varNames.length,
    materials: root.listMaterials().map((m) => m.getName()),
    assetId: extras.spacefaceAsset?.assetId || extras.assetId || null,
    extrasKeys: Object.keys(extras),
  }, null, 2));
}
