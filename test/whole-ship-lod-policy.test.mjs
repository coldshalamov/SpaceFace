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
  resolveWholeShipLodTransition,
  selectSpawnLodLevel,
  shouldCommitWholeShipLodLoad,
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

test('in-flight lod2 demotion is cancelled when the ship is already back on resident lod0', () => {
  const far = resolveWholeShipLodTransition('lod0', 'lod2', { pendingLevel: null, residentReady: false });
  assert.equal(far.action, 'load');
  assert.equal(far.pendingLevel, 'lod2');

  const stillFar = resolveWholeShipLodTransition('lod0', 'lod2', {
    pendingLevel: 'lod2',
    residentReady: false,
  });
  assert.equal(stillFar.action, 'wait');
  assert.equal(stillFar.pendingLevel, 'lod2');

  const backClose = resolveWholeShipLodTransition('lod0', 'lod0', {
    pendingLevel: 'lod2',
    residentReady: true,
  });
  assert.equal(backClose.action, 'keep');
  assert.equal(backClose.pendingLevel, null, 'returning to the live level must cancel the pending swap');
  assert.equal(shouldCommitWholeShipLodLoad(backClose.pendingLevel, 'lod2', true), false);

  const swapResident = resolveWholeShipLodTransition('lod2', 'lod0', {
    pendingLevel: 'lod1',
    residentReady: true,
  });
  assert.equal(swapResident.action, 'swap');
  assert.equal(swapResident.pendingLevel, null);
  assert.equal(shouldCommitWholeShipLodLoad(null, 'lod1', true), false);
});

test('detached whole-ship lod loads never commit onto a disposed boundary', () => {
  const detached = resolveWholeShipLodTransition('lod0', 'lod2', { attached: false, pendingLevel: 'lod2' });
  assert.equal(detached.action, 'drop');
  assert.equal(detached.pendingLevel, null);
  assert.equal(shouldCommitWholeShipLodLoad('lod2', 'lod2', false), false);
  assert.equal(shouldCommitWholeShipLodLoad('lod2', 'lod2', true), true);
});
