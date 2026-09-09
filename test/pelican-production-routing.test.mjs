import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseStrictEmbeddedGlb } from '../tools/art/lib/strictGlbValidation.mjs';
import {
  authoredBootstrapPreloadPlan,
  authoredPreloadPlanForEntity,
  resolveRequiredWholeShipRecord,
  shipArchetypeKeyForDefId,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(ROOT, 'assets/ships/parts/wholeships/pelican_production_v1.glb');

const hitch = makeShipEntitySpec('ship_kestrel', { isPlayer: true, team: 0 });
const pelican = makeShipEntitySpec('ship_pelican', { isPlayer: true, team: 0 });
const record = {
  url: '/assets/ships/release/parts/wholeships/pelican_production_v1.glb',
  assetId: 'SF_PELICAN_PRODUCTION_V1',
};

const hitchVisual = wholeShipVisualForEntity(hitch, { requiredWholeShip: true });
assert.equal(hitchVisual.file, 'wholeships/kestrel.glb', 'Hitch live body must stay the starter wholeship');
assert.equal(hitchVisual.assetId, 'SF_K0_KESTREL_BORROWED_TIME_V4');
assert.deepEqual(authoredBootstrapPreloadPlan().hull, ['wholeships/kestrel.glb'],
  'Pelican remaster must not expand first-frame bootstrap residency');

const visual = wholeShipVisualForEntity(pelican, { requiredWholeShip: true });
assert.deepEqual(visual, {
  file: 'wholeships/pelican_production_v1.glb',
  assetId: 'SF_PELICAN_PRODUCTION_V1',
  lodFamily: {
    lod0: 'wholeships/pelican_production_v1.glb',
    lod1: 'wholeships/pelican_production_v1_lod1.glb',
    lod2: 'wholeships/pelican_production_v1_lod2.glb',
  },
  roleId: 'ship_pelican',
  required: true,
}, 'the player Pelican must resolve the remastered production body');
assert.deepEqual(authoredPreloadPlanForEntity(pelican, { requiredWholeShip: true }), {
  hull: ['wholeships/pelican_production_v1.glb'],
}, 'the live Pelican must decode only LOD0');
assert.match(shipArchetypeKeyForDefId('ship_pelican'), /pelican_production_v1\.glb/);
assert.equal(resolveRequiredWholeShipRecord(pelican, [record], {
  releaseMode: true,
  requiredWholeShip: true,
}), record, 'the production asset id and release URL must satisfy required whole-ship resolution');

const parsed = parseStrictEmbeddedGlb(readFileSync(SOURCE), 'pelican_production_v1');
const names = new Set();
const materials = new Set();
let hullTriangles = 0;
for (const node of parsed.gltf.nodes || []) {
  if (node.name) names.add(node.name);
}
for (const material of parsed.gltf.materials || []) {
  if (material.name) materials.add(material.name);
}
for (const mesh of parsed.gltf.meshes || []) {
  const isHull = /hull/i.test(mesh.name || '');
  for (const primitive of mesh.primitives || []) {
    const accessor = parsed.gltf.accessors?.[primitive.indices];
    const count = accessor?.count ? Math.floor(accessor.count / 3) : 0;
    const materialName = parsed.gltf.materials?.[primitive.material]?.name || '';
    if (isHull || /hull/i.test(materialName)) hullTriangles += count;
  }
}
assert.ok(materials.has('Material_Hull'), 'Pelican source must ship a Material_Hull body');
assert.ok(hullTriangles >= 800, `Pelican hull body must have >=800 tris, got ${hullTriangles}`);
for (const socket of [
  'SOCKET_Weapon_Front', 'SOCKET_Mining_Front', 'SOCKET_Engine_Main',
  'SOCKET_Trail_Main', 'SOCKET_Trail_Port', 'SOCKET_Trail_Starboard',
]) {
  assert.ok([...names].some((name) => name.replace(/\.\d+$/, '') === socket), `missing ${socket}`);
}

console.log('Pelican production whole-ship routing: PASS');
