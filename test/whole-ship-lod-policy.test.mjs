import assert from 'node:assert/strict';
import test from 'node:test';

import { createLodState, LOD_THRESHOLDS } from '../src/render/lod.js';
import {
  installWholeShipLodFamilyController,
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

test('first-sector roles use the distance family of their selected visual body', () => {
  const cases = [
    [{ defId: 'ship_hornet', trafficRole: 'pirate' }, 'wasp_production_v1'],
    [{ defId: 'ship_drifter', trafficRole: 'smuggler' }, 'drifter_production_v1'],
    [{ defId: 'ship_mule', trafficRole: 'express' }, 'massline_express_liner_v1'],
    [{ defId: 'ship_mule' }, 'mule_production_v1'],
    [{ defId: 'ship_atlas' }, 'atlas_production_v1'],
    [{ defId: 'ship_warden' }, 'warden_production_v1'],
    [{ defId: 'ship_hornet', lootTableId: 'lancer_sniper' }, 'wasp_production_v1'],
  ];
  for (const [data, stem] of cases) {
    const ship = { type: 'ship', data };
    assert.equal(wholeShipLodFileForEntity(ship, 'lod2', { requiredWholeShip: true }),
      `wholeships/${stem}_lod2.glb`, JSON.stringify(data));
  }
});

test('a faction kit never changes livery to a base-body distance sibling', () => {
  const ship = { type: 'ship', factionId: 'faction_scn', data: { defId: 'ship_wasp', trafficRole: 'patrol' } };
  const visual = wholeShipVisualForEntity(ship, { requiredWholeShip: true });
  assert.equal(visual.file, 'wholeships/wasp_scn_patrol.glb');
  assert.equal(visual.lodFamily, undefined);
  assert.equal(wholeShipLodFileForEntity(ship, 'lod2', { requiredWholeShip: true }), visual.file);
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

test('a resident whole-ship lod swap keeps the resolver level inside the hysteresis band', () => {
  // The boundary's `userData.lod` is rebound to the incoming root's own resolver on every
  // swap (setActive → syncActiveSurface). Each root's resolver wakes at lod0, so a ship parked
  // in the hysteresis dead band (95–145 px) used to read lod0 off the swapped-in resolver and
  // swap straight back — the every-frame lod0↔lod1 flicker the stability probe reports.
  const lod0Root = { userData: { lod: createLodState() }, visible: true, parent: null };
  const lod1Root = { userData: { lod: createLodState() }, visible: false, parent: null };
  const boundary = {
    userData: {},
    children: [lod0Root],
    parent: {},
    add(child) { this.children.push(child); child.parent = this; },
    remove(child) {
      this.children = this.children.filter((entry) => entry !== child);
      if (child.parent === this) child.parent = null;
    },
  };
  lod0Root.parent = boundary;
  const setActive = (next) => {
    boundary.userData.lod = (next.userData && next.userData.lod) || null;
  };
  const npc = { type: 'ship', isPlayer: false, data: { defId: 'ship_atlas' } };
  assert.equal(installWholeShipLodFamilyController(boundary, npc, setActive, {}), true);
  boundary.userData.lod = lod0Root.userData.lod;
  boundary.userData.wholeShipLodRoots.lod1 = lod1Root;

  // px dropped below the lod0 floor earlier: the live resolver holds 'lod1' and the last
  // projected width it saw.
  assert.equal(boundary.userData.lod.resolve(80), 'lod1');
  boundary.userData.updateLod('lod1');
  assert.equal(boundary.userData.wholeShipLodActiveLevel, 'lod1');
  assert.equal(lod1Root.parent, boundary);

  // The swapped-in resolver must answer as the level now presented: inside the dead band it
  // stays lod1 instead of waking at lod0 and demanding a swap back.
  assert.equal(boundary.userData.lod, lod1Root.userData.lod);
  assert.equal(boundary.userData.lod.resolve(110), 'lod1');
  boundary.userData.updateLod('lod1');
  assert.equal(boundary.userData.wholeShipLodActiveLevel, 'lod1');

  // The return trip carries the same continuity — lod0 keeps answering lod0 at 110 px.
  boundary.userData.updateLod('lod0');
  assert.equal(boundary.userData.wholeShipLodActiveLevel, 'lod0');
  assert.equal(boundary.userData.lod, lod0Root.userData.lod);
  assert.equal(boundary.userData.lod.resolve(110), 'lod0');
});
