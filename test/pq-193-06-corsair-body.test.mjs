import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { parseStrictEmbeddedGlb } from '../tools/art/lib/strictGlbValidation.mjs';
import {
  isPackagedLiveWholeShipFile,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART_ROOT = 'assets/ships/release/parts/';
const CORSAIR_FILE = 'wholeships/ashline_rig_corsair_blade.glb';
const RIG_FILE = 'wholeships/ashline_rig.glb';
const CORSAIR_ID = 'SF_WHOLESHIP_ASHLINE_RIG_CORSAIR_BLADE';
const RIG_ID = 'SF_WHOLESHIP_ASHLINE_RIG';

function visual(data) {
  return wholeShipVisualForEntity({ type: 'ship', data }, { requiredWholeShip: true });
}

test('corsair raiders publish a distinct packaged body, not the pirate Rig', () => {
  const corsair = visual({ lootTableId: 'corsair_raider', silhouette: 'corsair_blade', defId: 'ship_hornet' });
  const pirate = visual({ lootTableId: 'reaver_pirate', silhouette: 'pirate_swoop', defId: 'ship_drifter' });
  const blade = visual({ silhouette: 'corsair_blade', defId: 'ship_hornet' });
  const swoop = visual({ silhouette: 'pirate_swoop', defId: 'ship_drifter' });
  const tether = visual({ lootTableId: 'tether_control_raider', silhouette: 'corsair_blade', defId: 'ship_hornet' });
  const jackal = visual({ lootTableId: 'mine_layer_jackal', silhouette: 'pirate_swoop', defId: 'ship_drifter' });

  assert.equal(corsair.file, CORSAIR_FILE);
  assert.equal(corsair.assetId, CORSAIR_ID);
  assert.equal(blade.file, CORSAIR_FILE);
  assert.equal(blade.assetId, CORSAIR_ID);

  assert.equal(pirate.file, RIG_FILE);
  assert.equal(pirate.assetId, RIG_ID);
  assert.equal(swoop.file, RIG_FILE);
  assert.equal(swoop.assetId, RIG_ID);
  assert.equal(tether.file, RIG_FILE, 'tether-control keeps the pirate Rig');
  assert.equal(jackal.file, RIG_FILE);
  assert.notEqual(corsair.file, pirate.file);

  assert.equal(isPackagedLiveWholeShipFile(corsair.file), true);
  const pilot = renderPackagePilotForSourceUrl(`${PART_ROOT}${CORSAIR_FILE}`);
  assert.ok(pilot, 'corsair body must have a render-package pilot');
  assert.equal(pilot.runtimeAssetId, CORSAIR_ID);

  const source = parseStrictEmbeddedGlb(
    readFileSync(resolve(ROOT, 'assets/ships/parts', CORSAIR_FILE)),
    'corsair source',
  );
  const names = new Set((source.gltf.nodes || []).map((node) => node.name).filter(Boolean));
  assert.equal(source.gltf.asset?.extras?.spacefaceAsset?.assetId, CORSAIR_ID);
  assert.ok(names.has('LOD0_VAR_CORSAIR_blade0'), 'corsair kit blades must be on the hull');
  assert.ok(names.has('SOCKET_Engine_Main'));
  assert.ok(!names.has('SF_M4_ASHLINE_RIG_ROOT'), 'corsair must not steal the pirate Rig root identity');
});
