#!/usr/bin/env node
// One-shot: foundry Corsair Blade → packaged wholeship source.
// Parents kit garnish under the hull root, names it LOD0, remaps clay KitMat
// paint/steel onto the donor PBR hull/mechanical, keeps cyan lamps factor-only,
// stamps a distinct corsair identity. Does not touch the live pirate Rig.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { PropertyType } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';

const ROOT = resolve(import.meta.dirname || '.');
const DONOR = resolve(ROOT, 'assets/ships/foundry/fleet_breadth_20260720/variants/var_ashline_rig_corsair_blade_v01.glb');
const LIVE = resolve(ROOT, 'assets/ships/parts/wholeships/ashline_rig.glb');
const OUT = resolve(ROOT, 'assets/ships/parts/wholeships/ashline_rig_corsair_blade.glb');

const ASSET_ID = 'SF_WHOLESHIP_ASHLINE_RIG_CORSAIR_BLADE';
const PART_ID = 'wholeship_ashline_rig_corsair_blade';
const ROOT_NAME = 'SF_M4_ASHLINE_RIG_CORSAIR_BLADE_ROOT';
const UV_SCALE = 0.08;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function boxUvAndTangents(document, prim) {
  const pos = prim.getAttribute('POSITION');
  const nrm = prim.getAttribute('NORMAL');
  if (!pos || !nrm) return;
  const buffer = pos.getBuffer() || document.getRoot().listBuffers()[0];
  const count = pos.getCount();
  const needUv = !prim.getAttribute('TEXCOORD_0');
  const uv = needUv ? new Float32Array(count * 2) : null;
  const tan = new Float32Array(count * 4);
  const p = [0, 0, 0];
  const n = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    pos.getElement(i, p);
    nrm.getElement(i, n);
    const ax = Math.abs(n[0]);
    const ay = Math.abs(n[1]);
    const az = Math.abs(n[2]);
    let tx = 1;
    let ty = 0;
    let tz = 0;
    if (ax >= ay && ax >= az) {
      if (uv) {
        uv[i * 2] = p[1] * UV_SCALE;
        uv[i * 2 + 1] = p[2] * UV_SCALE;
      }
      tx = 0;
      ty = 1;
      tz = 0;
    } else if (ay >= ax && ay >= az) {
      if (uv) {
        uv[i * 2] = p[0] * UV_SCALE;
        uv[i * 2 + 1] = p[2] * UV_SCALE;
      }
    } else if (uv) {
      uv[i * 2] = p[0] * UV_SCALE;
      uv[i * 2 + 1] = p[1] * UV_SCALE;
    }
    const ndot = n[0] * tx + n[1] * ty + n[2] * tz;
    tx -= n[0] * ndot;
    ty -= n[1] * ndot;
    tz -= n[2] * ndot;
    const len = Math.hypot(tx, ty, tz) || 1;
    tan[i * 4] = tx / len;
    tan[i * 4 + 1] = ty / len;
    tan[i * 4 + 2] = tz / len;
    tan[i * 4 + 3] = 1;
  }
  if (needUv) {
    prim.setAttribute('TEXCOORD_0', document.createAccessor('box_uv')
      .setType('VEC2')
      .setArray(uv)
      .setBuffer(buffer));
  }
  if (!prim.getAttribute('TANGENT')) {
    prim.setAttribute('TANGENT', document.createAccessor('box_tan')
      .setType('VEC4')
      .setArray(tan)
      .setBuffer(buffer));
  }
}

function countTris(document) {
  let tris = 0;
  let hull = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    const hullish = /hull/i.test(mesh.getName() || '');
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const n = idx ? Math.floor(idx.getCount() / 3) : 0;
      tris += n;
      if (hullish) hull += n;
    }
  }
  return { tris, hull };
}

function aabb(document) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  const p = [0, 0, 0];
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const name = String(node.getName() || '').toUpperCase();
    if (name === 'COLLISION_HULL' || name.startsWith('LOD1_') || name.startsWith('LOD2_')) continue;
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

const live = await io.read(LIVE);
const liveStamp = live.getRoot().getAsset().extras?.spacefaceAsset || {};
const liveCollision = live.getRoot().listNodes().find((n) => n.getName() === 'COLLISION_HULL');

const document = await io.read(DONOR);
const root = document.getRoot();
const scene = root.getDefaultScene() || root.listScenes()[0];
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
const shipRoot = byName.get('SF_M4_ASHLINE_RIG_ROOT');
if (!shipRoot) throw new Error('missing SF_M4_ASHLINE_RIG_ROOT');
if (liveCollision) {
  const collision = byName.get('COLLISION_HULL');
  if (collision && (!collision.getExtras() || Object.keys(collision.getExtras()).length === 0)) {
    collision.setExtras({ ...(liveCollision.getExtras() || {}) });
  }
}

const materials = new Map(root.listMaterials().map((m) => [m.getName(), m]));
const hullMat = materials.get('Material_Hull');
const mechMat = materials.get('Material_Mechanical');
if (!hullMat || !mechMat) throw new Error('donor PBR materials missing');

for (const node of [...root.listNodes()]) {
  const name = String(node.getName() || '');
  if (!name.startsWith('VAR_CORSAIR_')) continue;
  if (node.getParentNode() !== shipRoot) {
    shipRoot.addChild(node);
  }
  const lodName = name.startsWith('LOD0_') ? name : `LOD0_${name}`;
  node.setName(lodName);
  const mesh = node.getMesh();
  if (mesh) mesh.setName(lodName);
  for (const prim of mesh ? mesh.listPrimitives() : []) {
    const mat = prim.getMaterial();
    const matName = mat?.getName() || '';
    if (matName === 'KitMat_Paint') prim.setMaterial(hullMat);
    else if (matName === 'KitMat_Steel') prim.setMaterial(mechMat);
    if (matName === 'KitMat_Emissive') continue;
    boxUvAndTangents(document, prim);
  }
}

shipRoot.setName(ROOT_NAME);
await document.transform(prune({
  keepLeaves: true,
  keepAttributes: true,
  propertyTypes: [PropertyType.MATERIAL, PropertyType.TEXTURE, PropertyType.ACCESSOR],
}));

const { tris, hull } = countTris(document);
const bounds = aabb(document);
const stamp = {
  ...liveStamp,
  assetId: ASSET_ID,
  partId: PART_ID,
  role: 'corsair_raider',
  triangleCount: tris,
  hullTriangleCount: hull,
  liveRuntimeFile: 'wholeships/ashline_rig_corsair_blade.glb',
  factorOnlyMaterials: ['KitMat_Emissive'],
  packet: 'PQ-193.06',
  lod0AabbSize: bounds.size,
  wiringStatus: 'live_corsair_raider',
  sourceRole: 'whole-ship hull',
};

const extrasTop = {
  spacefaceAsset: stamp,
  assetId: ASSET_ID,
  partId: PART_ID,
  category: 'wholeships',
  priority: 'P1',
  triangleCount: tris,
  unit: 'metre',
  upAxis: '+Y',
  forwardAxis: '+X',
  starboardAxis: '+Z',
  textureSize: 1024,
  sourceRole: 'whole-ship hull',
};

const asset = root.getAsset();
asset.extras = { ...(asset.extras || {}), ...extrasTop };
scene.setExtras({ ...(scene.getExtras() || {}), spacefaceAsset: stamp });
shipRoot.setExtras({
  ...(shipRoot.getExtras() || {}),
  spacefaceAsset: stamp,
});

const bytes = await io.writeBinary(document);
writeFileSync(OUT, bytes);

const verify = await io.read(OUT);
const vRoot = verify.getRoot();
const vNames = vRoot.listNodes().map((n) => n.getName());
const kit = vNames.filter((n) => n.includes('VAR_CORSAIR_'));
const mats = vRoot.listMaterials().map((m) => m.getName());
console.log(JSON.stringify({
  out: OUT,
  bytes: bytes.length,
  nodes: vNames.length,
  tris,
  hull,
  bounds,
  root: vNames.includes(ROOT_NAME),
  kit,
  kitParent: kit.map((name) => {
    const n = vRoot.listNodes().find((node) => node.getName() === name);
    return { name, parent: n?.getParentNode()?.getName() || '(scene)' };
  }),
  materials: mats,
  assetId: vRoot.getAsset().extras?.spacefaceAsset?.assetId,
  sockets: vNames.filter((n) => n.startsWith('SOCKET_')).length,
}, null, 2));
