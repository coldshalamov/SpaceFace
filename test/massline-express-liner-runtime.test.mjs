import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { wholeShipVisualForEntity } from '../src/render/partsLibrary.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LINER_FILE = 'wholeships/massline_express_liner_v1.glb';
const LINER_ASSET_ID = 'SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1';
const LINER_RELEASE = `assets/ships/release/parts/${LINER_FILE}`;

test('existing Helios express traffic selects the Massline liner body', () => {
  const visual = wholeShipVisualForEntity({
    data: { trafficRole: 'express', defId: 'ship_mule' },
  }, { requiredWholeShip: true });
  assert.equal(visual.file, LINER_FILE);
  assert.equal(visual.assetId, LINER_ASSET_ID);
  assert.equal(visual.roleId, 'express');
});

test('player Mule and courier Lark keep their accepted bodies', () => {
  const mule = makeShipEntitySpec('ship_mule', { isPlayer: true, team: 0 });
  const muleVisual = wholeShipVisualForEntity(mule, { requiredWholeShip: true });
  assert.equal(muleVisual.file, 'wholeships/mule_production_v1.glb');
  assert.equal(muleVisual.assetId, 'SF_MULE_PRODUCTION_V1');

  const courier = wholeShipVisualForEntity({
    data: { trafficRole: 'courier', defId: 'ship_kestrel' },
  }, { requiredWholeShip: true });
  assert.equal(courier.file, 'wholeships/helios_lark.glb');
  assert.equal(courier.assetId, 'SF_WHOLESHIP_HELIOS_LARK');
});

test('liner release is packaged and does not use the source-route fallback', () => {
  assert.ok(existsSync(resolve(ROOT, LINER_RELEASE)), 'liner release GLB missing');
  const pilot = renderPackagePilotForSourceUrl(LINER_RELEASE);
  assert.ok(pilot, 'liner has no render-package pilot');
  assert.equal(pilot.runtimeAssetId, LINER_ASSET_ID);
});
