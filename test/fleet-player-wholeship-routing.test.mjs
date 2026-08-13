import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseStrictEmbeddedGlb } from '../tools/art/lib/strictGlbValidation.mjs';
import {
  authoredBootstrapPreloadPlan,
  authoredPreloadPlanForEntity,
  shipArchetypeKeyForDefId,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED = {
  ship_kestrel: { file: 'wholeships/kestrel.glb', assetId: 'SF_K0_KESTREL_BORROWED_TIME_V4' },
  ship_wasp: { file: 'wholeships/wasp_production_v1.glb', assetId: 'SF_WASP_PRODUCTION_V1' },
  ship_pelican: { file: 'wholeships/pelican_production_v1.glb', assetId: 'SF_PELICAN_PRODUCTION_V1' },
  ship_mule: { file: 'wholeships/mule_production_v1.glb', assetId: 'SF_MULE_PRODUCTION_V1' },
  ship_drifter: { file: 'wholeships/drifter_production_v1.glb', assetId: 'SF_DRIFTER_PRODUCTION_V1' },
  ship_hornet: { file: 'wholeships/hornet_production_v1.glb', assetId: 'SF_HORNET_PRODUCTION_V1' },
  ship_ironback: { file: 'wholeships/ironback_production_v1.glb', assetId: 'SF_IRONBACK_PRODUCTION_V1' },
  ship_bastion: { file: 'wholeships/bastion_production_v1.glb', assetId: 'SF_BASTION_PRODUCTION_V1' },
  ship_atlas: { file: 'wholeships/atlas_production_v1.glb', assetId: 'SF_ATLAS_PRODUCTION_V1' },
  ship_ranger: { file: 'wholeships/ranger_production_v1.glb', assetId: 'SF_RANGER_PRODUCTION_V1' },
  ship_warden: { file: 'wholeships/warden_production_v1.glb', assetId: 'SF_WARDEN_PRODUCTION_V1' },
  ship_colossus: { file: 'wholeships/colossus_production_v1.glb', assetId: 'SF_COLOSSUS_PRODUCTION_V1' },
  ship_leviathan: { file: 'wholeships/leviathan_production_v1.glb', assetId: 'SF_LEVIATHAN_PRODUCTION_V1' },
};

const hitch = makeShipEntitySpec('ship_kestrel', { isPlayer: true, team: 0 });
assert.deepEqual(authoredBootstrapPreloadPlan().hull, ['wholeships/kestrel.glb'],
  'fleet remasters must not expand first-frame bootstrap residency');
assert.equal(wholeShipVisualForEntity(hitch, { requiredWholeShip: true }).file, 'wholeships/kestrel.glb',
  'Hitch must remain the live starter body');

for (const [defId, expected] of Object.entries(EXPECTED)) {
  const entity = makeShipEntitySpec(defId, { isPlayer: true, team: 0 });
  const visual = wholeShipVisualForEntity(entity, { requiredWholeShip: true });
  assert.equal(visual.file, expected.file, `${defId} live file`);
  assert.equal(visual.assetId, expected.assetId, `${defId} asset id`);
  assert.deepEqual(authoredPreloadPlanForEntity(entity, { requiredWholeShip: true }), {
    hull: [expected.file],
  }, `${defId} must decode only LOD0`);
  assert.match(shipArchetypeKeyForDefId(defId), new RegExp(expected.file.replace('.', '\\.')));

  if (defId === 'ship_kestrel') continue;
  const source = resolve(ROOT, 'assets/ships/parts', expected.file);
  assert.ok(existsSync(source), `${expected.file} missing on disk`);
  const parsed = parseStrictEmbeddedGlb(readFileSync(source), defId);
  const materials = new Set((parsed.gltf.materials || []).map((mat) => mat.name));
  assert.ok(materials.has('Material_Hull'), `${defId} must ship Material_Hull`);
  let hullTriangles = 0;
  for (const mesh of parsed.gltf.meshes || []) {
    const isHull = /hull/i.test(mesh.name || '');
    for (const primitive of mesh.primitives || []) {
      const accessor = parsed.gltf.accessors?.[primitive.indices];
      const count = accessor?.count ? Math.floor(accessor.count / 3) : 0;
      const materialName = parsed.gltf.materials?.[primitive.material]?.name || '';
      if (isHull || /hull/i.test(materialName)) hullTriangles += count;
    }
  }
  assert.ok(hullTriangles >= 800, `${defId} hull tris ${hullTriangles}`);
}

console.log('Fleet player wholeship routing: PASS');
