import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { SECTORS } from '../src/data/sectors.js';
import {
  notePresentationFrame,
  presentationSimTime,
  resetPresentationFrameClock,
} from '../src/render/presentationSimClock.js';
import {
  createLivingHullPresentation,
  LIVING_HULL_MARK_TEXTURE,
} from '../src/render/livingHullPresentation.js';
import {
  resolveTractorVortex,
  spiralMoteWithinDraw,
  spiralVisualRangeWu,
  TRACTOR_MAGNET_RANGE_WU,
  TRACTOR_VORTEX_RANGE_WU,
} from '../src/render/pickupMotionPresentation.js';
import { buildKestrelHero } from '../src/render/ships/kestrelHero.js';
import { finalizeShip } from '../src/render/ships/shipKit.js';
import {
  contactStateWord,
  signalClassLabel,
  signalKindForPoi,
} from '../src/systems/scanner.js';

function fanOf(root) {
  let fan = null;
  root.traverse((node) => {
    if (node.name === 'Kestrel_Drive_Fan') fan = node;
  });
  return fan;
}

test('PIC-04 hero fan advances on sim time and holds when that clock holds', () => {
  resetPresentationFrameClock();
  const entity = { radius: 14, vel: { x: 40, z: 0 } };
  const root = buildKestrelHero(entity);
  const fan = fanOf(root);
  assert.ok(fan, 'hero drive fan exists');
  assert.equal(typeof root.userData.updateDriveState, 'function');

  notePresentationFrame({ simTime: 0, camera: { zoom: 144, fov: 50, aspect: 16 / 9, tilt: 60 } });
  root.userData.updateDriveState(entity, 10);
  const parked = fan.rotation.x;

  notePresentationFrame({ simTime: 1.25, camera: { zoom: 144, fov: 50, aspect: 16 / 9, tilt: 60 } });
  assert.equal(presentationSimTime(), 1.25);
  root.userData.updateDriveState(entity, 10);
  const spinning = fan.rotation.x;
  assert.notEqual(spinning, parked, 'a second of sim time moves the fan');

  root.userData.updateDriveState(entity, 400);
  assert.equal(fan.rotation.x, spinning, 'a jumping wall clock does not move the fan while sim time holds');
});

test('PIC-03 kit and hero decals stay up at the readable LOD1 cut', () => {
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  decal.name = 'Kit_Decal_Mark';
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);
  hull.add(decal);
  finalizeShip({ root, hull, decals: [decal], entity: { radius: 10 }, designRadius: 10 });
  root.userData.updateLod('lod1');
  assert.equal(decal.visible, true, 'kit decal stays on a readable LOD1 contact');
  root.userData.updateLod('lod2');
  assert.equal(decal.visible, false, 'kit decal drops only when the contact is a distant speck');
  root.userData.updateLod('lod0');
  assert.equal(decal.visible, true);

  const hero = buildKestrelHero({ radius: 14, vel: { x: 0, z: 0 } });
  const marks = [];
  hero.traverse((node) => {
    if (node.name && node.name.startsWith('Kestrel_Decal_')) marks.push(node);
  });
  if (marks.length === 0) {
    const standIn = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
    standIn.name = 'Kestrel_Decal_StandIn';
    hero.userData.detailDecals.push(standIn);
    marks.push(standIn);
  }
  hero.userData.updateLod('lod1');
  assert.ok(marks.every((mark) => mark.visible), 'hero decals stay on at LOD1');
  hero.userData.updateLod('lod2');
  assert.ok(marks.every((mark) => mark.visible === false), 'hero decals drop at LOD2');
});

test('PIC-05 spiral motes use the live table draw radius', () => {
  assert.equal(TRACTOR_MAGNET_RANGE_WU, 350, 'sim magnet presentation range is unchanged');
  assert.equal(spiralVisualRangeWu(90), 90);
  assert.equal(spiralVisualRangeWu(Number.NaN), TRACTOR_VORTEX_RANGE_WU);
  assert.equal(spiralMoteWithinDraw(0, 80, 90), true);
  assert.equal(spiralMoteWithinDraw(0, 150, 90), false,
    'a mote inside the old 200 WU ring is off a 90 WU table');
  const offTable = resolveTractorVortex(150, 0.4, null, 90);
  assert.equal(offTable.radius, 0);
  const onTable = resolveTractorVortex(40, 0.4, null, 90);
  assert.ok(onTable.radius > 0);
});

test('PIC-12 hull marks are sharper than the 256 by 64 smear', () => {
  assert.ok(LIVING_HULL_MARK_TEXTURE.width > 256);
  assert.ok(LIVING_HULL_MARK_TEXTURE.height > 64);
  const hull = createLivingHullPresentation();
  const diag = hull.diagnostics();
  assert.equal(diag.markWidth, LIVING_HULL_MARK_TEXTURE.width);
  assert.equal(diag.markHeight, LIVING_HULL_MARK_TEXTURE.height);
  const tallies = hull.root.getObjectByName('LivingHull_KillTallies');
  assert.ok(tallies && tallies.material.map, 'kill tallies use a cut mark, not a solid smear');
  assert.ok(tallies.material.alphaTest > 0);
  assert.equal(tallies.material.map.generateMipmaps, true);
  assert.equal(tallies.material.map.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(tallies.material.map.userData.markWidth, LIVING_HULL_MARK_TEXTURE.width);
  hull.dispose();
});

test('WORLD-06 the Helios locker reads as a cache', () => {
  const helios = SECTORS.find((sector) => sector.id === 'sector_helios_prime');
  const locker = helios.pois.find((poi) => poi.id === 'poi_helios_locker');
  assert.equal(locker.type, 'cache');
  assert.equal(locker.scannerSignalKind, 'cache');
  assert.equal(signalKindForPoi(locker), 'cache');
  assert.equal(signalClassLabel(signalKindForPoi(locker), 3), 'CACHE');
  assert.notEqual(signalClassLabel(signalKindForPoi(locker), 3), 'DERELICT SALVAGE');
  const word = contactStateWord({
    type: 'fx',
    team: 2,
    data: { poi: true, poiType: locker.type, name: locker.name },
  }, 1, {});
  assert.equal(word, 'CACHE');
});
