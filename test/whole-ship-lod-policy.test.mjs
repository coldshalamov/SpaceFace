import assert from 'node:assert/strict';
import test from 'node:test';

import { LOD_THRESHOLDS } from '../src/render/lod.js';
import {
  isPackagedLiveWholeShipFile,
  wholeShipLodFileForEntity,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';
import {
  canInstallWholeShipLodFamily,
  hasWholeShipLodFamily,
  lodFileFromFamily,
  selectSpawnLodLevel,
} from '../src/render/wholeShipLodPolicy.js';

const FAMILY_DEF_IDS = [
  'ship_wasp', 'ship_hornet', 'ship_pelican', 'ship_mule', 'ship_drifter',
  'ship_ironback', 'ship_bastion', 'ship_atlas', 'ship_ranger', 'ship_warden',
];

test('every catalogued whole-ship family except the player is installable', () => {
  for (const defId of FAMILY_DEF_IDS) {
    const npc = { type: 'ship', isPlayer: false, data: { defId } };
    const selection = wholeShipVisualForEntity(npc, { requiredWholeShip: true });
    assert.equal(hasWholeShipLodFamily(selection), true, defId);
    assert.equal(canInstallWholeShipLodFamily(npc, selection), true, defId);
  }
});

test('live lod admission never leaves a packaged lod0 for an unpackaged sibling', () => {
  for (const defId of FAMILY_DEF_IDS) {
    const npc = { type: 'ship', isPlayer: false, data: { defId } };
    const lod0 = wholeShipLodFileForEntity(npc, 'lod0', { requiredWholeShip: true });
    const lod2 = wholeShipLodFileForEntity(npc, 'lod2', { requiredWholeShip: true });
    if (isPackagedLiveWholeShipFile(lod0) && !isPackagedLiveWholeShipFile(
      wholeShipVisualForEntity(npc, { requiredWholeShip: true }).lodFamily.lod2,
    )) {
      assert.equal(lod2, lod0, `${defId} must keep packaged LOD0 instead of an unpackaged remaster sibling`);
    }
  }
});

test('player ships never install a demotion family even when a catalog exists', () => {
  const player = { type: 'ship', isPlayer: true, data: { defId: 'ship_kestrel' } };
  const selection = wholeShipVisualForEntity(player, { requiredWholeShip: true });
  assert.equal(hasWholeShipLodFamily(selection), true);
  assert.equal(canInstallWholeShipLodFamily(player, selection), false);
});

test('distant spawn projected size selects cheaper resident files without touching LOD0 near', () => {
  assert.equal(selectSpawnLodLevel(200, LOD_THRESHOLDS), 'lod0');
  assert.equal(selectSpawnLodLevel(80, LOD_THRESHOLDS), 'lod1');
  assert.equal(selectSpawnLodLevel(20, LOD_THRESHOLDS), 'lod2');
  const family = wholeShipVisualForEntity(
    { type: 'ship', data: { defId: 'ship_wasp' } },
    { requiredWholeShip: true },
  ).lodFamily;
  assert.equal(lodFileFromFamily(family, selectSpawnLodLevel(20)), family.lod2);
  assert.equal(lodFileFromFamily(family, selectSpawnLodLevel(200)), family.lod0);
});
