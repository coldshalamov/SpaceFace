#!/usr/bin/env node
// Durable structural/PBR contract for a scratch hull_frigate golden-v2 candidate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { PNG } from 'pngjs';

const candidate = resolve(process.argv[2] || '.devshots/graphics/fleet-frigate-golden-v2/candidate/hull_frigate_golden_v2.glb');
const reportPath = resolve(process.argv[3] || '.devshots/graphics/fleet-frigate-golden-v2/candidate/contract-check.json');
const document = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(candidate);
const root = document.getRoot();
const nodes = root.listNodes();
const materials = root.listMaterials();
const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
const nodeNames = new Set(nodes.map((node) => node.getName()));
const requiredSemantics = [
  'HULL_FRIGATE_ROOT', 'MOUNT_COCKPIT', 'MOUNT_ENGINE_L', 'MOUNT_ENGINE_R',
  'MOUNT_FIN_L', 'MOUNT_FIN_R', 'SOCKET_Trail_Main', 'SOCKET_Weapon_Front',
];
const requiredRoles = [
  'COATED_ARMOR', 'EXPOSED_ALLOY', 'DARK_COMPOSITE', 'RECESSED_MACHINERY',
  'HEAT_AFFECTED_ALLOY', 'DOCKING_CONTACT', 'IDENTITY_MARKING',
];

for (const name of requiredSemantics) assert(nodeNames.has(name), `missing semantic node ${name}`);
assert(nodes.some((node) => node.getName() === 'LOD0_HULL_FRIGATE_MAIN'), 'missing LOD0 body');
assert(nodes.some((node) => node.getName() === 'LOD1_HULL_FRIGATE_SILHOUETTE'), 'missing LOD1 body');
assert(nodes.some((node) => node.getName() === 'LOD2_HULL_FRIGATE_SILHOUETTE'), 'missing LOD2 body');
for (const role of requiredRoles) {
  const material = materials.find((entry) => entry.getName() === `SF_FRIGATE_V2_${role}`);
  assert(material, `missing functional material ${role}`);
  assert(material.getBaseColorTexture(), `${role} missing base color`);
  assert(material.getNormalTexture(), `${role} missing normal map`);
  assert(material.getMetallicRoughnessTexture(), `${role} missing packed ORM`);
  assert(material.getOcclusionTexture(), `${role} missing AO binding`);
  const orm = material.getMetallicRoughnessTexture();
  assert.equal(orm.getMimeType(), 'image/png', `${role} raw candidate ORM must remain inspectable PNG`);
  const png = PNG.sync.read(Buffer.from(orm.getImage()));
  const roughness = channelRange(png, 1);
  assert(roughness.max - roughness.min >= 20, `${role} roughness is effectively constant: ${JSON.stringify(roughness)}`);
}
assert(primitives.length > 0, 'candidate has no mesh primitives');
assert(primitives.every((primitive) => primitive.getAttribute('TEXCOORD_0')), 'every primitive must carry UV0');
assert(primitives.every((primitive) => primitive.getAttribute('TANGENT')), 'every normal-mapped primitive must carry tangents');
assert(nodes.filter((node) => node.getMesh()).every((node) => node.getScale().every((value) => Math.abs(value - 1) < 1e-6)), 'mesh transforms must have applied scale');

// The source donor mesh datablock names used LOD0_CORVETTE labels. Multi-material export turns those
// into child nodes, where SpaceFace's local tag would override the correct inherited LOD1 tag.
const staleLodChildren = nodes.filter((node) => /^LOD0_HULL_CORVETTE/i.test(node.getName()));
assert.equal(staleLodChildren.length, 0, `stale donor LOD child names remain: ${staleLodChildren.map((node) => node.getName()).join(', ')}`);

const report = {
  schema: 'spaceface.goldenFrigateSurface.contractCheck.v1',
  ok: true,
  candidate: { path: candidate, bytes: readFileSync(candidate).length, sha256: sha256(readFileSync(candidate)) },
  materials: materials.map((material) => material.getName()),
  textures: root.listTextures().length,
  primitives: primitives.length,
  lodNodes: {
    lod0: nodes.filter((node) => /^LOD0_/.test(node.getName())).length,
    lod1: nodes.filter((node) => /^LOD1_/.test(node.getName())).length,
    lod2: nodes.filter((node) => /^LOD2_/.test(node.getName())).length,
  },
  semanticNodes: requiredSemantics,
  allUv0: true,
  allTangents: true,
  allMeshScalesApplied: true,
  allRolesCompletePbr: true,
  allRoleRoughnessMapsNonconstant: true,
  staleDonorLodNames: 0,
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function channelRange(png, channel) {
  let min = 255;
  let max = 0;
  for (let offset = channel; offset < png.data.length; offset += 4) {
    min = Math.min(min, png.data[offset]);
    max = Math.max(max, png.data[offset]);
  }
  return { min, max };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}
