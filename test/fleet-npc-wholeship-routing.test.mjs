import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseStrictEmbeddedGlb } from '../tools/art/lib/strictGlbValidation.mjs';
import { authoredBootstrapPreloadPlan, wholeShipVisualForEntity } from '../src/render/partsLibrary.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const HOSTILES = {
  wasp_swarmer: { file: 'wholeships/ashline_dart.glb', assetId: 'SF_WHOLESHIP_ASHLINE_DART' },
  choir_zealot: { file: 'wholeships/ashline_dart.glb', assetId: 'SF_WHOLESHIP_ASHLINE_DART' },
  lancer_sniper: { file: 'wholeships/wasp_production_v1.glb', assetId: 'SF_WASP_PRODUCTION_V1' },
  quiet_ghost: { file: 'wholeships/wasp_production_v1.glb', assetId: 'SF_WASP_PRODUCTION_V1' },
  bruiser_brawler: { file: 'wholeships/ashline_lode.glb', assetId: 'SF_WHOLESHIP_ASHLINE_LODE' },
  pd_screen_escort: { file: 'wholeships/ashline_lode.glb', assetId: 'SF_WHOLESHIP_ASHLINE_LODE' },
  field_anchor_controller: { file: 'wholeships/ashline_lode.glb', assetId: 'SF_WHOLESHIP_ASHLINE_LODE' },
  reaver_pirate: { file: 'wholeships/ashline_rig.glb', assetId: 'SF_WHOLESHIP_ASHLINE_RIG' },
  mine_layer_jackal: { file: 'wholeships/ashline_rig.glb', assetId: 'SF_WHOLESHIP_ASHLINE_RIG' },
  corsair_raider: { file: 'wholeships/ashline_rig.glb', assetId: 'SF_WHOLESHIP_ASHLINE_RIG' },
  tether_control_raider: { file: 'wholeships/ashline_rig.glb', assetId: 'SF_WHOLESHIP_ASHLINE_RIG' },
  mule_trader: { file: 'wholeships/helios_span.glb', assetId: 'SF_WHOLESHIP_HELIOS_SPAN' },
};

const TRAFFIC = {
  courier: { file: 'wholeships/helios_lark.glb', assetId: 'SF_WHOLESHIP_HELIOS_LARK' },
  miner: { file: 'wholeships/helios_cradle.glb', assetId: 'SF_WHOLESHIP_HELIOS_CRADLE' },
  hauler: { file: 'wholeships/helios_span.glb', assetId: 'SF_WHOLESHIP_HELIOS_SPAN' },
  ore_carrier: { file: 'wholeships/ore_barge.glb', assetId: 'SF_WHOLESHIP_ORE_BARGE' },
  tender: { file: 'wholeships/repair_tender.glb', assetId: 'SF_WHOLESHIP_REPAIR_TENDER' },
  salvor: { file: 'wholeships/salvage_cutter.glb', assetId: 'SF_WHOLESHIP_SALVAGE_CUTTER' },
  surveyor: { file: 'wholeships/survey_pin.glb', assetId: 'SF_WHOLESHIP_SURVEY_PIN' },
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
  let triangles = 0;
  for (const mesh of parsed.gltf.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const accessor = parsed.gltf.accessors?.[primitive.indices];
      triangles += accessor?.count ? Math.floor(accessor.count / 3) : 0;
    }
  }
  assert.ok(triangles > 200, `${label} is a stub (${triangles} tris)`);
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

const pilots = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/render-packages/pilots.json'), 'utf8'));
const packagedUrls = new Set((pilots.pilots || []).map((pilot) => String(pilot.sourceUrl || '').replace(/\\/g, '/')));
for (const expected of [...Object.values(HOSTILES), ...Object.values(TRAFFIC)]) {
  const releaseUrl = `assets/ships/release/parts/${expected.file}`;
  assert.ok(
    packagedUrls.has(releaseUrl),
    `${expected.file} must have a render package; unpackaged live files fail closed as empty ships`,
  );
}

console.log('Fleet NPC wholeship routing: PASS');
