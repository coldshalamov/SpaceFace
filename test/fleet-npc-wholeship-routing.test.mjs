import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseStrictEmbeddedGlb } from '../tools/art/lib/strictGlbValidation.mjs';
import { authoredBootstrapPreloadPlan, wholeShipVisualForEntity } from '../src/render/partsLibrary.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const HOSTILES = {
  wasp_swarmer: { file: 'wholeships/ashline_dart_production_v1.glb', assetId: 'SF_ASHLINE_DART_V1' },
  bruiser_brawler: { file: 'wholeships/ashline_lode_production_v1.glb', assetId: 'SF_ASHLINE_LODE_V1' },
  reaver_pirate: { file: 'wholeships/ashline_rig_production_v1.glb', assetId: 'SF_ASHLINE_RIG_V1' },
  corsair_raider: { file: 'wholeships/ashline_rig_production_v1.glb', assetId: 'SF_ASHLINE_RIG_V1' },
};

const TRAFFIC = {
  courier: { file: 'wholeships/helios_lark_production_v1.glb', assetId: 'SF_HELIOS_LARK_V1' },
  miner: { file: 'wholeships/helios_cradle_production_v1.glb', assetId: 'SF_HELIOS_CRADLE_V1' },
  hauler: { file: 'wholeships/helios_span_production_v1.glb', assetId: 'SF_HELIOS_SPAN_V1' },
  ore_carrier: { file: 'wholeships/ore_barge_production_v1.glb', assetId: 'SF_ORE_BARGE_V1' },
  tender: { file: 'wholeships/repair_tender_production_v1.glb', assetId: 'SF_REPAIR_TENDER_V1' },
  salvor: { file: 'wholeships/salvage_cutter_production_v1.glb', assetId: 'SF_SALVAGE_CUTTER_V1' },
  surveyor: { file: 'wholeships/survey_pin_production_v1.glb', assetId: 'SF_SURVEY_PIN_V1' },
};

const hitch = makeShipEntitySpec('ship_kestrel', { isPlayer: true, team: 0 });
assert.equal(wholeShipVisualForEntity(hitch, { requiredWholeShip: true }).file, 'wholeships/kestrel.glb',
  'NPC remasters must not replace the live Hitch body');
assert.deepEqual(authoredBootstrapPreloadPlan().hull, ['wholeships/kestrel.glb'],
  'NPC remasters must not expand first-frame bootstrap residency');

function assertHull(file, label) {
  const source = resolve(ROOT, 'assets/ships/parts', file);
  assert.ok(existsSync(source), `${file} missing on disk`);
  const parsed = parseStrictEmbeddedGlb(readFileSync(source), label);
  const materials = new Set((parsed.gltf.materials || []).map((mat) => mat.name));
  assert.ok(materials.has('Material_Hull'), `${label} must ship Material_Hull`);
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
  assert.ok(hullTriangles >= 800, `${label} hull tris ${hullTriangles}`);
}

for (const [roleId, expected] of Object.entries(HOSTILES)) {
  const entity = { type: 'ship', data: { lootTableId: roleId, defId: 'ship_wasp' } };
  const visual = wholeShipVisualForEntity(entity, { requiredWholeShip: true });
  assert.equal(visual.file, expected.file, `${roleId} live file`);
  assert.equal(visual.assetId, expected.assetId, `${roleId} asset id`);
  assertHull(expected.file, roleId);
}

for (const [roleId, expected] of Object.entries(TRAFFIC)) {
  const entity = { type: 'ship', data: { trafficRole: roleId, defId: 'ship_kestrel' } };
  const visual = wholeShipVisualForEntity(entity, { requiredWholeShip: true });
  assert.equal(visual.file, expected.file, `${roleId} live file`);
  assert.equal(visual.assetId, expected.assetId, `${roleId} asset id`);
  assert.notEqual(visual.file, 'wholeships/kestrel.glb', `${roleId} must not use the player Hitch body`);
  assertHull(expected.file, roleId);
}

console.log('Fleet NPC wholeship routing: PASS');
